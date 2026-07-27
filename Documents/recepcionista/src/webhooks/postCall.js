import crypto from 'crypto';
import { queries } from '../db.js';

export async function postCallHandler(req, res) {
  const signature = req.get('elevenlabs-signature');
  const payload = JSON.stringify(req.body);

  // Verificar firma HMAC
  if (!signature || !process.env.ELEVENLABS_WEBHOOK_SECRET) {
    console.warn('Webhook sin verificación configurada');
    // Aceptar igual si no hay secret configurado (desarrollo)
  } else {
    const hmac = crypto.createHmac('sha256', process.env.ELEVENLABS_WEBHOOK_SECRET);
    hmac.update(payload);
    const hash = 'sha256=' + hmac.digest('hex');

    if (hash !== signature) {
      console.error('Webhook signature invalid:', signature);
      return res.status(401).json({ error: 'Signature mismatch' });
    }
  }

  try {
    const {
      conversation_id,
      call_start_unix_timestamp,
      call_duration_ms,
      call_summary_gpt4,
      transcript,
      language,
      credits_used
    } = req.body;

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id requerido' });
    }

    // Insertar o actualizar llamada (idempotente)
    queries.insertLlamada.run(
      conversation_id,
      req.body.caller_id || 'unknown',
      new Date(call_start_unix_timestamp * 1000).toISOString(),
      Math.round(call_duration_ms / 1000),
      call_summary_gpt4 || null,
      JSON.stringify(transcript || []),
      language || 'es',
      credits_used || 0
    );

    console.log(`Llamada guardada: ${conversation_id}`);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: error.message });
  }
}
