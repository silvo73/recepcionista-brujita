import { buscarProductos } from '../services/wix.js';
import { queries } from '../db.js';

export async function buscarProductoHandler(req, res) {
  const { consulta, conversation_id } = req.body;

  if (!consulta) {
    return res.status(400).json({ error: 'consulta requerida' });
  }

  try {
    const resultado = await buscarProductos(consulta);

    // Registrar la consulta
    queries.insertConsulta.run(
      conversation_id || null,
      'catalogo',
      consulta,
      resultado.encontrados > 0 ? JSON.stringify(resultado.productos) : null
    );

    if (resultado.fallback) {
      return res.json({
        encontrados: 0,
        mensaje: 'Ahora mismo no me aparece en el sistema, pero el stock cambia a diario. ¿Quieres que te avisemos si entra uno?',
        productos: []
      });
    }

    if (resultado.encontrados === 0) {
      return res.json({
        encontrados: 0,
        mensaje: 'Ahora mismo no tenemos ese modelo, pero consulta con Silvano porque el stock cambia a diario.',
        productos: []
      });
    }

    if (resultado.encontrados > 3) {
      return res.json({
        encontrados: resultado.encontrados,
        mensaje: `Tenemos varios modelos. ¿Te va bien que te avisemos y te los detallamos?`,
        productos: resultado.productos.slice(0, 3)
      });
    }

    const productosTexto = resultado.productos
      .map(p => `${p.nombre} por ${p.precio}€`)
      .join(' y ');

    return res.json({
      encontrados: resultado.encontrados,
      mensaje: `Sí, tenemos ${productosTexto}.`,
      productos: resultado.productos
    });
  } catch (error) {
    console.error('Error buscando producto:', error);
    res.status(500).json({ error: 'Error en búsqueda' });
  }
}
