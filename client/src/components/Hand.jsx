import React from 'react';
import Card from './Card.jsx';

export default function Hand({ cards, onPlayCard, isMyTurn, currentTrick, spadesBroken }) {
  const canPlayCard = (card) => {
    if (!isMyTurn) return false;

    // If leading
    if (currentTrick.length === 0) {
      if (card.suit === 'S' && !spadesBroken) {
        return cards.every(c => c.suit === 'S');
      }
      return true;
    }

    // Must follow suit
    const ledSuit = currentTrick[0].card.suit;
    const hasLedSuit = cards.some(c => c.suit === ledSuit);
    if (hasLedSuit) return card.suit === ledSuit;

    return true;
  };

  return (
    <div className="hand">
      {cards.map((card, i) => {
        const playable = canPlayCard(card);
        return (
          <div
            key={`${card.suit}${card.rank}`}
            className={`hand-card ${playable ? 'playable' : ''}`}
            style={{ '--i': i, '--total': cards.length }}
          >
            <Card
              card={card}
              onClick={onPlayCard}
              disabled={!playable}
            />
          </div>
        );
      })}
    </div>
  );
}
