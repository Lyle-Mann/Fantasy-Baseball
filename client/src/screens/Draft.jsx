import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import MatchupHeader from '../components/MatchupHeader.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import { getTeamBrand } from '../lib/teamBrand';

const COLUMNS = [
  { key: 'obp', label: 'OBP' },
  { key: 'homeRuns', label: 'HR' },
  { key: 'avg', label: 'AVG' },
  { key: 'singles', label: '1B' },
  { key: 'doubles', label: '2B' },
  { key: 'triples', label: '3B' },
  { key: 'rbi', label: 'RBI' },
  { key: 'war', label: 'WAR' },
];

function numVal(v) {
  if (v === null || v === undefined || v === '') return -Infinity;
  return Number(v);
}

export default function Draft({ admin, session, humanPlayers, rosterPicks, draftTurn, onChanged }) {
  const [pool, setPool] = useState([]);
  const [poolError, setPoolError] = useState('');
  const [loadingPool, setLoadingPool] = useState(true);
  const [newName, setNewName] = useState('');
  const [sortKey, setSortKey] = useState('obp');
  const [teamFilter, setTeamFilter] = useState('all');
  const [showOverride, setShowOverride] = useState(false);
  const [warEdits, setWarEdits] = useState({});
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingPool(true);
    api
      .get('/api/draft/pool')
      .then((data) => { if (!cancelled) setPool(data.pool); })
      .catch((err) => { if (!cancelled) setPoolError(err.message); })
      .finally(() => { if (!cancelled) setLoadingPool(false); });
    return () => { cancelled = true; };
  }, [session.id]);

  const draftedIds = useMemo(
    () => new Set(rosterPicks.map((p) => p.mlb_player_id)),
    [rosterPicks]
  );

  const humanById = useMemo(() => {
    const m = {};
    humanPlayers.forEach((h) => { m[h.id] = h; });
    return m;
  }, [humanPlayers]);

  const currentHuman = draftTurn ? humanById[draftTurn.humanPlayerId] : null;

  const available = useMemo(() => {
    let list = pool.filter((p) => !draftedIds.has(p.mlbPlayerId));
    if (teamFilter !== 'all') list = list.filter((p) => String(p.teamId) === teamFilter);
    list = [...list].sort((a, b) => {
      const av = sortKey === 'war' ? numVal(warEdits[a.mlbPlayerId] ?? a.war) : numVal(a.stats?.[sortKey]);
      const bv = sortKey === 'war' ? numVal(warEdits[b.mlbPlayerId] ?? b.war) : numVal(b.stats?.[sortKey]);
      return bv - av;
    });
    return list;
  }, [pool, draftedIds, teamFilter, sortKey, warEdits]);

  async function addPlayer() {
    if (!newName.trim()) return;
    try {
      await api.post('/api/draft/players', { name: newName.trim() });
      setNewName('');
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  async function removePlayer(id) {
    if (!confirm('Remove this human player and their picks?')) return;
    await api.del(`/api/draft/players/${id}`);
    onChanged();
  }

  async function randomize() {
    try {
      await api.post('/api/draft/randomize', {});
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  async function draftPlayer(p) {
    if (!draftTurn) return;
    setBusyId(p.mlbPlayerId);
    try {
      await api.post('/api/draft/pick', {
        mlbPlayerId: p.mlbPlayerId,
        mlbPlayerName: p.name,
        mlbTeamId: p.teamId,
      });
      onChanged();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function deletePick(pickId) {
    await api.del(`/api/draft/pick/${pickId}`);
    onChanged();
  }

  async function reassignPick(pickId, humanPlayerId) {
    await api.patch(`/api/draft/pick/${pickId}`, { humanPlayerId: Number(humanPlayerId) });
    onChanged();
  }

  return (
    <div>
      <MatchupHeader
        awayTeamId={session.away_team_id}
        awayName={session.away_team_name}
        homeTeamId={session.home_team_id}
        homeName={session.home_team_name}
      />

      {admin && (
        <div className="card">
          <h2>Human players</h2>
          <div className="row">
            <input
              type="text"
              placeholder="Add a name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            />
            <button className="btn primary" onClick={addPlayer}>Add</button>
          </div>
          {humanPlayers.length > 0 && (
            <div className="stack" style={{ marginTop: 10 }}>
              {humanPlayers.map((h) => (
                <div key={h.id} className="row between">
                  <span>{h.name}</span>
                  {!session.draft_order_json && (
                    <button className="btn small bad" onClick={() => removePlayer(h.id)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!session.draft_order_json && (
            <button className="btn good block" style={{ marginTop: 10 }} onClick={randomize}>
              🎲 Randomize draft order &amp; start
            </button>
          )}
        </div>
      )}

      {draftTurn && currentHuman && (
        <div className="turn-banner">
          <div className="who">{currentHuman.name}'s pick</div>
          <div className="meta">Pick {draftTurn.pickNumber} of {draftTurn.totalPicks}</div>
        </div>
      )}

      <div className="card">
        <h2>Rosters so far</h2>
        <div className="stack">
          {humanPlayers.map((h) => {
            const picks = rosterPicks.filter((p) => p.human_player_id === h.id);
            return (
              <div key={h.id} className="player-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="row between">
                  <span className="name">{h.name}</span>
                  <span className="sub">{picks.length}/2</span>
                </div>
                {picks.map((p) => (
                  <div key={p.id} className="row between" style={{ marginTop: 4 }}>
                    <span className="sub row" style={{ alignItems: 'center', gap: 6 }}>
                      <TeamLogo teamId={p.mlb_team_id} size={16} />
                      {p.mlb_player_name}
                    </span>
                    {admin && (
                      <div className="row">
                        {showOverride && (
                          <select
                            value={p.human_player_id}
                            onChange={(e) => reassignPick(p.id, e.target.value)}
                          >
                            {humanPlayers.map((hp) => (
                              <option key={hp.id} value={hp.id}>{hp.name}</option>
                            ))}
                          </select>
                        )}
                        {showOverride && (
                          <button className="btn small bad" onClick={() => deletePick(p.id)}>Undo</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {admin && (
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => setShowOverride((v) => !v)}>
            {showOverride ? 'Done overriding' : '🛠 Manual override'}
          </button>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <h2>Available hitters</h2>
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">Both teams</option>
            <option value={String(session.away_team_id)}>{session.away_team_name}</option>
            <option value={String(session.home_team_id)}>{session.home_team_name}</option>
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>Sort: {c.label}</option>
            ))}
          </select>
        </div>

        {loadingPool && <p className="muted">Loading rosters &amp; stats from MLB...</p>}
        {poolError && <div className="error-banner">{poolError}</div>}
        <p className="muted" style={{ marginTop: -4, marginBottom: 8 }}>
          WAR isn't published by MLB's API — commissioner can hand-type it in per player below.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table className="stat-table">
            <thead>
              <tr>
                <th>Player</th>
                {COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {available.map((p) => {
                const brand = getTeamBrand(p.teamId);
                return (
                <tr key={p.mlbPlayerId}>
                  <td>
                    <span
                      title={brand.name}
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: brand.primary,
                        marginRight: 6,
                      }}
                    />
                    {p.name} <span className="tag">{p.position}</span>
                  </td>
                  <td>{p.stats?.obp ?? '-'}</td>
                  <td>{p.stats?.homeRuns ?? '-'}</td>
                  <td>{p.stats?.avg ?? '-'}</td>
                  <td>{p.stats?.singles ?? '-'}</td>
                  <td>{p.stats?.doubles ?? '-'}</td>
                  <td>{p.stats?.triples ?? '-'}</td>
                  <td>{p.stats?.rbi ?? '-'}</td>
                  <td>
                    {admin ? (
                      <input
                        type="text"
                        style={{ width: 46, minHeight: 28, padding: '2px 4px' }}
                        value={warEdits[p.mlbPlayerId] ?? p.war ?? ''}
                        onChange={(e) =>
                          setWarEdits((w) => ({ ...w, [p.mlbPlayerId]: e.target.value }))
                        }
                      />
                    ) : (
                      p.war ?? '-'
                    )}
                  </td>
                  <td>
                    <button
                      className="btn small primary"
                      disabled={!draftTurn || busyId === p.mlbPlayerId}
                      onClick={() => draftPlayer(p)}
                    >
                      {busyId === p.mlbPlayerId ? '...' : 'Draft'}
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
