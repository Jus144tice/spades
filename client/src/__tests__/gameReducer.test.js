import { gameReducer, initialState } from '../context/GameContext.jsx';

// Helper to reduce boilerplate
const reduce = (action, state = initialState) => gameReducer(state, action);

describe('gameReducer', () => {
  describe('SET_NAME', () => {
    it('sets playerName', () => {
      const result = reduce({ type: 'SET_NAME', name: 'Alice' });
      expect(result.playerName).toBe('Alice');
    });
  });

  describe('LOBBY_CREATED', () => {
    it('sets screen to lobby with host=true', () => {
      const result = reduce({
        type: 'LOBBY_CREATED',
        data: { playerId: 'p1', lobbyCode: 'ABCD', players: [{ id: 'p1', name: 'Alice' }], gameSettings: { gameMode: 4 } },
      });
      expect(result.screen).toBe('lobby');
      expect(result.playerId).toBe('p1');
      expect(result.lobbyCode).toBe('ABCD');
      expect(result.isHost).toBe(true);
      expect(result.players).toHaveLength(1);
      expect(result.reconnecting).toBe(false);
      expect(result.gameSettings).toEqual({ gameMode: 4 });
    });
  });

  describe('LOBBY_JOINED', () => {
    it('joins lobby normally', () => {
      const result = reduce({
        type: 'LOBBY_JOINED',
        data: { playerId: 'p2', lobbyCode: 'ABCD', players: [{ id: 'p1' }, { id: 'p2' }], isHost: false, chatLog: [] },
      });
      expect(result.screen).toBe('lobby');
      expect(result.isHost).toBe(false);
      expect(result.players).toHaveLength(2);
    });

    it('parses chatLog into chatMessages', () => {
      const result = reduce({
        type: 'LOBBY_JOINED',
        data: {
          playerId: 'p2', lobbyCode: 'ABCD', players: [], isHost: false,
          chatLog: [{ sender: 'Alice', message: 'hi', timestamp: 123 }],
        },
      });
      expect(result.chatMessages).toEqual([{ sender: 'Alice', message: 'hi', timestamp: 123 }]);
    });

    it('joins mid-game as spectator', () => {
      const result = reduce({
        type: 'LOBBY_JOINED',
        data: {
          playerId: 'p2', lobbyCode: 'ABCD', players: [], isHost: false, chatLog: [],
          gameInProgress: true,
          gameState: { phase: 'playing', hand: [], bids: {}, currentTrick: [], tricksTaken: {},
            scores: { team1: 50 }, books: { team1: 0 }, currentTurnId: 'p1',
            dealerIndex: 0, spadesBroken: true, roundNumber: 2, roundHistory: [],
            playerCount: 4, mode: null },
        },
      });
      expect(result.screen).toBe('game');
      expect(result.isSpectator).toBe(true);
      expect(result.phase).toBe('playing');
      expect(result.spadesBroken).toBe(true);
    });
  });

  describe('PLAYER_JOINED', () => {
    it('updates players array', () => {
      const state = { ...initialState, players: [{ id: 'p1' }] };
      const result = reduce({ type: 'PLAYER_JOINED', data: { players: [{ id: 'p1' }, { id: 'p2' }] } }, state);
      expect(result.players).toHaveLength(2);
    });
  });

  describe('PLAYER_LEFT', () => {
    it('updates players', () => {
      const state = { ...initialState, players: [{ id: 'p1' }, { id: 'p2' }], playerId: 'p1' };
      const result = reduce({ type: 'PLAYER_LEFT', data: { players: [{ id: 'p1' }], newHostId: null } }, state);
      expect(result.players).toHaveLength(1);
    });

    it('promotes to host when newHostId matches playerId', () => {
      const state = { ...initialState, playerId: 'p2', isHost: false };
      const result = reduce({ type: 'PLAYER_LEFT', data: { players: [{ id: 'p2' }], newHostId: 'p2' } }, state);
      expect(result.isHost).toBe(true);
    });

    it('does not promote when newHostId is different', () => {
      const state = { ...initialState, playerId: 'p2', isHost: false };
      const result = reduce({ type: 'PLAYER_LEFT', data: { players: [{ id: 'p1' }, { id: 'p2' }], newHostId: 'p1' } }, state);
      expect(result.isHost).toBe(false);
    });
  });

  describe('CHAT_MESSAGE', () => {
    it('appends message', () => {
      const state = { ...initialState, chatMessages: [{ sender: 'Alice', message: 'hi' }] };
      const result = reduce({ type: 'CHAT_MESSAGE', data: { sender: 'Bob', message: 'hello', timestamp: 123 } }, state);
      expect(result.chatMessages).toHaveLength(2);
      expect(result.chatMessages[1].sender).toBe('Bob');
    });
  });

  describe('TEAMS_UPDATED', () => {
    it('updates players', () => {
      const result = reduce({ type: 'TEAMS_UPDATED', data: { players: [{ id: 'p1', team: 1 }] } });
      expect(result.players[0].team).toBe(1);
    });
  });

  describe('GAME_STARTED', () => {
    it('transitions to game screen with full state', () => {
      const data = {
        phase: 'bidding', hand: [{ suit: 'S', rank: 'A' }], bids: {}, currentTrick: [],
        tricksTaken: {}, scores: { team1: 0, team2: 0 }, books: { team1: 0, team2: 0 },
        currentTurnId: 'p1', dealerIndex: 0, spadesBroken: false, roundNumber: 1,
        players: [{ id: 'p1' }], roundHistory: [], playerCount: 4, mode: null,
        blindNilPlayers: [],
      };
      const result = reduce({ type: 'GAME_STARTED', data });
      expect(result.screen).toBe('game');
      expect(result.phase).toBe('bidding');
      expect(result.hand).toHaveLength(1);
      expect(result.gameOverData).toBeNull();
      expect(result.roundSummary).toBeNull();
      expect(result.isSpectator).toBe(false);
    });
  });

  describe('BID_PLACED', () => {
    it('records bid and advances turn', () => {
      const state = { ...initialState, bids: {}, blindNilPlayers: [] };
      const result = reduce({
        type: 'BID_PLACED',
        data: { playerId: 'p1', bid: 3, nextTurnId: 'p2', allBidsIn: false, blindNil: false },
      }, state);
      expect(result.bids.p1).toBe(3);
      expect(result.currentTurnId).toBe('p2');
      expect(result.phase).toBe('bidding');
    });

    it('transitions to playing when allBidsIn', () => {
      const result = reduce({
        type: 'BID_PLACED',
        data: { playerId: 'p4', bid: 2, nextTurnId: 'p1', allBidsIn: true, blindNil: false },
      }, { ...initialState, blindNilPlayers: [] });
      expect(result.phase).toBe('playing');
    });

    it('tracks blind nil players', () => {
      const result = reduce({
        type: 'BID_PLACED',
        data: { playerId: 'p1', bid: 0, nextTurnId: 'p2', allBidsIn: false, blindNil: true },
      }, { ...initialState, blindNilPlayers: [] });
      expect(result.blindNilPlayers).toContain('p1');
    });

    it('clears turnTimer', () => {
      const state = { ...initialState, turnTimer: { playerId: 'p1', endsAt: 999 }, blindNilPlayers: [] };
      const result = reduce({
        type: 'BID_PLACED',
        data: { playerId: 'p1', bid: 3, nextTurnId: 'p2', allBidsIn: false, blindNil: false },
      }, state);
      expect(result.turnTimer).toBeNull();
    });
  });

  describe('CARD_PLAYED', () => {
    it('removes card from hand when current player plays', () => {
      const state = {
        ...initialState, playerId: 'p1', trickWonPending: false,
        hand: [{ suit: 'S', rank: 'A' }, { suit: 'H', rank: 'K' }],
        currentTrick: [],
      };
      const result = reduce({
        type: 'CARD_PLAYED',
        data: { playerId: 'p1', card: { suit: 'S', rank: 'A' }, nextTurnId: 'p2' },
      }, state);
      expect(result.hand).toHaveLength(1);
      expect(result.hand[0].suit).toBe('H');
    });

    it('does not remove cards when another player plays', () => {
      const state = {
        ...initialState, playerId: 'p1', trickWonPending: false,
        hand: [{ suit: 'S', rank: 'A' }], currentTrick: [],
      };
      const result = reduce({
        type: 'CARD_PLAYED',
        data: { playerId: 'p2', card: { suit: 'H', rank: 'K' }, nextTurnId: 'p3' },
      }, state);
      expect(result.hand).toHaveLength(1);
    });

    it('appends to currentTrick', () => {
      const state = { ...initialState, trickWonPending: false, currentTrick: [] };
      const result = reduce({
        type: 'CARD_PLAYED',
        data: { playerId: 'p1', card: { suit: 'S', rank: 'A' }, nextTurnId: 'p2' },
      }, state);
      expect(result.currentTrick).toHaveLength(1);
      expect(result.currentTrick[0].card.suit).toBe('S');
    });

    it('sets spadesBroken when spade is played', () => {
      const state = { ...initialState, spadesBroken: false, trickWonPending: false, currentTrick: [] };
      const result = reduce({
        type: 'CARD_PLAYED',
        data: { playerId: 'p1', card: { suit: 'S', rank: '2' }, nextTurnId: 'p2' },
      }, state);
      expect(result.spadesBroken).toBe(true);
    });

    it('clears old trick when card arrives during trickWonPending', () => {
      const state = {
        ...initialState, trickWonPending: true,
        currentTrick: [{ playerId: 'p1', card: { suit: 'S', rank: 'A' } }],
      };
      const result = reduce({
        type: 'CARD_PLAYED',
        data: { playerId: 'p2', card: { suit: 'H', rank: 'K' }, nextTurnId: 'p3' },
      }, state);
      // Old trick is cleared, new card starts fresh
      expect(result.currentTrick).toHaveLength(1);
      expect(result.currentTrick[0].card.suit).toBe('H');
      expect(result.trickWonPending).toBe(false);
    });
  });

  describe('TRICK_WON', () => {
    it('updates tricksTaken and sets pending', () => {
      const result = reduce({
        type: 'TRICK_WON',
        data: { winnerId: 'p1', tricksTaken: { p1: 3 } },
      });
      expect(result.tricksTaken.p1).toBe(3);
      expect(result.lastTrickWinner).toBe('p1');
      expect(result.trickWonPending).toBe(true);
    });
  });

  describe('CLEAR_TRICK', () => {
    it('clears trick when pending', () => {
      const state = {
        ...initialState, trickWonPending: true,
        currentTrick: [{ playerId: 'p1', card: { suit: 'S', rank: 'A' } }],
        lastTrickWinner: 'p1',
      };
      const result = reduce({ type: 'CLEAR_TRICK' }, state);
      expect(result.currentTrick).toEqual([]);
      expect(result.lastTrickWinner).toBeNull();
      expect(result.trickWonPending).toBe(false);
    });

    it('is a no-op when not pending (new trick already started)', () => {
      const state = {
        ...initialState, trickWonPending: false,
        currentTrick: [{ playerId: 'p2', card: { suit: 'H', rank: 'K' } }],
      };
      const result = reduce({ type: 'CLEAR_TRICK' }, state);
      expect(result.currentTrick).toHaveLength(1); // not cleared
    });
  });

  describe('ROUND_SCORED', () => {
    it('updates scores and books, stores roundSummary', () => {
      const summary = { round: 1, teamScores: {} };
      const result = reduce({
        type: 'ROUND_SCORED',
        data: { scores: { team1: 100 }, books: { team1: 2 }, roundSummary: summary },
      });
      expect(result.scores.team1).toBe(100);
      expect(result.books.team1).toBe(2);
      expect(result.roundSummary).toBe(summary);
      expect(result.roundHistory).toHaveLength(1);
    });
  });

  describe('NEW_ROUND', () => {
    it('resets round state', () => {
      const state = {
        ...initialState, spadesBroken: true, bids: { p1: 3 },
        currentTrick: [{ playerId: 'p1', card: { suit: 'S', rank: 'A' } }],
        blindNilPlayers: ['p1'], cardsRevealed: true,
      };
      const result = reduce({
        type: 'NEW_ROUND',
        data: { phase: 'bidding', hand: [{ suit: 'H', rank: '2' }], tricksTaken: {},
          currentTurnId: 'p1', dealerIndex: 1, roundNumber: 2 },
      }, state);
      expect(result.phase).toBe('bidding');
      expect(result.spadesBroken).toBe(false);
      expect(result.bids).toEqual({});
      expect(result.currentTrick).toEqual([]);
      expect(result.blindNilPlayers).toEqual([]);
      expect(result.cardsRevealed).toBe(false);
      expect(result.roundNumber).toBe(2);
    });
  });

  describe('GAME_OVER', () => {
    it('sets phase to gameOver', () => {
      const data = { winner: 'team1', finalScores: {} };
      const result = reduce({ type: 'GAME_OVER', data });
      expect(result.phase).toBe('gameOver');
      expect(result.gameOverData).toBe(data);
    });
  });

  describe('RETURNED_TO_LOBBY', () => {
    it('resets game state and returns to lobby', () => {
      const state = { ...initialState, screen: 'game', phase: 'playing', hand: [{ suit: 'S', rank: 'A' }] };
      const result = reduce({ type: 'RETURNED_TO_LOBBY', data: { players: [{ id: 'p1' }] } }, state);
      expect(result.screen).toBe('lobby');
      expect(result.phase).toBeNull();
      expect(result.hand).toEqual([]);
      expect(result.isSpectator).toBe(false);
      expect(result.players).toHaveLength(1);
    });
  });

  describe('ERROR / CLEAR_ERROR', () => {
    it('sets errorMessage', () => {
      const result = reduce({ type: 'ERROR', data: { message: 'Something went wrong' } });
      expect(result.errorMessage).toBe('Something went wrong');
    });

    it('clears errorMessage', () => {
      const state = { ...initialState, errorMessage: 'error' };
      const result = reduce({ type: 'CLEAR_ERROR' }, state);
      expect(result.errorMessage).toBeNull();
    });
  });

  describe('CLEAR_ROUND_SUMMARY', () => {
    it('clears roundSummary', () => {
      const state = { ...initialState, roundSummary: { round: 1 } };
      const result = reduce({ type: 'CLEAR_ROUND_SUMMARY' }, state);
      expect(result.roundSummary).toBeNull();
    });
  });

  describe('REVEAL_CARDS', () => {
    it('sets cardsRevealed to true', () => {
      const result = reduce({ type: 'REVEAL_CARDS' });
      expect(result.cardsRevealed).toBe(true);
    });
  });

  describe('GAME_SETTINGS_UPDATED', () => {
    it('replaces gameSettings', () => {
      const settings = { gameMode: 6, winTarget: 300 };
      const result = reduce({ type: 'GAME_SETTINGS_UPDATED', data: settings });
      expect(result.gameSettings).toEqual(settings);
    });
  });

  describe('TURN_TIMER / TURN_TIMER_CLEAR', () => {
    it('sets turnTimer', () => {
      const result = reduce({ type: 'TURN_TIMER', data: { playerId: 'p1', endsAt: 1000 } });
      expect(result.turnTimer).toEqual({ playerId: 'p1', endsAt: 1000 });
    });

    it('clears turnTimer', () => {
      const state = { ...initialState, turnTimer: { playerId: 'p1', endsAt: 1000 } };
      const result = reduce({ type: 'TURN_TIMER_CLEAR' }, state);
      expect(result.turnTimer).toBeNull();
    });
  });

  describe('PLAYER_AFK_CHANGED', () => {
    it('adds AFK player', () => {
      const result = reduce({ type: 'PLAYER_AFK_CHANGED', data: { playerId: 'p1', isAfk: true } });
      expect(result.afkPlayers.p1).toBe(true);
    });

    it('removes AFK player', () => {
      const state = { ...initialState, afkPlayers: { p1: true } };
      const result = reduce({ type: 'PLAYER_AFK_CHANGED', data: { playerId: 'p1', isAfk: false } }, state);
      expect(result.afkPlayers.p1).toBeUndefined();
    });
  });

  describe('ROOM_LIST', () => {
    it('sets roomList', () => {
      const rooms = [{ code: 'ABCD', players: 3 }];
      const result = reduce({ type: 'ROOM_LIST', data: rooms });
      expect(result.roomList).toBe(rooms);
    });
  });

  describe('GAME_PAUSED / GAME_RESUMED', () => {
    it('pauses game', () => {
      const result = reduce({ type: 'GAME_PAUSED', data: { vacantSeats: [{ seatIndex: 0 }] } });
      expect(result.gamePaused).toBe(true);
      expect(result.vacantSeats).toHaveLength(1);
    });

    it('resumes game', () => {
      const state = { ...initialState, gamePaused: true, vacantSeats: [{ seatIndex: 0 }] };
      const result = reduce({ type: 'GAME_RESUMED' }, state);
      expect(result.gamePaused).toBe(false);
      expect(result.vacantSeats).toEqual([]);
    });
  });

  describe('SEAT_FILLED', () => {
    it('updates players and vacantSeats', () => {
      const result = reduce({
        type: 'SEAT_FILLED',
        data: { players: [{ id: 'p1' }, { id: 'p5' }], vacantSeats: [] },
      });
      expect(result.players).toHaveLength(2);
      expect(result.vacantSeats).toEqual([]);
    });
  });

  describe('GAME_STATE_SYNC', () => {
    it('restores full game state', () => {
      const data = {
        phase: 'playing', hand: [{ suit: 'S', rank: 'A' }], bids: { p1: 3 },
        currentTrick: [], tricksTaken: {}, scores: { team1: 50 }, books: { team1: 1 },
        currentTurnId: 'p2', dealerIndex: 1, spadesBroken: true, roundNumber: 3,
        roundHistory: [], players: [{ id: 'p1' }], playerCount: 4, mode: null,
      };
      const result = reduce({ type: 'GAME_STATE_SYNC', data });
      expect(result.phase).toBe('playing');
      expect(result.hand).toHaveLength(1);
      expect(result.scores.team1).toBe(50);
      expect(result.gamePaused).toBe(false);
      expect(result.vacantSeats).toEqual([]);
    });
  });

  describe('LEAVE', () => {
    it('resets to initialState', () => {
      const state = { ...initialState, screen: 'game', lobbyCode: 'ABCD', hand: [{ suit: 'S', rank: 'A' }] };
      const result = reduce({ type: 'LEAVE' }, state);
      expect(result).toEqual(initialState);
    });
  });

  describe('SET_RECONNECTING', () => {
    it('sets reconnecting', () => {
      const result = reduce({ type: 'SET_RECONNECTING', value: true });
      expect(result.reconnecting).toBe(true);
    });
  });

  describe('REJOIN_SUCCESS', () => {
    it('restores game state on game rejoin', () => {
      const data = {
        screen: 'game', playerId: 'p1', lobbyCode: 'ABCD', players: [{ id: 'p1' }],
        isHost: true, chatLog: [], phase: 'playing', hand: [{ suit: 'S', rank: 'A' }],
        bids: { p1: 3 }, currentTrick: [], tricksTaken: { p1: 2 },
        scores: { team1: 100 }, books: { team1: 1 }, currentTurnId: 'p2',
        dealerIndex: 0, spadesBroken: true, roundNumber: 2, roundHistory: [],
        playerCount: 4, mode: null,
      };
      const result = reduce({ type: 'REJOIN_SUCCESS', data });
      expect(result.screen).toBe('game');
      expect(result.phase).toBe('playing');
      expect(result.reconnecting).toBe(false);
      expect(result.cardsRevealed).toBe(true);
    });

    it('restores lobby state on lobby rejoin', () => {
      const data = {
        screen: 'lobby', playerId: 'p1', lobbyCode: 'ABCD', players: [{ id: 'p1' }],
        isHost: true, chatLog: [{ sender: 'Alice', message: 'hi', timestamp: 1 }],
      };
      const result = reduce({ type: 'REJOIN_SUCCESS', data });
      expect(result.screen).toBe('lobby');
      expect(result.chatMessages).toHaveLength(1);
      expect(result.reconnecting).toBe(false);
    });
  });

  describe('REJOIN_FAILED', () => {
    it('resets to initialState', () => {
      const state = { ...initialState, screen: 'game', lobbyCode: 'ABCD' };
      const result = reduce({ type: 'REJOIN_FAILED' }, state);
      expect(result).toEqual(initialState);
    });
  });

  describe('default', () => {
    it('returns state unchanged for unknown action', () => {
      const state = { ...initialState, playerName: 'Alice' };
      const result = reduce({ type: 'UNKNOWN_ACTION' }, state);
      expect(result).toBe(state);
    });
  });
});
