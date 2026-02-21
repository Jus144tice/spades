import { RANK_VALUE, getCardValue } from '../game/constants.js';

/**
 * Generate a unique key for a card, distinguishing regular from mega.
 * Regular cards: "A_S", mega cards: "A_S_M"
 */
function cardKey(card) {
  return `${card.rank}_${card.suit}${card.mega ? '_M' : ''}`;
}

/**
 * Analyzes all previously played cards to determine what's still outstanding.
 * Accepts optional mode parameter for mega-card-aware tracking.
 * Without mode, assumes standard 52-card deck (all regular).
 */
export function buildCardMemory(hand, gameState, botId, mode) {
  const cardsPlayed = gameState.cardsPlayed || [];
  const currentTrick = gameState.currentTrick || [];

  // All cards visible to this bot: own hand + played cards + current trick
  const allSeen = new Set();
  for (const c of hand) allSeen.add(cardKey(c));
  for (const p of cardsPlayed) allSeen.add(cardKey(p.card));
  for (const p of currentTrick) allSeen.add(cardKey(p.card));

  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  // Build the full deck card list based on mode
  const deckCards = [];
  const removedSet = new Set();
  if (mode && mode.removedCards) {
    for (const rc of mode.removedCards) removedSet.add(`${rc.rank}_${rc.suit}`);
  }
  for (const suit of suits) {
    for (const rank of ranks) {
      if (!removedSet.has(`${rank}_${suit}`)) {
        deckCards.push({ rank, suit, mega: false });
      }
    }
  }
  if (mode && mode.megaCards) {
    for (const mc of mode.megaCards) {
      deckCards.push({ suit: mc.suit, rank: mc.rank, mega: true });
    }
  }

  // Cards still outstanding (not in hand, not played)
  const outstanding = {};
  for (const suit of suits) {
    outstanding[suit] = [];
  }
  for (const dc of deckCards) {
    if (!allSeen.has(cardKey(dc))) {
      outstanding[dc.suit].push(dc);
    }
  }
  for (const suit of suits) {
    outstanding[suit].sort((a, b) => getCardValue(b) - getCardValue(a));
  }

  // Highest remaining card per suit (among outstanding cards only)
  const highestOutstanding = {};
  for (const suit of suits) {
    highestOutstanding[suit] = outstanding[suit].length > 0
      ? getCardValue(outstanding[suit][0])
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
  // Trick size = playerCount (from mode) or 4 (default)
  const trickSize = mode ? mode.playerCount : 4;
  for (let i = 0; i < cardsPlayed.length; i += trickSize) {
    if (i + trickSize - 1 >= cardsPlayed.length) break;
    const trick = cardsPlayed.slice(i, i + trickSize);
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
  return getCardValue(card) > memory.highestOutstanding[card.suit];
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
      .sort((a, b) => getCardValue(b) - getCardValue(a));

    // Count consecutive master spades (each one is guaranteed)
    for (const s of spades) {
      if (isMasterCard(s, memory)) count++;
      else break;
    }

    // Off-suit masters
    for (const suit of ['H', 'D', 'C']) {
      const suitCards = hand.filter(c => c.suit === suit)
        .sort((a, b) => getCardValue(b) - getCardValue(a));
      for (const c of suitCards) {
        if (isMasterCard(c, memory)) count += 0.7; // Off-suit masters can still be trumped
        else break;
      }
    }
  } else {
    // Without memory: use static analysis
    const spades = hand.filter(c => c.suit === 'S')
      .sort((a, b) => getCardValue(b) - getCardValue(a));

    if (spades.length > 0 && RANK_VALUE[spades[0].rank] === 14) {
      count++;
      if (spades.length > 1 && RANK_VALUE[spades[1].rank] === 13) count++;
    }

    for (const suit of ['H', 'D', 'C']) {
      const suitCards = hand.filter(c => c.suit === suit);
      if (suitCards.length > 0) {
        const highest = suitCards.reduce((best, c) =>
          getCardValue(c) > getCardValue(best) ? c : best
        );
        if (RANK_VALUE[highest.rank] === 14) count += 0.7;
      }
    }
  }

  return count;
}
