import React from 'react';
import { useGame } from '../context/GameContext.jsx';

export default function RoundSummaryModal() {
  const { state, dispatch } = useGame();
  const summary = state.roundSummary;
  if (!summary) return null;

  const team1Names = state.players.filter(p => p.team === 1).map(p => p.name);
  const team2Names = state.players.filter(p => p.team === 2).map(p => p.name);

  return (
    <div className="modal-overlay" onClick={() => dispatch({ type: 'CLEAR_ROUND_SUMMARY' })}>
      <div className="modal round-summary-modal" onClick={e => e.stopPropagation()}>
        <h2>Round {summary.roundNumber} Complete</h2>

        <div className="summary-section">
          <h3>Team 1 - {team1Names.join(' & ')}</h3>
          <div className="summary-details">
            {state.players.filter(p => p.team === 1).map(p => (
              <div key={p.id} className="summary-player">
                {p.name}: Bid {summary.bids[p.id] === 0 ? 'Nil' : summary.bids[p.id]}, Took {summary.tricksTaken[p.id]}
              </div>
            ))}
            <div className="summary-score">
              Round: {summary.team1Score > 0 ? '+' : ''}{summary.team1Score} | Total: {summary.team1Total} | Books: {summary.team1Books}
            </div>
          </div>
        </div>

        <div className="summary-section">
          <h3>Team 2 - {team2Names.join(' & ')}</h3>
          <div className="summary-details">
            {state.players.filter(p => p.team === 2).map(p => (
              <div key={p.id} className="summary-player">
                {p.name}: Bid {summary.bids[p.id] === 0 ? 'Nil' : summary.bids[p.id]}, Took {summary.tricksTaken[p.id]}
              </div>
            ))}
            <div className="summary-score">
              Round: {summary.team2Score > 0 ? '+' : ''}{summary.team2Score} | Total: {summary.team2Total} | Books: {summary.team2Books}
            </div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => dispatch({ type: 'CLEAR_ROUND_SUMMARY' })}>
          Continue
        </button>
      </div>
    </div>
  );
}
