const express = require('express');
const db = require('../db');
const mlbApi = require('../mlbApi');
const { requireAdmin } = require('../auth');
const state = require('../state');

function router({ io, poller }) {
  const r = express.Router();

  r.get('/schedule', async (req, res) => {
    try {
      const date = req.query.date || new Date().toISOString().slice(0, 10);
      const games = await mlbApi.getScheduleForDate(date);
      res.json({ date, games });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  r.get('/session/current', (req, res) => {
    const session = state.getCurrentSession();
    if (!session) return res.json({ session: null });
    res.json({
      session,
      humanPlayers: state.getHumanPlayers(session.id),
      rosterPicks: state.getRosterPicks(session.id),
      draftTurn: state.getDraftTurn(session),
      leaderboard: state.getLeaderboard(session.id),
      recentEvents: state.getScoreEvents(session.id).slice(0, 30),
    });
  });

  r.post('/session', requireAdmin, async (req, res) => {
    try {
      const { gamePk } = req.body;
      const date = req.body.date || new Date().toISOString().slice(0, 10);
      const draftMode = req.body.draftMode === 'single' ? 'single' : 'both';
      const fanTeamId = draftMode === 'single' ? Number(req.body.fanTeamId) : null;

      const games = await mlbApi.getScheduleForDate(date);
      const game = games.find((g) => g.gamePk === gamePk);
      if (!game) return res.status(404).json({ error: 'Game not found for that date' });

      if (draftMode === 'single' && fanTeamId !== game.away.id && fanTeamId !== game.home.id) {
        return res.status(400).json({ error: 'fanTeamId must be one of the two teams in this game' });
      }

      const stmt = db.prepare(`
        INSERT INTO sessions (mlb_game_pk, away_team_id, away_team_name, home_team_id, home_team_name, game_date, status, draft_mode, fan_team_id)
        VALUES (?, ?, ?, ?, ?, ?, 'drafting', ?, ?)
      `);
      const info = stmt.run(
        game.gamePk,
        game.away.id,
        game.away.name,
        game.home.id,
        game.home.name,
        date,
        draftMode,
        fanTeamId
      );
      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid);

      io.emit('session:update', { session });
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Commissioner exits the current match and returns everyone to game select
  r.post('/session/end', requireAdmin, (req, res) => {
    const session = state.getCurrentSession();
    if (!session) return res.status(404).json({ error: 'No active session' });
    db.prepare("UPDATE sessions SET status = 'ended' WHERE id = ?").run(session.id);
    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    io.emit('session:update', { session: updated });
    res.json({ ok: true });
  });

  r.get('/health', (req, res) => res.json({ ok: true }));

  return r;
}

module.exports = router;
