const express = require('express');
const { login } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  try {
    const token = login(req.body.pin);
    if (!token) return res.status(401).json({ error: 'Wrong PIN' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
