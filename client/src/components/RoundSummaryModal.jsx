import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import {
  NIL_BONUS, BLIND_NIL_BONUS, TEN_TRICK_BONUS,
  BOOK_PENALTY, BOOK_PENALTY_THRESHOLD,
  AFK_TURN_TIMEOUT, AFK_FAST_TIMEOUT,
} from '../constants.js';
import { isSpoilerTeam } from '../modes.js';

export default function RoundSummaryModal() {
  const { state, dispatch } = useGame();
  const socket = useSocket();
  const summary = state.roundSummary;

  const isSinglePlayer = state.players.filter(p => !p.isBot).length <= 1;
  const isAfk = state.afkPlayers[state.playerId];
  const timerDuration = isAfk ? AFK_FAST_TIMEOUT : AFK_TURN_TIMEOUT;
  const [countdown, setCountdown] = useState(isSinglePlayer ? 0 : timerDuration);

  useEffect(() => {
    if (!summary || isSinglePlayer) return;
    setCountdown(timerDuration);
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
  }, [summary, timerDuration, isSinglePlayer]);

  if (!summary) return null;

  // Build dynamic teams
  const teamNums = [...new Set(state.players.map(p => p.team))].sort((a, b) => a - b);
  const teamAnalyses = teamNums.map(teamNum => {
    const teamKey = 'team' + teamNum;
    const teamPlayers = state.players.filter(p => p.team === teamNum);
    const score = summary.teamScores?.[teamKey] ?? 0;
    const total = summary.teamTotals?.[teamKey] ?? 0;
    const books = summary.teamBooks?.[teamKey] ?? 0;
    const spoiler = isSpoilerTeam(state.mode, teamNum);
    return {
      teamNum,
      teamKey,
      analysis: analyzeTeam(teamPlayers, summary, teamKey, spoiler),
      score,
      total,
      books,
      spoiler,
    };
  });

  const handleContinue = () => {
    dispatch({ type: 'CLEAR_ROUND_SUMMARY' });
    socket.emit('ready_for_next_round');
  };

  return (
    <div className="modal-overlay">
      <div className="modal round-summary-modal">
        <h2>Round {summary.roundNumber} Results</h2>

        {teamAnalyses.map((t, i) => (
          <React.Fragment key={t.teamKey}>
            {i > 0 && <div className="summary-divider" />}
            <TeamSummary
              analysis={t.analysis}
              teamLabel={t.spoiler ? 'Spoiler' : `Team ${t.teamNum}`}
              teamClass={t.teamKey}
              score={t.score}
              total={t.total}
              books={t.books}
              spoiler={t.spoiler}
            />
          </React.Fragment>
        ))}

        <button className="btn btn-primary" onClick={handleContinue}>
          Continue {countdown > 0 ? `(${countdown}s)` : ''}
        </button>
      </div>
    </div>
  );
}

