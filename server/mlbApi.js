const BASE = 'https://statsapi.mlb.com';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB API ${res.status} for ${url}`);
  return res.json();
}

async function getScheduleForDate(dateStr) {
  const data = await getJson(`${BASE}/api/v1/schedule?sportId=1&date=${dateStr}`);
  const games = data.dates?.[0]?.games || [];
  return games.map((g) => ({
    gamePk: g.gamePk,
    status: g.status.detailedState,
    abstractGameState: g.status.abstractGameState,
    gameDate: g.gameDate,
    venue: g.venue?.name,
    away: { id: g.teams.away.team.id, name: g.teams.away.team.name, score: g.teams.away.score },
    home: { id: g.teams.home.team.id, name: g.teams.home.team.name, score: g.teams.home.score },
  }));
}

async function getActiveHitters(teamId) {
  const data = await getJson(`${BASE}/api/v1/teams/${teamId}/roster?rosterType=active`);
  return (data.roster || []).filter((p) => p.position?.abbreviation !== 'P');
}

async function getSeasonHittingStats(playerId, season) {
  try {
    const data = await getJson(
      `${BASE}/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${season}`
    );
    const split = data.stats?.[0]?.splits?.[0];
    if (!split) return null;
    const s = split.stat;
    const hits = s.hits || 0;
    const doubles = s.doubles || 0;
    const triples = s.triples || 0;
    const hr = s.homeRuns || 0;
    return {
      avg: s.avg ?? null,
      obp: s.obp ?? null,
      slg: s.slg ?? null,
      homeRuns: hr,
      singles: hits - doubles - triples - hr,
      doubles,
      triples,
      rbi: s.rbi || 0,
      stolenBases: s.stolenBases || 0,
      gamesPlayed: s.gamesPlayed || 0,
    };
  } catch {
    return null;
  }
}

async function getTeamHitterPool(teamId, season) {
  const hitters = await getActiveHitters(teamId);
  const stats = await Promise.all(
    hitters.map((h) => getSeasonHittingStats(h.person.id, season))
  );
  return hitters.map((h, i) => ({
    mlbPlayerId: h.person.id,
    name: h.person.fullName,
    position: h.position.abbreviation,
    teamId,
    stats: stats[i],
    war: null, // not available from statsapi; commissioner may hand-enter
  }));
}

async function getLiveFeed(gamePk) {
  return getJson(`${BASE}/api/v1.1/game/${gamePk}/feed/live`);
}

module.exports = {
  getScheduleForDate,
  getActiveHitters,
  getSeasonHittingStats,
  getTeamHitterPool,
  getLiveFeed,
};
