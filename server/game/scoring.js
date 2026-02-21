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

    // Score nil bids individually
    for (const pid of nilPlayers) {
      const bonus = blindNilPlayers.has(pid) ? BLIND_NIL_BONUS : NIL_BONUS;
      if (tricksTaken[pid] === 0) {
        // Nil made — spoiler gets double bonus
        roundScore += bonus * multiplier;
      } else {
        // Nil failed — spoiler does NOT get double penalty (too easy to set a solo player)
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
        // Bid made — spoiler gets double bid points, but overtricks are normal
        roundScore += combinedBid * 10 * multiplier;
        const overtricks = effectiveTricks - combinedBid;
        roundScore += overtricks;
        books += overtricks;
      } else {
        // Bid missed — spoiler gets double penalty
        roundScore -= combinedBid * 10 * multiplier;
      }
    } else if (combinedBid === 0 && failedNilTricks > 0) {
      // All players on team bid nil and at least one failed - those tricks are books
      books += failedNilTricks;
    }

    // 10+ trick bonus (only if setting is enabled) — spoiler gets double
    if (settings.tenBidBonus) {
      const totalTeamTricks = playerIds.reduce((sum, id) => sum + tricksTaken[id], 0);
      if (totalTeamTricks >= 10 && combinedBid > 0 && effectiveTricks >= combinedBid) {
        roundScore += TEN_TRICK_BONUS * multiplier;
      }
    }

    // Book penalty — NOT doubled for spoiler
    if (books >= bookThreshold) {
      const penaltyCount = Math.floor(books / bookThreshold);
      roundScore -= penaltyCount * BOOK_PENALTY;
      books = books % bookThreshold;
    }

    result[teamKey] = {
      roundScore,
      newTotal: (currentScores[teamKey] || 0) + roundScore,
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
