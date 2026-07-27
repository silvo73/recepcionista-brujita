import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const horarioPath = path.join(__dirname, '../../config/horario.json');

function parseHora(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

function diasEntre(inicio, fin) {
  const hoy = new Date();
  const siguiente = new Date(hoy);
  siguiente.setDate(hoy.getDate() + 1);

  while (siguiente.getDay() === 0 || siguiente.getDay() === 6) {
    siguiente.setDate(siguiente.getDate() + 1);
  }

  return siguiente;
}

export function horarioHandler(req, res) {
  try {
    const config = JSON.parse(fs.readFileSync(horarioPath, 'utf-8'));
    const ahora = new Date();
    const hoy = ahora.toLocaleDateString('es-ES', { weekday: 'long' }).slice(0, -1).toLowerCase();

    const diaConfig = config.diasSemana[hoy];
    const abierto_ahora = false; // TODO: calcular basado en horas

    let mensaje = '';
    let proxima_apertura = null;

    if (diaConfig && diaConfig.abierto) {
      const franjas = diaConfig.franjas;
      let hayFranjaAbierta = false;

      for (const franja of franjas) {
        const inicio = parseHora(franja.inicio);
        const fin = parseHora(franja.fin);
        const ahora_minutos = ahora.getHours() * 60 + ahora.getMinutes();

        if (ahora_minutos >= inicio && ahora_minutos < fin) {
          hayFranjaAbierta = true;
          const finHora = franja.fin.split(':')[0];
          const finMin = franja.fin.split(':')[1];
          mensaje = `Ahora mismo estamos abiertos. Cerramos a las ${finHora} y ${finMin}.`;
          break;
        }

        if (ahora_minutos < inicio) {
          hayFranjaAbierta = true;
          proxima_apertura = new Date(ahora);
          const [h, m] = franja.inicio.split(':').map(Number);
          proxima_apertura.setHours(h, m, 0);
          mensaje = `Ahora estamos cerrados. Abrimos hoy a las ${franja.inicio}.`;
          break;
        }
      }

      if (!hayFranjaAbierta) {
        const prox = diasEntre(ahora, ahora);
        prox.setHours(parseInt(diaConfig.franjas[0].inicio.split(':')[0]), parseInt(diaConfig.franjas[0].inicio.split(':')[1]), 0);
        proxima_apertura = prox;
        mensaje = `Hoy cerramos. Abrimos mañana a las ${diaConfig.franjas[0].inicio}.`;
      }
    } else {
      const prox = diasEntre(ahora, ahora);
      const franjaAbierta = config.diasSemana[obtenerDiaAbierto(prox, config)];
      prox.setHours(parseInt(franjaAbierta.franjas[0].inicio.split(':')[0]), parseInt(franjaAbierta.franjas[0].inicio.split(':')[1]), 0);
      proxima_apertura = prox;
      mensaje = `Hoy no abrimos. Próxima apertura mañana a las ${franjaAbierta.franjas[0].inicio}.`;
    }

    res.json({
      abierto_ahora,
      mensaje,
      proxima_apertura: proxima_apertura?.toISOString() || null
    });
  } catch (error) {
    console.error('Error en horario:', error);
    res.status(500).json({ error: 'Error al consultar horario' });
  }
}

function obtenerDiaAbierto(fecha, config) {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  let d = new Date(fecha);
  for (let i = 0; i < 7; i++) {
    const dia = dias[d.getDay()];
    if (config.diasSemana[dia] && config.diasSemana[dia].abierto) {
      return dia;
    }
    d.setDate(d.getDate() + 1);
  }
  return 'lunes';
}
