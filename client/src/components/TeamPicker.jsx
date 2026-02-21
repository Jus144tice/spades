import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

// Team configurations by game mode: team number -> max size
const TEAM_CONFIGS = {
  3: { 1: 1, 2: 1, 3: 1 },
  4: { 1: 2, 2: 2 },
  5: { 1: 2, 2: 2, 3: 1 },
  6: { 1: 2, 2: 2, 3: 2 },
  7: { 1: 2, 2: 2, 3: 2, 4: 1 },
  8: { 1: 2, 2: 2, 3: 2, 4: 2 },
};

// Which teams are spoilers per mode (solo player with double-scoring)
const SPOILER_TEAMS = {
  5: new Set([3]),
  7: new Set([4]),
};

export default function TeamPicker({ onRemoveBot }) {
  const socket = useSocket();
  const { state } = useGame();

  const gameMode = state.gameSettings?.gameMode || 4;
  const teamConfig = TEAM_CONFIGS[gameMode] || { 1: 2, 2: 2 };
  const teamNums = Object.keys(teamConfig).map(Number);

  const handleAssign = (playerId, team) => {
    socket.emit('assign_team', { targetPlayerId: playerId, team });
  };

  const unassigned = state.players.filter(p => p.team === null);
  const teamGroups = teamNums.map(num => ({
    num,
    maxSize: teamConfig[num],
    players: state.players.filter(p => p.team === num),
  }));

  // Track which teams are full
  const teamFull = {};
  for (const tg of teamGroups) {
    teamFull[tg.num] = tg.players.length >= tg.maxSize;
  }

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
                player.team !== num && !teamFull[num] && (
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
        {teamGroups.map(({ num, maxSize, players }) => {
          const isSpoiler = SPOILER_TEAMS[gameMode]?.has(num);
          return (
            <div key={num} className={`team-group team${num} ${isSpoiler ? 'spoiler-team' : ''}`}>
              <h3>{isSpoiler ? 'Spoiler' : `Team ${num}`} <span className="team-count">({players.length}/{maxSize})</span></h3>
              {isSpoiler && <div className="spoiler-hint">Solo player, 2x scoring</div>}
              {players.length === 0 && <div className="team-empty">Empty</div>}
              {players.map(renderPlayer)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
