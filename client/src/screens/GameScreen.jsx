import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import Scoreboard from '../components/Scoreboard.jsx';
import Hand from '../components/Hand.jsx';
import TrickArea from '../components/TrickArea.jsx';
import BidPanel from '../components/BidPanel.jsx';
import GameOverModal from '../components/GameOverModal.jsx';
import RoundSummaryModal from '../components/RoundSummaryModal.jsx';
import PlayerSeat from '../components/PlayerSeat.jsx';

export default function GameScreen() {
  const { state } = useGame();
  const socket = useSocket();

  // Arrange players relative to current player
  // Current player is always at bottom (position 0)
  const myIndex = state.players.findIndex(p => p.id === state.playerId);
  const getRelativePlayer = (offset) => {
    const idx = (myIndex + offset) % 4;
    return state.players[idx];
  };

  const partner = getRelativePlayer(2); // across
  const leftOpp = getRelativePlayer(1); // left
  const rightOpp = getRelativePlayer(3); // right
  const me = state.players[myIndex];

  const isMyTurn = state.currentTurnId === state.playerId;

  const handlePlayCard = (card) => {
    if (!isMyTurn || state.phase !== 'playing') return;
    socket.emit('play_card', { card });
  };

  return (
    <div className="game-screen">
      <Scoreboard />

      <div className="game-table">
        {/* Partner (top) */}
        <div className="seat seat-top">
          <PlayerSeat
            player={partner}
            bid={state.bids[partner?.id]}
            tricks={state.tricksTaken[partner?.id]}
            isCurrentTurn={state.currentTurnId === partner?.id}
            isDealer={state.players.indexOf(partner) === state.dealerIndex}
          />
        </div>

        {/* Left opponent */}
        <div className="seat seat-left">
          <PlayerSeat
            player={leftOpp}
            bid={state.bids[leftOpp?.id]}
            tricks={state.tricksTaken[leftOpp?.id]}
            isCurrentTurn={state.currentTurnId === leftOpp?.id}
            isDealer={state.players.indexOf(leftOpp) === state.dealerIndex}
          />
        </div>

        {/* Trick area (center) */}
        <TrickArea
          currentTrick={state.currentTrick}
          players={state.players}
          myIndex={myIndex}
        />

        {/* Right opponent */}
        <div className="seat seat-right">
          <PlayerSeat
            player={rightOpp}
            bid={state.bids[rightOpp?.id]}
            tricks={state.tricksTaken[rightOpp?.id]}
            isCurrentTurn={state.currentTurnId === rightOpp?.id}
            isDealer={state.players.indexOf(rightOpp) === state.dealerIndex}
          />
        </div>

        {/* Me (bottom) */}
        <div className="seat seat-bottom">
          <PlayerSeat
            player={me}
            bid={state.bids[me?.id]}
            tricks={state.tricksTaken[me?.id]}
            isCurrentTurn={isMyTurn}
            isDealer={myIndex === state.dealerIndex}
            isMe
          />
        </div>
      </div>

      {/* Bidding panel */}
      {state.phase === 'bidding' && isMyTurn && <BidPanel />}
      {state.phase === 'bidding' && !isMyTurn && (
        <div className="waiting-bid">
          Waiting for {state.players.find(p => p.id === state.currentTurnId)?.name} to bid...
        </div>
      )}

      {/* Hand */}
      {state.phase !== 'gameOver' && (
        <Hand
          cards={state.hand}
          onPlayCard={handlePlayCard}
          isMyTurn={isMyTurn && state.phase === 'playing'}
          currentTrick={state.currentTrick}
          spadesBroken={state.spadesBroken}
        />
      )}

      {/* Round summary modal */}
      {state.roundSummary && !state.gameOverData && <RoundSummaryModal />}

      {/* Game over modal */}
      {state.gameOverData && <GameOverModal />}
    </div>
  );
}
