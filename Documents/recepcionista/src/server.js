import express from 'express';
import basicAuth from 'express-basic-auth';
import cron from 'node-cron';
import db, { initDb, queries } from './db.js';
import { toolAuthMiddleware } from './auth.js';
import { horarioHandler } from './tools/horario.js';
import { buscarProductoHandler } from './tools/buscarProducto.js';
import { tasacionHandler } from './tools/tasacion.js';
import { dejarRecadoHandler } from './tools/dejarRecado.js';
import { infoTiendaHandler } from './tools/infoTienda.js';
import { postCallHandler } from './webhooks/postCall.js';
import { enviarResumenDiario } from './services/brevo.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar BD
initDb();

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, db: 'ok' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ============ TOOLS (ElevenLabs) ============
app.post('/tools/horario', toolAuthMiddleware, horarioHandler);
app.post('/tools/buscar-producto', toolAuthMiddleware, buscarProductoHandler);
app.post('/tools/tasacion', toolAuthMiddleware, tasacionHandler);
app.post('/tools/dejar-recado', toolAuthMiddleware, dejarRecadoHandler);
app.post('/tools/info-tienda', toolAuthMiddleware, infoTiendaHandler);

// ============ WEBHOOKS ============
app.post('/webhooks/post-call', postCallHandler);

// ============ PANEL (Basic Auth) ============
const panelAuth = basicAuth({
  users: {
    [process.env.PANEL_USER || 'silvano']: process.env.PANEL_PASS || ''
  },
  challenge: true
});

app.use('/panel', panelAuth);

app.get('/panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'panel', 'index.html'));
});

// ============ API ENDPOINTS PARA EL PANEL ============
app.get('/api/recados', panelAuth, (req, res) => {
  const recados = queries.getRecadosPendientes.all();
  res.json(recados);
});

app.get('/api/llamadas', panelAuth, (req, res) => {
  const llamadas = queries.getLlamadasRecientes.all();
  res.json(llamadas);
});

app.get('/api/consultas-sin-resultado', panelAuth, (req, res) => {
  const consultas = queries.getConsultasSinResultado.all();
  res.json(consultas);
});

app.patch('/api/recados/:id/atendido', panelAuth, (req, res) => {
  const { id } = req.params;
  queries.marcarRecadoAtendido.run(id);
  res.json({ ok: true });
});

// ============ CRON JOBS ============
// Resumen diario a las 21:00 hora Canarias
cron.schedule('0 21 * * *', async () => {
  try {
    console.log('Enviando resumen diario...');
    const stats = queries.getResumenDiario.get();
    await enviarResumenDiario(stats);
  } catch (error) {
    console.error('Error en cron resumen:', error);
  }
}, { timezone: 'Atlantic/Canary' });

// ============ ERROR HANDLING ============
app.use((err, req, res, next) => {
  console.error('Error no capturado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ============ START ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🎙️ Recepcionista La Brujita en puerto ${PORT}`);
  console.log(`   /tools/* para ElevenLabs`);
  console.log(`   /panel para gestión (usuario: ${process.env.PANEL_USER || 'silvano'})`);
  console.log(`   /health para healthcheck`);
});
