import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import { isSpoilerTeam } from '../modes.js';

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

  // Build dynamic teams
  const teamNums = [...new Set(state.players.map(p => p.team))].sort((a, b) => a - b);
  const teams = teamNums.map(teamNum => {
    const teamKey = 'team' + teamNum;
    const teamPlayers = state.players.filter(p => p.team === teamNum);
    const names = teamPlayers.map(p => p.name).join(' & ');
    const spoiler = isSpoilerTeam(state.mode, teamNum);
    return { teamNum, teamKey, names, spoiler };
  });

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
          {teams.map(t => (
            <div key={t.teamKey} className="final-score-row">
              <span>{t.names}{t.spoiler ? ' (Spoiler)' : ''}</span>
              <span className="final-score-value">{data.finalScores?.[t.teamKey] ?? data.finalScores?.[`team${t.teamNum}`] ?? 0}</span>
            </div>
          ))}
        </div>

        {data.roundHistory && data.roundHistory.length > 0 && (
          <div className="round-history-table">
            <h3>Round by Round</h3>
            <table>
              <thead>
                <tr>
                  <th>Rd</th>
                  {teams.map(t => (
                    <th key={t.teamKey}>{t.names}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.roundHistory.map((r, i) => (
                  <tr key={i}>
                    <td>{r.roundNumber}</td>
                    {teams.map(t => {
                      const score = r.teamScores?.[t.teamKey] ?? r[`team${t.teamNum}Score`] ?? 0;
                      const total = r.teamTotals?.[t.teamKey] ?? r[`team${t.teamNum}Total`] ?? 0;
                      return (
                        <td key={t.teamKey}>
                          {score > 0 ? '+' : ''}{score === 'MOONSHOT' ? 'MOONSHOT' : score} ({total})
                        </td>
                      );
                    })}
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
