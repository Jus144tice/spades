export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export const SUIT_NAME = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

// Mega card rank offset: mega cards beat same-rank regular but lose to next rank up
export const MEGA_RANK_OFFSET = 0.5;

/**
 * Get the effective numeric value of a card for comparison purposes.
 * Mega cards get +0.5 to their rank value, so mega 2 (2.5) beats regular 2 (2)
 * but loses to regular 3 (3).
 */
export function getCardValue(card) {
  return RANK_VALUE[card.rank] + (card.mega ? MEGA_RANK_OFFSET : 0);
}

export const WINNING_SCORE = 500;
export const BOOK_PENALTY_THRESHOLD = 10;
export const BOOK_PENALTY = 100;
export const NIL_BONUS = 100;
export const BLIND_NIL_BONUS = 200;
export const TEN_TRICK_BONUS = 50;
export const RECONNECT_TIMEOUT_MS = 60000;

// AFK timer constants
export const AFK_TURN_TIMEOUT = 60000;  // 60s normal turn timer
export const AFK_FAST_TIMEOUT = 5000;   // 5s for AFK players
export const AFK_THRESHOLD = 3;         // consecutive timeouts before switching to fast

export const DEFAULT_GAME_SETTINGS = {
  winTarget: 500,
  bagThreshold: 10,
  blindNil: false,
  moonshot: true,
  tenBidBonus: true,
  gameMode: 4,
};
