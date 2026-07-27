# SPEC.md — `recepcionista-brujita`

Backend de herramientas (server tools) para un agente de voz de **ElevenLabs Agents** que
atiende el teléfono de **La Brujita** (Vecindario, Gran Canaria) cuando Silvano no puede.

> **Contexto para el ejecutor**: este repo NO contiene el agente de voz. El agente vive en el
> dashboard de ElevenLabs. Este repo es el backend HTTP que el agente llama en mitad de la
> conversación (buscar producto, horario, dejar recado) más el receptor del webhook post-llamada
> y un panel mínimo de gestión. Todo lo que hay que configurar a mano en ElevenLabs está en la
> sección 11 — no lo implementes, solo déjalo documentado en el README.

---

## 1. Objetivo

Cuando entra una llamada al fijo/móvil de La Brujita y no se contesta (desvío condicional), la
llamada cae en un número conectado a un agente de ElevenLabs. El agente debe poder:

1. Decir horario, dirección y servicios de la tienda.
2. Buscar en el catálogo Wix si hay un modelo concreto disponible y a qué precio.
3. Dar un rango **orientativo** de tasación para un dispositivo que el cliente quiere vender.
4. Tomar un recado estructurado y avisar a Silvano.
5. Dejar registro de la llamada completa (transcripción + resumen) para revisarla después.

Sin este backend el agente solo sabe recitar el prompt. Con él, resuelve llamadas de verdad.

---

## 2. Arquitectura

```
Cliente llama
   ↓
Fijo La Brujita  ──(desvío si no contesta/ocupado/fuera de horario)──►  Número Twilio
                                                                             ↓
                                                              ElevenLabs Agent (voz + LLM)
                                                                  │
                            ┌─────────────────────────────────────┼──────────────────────┐
                            │ server tools (HTTPS, en llamada)    │ post-call webhook     │
                            ▼                                     ▼                       │
                   ┌────────────────────────────────────────────────────┐                 │
                   │   recepcionista-brujita  (Railway, Node/Express)   │                 │
                   ├────────────────────────────────────────────────────┤                 │
                   │  SQLite en /data  │  Wix Catalog API  │  Brevo     │◄────────────────┘
                   │  Panel /panel     │  aviso WhatsApp (opcional)     │
                   └────────────────────────────────────────────────────┘
```

---

## 3. Stack

- Node.js 20 + Express
- `better-sqlite3` (fichero en el volumen de Railway)
- Alpine.js + HTML plano para el panel (sin build step, sin React)
- `node-fetch`/fetch nativo para Wix y Brevo
- `express-basic-auth` para el panel
- Sin TypeScript. Sin ORM. Código directo y legible.

---

## 4. Estructura del repo

```
recepcionista-brujita/
├── src/
│   ├── server.js            # Express, montaje de rutas, healthcheck
│   ├── db.js                # init schema + queries
│   ├── auth.js              # middleware de secreto compartido para /tools/*
│   ├── tools/
│   │   ├── horario.js
│   │   ├── buscarProducto.js
│   │   ├── tasacion.js
│   │   ├── dejarRecado.js
│   │   └── infoTienda.js
│   ├── webhooks/
│   │   └── postCall.js      # verificación HMAC + persistencia
│   ├── services/
│   │   ├── wix.js           # búsqueda en catálogo
│   │   ├── brevo.js         # email a Silvano
│   │   └── whatsapp.js      # aviso vía BrujitaBot (opcional, flag)
│   └── panel/
│       ├── index.html
│       └── panel.js
├── config/
│   ├── horario.json         # horarios de apertura, festivos, cierres
│   └── tasacion.json        # tabla de rangos orientativos por familia
├── .env.example
├── railway.json
├── package.json
└── README.md
```

---

## 5. Variables de entorno

```env
# Railway inyecta PORT automáticamente — usar process.env.PORT
DB_PATH=/data/recepcion.db

# Secreto compartido que ElevenLabs manda en cada tool call
TOOL_SECRET=

# Verificación del webhook post-call de ElevenLabs
ELEVENLABS_WEBHOOK_SECRET=

# Catálogo Wix (reutilizar credenciales de BrujitaBot)
WIX_API_KEY=
WIX_SITE_ID=7f44b8c3-cd17-47b9-91d7-78d1e6290758
WIX_ACCOUNT_ID=

# Aviso de recados
BREVO_API_KEY=
AVISO_EMAIL_TO=
AVISO_WHATSAPP_ENABLED=false
BRUJITABOT_NOTIFY_URL=
BRUJITABOT_NOTIFY_SECRET=

# Panel
PANEL_USER=
PANEL_PASS=

TZ=Atlantic/Canary
```

