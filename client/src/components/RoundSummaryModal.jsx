import React, { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import {
  NIL_BONUS, BLIND_NIL_BONUS, TEN_TRICK_BONUS,
  BOOK_PENALTY, BOOK_PENALTY_THRESHOLD,
  AFK_TURN_TIMEOUT, AFK_FAST_TIMEOUT,
} from '../constants.js';

export default function RoundSummaryModal() {
  const { state, dispatch } = useGame();
  const socket = useSocket();
  const summary = state.roundSummary;

  const isAfk = state.afkPlayers[state.playerId];
  const timerDuration = isAfk ? AFK_FAST_TIMEOUT : AFK_TURN_TIMEOUT;
  const [countdown, setCountdown] = useState(timerDuration);

  useEffect(() => {
    if (!summary) return;
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
  }, [summary, timerDuration]);

  if (!summary) return null;

  const team1Players = state.players.filter(p => p.team === 1);
  const team2Players = state.players.filter(p => p.team === 2);

  const team1Analysis = analyzeTeam(team1Players, summary, 'team1');
  const team2Analysis = analyzeTeam(team2Players, summary, 'team2');

  const handleContinue = () => {
    dispatch({ type: 'CLEAR_ROUND_SUMMARY' });
    socket.emit('ready_for_next_round');
  };

  return (
    <div className="modal-overlay">
      <div className="modal round-summary-modal">
        <h2>Round {summary.roundNumber} Results</h2>

        <TeamSummary
          analysis={team1Analysis}
          teamLabel="Team 1"
          teamClass="team1"
          score={summary.team1Score}
          total={summary.team1Total}
          books={summary.team1Books}
        />

        <div className="summary-divider" />

        <TeamSummary
          analysis={team2Analysis}
          teamLabel="Team 2"
          teamClass="team2"
          score={summary.team2Score}
          total={summary.team2Total}
          books={summary.team2Books}
        />

        <button className="btn btn-primary" onClick={handleContinue}>
          Continue {countdown > 0 ? `(${countdown}s)` : ''}
        </button>
      </div>
    </div>
  );
}

function TeamSummary({ analysis, teamLabel, teamClass, score, total, books }) {
  const madeOrMissed = analysis.madeBid;
  const scorePositive = score > 0;

  return (
    <div className={`summary-section summary-${teamClass}`}>
      <div className="summary-header">
        <h3>{teamLabel} &mdash; {analysis.names}</h3>
        <div className={`summary-result ${madeOrMissed ? 'made' : 'set'}`}>
          {analysis.allNil ? (madeOrMissed ? 'NIL SUCCESS' : 'NIL FAILED') : (madeOrMissed ? 'MADE' : 'SET')}
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
      <div className="summary-breakdown">
        {analysis.bidPoints !== 0 && (
          <div className="breakdown-line">
            <span>Bid ({analysis.combinedBid})</span>
            <span className={analysis.bidPoints > 0 ? 'positive' : 'negative'}>
              {analysis.bidPoints > 0 ? '+' : ''}{analysis.bidPoints}
            </span>
          </div>
        )}
        {analysis.nilPoints.map((np, i) => (
          <div key={i} className="breakdown-line">
            <span>{np.name} {np.isBlindNil ? 'Blind Nil' : 'Nil'}</span>
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
            <span>10+ Trick Bonus</span>
            <span className="positive">+{TEN_TRICK_BONUS}</span>
          </div>
        )}
        {analysis.bagPenalty > 0 && (
          <div className="breakdown-line penalty-line">
            <span>Book Penalty (10 books)</span>
            <span className="negative">-{analysis.bagPenalty}</span>
          </div>
        )}
        <div className="breakdown-total">
          <span>Round Score</span>
          <span className={scorePositive ? 'positive' : 'negative'}>
            {scorePositive ? '+' : ''}{score}
          </span>
        </div>
      </div>

      {/* Running total */}
      <div className="summary-total-row">
        <span className="summary-total-label">Total Score</span>
        <span className="summary-total-value">{total}</span>
        <span className="summary-books-count">{books} books</span>
      </div>
    </div>
  );
}

function analyzeTeam(teamPlayers, summary, teamKey) {
  const names = teamPlayers.map(p => p.name).join(' & ');
  const blindNilSet = new Set(summary.blindNilPlayers || []);
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

  // Bid points
  let bidPoints = 0;
  if (combinedBid > 0) {
    bidPoints = madeBid ? combinedBid * 10 : -(combinedBid * 10);
  }

  // Overtricks (books)
  const overtricks = madeBid && combinedBid > 0 ? effectiveTricks - combinedBid : 0;

  // Nil points
  const nilPoints = nilPlayers.map(p => {
    const bonus = p.isBlindNil ? BLIND_NIL_BONUS : NIL_BONUS;
    return {
      name: p.name,
      isBlindNil: p.isBlindNil,
      points: p.nilSuccess ? bonus : -bonus,
    };
  });

  // 10+ trick bonus
  const totalTeamTricks = players.reduce((s, p) => s + p.tricks, 0);
  const tenTrickBonus = totalTeamTricks >= 10 && combinedBid > 0 && madeBid;

  // Book penalty
  // We check the books AFTER adding overtricks. The summary already has post-penalty books.
  // We can infer penalty if score has a -100 component. Simpler: check current books from summary.
  const prevBooks = summary[`${teamKey}Books`];
  // Note: bagPenalty is already factored into the round score. We figure out if it happened.
  const bagPenalty = computeBagPenalty(summary, teamKey, overtricks);

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
    bagPenalty,
  };
}

function computeBagPenalty(summary, teamKey, overtricks) {
  // The round score should equal: bidPoints + nilPoints + overtricks + tenTrickBonus - bagPenalty
  // We can back-calculate if there was a book penalty by checking if the reported score
  // is less than expected. But it's simpler to just check: the score in the summary
  // already includes the penalty. We'll just show it if the books wrapped around.
  // Since books shown are post-penalty, if books < overtricks and overtricks > 0, penalty happened.
  const currentBooks = summary[`${teamKey}Books`];
  if (overtricks > 0 && currentBooks < overtricks) {
    // Books wrapped around - penalty was applied
    return BOOK_PENALTY;
  }
  return 0;
}
