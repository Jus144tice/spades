import { getCardValue } from '../game/constants.js';

export function groupBySuit(cards) {
  const groups = {};
  for (const c of cards) {
    if (!groups[c.suit]) groups[c.suit] = [];
    groups[c.suit].push(c);
  }
  for (const suit of Object.keys(groups)) {
    groups[suit].sort((a, b) => getCardValue(b) - getCardValue(a));
  }
  return groups;
}

export function pickHighest(cards) {
  return cards.reduce((best, c) =>
    getCardValue(c) > getCardValue(best) ? c : best
  );
}

export function pickLowest(cards) {
  return cards.reduce((best, c) =>
    getCardValue(c) < getCardValue(best) ? c : best
  );
}

export function pickRandom(cards) {
  return cards[Math.floor(Math.random() * cards.length)];
}

// Pick the most "middle" card — closest to the median rank value.
// Middle cards are the least useful: can't reliably win or duck.
export function pickMiddleCard(cards) {
  if (cards.length <= 2) return null;
  const sorted = [...cards].sort((a, b) => getCardValue(a) - getCardValue(b));
  return sorted[Math.floor(sorted.length / 2)];
}

// Graduated card selection based on disposition strength.
// Hard set (>=2):  shed lowest, save highs for winning
// Soft set (1-2):  shed second-lowest, keep absolute lowest as insurance
// Neutral (-1..1): shed upper-mid cards that might accidentally win
// Soft duck (-2..-1): shed second-highest, keep absolute highest as insurance
// Hard duck (<=-2): shed highest, dump all potential winners
export function pickByDisposition(cards, disposition) {
  if (cards.length <= 1) return cards[0];
  const sorted = [...cards].sort((a, b) => getCardValue(a) - getCardValue(b));
  const n = sorted.length;

  if (disposition >= 2) return sorted[0];                         // hard set: lowest
  if (disposition <= -2) return sorted[n - 1];                    // hard duck: highest
  if (n === 2) return disposition > 0 ? sorted[0] : sorted[1];   // 2 cards: lean by direction

  if (disposition >= 1) return sorted[1];                         // soft set: second-lowest
  if (disposition <= -1) return sorted[n - 2];                    // soft duck: second-highest

  // Neutral: upper-mid (shed cards that might accidentally take tricks)
  const idx = Math.floor(n * 0.65);
  return sorted[Math.min(idx, n - 1)];
}

// Pick the top card from the shortest suit among candidates.
// Leading highest first (A before K before Q) signals strength to partner.
export function pickTopFromShortestSuit(candidates, hand) {
  if (candidates.length === 1) return candidates[0];

  const suitLens = {};
  for (const c of candidates) {
    if (!(c.suit in suitLens)) {
      suitLens[c.suit] = hand.filter(h => h.suit === c.suit).length;
    }
  }

  let shortestLen = 14;
  let shortestSuit = candidates[0].suit;
  for (const [suit, len] of Object.entries(suitLens)) {
    if (len < shortestLen) {
      shortestLen = len;
      shortestSuit = suit;
    }
  }

  const fromSuit = candidates.filter(c => c.suit === shortestSuit);
  return pickHighest(fromSuit);
}

export function getValidLeads(hand, spadesBroken) {
  if (spadesBroken) return hand;
  const nonSpades = hand.filter(c => c.suit !== 'S');
  return nonSpades.length === 0 ? hand : nonSpades;
}

export function getCurrentWinner(trick) {
  const ledSuit = trick[0].card.suit;
  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const play = trick[i];
    const wIsSpade = winner.card.suit === 'S';
    const cIsSpade = play.card.suit === 'S';

    if (cIsSpade && !wIsSpade) {
      winner = play;
    } else if (cIsSpade && wIsSpade) {
      if (getCardValue(play.card) > getCardValue(winner.card)) winner = play;
    } else if (play.card.suit === ledSuit && winner.card.suit === ledSuit) {
      if (getCardValue(play.card) > getCardValue(winner.card)) winner = play;
    }
  }

  return winner;
}

export function getEffectiveValue(card, ledSuit) {
  if (card.suit === 'S' && ledSuit !== 'S') return 100 + getCardValue(card);
  if (card.suit === ledSuit) return getCardValue(card);
  return 0;
}
