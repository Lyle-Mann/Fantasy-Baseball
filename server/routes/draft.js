const express = require('express');
const db = require('../db');
const mlbApi = require('../mlbApi');
const { requireAdmin } = require('../auth');
const state = require('../state');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentSessionOr404(res) {
  const session = state.getCurrentSession();
  if (!session) {
    res.status(404).json({ error: 'No active session. Select a game first.' });
    return null;
  }
  return session;
}

function broadcastDraftState(io, session) {
  io.emit('draft:update', {
    session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id),
    humanPlayers: state.getHumanPlayers(session.id),
    rosterPicks: state.getRosterPicks(session.id),
    draftTurn: state.getDraftTurn(db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id)),
  });
}

function router({ io }) {
  const r = express.Router();

  // Hitter pool from both teams' active rosters, with season stats
  r.get('/pool', async (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    try {
      const season = new Date(session.game_date).getFullYear();
      const teamIds =
        session.draft_mode === 'single'
          ? [session.fan_team_id]
          : [session.away_team_id, session.home_team_id];
      const teamPools = await Promise.all(teamIds.map((id) => mlbApi.getTeamHitterPool(id, season)));
      const drafted = state.getDraftedPlayerIds(session.id);
      const pool = teamPools.flat().map((p) => ({ ...p, drafted: drafted.has(p.mlbPlayerId) }));
      res.json({ pool });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  r.post('/players', requireAdmin, (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    if (session.status !== 'drafting') {
      return res.status(400).json({ error: 'Can only add players before/during drafting' });
    }
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Name required' });
    const count = state.getHumanPlayers(session.id).length;
    db.prepare('INSERT INTO human_players (session_id, name, sort_order) VALUES (?, ?, ?)').run(
      session.id,
      name,
      count
    );
    broadcastDraftState(io, session);
    res.json({ humanPlayers: state.getHumanPlayers(session.id) });
  });

  r.delete('/players/:id', requireAdmin, (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    db.prepare('DELETE FROM human_players WHERE id = ? AND session_id = ?').run(req.params.id, session.id);
    db.prepare('DELETE FROM roster_picks WHERE human_player_id = ? AND session_id = ?').run(
      req.params.id,
      session.id
    );
    broadcastDraftState(io, session);
    res.json({ humanPlayers: state.getHumanPlayers(session.id) });
  });

  r.post('/randomize', requireAdmin, (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    const humans = state.getHumanPlayers(session.id);
    if (humans.length < 2) {
      return res.status(400).json({ error: 'Add at least 2 human players first' });
    }
    const shuffled = shuffle(humans);
    const tx = db.transaction(() => {
      shuffled.forEach((h, i) => {
        db.prepare('UPDATE human_players SET sort_order = ? WHERE id = ?').run(i, h.id);
      });
      const order = state.buildSnakeOrder(shuffled.map((h) => h.id));
      db.prepare('UPDATE sessions SET draft_order_json = ?, current_pick_index = 0 WHERE id = ?').run(
        JSON.stringify(order),
        session.id
      );
    });
    tx();
    broadcastDraftState(io, session);
    res.json({ ok: true });
  });

  // Any viewer can submit a pick for whoever's turn it currently is (no login, honor system)
  r.post('/pick', (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    if (session.status !== 'drafting') return res.status(400).json({ error: 'Draft is not active' });

    const turn = state.getDraftTurn(session);
    if (!turn) return res.status(400).json({ error: 'Draft order not set - randomize first' });

    const { mlbPlayerId, mlbPlayerName, mlbTeamId } = req.body;
    if (!mlbPlayerId || !mlbPlayerName || !mlbTeamId) {
      return res.status(400).json({ error: 'mlbPlayerId, mlbPlayerName, mlbTeamId required' });
    }
    const drafted = state.getDraftedPlayerIds(session.id);
    if (drafted.has(mlbPlayerId)) return res.status(400).json({ error: 'Player already drafted' });

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO roster_picks (session_id, human_player_id, mlb_player_id, mlb_player_name, mlb_team_id, pick_number)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(session.id, turn.humanPlayerId, mlbPlayerId, mlbPlayerName, mlbTeamId, turn.pickNumber);

      const nextIndex = session.current_pick_index + 1;
      const order = JSON.parse(session.draft_order_json || '[]');
      const draftComplete = nextIndex >= order.length;
      db.prepare('UPDATE sessions SET current_pick_index = ?, status = ? WHERE id = ?').run(
        nextIndex,
        draftComplete ? 'live' : 'drafting',
        session.id
      );
    });
    tx();

    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    broadcastDraftState(io, updated);
    if (updated.status === 'live') io.emit('session:update', { session: updated });
    res.json({ ok: true, session: updated });
  });

  // Commissioner override: delete/reassign a pick, or rewind/advance the turn pointer
  r.delete('/pick/:id', requireAdmin, (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    const pick = db.prepare('SELECT * FROM roster_picks WHERE id = ? AND session_id = ?').get(
      req.params.id,
      session.id
    );
    if (!pick) return res.status(404).json({ error: 'Pick not found' });
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM roster_picks WHERE id = ?').run(pick.id);
      db.prepare('UPDATE sessions SET current_pick_index = ?, status = ? WHERE id = ?').run(
        pick.pick_number - 1,
        'drafting',
        session.id
      );
    });
    tx();
    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    broadcastDraftState(io, updated);
    res.json({ ok: true });
  });

  r.patch('/pick/:id', requireAdmin, (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    const { humanPlayerId } = req.body;
    db.prepare('UPDATE roster_picks SET human_player_id = ? WHERE id = ? AND session_id = ?').run(
      humanPlayerId,
      req.params.id,
      session.id
    );
    broadcastDraftState(io, session);
    res.json({ ok: true });
  });

  r.post('/set-turn', requireAdmin, (req, res) => {
    const session = currentSessionOr404(res);
    if (!session) return;
    const { pickIndex } = req.body;
    db.prepare('UPDATE sessions SET current_pick_index = ?, status = ? WHERE id = ?').run(
      pickIndex,
      'drafting',
      session.id
    );
    const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
    broadcastDraftState(io, updated);
    res.json({ ok: true });
  });

  return r;
}

module.exports = router;
