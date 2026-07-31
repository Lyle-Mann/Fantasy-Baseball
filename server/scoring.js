// Maps MLB live-feed plays to fantasy scoring events per Fantasy One Game.xlsx rules.
const POINTS = {
  run_scored: 1,
  single: 1,
  double: 2,
  triple: 3,
  home_run: 4,
  rbi: 1,
  stolen_base: 1,
  defensive_error: -1,
  strikeout_swinging: -1,
  strikeout_looking: -2,
  caught_stealing: -1,
  picked_off: -1,
  gidp: -2,
};

const HIT_EVENT_TYPES = new Set(['single', 'double', 'triple', 'home_run']);
const STRIKEOUT_EVENT_TYPES = new Set(['strikeout', 'strikeout_double_play', 'strikeout_triple_play']);
const SWINGING_CALL_CODES = new Set(['S', 'W', 'T']); // Swinging Strike, Swinging Strike (Blocked), Foul Tip
const LOOKING_CALL_CODES = new Set(['C']); // Called Strike

function lastPitchCallCode(play) {
  const pitches = (play.playEvents || []).filter((e) => e.isPitch && e.details?.call?.code);
  if (!pitches.length) return null;
  return pitches[pitches.length - 1].details.call.code;
}

function strikeoutIsSwinging(play) {
  const code = lastPitchCallCode(play);
  if (code && LOOKING_CALL_CODES.has(code)) return false;
  if (code && SWINGING_CALL_CODES.has(code)) return true;
  const desc = (play.result?.description || '').toLowerCase();
  if (desc.includes('looking') || desc.includes('called out on strikes')) return false;
  return true; // default: swinging is the more common outcome
}

/**
 * Scans a play's runners[] for base-running events (steals, caught stealing,
 * pickoffs, runs scored). These can occur inside a play whose own top-level
 * result.eventType is something unrelated (e.g. a runner steals 2nd during a
 * strikeout), so every play's runners[] must be checked regardless of the
 * play's own event type.
 */
function extractRunnerEvents(play, ghostRunnerIds) {
  const events = [];
  const runners = play.runners || [];
  runners.forEach((r, idx) => {
    const runnerId = r.details?.runner?.id;
    const runnerName = r.details?.runner?.fullName;
    if (!runnerId) return;
    const evType = r.details?.eventType || '';

    if (/^stolen_base/.test(evType)) {
      events.push({ playerId: runnerId, playerName: runnerName, category: 'stolen_base', idx });
    } else if (/caught_stealing/.test(evType)) {
      events.push({ playerId: runnerId, playerName: runnerName, category: 'caught_stealing', idx });
    } else if (/^pickoff/.test(evType)) {
      events.push({ playerId: runnerId, playerName: runnerName, category: 'picked_off', idx });
    }

    if (r.movement?.end === 'score') {
      if (ghostRunnerIds.has(runnerId)) {
        events.push({ playerId: runnerId, playerName: runnerName, category: 'run_scored_ghost', idx, points: 0 });
      } else {
        events.push({ playerId: runnerId, playerName: runnerName, category: 'run_scored', idx });
      }
    }
  });
  return events;
}

function extractErrorEvents(play) {
  const events = [];
  (play.runners || []).forEach((r, idx) => {
    (r.credits || []).forEach((c, cIdx) => {
      if (c.credit && c.credit.includes('error')) {
        events.push({ playerId: c.player.id, playerName: null, category: 'defensive_error', idx: `${idx}.${cIdx}` });
      }
    });
  });
  return events;
}

/**
 * Extra-innings automatic/ghost runners start a half-inning already on base.
 * Best-effort detection: on the FIRST play of a half-inning at inning >= 10,
 * any runner already on base (movement.start already set with no preceding
 * play this half-inning) is the placed runner. Their run, if/when scored,
 * is worth 0 points per the house rule. Falls back to the commissioner's
 * manual point adjustment for any edge case this misses.
 */
