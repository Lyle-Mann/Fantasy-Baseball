const db = require('./db');
const mlbApi = require('./mlbApi');
const { computeScoreEvents } = require('./scoring');
const state = require('./state');

const POLL_INTERVAL_MS = 15000;
const ghostStateBySession = new Map();

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO score_events
    (session_id, mlb_player_id, mlb_player_name, category, points, description, dedupe_key, source)
  VALUES (@sessionId, @mlbPlayerId, @mlbPlayerName, @category, @points, @description, @dedupeKey, 'auto')
`);

async function pollOnce(io) {
  const session = state.getCurrentSession();
  if (!session || session.status !== 'live') return;

  let feed;
  try {
    feed = await mlbApi.getLiveFeed(session.mlb_game_pk);
  } catch (err) {
    console.error('[poller] MLB feed fetch failed:', err.message);
    return;
  }

  const draftedIds = state.getDraftedPlayerIds(session.id);
  if (!ghostStateBySession.has(session.id)) ghostStateBySession.set(session.id, {});
  const ghostState = ghostStateBySession.get(session.id);

  const events = computeScoreEvents(feed, draftedIds, ghostState);

  // Names can be missing for fielder-credit events (errors); backfill from drafted roster.
  const nameByPlayerId = {};
  for (const p of state.getRosterPicks(session.id)) nameByPlayerId[p.mlb_player_id] = p.mlb_player_name;

  let inserted = 0;
  const tx = db.transaction((rows) => {
    for (const e of rows) {
      const info = insertEvent.run({
        sessionId: session.id,
        mlbPlayerId: e.playerId,
        mlbPlayerName: e.playerName || nameByPlayerId[e.playerId] || `Player ${e.playerId}`,
        category: e.category,
        points: e.points,
        description: e.description || null,
        dedupeKey: e.dedupeKey,
      });
      if (info.changes > 0) inserted += 1;
    }
  });
  tx(events);

  const abstractState = feed.gameData?.status?.abstractGameState;
  if (abstractState === 'Final' && session.status === 'live') {
    db.prepare("UPDATE sessions SET status = 'final' WHERE id = ?").run(session.id);
    io.emit('session:update', { session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id) });
  }

  if (inserted > 0 || abstractState === 'Final') {
    io.emit('score:update', {
      leaderboard: state.getLeaderboard(session.id),
      recentEvents: state.getScoreEvents(session.id).slice(0, 50),
    });
  }
}

function startPoller(io) {
  setInterval(() => {
    pollOnce(io).catch((err) => console.error('[poller] error:', err));
  }, POLL_INTERVAL_MS);
}

module.exports = { startPoller, pollOnce };
