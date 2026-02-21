import React from 'react';

const SUIT_SYMBOLS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
const SUIT_COLORS = { S: '#000000', H: '#d40000', D: '#d40000', C: '#000000' };

export default function Card({ card, onClick, disabled, small }) {
  if (!card) return <div className={`card card-empty ${small ? 'card-small' : ''}`} />;

  const isMega = !!card.mega;

  return (
    <div
      className={`card ${disabled ? 'card-disabled' : 'card-playable'} ${small ? 'card-small' : ''} ${isMega ? 'card-mega' : ''}`}
      onClick={() => !disabled && onClick?.(card)}
      style={{ color: SUIT_COLORS[card.suit] }}
    >
      <div className="card-corner top-left">
        <div className="card-rank">{card.rank}</div>
        <div className="card-suit">{SUIT_SYMBOLS[card.suit]}</div>
      </div>
      <div className="card-center">
        {SUIT_SYMBOLS[card.suit]}
      </div>
      {isMega && <div className="card-mega-banner">MEGA</div>}
      <div className="card-corner bottom-right">
        <div className="card-rank">{card.rank}</div>
        <div className="card-suit">{SUIT_SYMBOLS[card.suit]}</div>
      </div>
    </div>
  );
}

export function CardBack({ small }) {
  return <div className={`card card-back ${small ? 'card-small' : ''}`} />;
}
