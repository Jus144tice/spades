import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

// Team configurations by game mode (player count -> team structure)
const TEAM_CONFIGS = {
  3: [1, 2, 3],
  4: [1, 2],
  5: [1, 2, 3],
  6: [1, 2, 3],
  7: [1, 2, 3, 4],
  8: [1, 2, 3, 4],
};

export default function TeamPicker({ onRemoveBot }) {
  const socket = useSocket();
  const { state } = useGame();

  const gameMode = state.gameSettings?.gameMode || 4;
  const teamNums = TEAM_CONFIGS[gameMode] || [1, 2];

  const handleAssign = (playerId, team) => {
    socket.emit('assign_team', { targetPlayerId: playerId, team });
  };

  const unassigned = state.players.filter(p => p.team === null);
  const teamGroups = teamNums.map(num => ({
    num,
    players: state.players.filter(p => p.team === num),
  }));

  const assignedCount = state.players.filter(p => p.team !== null).length;

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
              {teamNums.map(num => (
                player.team !== num && (
                  <button
                    key={num}
                    className={`btn btn-tiny team${num}-btn`}
                    onClick={() => handleAssign(player.id, num)}
                  >
                    T{num}
                  </button>
                )
              ))}
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
          <h3>{assignedCount >= gameMode ? 'Spectators' : 'Unassigned'}</h3>
          {unassigned.map(renderPlayer)}
        </div>
      )}
      <div className="teams-row">
        {teamGroups.map(({ num, players }) => (
          <div key={num} className={`team-group team${num}`}>
            <h3>Team {num}</h3>
            {players.length === 0 && <div className="team-empty">Empty</div>}
            {players.map(renderPlayer)}
          </div>
        ))}
      </div>
    </div>
  );
}
