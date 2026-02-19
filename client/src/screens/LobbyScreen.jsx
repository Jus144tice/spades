import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import TeamPicker from '../components/TeamPicker.jsx';
import GameSettingsPanel from '../components/GameSettingsPanel.jsx';

export default function LobbyScreen() {
  const socket = useSocket();
  const { state, dispatch } = useGame();

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

  const team1Count = state.players.filter(p => p.team === 1).length;
  const team2Count = state.players.filter(p => p.team === 2).length;
  const allTeamsSet = team1Count === 2 && team2Count === 2;

  const bots = state.players.filter(p => p.isBot);
  const canAddBot = state.isHost && state.players.length < 10;
  const spectatorCount = state.players.length - team1Count - team2Count;

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
          Players: {team1Count + team2Count} / 4
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
            disabled={state.players.length < 4}
            title={state.players.length < 4 ? 'Need at least 4 players' : 'Randomly assign teams'}
          >
            Randomize Teams
          </button>
        )}
        {state.isHost && (
          <button
            className="btn btn-primary"
            onClick={handleStartGame}
            disabled={!allTeamsSet}
            title={!allTeamsSet ? 'Need 4 players with teams assigned' : ''}
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
