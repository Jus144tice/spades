import {
  NIL_BONUS,
  BLIND_NIL_BONUS,
  BOOK_PENALTY_THRESHOLD,
  BOOK_PENALTY,
  TEN_TRICK_BONUS,
  WINNING_SCORE,
} from './constants.js';

export function scoreRound(players, bids, tricksTaken, currentScores, currentBooks, settings = {}, blindNilPlayers = new Set()) {
  // players is the ordered array; teams: 0+2 = team1, 1+3 = team2
  const teams = {
    team1: [players[0].id, players[2].id],
    team2: [players[1].id, players[3].id],
  };

  const bagThreshold = settings.bagThreshold || BOOK_PENALTY_THRESHOLD;
  const result = {};

  for (const [teamKey, playerIds] of Object.entries(teams)) {
    let roundScore = 0;
    let books = currentBooks[teamKey];

    const nilPlayers = playerIds.filter(id => bids[id] === 0);
    const nonNilPlayers = playerIds.filter(id => bids[id] > 0);
    let failedNilTricks = 0;

    // Score nil bids individually
    for (const pid of nilPlayers) {
      const bonus = blindNilPlayers.has(pid) ? BLIND_NIL_BONUS : NIL_BONUS;
      if (tricksTaken[pid] === 0) {
        roundScore += bonus;
      } else {
        roundScore -= bonus;
        // Failed nil tricks count toward partner's bid, NOT auto-booked
        failedNilTricks += tricksTaken[pid];
      }
    }

    // Score non-nil combined bid
    // Failed nil tricks count toward the partner making their bid
    const combinedBid = nonNilPlayers.reduce((sum, id) => sum + bids[id], 0);
    const partnerTricks = nonNilPlayers.reduce((sum, id) => sum + tricksTaken[id], 0);
    const effectiveTricks = partnerTricks + failedNilTricks;

    if (combinedBid > 0) {
      if (effectiveTricks >= combinedBid) {
        roundScore += combinedBid * 10;
        const overtricks = effectiveTricks - combinedBid;
        roundScore += overtricks;
        books += overtricks;
      } else {
        roundScore -= combinedBid * 10;
      }
    } else if (combinedBid === 0 && failedNilTricks > 0) {
      // Both players bid nil and at least one failed - those tricks are books
      books += failedNilTricks;
    }

    // 10+ trick bonus (only if setting is enabled)
    if (settings.tenBidBonus) {
      const totalTeamTricks = playerIds.reduce((sum, id) => sum + tricksTaken[id], 0);
      if (totalTeamTricks >= 10 && combinedBid > 0 && effectiveTricks >= combinedBid) {
        roundScore += TEN_TRICK_BONUS;
      }
    }

    // Book penalty
    if (books >= bagThreshold) {
      const penaltyCount = Math.floor(books / bagThreshold);
      roundScore -= penaltyCount * BOOK_PENALTY;
      books = books % bagThreshold;
    }

    result[teamKey] = {
      roundScore,
      newTotal: currentScores[teamKey] + roundScore,
      books,
    };
  }

  return result;
}

export function checkWinner(scores, winTarget) {
  const target = winTarget || WINNING_SCORE;
  const t1 = scores.team1 >= target;
  const t2 = scores.team2 >= target;

  if (t1 && t2) {
    if (scores.team1 === scores.team2) return null; // tie - play another round
    return scores.team1 > scores.team2 ? 'team1' : 'team2';
  }
  if (t1) return 'team1';
  if (t2) return 'team2';
  return null;
}
