export function toolAuthMiddleware(req, res, next) {
  const secret = req.get('x-brujita-key');
  if (!secret || secret !== process.env.TOOL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

export function verifyWebhookSignature(payload, signature) {
  const crypto = await import('crypto');
  const hmac = crypto.createHmac('sha256', process.env.ELEVENLABS_WEBHOOK_SECRET);
  hmac.update(payload);
  const hash = 'sha256=' + hmac.digest('hex');
  return hash === signature;
}
