import { SUITS, RANKS } from './constants.js';

/**
 * Create a deck based on the game mode configuration.
 * - Starts with the standard 52 cards (each with mega: false)
 * - Removes cards per mode.removedCards (for 3-player)
 * - Adds mega cards per mode.megaCards (for 5-8 player)
 *
 * If no mode is provided, returns the standard 52-card deck (4-player default).
 */
export function createDeck(mode) {
  const deck = [];

  // Build standard 52-card deck
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, mega: false });
    }
  }

  if (!mode) return deck;

  // Remove cards (3-player: strip lowest ranks)
  if (mode.removedCards && mode.removedCards.length > 0) {
    for (const rc of mode.removedCards) {
      const idx = deck.findIndex(c => c.suit === rc.suit && c.rank === rc.rank && !c.mega);
      if (idx !== -1) deck.splice(idx, 1);
    }
  }

  // Add mega cards (5-8 player)
  if (mode.megaCards && mode.megaCards.length > 0) {
    for (const mc of mode.megaCards) {
      deck.push({ suit: mc.suit, rank: mc.rank, mega: true });
    }
  }

  return deck;
}

export function shuffle(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal cards into N hands (one per player).
 * Defaults to 4 players if playerCount is not provided.
 */
export function deal(deck, playerCount = 4) {
  const hands = Array.from({ length: playerCount }, () => []);
  deck.forEach((card, idx) => {
    hands[idx % playerCount].push(card);
  });
  return hands;
}
