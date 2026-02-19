import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function TeamPicker({ onRemoveBot }) {
  const socket = useSocket();
  const { state } = useGame();

  const handleAssign = (playerId, team) => {
    socket.emit('assign_team', { targetPlayerId: playerId, team });
  };

  const unassigned = state.players.filter(p => p.team === null);
  const team1 = state.players.filter(p => p.team === 1);
  const team2 = state.players.filter(p => p.team === 2);

  const renderPlayer = (player) => {
    const isMe = player.id === state.playerId;
    const isBot = player.isBot;
    return (
      <div key={player.id} className={`team-player ${isMe ? 'is-me' : ''} ${isBot ? 'is-bot' : ''}`}>
        <span className="player-name">
          {player.name}
          {isMe ? ' (you)' : ''}
          {isBot ? ' \uD83E\uDD16' : ''}
        </span>
        <div className="team-assign-buttons">
          {state.isHost && (
            <>
              {player.team !== 1 && <button className="btn btn-tiny team1-btn" onClick={() => handleAssign(player.id, 1)}>T1</button>}
              {player.team !== 2 && <button className="btn btn-tiny team2-btn" onClick={() => handleAssign(player.id, 2)}>T2</button>}
              {player.team !== null && <button className="btn btn-tiny" onClick={() => handleAssign(player.id, null)}>X</button>}
            </>
          )}
          {state.isHost && isBot && (
            <button className="btn btn-tiny" onClick={() => onRemoveBot(player.id)} title="Remove bot" style={{ color: '#ef5350' }}>
              Kick
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="team-picker">
      {unassigned.length > 0 && (
        <div className="team-group">
          <h3>{team1.length + team2.length >= 4 ? 'Spectators' : 'Unassigned'}</h3>
          {unassigned.map(renderPlayer)}
        </div>
      )}
      <div className="teams-row">
        <div className="team-group team1">
          <h3>Team 1</h3>
          {team1.length === 0 && <div className="team-empty">Empty</div>}
          {team1.map(renderPlayer)}
        </div>
        <div className="team-group team2">
          <h3>Team 2</h3>
          {team2.length === 0 && <div className="team-empty">Empty</div>}
          {team2.map(renderPlayer)}
        </div>
      </div>
    </div>
  );
}