`TZ` es crítico: todo el cálculo de horario va en hora de Canarias, no UTC.

---

## 6. Esquema SQLite

```sql
CREATE TABLE IF NOT EXISTS llamadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT UNIQUE,
  telefono TEXT,
  inicio TEXT,
  duracion_seg INTEGER,
  resumen TEXT,
  transcripcion TEXT,      -- JSON crudo
  idioma TEXT,
  coste_creditos INTEGER,
  creado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT,
  nombre TEXT,
  telefono TEXT,
  motivo TEXT,
  urgencia TEXT CHECK(urgencia IN ('normal','alta')),
  estado TEXT DEFAULT 'pendiente' CHECK(estado IN ('pendiente','atendido')),
  creado_en TEXT DEFAULT (datetime('now')),
  atendido_en TEXT
);

CREATE TABLE IF NOT EXISTS consultas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT,
  tipo TEXT,               -- 'catalogo' | 'tasacion'
  consulta TEXT,
  resultado TEXT,
  creado_en TEXT DEFAULT (datetime('now'))
);
```

Registrar **toda** consulta de catálogo y tasación aunque no acabe en recado: es dato comercial
directo sobre qué pide la gente y qué no tenemos.

---

## 7. Endpoints — server tools

Todos: `POST`, JSON in / JSON out, cabecera `x-brujita-key: {TOOL_SECRET}` obligatoria
(401 si falta o no coincide). Timeout objetivo **< 1,5 s** — el cliente está esperando al
teléfono en silencio. Si Wix tarda más, devolver respuesta de fallback en vez de colgar.

**Regla de oro de las respuestas**: devolver texto corto y natural en `mensaje`, listo para que
el agente lo lea en voz alta. Nada de JSON crudo que el LLM tenga que interpretar y pueda
malinterpretar. Los campos estructurados van aparte por si acaso.

### 7.1 `POST /tools/horario`

Request: `{}` (sin parámetros)

Response:
```json
{
  "abierto_ahora": false,
  "mensaje": "Ahora mismo la tienda está cerrada. Abrimos mañana lunes a las nueve y media.",
  "proxima_apertura": "2026-07-28T09:30:00+01:00"
}
```

Lee `config/horario.json`. Contempla franja partida (mañana/tarde), sábados, domingos, festivos
de Canarias y cierres puntuales. Deja el JSON con una estructura que Silvano pueda editar sin
tocar código y **pídele los horarios reales antes de rellenarlo** — no los inventes.

### 7.2 `POST /tools/buscar-producto`

Request:
```json
{ "consulta": "iPhone 13 128 gigas", "conversation_id": "conv_xxx" }
```

Response:
```json
{
  "encontrados": 2,
  "mensaje": "Sí, tenemos dos: un iPhone 13 de 128 gigas en muy buen estado por 349 euros, y otro de 256 por 399.",
  "productos": [
    { "nombre": "iPhone 13 128GB", "precio": 349, "estado": "Muy buen estado", "stock": 1 }
  ]
}
```

- Normaliza la consulta antes de buscar (voz → texto trae "gigas", "gebeses", "i phone").
- Máximo **3** productos en el mensaje. Más de tres, resumir: "tenemos varios modelos, ¿te va bien que te llamemos y te los detallamos?"
- Si `encontrados === 0`: mensaje que NO cierre la puerta — "ahora mismo no me aparece, pero el stock cambia a diario; ¿quieres que te avisemos si entra uno?" y sugerir al agente ofrecer recado.
- Reutiliza la implementación de Wix Catalog V1 que ya existe en BrujitaBot si el repo está accesible; si no, impleméntala desde cero contra la API de Wix Stores.

### 7.3 `POST /tools/tasacion`

Request:
```json
{ "dispositivo": "iPhone 12", "estado": "funciona bien, pantalla con un arañazo", "conversation_id": "conv_xxx" }
```

Response:
```json
{
  "mensaje": "Por un iPhone 12 en ese estado solemos pagar entre 90 y 140 euros, pero es orientativo: el precio final depende de la revisión en tienda.",
  "rango_min": 90,
  "rango_max": 140,
  "requiere_revision": true
}
```

