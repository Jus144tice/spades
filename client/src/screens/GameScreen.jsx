import React, { useState, useEffect, useRef } from 'react';
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
  const [queuedCard, setQueuedCard] = useState(null);
  const queuedCardRef = useRef(null);
  queuedCardRef.current = queuedCard;

  const isSpectator = state.isSpectator;

  // For spectators: fixed layout (player 0=bottom, 1=left, 2=top, 3=right)
  // For players: relative to current player (me at bottom)
  const myIndex = isSpectator ? 0 : state.players.findIndex(p => p.id === state.playerId);
  const getRelativePlayer = (offset) => {
    const idx = (myIndex + offset) % 4;
    return state.players[idx];
  };

  const partner = getRelativePlayer(2); // across / top
  const leftOpp = getRelativePlayer(1); // left
  const rightOpp = getRelativePlayer(3); // right
  const me = isSpectator ? null : state.players[myIndex];

  const isMyTurn = !isSpectator && state.currentTurnId === state.playerId;
  const canQueue = !isSpectator && state.phase === 'playing' && !isMyTurn && state.currentTrick.length >= 1 && !state.trickWonPending;
  const showBacks = !isSpectator && state.gameSettings?.blindNil && !state.cardsRevealed && state.phase === 'bidding';

  const handlePlayCard = (card) => {
    if (!isMyTurn || state.phase !== 'playing') return;
    socket.emit('play_card', { card });
  };

  const handleQueueCard = (card) => {
    setQueuedCard(prev => {
      if (prev && prev.suit === card.suit && prev.rank === card.rank) return null;
      return card;
    });
  };

  // Auto-play queued card when it becomes our turn
  useEffect(() => {
    if (!isMyTurn || !queuedCard || state.trickWonPending || state.phase !== 'playing') return;
    // Verify card is still in hand
    const stillInHand = state.hand.some(c => c.suit === queuedCard.suit && c.rank === queuedCard.rank);
    if (!stillInHand) {
      setQueuedCard(null);
      return;
    }
    socket.emit('play_card', { card: queuedCard });
    setQueuedCard(null);
  }, [isMyTurn, queuedCard, state.trickWonPending, state.phase]);

  // Clear queue when trick context changes
  useEffect(() => {
    if (state.trickWonPending || state.currentTrick.length === 0 || state.phase !== 'playing') {
      setQueuedCard(null);
    }
  }, [state.trickWonPending, state.currentTrick.length, state.phase]);

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
            isLastTrickWinner={state.lastTrickWinner === partner?.id}
            turnTimer={state.turnTimer}
            isAfk={!!state.afkPlayers[partner?.id]}
            isBlindNil={state.blindNilPlayers?.includes(partner?.id)}
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
            isLastTrickWinner={state.lastTrickWinner === leftOpp?.id}
            turnTimer={state.turnTimer}
            isAfk={!!state.afkPlayers[leftOpp?.id]}
            isBlindNil={state.blindNilPlayers?.includes(leftOpp?.id)}
          />
        </div>

        {/* Trick area (center) */}
        <TrickArea
          currentTrick={state.currentTrick}
          players={state.players}
          myIndex={myIndex}
          lastTrickWinner={state.lastTrickWinner}
        />

        {/* Right opponent */}
        <div className="seat seat-right">
          <PlayerSeat
            player={rightOpp}
            bid={state.bids[rightOpp?.id]}
            tricks={state.tricksTaken[rightOpp?.id]}
            isCurrentTurn={state.currentTurnId === rightOpp?.id}
            isDealer={state.players.indexOf(rightOpp) === state.dealerIndex}
            isLastTrickWinner={state.lastTrickWinner === rightOpp?.id}
            turnTimer={state.turnTimer}
            isAfk={!!state.afkPlayers[rightOpp?.id]}
            isBlindNil={state.blindNilPlayers?.includes(rightOpp?.id)}
          />
        </div>

        {/* Bottom seat */}
        <div className="seat seat-bottom">
          {isSpectator ? (
            <PlayerSeat
              player={getRelativePlayer(0)}
              bid={state.bids[getRelativePlayer(0)?.id]}
              tricks={state.tricksTaken[getRelativePlayer(0)?.id]}
              isCurrentTurn={state.currentTurnId === getRelativePlayer(0)?.id}
              isDealer={0 === state.dealerIndex}
              isLastTrickWinner={state.lastTrickWinner === getRelativePlayer(0)?.id}
              turnTimer={state.turnTimer}
              isAfk={!!state.afkPlayers[getRelativePlayer(0)?.id]}
              isBlindNil={state.blindNilPlayers?.includes(getRelativePlayer(0)?.id)}
            />
          ) : (
            <PlayerSeat
              player={me}
              bid={state.bids[me?.id]}
              tricks={state.tricksTaken[me?.id]}
              isCurrentTurn={isMyTurn}
              isDealer={myIndex === state.dealerIndex}
              isMe
              isLastTrickWinner={state.lastTrickWinner === me?.id}
              turnTimer={state.turnTimer}
              isAfk={!!state.afkPlayers[me?.id]}
              isBlindNil={state.blindNilPlayers?.includes(me?.id)}
            />
          )}
        </div>
      </div>

      {/* Bidding panel — players only */}
      {!isSpectator && state.phase === 'bidding' && isMyTurn && <BidPanel />}
      {!isSpectator && state.phase === 'bidding' && !isMyTurn && (
        <div className="waiting-bid">
          Waiting for {state.players.find(p => p.id === state.currentTurnId)?.name} to bid...
          {Object.keys(state.bids).length > 0 && (
            <div className="bid-summary">
              <span className="bid-summary-item">Total bid: <strong>{Object.values(state.bids).reduce((s, b) => s + b, 0)}</strong></span>
              <span className="bid-summary-divider">|</span>
              <span className="bid-summary-item">Remaining: <strong>{13 - Object.values(state.bids).reduce((s, b) => s + b, 0)}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Hand — players only */}
      {!isSpectator && state.phase !== 'gameOver' && (
        <Hand
          cards={state.hand}
          onPlayCard={handlePlayCard}
          isMyTurn={isMyTurn && state.phase === 'playing'}
          currentTrick={state.currentTrick}
          spadesBroken={state.spadesBroken}
          queuedCard={queuedCard}
          onQueueCard={handleQueueCard}
          canQueue={canQueue}
          showBacks={showBacks}
          phase={state.phase}
        />
      )}

      {/* Spectator indicator */}
      {isSpectator && state.phase !== 'gameOver' && (
        <div className="spectating-banner">Spectating</div>
      )}

      {/* Round summary modal */}
      {state.roundSummary && !state.gameOverData && <RoundSummaryModal />}

      {/* Game over modal */}
      {state.gameOverData && <GameOverModal />}
    </div>
  );
}
