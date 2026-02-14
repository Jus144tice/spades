import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import TeamPicker from '../components/TeamPicker.jsx';

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

  const allTeamsSet = state.players.length === 4
    && state.players.filter(p => p.team === 1).length === 2
    && state.players.filter(p => p.team === 2).length === 2;

  const bots = state.players.filter(p => p.isBot);
  const canAddBot = state.isHost && state.players.length < 4;

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
          Players: {state.players.length} / 4
        </div>
        <TeamPicker onRemoveBot={handleRemoveBot} />
      </div>

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
            disabled={state.players.length !== 4}
            title={state.players.length !== 4 ? 'Need 4 players first' : 'Randomly assign teams'}
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
    </div>
  );
}
