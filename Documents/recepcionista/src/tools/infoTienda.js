const infoTienda = {
  direccion: 'Paseo de los Artesanos 5, Vecindario, Gran Canaria.',
  servicios: 'Compramos, vendemos y empeñamos electrónica de segunda mano y reacondicionada. Móviles, ordenadores, consolas y más.',
  parking: 'Hay aparcamiento en la zona de Paseo de los Artesanos.',
  digi: 'Somos distribuidor oficial de Digi Móvil.'
};

export function infoTiendaHandler(req, res) {
  const { tema } = req.body;

  if (!tema || !infoTienda[tema]) {
    return res.status(400).json({ error: 'tema no válido' });
  }

  res.json({
    tema,
    mensaje: infoTienda[tema]
  });
}
