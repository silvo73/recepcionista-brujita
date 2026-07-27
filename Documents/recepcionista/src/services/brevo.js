export async function enviarEmailRecado(recado) {
  if (!process.env.BREVO_API_KEY) {
    console.log('BREVO_API_KEY no configurado, email no enviado');
    return true;
  }

  const asunto = `[Recepción] ${recado.nombre} — ${recado.motivo.substring(0, 40)}`;
  const htmlContent = `
    <h2>Recado de ${recado.nombre}</h2>
    <p><strong>Teléfono:</strong> ${recado.telefono}</p>
    <p><strong>Motivo:</strong> ${recado.motivo}</p>
    <p><strong>Urgencia:</strong> ${recado.urgencia}</p>
    <hr>
    <p>Call ID: ${recado.conversation_id}</p>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: 'recepcion@labrujita.es', name: 'La Brujita' },
        to: [{ email: process.env.AVISO_EMAIL_TO }],
        subject: asunto,
        htmlContent
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error enviando email:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error en Brevo:', error);
    return false;
  }
}

export async function enviarResumenDiario(stats) {
  if (!process.env.BREVO_API_KEY) return true;

  const htmlContent = `
    <h2>Resumen del día</h2>
    <p><strong>Llamadas:</strong> ${stats.total_llamadas}</p>
    <p><strong>Recados pendientes:</strong> ${stats.recados_pendientes}</p>
  `;

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: 'recepcion@labrujita.es', name: 'La Brujita' },
        to: [{ email: process.env.AVISO_EMAIL_TO }],
        subject: '[La Brujita] Resumen diario',
        htmlContent
      })
    });
  } catch (error) {
    console.error('Error enviando resumen:', error);
  }
}
