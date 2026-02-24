import React from 'react';
import { render } from '@testing-library/react';
import { GameContext } from '../context/GameContext.jsx';
import { SocketContext } from '../context/SocketContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

// Minimal mock socket that records emits and stores handlers
export function createMockSocket() {
  const handlers = {};
  return {
    on: vi.fn((event, handler) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    __handlers: handlers,
  };
}

// Default game state matching initialState from GameContext
export function makeGameState(overrides = {}) {
  return {
    screen: 'join',
    playerId: null,
    playerName: '',
    lobbyCode: null,
    players: [],
    isHost: false,
    chatMessages: [],
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
    isSpectator: false,
    gameSettings: null,
    turnTimer: null,
    afkPlayers: {},
    blindNilPlayers: [],
    cardsRevealed: false,
    roomList: [],
    gamePaused: false,
    vacantSeats: [],
    playerCount: 4,
    mode: null,
    isPrivate: false,
    locked: false,
    ...overrides,
  };
}

// Render with GameContext
export function renderWithGame(ui, { state = {}, dispatch = vi.fn() } = {}) {
  return {
    dispatch,
    ...render(
      <GameContext.Provider value={{ state: makeGameState(state), dispatch }}>
        {ui}
      </GameContext.Provider>
    ),
  };
}

// Render with GameContext + SocketContext
export function renderWithGameAndSocket(ui, { state = {}, dispatch = vi.fn(), socket = createMockSocket() } = {}) {
  return {
    dispatch,
    socket,
    ...render(
      <SocketContext.Provider value={socket}>
        <GameContext.Provider value={{ state: makeGameState(state), dispatch }}>
          {ui}
        </GameContext.Provider>
      </SocketContext.Provider>
    ),
  };
}

// Card factory helpers
export const card = (suit, rank, mega = false) => ({ suit, rank, ...(mega ? { mega: true } : {}) });
export const spade = (rank) => card('S', rank);
export const heart = (rank) => card('H', rank);
export const diamond = (rank) => card('D', rank);
export const club = (rank) => card('C', rank);

// Standard 4-player setup
export const FOUR_PLAYERS = [
  { id: 'p1', name: 'Alice', team: 1, seatIndex: 0 },
  { id: 'p2', name: 'Bob', team: 2, seatIndex: 1 },
  { id: 'p3', name: 'Charlie', team: 1, seatIndex: 2 },
  { id: 'p4', name: 'Diana', team: 2, seatIndex: 3 },
];
