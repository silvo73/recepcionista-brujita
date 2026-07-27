import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { queries } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tasacionPath = path.join(__dirname, '../../config/tasacion.json');

function normalizarDispositivo(dispositivo) {
  return dispositivo.toLowerCase()
    .replace(/iphone/i, 'iPhone')
    .replace(/samsung|galaxy/i, 'Samsung Galaxy')
    .replace(/macbook|mac/i, 'MacBook')
    .replace(/ipad/i, 'iPad')
    .replace(/playstation|ps/i, 'PlayStation')
    .replace(/nintendo|switch/i, 'Nintendo Switch')
    .trim();
}

export function tasacionHandler(req, res) {
  const { dispositivo, estado, conversation_id } = req.body;

  if (!dispositivo) {
    return res.status(400).json({ error: 'dispositivo requerido' });
  }

  try {
    const config = JSON.parse(fs.readFileSync(tasacionPath, 'utf-8'));
    const normalizado = normalizarDispositivo(dispositivo);

    // Buscar en familias
    let familia = null;
    for (const [key, value] of Object.entries(config.familias)) {
      if (normalizado.includes(key) || key.includes(normalizado)) {
        familia = { nombre: key, ...value };
        break;
      }
    }

    // Registrar consulta
    queries.insertConsulta.run(
      conversation_id || null,
      'tasacion',
      `${dispositivo} (${estado || 'sin especificar'})`,
      familia ? JSON.stringify(familia) : null
    );

    if (!familia) {
      return res.json({
        rango_min: null,
        rango_max: null,
        mensaje: 'Ese modelo lo tengo que consultar con un compañero. ¿Me dejas tu número y te llamo con la tasación?',
        requiere_revision: true
      });
    }

    // Ajustar por estado si es necesario (aquí simplificado)
    let min = familia.min;
    let max = familia.max;

    if (estado && (estado.includes('arañazo') || estado.includes('rayón') || estado.includes('defecto'))) {
      min = Math.floor(min * 0.7);
      max = Math.floor(max * 0.85);
    }

    return res.json({
      rango_min: min,
      rango_max: max,
      mensaje: `Por un ${dispositivo} en ese estado solemos pagar entre ${min} y ${max} euros, pero es orientativo: el precio final depende de la revisión en tienda.`,
      requiere_revision: true
    });
  } catch (error) {
    console.error('Error en tasación:', error);
    res.status(500).json({ error: 'Error al calcular tasación' });
  }
}
