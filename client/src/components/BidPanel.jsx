import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext.jsx';
import { useGame } from '../context/GameContext.jsx';
import { getCardsPerPlayer } from '../modes.js';

export default function BidPanel() {
  const socket = useSocket();
  const { state, dispatch } = useGame();
  const [selectedBid, setSelectedBid] = useState(null);

  const settings = state.gameSettings || {};
  const cardsHidden = settings.blindNil && !state.cardsRevealed;
  const maxBid = getCardsPerPlayer(state.mode);

  const handleSubmit = () => {
    if (selectedBid === null) return;
    socket.emit('place_bid', { bid: selectedBid, blindNil: false });
  };

  const handleBlindNil = () => {
    socket.emit('place_bid', { bid: 0, blindNil: true });
  };

  const handleRevealCards = () => {
    dispatch({ type: 'REVEAL_CARDS' });
  };

  const totalBidSoFar = Object.values(state.bids).reduce((sum, b) => sum + b, 0);
  const bidsPlaced = Object.keys(state.bids).length;
  const remaining = maxBid - totalBidSoFar;

  // When cards are hidden, show blind nil choice instead of full bid grid
  if (cardsHidden) {
    return (
      <div className="bid-panel">
        <div className="blind-nil-choice">
          <p className="blind-nil-prompt">Your cards are face-down. Bid blind nil or reveal your hand.</p>
          {bidsPlaced > 0 && (
            <div className="bid-summary">
              <span className="bid-summary-item">Total bid: <strong>{totalBidSoFar}</strong></span>
              <span className="bid-summary-divider">|</span>
              <span className={`bid-summary-item ${remaining < 0 ? 'overbid' : ''}`}>
                Remaining: <strong>{remaining}</strong>
              </span>
            </div>
          )}
          <div className="blind-nil-buttons">
            <button
              className="btn btn-primary blind-nil-btn"
              onClick={handleBlindNil}
              title="Bid nil without seeing your cards (+/-200)"
            >
              Blind Nil
            </button>
            <button className="btn btn-secondary" onClick={handleRevealCards}>
              Show Cards
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        {Array.from({ length: maxBid + 1 }, (_, i) => (
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
