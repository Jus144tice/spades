import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';

export default function Scoreboard() {
  const { state } = useGame();
  const [showHistory, setShowHistory] = useState(false);

  const team1Names = state.players.filter(p => p.team === 1).map(p => p.name).join(' & ');
  const team2Names = state.players.filter(p => p.team === 2).map(p => p.name).join(' & ');

  return (
    <div className="scoreboard">
      <div className="score-team">
        <div className="score-team-name">{team1Names}</div>
        <div className="score-value">{state.scores.team1}</div>
        <div className="score-books">{state.books.team1} books</div>
      </div>
      <div className="score-center">
        <div className="round-label">Round {state.roundNumber}</div>
        {state.roundHistory.length > 0 && (
          <button className="btn btn-tiny" onClick={() => setShowHistory(!showHistory)}>
            History
          </button>
        )}
      </div>
      <div className="score-team">
        <div className="score-team-name">{team2Names}</div>
        <div className="score-value">{state.scores.team2}</div>
        <div className="score-books">{state.books.team2} books</div>
      </div>

      {showHistory && (
        <div className="score-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="score-history" onClick={e => e.stopPropagation()}>
            <h3>Round History</h3>
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  <th>{team1Names}</th>
                  <th>{team2Names}</th>
                </tr>
              </thead>
              <tbody>
                {state.roundHistory.map((r, i) => (
                  <tr key={i}>
                    <td>{r.roundNumber}</td>
                    <td>{r.team1Score > 0 ? '+' : ''}{r.team1Score} ({r.team1Total})</td>
                    <td>{r.team2Score > 0 ? '+' : ''}{r.team2Score} ({r.team2Total})</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" onClick={() => setShowHistory(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
