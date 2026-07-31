import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import TeamLogo from '../components/TeamLogo.jsx';
import { getTeamBrand } from '../lib/teamBrand';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function statusClass(g) {
  if (g.abstractGameState === 'Live') return 'live';
  if (g.abstractGameState === 'Final') return 'final';
  return 'pre';
}

export default function GameSelect({ admin, onChanged }) {
  const [date, setDate] = useState(todayStr());
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [pickedGame, setPickedGame] = useState(null);

  async function loadSchedule(d) {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/api/schedule?date=${d}`);
      setGames(data.games);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSchedule(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  function pickGame(g) {
    if (!admin) return;
    setPickedGame(g);
  }

  async function startDraft(draftMode, fanTeamId) {
    setStarting(true);
    setError('');
    try {
      await api.post('/api/session', { gamePk: pickedGame.gamePk, date, draftMode, fanTeamId });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Pick tonight's game</h2>
        {!admin && <p className="muted">Only the commissioner can select the game. Unlock with the PIN button above.</p>}
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPickedGame(null); }} />
      </div>

      {admin && pickedGame && (
        <div className="card">
          <h2>Draft pool</h2>
          <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
            <TeamLogo teamId={pickedGame.away.id} size={22} />
            <span style={{ fontWeight: 600 }}>{pickedGame.away.name} @ {pickedGame.home.name}</span>
            <TeamLogo teamId={pickedGame.home.id} size={22} />
          </div>
          <div className="stack">
            <button className="btn primary block" disabled={starting} onClick={() => startDraft('both', null)}>
              Both teams — everyone drafts from either roster
            </button>
            <FanModeButton team={pickedGame.away} disabled={starting} onClick={() => startDraft('single', pickedGame.away.id)} />
            <FanModeButton team={pickedGame.home} disabled={starting} onClick={() => startDraft('single', pickedGame.home.id)} />
            <button className="btn small" disabled={starting} onClick={() => setPickedGame(null)}>Cancel</button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            Single-team mode restricts the whole draft pool to that team's hitters and themes the app in their colors and logos.
          </p>
        </div>
      )}

      <div className="card">
        {loading && <p className="muted">Loading schedule...</p>}
        {error && <div className="error-banner">{error}</div>}
        {!loading && games.length === 0 && <p className="muted">No games found for this date.</p>}
        {games.map((g) => (
          <div
            key={g.gamePk}
            className={`game-item ${pickedGame?.gamePk === g.gamePk ? 'selected' : ''}`}
            onClick={() => pickGame(g)}
            style={{ opacity: admin ? 1 : 0.7, cursor: admin ? 'pointer' : 'default' }}
          >
            <div>
              <div className="game-item-teams" style={{ fontWeight: 600 }}>
                <TeamLogo teamId={g.away.id} size={22} />
                <span>{g.away.name} @ {g.home.name}</span>
                <TeamLogo teamId={g.home.id} size={22} />
              </div>
              <div className="muted">{g.venue}</div>
            </div>
            <div className="stack" style={{ alignItems: 'flex-end' }}>
              <span className={`status-badge ${statusClass(g)}`}>{g.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FanModeButton({ team, disabled, onClick }) {
  const brand = getTeamBrand(team.id);
  return (
    <button
      className="btn block"
      disabled={disabled}
      onClick={onClick}
      style={{ background: brand.primary, borderColor: brand.secondary, color: '#fff' }}
    >
      <TeamLogo teamId={team.id} size={20} />
      {team.name} fans only
    </button>
  );
}
