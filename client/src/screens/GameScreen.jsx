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
import { getTricksPerRound, getSeatPosition } from '../modes.js';

export default function GameScreen() {
  const { state, dispatch } = useGame();
  const socket = useSocket();
  const [queuedCard, setQueuedCard] = useState(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const queuedCardRef = useRef(null);
  queuedCardRef.current = queuedCard;

  const isSpectator = state.isSpectator;
  const playerCount = state.playerCount || state.players.length || 4;
  const tricksPerRound = getTricksPerRound(state.mode);

  // For spectators: fixed layout (player 0=bottom, 1=left, 2=top, 3=right)
  // For players: relative to current player (me at bottom)
  const myIndex = isSpectator ? 0 : state.players.findIndex(p => p.id === state.playerId);
  const getRelativePlayer = (offset) => {
    const idx = (myIndex + offset) % playerCount;
    return state.players[idx];
  };

  const me = isSpectator ? null : state.players[myIndex];
  const isMyTurn = !isSpectator && state.currentTurnId === state.playerId;
  const canQueue = !isSpectator && state.phase === 'playing' && !isMyTurn && state.currentTrick.length >= 1 && !state.trickWonPending;
  const showBacks = !isSpectator && state.gameSettings?.blindNil && !state.cardsRevealed && state.phase === 'bidding';

  // Check if a player's seat is vacant
  const isSeatVacant = (player) => {
    if (!player || !state.vacantSeats?.length) return false;
    return state.vacantSeats.some(v => v.seatIndex === player.seatIndex);
  };

  // Build common seat props for a player
  const seatProps = (player, extraProps = {}) => ({
    player,
    bid: state.bids[player?.id],
    tricks: state.tricksTaken[player?.id],
    isCurrentTurn: state.currentTurnId === player?.id,
    isDealer: state.players.indexOf(player) === state.dealerIndex,
    isLastTrickWinner: state.lastTrickWinner === player?.id,
    turnTimer: state.turnTimer,
    isAfk: !!state.afkPlayers[player?.id],
    isBlindNil: state.blindNilPlayers?.includes(player?.id),
    isVacant: isSeatVacant(player),
    ...extraProps,
  });

  const handlePlayCard = (card) => {
    if (!isMyTurn || state.phase !== 'playing') return;
    socket.emit('play_card', { card });
  };

  const handleQueueCard = (card) => {
    setQueuedCard(prev => {
      if (prev && prev.suit === card.suit && prev.rank === card.rank && !!prev.mega === !!card.mega) return null;
      return card;
    });
  };

  // Auto-play queued card when it becomes our turn
  useEffect(() => {
    if (!isMyTurn || !queuedCard || state.trickWonPending || state.phase !== 'playing') return;
    // Verify card is still in hand
    const stillInHand = state.hand.some(c => c.suit === queuedCard.suit && c.rank === queuedCard.rank && !!c.mega === !!queuedCard.mega);
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

  // --- 4-player layout (classic grid) ---
  const renderFourPlayerLayout = () => {
    const partner = getRelativePlayer(2);
    const leftOpp = getRelativePlayer(1);
    const rightOpp = getRelativePlayer(3);

    return (
      <div className="game-table">
        {/* Partner (top) */}
        <div className="seat seat-top">
          <PlayerSeat {...seatProps(partner)} />
        </div>

        {/* Left opponent */}
        <div className="seat seat-left">
          <PlayerSeat {...seatProps(leftOpp)} />
        </div>

        {/* Trick area (center) */}
        <TrickArea
          currentTrick={state.currentTrick}
          players={state.players}
          myIndex={myIndex}
          playerCount={playerCount}
          lastTrickWinner={state.lastTrickWinner}
        />

        {/* Right opponent */}
        <div className="seat seat-right">
          <PlayerSeat {...seatProps(rightOpp)} />
        </div>

        {/* Bottom seat */}
        <div className="seat seat-bottom">
          {isSpectator ? (
            <PlayerSeat {...seatProps(getRelativePlayer(0))} />
          ) : (
            <PlayerSeat {...seatProps(me, { isMe: true, isCurrentTurn: isMyTurn, isDealer: myIndex === state.dealerIndex })} />
          )}
        </div>
      </div>
    );
  };

  // --- N-player layout (polygon) ---
  // For spoiler modes (5p, 7p), layoutSeats > playerCount so partners sit directly across
  // and the spoiler's opposite seat is empty.
  const layoutSeats = state.mode?.layoutSeats || playerCount;
  const mySeatIndex = me?.seatIndex ?? (isSpectator ? state.players[0]?.seatIndex ?? 0 : 0);

  const renderPolygonLayout = () => {
    // Build list of other players with their relative layout position
    const otherPlayers = state.players
      .filter(p => p.id !== state.playerId || isSpectator)
      .filter(p => isSpectator ? p !== state.players[0] : true)
      .map(p => ({
        player: p,
        layoutOffset: (p.seatIndex - mySeatIndex + layoutSeats) % layoutSeats,
      }));

    return (
      <div className="game-table game-table-polygon">
        {/* Other players around the table */}
        {otherPlayers.map(({ player, layoutOffset }) => {
          const pos = getSeatPosition(layoutOffset, layoutSeats);
          return (
            <div
              key={player.id}
              className="seat seat-polygon"
              style={{ position: 'absolute', left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' }}
            >
              <PlayerSeat {...seatProps(player)} />
            </div>
          );
        })}

        {/* Trick area (center) */}
        <TrickArea
          currentTrick={state.currentTrick}
          players={state.players}
          myIndex={myIndex}
          playerCount={playerCount}
          lastTrickWinner={state.lastTrickWinner}
          layoutSeats={layoutSeats}
          mySeatIndex={mySeatIndex}
        />

        {/* Bottom seat (me) */}
        <div className="seat seat-bottom-polygon">
          {isSpectator ? (
            <PlayerSeat {...seatProps(state.players[0])} />
          ) : (
            <PlayerSeat {...seatProps(me, { isMe: true, isCurrentTurn: isMyTurn, isDealer: myIndex === state.dealerIndex })} />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="game-screen">
      <Scoreboard />

      {playerCount === 4 ? renderFourPlayerLayout() : renderPolygonLayout()}

      {/* Bidding panel — players only */}
      {!isSpectator && state.phase === 'bidding' && isMyTurn && <BidPanel />}
      {!isSpectator && state.phase === 'bidding' && !isMyTurn && (
        <div className="waiting-bid">
          Waiting for {state.players.find(p => p.id === state.currentTurnId)?.name} to bid...
          {Object.keys(state.bids).length > 0 && (
            <div className="bid-summary">
              <span className="bid-summary-item">Total bid: <strong>{Object.values(state.bids).reduce((s, b) => s + b, 0)}</strong></span>
              <span className="bid-summary-divider">|</span>
              <span className="bid-summary-item">Remaining: <strong>{tricksPerRound - Object.values(state.bids).reduce((s, b) => s + b, 0)}</strong></span>
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
      {isSpectator && state.phase !== 'gameOver' && !state.gamePaused && (
        <div className="spectating-banner">Spectating</div>
      )}

      {/* Pause overlay */}
      {state.gamePaused && (
        <div className="pause-overlay">
          <div className="pause-overlay-content">
            <h2 className="pause-title">Game Paused</h2>
            <p className="pause-reason">Waiting for vacant seat(s) to be filled</p>

            <div className="pause-seats">
              {state.vacantSeats.map(seat => (
                <div key={seat.seatIndex} className="pause-seat-item">
                  <span className="pause-seat-info">
                    <span className={`pause-team-badge team-${seat.team}`}>T{seat.team}</span>
                    {seat.previousPlayerName} left
                  </span>
                  {state.isHost && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => socket.emit('fill_seat_with_bot', { seatIndex: seat.seatIndex })}
                    >
                      Replace with Bot
                    </button>
                  )}
                  {isSpectator && !state.isHost && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => socket.emit('fill_seat', { seatIndex: seat.seatIndex })}
                    >
                      Take Seat
                    </button>
                  )}
                </div>
              ))}
            </div>

            {!state.isHost && !isSpectator && (
              <p className="pause-hint">Waiting for the room owner to fill seats...</p>
            )}
          </div>
        </div>
      )}

      {/* Leave room button — hidden during pause and game over */}
      {!state.gamePaused && !state.gameOverData && (
        <button className="leave-room-btn" onClick={() => setShowLeaveConfirm(true)}>
          Leave Room
        </button>
      )}

      {/* Leave confirmation dialog */}
      {showLeaveConfirm && (
        <div className="leave-confirm-overlay" onClick={() => setShowLeaveConfirm(false)}>
          <div className="leave-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Leave this game? The game will be paused until your seat is filled.</p>
            <div className="leave-confirm-actions">
              <button className="btn btn-ghost" onClick={() => setShowLeaveConfirm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { socket.emit('leave_lobby'); dispatch({ type: 'LEAVE' }); }}>
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Round summary modal */}
      {state.roundSummary && !state.gameOverData && <RoundSummaryModal />}

      {/* Game over modal */}
      {state.gameOverData && <GameOverModal />}
    </div>
  );
}
