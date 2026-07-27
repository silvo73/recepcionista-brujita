import { queries } from '../db.js';
import { enviarEmailRecado } from '../services/brevo.js';
import { notificarWhatsApp } from '../services/whatsapp.js';

export async function dejarRecadoHandler(req, res) {
  const { nombre, telefono, motivo, urgencia, conversation_id } = req.body;

  if (!nombre || !telefono || !motivo) {
    return res.status(400).json({ error: 'nombre, telefono y motivo requeridos' });
  }

  try {
    // Insertar recado en BD
    const urgenciaFinal = urgencia === 'alta' ? 'alta' : 'normal';
    queries.insertRecado.run(
      conversation_id || null,
      nombre,
      telefono,
      motivo,
      urgenciaFinal
    );

    // Enviar email (no esperar, pero registrar si falla)
    const emailEnviado = await enviarEmailRecado({
      nombre,
      telefono,
      motivo,
      urgencia: urgenciaFinal,
      conversation_id: conversation_id || 'sin-id'
    });

    // Notificar WhatsApp si está habilitado (no esperar)
    if (process.env.AVISO_WHATSAPP_ENABLED === 'true') {
      notificarWhatsApp({
        nombre,
        telefono,
        motivo,
        urgencia: urgenciaFinal,
        conversation_id: conversation_id || 'sin-id'
      }).catch(err => console.error('Error notificando WhatsApp:', err));
    }

    console.log(`Recado guardado: ${nombre} (${telefono}) - ${motivo}`);

    res.json({
      ok: true,
      mensaje: `Perfecto ${nombre}, ya tengo tu recado. Silvano te llama en cuanto pueda.`
    });
  } catch (error) {
    console.error('Error dejando recado:', error);
    // Devolver 200 igual para no romper la llamada
    res.status(500).json({ ok: false, error: error.message });
  }
}
