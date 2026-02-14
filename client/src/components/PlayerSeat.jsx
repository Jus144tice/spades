import React from 'react';

export default function PlayerSeat({ player, bid, tricks, isCurrentTurn, isDealer, isMe, isLastTrickWinner }) {
  if (!player) return null;

  const trickCount = tricks || 0;
  const hasBid = bid !== undefined;
  const isNil = bid === 0;
  const overUnder = hasBid && !isNil ? trickCount - bid : null;

  return (
    <div className={`player-seat ${isCurrentTurn ? 'active-turn' : ''} ${isMe ? 'is-me' : ''} ${isLastTrickWinner ? 'trick-winner' : ''}`}>
      <div className="player-seat-name">
        {player.name}
        {isDealer && <span className="dealer-badge">D</span>}
      </div>
      {hasBid ? (
        <div className="player-bid-tricks">
          <div className={`bid-display ${isNil ? 'nil-bid' : ''}`}>
            <span className="bid-tricks-label">Bid</span>
            <span className="bid-tricks-value">{isNil ? 'Nil' : bid}</span>
          </div>
          <div className={`tricks-display ${overUnder !== null && overUnder >= 0 ? 'on-track' : ''} ${overUnder !== null && overUnder < 0 ? 'behind' : ''} ${isNil && trickCount > 0 ? 'nil-broken' : ''}`}>
            <span className="bid-tricks-label">Tricks</span>
            <span className="bid-tricks-value">{trickCount}</span>
          </div>
        </div>
      ) : (
        <div className="player-seat-info">
          <span className="waiting-bid-text">...</span>
        </div>
      )}
      <div className={`team-badge team-${player.team}`}>
        T{player.team}
      </div>
    </div>
  );
}
