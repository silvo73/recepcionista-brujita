# Despliegue en Railway — Paso a Paso

## Paso 1: Instalar Railway CLI

```bash
npm install -g @railway/cli
```

## Paso 2: Crear proyecto en Railway

```bash
cd /Users/silvano/Documents/recepcionista
railway init
```

- **Nombre del proyecto**: `recepcionista-brujita`
- **Environment**: `production`

## Paso 3: Crear volumen para SQLite (CRÍTICO)

Sin esto, la BD se borra en cada redeploy.

1. Abre https://railway.app y entra en tu proyecto
2. Ir a **`Settings`** → **`Volumes`**
3. Click **`+ Create Volume`**
   - **Mount Path**: `/data`
   - **Size**: 1 GB es suficiente

Espera a que se cree y redeploy automático.

## Paso 4: Configurar variables de entorno

En el dashboard de Railway, ir a **`Variables`** y añadir:

```
TOOL_SECRET=tu-secreto-aleatorio-aqui
ELEVENLABS_WEBHOOK_SECRET=tu-webhook-secret-aqui
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

**Importante**: 
- `TOOL_SECRET` debe ser algo fuerte (ej: `uuidgen`)
- `ELEVENLABS_WEBHOOK_SECRET` lo copias de ElevenLabs después
- `BREVO_API_KEY` si tienes cuenta Brevo, si no deja vacío
- `PANEL_PASS` vacío = solo usuario sin contraseña

## Paso 5: Desplegar

```bash
railway up
```

Railway:
- Instala dependencias
- Crea volumen `/data`
- Arranca `node src/server.js`
- Te muestra la URL pública

## Paso 6: Verificar que funciona

```bash
DOMAIN=tu-dominio-railway.up.railway.app
SECRET=tu-tool-secret

# Test health
curl https://$DOMAIN/health

# Test horario
curl -X POST https://$DOMAIN/tools/horario \
  -H "Content-Type: application/json" \
  -H "x-brujita-key: $SECRET" \
  -d '{}'
```

Deberías recibir 200 OK.

## Paso 7: Configurar en ElevenLabs

### 7.1 Copiar webhooks secret

En ElevenLabs → Agente → Settings:
- Copia el **Webhook Secret**
- Pégalo en Railway: `ELEVENLABS_WEBHOOK_SECRET`

### 7.2 Configurar las tools

En ElevenLabs → Agente → Tools → Server Tools, añade:

**Tool 1: Horario**
- URL: `https://{dominio}/tools/horario`
- Method: `POST`
- Authentication: Header `x-brujita-key: {TOOL_SECRET}`
- Schema:
  ```json
  {
    "type": "object",
    "properties": {},
    "required": []
  }
  ```

**Tool 2: Buscar Producto**
- URL: `https://{dominio}/tools/buscar-producto`
- Method: `POST`
- Authentication: Header `x-brujita-key: {TOOL_SECRET}`
- Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "consulta": { "type": "string", "description": "Modelo o marca a buscar" },
      "conversation_id": { "type": "string" }
    },
    "required": ["consulta"]
  }
  ```

**Tool 3: Tasación**
- URL: `https://{dominio}/tools/tasacion`
- Method: `POST`
- Authentication: Header `x-brujita-key: {TOOL_SECRET}`
- Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "dispositivo": { "type": "string", "description": "Modelo del dispositivo" },
      "estado": { "type": "string", "description": "Estado físico (ej: funciona bien, pantalla con arañazo)" },
      "conversation_id": { "type": "string" }
    },
    "required": ["dispositivo"]
  }
  ```

**Tool 4: Dejar Recado**
- URL: `https://{dominio}/tools/dejar-recado`
- Method: `POST`
- Authentication: Header `x-brujita-key: {TOOL_SECRET}`
- Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "nombre": { "type": "string", "description": "Nombre del cliente" },
      "telefono": { "type": "string", "description": "Teléfono de contacto" },
      "motivo": { "type": "string", "description": "Qué quiere o dice" },
      "urgencia": { "type": "string", "enum": ["normal", "alta"], "description": "Nivel de urgencia" },
      "conversation_id": { "type": "string" }
    },
    "required": ["nombre", "telefono", "motivo"]
  }
  ```

**Tool 5: Info Tienda**
- URL: `https://{dominio}/tools/info-tienda`
- Method: `POST`
- Authentication: Header `x-brujita-key: {TOOL_SECRET}`
- Schema:
  ```json
  {
    "type": "object",
    "properties": {
      "tema": { "type": "string", "enum": ["direccion", "servicios", "parking", "digi"] }
    },
    "required": ["tema"]
  }
  ```

