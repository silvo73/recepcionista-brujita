# Recepcionista Virtual — La Brujita

Backend de recepcionista automático que atiende llamadas a través de **ElevenLabs Agents** cuando no puede coger el teléfono.

## Características

- ✅ Consultar **horarios** (jornada partida, fines de semana)
- ✅ Buscar **productos** en catálogo Wix
- ✅ Dar **tasaciones orientativas** de dispositivos
- ✅ **Tomar recados** y notificar por email + WhatsApp
- ✅ **Panel de gestión** en `/panel` para ver recados y llamadas
- ✅ Registro completo de cada llamada (transcripción + resumen)

## Stack

- **Node.js 20** + Express
- **SQLite** con `better-sqlite3` (en volumen `/data` de Railway)
- **Alpine.js** en el panel (sin build, sin React)
- **Brevo** para emails
- **ElevenLabs** para la voz
- **Railway** para hosting

## Setup Local

```bash
npm install
export TOOL_SECRET=tu-secreto-aqui
export ELEVENLABS_WEBHOOK_SECRET=tu-webhook-secret
export AVISO_EMAIL_TO=hola@labrujita.es
export PANEL_USER=silvano
npm run dev
```

Luego:
- **Tools** en `http://localhost:3000/tools/*` con header `x-brujita-key`
- **Panel** en `http://localhost:3000/panel` (usuario: silvano, sin contraseña)
- **Health** en `http://localhost:3000/health`

## Despliegue en Railway

### 1. Crear proyecto

```bash
railway init --name recepcionista-brujita
```

### 2. Crear volumen para SQLite

En el dashboard de Railway:
1. Ir a tu proyecto → `Settings` → `Volumes`
2. Crear volumen montado en `/data`
   - Esto es **crítico**: sin volumen, SQLite se borra en cada redeploy

### 3. Variables de entorno

En Railway → `Variables`:

```
TOOL_SECRET=
ELEVENLABS_WEBHOOK_SECRET=
WIX_API_KEY=
WIX_SITE_ID=7f44b8c3-cd17-47b9-91d7-78d1e6290758
WIX_ACCOUNT_ID=
BREVO_API_KEY=
AVISO_EMAIL_TO=hola@labrujita.es
AVISO_WHATSAPP_ENABLED=false
PANEL_USER=silvano
PANEL_PASS=
TZ=Atlantic/Canary
DB_PATH=/data/recepcion.db
```

### 4. Desplegar

```bash
railway up
```

Railway genera un **dominio público** automáticamente (ej: `recepcionista-brujita-prod.up.railway.app`).

### 5. (Opcional) Dominio propio

Si quieres `recepcion.labrujita.es`:
1. En Cloudflare: crear CNAME `recepcion` → dominio de Railway
2. **Desactivar proxy** (DNS only)
3. En Railway: Custom Domain → `recepcion.labrujita.es`

**Importante**: Los webhooks de ElevenLabs NO pasarán por proxy naranja. DNS only.

## Endpoints — Server Tools

Todos requieren header `x-brujita-key: {TOOL_SECRET}`.

### `POST /tools/horario`

Sin parámetros.

```json
{
  "abierto_ahora": false,
  "mensaje": "Ahora mismo la tienda está cerrada. Abrimos mañana lunes a las nueve y media.",
  "proxima_apertura": "2026-07-28T09:30:00+01:00"
}
```

Lee `config/horario.json` — edítalo con tus horarios reales.

### `POST /tools/buscar-producto`

```json
{
  "consulta": "iPhone 13 128 gigas",
  "conversation_id": "conv_xxx"
}
```

Respuesta:
```json
{
  "encontrados": 2,
  "mensaje": "Sí, tenemos dos...",
  "productos": [...]
}
```

Busca en Wix Catalog API. Si no configuras `WIX_API_KEY`, devuelve fallback.

### `POST /tools/tasacion`

```json
{
  "dispositivo": "iPhone 12",
  "estado": "funciona bien, pantalla con un arañazo",
  "conversation_id": "conv_xxx"
}
```

Respuesta:
```json
{
  "rango_min": 90,
  "rango_max": 140,
  "mensaje": "Por un iPhone 12 en ese estado solemos pagar entre 90 y 140 euros...",
  "requiere_revision": true
}
```

Lee `config/tasacion.json`. Si el modelo no está, pide que rellene el formulario.

### `POST /tools/dejar-recado`

```json
{
  "nombre": "María",
  "telefono": "+34612345678",
  "motivo": "quiere vender un MacBook Air de 2019",
  "urgencia": "normal",
  "conversation_id": "conv_xxx"
}
```

Respuesta:
```json
{
  "ok": true,
  "mensaje": "Perfecto María, ya tengo tu recado. Silvano te llama en cuanto pueda."
}
```

