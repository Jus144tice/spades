import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function JoinScreen() {
  const socket = useSocket();
  const { dispatch } = useGame();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState(null); // null, 'create', 'join'

  const handleCreate = () => {
    if (!name.trim()) return;
    dispatch({ type: 'SET_NAME', name: name.trim() });
    socket.emit('create_lobby', { playerName: name.trim() });
  };

  const handleJoin = () => {
    if (!name.trim() || !code.trim()) return;
    dispatch({ type: 'SET_NAME', name: name.trim() });
    socket.emit('join_lobby', { playerName: name.trim(), lobbyCode: code.trim() });
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="join-title">Spades</h1>
        <p className="join-subtitle">Get your squad together</p>

        <div className="join-field">
          <label>Your Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={12}
            onKeyDown={e => {
              if (e.key === 'Enter' && mode === 'join') handleJoin();
              if (e.key === 'Enter' && mode === 'create') handleCreate();
            }}
          />
        </div>

        {!mode && (
          <div className="join-buttons">
            <button className="btn btn-primary" onClick={() => setMode('create')} disabled={!name.trim()}>
              Create Room
            </button>
            <button className="btn btn-secondary" onClick={() => setMode('join')} disabled={!name.trim()}>
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
