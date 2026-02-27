import {
  NIL_BONUS,
  BLIND_NIL_BONUS,
  BOOK_PENALTY_THRESHOLD,
  BOOK_PENALTY,
  TEN_TRICK_BONUS,
  WINNING_SCORE,
} from './constants.js';
import { getTeamKeys } from './modeHelpers.js';

export function scoreRound(players, bids, tricksTaken, currentScores, currentBooks, settings = {}, blindNilPlayers = new Set(), mode, teamLookup) {
  // Determine teams: use teamLookup if provided, otherwise fallback to classic 4-player
  let teamsByKey;
  if (teamLookup) {
    teamsByKey = teamLookup.teamsByKey;
  } else {
    teamsByKey = {
      team1: [players[0].id, players[2].id],
      team2: [players[1].id, players[3].id],
    };
  }

  const bookThreshold = settings.bookThreshold || BOOK_PENALTY_THRESHOLD;

  // Build spoiler lookup from mode config
  const spoilerTeams = new Set();
  if (mode && mode.teams) {
    for (const tc of mode.teams) {
      if (tc.spoiler) spoilerTeams.add(tc.id);
    }
  }

  const result = {};

  for (const [teamKey, playerIds] of Object.entries(teamsByKey)) {
    let roundScore = 0;
    let books = currentBooks[teamKey] || 0;
    const isSpoiler = spoilerTeams.has(teamKey);
    // Spoiler scoring: bids and bonuses are doubled
    const multiplier = isSpoiler ? 2 : 1;

    const nilPlayers = playerIds.filter(id => bids[id] === 0);
    const nonNilPlayers = playerIds.filter(id => bids[id] > 0);
    let failedNilTricks = 0;
    let roundOvertricks = 0; // tracks this round's book-contributing tricks

    // Score nil bids individually
    for (const pid of nilPlayers) {
      const bonus = blindNilPlayers.has(pid) ? BLIND_NIL_BONUS : NIL_BONUS;
      if (tricksTaken[pid] === 0) {
        // Nil made — spoiler gets double bonus
        roundScore += bonus * multiplier;
      } else {
        // Nil failed — spoiler gets NO penalty (solo player, no partner to protect nil)
        if (!isSpoiler) roundScore -= bonus;
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
        // Bid made — spoiler gets double bid points, but overtricks are normal
        roundScore += combinedBid * 10 * multiplier;
        const overtricks = effectiveTricks - combinedBid;
        roundScore += overtricks;
        books += overtricks;
        roundOvertricks += overtricks;
      } else {
        // Bid missed — spoiler gets double penalty
        roundScore -= combinedBid * 10 * multiplier;
      }
    } else if (combinedBid === 0 && failedNilTricks > 0) {
      // All players on team bid nil and at least one failed - those tricks are books
      roundScore += failedNilTricks;
      books += failedNilTricks;
      roundOvertricks += failedNilTricks;
    }

    // 10+ trick bonus: must bid 10+ combined AND make bid — spoiler gets double
    if (settings.tenBidBonus) {
      if (combinedBid >= 10 && effectiveTricks >= combinedBid) {
        roundScore += TEN_TRICK_BONUS * multiplier;
      }
    }

    // Book penalty — NOT doubled for spoiler
    if (books >= bookThreshold) {
      const penaltyCount = Math.floor(books / bookThreshold);
      roundScore -= penaltyCount * BOOK_PENALTY;
      books = books % bookThreshold;
    }

    // Ones-digit convention: the ones digit of the total score always
    // represents the book count, even when the score is negative.
    //   53 = base  50 + 3 books  (base 50 is in the tens digits)
    //  -53 = base -50 + 3 books  (-(|base| + books), NOT -50 + 3 = -47)
    //
    // Internally, books are always added as +1.  The stored total uses a
    // display adjustment so that both the ones digit AND the tens digits
    // are correct.  raw - 2*books converts from raw (base + books) to
    // display -(|base| + books) for negative totals.
    const oldScore = currentScores[teamKey] || 0;
    const oldBooks = currentBooks[teamKey] || 0;
    // Reverse the display adjustment on the previous total to recover the
    // raw (books-always-positive) score for clean arithmetic.
    const rawOldScore = oldScore < 0 && oldBooks > 0
      ? oldScore + 2 * oldBooks : oldScore;
    const rawTotal = rawOldScore + roundScore;
    // Apply display adjustment for negative totals with books.
    const newTotal = rawTotal < 0 && books > 0
      ? rawTotal - 2 * books : rawTotal;

    // Apply the same ones-digit convention to the round score so the user
    // sees consistent values (e.g. -73 not -67 for -70 base + 3 books).
    const displayRoundScore = roundScore < 0 && roundOvertricks > 0
      ? roundScore - 2 * roundOvertricks : roundScore;

    result[teamKey] = {
      roundScore: displayRoundScore,
      newTotal,
      books,
      isSpoiler,
    };
  }

  return result;
}

export function checkWinner(scores, winTarget, mode) {
  const target = winTarget || WINNING_SCORE;

  // Collect all teams that have reached the target
  const teamKeys = mode ? getTeamKeys(mode) : Object.keys(scores);
  const qualifiers = teamKeys.filter(tk => (scores[tk] || 0) >= target);

  if (qualifiers.length === 0) return null;
  if (qualifiers.length === 1) return qualifiers[0];

  // Multiple teams above target — highest score wins; tie = play another round
  qualifiers.sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
  if (scores[qualifiers[0]] === scores[qualifiers[1]]) return null;
  return qualifiers[0];
}
