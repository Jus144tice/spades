import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { useSocket } from './SocketContext.jsx';

const GameContext = createContext(null);

const TRICK_DISPLAY_DELAY = 1500; // ms to show completed trick before clearing

const initialState = {
  screen: 'join',
  playerId: null,
  playerName: '',
  lobbyCode: null,
  players: [],
  isHost: false,
  chatMessages: [],
  // Game state
  phase: null,
  hand: [],
  bids: {},
  currentTrick: [],
  tricksTaken: {},
  scores: { team1: 0, team2: 0 },
  books: { team1: 0, team2: 0 },
  currentTurnId: null,
  dealerIndex: 0,
  spadesBroken: false,
  roundNumber: 0,
  roundHistory: [],
  gameOverData: null,
  roundSummary: null,
  lastTrickWinner: null,
  trickWonPending: false,
  errorMessage: null,
  reconnecting: false,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, playerName: action.name };

    case 'LOBBY_CREATED':
      return {
        ...state,
        screen: 'lobby',
        playerId: action.data.playerId,
        lobbyCode: action.data.lobbyCode,
        players: action.data.players,
        isHost: true,
        reconnecting: false,
      };

    case 'LOBBY_JOINED':
      return {
        ...state,
        screen: 'lobby',
        playerId: action.data.playerId,
        lobbyCode: action.data.lobbyCode,
        players: action.data.players,
        isHost: action.data.isHost,
        chatMessages: (action.data.chatLog || []).map(m => ({
          sender: m.sender,
          message: m.message,
          timestamp: m.timestamp,
        })),
        reconnecting: false,
      };

    case 'PLAYER_JOINED':
      return {
        ...state,
        players: action.data.players,
      };

    case 'PLAYER_LEFT': {
      const newState = {
        ...state,
        players: action.data.players,
      };
      if (action.data.newHostId === state.playerId) {
        newState.isHost = true;
      }
      return newState;
    }

    case 'CHAT_MESSAGE':
      return {
        ...state,
        chatMessages: [...state.chatMessages, {
          sender: action.data.sender,
          message: action.data.message,
          timestamp: action.data.timestamp,
        }],
      };

    case 'TEAMS_UPDATED':
      return {
        ...state,
        players: action.data.players,
      };

    case 'GAME_STARTED':
      return {
        ...state,
        screen: 'game',
        phase: action.data.phase,
        hand: action.data.hand,
        bids: action.data.bids,
        currentTrick: action.data.currentTrick,
        tricksTaken: action.data.tricksTaken,
        scores: action.data.scores,
        books: action.data.books,
        currentTurnId: action.data.currentTurnId,
        dealerIndex: action.data.dealerIndex,
        spadesBroken: action.data.spadesBroken,
        roundNumber: action.data.roundNumber,
        players: action.data.players,
        roundHistory: action.data.roundHistory,
        gameOverData: null,
        roundSummary: null,
        reconnecting: false,
      };

    case 'BID_PLACED':
      return {
        ...state,
        bids: { ...state.bids, [action.data.playerId]: action.data.bid },
        currentTurnId: action.data.nextTurnId,
        phase: action.data.allBidsIn ? 'playing' : 'bidding',
      };

    case 'CARD_PLAYED': {
      const newHand = action.data.playerId === state.playerId
        ? state.hand.filter(c => !(c.suit === action.data.card.suit && c.rank === action.data.card.rank))
        : state.hand;
      // If a new card arrives while we're still showing a completed trick,
      // it belongs to the next trick — clear the old one first
      const baseTrick = state.trickWonPending ? [] : state.currentTrick;
      return {
        ...state,
        hand: newHand,
        currentTrick: [...baseTrick, { playerId: action.data.playerId, card: action.data.card }],
        currentTurnId: action.data.nextTurnId,
        spadesBroken: state.spadesBroken || action.data.card.suit === 'S',
        lastTrickWinner: state.trickWonPending ? null : state.lastTrickWinner,
        trickWonPending: false,
      };
    }

    case 'TRICK_WON':
      return {
        ...state,
        // Keep currentTrick visible — CLEAR_TRICK will remove it after delay
        tricksTaken: action.data.tricksTaken,
        lastTrickWinner: action.data.winnerId,
        trickWonPending: true,
      };

    case 'CLEAR_TRICK':
      // If trickWonPending is already false, a new trick's cards have arrived
      // and already cleared the old trick — don't wipe the new cards
      if (!state.trickWonPending) return state;
      return {
        ...state,
        currentTrick: [],
        lastTrickWinner: null,
        trickWonPending: false,
      };

    case 'ROUND_SCORED':
      return {
        ...state,
        scores: action.data.scores,
        books: action.data.books,
        roundSummary: action.data.roundSummary,
        roundHistory: [...state.roundHistory, action.data.roundSummary],
      };

    case 'NEW_ROUND':
      return {
        ...state,
        phase: action.data.phase,
        hand: action.data.hand,
        bids: {},
        currentTrick: [],
        tricksTaken: action.data.tricksTaken,
        currentTurnId: action.data.currentTurnId,
        dealerIndex: action.data.dealerIndex,
        spadesBroken: false,
        roundNumber: action.data.roundNumber,
        roundSummary: null,
        lastTrickWinner: null,
      };

    case 'GAME_OVER':
      return {
        ...state,
        phase: 'gameOver',
        gameOverData: action.data,
      };

    case 'RETURNED_TO_LOBBY':
      return {
        ...state,
        screen: 'lobby',
        phase: null,
        hand: [],
        bids: {},
        currentTrick: [],
        tricksTaken: {},
        currentTurnId: null,
        roundSummary: null,
        gameOverData: null,
        roundHistory: [],
        players: action.data.players,
      };

    case 'ERROR':
      return { ...state, errorMessage: action.data.message };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null };

    case 'CLEAR_ROUND_SUMMARY':
      return { ...state, roundSummary: null };

    case 'LEAVE':
      return { ...initialState };

    case 'SET_RECONNECTING':
      return { ...state, reconnecting: action.value };

    case 'REJOIN_SUCCESS': {
      const d = action.data;
      const chatMessages = (d.chatLog || []).map(m => ({
        sender: m.sender,
        message: m.message,
        timestamp: m.timestamp,
      }));

      if (d.screen === 'game') {
        return {
          ...state,
          screen: 'game',
          playerId: d.playerId,
          lobbyCode: d.lobbyCode,
          players: d.players,
          isHost: d.isHost,
          chatMessages,
          phase: d.phase,
          hand: d.hand,
          bids: d.bids,
          currentTrick: d.currentTrick,
          tricksTaken: d.tricksTaken,
          scores: d.scores,
          books: d.books,
          currentTurnId: d.currentTurnId,
          dealerIndex: d.dealerIndex,
          spadesBroken: d.spadesBroken,
          roundNumber: d.roundNumber,
          roundHistory: d.roundHistory,
          roundSummary: d.roundSummary || null,
          gameOverData: d.gameOverData || null,
          lastTrickWinner: null,
          trickWonPending: false,
          reconnecting: false,
        };
      }
      // Lobby rejoin
      return {
        ...state,
        screen: 'lobby',
        playerId: d.playerId,
        lobbyCode: d.lobbyCode,
        players: d.players,
        isHost: d.isHost,
        chatMessages,
        reconnecting: false,
      };
    }

    case 'REJOIN_FAILED':
      return { ...initialState };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const socket = useSocket();
  const trickTimerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!socket) return;

    const handlers = {
      lobby_created: (data) => dispatch({ type: 'LOBBY_CREATED', data }),
      lobby_joined: (data) => dispatch({ type: 'LOBBY_JOINED', data }),
      player_joined: (data) => dispatch({ type: 'PLAYER_JOINED', data }),
      player_left: (data) => dispatch({ type: 'PLAYER_LEFT', data }),
      chat_message: (data) => dispatch({ type: 'CHAT_MESSAGE', data }),
      teams_updated: (data) => dispatch({ type: 'TEAMS_UPDATED', data }),
      game_started: (data) => dispatch({ type: 'GAME_STARTED', data }),
      bid_placed: (data) => dispatch({ type: 'BID_PLACED', data }),
      card_played: (data) => dispatch({ type: 'CARD_PLAYED', data }),
      trick_won: (data) => {
        dispatch({ type: 'TRICK_WON', data });
        // Clear trick after delay so players can see the 4th card
        if (trickTimerRef.current) clearTimeout(trickTimerRef.current);
        trickTimerRef.current = setTimeout(() => {
          dispatch({ type: 'CLEAR_TRICK' });
        }, TRICK_DISPLAY_DELAY);
      },
      round_scored: (data) => dispatch({ type: 'ROUND_SCORED', data }),
      new_round: (data) => dispatch({ type: 'NEW_ROUND', data }),
      game_over: (data) => dispatch({ type: 'GAME_OVER', data }),
      returned_to_lobby: (data) => dispatch({ type: 'RETURNED_TO_LOBBY', data }),
      error_msg: (data) => dispatch({ type: 'ERROR', data }),
      rejoin_success: (data) => dispatch({ type: 'REJOIN_SUCCESS', data }),
      rejoin_failed: () => dispatch({ type: 'REJOIN_FAILED' }),
    };

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, handler);
    }

    // Handle disconnect/reconnect
    const onDisconnect = () => {
      const s = stateRef.current;
      // Only show reconnecting if we're in a lobby or game
      if (s.lobbyCode) {
        dispatch({ type: 'SET_RECONNECTING', value: true });
      }
    };

    const onConnect = () => {
      const s = stateRef.current;
      // If we had a lobby/game session, try to rejoin
      if (s.lobbyCode && s.reconnecting) {
        socket.emit('rejoin', { lobbyCode: s.lobbyCode });
      }
    };

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event, handler);
      }
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      if (trickTimerRef.current) clearTimeout(trickTimerRef.current);
    };
  }, [socket]);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
