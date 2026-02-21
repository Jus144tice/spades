import { getCardValue } from './constants.js';

export function validatePlay(card, hand, currentTrick, spadesBroken) {
  if (currentTrick.length === 0) {
    // Leading a trick
    if (card.suit === 'S' && !spadesBroken) {
      const allSpades = hand.every(c => c.suit === 'S');
      if (!allSpades) {
        return { valid: false, reason: 'Spades have not been broken yet' };
      }
    }
    return { valid: true };
  }

  // Following - must follow suit if possible
  const ledSuit = currentTrick[0].card.suit;
  const hasLedSuit = hand.some(c => c.suit === ledSuit);
  if (hasLedSuit && card.suit !== ledSuit) {
    return { valid: false, reason: `You must follow suit (${ledSuit})` };
  }

  return { valid: true };
}

export function determineTrickWinner(trick) {
  const ledSuit = trick[0].card.suit;
  let winner = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const play = trick[i];
    const winnerIsSpade = winner.card.suit === 'S';
    const challengerIsSpade = play.card.suit === 'S';

    if (challengerIsSpade && !winnerIsSpade) {
      winner = play;
    } else if (challengerIsSpade && winnerIsSpade) {
      if (getCardValue(play.card) > getCardValue(winner.card)) {
        winner = play;
      }
    } else if (play.card.suit === ledSuit && winner.card.suit === ledSuit) {
      if (getCardValue(play.card) > getCardValue(winner.card)) {
        winner = play;
      }
    }
  }

  return winner.playerId;
}
