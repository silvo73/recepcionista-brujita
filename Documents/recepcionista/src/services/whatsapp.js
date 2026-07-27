export async function notificarWhatsApp(recado) {
  if (!process.env.AVISO_WHATSAPP_ENABLED || process.env.AVISO_WHATSAPP_ENABLED !== 'true') {
    return true;
  }

  if (!process.env.BRUJITABOT_NOTIFY_URL) {
    console.log('BRUJITABOT_NOTIFY_URL no configurado');
    return true;
  }

  const mensaje = `Recado de ${recado.nombre} (${recado.telefono}): ${recado.motivo}`;

  try {
    const response = await fetch(process.env.BRUJITABOT_NOTIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Secret': process.env.BRUJITABOT_NOTIFY_SECRET || ''
      },
      body: JSON.stringify({
        tipo: 'recado',
        mensaje,
        urgencia: recado.urgencia,
        nombre: recado.nombre,
        telefono: recado.telefono
      })
    });

    if (!response.ok) {
      console.error('Error notificando WhatsApp:', response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error en WhatsApp:', error);
    return false;
  }
}
