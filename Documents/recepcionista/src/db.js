import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'recepcion.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS llamadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT UNIQUE,
      telefono TEXT,
      inicio TEXT,
      duracion_seg INTEGER,
      resumen TEXT,
      transcripcion TEXT,
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
      tipo TEXT,
      consulta TEXT,
      resultado TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_llamadas_conversation ON llamadas(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_recados_conversation ON recados(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_recados_estado ON recados(estado);
    CREATE INDEX IF NOT EXISTS idx_consultas_conversation ON consultas(conversation_id);
  `);
}

export const queries = {
  insertLlamada: db.prepare(`
    INSERT INTO llamadas (conversation_id, telefono, inicio, duracion_seg, resumen, transcripcion, idioma, coste_creditos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      resumen = excluded.resumen,
      transcripcion = excluded.transcripcion,
      duracion_seg = excluded.duracion_seg
  `),

  insertRecado: db.prepare(`
    INSERT INTO recados (conversation_id, nombre, telefono, motivo, urgencia)
    VALUES (?, ?, ?, ?, ?)
  `),

  insertConsulta: db.prepare(`
    INSERT INTO consultas (conversation_id, tipo, consulta, resultado)
    VALUES (?, ?, ?, ?)
  `),

  getRecadosPendientes: db.prepare(`
    SELECT * FROM recados WHERE estado = 'pendiente' ORDER BY urgencia DESC, creado_en ASC
  `),

  getLlamadasRecientes: db.prepare(`
    SELECT id, telefono, inicio, duracion_seg, resumen FROM llamadas ORDER BY creado_en DESC LIMIT 50
  `),

  getLlamada: db.prepare(`
    SELECT * FROM llamadas WHERE id = ?
  `),

  marcarRecadoAtendido: db.prepare(`
    UPDATE recados SET estado = 'atendido', atendido_en = datetime('now') WHERE id = ?
  `),

  getConsultasSinResultado: db.prepare(`
    SELECT tipo, consulta, COUNT(*) as frecuencia
    FROM consultas
    WHERE resultado IS NULL AND creado_en > datetime('now', '-30 days')
    GROUP BY tipo, consulta
    ORDER BY frecuencia DESC
  `),

  getResumenDiario: db.prepare(`
    SELECT
      COUNT(*) as total_llamadas,
      SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as recados_pendientes
    FROM llamadas
    WHERE DATE(creado_en) = DATE('now')
  `)
};

export default db;