function TeamSummary({ analysis, teamLabel, teamClass, score, total, books, spoiler }) {
  const madeOrMissed = analysis.madeBid;
  const scorePositive = typeof score === 'number' && score > 0;

  return (
    <div className={`summary-section summary-${teamClass}`}>
      <div className="summary-header">
        <h3>{teamLabel} &mdash; {analysis.names}</h3>
        <div className={`summary-result ${madeOrMissed ? 'made' : 'set'}`}>
          {score === 'MOONSHOT' ? 'MOONSHOT!' : analysis.allNil ? (madeOrMissed ? 'NIL SUCCESS' : 'NIL FAILED') : (madeOrMissed ? 'MADE' : 'SET')}
        </div>
      </div>

      {/* Player details */}
      <div className="summary-players">
        {analysis.players.map(p => (
          <div key={p.id} className="summary-player-row">
            <span className="summary-player-name">{p.name}</span>
            <span className="summary-player-bid">
              Bid {p.isNil ? (p.isBlindNil ? 'Blind Nil' : 'Nil') : p.bid}
            </span>
            <span className="summary-player-tricks">
              Took {p.tricks}
            </span>
            {p.isNil && (
              <span className={`summary-nil-badge ${p.nilSuccess ? 'nil-success' : 'nil-failed'}`}>
                {p.isBlindNil ? (p.nilSuccess ? 'Blind Nil Made!' : 'Blind Nil Busted!') : (p.nilSuccess ? 'Nil Made!' : 'Nil Busted!')}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Score breakdown */}
      {score !== 'MOONSHOT' && (
        <div className="summary-breakdown">
          {analysis.bidPoints !== 0 && (
            <div className="breakdown-line">
              <span>Bid ({analysis.combinedBid}){spoiler ? ' \u00D72' : ''}</span>
              <span className={analysis.bidPoints > 0 ? 'positive' : 'negative'}>
                {analysis.bidPoints > 0 ? '+' : ''}{analysis.bidPoints}
              </span>
            </div>
          )}
          {analysis.nilPoints.map((np, i) => (
            <div key={i} className="breakdown-line">
              <span>{np.name} {np.isBlindNil ? 'Blind Nil' : 'Nil'}{np.doubled ? ' \u00D72' : ''}</span>
              <span className={np.points > 0 ? 'positive' : 'negative'}>
                {np.points > 0 ? '+' : ''}{np.points}
              </span>
            </div>
          ))}
          {analysis.overtricks > 0 && (
            <div className="breakdown-line">
              <span>Books (+{analysis.overtricks})</span>
              <span className="books">+{analysis.overtricks}</span>
            </div>
          )}
          {analysis.tenTrickBonus && (
            <div className="breakdown-line bonus-line">
              <span>10+ Trick Bonus{spoiler ? ' \u00D72' : ''}</span>
              <span className="positive">+{analysis.tenTrickBonusValue}</span>
            </div>
          )}
          {analysis.bookPenalty > 0 && (
            <div className="breakdown-line penalty-line">
              <span>Book Penalty (10 books)</span>
              <span className="negative">-{analysis.bookPenalty}</span>
            </div>
          )}
          <div className="breakdown-total">
            <span>Round Score</span>
            <span className={scorePositive ? 'positive' : 'negative'}>
              {scorePositive ? '+' : ''}{score}
            </span>
          </div>
        </div>
      )}

      {/* Running total */}
      <div className="summary-total-row">
        <span className="summary-total-label">Total Score</span>
        <span className="summary-total-value">{total}</span>
        <span className="summary-books-count">{books} books</span>
      </div>
    </div>
  );
}

function analyzeTeam(teamPlayers, summary, teamKey, spoiler = false) {
  const names = teamPlayers.map(p => p.name).join(' & ');
  const blindNilSet = new Set(summary.blindNilPlayers || []);
  const multiplier = spoiler ? 2 : 1;
  const players = teamPlayers.map(p => ({
    id: p.id,
    name: p.name,
    bid: summary.bids[p.id],
    tricks: summary.tricksTaken[p.id] || 0,
    isNil: summary.bids[p.id] === 0,
    isBlindNil: blindNilSet.has(p.id),
    nilSuccess: summary.bids[p.id] === 0 && (summary.tricksTaken[p.id] || 0) === 0,
  }));

  const nilPlayers = players.filter(p => p.isNil);
  const nonNilPlayers = players.filter(p => !p.isNil);
  const allNil = nonNilPlayers.length === 0;
  const combinedBid = nonNilPlayers.reduce((s, p) => s + p.bid, 0);
  const nonNilTricks = nonNilPlayers.reduce((s, p) => s + p.tricks, 0);

  // Failed nil tricks help partner make bid
  const failedNilTricks = nilPlayers
    .filter(p => !p.nilSuccess)
    .reduce((s, p) => s + p.tricks, 0);
  const effectiveTricks = nonNilTricks + failedNilTricks;

  const madeBid = allNil
    ? nilPlayers.every(p => p.nilSuccess)
    : effectiveTricks >= combinedBid;

  // Bid points — spoiler gets double
  let bidPoints = 0;
  if (combinedBid > 0) {
    bidPoints = madeBid ? combinedBid * 10 * multiplier : -(combinedBid * 10 * multiplier);
  }

  // Overtricks (books) — NOT doubled
  const overtricks = madeBid && combinedBid > 0 ? effectiveTricks - combinedBid : 0;

  // Nil points — spoiler gets double on make, normal on miss
  const nilPoints = nilPlayers.map(p => {
    const bonus = p.isBlindNil ? BLIND_NIL_BONUS : NIL_BONUS;
    const doubled = spoiler && p.nilSuccess;
    return {
      name: p.name,
      isBlindNil: p.isBlindNil,
      points: p.nilSuccess ? bonus * multiplier : -bonus,
      doubled,
    };
  });

  // 10+ trick bonus: must bid 10+ combined AND make bid — spoiler gets double
  const tenTrickBonus = combinedBid >= 10 && madeBid;
  const tenTrickBonusValue = tenTrickBonus ? TEN_TRICK_BONUS * multiplier : 0;

  // Book penalty — NOT doubled
  const currentBooks = summary.teamBooks?.[teamKey] ?? 0;
  const bookPenalty = overtricks > 0 && currentBooks < overtricks ? BOOK_PENALTY : 0;

  return {
    names,
    players,
    allNil,
    combinedBid,
    madeBid,
    bidPoints,
    overtricks,
    nilPoints,
    tenTrickBonus,
    tenTrickBonusValue,
    bookPenalty,
  };
}
