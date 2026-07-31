const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAdmin } = require('../auth');
const state = require('../state');

const MANUAL_CATEGORIES = {
  web_gem: { points: 1, label: 'Web Gem' },
  play_of_week: { points: 2, label: 'Play of the Week' },
  chase_pitcher: { points: 3, label: 'Chase the Pitcher Hit' },
};

function router({ io }) {
  const r = express.Router();

  r.get('/state', (req, res) => {
    const session = state.getCurrentSession();
    if (!session) return res.json({ session: null });
    res.json({
      leaderboard: state.getLeaderboard(session.id),
      recentEvents: state.getScoreEvents(session.id).slice(0, 50),
    });
  });

  // Web Gem / Play of the Week / Chase the Pitcher push-buttons
  r.post('/manual', requireAdmin, (req, res) => {
    const session = state.getCurrentSession();
    if (!session) return res.status(404).json({ error: 'No active session' });
    const { mlbPlayerId, mlbPlayerName, category } = req.body;
    const def = MANUAL_CATEGORIES[category];
    if (!def) return res.status(400).json({ error: 'Unknown category' });
    if (!mlbPlayerId || !mlbPlayerName) return res.status(400).json({ error: 'mlbPlayerId, mlbPlayerName required' });

    db.prepare(`
      INSERT INTO score_events (session_id, mlb_player_id, mlb_player_name, category, points, description, dedupe_key, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')
    `).run(
      session.id,
      mlbPlayerId,
      mlbPlayerName,
      category,
      def.points,
      def.label,
      `manual:${session.id}:${crypto.randomUUID()}`
    );

    const payload = { leaderboard: state.getLeaderboard(session.id), recentEvents: state.getScoreEvents(session.id).slice(0, 50) };
    io.emit('score:update', payload);
    res.json({ ok: true });
  });

  // Free-form correction for anything auto-scoring gets wrong
  r.post('/adjust', requireAdmin, (req, res) => {
    const session = state.getCurrentSession();
    if (!session) return res.status(404).json({ error: 'No active session' });
    const { mlbPlayerId, mlbPlayerName, points, description } = req.body;
    if (!mlbPlayerId || !mlbPlayerName || typeof points !== 'number') {
      return res.status(400).json({ error: 'mlbPlayerId, mlbPlayerName, points required' });
    }
    db.prepare(`
      INSERT INTO score_events (session_id, mlb_player_id, mlb_player_name, category, points, description, dedupe_key, source)
      VALUES (?, ?, ?, 'manual_adjust', ?, ?, ?, 'manual')
    `).run(
      session.id,
      mlbPlayerId,
      mlbPlayerName,
      points,
      description || 'Manual adjustment',
      `manual:${session.id}:${crypto.randomUUID()}`
    );

    const payload = { leaderboard: state.getLeaderboard(session.id), recentEvents: state.getScoreEvents(session.id).slice(0, 50) };
    io.emit('score:update', payload);
    res.json({ ok: true });
  });

  r.delete('/event/:id', requireAdmin, (req, res) => {
    const session = state.getCurrentSession();
    if (!session) return res.status(404).json({ error: 'No active session' });
    db.prepare('DELETE FROM score_events WHERE id = ? AND session_id = ?').run(req.params.id, session.id);
    const payload = { leaderboard: state.getLeaderboard(session.id), recentEvents: state.getScoreEvents(session.id).slice(0, 50) };
    io.emit('score:update', payload);
    res.json({ ok: true });
  });

  return r;
}

module.exports = router;
module.exports.MANUAL_CATEGORIES = MANUAL_CATEGORIES;
