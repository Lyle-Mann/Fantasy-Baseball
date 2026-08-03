import React, { useEffect, useState, useCallback } from 'react';
import { api, loginAdmin, logoutAdmin, isAdmin } from './lib/api';
import { socket } from './lib/socket';
import { getTeamBrand } from './lib/teamBrand';
import chainsightLogo from './assets/chainsight-logo.png';
import GameSelect from './screens/GameSelect.jsx';
import Draft from './screens/Draft.jsx';
import Live from './screens/Live.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [humanPlayers, setHumanPlayers] = useState([]);
  const [rosterPicks, setRosterPicks] = useState([]);
  const [draftTurn, setDraftTurn] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState(isAdmin());
  const [showLogin, setShowLogin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/api/session/current');
      setSession(data.session);
      setHumanPlayers(data.humanPlayers || []);
      setRosterPicks(data.rosterPicks || []);
      setDraftTurn(data.draftTurn || null);
      setLeaderboard(data.leaderboard || []);
      setRecentEvents(data.recentEvents || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    // A new/ended session means the previous game's roster & score state is
    // no longer valid for anyone watching - pull a full fresh snapshot
    // rather than patching in just the new session row.
    const onSession = () => refresh();
    const onDraft = (payload) => {
      setSession(payload.session);
      setHumanPlayers(payload.humanPlayers || []);
      setRosterPicks(payload.rosterPicks || []);
      setDraftTurn(payload.draftTurn || null);
    };
    const onScore = (payload) => {
      setLeaderboard(payload.leaderboard || []);
      setRecentEvents(payload.recentEvents || []);
    };
    socket.on('session:update', onSession);
    socket.on('draft:update', onDraft);
    socket.on('score:update', onScore);
    return () => {
      socket.off('session:update', onSession);
      socket.off('draft:update', onDraft);
      socket.off('score:update', onScore);
    };
  }, [refresh]);

  async function handleLogin(pin) {
    try {
      await loginAdmin(pin);
      setAdmin(true);
      setShowLogin(false);
    } catch (err) {
      alert(err.message);
    }
  }

  function handleLogout() {
    logoutAdmin();
    setAdmin(false);
  }

  async function handleExit() {
    if (!confirm('End this match for everyone and go back to picking a new game?')) return;
    try {
      await api.post('/api/session/end', {});
      refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  const isFanMode = session && session.status !== 'ended' && session.draft_mode === 'single';
  const fanBrand = isFanMode ? getTeamBrand(session.fan_team_id) : null;
  const canExit = session && session.status !== 'ended' && admin;

  let screen = null;
  if (loading) {
    screen = <p className="muted">Loading...</p>;
  } else if (!session || session.status === 'selecting' || session.status === 'ended') {
    screen = <GameSelect admin={admin} onChanged={refresh} />;
  } else if (session.status === 'drafting') {
    screen = (
      <Draft
        admin={admin}
        session={session}
        humanPlayers={humanPlayers}
        rosterPicks={rosterPicks}
        draftTurn={draftTurn}
        onChanged={refresh}
      />
    );
  } else {
    screen = (
      <Live
        admin={admin}
        session={session}
        humanPlayers={humanPlayers}
        rosterPicks={rosterPicks}
        leaderboard={leaderboard}
        recentEvents={recentEvents}
        onChanged={refresh}
      />
    );
  }

  return (
    <div
      className={`app ${isFanMode ? 'fan-mode' : ''}`}
      style={
        fanBrand
          ? { '--accent': fanBrand.primary, '--accent-2': fanBrand.secondary }
          : undefined
      }
    >
      <div className="topbar">
        <h1 className="row" style={{ alignItems: 'center', gap: 8 }}>
          <img src={chainsightLogo} alt="" width={22} height={22} />
          Pick To Click
        </h1>
        <div className="row" style={{ gap: 6 }}>
          {canExit && (
            <button className="pill exit-pill" onClick={handleExit}>Exit match</button>
          )}
          {admin ? (
            <button className="pill admin" onClick={handleLogout}>Commissioner · Log out</button>
          ) : (
            <button className="pill" onClick={() => setShowLogin(true)}>🔒 Commissioner</button>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {screen}

      {showLogin && (
        <LoginSheet onClose={() => setShowLogin(false)} onSubmit={handleLogin} />
      )}
    </div>
  );
}

function LoginSheet({ onClose, onSubmit }) {
  const [pin, setPin] = useState('');
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Commissioner PIN</h2>
        <div className="stack">
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <button className="btn primary block" onClick={() => onSubmit(pin)}>Unlock</button>
          <button className="btn block" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
