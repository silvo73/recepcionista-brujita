import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'recepcion.db');

let db = null;

async function initSqlJs() {
  const initSqlJs = await import('sql.js');
  const SQL = await initSqlJs.default();

  let filebuffer = null;
  if (fs.existsSync(dbPath)) {
    filebuffer = fs.readFileSync(dbPath);
  }

  db = new SQL.Database(filebuffer);
  return db;
}

export async function initDb() {
  await initSqlJs();

  db.run(`
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

  saveDb();
}

export function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, buffer);
  }
}

export const queries = {
  insertLlamada: (conversation_id, telefono, inicio, duracion_seg, resumen, transcripcion, idioma, coste_creditos) => {
    try {
      db.run(`
        INSERT INTO llamadas (conversation_id, telefono, inicio, duracion_seg, resumen, transcripcion, idioma, coste_creditos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [conversation_id, telefono, inicio, duracion_seg, resumen, transcripcion, idioma, coste_creditos]);
      saveDb();
    } catch (e) {
      if (!e.message.includes('UNIQUE constraint failed')) throw e;
      db.run(`UPDATE llamadas SET resumen = ?, transcripcion = ?, duracion_seg = ? WHERE conversation_id = ?`,
        [resumen, transcripcion, duracion_seg, conversation_id]);
      saveDb();
    }
  },

  insertRecado: (conversation_id, nombre, telefono, motivo, urgencia) => {
    db.run(`INSERT INTO recados (conversation_id, nombre, telefono, motivo, urgencia) VALUES (?, ?, ?, ?, ?)`,
      [conversation_id, nombre, telefono, motivo, urgencia]);
    saveDb();
  },

  insertConsulta: (conversation_id, tipo, consulta, resultado) => {
    db.run(`INSERT INTO consultas (conversation_id, tipo, consulta, resultado) VALUES (?, ?, ?, ?)`,
      [conversation_id, tipo, consulta, resultado]);
    saveDb();
  },

  getRecadosPendientes: () => {
    const stmt = db.prepare(`SELECT * FROM recados WHERE estado = 'pendiente' ORDER BY urgencia DESC, creado_en ASC`);
    const result = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();
    return result;
  },

  getLlamadasRecientes: () => {
    const stmt = db.prepare(`SELECT id, telefono, inicio, duracion_seg, resumen FROM llamadas ORDER BY creado_en DESC LIMIT 50`);
    const result = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();
    return result;
  },

  getLlamada: (id) => {
    const stmt = db.prepare(`SELECT * FROM llamadas WHERE id = ?`);
    stmt.bind([id]);
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result;
  },

  marcarRecadoAtendido: (id) => {
    db.run(`UPDATE recados SET estado = 'atendido', atendido_en = datetime('now') WHERE id = ?`, [id]);
    saveDb();
  },

  getConsultasSinResultado: () => {
    const stmt = db.prepare(`
      SELECT tipo, consulta, COUNT(*) as frecuencia
      FROM consultas
      WHERE resultado IS NULL AND creado_en > datetime('now', '-30 days')
      GROUP BY tipo, consulta
      ORDER BY frecuencia DESC
    `);
    const result = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();
    return result;
  },

  getResumenDiario: () => {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total_llamadas,
        SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as recados_pendientes
      FROM llamadas
      WHERE DATE(creado_en) = DATE('now')
    `);
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result;
  }
};

export default db;
