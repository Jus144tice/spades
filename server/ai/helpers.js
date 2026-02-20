import { RANK_VALUE } from '../game/constants.js';

export function groupBySuit(cards) {
  const groups = {};
  for (const c of cards) {
    if (!groups[c.suit]) groups[c.suit] = [];
    groups[c.suit].push(c);
  }
  for (const suit of Object.keys(groups)) {
    groups[suit].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  }
  return groups;
}

export function pickHighest(cards) {
  return cards.reduce((best, c) =>
    RANK_VALUE[c.rank] > RANK_VALUE[best.rank] ? c : best
  );
}

export function pickLowest(cards) {
  return cards.reduce((best, c) =>
    RANK_VALUE[c.rank] < RANK_VALUE[best.rank] ? c : best
  );
}

export function pickRandom(cards) {
  return cards[Math.floor(Math.random() * cards.length)];
}

// Pick the most "middle" card — closest to the median rank value.
// Middle cards are the least useful: can't reliably win or duck.
export function pickMiddleCard(cards) {
  if (cards.length <= 2) return null;
  const sorted = [...cards].sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
  return sorted[Math.floor(sorted.length / 2)];
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
      if (RANK_VALUE[play.card.rank] > RANK_VALUE[winner.card.rank]) winner = play;
    } else if (play.card.suit === ledSuit && winner.card.suit === ledSuit) {
      if (RANK_VALUE[play.card.rank] > RANK_VALUE[winner.card.rank]) winner = play;
    }
  }

  return winner;
}

export function getEffectiveValue(card, ledSuit) {
  if (card.suit === 'S' && ledSuit !== 'S') return 100 + RANK_VALUE[card.rank];
  if (card.suit === ledSuit) return RANK_VALUE[card.rank];
  return 0;
}
