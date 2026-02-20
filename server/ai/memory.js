import { RANK_VALUE } from '../game/constants.js';

// Analyzes all previously played cards to determine what's still outstanding
export function buildCardMemory(hand, gameState, botId) {
  const cardsPlayed = gameState.cardsPlayed || [];
  const currentTrick = gameState.currentTrick || [];

  // All cards visible to this bot: own hand + played cards + current trick
  const allSeen = new Set();
  for (const c of hand) allSeen.add(`${c.rank}_${c.suit}`);
  for (const p of cardsPlayed) allSeen.add(`${p.card.rank}_${p.card.suit}`);
  for (const p of currentTrick) allSeen.add(`${p.card.rank}_${p.card.suit}`);

  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  // Cards still outstanding (not in hand, not played)
  const outstanding = {};
  for (const suit of suits) {
    outstanding[suit] = [];
    for (const rank of ranks) {
      if (!allSeen.has(`${rank}_${suit}`)) {
        outstanding[suit].push({ rank, suit });
      }
    }
    outstanding[suit].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
  }

  // Highest remaining card per suit (among outstanding cards only)
  const highestOutstanding = {};
  for (const suit of suits) {
    highestOutstanding[suit] = outstanding[suit].length > 0
      ? RANK_VALUE[outstanding[suit][0].rank]
      : 0;
  }

  // Track which players are known to be void in a suit
  const knownVoids = {};
  for (const play of cardsPlayed) {
    if (!knownVoids[play.playerId]) knownVoids[play.playerId] = new Set();
  }
  for (const play of currentTrick) {
    if (!knownVoids[play.playerId]) knownVoids[play.playerId] = new Set();
  }

  // Reconstruct completed tricks to detect voids
  for (let i = 0; i < cardsPlayed.length; i += 4) {
    if (i + 3 >= cardsPlayed.length) break;
    const trick = cardsPlayed.slice(i, i + 4);
    const ledSuit = trick[0].card.suit;
    for (let j = 1; j < trick.length; j++) {
      if (trick[j].card.suit !== ledSuit) {
        if (!knownVoids[trick[j].playerId]) knownVoids[trick[j].playerId] = new Set();
        knownVoids[trick[j].playerId].add(ledSuit);
      }
    }
  }

  // Also check current trick for voids
  if (currentTrick.length >= 2) {
    const ledSuit = currentTrick[0].card.suit;
    for (let i = 1; i < currentTrick.length; i++) {
      if (currentTrick[i].card.suit !== ledSuit) {
        if (!knownVoids[currentTrick[i].playerId]) knownVoids[currentTrick[i].playerId] = new Set();
        knownVoids[currentTrick[i].playerId].add(ledSuit);
      }
    }
  }

  return {
    outstanding,
    highestOutstanding,
    knownVoids,
    cardsPlayedCount: cardsPlayed.length + currentTrick.length,
  };
}

// Check if a card in hand is the highest remaining (master) in its suit
export function isMasterCard(card, memory) {
  return RANK_VALUE[card.rank] > memory.highestOutstanding[card.suit];
}

// Check if a specific opponent is known void in a suit
export function isKnownVoid(playerId, suit, memory) {
  return memory.knownVoids[playerId] && memory.knownVoids[playerId].has(suit);
}

// Count guaranteed future winners in hand
export function countGuaranteedWinners(hand, memory) {
  let count = 0;

  if (memory) {
    // With card memory: count all master cards (highest remaining in their suit)
    const spades = hand.filter(c => c.suit === 'S')
      .sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

    // Count consecutive master spades (each one is guaranteed)
    for (const s of spades) {
      if (isMasterCard(s, memory)) count++;
      else break;
    }

    // Off-suit masters
    for (const suit of ['H', 'D', 'C']) {
      const suitCards = hand.filter(c => c.suit === suit)
        .sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
      for (const c of suitCards) {
        if (isMasterCard(c, memory)) count += 0.7; // Off-suit masters can still be trumped
        else break;
      }
    }
  } else {
    // Without memory: use static analysis
    const spades = hand.filter(c => c.suit === 'S')
      .sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);

    if (spades.length > 0 && RANK_VALUE[spades[0].rank] === 14) {
      count++;
      if (spades.length > 1 && RANK_VALUE[spades[1].rank] === 13) count++;
    }

    for (const suit of ['H', 'D', 'C']) {
      const suitCards = hand.filter(c => c.suit === suit);
      if (suitCards.length > 0) {
        const highest = suitCards.reduce((best, c) =>
          RANK_VALUE[c.rank] > RANK_VALUE[best.rank] ? c : best
        );
        if (RANK_VALUE[highest.rank] === 14) count += 0.7;
      }
    }
  }

  return count;
}