- Los rangos salen de `config/tasacion.json`, editable por Silvano, indexado por familia
  (iPhone, Samsung Galaxy, MacBook, PlayStation, Nintendo Switch, portátil genérico…).
- Si el dispositivo no está en la tabla → **no inventes cifra**. Devuelve
  `{"rango_min": null, "mensaje": "Ese modelo lo tengo que consultar con un compañero..."}` y
  marca `requiere_recado: true`.
- El mensaje SIEMPRE lleva la coletilla de que es orientativo. Esto no es negociable: una cifra
  cerrada por teléfono se convierte en una discusión en mostrador.

### 7.4 `POST /tools/dejar-recado`

Request:
```json
{
  "nombre": "María",
  "telefono": "+34612345678",
  "motivo": "quiere vender un MacBook Air de 2019",
  "urgencia": "normal",
  "conversation_id": "conv_xxx"
}
```

Response:
```json
{ "ok": true, "mensaje": "Perfecto María, ya tengo tu recado. Silvano te llama en cuanto pueda." }
```

- Guarda en `recados`.
- Envía email por Brevo con asunto `[Recepción] {nombre} — {motivo truncado}`.
- Si `AVISO_WHATSAPP_ENABLED=true`, POST a `BRUJITABOT_NOTIFY_URL`. Fallo de WhatsApp **no**
  debe hacer fallar el endpoint — log y seguir.
- Valida el teléfono en formato E.164; si viene raro, acéptalo igual y guárdalo tal cual
  (mejor un teléfono mal formateado que perder el lead), pero marca `telefono_dudoso: true`.

### 7.5 `POST /tools/info-tienda`

Request: `{ "tema": "direccion" | "servicios" | "parking" | "digi" }`

Devuelve texto corto y hablado. Datos: Paseo de los Artesanos 5, Vecindario. Compra, venta y
empeño de electrónica de segunda mano y reacondicionada. Distribuidor oficial Digi Móvil.
Desde 2007.

---

## 8. `POST /webhooks/post-call`

Recibe el payload de ElevenLabs al terminar cada llamada.

1. Verifica la firma HMAC con `ELEVENLABS_WEBHOOK_SECRET` (cabecera `elevenlabs-signature`).
   **Rechaza con 401 si no valida** — este endpoint es público.
2. Inserta/actualiza en `llamadas` por `conversation_id` (idempotente, pueden llegar reintentos).
3. Responde 200 rápido; cualquier procesado pesado, después.

Añade también un job diario (`node-cron`, 21:00 Canarias) que mande a Silvano por Brevo el
resumen del día: nº de llamadas, recados pendientes, top consultas de catálogo sin resultado.

---

## 9. Panel `/panel`

Basic Auth con `PANEL_USER`/`PANEL_PASS`. Una sola página, Alpine.js, sin framework:

- **Recados pendientes** arriba, con botón "Atendido" (PATCH `/api/recados/:id`).
- **Últimas 50 llamadas**: fecha, teléfono, duración, resumen. Click → despliega transcripción.
- **Consultas sin resultado** de los últimos 30 días, agrupadas y ordenadas por frecuencia.
- Móvil primero: Silvano lo va a mirar desde el teléfono.

Sin colores nuevos: naranja `#CB511C` y azul marino `#122B49` de La Brujita.

---

## 10. Despliegue en Railway

1. `railway init` → proyecto `recepcionista-brujita`.
2. **Crear un Volume montado en `/data`** antes del primer deploy. Sin esto el SQLite se pierde
   en cada redeploy (ya pasó con panel-silvo).
3. Cargar todas las variables de la sección 5 en Railway → Variables.
4. `railway.json` con `startCommand: "node src/server.js"` y healthcheck en `/health`.
5. Generar dominio público de Railway. Opcionalmente añadir dominio propio
   `recepcion.labrujita.es` (CNAME en Cloudflare hacia el dominio de Railway, proxy **desactivado**
   — los webhooks de ElevenLabs no deben pasar por el proxy naranja).
6. Las URLs finales de las tools serán `https://{dominio}/tools/{nombre}`.

`/health` debe devolver 200 con `{ ok: true, db: "ok" }` comprobando que el SQLite responde.

---

## 11. Configuración manual en ElevenLabs (NO implementar — documentar en README)

### 11.1 System prompt del agente

