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

function TrickItem({ trick, getName }) {
  return (
    <div className="trick-history-item">
      <div className="trick-history-number">Trick {trick.trickNumber}</div>
      <div className="trick-history-plays">
        {trick.trick.map((play, i) => {
          const isWinner = play.playerId === trick.winnerId;
          const isLeader = play.playerId === trick.leaderId;
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
        Won by <strong>{getName(trick.winnerId)}</strong>
      </div>
    </div>
  );
}

export default function TrickHistory({ completedTricks, roundHistory, roundNumber, players, onClose }) {
  const getName = (id) => {
    const p = players.find(p => p.id === id);
    return p ? p.name : '???';
  };

  // Build rounds: past rounds from roundHistory + current round from completedTricks
  const rounds = [];
  if (roundHistory) {
    for (const r of roundHistory) {
      if (r.completedTricks && r.completedTricks.length > 0) {
        rounds.push({ roundNumber: r.roundNumber, tricks: r.completedTricks });
      }
    }
  }
  if (completedTricks && completedTricks.length > 0) {
    rounds.push({ roundNumber: roundNumber || (rounds.length + 1), tricks: completedTricks });
  }

  const hasAnyTricks = rounds.length > 0;

  return (
    <div className="trick-history-overlay" onClick={onClose}>
      <div className="trick-history-panel" onClick={e => e.stopPropagation()}>
        <div className="trick-history-header">
          <h3>Trick History</h3>
          <button className="trick-history-close" onClick={onClose}>{'\u2715'}</button>
        </div>
        {!hasAnyTricks ? (
          <div className="trick-history-empty">No tricks played yet.</div>
        ) : (
          <div className="trick-history-list">
            {[...rounds].reverse().map((round) => (
              <div key={round.roundNumber} className="trick-history-round">
                <div className="trick-history-round-header">Round {round.roundNumber}</div>
                {[...round.tricks].reverse().map((ct) => (
                  <TrickItem key={ct.trickNumber} trick={ct} getName={getName} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