### 7.3 Configurar webhook post-call

En ElevenLabs → Agente → Settings → Webhooks:
- URL: `https://{dominio}/webhooks/post-call`
- Evento: `call_end`

### 7.4 System Prompt

Pega este prompt en "Agent Instructions":

```
Eres la recepcionista virtual de La Brujita, una tienda de electrónica 
de segunda mano y reacondicionada en Vecindario, Gran Canaria. Compramos, 
vendemos y empeñamos móviles, ordenadores, consolas y más. Estamos desde 2007.

TONO: Cercana, natural, breve. Tutea. Español de Canarias: "vale", "claro", "un momentito".

SALUDO:
"La Brujita, buenos días. Te atiende el asistente automático, la llamada 
se graba para mejorar el servicio. ¿En qué te ayudo?"

QUÉ HACES:
1. Horario, dirección, servicios → llama a la herramienta correspondiente
2. "¿Tenéis un X?" → busca en catálogo ANTES de afirmar que lo tenemos
3. "Quiero vender mi X" → pide modelo y estado, da rango orientativo, 
   pero SIEMPRE deja claro que el precio final depende de revisión en tienda
4. Cualquier otra cosa → toma recado: nombre, teléfono y motivo

LÍMITES:
- No inventes precios, stock ni disponibilidad
- No cierres tratos ni reserves productos
- Si el cliente está enfadado → no discutas, toma recado urgente y asegúrale que le llamamos hoy
- Si preguntan si eres una persona → "No, soy el asistente automático"

CIERRE:
Resume en una frase lo que se acordó. Máximo 4 minutos de llamada.
```

## Paso 8: (Opcional) Dominio personalizado

Si quieres `recepcion.labrujita.es`:

1. En Cloudflare (o tu DNS):
   - Crear CNAME `recepcion` → dominio de Railway
   - **Desactivar proxy** (DNS only, no orange cloud)

2. En Railway:
   - Settings → Custom Domain
   - Añadir `recepcion.labrujita.es`

Espera ~5 min a que se propague.

## Paso 9: Ver logs

```bash
railway logs -f
```

Para ver si hay errores en tiempo real.

## Paso 10: Acceder al panel

```
https://{dominio}/panel
Usuario: silvano
Contraseña: (ninguna, solo Enter)
```

## Checklist Final

- [ ] Volumen `/data` creado en Railway
- [ ] Todas las variables de entorno configuradas
- [ ] `TOOL_SECRET` y `ELEVENLABS_WEBHOOK_SECRET` copiados a ElevenLabs
- [ ] Las 5 tools creadas en ElevenLabs con URLs correctas
- [ ] Webhook post-call configurado
- [ ] System prompt pegado en ElevenLabs
- [ ] `/health` devuelve 200 OK
- [ ] Panel accesible en `/panel`
- [ ] Recibiste un email de prueba (dejar recado fake)
- [ ] Llamada de prueba a ElevenLabs funciona

## Troubleshooting

### "Error de conexión al `/tools/*`"
- Verifica que el header `x-brujita-key` es correcto
- Verifica que la URL es la de Railway (https, no http)

### "No llegan emails de recados"
- Si `BREVO_API_KEY` está vacío, no envía (es OK para dev)
- Si está configurado, verifica que es válido en Brevo
- Revisa logs: `railway logs -f | grep "Brevo"`

### "Panel devuelve 401"
- Usuario: `silvano`
- Contraseña: deja en blanco (Enter)
- Si configuraste `PANEL_PASS`, usa esa

### "SQLite corrupto después de redeploy"
- Verificar que el volumen `/data` está creado
- Si no, eliminar el service y volver a crear con volumen
- **Perderás el historial** pero recuperas funcionalidad

### "Llamadas no se guardan"
- Verifica `ELEVENLABS_WEBHOOK_SECRET` correcto
- Verifica URL del webhook en ElevenLabs
- Revisa logs: `railway logs -f | grep "webhook"`

---

**Una vez completados estos pasos, el recepcionista está listo para aceptar llamadas.**

Silvano recibirá emails en hola@labrujita.es cuando lleguen recados, y podrá verlos en `/panel`.