function trackGhostRunners(play, halfInningKey, state) {
  if (state.lastHalfInningKey !== halfInningKey) {
    state.lastHalfInningKey = halfInningKey;
    state.ghostRunnerIds = new Set();
    if (play.about.inning >= 10) {
      (play.runners || []).forEach((r) => {
        if (r.movement?.start) {
          state.ghostRunnerIds.add(r.details?.runner?.id);
        }
      });
    }
  }
  return state.ghostRunnerIds;
}

/**
 * @param {object} feed - result of mlbApi.getLiveFeed(gamePk)
 * @param {Set<number>} draftedPlayerIds - only these players' events are returned
 * @param {object} [ghostState] - carry across polls: { lastHalfInningKey, ghostRunnerIds }
 * @returns {Array<{playerId, playerName, category, points, description, dedupeKey}>}
 */
function computeScoreEvents(feed, draftedPlayerIds, ghostState = {}) {
  const gamePk = feed.gamePk || feed.gameData?.game?.pk;
  const plays = feed.liveData?.plays?.allPlays || [];
  const out = [];

  for (const play of plays) {
    if (!play.about?.isComplete) continue;
    const atBatIndex = play.about.atBatIndex;
    const halfInningKey = `${play.about.inning}-${play.about.isTopInning}`;
    const ghostRunnerIds = trackGhostRunners(play, halfInningKey, ghostState);

    const result = play.result || {};
    const eventType = result.eventType;
    const batter = play.matchup?.batter;

    // Batter-level: hits
    if (batter && HIT_EVENT_TYPES.has(eventType)) {
      out.push({
        playerId: batter.id,
        playerName: batter.fullName,
        category: eventType,
        points: POINTS[eventType],
        description: result.description,
        dedupeKey: `${gamePk}:${atBatIndex}:${eventType}:${batter.id}`,
      });
      if (result.rbi > 0) {
        out.push({
          playerId: batter.id,
          playerName: batter.fullName,
          category: 'rbi',
          points: POINTS.rbi * result.rbi,
          description: `${result.rbi} RBI - ${result.description}`,
          dedupeKey: `${gamePk}:${atBatIndex}:rbi:${batter.id}`,
        });
      }
    }

    // Batter-level: strikeouts
    if (batter && STRIKEOUT_EVENT_TYPES.has(eventType)) {
      const swinging = strikeoutIsSwinging(play);
      const category = swinging ? 'strikeout_swinging' : 'strikeout_looking';
      out.push({
        playerId: batter.id,
        playerName: batter.fullName,
        category,
        points: POINTS[category],
        description: result.description,
        dedupeKey: `${gamePk}:${atBatIndex}:${category}:${batter.id}`,
      });
    }

    // Batter-level: GIDP
    if (batter && eventType === 'grounded_into_double_play') {
      out.push({
        playerId: batter.id,
        playerName: batter.fullName,
        category: 'gidp',
        points: POINTS.gidp,
        description: result.description,
        dedupeKey: `${gamePk}:${atBatIndex}:gidp:${batter.id}`,
      });
    }

    // Runner-level: steals, caught stealing, pickoffs, runs scored
    for (const ev of extractRunnerEvents(play, ghostRunnerIds)) {
      const points = ev.points !== undefined ? ev.points : POINTS[ev.category];
      out.push({
        playerId: ev.playerId,
        playerName: ev.playerName,
        category: ev.category,
        points,
        description: result.description,
        dedupeKey: `${gamePk}:${atBatIndex}:${ev.category}:${ev.playerId}:${ev.idx}`,
      });
    }

    // Fielding: defensive errors (can occur inside any play type, not just
    // plays whose own top-level eventType is 'field_error' - e.g. a runner
    // can be individually charged with an error on a fielder's choice play)
    for (const ev of extractErrorEvents(play)) {
      out.push({
        playerId: ev.playerId,
        playerName: ev.playerName,
        category: 'defensive_error',
        points: POINTS.defensive_error,
        description: result.description,
        dedupeKey: `${gamePk}:${atBatIndex}:defensive_error:${ev.playerId}:${ev.idx}`,
      });
    }
  }

  return out.filter((e) => draftedPlayerIds.has(e.playerId));
}

module.exports = { computeScoreEvents, POINTS };
