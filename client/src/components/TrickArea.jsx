import React from 'react';
import Card from './Card.jsx';

const POSITIONS = ['bottom', 'left', 'top', 'right'];

export default function TrickArea({ currentTrick, players, myIndex, lastTrickWinner }) {
  // Map each played card to a position relative to current player
  const getPosition = (playerId) => {
    const playerIdx = players.findIndex(p => p.id === playerId);
    const relativeIdx = (playerIdx - myIndex + 4) % 4;
    return POSITIONS[relativeIdx];
  };

  const isShowingWon = lastTrickWinner && currentTrick.length === 4;

  return (
    <div className={`trick-area ${isShowingWon ? 'trick-won-display' : ''}`}>
      {currentTrick.map((play, i) => {
        const isWinner = lastTrickWinner === play.playerId;
        return (
          <div key={i} className={`trick-card trick-${getPosition(play.playerId)} ${isWinner ? 'winning-card' : ''}`}>
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
