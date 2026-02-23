/**
 * Check if playing a card is legal given the current game state.
 * @param {object} card - The card to play ({ suit, rank })
 * @param {object[]} hand - All cards in the player's hand
 * @param {object[]} currentTrick - Cards already played in this trick ({ playerId, card })
 * @param {boolean} spadesBroken - Whether spades have been broken this round
 * @returns {boolean}
 */
export function isLegalPlay(card, hand, currentTrick, spadesBroken) {
  // Leading
  if (currentTrick.length === 0) {
    if (card.suit === 'S' && !spadesBroken) {
      return hand.every(c => c.suit === 'S');
    }
    return true;
  }

  // Must follow suit
  const ledSuit = currentTrick[0].card.suit;
  const hasLedSuit = hand.some(c => c.suit === ledSuit);
  if (hasLedSuit) return card.suit === ledSuit;

  return true;
}
