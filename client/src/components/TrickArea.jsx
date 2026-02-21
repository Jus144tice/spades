import React from 'react';
import Card from './Card.jsx';
import { getTrickCardPosition } from '../modes.js';

const FOUR_PLAYER_POSITIONS = ['bottom', 'left', 'top', 'right'];

export default function TrickArea({ currentTrick, players, myIndex, playerCount, lastTrickWinner }) {
  const count = playerCount || players.length || 4;

  // Map each played card to a position relative to current player
  const getPosition = (playerId) => {
    const playerIdx = players.findIndex(p => p.id === playerId);
    const relativeIdx = (playerIdx - myIndex + count) % count;
    if (count === 4) {
      return { className: `trick-${FOUR_PLAYER_POSITIONS[relativeIdx]}` };
    }
    // Polygon layout: use computed positions
    const pos = getTrickCardPosition(relativeIdx, count);
    return { style: { position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' } };
  };

  const isShowingWon = lastTrickWinner && currentTrick.length === count;

  return (
    <div className={`trick-area ${isShowingWon ? 'trick-won-display' : ''}`}>
      {currentTrick.map((play, i) => {
        const isWinner = lastTrickWinner === play.playerId;
        const pos = getPosition(play.playerId);
        return (
          <div
            key={i}
            className={`trick-card ${pos.className || ''} ${isWinner ? 'winning-card' : ''}`}
            style={pos.style || undefined}
          >
            <Card card={play.card} small />
          </div>
        );
      })}
      {currentTrick.length === 0 && (
        <div className="trick-empty">
          {/* empty table */}
        </div>
      )}
    </div>
  );
}
