import React from 'react';

export default function PlayerSeat({ player, bid, tricks, isCurrentTurn, isDealer, isMe }) {
  if (!player) return null;

  return (
    <div className={`player-seat ${isCurrentTurn ? 'active-turn' : ''} ${isMe ? 'is-me' : ''}`}>
      <div className="player-seat-name">
        {player.name}
        {isDealer && <span className="dealer-badge">D</span>}
      </div>
      <div className="player-seat-info">
        {bid !== undefined ? (
          <span>Bid: {bid === 0 ? 'Nil' : bid} | Tricks: {tricks || 0}</span>
        ) : (
          <span className="waiting-bid-text">...</span>
        )}
      </div>
      <div className={`team-badge team-${player.team}`}>
        T{player.team}
      </div>
    </div>
  );
}
