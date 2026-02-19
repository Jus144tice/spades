import React, { useState, useEffect } from 'react';

function TurnCountdown({ endsAt }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  const colorClass = secondsLeft > 30 ? '' : secondsLeft > 10 ? 'warning' : 'critical';

  return (
    <div className={`turn-countdown ${colorClass}`}>
      {secondsLeft}s
    </div>
  );
}

export default function PlayerSeat({ player, bid, tricks, isCurrentTurn, isDealer, isMe, isLastTrickWinner, turnTimer, isAfk }) {
  if (!player) return null;

  const trickCount = tricks || 0;
  const hasBid = bid !== undefined;
  const isNil = bid === 0;
  const overUnder = hasBid && !isNil ? trickCount - bid : null;

  const showTimer = turnTimer && turnTimer.playerId === player.id;

  return (
    <div className={`player-seat ${isCurrentTurn ? 'active-turn' : ''} ${isMe ? 'is-me' : ''} ${isLastTrickWinner ? 'trick-winner' : ''} ${isAfk ? 'is-afk' : ''}`}>
      {isDealer && (
        <div className="dealer-chip" title="Dealer">
          <span className="dealer-chip-icon">D</span>
        </div>
      )}
      {isAfk && <div className="afk-badge">AFK</div>}
      <div className="player-seat-name">
        {player.name}
      </div>
      {isCurrentTurn && (
        <div className="turn-indicator">
          <span className="turn-dot" />
          <span className="turn-text">{hasBid ? 'Playing' : 'Bidding'}</span>
        </div>
      )}
      {showTimer && <TurnCountdown endsAt={turnTimer.endsAt} />}
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
