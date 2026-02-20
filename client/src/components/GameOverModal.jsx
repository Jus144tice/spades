import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

const GAME_OVER_TIMEOUT = 60;

export default function GameOverModal() {
  const socket = useSocket();
  const { state, dispatch } = useGame();
  const data = state.gameOverData;

  const isSinglePlayer = state.players.filter(p => !p.isBot).length <= 1;
  const [countdown, setCountdown] = useState(isSinglePlayer ? 0 : GAME_OVER_TIMEOUT);

  useEffect(() => {
    if (!data || isSinglePlayer) return;
    setCountdown(GAME_OVER_TIMEOUT);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [data, isSinglePlayer]);

  if (!data) return null;

  const team1Names = state.players.filter(p => p.team === 1).map(p => p.name).join(' & ');
  const team2Names = state.players.filter(p => p.team === 2).map(p => p.name).join(' & ');

  const handlePlayAgain = () => {
    socket.emit('return_to_lobby');
  };

  const handleLeave = () => {
    socket.emit('leave_lobby');
    dispatch({ type: 'LEAVE' });
  };

  return (
    <div className="modal-overlay">
      <div className="modal game-over-modal">
        <h2>Game Over!</h2>
        <div className="winner-announcement">
          {data.winningPlayers.join(' & ')} win!
        </div>
        <div className="final-scores">
          <div className="final-score-row">
            <span>{team1Names}</span>
            <span className="final-score-value">{data.finalScores.team1}</span>
          </div>
          <div className="final-score-row">
            <span>{team2Names}</span>
            <span className="final-score-value">{data.finalScores.team2}</span>
          </div>
        </div>

        {data.roundHistory && data.roundHistory.length > 0 && (
          <div className="round-history-table">
            <h3>Round by Round</h3>
            <table>
              <thead>
                <tr>
                  <th>Rd</th>
                  <th>{team1Names}</th>
                  <th>{team2Names}</th>
                </tr>
              </thead>
              <tbody>
                {data.roundHistory.map((r, i) => (
                  <tr key={i}>
                    <td>{r.roundNumber}</td>
                    <td>{r.team1Score > 0 ? '+' : ''}{r.team1Score} ({r.team1Total})</td>
                    <td>{r.team2Score > 0 ? '+' : ''}{r.team2Score} ({r.team2Total})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="game-over-actions">
          <button className="btn btn-primary" onClick={handlePlayAgain}>
            {state.isHost ? 'New Game' : 'Back to Lobby'} {countdown > 0 ? `(${countdown}s)` : ''}
          </button>
          <button className="btn btn-ghost" onClick={handleLeave}>
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
