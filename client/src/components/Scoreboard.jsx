import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';

export default function Scoreboard() {
  const { state } = useGame();
  const [showHistory, setShowHistory] = useState(false);

  const team1Players = state.players.filter(p => p.team === 1);
  const team2Players = state.players.filter(p => p.team === 2);
  const team1Names = team1Players.map(p => p.name).join(' & ');
  const team2Names = team2Players.map(p => p.name).join(' & ');

  const allBidsIn = Object.keys(state.bids).length === 4;

  // Team bid totals
  const team1Bid = allBidsIn
    ? team1Players.reduce((sum, p) => sum + (state.bids[p.id] || 0), 0)
    : null;
  const team2Bid = allBidsIn
    ? team2Players.reduce((sum, p) => sum + (state.bids[p.id] || 0), 0)
    : null;

  // Team tricks taken
  const team1Tricks = team1Players.reduce((sum, p) => sum + (state.tricksTaken[p.id] || 0), 0);
  const team2Tricks = team2Players.reduce((sum, p) => sum + (state.tricksTaken[p.id] || 0), 0);

  // Books remaining (free tricks)
  const totalBid = allBidsIn ? team1Bid + team2Bid : null;
  const booksRemaining = allBidsIn ? 13 - totalBid : null;
  const tricksLeft = allBidsIn ? 13 - team1Tricks - team2Tricks : null;

  // Books mood
  let booksMood = '';
  if (booksRemaining !== null) {
    if (booksRemaining <= 1) booksMood = 'books-tight';
    else if (booksRemaining === 2) booksMood = 'books-contested';
    else if (booksRemaining >= 4) booksMood = 'books-loose';
  }

  return (
    <div className="scoreboard">
      <div className="score-team">
        <div className="score-team-name">{team1Names}</div>
        <div className="score-value">{state.scores.team1}</div>
        <div className="score-books">{state.books.team1} bags</div>
        {allBidsIn && (
          <div className="score-bid-tracker">
            Bid {team1Bid} &middot; Took {team1Tricks}/{team1Bid}
          </div>
        )}
      </div>
      <div className="score-center">
        <div className="round-label">Round {state.roundNumber}</div>
        {allBidsIn && (
          <div className={`books-remaining-banner ${booksMood}`}>
            <span className="books-remaining-number">{booksRemaining}</span>
            <span className="books-remaining-label">
              {booksRemaining === 1 ? 'book' : 'books'} up for grabs
            </span>
          </div>
        )}
        {allBidsIn && tricksLeft !== null && tricksLeft < 13 && (
          <div className="score-remaining">
            {tricksLeft} tricks left
          </div>
        )}
        {state.roundHistory.length > 0 && (
          <button className="btn btn-tiny" onClick={() => setShowHistory(!showHistory)}>
            History
          </button>
        )}
      </div>
      <div className="score-team">
        <div className="score-team-name">{team2Names}</div>
        <div className="score-value">{state.scores.team2}</div>
        <div className="score-books">{state.books.team2} bags</div>
        {allBidsIn && (
          <div className="score-bid-tracker">
            Bid {team2Bid} &middot; Took {team2Tricks}/{team2Bid}
          </div>
        )}
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
