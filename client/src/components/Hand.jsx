import React, { useState } from 'react';
import Card, { CardBack } from './Card.jsx';

export default function Hand({ cards, onPlayCard, isMyTurn, currentTrick, spadesBroken, queuedCard, onQueueCard, canQueue, showBacks, phase }) {
  const [touchedIndex, setTouchedIndex] = useState(null);

  const isLegalPlay = (card) => {
    // Leading
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

  const canPlayCard = (card) => isMyTurn && isLegalPlay(card);
  const canQueueCard = (card) => canQueue && isLegalPlay(card);
  const isQueued = (card) => queuedCard && queuedCard.suit === card.suit && queuedCard.rank === card.rank;

  const handleTouch = (card, index, playable, queueable) => {
    if (queueable) {
      // Single tap to toggle queue
      onQueueCard(card);
      return;
    }
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

  if (showBacks) {
    return (
      <div className="hand">
        {cards.map((card, i) => (
          <div
            key={`${card.suit}${card.rank}`}
            className="hand-card"
            style={{ '--i': i, '--total': cards.length }}
          >
            <CardBack />
          </div>
        ))}
      </div>
    );
  }

  const isBidding = phase === 'bidding';

  return (
    <div className="hand">
      {cards.map((card, i) => {
        const playable = canPlayCard(card);
        const queueable = canQueueCard(card);
        const queued = isQueued(card);
        return (
          <div
            key={`${card.suit}${card.rank}`}
            className={`hand-card ${playable ? 'playable' : ''} ${queueable ? 'queueable' : ''} ${queued ? 'queued' : ''} ${isBidding ? 'viewing' : ''} ${touchedIndex === i ? 'touched' : ''}`}
            style={{ '--i': i, '--total': cards.length }}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleTouch(card, i, playable, queueable);
            }}
          >
            <Card
              card={card}
              onClick={queueable ? onQueueCard : onPlayCard}
              disabled={(isMyTurn || canQueue) ? (!playable && !queueable) : false}
            />
          </div>
        );
      })}
    </div>
  );
}
