import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

export default function BidPanel() {
  const socket = useSocket();
  const [selectedBid, setSelectedBid] = useState(null);

  const handleSubmit = () => {
    if (selectedBid === null) return;
    socket.emit('place_bid', { bid: selectedBid });
  };

  return (
    <div className="bid-panel">
      <h3>Your Bid</h3>
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