- Inserta en BD
- Envía **email** a `AVISO_EMAIL_TO`
- Si `AVISO_WHATSAPP_ENABLED=true`, notifica WhatsApp
- **No falla** aunque el email se caiga (devuelve 200 igual)

### `POST /tools/info-tienda`

```json
{
  "tema": "direccion" | "servicios" | "parking" | "digi"
}
```

## Webhook Post-Call

ElevenLabs envía `POST /webhooks/post-call` al terminar cada llamada:

- Verifica firma HMAC con `ELEVENLABS_WEBHOOK_SECRET`
- Inserta/actualiza en tabla `llamadas`
- Guarda transcripción + resumen + duración

## Panel (`/panel`)

Acceso con **Basic Auth**: usuario `silvano`, sin contraseña (o la que configures).

Muestra:
- 📞 **Recados pendientes** (arriba)
  - Con botón "✓ Atendido"
  - Urgencia resaltada en rojo si es alta
- 📞 **Últimas 50 llamadas**
  - Teléfono, duración, resumen
  - Click para ver transcripción completa
- ❓ **Consultas sin resultado** (últimos 30 días)
  - Productos buscados pero no encontrados
  - Tasaciones de modelos desconocidos
  - Útil para saber qué stock añadir

## Configuración de ElevenLabs (Manual)

### System Prompt

```
Eres la recepcionista virtual de La Brujita, una tienda de electrónica 
de segunda mano en Vecindario, Gran Canaria desde 2007. Compramos, 
vendemos y empeñamos móviles, ordenadores, consolas y más.

TONO: Cercana, natural, breve. Tutea. Español de Canarias.

AL DESCOLGAR:
"La Brujita, buenos días. Te atiende el asistente automático, 
la llamada se graba para mejorar el servicio. ¿En qué te ayudo?"

QUÉ HACES:
- Horario, dirección, servicios → herramientas
- "¿Tenéis un X?" → busca catálogo antes
- "Quiero vender mi X" → tasación, pero siempre deja claro 
  que el precio final depende de la revisión
- Cualquier otra cosa → toma recado

LÍMITES:
- No inventes precios ni stock
- No cierres tratos ni reserves
- Si el cliente está enfadado → no discutas, toma recado urgente
- Si preguntan si eres persona → "No, soy el asistente automático"
```

### Configuración

| Ajuste | Valor |
|--------|-------|
| Idioma | Español |
| Idiomas adicionales | Inglés, italiano |
| Duración máxima | 5 min |
| Tool auth | Header `x-brujita-key` |
| Post-call webhook | `https://{dominio}/webhooks/post-call` |

### Schemas de las tools (para pegar en ElevenLabs)

Copia estos JSON en el dashboard de ElevenLabs:

#### `/tools/horario`
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

#### `/tools/buscar-producto`
```json
{
  "type": "object",
  "properties": {
    "consulta": { "type": "string", "description": "Modelo o marca buscada" },
    "conversation_id": { "type": "string" }
  },
  "required": ["consulta"]
}
```

#### `/tools/tasacion`
```json
{
  "type": "object",
  "properties": {
    "dispositivo": { "type": "string", "description": "Modelo del dispositivo" },
    "estado": { "type": "string", "description": "Condición física" },
    "conversation_id": { "type": "string" }
  },
  "required": ["dispositivo"]
}
```

#### `/tools/dejar-recado`
```json
{
  "type": "object",
  "properties": {
    "nombre": { "type": "string" },
    "telefono": { "type": "string" },
    "motivo": { "type": "string" },
    "urgencia": { "type": "string", "enum": ["normal", "alta"] },
    "conversation_id": { "type": "string" }
  },
  "required": ["nombre", "telefono", "motivo"]
}
```

#### `/tools/info-tienda`
```json
{
  "type": "object",
  "properties": {
    "tema": { "type": "string", "enum": ["direccion", "servicios", "parking", "digi"] }
  },
  "required": ["tema"]
}
```

## Monitoreo

- `/health` → 200 si BD está OK
- Logs en Railway → ver en tiempo real
- Panel `/panel` → ver recados e historial de llamadas
- Emails de recados → llegan a `AVISO_EMAIL_TO`

## Lo que NO hace (v1)

- Transferencia en caliente a humano
- Reserva real de productos
- Cobros
- Llamadas salientes

## Soporte

- Errores en logs: `railway logs -f`
- BD corrupta: eliminar volumen y redeploy (pierde historial)
- Cambiar horarios: editar `config/horario.json` y redeployer
- Añadir tasaciones: editar `config/tasacion.json`

---

**Creado por**: Claude Code  
**Última actualización**: Julio 2026
