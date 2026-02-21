import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { getTricksPerRound, isSpoilerTeam } from '../modes.js';

export default function Scoreboard() {
  const { state } = useGame();
  const [showHistory, setShowHistory] = useState(false);

  const playerCount = state.playerCount || state.players.length || 4;
  const tricksPerRound = getTricksPerRound(state.mode);

  // Build dynamic teams array
  const teamNums = [...new Set(state.players.map(p => p.team))].sort((a, b) => a - b);
  const teams = teamNums.map(teamNum => {
    const teamKey = 'team' + teamNum;
    const teamPlayers = state.players.filter(p => p.team === teamNum);
    const names = teamPlayers.map(p => p.name).join(' & ');
    const spoiler = isSpoilerTeam(state.mode, teamNum);
    return { teamNum, teamKey, teamPlayers, names, spoiler };
  });

  const allBidsIn = Object.keys(state.bids).length === playerCount;

  // Per-team bid and trick totals
  const teamStats = teams.map(t => {
    const bid = allBidsIn
      ? t.teamPlayers.reduce((sum, p) => sum + (state.bids[p.id] || 0), 0)
      : null;
    const tricks = t.teamPlayers.reduce((sum, p) => sum + (state.tricksTaken[p.id] || 0), 0);
    return { ...t, bid, tricks };
  });

  // Books remaining (free tricks)
  const totalBid = allBidsIn ? teamStats.reduce((s, t) => s + t.bid, 0) : null;
  const totalTricks = allBidsIn ? teamStats.reduce((s, t) => s + t.tricks, 0) : null;
  const booksRemaining = allBidsIn ? tricksPerRound - totalBid : null;
  const tricksLeft = allBidsIn ? tricksPerRound - totalTricks : null;

  // Books mood
  let booksMood = '';
  if (booksRemaining !== null) {
    if (booksRemaining <= 1) booksMood = 'books-tight';
    else if (booksRemaining === 2) booksMood = 'books-contested';
    else if (booksRemaining >= 4) booksMood = 'books-loose';
  }

  return (
    <div className="scoreboard">
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
        {allBidsIn && tricksLeft !== null && tricksLeft < tricksPerRound && (
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

      <div className="score-teams-row">
        {teamStats.map(t => (
          <div key={t.teamKey} className="score-team">
            <div className="score-team-name">
              {t.names}{t.spoiler ? ' (2x)' : ''}
            </div>
            <div className="score-value">{state.scores[t.teamKey] ?? 0}</div>
            <div className="score-books">{state.books[t.teamKey] ?? 0} books</div>
            {allBidsIn && (
              <div className="score-bid-tracker">
                Bid {t.bid} &middot; Took {t.tricks}/{t.bid}
              </div>
            )}
          </div>
        ))}
      </div>

      {showHistory && (
        <div className="score-history-overlay" onClick={() => setShowHistory(false)}>
          <div className="score-history" onClick={e => e.stopPropagation()}>
            <h3>Round History</h3>
            <table>
              <thead>
                <tr>
                  <th>Round</th>
                  {teamStats.map(t => (
                    <th key={t.teamKey}>{t.names}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.roundHistory.map((r, i) => (
                  <tr key={i}>
                    <td>{r.roundNumber}</td>
                    {teamStats.map(t => {
                      const score = r.teamScores?.[t.teamKey] ?? 0;
                      const total = r.teamTotals?.[t.teamKey] ?? 0;
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
            <button className="btn btn-secondary" onClick={() => setShowHistory(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
