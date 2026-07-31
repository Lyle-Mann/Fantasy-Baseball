import React, { useState } from 'react';
import { api } from '../lib/api';

const MANUAL_BUTTONS = [
  { key: 'web_gem', label: 'Web Gem', points: 1 },
  { key: 'play_of_week', label: 'Play of the Week', points: 2 },
  { key: 'chase_pitcher', label: 'Chase the Pitcher', points: 3 },
];

function fmtCategory(cat) {
  return cat.replace(/_/g, ' ');
}

export default function Live({ admin, session, rosterPicks, leaderboard, recentEvents, onChanged }) {
  const [adjustFor, setAdjustFor] = useState(null); // {mlbPlayerId, mlbPlayerName}
  const [adjustPoints, setAdjustPoints] = useState('');
  const [adjustDesc, setAdjustDesc] = useState('');
  const [busy, setBusy] = useState(null);

  async function pushManual(player, category) {
    setBusy(`${player.mlbPlayerId}:${category}`);
    try {
      await api.post('/api/score/manual', {
        mlbPlayerId: player.mlbPlayerId,
        mlbPlayerName: player.name,
        category,
      });
      onChanged();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function submitAdjust() {
    const points = Number(adjustPoints);
    if (Number.isNaN(points) || points === 0) return;
    try {
      await api.post('/api/score/adjust', {
        mlbPlayerId: adjustFor.mlbPlayerId,
        mlbPlayerName: adjustFor.mlbPlayerName,
        points,
        description: adjustDesc || 'Manual adjustment',
      });
      setAdjustFor(null);
      setAdjustPoints('');
      setAdjustDesc('');
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteEvent(id) {
    await api.del(`/api/score/event/${id}`);
    onChanged();
  }

  const isFinal = session.status === 'final';
  const winner = isFinal && leaderboard.length ? leaderboard[0] : null;

  return (
    <div>
      <div className="card">
        <div className="row between">
          <h2>{session.away_team_name} @ {session.home_team_name}</h2>
          <span className={`status-badge ${isFinal ? 'final' : 'live'}`}>{isFinal ? 'Final' : 'Live'}</span>
        </div>
      </div>

      {winner && (
        <div className="turn-banner">
          <div className="who">🏆 {winner.name} wins!</div>
          <div className="meta">{winner.total} points</div>
        </div>
      )}

      <div className="card">
        <h2>Leaderboard</h2>
        {leaderboard.map((row, i) => (
          <div key={row.humanPlayerId} className={`leaderboard-row ${i === 0 ? 'first' : ''}`}>
            <span className="rank">{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div className="name">{row.name}</div>
              <div className="sub">{row.players.map((p) => `${p.name} (${p.points})`).join(' · ')}</div>
            </div>
            <span className="total">{row.total}</span>
          </div>
        ))}
      </div>

      {admin && (
        <div className="card">
          <h2>Manual points</h2>
          <div className="stack">
            {rosterPicks.map((p) => (
              <div key={p.id} className="player-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="row between">
                  <span className="name">{p.mlb_player_name}</span>
                  <button className="btn small" onClick={() => setAdjustFor({ mlbPlayerId: p.mlb_player_id, mlbPlayerName: p.mlb_player_name })}>
                    +/- Adjust
                  </button>
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  {MANUAL_BUTTONS.map((b) => (
                    <button
                      key={b.key}
                      className="btn small warn"
                      disabled={busy === `${p.mlb_player_id}:${b.key}`}
                      onClick={() => pushManual({ mlbPlayerId: p.mlb_player_id, name: p.mlb_player_name }, b.key)}
                    >
                      {b.label} (+{b.points})
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Live event feed</h2>
        {recentEvents.length === 0 && <p className="muted">No scoring events yet.</p>}
        {recentEvents.map((e) => (
          <div key={e.id} className="event-item">
            <div>
              <div>{e.mlb_player_name} <span className="tag">{fmtCategory(e.category)}</span></div>
              {e.description && <div className="muted">{e.description}</div>}
            </div>
            <div className="row" style={{ alignItems: 'center' }}>
              <span className={`pts ${e.points >= 0 ? 'pos' : 'neg'}`}>{e.points > 0 ? '+' : ''}{e.points}</span>
              {admin && <button className="btn small bad" onClick={() => deleteEvent(e.id)}>×</button>}
            </div>
          </div>
        ))}
      </div>

      {adjustFor && (
        <div className="overlay" onClick={() => setAdjustFor(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Adjust points — {adjustFor.mlbPlayerName}</h2>
            <div className="stack">
              <input
                type="number"
                placeholder="Points (e.g. -1 or 2)"
                value={adjustPoints}
                onChange={(e) => setAdjustPoints(e.target.value)}
                autoFocus
              />
              <input
                type="text"
                placeholder="Reason (optional)"
                value={adjustDesc}
                onChange={(e) => setAdjustDesc(e.target.value)}
              />
              <button className="btn primary block" onClick={submitAdjust}>Apply</button>
              <button className="btn block" onClick={() => setAdjustFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
