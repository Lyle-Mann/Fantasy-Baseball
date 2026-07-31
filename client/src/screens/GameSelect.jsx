import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import TeamLogo from '../components/TeamLogo.jsx';

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
  const [selecting, setSelecting] = useState(null);

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

  async function selectGame(g) {
    if (!admin) return;
    setSelecting(g.gamePk);
    try {
      await api.post('/api/session', { gamePk: g.gamePk, date });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div>
      <div className="card">
        <h2>Pick tonight's game</h2>
        {!admin && <p className="muted">Only the commissioner can select the game. Unlock with the PIN button above.</p>}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="card">
        {loading && <p className="muted">Loading schedule...</p>}
        {error && <div className="error-banner">{error}</div>}
        {!loading && games.length === 0 && <p className="muted">No games found for this date.</p>}
        {games.map((g) => (
          <div
            key={g.gamePk}
            className="game-item"
            onClick={() => selectGame(g)}
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
              {selecting === g.gamePk && <span className="muted">Starting...</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
