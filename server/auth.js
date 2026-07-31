const crypto = require('crypto');

const validTokens = new Set();

function login(pin) {
  if (!process.env.COMMISSIONER_PIN) {
    throw new Error('Server misconfigured: COMMISSIONER_PIN not set');
  }
  if (String(pin) !== String(process.env.COMMISSIONER_PIN)) {
    return null;
  }
  const token = crypto.randomBytes(24).toString('hex');
  validTokens.add(token);
  return token;
}

function requireAdmin(req, res, next) {
  const token = req.header('x-admin-token');
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: 'Commissioner PIN required' });
  }
  next();
}

module.exports = { login, requireAdmin };
