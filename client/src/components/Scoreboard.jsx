import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { getTricksPerRound, isSpoilerTeam } from '../modes.js';
import { MiniCard } from './TrickHistory.jsx';

export default function Scoreboard() {
  const { state } = useGame();
  const [showHistory, setShowHistory] = useState(false);
  const [expandedRound, setExpandedRound] = useState(null);

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

  const renderTeam = (t) => (
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
  );

  const centerContent = (
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
      {(state.roundHistory.length > 0 || state.completedTricks.length > 0) && (
        <button className="btn btn-tiny" onClick={() => setShowHistory(!showHistory)}>
          History
        </button>
      )}
    </div>
  );

  // 2-team: single row [Team1 | Center | Team2]
  // 3+ teams: center on top, teams row below
  const isTwoTeam = teamStats.length === 2;

  return (
    <div className={`scoreboard ${isTwoTeam ? 'scoreboard-inline' : ''}`}>
      {isTwoTeam ? (
        <>
          {renderTeam(teamStats[0])}
          {centerContent}
          {renderTeam(teamStats[1])}
        </>
      ) : (
        <>
          {centerContent}
          <div className="score-teams-row">
            {teamStats.map(renderTeam)}
          </div>
        </>
      )}

      {showHistory && (
        <HistoryOverlay
          roundHistory={state.roundHistory}
          completedTricks={state.completedTricks}
          roundNumber={state.roundNumber}
          players={state.players}
          teamStats={teamStats}
          expandedRound={expandedRound}
          setExpandedRound={setExpandedRound}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function TrickDrilldown({ tricks, players }) {
  const getName = (id) => {
    const p = players.find(p => p.id === id);
    return p ? p.name : '???';
  };

  return (
    <div className="round-tricks-drilldown">
      {tricks.map(ct => (
        <div key={ct.trickNumber} className="drilldown-trick">
          <div className="drilldown-trick-header">
            <span className="drilldown-trick-num">Trick {ct.trickNumber}</span>
            <span className="drilldown-trick-won">Won by {getName(ct.winnerId)}</span>
          </div>
          <div className="drilldown-plays">
            {ct.trick.map((play, j) => (
              <span
                key={j}
                className={`drilldown-play ${play.playerId === ct.winnerId ? 'winner' : ''} ${play.playerId === ct.leaderId ? 'leader' : ''}`}
              >
                <span className="drilldown-name">{getName(play.playerId)}</span>
                <MiniCard card={play.card} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryOverlay({ roundHistory, completedTricks, roundNumber, players, teamStats, expandedRound, setExpandedRound, onClose }) {
  const toggleRound = (key) => setExpandedRound(expandedRound === key ? null : key);
  const colCount = teamStats.length + 1;

  return (
    <div className="score-history-overlay" onClick={onClose}>
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
            {roundHistory.map((r, i) => (
              <React.Fragment key={i}>
                <tr
                  className={`history-row ${r.completedTricks?.length ? 'expandable' : ''} ${expandedRound === i ? 'expanded' : ''}`}
                  onClick={() => r.completedTricks?.length && toggleRound(i)}
                >
                  <td>
                    {r.completedTricks?.length > 0 && (
                      <span className="expand-arrow">{expandedRound === i ? '\u25BC' : '\u25B6'}</span>
                    )}
                    {r.roundNumber}
                  </td>
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
                {expandedRound === i && r.completedTricks?.length > 0 && (
                  <tr className="drilldown-row">
                    <td colSpan={colCount}>
                      <TrickDrilldown tricks={r.completedTricks} players={players} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {completedTricks.length > 0 && (
              <React.Fragment>
                <tr
                  className={`history-row expandable ${expandedRound === 'current' ? 'expanded' : ''}`}
                  onClick={() => toggleRound('current')}
                >
                  <td>
                    <span className="expand-arrow">{expandedRound === 'current' ? '\u25BC' : '\u25B6'}</span>
                    {roundNumber}
                  </td>
                  {teamStats.map(t => (
                    <td key={t.teamKey} className="in-progress-cell">in progress</td>
                  ))}
                </tr>
                {expandedRound === 'current' && (
                  <tr className="drilldown-row">
                    <td colSpan={colCount}>
                      <TrickDrilldown tricks={completedTricks} players={players} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )}
          </tbody>
        </table>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
