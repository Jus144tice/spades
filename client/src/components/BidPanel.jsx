import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';

export default function BidPanel() {
  const socket = useSocket();
  const { state } = useGame();
  const [selectedBid, setSelectedBid] = useState(null);

  const handleSubmit = () => {
    if (selectedBid === null) return;
    socket.emit('place_bid', { bid: selectedBid });
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
            className={`bid-btn ${selectedBid === i ? 'selected' : ''} ${i === 0 ? 'nil-btn' : ''}`}
            onClick={() => setSelectedBid(i)}
          >
            {i === 0 ? 'Nil' : i}
          </button>
        ))}
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
