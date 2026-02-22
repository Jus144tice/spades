/**
 * Game mode configurations for 3-8 player Spades.
 *
 * Each mode defines player count, team structure, deck composition,
 * and seating layout. The 4-player entry reproduces the classic game exactly.
 */

import { SUITS, RANKS } from './constants.js';

// Mega cards usually exclude Aces. 8-player needs a full mega deck (including Aces).
const MEGA_RANKS = RANKS.filter(r => r !== 'A');

// --- Deck building helpers ---

/**
 * Compute which cards to REMOVE from the standard 52-card deck.
 * For modes with fewer than 52 cards (3-player), we strip the lowest cards.
 * Fills rank-by-rank (2, 3, 4, ...), all 4 suits per rank, then partial suits in S, H, D, C order.
 */
function computeRemovedCards(cardsToRemove) {
  if (cardsToRemove <= 0) return [];
  const removed = [];
  let remaining = cardsToRemove;
  for (const rank of RANKS) {
    if (remaining <= 0) break;
    for (const suit of SUITS) {
      if (remaining <= 0) break;
      removed.push({ suit, rank });
      remaining--;
    }
  }
  return removed;
}

/**
 * Compute which mega cards to ADD to the deck.
 * Fills rank-by-rank from 2 upward, all 4 suits per rank,
 * then partial suits in S, H, D, C order.
 * By default excludes Aces; pass includeAces=true for a full mega deck (8-player).
 */
function computeMegaCards(extraCardsNeeded, includeAces = false) {
  if (extraCardsNeeded <= 0) return [];
  const ranks = includeAces ? RANKS : MEGA_RANKS;
  const mega = [];
  let remaining = extraCardsNeeded;
  for (const rank of ranks) {
    if (remaining <= 0) break;
    for (const suit of SUITS) {
      if (remaining <= 0) break;
      mega.push({ suit, rank });
      remaining--;
    }
  }
  return mega;
}

// --- Mode definitions ---

export const GAME_MODES = {
  3: {
    playerCount: 3,
    cardsPerPlayer: 13,
    tricksPerRound: 13,
    totalCards: 39,
    teams: [
      { id: 'team1', size: 1, spoiler: false },
      { id: 'team2', size: 1, spoiler: false },
      { id: 'team3', size: 1, spoiler: false },
    ],
    teamCount: 3,
    hasSpoiler: false,
    seatingPattern: 'polygon',
    // 52 - 39 = 13 cards removed (lowest ranks first)
    removedCards: computeRemovedCards(13),
    megaCards: [],
  },
  4: {
    playerCount: 4,
    cardsPerPlayer: 13,
    tricksPerRound: 13,
    totalCards: 52,
    teams: [
      { id: 'team1', size: 2, spoiler: false },
      { id: 'team2', size: 2, spoiler: false },
    ],
    teamCount: 2,
    hasSpoiler: false,
    seatingPattern: 'classic',
    removedCards: [],
    megaCards: [],
  },
  5: {
    playerCount: 5,
    cardsPerPlayer: 13,
    tricksPerRound: 13,
    totalCards: 65,
    teams: [
      { id: 'team1', size: 2, spoiler: false },
      { id: 'team2', size: 2, spoiler: false },
      { id: 'team3', size: 1, spoiler: true },
    ],
    teamCount: 3,
    hasSpoiler: true,
    seatingPattern: 'polygon',
    // Use 6 layout positions so partners sit directly across; spoiler's opposite seat is empty
    layoutSeats: 6,
    removedCards: [],
    megaCards: computeMegaCards(13),
  },
  6: {
    playerCount: 6,
    cardsPerPlayer: 13,
    tricksPerRound: 13,
    totalCards: 78,
    teams: [
      { id: 'team1', size: 2, spoiler: false },
      { id: 'team2', size: 2, spoiler: false },
      { id: 'team3', size: 2, spoiler: false },
    ],
    teamCount: 3,
    hasSpoiler: false,
    seatingPattern: 'polygon',
    removedCards: [],
    megaCards: computeMegaCards(26),
  },
  7: {
    playerCount: 7,
    cardsPerPlayer: 13,
    tricksPerRound: 13,
    totalCards: 91,
    teams: [
      { id: 'team1', size: 2, spoiler: false },
      { id: 'team2', size: 2, spoiler: false },
      { id: 'team3', size: 2, spoiler: false },
      { id: 'team4', size: 1, spoiler: true },
    ],
    teamCount: 4,
    hasSpoiler: true,
    seatingPattern: 'polygon',
    // Use 8 layout positions so partners sit directly across; spoiler's opposite seat is empty
    layoutSeats: 8,
    removedCards: [],
    megaCards: computeMegaCards(39),
  },
  8: {
    playerCount: 8,
    cardsPerPlayer: 13,
    tricksPerRound: 13,
    totalCards: 104,
    teams: [
      { id: 'team1', size: 2, spoiler: false },
      { id: 'team2', size: 2, spoiler: false },
      { id: 'team3', size: 2, spoiler: false },
      { id: 'team4', size: 2, spoiler: false },
    ],
    teamCount: 4,
    hasSpoiler: false,
    seatingPattern: 'polygon',
    // 52 regular + 52 mega (full deck including Aces) = 104 = 13 per player.
    removedCards: [],
    megaCards: computeMegaCards(52, true),
  },
};

/**
 * Get the mode configuration for a given player count.
 * Defaults to 4-player (classic) if the count isn't defined.
 */
export function getMode(playerCount) {
  return GAME_MODES[playerCount] || GAME_MODES[4];
}