```
Eres la recepcionista virtual de La Brujita, una tienda de electrónica de segunda mano y
reacondicionada en Vecindario, Gran Canaria, abierta desde 2007. Compramos, vendemos y
empeñamos móviles, ordenadores, consolas y electrónica en general. También somos
distribuidor oficial de Digi Móvil.

Atiendes llamadas cuando el equipo no puede cogerlas.

TONO
Cercana, natural y breve, como quien atiende en el mostrador. Tuteas. Español de Canarias:
"vale", "claro que sí", "un momentito". Nada de lenguaje corporativo. Frases cortas: esto
se escucha, no se lee. Si el cliente habla en inglés o italiano, cambia de idioma sin
comentarlo.

LO PRIMERO
Al descolgar, di que eres el asistente automático de La Brujita y que la llamada se graba
para dar mejor servicio. Una sola frase, sin solemnidad.

QUÉ HACES
- Horario, dirección y servicios → usa la herramienta correspondiente.
- "¿Tenéis un X?" → busca en el catálogo antes de responder. Nunca afirmes que hay stock
  sin haber consultado.
- "Quiero vender mi X" → pide modelo y estado, da el rango orientativo, y deja SIEMPRE claro
  que el precio final depende de la revisión en tienda.
- Cualquier otra cosa → toma recado: nombre, teléfono y motivo. Repite el teléfono en voz
  alta para confirmarlo, dígito a dígito si hace falta.

LÍMITES
- No inventes precios, stock, plazos ni disponibilidad. Si no lo sabes, toma recado.
- No cierres tratos ni reserves productos. Solo informas y recoges datos.
- No des información sobre otros clientes ni sobre reparaciones ajenas.
- Si la persona está enfadada o insiste en hablar con alguien, no discutas: toma el recado
  marcándolo como urgencia alta y asegúrale que le llaman hoy mismo.
- Si te preguntan si eres una persona, di que no, que eres el asistente automático.

CIERRE
Antes de despedirte, resume en una frase lo acordado. Máximo 4 minutos de llamada; si se
alarga, propón que te dejen el recado y os llamáis.
```

### 11.2 Primer mensaje

> "La Brujita, buenos días. Te atiende el asistente automático, la llamada se graba para
> mejorar el servicio. ¿En qué te ayudo?"

### 11.3 Configuración

| Ajuste | Valor |
|---|---|
| Idioma principal | Español |
| Idiomas adicionales | Inglés, italiano |
| Duración máxima | 5 min |
| Autenticación de tools | cabecera `x-brujita-key` |
| Post-call webhook | `https://{dominio}/webhooks/post-call` |
| Base de conocimiento | subir un `.md` con horarios, servicios, FAQ, formas de pago |

Genera ese `.md` de base de conocimiento como parte del entregable, con placeholders donde
falten datos.

### 11.4 Esquemas de las tools

Incluye en el README el JSON schema de cada tool listo para pegar en el dashboard, generado a
partir de los endpoints de la sección 7.

---

## 12. Criterios de aceptación

- [ ] `curl` a cada `/tools/*` sin `x-brujita-key` → 401.
- [ ] `curl` a cada `/tools/*` con clave válida → 200 en < 1,5 s y `mensaje` en español natural.
- [ ] `/tools/buscar-producto` con "iphone trece" (transcripción fonética) encuentra el iPhone 13.
- [ ] `/tools/tasacion` con un modelo desconocido devuelve `rango_min: null`, no una cifra.
- [ ] `/tools/dejar-recado` inserta fila, manda email y sigue devolviendo 200 aunque Brevo falle.
- [ ] Webhook post-call con firma inválida → 401. Con firma válida y payload repetido → una sola fila.
- [ ] Reiniciar el servicio en Railway y comprobar que los recados siguen ahí (volumen OK).
- [ ] `/panel` pide credenciales y se ve correctamente en pantalla de móvil.

Incluye `scripts/test-tools.sh` con los curl de todos los casos anteriores.

---

## 13. Fuera de alcance en v1

- Transferencia de llamada a humano en caliente.
- Reserva o apartado real de productos.
- Cobros o señales.
- Integración con el panel de eBay.
- Llamadas salientes.

---

## 14. Antes de empezar, pregúntame

1. Los horarios reales de apertura (incluido si hay jornada partida y sábados).
2. Los rangos de tasación de las 8-10 familias de producto más habituales.
3. Si BrujitaBot expone ya un endpoint de notificación reutilizable o hay que crearlo.
4. El email al que deben llegar los avisos de recado.
