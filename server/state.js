const db = require('./db');

function getCurrentSession() {
  return db.prepare('SELECT * FROM sessions ORDER BY id DESC LIMIT 1').get() || null;
}

function getHumanPlayers(sessionId) {
  return db
    .prepare('SELECT * FROM human_players WHERE session_id = ? ORDER BY sort_order')
    .all(sessionId);
}

function getRosterPicks(sessionId) {
  return db
    .prepare('SELECT * FROM roster_picks WHERE session_id = ? ORDER BY pick_number')
    .all(sessionId);
}

function getDraftedPlayerIds(sessionId) {
  const rows = db
    .prepare('SELECT DISTINCT mlb_player_id FROM roster_picks WHERE session_id = ?')
    .all(sessionId);
  return new Set(rows.map((r) => r.mlb_player_id));
}

function getScoreEvents(sessionId) {
  return db
    .prepare('SELECT * FROM score_events WHERE session_id = ? ORDER BY id DESC')
    .all(sessionId);
}

/** Snake draft: expand human_player order into a full pick sequence of length humans.length * 2 */
function buildSnakeOrder(humanPlayerIds) {
  const n = humanPlayerIds.length;
  const round1 = [...humanPlayerIds];
  const round2 = [...humanPlayerIds].reverse();
  return [...round1, ...round2];
}

function getDraftTurn(session) {
  if (!session || session.status !== 'drafting') return null;
  const order = JSON.parse(session.draft_order_json || '[]');
  if (session.current_pick_index >= order.length) return null;
  return {
    pickNumber: session.current_pick_index + 1,
    totalPicks: order.length,
    humanPlayerId: order[session.current_pick_index],
  };
}

/** Points per human player: sum of score_events for their two drafted MLB players */
function getLeaderboard(sessionId) {
  const humans = getHumanPlayers(sessionId);
  const picks = getRosterPicks(sessionId);
  const events = getScoreEvents(sessionId);

  const pointsByMlbPlayer = {};
  for (const e of events) {
    pointsByMlbPlayer[e.mlb_player_id] = (pointsByMlbPlayer[e.mlb_player_id] || 0) + e.points;
  }

  return humans
    .map((h) => {
      const myPicks = picks.filter((p) => p.human_player_id === h.id);
      const players = myPicks.map((p) => ({
        mlbPlayerId: p.mlb_player_id,
        name: p.mlb_player_name,
        teamId: p.mlb_team_id,
        points: pointsByMlbPlayer[p.mlb_player_id] || 0,
      }));
      const total = players.reduce((sum, p) => sum + p.points, 0);
      return { humanPlayerId: h.id, name: h.name, players, total };
    })
    .sort((a, b) => b.total - a.total);
}

module.exports = {
  getCurrentSession,
  getHumanPlayers,
  getRosterPicks,
  getDraftedPlayerIds,
  getScoreEvents,
  buildSnakeOrder,
  getDraftTurn,
  getLeaderboard,
};
