import React, { useEffect, useState, useCallback } from 'react';
import { api, loginAdmin, logoutAdmin, isAdmin } from './lib/api';
import { socket } from './lib/socket';
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
    const onSession = (payload) => setSession(payload.session);
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
  }, []);

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

  let screen = null;
  if (loading) {
    screen = <p className="muted">Loading...</p>;
  } else if (!session || session.status === 'selecting') {
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
    <div className="app">
      <div className="topbar">
        <h1>⚾ Fantasy Watch-Along</h1>
        {admin ? (
          <button className="pill admin" onClick={handleLogout}>Commissioner · Log out</button>
        ) : (
          <button className="pill" onClick={() => setShowLogin(true)}>🔒 Commissioner</button>
        )}
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
