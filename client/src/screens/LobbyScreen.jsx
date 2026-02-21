import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import TeamPicker from '../components/TeamPicker.jsx';
import GameSettingsPanel from '../components/GameSettingsPanel.jsx';

export default function LobbyScreen() {
  const socket = useSocket();
  const { state, dispatch } = useGame();

  const gameMode = state.gameSettings?.gameMode || 4;

  const handleAutoAssign = () => {
    socket.emit('auto_assign_teams');
  };

  const handleStartGame = () => {
    socket.emit('start_game');
  };

  const handleLeave = () => {
    socket.emit('leave_lobby');
    dispatch({ type: 'LEAVE' });
  };

  const handleAddBot = () => {
    socket.emit('add_bot');
  };

  const handleRemoveBot = (botId) => {
    socket.emit('remove_bot', { botId });
  };

  // Dynamic team count check
  const assignedCount = state.players.filter(p => p.team !== null).length;
  const spectatorCount = state.players.length - assignedCount;

  // Check all teams are fully assigned for mode
  const allTeamsSet = assignedCount === gameMode;

  const canAddBot = state.isHost && state.players.length < gameMode;

  return (
    <div className="lobby-screen">
      <div className="lobby-header">
        <h2>Lobby</h2>
        <div className="lobby-code">
          Room Code: <span className="code">{state.lobbyCode}</span>
        </div>
      </div>

      <div className="lobby-players">
        <div className="player-count">
          Players: {assignedCount} / {gameMode}
          {spectatorCount > 0 && <span className="spectator-count"> &middot; {spectatorCount} spectator{spectatorCount !== 1 ? 's' : ''}</span>}
        </div>
        <TeamPicker onRemoveBot={handleRemoveBot} />
      </div>

      <GameSettingsPanel />

      <div className="lobby-actions">
        {canAddBot && (
          <button className="btn btn-secondary" onClick={handleAddBot}>
            + Add Bot
          </button>
        )}
        {state.isHost && (
          <button
            className="btn btn-secondary"
            onClick={handleAutoAssign}
            disabled={state.players.length < gameMode}
            title={state.players.length < gameMode ? `Need at least ${gameMode} players` : 'Randomly assign teams'}
          >
            Randomize Teams
          </button>
        )}
        {state.isHost && (
          <button
            className="btn btn-primary"
            onClick={handleStartGame}
            disabled={!allTeamsSet}
            title={!allTeamsSet ? `Need ${gameMode} players with teams assigned` : ''}
          >
            Start Game
          </button>
        )}
        <button className="btn btn-ghost" onClick={handleLeave}>
          Leave Room
        </button>
      </div>

      {!state.isHost && (
        <p className="waiting-text">Waiting for host to start the game...</p>
      )}

      <button className="rules-link" onClick={() => window.dispatchEvent(new Event('open-rules'))}>
        How to Play
      </button>
    </div>
  );
}
