import React from 'react';

const SUIT_SYMBOLS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
const SUIT_COLORS = { S: 'black', H: 'red', D: 'red', C: 'black' };

function MiniCard({ card }) {
  const symbol = SUIT_SYMBOLS[card.suit] || card.suit;
  const color = SUIT_COLORS[card.suit] || 'black';
  return (
    <span className={`mini-card ${card.mega ? 'mega' : ''}`} style={{ color }}>
      {card.rank}{symbol}
    </span>
  );
}

export default function TrickHistory({ completedTricks, players, onClose }) {
  if (!completedTricks || completedTricks.length === 0) {
    return (
      <div className="trick-history-overlay" onClick={onClose}>
        <div className="trick-history-panel" onClick={e => e.stopPropagation()}>
          <div className="trick-history-header">
            <h3>Trick History</h3>
            <button className="trick-history-close" onClick={onClose}>{'\u2715'}</button>
          </div>
          <div className="trick-history-empty">No tricks played yet.</div>
        </div>
      </div>
    );
  }

  const getName = (id) => {
    const p = players.find(p => p.id === id);
    return p ? p.name : '???';
  };

  return (
    <div className="trick-history-overlay" onClick={onClose}>
      <div className="trick-history-panel" onClick={e => e.stopPropagation()}>
        <div className="trick-history-header">
          <h3>Trick History</h3>
          <button className="trick-history-close" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="trick-history-list">
          {[...completedTricks].reverse().map((ct) => (
            <div key={ct.trickNumber} className="trick-history-item">
              <div className="trick-history-number">Trick {ct.trickNumber}</div>
              <div className="trick-history-plays">
                {ct.trick.map((play, i) => {
                  const isWinner = play.playerId === ct.winnerId;
                  const isLeader = play.playerId === ct.leaderId;
                  return (
                    <span
                      key={i}
                      className={`trick-history-play ${isWinner ? 'winner' : ''} ${isLeader ? 'leader' : ''}`}
                    >
                      <span className="trick-history-player-name">{getName(play.playerId)}</span>
                      <MiniCard card={play.card} />
                    </span>
                  );
                })}
              </div>
              <div className="trick-history-won">
                Won by <strong>{getName(ct.winnerId)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
