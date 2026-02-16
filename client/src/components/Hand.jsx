import React, { useState } from 'react';
import Card from './Card.jsx';

export default function Hand({ cards, onPlayCard, isMyTurn, currentTrick, spadesBroken }) {
  const [touchedIndex, setTouchedIndex] = useState(null);

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

  const handleTouch = (card, index, playable) => {
    if (!playable) return;
    if (touchedIndex === index) {
      // Second tap — play the card
      onPlayCard(card);
      setTouchedIndex(null);
    } else {
      // First tap — lift the card
      setTouchedIndex(index);
    }
  };

  return (
    <div className="hand">
      {cards.map((card, i) => {
        const playable = canPlayCard(card);
        return (
          <div
            key={`${card.suit}${card.rank}`}
            className={`hand-card ${playable ? 'playable' : ''} ${touchedIndex === i ? 'touched' : ''}`}
            style={{ '--i': i, '--total': cards.length }}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleTouch(card, i, playable);
            }}
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
