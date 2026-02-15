import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function JoinScreen() {
  const socket = useSocket();
  const { dispatch } = useGame();
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.displayName || '');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState(null); // null, 'create', 'join'
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/stats/${user.id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setStats(data))
        .catch(() => {});
    }
  }, [user?.id]);

  const playerName = name.trim() || user?.displayName || 'Player';

  const handleCreate = () => {
    if (!playerName) return;
    dispatch({ type: 'SET_NAME', name: playerName });
    socket.emit('create_lobby', { playerName });
  };

  const handleJoin = () => {
    if (!playerName || !code.trim()) return;
    dispatch({ type: 'SET_NAME', name: playerName });
    socket.emit('join_lobby', { playerName, lobbyCode: code.trim() });
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="join-title">Spades</h1>
        <p className="join-subtitle">Get your squad together</p>

        <div className="join-user-info">
          <div className="join-user-row">
            {user?.avatarUrl && (
              <img src={user.avatarUrl} alt="" className="join-avatar" referrerPolicy="no-referrer" />
            )}
            <span className="join-user-name">{user?.displayName}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
          {stats && (
            <div className="join-stats">
              {stats.gamesPlayed} games played &middot; {stats.gamesWon}W / {stats.gamesLost}L
            </div>
          )}
        </div>

        <div className="join-field">
          <label>Display Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={user?.displayName || 'Enter your name'}
            maxLength={12}
            onKeyDown={e => {
              if (e.key === 'Enter' && mode === 'join') handleJoin();
              if (e.key === 'Enter' && mode === 'create') handleCreate();
            }}
          />
        </div>

        {!mode && (
          <div className="join-buttons">
            <button className="btn btn-primary" onClick={() => setMode('create')}>
              Create Room
            </button>
            <button className="btn btn-secondary" onClick={() => setMode('join')}>
              Join Room
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="join-buttons">
            <button className="btn btn-primary" onClick={handleCreate}>
              Create & Enter
            </button>
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Back</button>
          </div>
        )}

        {mode === 'join' && (
          <>
            <div className="join-field">
              <label>Room Code</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD"
                maxLength={4}
                className="code-input"
                onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
              />
            </div>
            <div className="join-buttons">
              <button className="btn btn-primary" onClick={handleJoin} disabled={!code.trim()}>
                Join Game
              </button>
              <button className="btn btn-ghost" onClick={() => setMode(null)}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
