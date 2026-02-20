import { RANK_VALUE } from '../game/constants.js';

export function botBid(hand, partnerBid, opponentBids, gameState) {
  const spades = hand.filter(c => c.suit === 'S');
  const hearts = hand.filter(c => c.suit === 'H');
  const diamonds = hand.filter(c => c.suit === 'D');
  const clubs = hand.filter(c => c.suit === 'C');
  const suits = { H: hearts, D: diamonds, C: clubs };

  const sortedSpades = [...spades].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

  // Nil evaluation (do this first)
  if (evaluateNil(hand, sortedSpades, spades, suits, partnerBid)) return 0;

  let tricks = 0;

  // Count spade tricks
  const spadeCount = spades.length;
  for (let i = 0; i < sortedSpades.length; i++) {
    const val = RANK_VALUE[sortedSpades[i].rank];
    if (val === 14) {
      tricks += 1;
    } else if (val === 13) {
      tricks += 0.9;
    } else if (val === 12) {
      if (i >= 2 || spadeCount >= 3) tricks += 0.7;
      else tricks += 0.3;
    } else if (val === 11) {
      if (spadeCount >= 4) tricks += 0.5;
      else if (spadeCount >= 3 && i >= 2) tricks += 0.3;
    } else if (val === 10 && spadeCount >= 5) {
      tricks += 0.3;
    }
  }

  if (spadeCount >= 5) tricks += (spadeCount - 4) * 0.4;

  // Count off-suit tricks
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    const topVal = RANK_VALUE[sorted[0].rank];
    const len = sorted.length;

    if (topVal === 14) {
      tricks += 1;
      if (len >= 2 && RANK_VALUE[sorted[1].rank] === 13) {
        tricks += 0.8;
        if (len >= 3 && RANK_VALUE[sorted[2].rank] === 12) {
          tricks += 0.5;
        }
      }
    } else if (topVal === 13) {
      if (len === 1) tricks += 0.3;
      else if (len === 2) tricks += 0.4;
      else tricks += 0.5;
    } else if (topVal === 12 && len >= 3) {
      tricks += 0.2;
    }
  }

  // Void/short suit ruffing potential
  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0 && spadeCount >= 1) {
      tricks += Math.min(spadeCount - countHighSpades(sortedSpades), 1.0);
    } else if (suitCards.length === 1 && spadeCount >= 2) {
      tricks += 0.5;
    } else if (suitCards.length === 2 && spadeCount >= 3) {
      tricks += 0.2;
    }
  }

  let bid = Math.round(tricks);

  // If partner bid nil, we need to cover
  if (partnerBid === 0) {
    bid = Math.max(bid, 3);
    bid = Math.min(13, bid + 1);
  }

  // Trim if combined team bid is too aggressive
  if (partnerBid !== undefined && partnerBid !== null && partnerBid > 0) {
    const combinedBid = bid + partnerBid;
    if (combinedBid > 10) {
      bid = Math.max(1, bid - 1);
    }
  }

  return Math.max(1, Math.min(13, bid));
}

/**
 * Evaluate whether the bot should bid blind nil.
 * Purely situational — does NOT look at the hand.
 * Only the second bidder on the team should consider blind nil.
 */
export function evaluateBlindNil(gameState, botId) {
  const { players, bids, scores, settings, roundNumber } = gameState;
  if (!settings.blindNil) return false;

  // Never blind nil in round 1 — no score context
  if (roundNumber <= 1) return false;

  const botIndex = players.findIndex(p => p.id === botId);
  const partnerIndex = (botIndex + 2) % 4;
  const partnerId = players[partnerIndex].id;
  const partnerBid = bids[partnerId];

  // Only as second bidder on the team (partner must have bid already)
  if (partnerBid === undefined || partnerBid === null) return false;
  if (partnerBid === 0) return false;   // Never if partner bid nil
  if (partnerBid < 4) return false;     // Partner must be able to cover

  const team = players[botIndex].team;
  const teamKey = team === 1 ? 'team1' : 'team2';
  const oppKey = team === 1 ? 'team2' : 'team1';
  const ourScore = scores[teamKey];
  const oppScore = scores[oppKey];
  const winTarget = settings.winTarget || 500;

  const deficit = oppScore - ourScore;
  const oppProximity = winTarget - oppScore;

  if (deficit < 150 && oppProximity > 200) return false;

  let probability = 0;
  if (deficit >= 300 && oppProximity <= 100) probability = 0.35;
  else if (deficit >= 300) probability = 0.20;
  else if (deficit >= 200 && oppProximity <= 150) probability = 0.18;
  else if (deficit >= 200) probability = 0.12;
  else if (deficit >= 150 || oppProximity <= 100) probability = 0.08;

  if (partnerBid >= 6) probability *= 1.3;

  return Math.random() < probability;
}

function evaluateNil(hand, sortedSpades, spades, suits, partnerBid) {
  const spadeCount = spades.length;
  const highestSpade = sortedSpades.length > 0 ? RANK_VALUE[sortedSpades[0].rank] : 0;

  if (highestSpade >= 12) return false;
  if (highestSpade === 11 && spadeCount >= 3) return false;

  const highCards = hand.filter(c => RANK_VALUE[c.rank] >= 12).length;
  if (highCards >= 2) return false;

  const medCards = hand.filter(c => RANK_VALUE[c.rank] >= 10 && RANK_VALUE[c.rank] <= 11).length;
  if (highCards + medCards >= 4) return false;

  for (const [suitKey, suitCards] of Object.entries(suits)) {
    if (suitCards.length === 0) continue;
    const sorted = [...suitCards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
    if (RANK_VALUE[sorted[0].rank] === 14) return false;
    if (RANK_VALUE[sorted[0].rank] === 13 && suitCards.length <= 2) return false;
  }

  const lowCards = hand.filter(c => RANK_VALUE[c.rank] <= 7).length;
  if (lowCards < 6) return false;

  if (partnerBid !== undefined && partnerBid !== null && partnerBid >= 3) return true;
  if (lowCards >= 9 && highCards === 0 && highestSpade <= 8) return true;

  if (partnerBid === undefined || partnerBid === null) {
    return lowCards >= 8 && highCards === 0 && medCards <= 1 && highestSpade <= 9;
  }

  return lowCards >= 8 && highCards === 0 && highestSpade <= 9;
}

function countHighSpades(sortedSpades) {
  let count = 0;
  for (const s of sortedSpades) {
    if (RANK_VALUE[s.rank] >= 12) count++;
    else break;
  }
  return count;
}
