import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function BidPanel() {
  const socket = useSocket();
  const { state } = useGame();
  const [selectedBid, setSelectedBid] = useState(null);
  const [isBlindNil, setIsBlindNil] = useState(false);

  const settings = state.gameSettings || {};

  // Find partner's bid to check double nil restriction
  const myIndex = state.players.findIndex(p => p.id === state.playerId);
  const partnerIndex = (myIndex + 2) % 4;
  const partnerId = state.players[partnerIndex]?.id;
  const partnerBid = state.bids[partnerId];
  const partnerBidNil = partnerBid === 0;
  const nilDisabled = !settings.doubleNil && partnerBidNil;

  const handleSubmit = () => {
    if (selectedBid === null) return;
    socket.emit('place_bid', { bid: selectedBid, blindNil: isBlindNil });
  };

  const handleSelectBid = (bid) => {
    if (bid === 0 && nilDisabled) return;
    setSelectedBid(bid);
    setIsBlindNil(false);
  };

  const handleBlindNil = () => {
    if (nilDisabled) return;
    setSelectedBid(0);
    setIsBlindNil(true);
  };

  const totalBidSoFar = Object.values(state.bids).reduce((sum, b) => sum + b, 0);
  const bidsPlaced = Object.keys(state.bids).length;
  const remaining = 13 - totalBidSoFar;

  return (
    <div className="bid-panel">
      <h3>Your Bid</h3>
      {bidsPlaced > 0 && (
        <div className="bid-summary">
          <span className="bid-summary-item">Total bid: <strong>{totalBidSoFar}</strong></span>
          <span className="bid-summary-divider">|</span>
          <span className={`bid-summary-item ${remaining < 0 ? 'overbid' : ''}`}>
            Remaining: <strong>{remaining}</strong>
          </span>
        </div>
      )}
      <div className="bid-options">
        {Array.from({ length: 14 }, (_, i) => (
          <button
            key={i}
            className={`bid-btn ${selectedBid === i && !isBlindNil ? 'selected' : ''} ${i === 0 ? 'nil-btn' : ''} ${i === 0 && nilDisabled ? 'disabled' : ''}`}
            onClick={() => handleSelectBid(i)}
            disabled={i === 0 && nilDisabled}
            title={i === 0 && nilDisabled ? 'Partner already bid nil' : ''}
          >
            {i === 0 ? 'Nil' : i}
          </button>
        ))}
        {settings.blindNil && (
          <button
            className={`bid-btn blind-nil-btn ${isBlindNil ? 'selected' : ''} ${nilDisabled ? 'disabled' : ''}`}
            onClick={handleBlindNil}
            disabled={nilDisabled}
            title={nilDisabled ? 'Partner already bid nil' : 'Bid nil without seeing your cards (+/-200)'}
          >
            Blind Nil
          </button>
        )}
      </div>
      <button
        className="btn btn-primary"
        onClick={handleSubmit}
        disabled={selectedBid === null}
      >
        Submit Bid
      </button>
    </div>
  );
}
