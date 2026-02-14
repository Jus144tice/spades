import React from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function GameOverModal() {
  const socket = useSocket();
  const { state } = useGame();
  const data = state.gameOverData;
  if (!data) return null;

  const team1Names = state.players.filter(p => p.team === 1).map(p => p.name).join(' & ');
  const team2Names = state.players.filter(p => p.team === 2).map(p => p.name).join(' & ');

  const handleReturn = () => {
    socket.emit('return_to_lobby');
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

        <button className="btn btn-primary" onClick={handleReturn}>
          Return to Lobby
        </button>
      </div>
    </div>
  );
}
