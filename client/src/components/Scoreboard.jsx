import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { getTricksPerRound } from '../modes.js';

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
    return { teamNum, teamKey, teamPlayers, names };
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
      {teamStats.length > 0 && (
        <div className="score-team">
          <div className="score-team-name">{teamStats[0].names}</div>
          <div className="score-value">{state.scores[teamStats[0].teamKey] ?? 0}</div>
          <div className="score-books">{state.books[teamStats[0].teamKey] ?? 0} books</div>
          {allBidsIn && (
            <div className="score-bid-tracker">
              Bid {teamStats[0].bid} &middot; Took {teamStats[0].tricks}/{teamStats[0].bid}
            </div>
          )}
        </div>
      )}

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
        {/* Extra teams (3+) shown as compact rows in center */}
        {teamStats.length > 2 && (
          <div className="score-extra-teams">
            {teamStats.slice(2).map(t => (
              <div key={t.teamKey} className="score-extra-team">
                <span className="score-extra-name">{t.names}</span>
                <span className="score-extra-value">{state.scores[t.teamKey] ?? 0}</span>
              </div>
            ))}
          </div>
        )}
        {state.roundHistory.length > 0 && (
          <button className="btn btn-tiny" onClick={() => setShowHistory(!showHistory)}>
            History
          </button>
        )}
      </div>

      {teamStats.length > 1 && (
        <div className="score-team">
          <div className="score-team-name">{teamStats[1].names}</div>
          <div className="score-value">{state.scores[teamStats[1].teamKey] ?? 0}</div>
          <div className="score-books">{state.books[teamStats[1].teamKey] ?? 0} books</div>
          {allBidsIn && (
            <div className="score-bid-tracker">
              Bid {teamStats[1].bid} &middot; Took {teamStats[1].tricks}/{teamStats[1].bid}
            </div>
          )}
        </div>
      )}

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
                      const score = r.teamScores?.[t.teamKey] ?? r[`${t.teamKey.replace('team', 'team')}Score`] ?? 0;
                      const total = r.teamTotals?.[t.teamKey] ?? r[`${t.teamKey.replace('team', 'team')}Total`] ?? 0;
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
