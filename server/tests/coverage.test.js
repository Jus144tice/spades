/**
 * Extended test suite for coverage gaps.
 * Tests lobby management, preferences, AI helpers, GameState edge cases,
 * scoring edge cases, and bot bidding scenarios.
 *
 * Run with: node --test server/tests/coverage.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUITS, RANKS, RANK_VALUE, getCardValue,
  DEFAULT_GAME_SETTINGS, NIL_BONUS, BLIND_NIL_BONUS, TEN_TRICK_BONUS,
  BOOK_PENALTY, BOOK_PENALTY_THRESHOLD,
} from '../game/constants.js';
import { GAME_MODES, getMode } from '../game/modes.js';
import { buildTeamLookup, initTeamScores, getTeamKeys } from '../game/modeHelpers.js';
import { validatePlay, determineTrickWinner } from '../game/tricks.js';
import { scoreRound, checkWinner } from '../game/scoring.js';
import { GameState } from '../game/GameState.js';
import { parseCardSort, validatePreferences, mergeWithDefaults, hasCompletedSetup, DEFAULTS, TABLE_COLORS } from '../game/preferences.js';
import {
  createLobby, joinLobby, leaveLobby, getLobby, getPlayerInfo,
  addBot, fillWithBots, removeBot, assignTeam, autoAssignTeams,
  canStartGame, updateGameSettings, addChatMessage, arrangeSeating,
  pauseGame, fillSeat, fillSeatWithBot,
} from '../lobby.js';
import { groupBySuit, pickHighest, pickLowest, pickMiddleCard, pickByDisposition, getValidLeads, getCurrentWinner } from '../ai/helpers.js';
import { botBid, evaluateBlindNil, getDesperationContext } from '../ai/bidding.js';
import { createDeck, shuffle, deal } from '../game/deck.js';

// ===== LOBBY MANAGEMENT =====

let lobbyCounter = 0;
function uniqueSocket() { return `test-socket-${++lobbyCounter}-${Date.now()}`; }

describe('Lobby - Create & Join', () => {
  it('createLobby returns a valid lobby', () => {
    const sid = uniqueSocket();
    const lobby = createLobby(sid, 'Alice', 'user1');
    assert.ok(lobby.code);
    assert.equal(lobby.code.length, 4);
    assert.equal(lobby.hostId, sid);
    assert.equal(lobby.players.length, 1);
    assert.equal(lobby.players[0].name, 'Alice');
    assert.equal(lobby.players[0].id, sid);
    assert.equal(lobby.players[0].team, null);
    assert.deepEqual(lobby.gameSettings, { ...DEFAULT_GAME_SETTINGS });
    assert.equal(lobby.paused, false);
    // Cleanup
    leaveLobby(sid);
  });

  it('joinLobby adds player to existing room', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const joiner = uniqueSocket();
    const result = joinLobby(joiner, 'Bob', lobby.code);
    assert.ok(!result.error);
    assert.equal(result.lobby.players.length, 2);
    assert.equal(result.player.name, 'Bob');
    assert.equal(result.joinedAsSpectator, false);
    // Cleanup
    leaveLobby(joiner);
    leaveLobby(host);
  });

  it('joinLobby is case-insensitive for code', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const joiner = uniqueSocket();
    const result = joinLobby(joiner, 'Bob', lobby.code.toLowerCase());
    assert.ok(!result.error);
    leaveLobby(joiner);
    leaveLobby(host);
  });

  it('joinLobby rejects invalid room code', () => {
    const result = joinLobby(uniqueSocket(), 'Bob', 'ZZZZ');
    assert.equal(result.error, 'Room not found');
  });

  it('joinLobby rejects duplicate name', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const result = joinLobby(uniqueSocket(), 'Alice', lobby.code);
    assert.equal(result.error, 'Name already taken in this room');
    leaveLobby(host);
  });

  it('joinLobby rejects when room is full (10 players)', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'P0');
    const sockets = [host];
    for (let i = 1; i < 10; i++) {
      const sid = uniqueSocket();
      sockets.push(sid);
      joinLobby(sid, `P${i}`, lobby.code);
    }
    const result = joinLobby(uniqueSocket(), 'Extra', lobby.code);
    assert.equal(result.error, 'Room is full');
    // Cleanup
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('getLobby and getPlayerInfo work', () => {
    const sid = uniqueSocket();
    const lobby = createLobby(sid, 'Alice');
    assert.ok(getLobby(lobby.code));
    const info = getPlayerInfo(sid);
    assert.equal(info.playerName, 'Alice');
    assert.equal(info.lobbyCode, lobby.code);
    leaveLobby(sid);
  });
});

describe('Lobby - Leave', () => {
  it('leaving as last human disbands lobby', () => {
    const sid = uniqueSocket();
    const lobby = createLobby(sid, 'Alice');
    const code = lobby.code;
    const result = leaveLobby(sid);
    assert.equal(result.disbanded, true);
    assert.ok(!getLobby(code));
  });

  it('host leaving transfers host to next human', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const p2 = uniqueSocket();
    joinLobby(p2, 'Bob', lobby.code);
    const result = leaveLobby(host);
    assert.equal(result.disbanded, false);
    assert.equal(result.newHostId, p2);
    assert.equal(getLobby(lobby.code).hostId, p2);
    leaveLobby(p2);
  });

  it('non-host leaving does not transfer host', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const p2 = uniqueSocket();
    joinLobby(p2, 'Bob', lobby.code);
    const result = leaveLobby(p2);
    assert.equal(result.disbanded, false);
    assert.equal(result.newHostId, null);
    leaveLobby(host);
  });

  it('leaveLobby returns null for unknown socket', () => {
    const result = leaveLobby('unknown-socket');
    assert.equal(result, null);
  });
});

describe('Lobby - Bots', () => {
  it('addBot adds a bot player', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const result = addBot(lobby.code);
    assert.ok(!result.error);
    assert.ok(result.player.isBot);
    assert.ok(result.player.id.startsWith('bot-'));
    assert.ok(result.player.name);
    assert.equal(lobby.players.length, 2);
    leaveLobby(host);
  });

  it('addBot rejects when room is full for mode', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    // Default mode is 4, so fill 3 more
    for (let i = 0; i < 3; i++) addBot(lobby.code);
    assert.equal(lobby.players.length, 4);
    const result = addBot(lobby.code);
    assert.ok(result.error);
    leaveLobby(host);
  });

  it('addBot rejects invalid lobby', () => {
    const result = addBot('INVALID');
    assert.equal(result.error, 'Lobby not found');
  });

  it('fillWithBots fills all remaining slots', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const result = fillWithBots(lobby.code);
    assert.equal(result.added.length, 3); // 4-player mode, 1 human + 3 bots
    assert.equal(lobby.players.length, 4);
    assert.ok(result.added.every(p => p.isBot));
    leaveLobby(host);
  });

  it('fillWithBots with no slots returns empty', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    for (let i = 0; i < 3; i++) addBot(lobby.code);
    const result = fillWithBots(lobby.code);
    assert.equal(result.added.length, 0);
    leaveLobby(host);
  });

  it('removeBot removes a bot', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const { player: bot } = addBot(lobby.code);
    assert.equal(lobby.players.length, 2);
    const result = removeBot(lobby.code, bot.id);
    assert.ok(!result.error);
    assert.equal(result.botName, bot.name);
    assert.equal(lobby.players.length, 1);
    leaveLobby(host);
  });

  it('removeBot rejects non-bot or missing bot', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    assert.ok(removeBot(lobby.code, 'fake-id').error);
    assert.ok(removeBot(lobby.code, host).error); // human, not bot
    leaveLobby(host);
  });
});

describe('Lobby - Team Assignment', () => {
  it('assignTeam assigns player to team', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const result = assignTeam(lobby.code, host, 1);
    assert.ok(!result.error);
    assert.equal(lobby.players[0].team, 1);
    leaveLobby(host);
  });

  it('assignTeam rejects full team', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const p2 = uniqueSocket();
    joinLobby(p2, 'Bob', lobby.code);
    const p3 = uniqueSocket();
    joinLobby(p3, 'Carol', lobby.code);
    // 4-player mode, team 1 has size 2
    assignTeam(lobby.code, host, 1);
    assignTeam(lobby.code, p2, 1);
    const result = assignTeam(lobby.code, p3, 1);
    assert.ok(result.error);
    assert.ok(result.error.includes('full'));
    leaveLobby(p3);
    leaveLobby(p2);
    leaveLobby(host);
  });

  it('assignTeam to null unassigns (spectator)', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    assignTeam(lobby.code, host, 1);
    assert.equal(lobby.players[0].team, 1);
    assignTeam(lobby.code, host, null);
    assert.equal(lobby.players[0].team, null);
    leaveLobby(host);
  });

  it('autoAssignTeams shuffles players into teams', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const sockets = [host];
    for (let i = 1; i < 4; i++) {
      const sid = uniqueSocket();
      sockets.push(sid);
      joinLobby(sid, `P${i}`, lobby.code);
    }
    const result = autoAssignTeams(lobby.code);
    assert.ok(!result.error);
    // All 4 should have teams
    const assigned = lobby.players.filter(p => p.team !== null);
    assert.equal(assigned.length, 4);
    // Team 1 and team 2 each have 2
    assert.equal(lobby.players.filter(p => p.team === 1).length, 2);
    assert.equal(lobby.players.filter(p => p.team === 2).length, 2);
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('autoAssignTeams rejects with not enough players', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const result = autoAssignTeams(lobby.code);
    assert.ok(result.error);
    leaveLobby(host);
  });

  it('autoAssignTeams handles extra players as spectators', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const sockets = [host];
    for (let i = 1; i < 6; i++) {
      const sid = uniqueSocket();
      sockets.push(sid);
      joinLobby(sid, `P${i}`, lobby.code);
    }
    // 4-player mode, 6 players — 4 get teams, 2 spectate
    autoAssignTeams(lobby.code);
    const assigned = lobby.players.filter(p => p.team !== null);
    const spectators = lobby.players.filter(p => p.team === null);
    assert.equal(assigned.length, 4);
    assert.equal(spectators.length, 2);
    for (const s of sockets.reverse()) leaveLobby(s);
  });
});

describe('Lobby - canStartGame', () => {
  it('returns valid when teams are correct', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const sockets = [host];
    for (let i = 1; i < 4; i++) {
      const sid = uniqueSocket();
      sockets.push(sid);
      joinLobby(sid, `P${i}`, lobby.code);
    }
    autoAssignTeams(lobby.code);
    const result = canStartGame(lobby.code, host);
    assert.ok(result.valid);
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('rejects non-host', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const p2 = uniqueSocket();
    joinLobby(p2, 'Bob', lobby.code);
    const result = canStartGame(lobby.code, p2);
    assert.ok(result.error);
    assert.ok(result.error.includes('host'));
    leaveLobby(p2);
    leaveLobby(host);
  });

  it('rejects incomplete teams', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const p2 = uniqueSocket();
    joinLobby(p2, 'Bob', lobby.code);
    assignTeam(lobby.code, host, 1);
    assignTeam(lobby.code, p2, 2);
    // Only 2 of 4 slots filled
    const result = canStartGame(lobby.code, host);
    assert.ok(result.error);
    leaveLobby(p2);
    leaveLobby(host);
  });
});

describe('Lobby - updateGameSettings', () => {
  it('updates winTarget with clamping', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    updateGameSettings(lobby.code, { winTarget: 300 });
    assert.equal(lobby.gameSettings.winTarget, 300);
    updateGameSettings(lobby.code, { winTarget: 50 }); // below min
    assert.equal(lobby.gameSettings.winTarget, 100);
    updateGameSettings(lobby.code, { winTarget: 2000 }); // above max
    assert.equal(lobby.gameSettings.winTarget, 1000);
    leaveLobby(host);
  });

  it('updates bookThreshold with clamping', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    updateGameSettings(lobby.code, { bookThreshold: 7 });
    assert.equal(lobby.gameSettings.bookThreshold, 7);
    updateGameSettings(lobby.code, { bookThreshold: 2 }); // below min
    assert.equal(lobby.gameSettings.bookThreshold, 5);
    updateGameSettings(lobby.code, { bookThreshold: 20 }); // above max
    assert.equal(lobby.gameSettings.bookThreshold, 15);
    leaveLobby(host);
  });

  it('updates boolean settings', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    updateGameSettings(lobby.code, { blindNil: true });
    assert.equal(lobby.gameSettings.blindNil, true);
    updateGameSettings(lobby.code, { moonshot: false });
    assert.equal(lobby.gameSettings.moonshot, false);
    updateGameSettings(lobby.code, { tenBidBonus: false });
    assert.equal(lobby.gameSettings.tenBidBonus, false);
    leaveLobby(host);
  });

  it('changing gameMode resets team assignments', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const p2 = uniqueSocket();
    joinLobby(p2, 'Bob', lobby.code);
    assignTeam(lobby.code, host, 1);
    assignTeam(lobby.code, p2, 2);
    assert.equal(lobby.players[0].team, 1);
    const result = updateGameSettings(lobby.code, { gameMode: 6 });
    assert.ok(result.teamsReset);
    assert.equal(lobby.gameSettings.gameMode, 6);
    assert.equal(lobby.players[0].team, null);
    assert.equal(lobby.players[1].team, null);
    leaveLobby(p2);
    leaveLobby(host);
  });

  it('rejects invalid gameMode', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    updateGameSettings(lobby.code, { gameMode: 9 }); // invalid
    assert.equal(lobby.gameSettings.gameMode, 4); // unchanged
    leaveLobby(host);
  });

  it('same gameMode does not reset teams', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    assignTeam(lobby.code, host, 1);
    const result = updateGameSettings(lobby.code, { gameMode: 4 }); // same
    assert.ok(!result.teamsReset);
    assert.equal(lobby.players[0].team, 1); // unchanged
    leaveLobby(host);
  });
});

describe('Lobby - Chat', () => {
  it('addChatMessage stores message', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const msg = addChatMessage(lobby.code, 'Alice', 'Hello!');
    assert.ok(msg);
    assert.equal(msg.sender, 'Alice');
    assert.equal(msg.message, 'Hello!');
    assert.ok(msg.timestamp);
    assert.equal(lobby.chatLog.length, 1);
    leaveLobby(host);
  });

  it('addChatMessage returns null for invalid lobby', () => {
    const result = addChatMessage('INVALID', 'X', 'msg');
    assert.equal(result, null);
  });

  it('system message has null sender', () => {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const msg = addChatMessage(lobby.code, null, 'Player joined');
    assert.equal(msg.sender, null);
    leaveLobby(host);
  });
});

// ===== PREFERENCES =====

describe('Preferences - parseCardSort', () => {
  it('parses valid ascending sort', () => {
    const result = parseCardSort('C,D,S,H:asc');
    assert.deepEqual(result.suitOrder, { C: 0, D: 1, S: 2, H: 3 });
    assert.equal(result.rankDirection, 'asc');
  });

  it('parses valid descending sort', () => {
    const result = parseCardSort('S,H,D,C:desc');
    assert.deepEqual(result.suitOrder, { S: 0, H: 1, D: 2, C: 3 });
    assert.equal(result.rankDirection, 'desc');
  });

  it('falls back to default for null/undefined', () => {
    const result = parseCardSort(null);
    assert.deepEqual(result.suitOrder, { C: 0, D: 1, S: 2, H: 3 });
    assert.equal(result.rankDirection, 'asc');
  });

  it('falls back for invalid string', () => {
    const result = parseCardSort('X,Y,Z,W:asc');
    // Should fall back to defaults
    assert.equal(result.rankDirection, 'asc');
    assert.equal(Object.keys(result.suitOrder).length, 4);
  });

  it('falls back for duplicate suits', () => {
    const result = parseCardSort('S,S,D,C:asc');
    // Should fall back to defaults
    assert.deepEqual(result.suitOrder, { C: 0, D: 1, S: 2, H: 3 });
  });

  it('falls back for too few suits', () => {
    const result = parseCardSort('S,H:asc');
    assert.deepEqual(result.suitOrder, { C: 0, D: 1, S: 2, H: 3 });
  });

  it('defaults direction to asc if missing', () => {
    const result = parseCardSort('S,H,D,C');
    assert.equal(result.rankDirection, 'asc');
  });

  it('handles whitespace in suit list', () => {
    const result = parseCardSort(' S , H , D , C :desc');
    assert.deepEqual(result.suitOrder, { S: 0, H: 1, D: 2, C: 3 });
    assert.equal(result.rankDirection, 'desc');
  });
});

describe('Preferences - validatePreferences', () => {
  it('validates correct cardSort', () => {
    const result = validatePreferences({ cardSort: 'S,H,D,C:desc' });
    assert.equal(result.cardSort, 'S,H,D,C:desc');
  });

  it('normalizes invalid cardSort to default', () => {
    const result = validatePreferences({ cardSort: 'garbage' });
    assert.equal(result.cardSort, DEFAULTS.cardSort);
  });

  it('validates correct tableColor', () => {
    const validColor = TABLE_COLORS[0].value;
    const result = validatePreferences({ tableColor: validColor });
    assert.equal(result.tableColor, validColor);
  });

  it('rejects invalid tableColor', () => {
    const result = validatePreferences({ tableColor: '#ff0000' });
    assert.equal(result.tableColor, DEFAULTS.tableColor);
  });

  it('ignores unknown fields', () => {
    const result = validatePreferences({ unknownField: 'test' });
    assert.ok(!('unknownField' in result));
  });
});

describe('Preferences - mergeWithDefaults', () => {
  it('fills missing fields with defaults', () => {
    const result = mergeWithDefaults({});
    assert.equal(result.cardSort, DEFAULTS.cardSort);
    assert.equal(result.tableColor, DEFAULTS.tableColor);
  });

  it('preserves provided fields', () => {
    const result = mergeWithDefaults({ cardSort: 'S,H,D,C:desc' });
    assert.equal(result.cardSort, 'S,H,D,C:desc');
    assert.equal(result.tableColor, DEFAULTS.tableColor);
  });

  it('hasCompletedSetup returns true', () => {
    assert.equal(hasCompletedSetup({}), true);
  });
});

// ===== AI HELPERS =====

describe('AI Helpers - groupBySuit', () => {
  it('groups cards by suit sorted high to low', () => {
    const cards = [
      { suit: 'H', rank: '3', mega: false },
      { suit: 'S', rank: 'A', mega: false },
      { suit: 'H', rank: 'K', mega: false },
      { suit: 'S', rank: '2', mega: false },
    ];
    const groups = groupBySuit(cards);
    assert.equal(groups.H.length, 2);
    assert.equal(groups.S.length, 2);
    assert.equal(groups.H[0].rank, 'K'); // K before 3
    assert.equal(groups.S[0].rank, 'A'); // A before 2
  });

  it('handles empty input', () => {
    const groups = groupBySuit([]);
    assert.deepEqual(groups, {});
  });
});

describe('AI Helpers - pickHighest/pickLowest', () => {
  const cards = [
    { suit: 'H', rank: '3', mega: false },
    { suit: 'H', rank: 'A', mega: false },
    { suit: 'H', rank: '7', mega: false },
  ];

  it('pickHighest returns ace', () => {
    assert.equal(pickHighest(cards).rank, 'A');
  });

  it('pickLowest returns 3', () => {
    assert.equal(pickLowest(cards).rank, '3');
  });

  it('pickHighest prefers mega over same rank', () => {
    const mixed = [
      { suit: 'H', rank: 'K', mega: false },
      { suit: 'H', rank: 'K', mega: true },
    ];
    assert.equal(pickHighest(mixed).mega, true);
  });
});

describe('AI Helpers - pickMiddleCard', () => {
  it('returns middle card from sorted array', () => {
    const cards = [
      { suit: 'H', rank: '2', mega: false },
      { suit: 'H', rank: '7', mega: false },
      { suit: 'H', rank: 'A', mega: false },
    ];
    const mid = pickMiddleCard(cards);
    assert.equal(mid.rank, '7');
  });

  it('returns null for 2 or fewer cards', () => {
    assert.equal(pickMiddleCard([{ suit: 'H', rank: '2', mega: false }]), null);
    assert.equal(pickMiddleCard([
      { suit: 'H', rank: '2', mega: false },
      { suit: 'H', rank: 'A', mega: false },
    ]), null);
  });
});

describe('AI Helpers - pickByDisposition', () => {
  const cards = [
    { suit: 'H', rank: '2', mega: false }, // lowest
    { suit: 'H', rank: '5', mega: false },
    { suit: 'H', rank: '8', mega: false },
    { suit: 'H', rank: 'J', mega: false },
    { suit: 'H', rank: 'A', mega: false }, // highest
  ];

  it('hard set (>=2) returns lowest', () => {
    assert.equal(pickByDisposition(cards, 3).rank, '2');
  });

  it('hard duck (<=-2) returns highest', () => {
    assert.equal(pickByDisposition(cards, -3).rank, 'A');
  });

  it('soft set (1) returns second-lowest', () => {
    assert.equal(pickByDisposition(cards, 1).rank, '5');
  });

  it('soft duck (-1) returns second-highest', () => {
    assert.equal(pickByDisposition(cards, -1).rank, 'J');
  });

  it('neutral (0) returns upper-mid card', () => {
    const result = pickByDisposition(cards, 0);
    // idx = floor(5 * 0.65) = 3 → J
    assert.equal(result.rank, 'J');
  });

  it('single card returns that card', () => {
    const single = [{ suit: 'H', rank: '5', mega: false }];
    assert.equal(pickByDisposition(single, 3).rank, '5');
  });
});

describe('AI Helpers - getValidLeads', () => {
  it('returns all cards when spades broken', () => {
    const hand = [
      { suit: 'H', rank: 'A', mega: false },
      { suit: 'S', rank: '2', mega: false },
    ];
    assert.equal(getValidLeads(hand, true).length, 2);
  });

  it('excludes spades when not broken', () => {
    const hand = [
      { suit: 'H', rank: 'A', mega: false },
      { suit: 'S', rank: '2', mega: false },
    ];
    const leads = getValidLeads(hand, false);
    assert.equal(leads.length, 1);
    assert.equal(leads[0].suit, 'H');
  });

  it('returns spades if only spades in hand', () => {
    const hand = [
      { suit: 'S', rank: '2', mega: false },
      { suit: 'S', rank: 'K', mega: false },
    ];
    assert.equal(getValidLeads(hand, false).length, 2);
  });
});

describe('AI Helpers - getCurrentWinner', () => {
  it('returns current winner mid-trick', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: '5', mega: false } },
      { playerId: 'p2', card: { suit: 'H', rank: 'K', mega: false } },
    ];
    assert.equal(getCurrentWinner(trick).playerId, 'p2');
  });

  it('trump beats non-trump', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: 'A', mega: false } },
      { playerId: 'p2', card: { suit: 'S', rank: '2', mega: false } },
    ];
    assert.equal(getCurrentWinner(trick).playerId, 'p2');
  });
});

// ===== GAMESTATE EDGE CASES =====

function makeTestPlayers(n) {
  const mode = GAME_MODES[n];
  const players = [];
  let pidCounter = 0;
  for (const tc of mode.teams) {
    const teamNum = parseInt(tc.id.replace('team', ''), 10);
    for (let i = 0; i < tc.size; i++) {
      pidCounter++;
      players.push({ id: `p${pidCounter}`, name: `Player ${pidCounter}`, team: teamNum, isBot: false });
    }
  }
  return arrangeSeating(players, mode);
}

describe('GameState - Edge Cases', () => {
  it('rejects play during bidding phase', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
    const pid = game.getCurrentTurnPlayerId();
    const card = game.hands[pid][0];
    const result = game.playCard(pid, card);
    assert.ok(result.error);
    assert.ok(result.error.includes('Not in playing phase'));
  });

  it('rejects out-of-turn play', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
    // Bid all
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    assert.equal(game.phase, 'playing');
    // Try to play from wrong player
    const currentId = game.getCurrentTurnPlayerId();
    const otherId = players.find(p => p.id !== currentId).id;
    const card = game.hands[otherId][0];
    const result = game.playCard(otherId, card);
    assert.ok(result.error);
    assert.ok(result.error.includes('Not your turn'));
  });

  it('rejects card not in hand', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    const pid = game.getCurrentTurnPlayerId();
    const fakeCard = { suit: 'H', rank: 'A', mega: false };
    // Only fails if player doesn't have this exact card
    const hasCard = game.hands[pid].some(c => c.suit === 'H' && c.rank === 'A' && !c.mega);
    if (!hasCard) {
      const result = game.playCard(pid, fakeCard);
      assert.ok(result.error);
      assert.ok(result.error.includes("don't have"));
    }
  });

  it('tracks spades broken', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false });
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    assert.equal(game.spadesBroken, false);

    // Play cards until spades are broken — we just need to find a case where a spade is played
    // by simulating the full round
    let spadesBroken = false;
    for (let trick = 0; trick < 13 && !spadesBroken; trick++) {
      for (let card = 0; card < 4; card++) {
        const pid = game.getCurrentTurnPlayerId();
        const hand = game.hands[pid];
        for (const c of hand) {
          const result = game.playCard(pid, c);
          if (!result.error) {
            if (c.suit === 'S') spadesBroken = true;
            break;
          }
        }
        if (spadesBroken) break;
      }
    }
    // By the end of a round, spades should have been played at least once
    assert.equal(game.spadesBroken, true);
  });

  it('dealer rotates between rounds', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });
    const firstDealer = game.dealerIndex;

    // Play a full round
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    for (let trick = 0; trick < 13; trick++) {
      for (let card = 0; card < 4; card++) {
        const pid = game.getCurrentTurnPlayerId();
        for (const c of game.hands[pid]) {
          const result = game.playCard(pid, c);
          if (!result.error) break;
        }
      }
    }

    // Start new round
    game.startNewRound();
    assert.equal(game.dealerIndex, (firstDealer + 1) % 4);
  });

  it('blind nil bid is recorded', () => {
    const players = makeTestPlayers(4);
    const settings = { ...DEFAULT_GAME_SETTINGS, blindNil: true };
    const game = new GameState(players, {}, settings);
    const pid = game.getCurrentTurnPlayerId();
    const result = game.placeBid(pid, 0, { blindNil: true });
    assert.ok(!result.error);
    assert.ok(game.blindNilPlayers.has(pid));
    assert.equal(game.bids[pid], 0);
  });

  it('blind nil rejects non-zero bid', () => {
    const players = makeTestPlayers(4);
    const settings = { ...DEFAULT_GAME_SETTINGS, blindNil: true };
    const game = new GameState(players, {}, settings);
    const pid = game.getCurrentTurnPlayerId();
    const result = game.placeBid(pid, 3, { blindNil: true });
    assert.ok(result.error);
  });

  it('blind nil rejects when setting disabled', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, blindNil: false });
    const pid = game.getCurrentTurnPlayerId();
    const result = game.placeBid(pid, 0, { blindNil: true });
    assert.ok(result.error);
  });

  it('replacePlayer remaps blindNilPlayers set', () => {
    const players = makeTestPlayers(4);
    const settings = { ...DEFAULT_GAME_SETTINGS, blindNil: true };
    const game = new GameState(players, {}, settings);
    const pid = game.getCurrentTurnPlayerId();
    game.placeBid(pid, 0, { blindNil: true });
    assert.ok(game.blindNilPlayers.has(pid));

    game.replacePlayer(pid, 'new-id', 'NewName');
    assert.ok(!game.blindNilPlayers.has(pid));
    assert.ok(game.blindNilPlayers.has('new-id'));
  });

  it('replacePlayer remaps currentTrick entries', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false });
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);

    // Play one card
    const pid = game.getCurrentTurnPlayerId();
    const card = game.hands[pid].find(c => {
      const v = validatePlay(c, game.hands[pid], game.currentTrick, game.spadesBroken);
      return v.valid;
    });
    game.playCard(pid, card);
    assert.equal(game.currentTrick.length, 1);
    assert.equal(game.currentTrick[0].playerId, pid);

    // Replace while trick in progress
    game.replacePlayer(pid, 'new-id', 'NewName');
    assert.equal(game.currentTrick[0].playerId, 'new-id');
  });

  it('getStateForPlayer hides other hands', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
    const state = game.getStateForPlayer(players[0].id);
    // Should only have this player's hand
    assert.equal(state.hand.length, 13);
    // State should not contain other players' hands
    assert.ok(!state.hands);
  });

  it('bid sum equals round trick total in completed round', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    for (let trick = 0; trick < 13; trick++) {
      for (let card = 0; card < 4; card++) {
        const pid = game.getCurrentTurnPlayerId();
        for (const c of game.hands[pid]) {
          if (!game.playCard(pid, c).error) break;
        }
      }
    }
    // Total tricks taken should equal 13
    const totalTricks = Object.values(game.tricksTaken).reduce((s, t) => s + t, 0);
    assert.equal(totalTricks, 13);
  });
});

// ===== SCORING EDGE CASES =====

describe('Scoring - Edge Cases', () => {
  const mode4 = GAME_MODES[4];
  const players4 = [
    { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
    { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
  ];
  const lookup4 = buildTeamLookup(mode4, players4);

  it('blind nil failed has correct penalty', () => {
    const bids = { p1: 0, p2: 5, p3: 5, p4: 3 };
    const tricks = { p1: 2, p2: 5, p3: 4, p4: 2 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };
    const blindNilPlayers = new Set(['p1']);

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, blindNilPlayers, mode4, lookup4);

    // p1 blind nil failed: -200 (BLIND_NIL_BONUS penalty)
    // p3 bid 5, effective = 4 + 2 (failed nil) = 6 => made, +51
    // Total: -200 + 51 = -149
    assert.equal(result.team1.roundScore, -149);
  });

  it('all-nil team both fail', () => {
    const bids = { p1: 0, p2: 5, p3: 0, p4: 5 };
    const tricks = { p1: 1, p2: 6, p3: 2, p4: 4 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: both nil, both failed
    // p1: -100, p3: -100
    // No non-nil bids, but failed nil tricks become books (combinedBid === 0, failedNilTricks > 0)
    // Total: -200, books = 3 (1 + 2)
    assert.equal(result.team1.roundScore, -200);
    assert.equal(result.team1.books, 3);
  });

  it('all-nil team both succeed', () => {
    const bids = { p1: 0, p2: 6, p3: 0, p4: 7 };
    const tricks = { p1: 0, p2: 6, p3: 0, p4: 7 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: both nil made, +100 each = 200
    assert.equal(result.team1.roundScore, 200);
  });

  it('spoiler 10-trick bonus is doubled', () => {
    const mode5 = GAME_MODES[5];
    const players5 = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      { id: 'p5', team: 3 },
    ];
    const lookup5 = buildTeamLookup(mode5, players5);
    const bids = { p1: 3, p2: 3, p3: 0, p4: 0, p5: 10 };
    const tricks = { p1: 3, p2: 0, p3: 0, p4: 0, p5: 10 };
    const scores = initTeamScores(mode5);
    const books = initTeamScores(mode5);
    const settings = { ...DEFAULT_GAME_SETTINGS, tenBidBonus: true };

    const result = scoreRound(players5, bids, tricks, scores, books, settings, new Set(), mode5, lookup5);

    // Spoiler: bid 10 x 10 x 2 = 200, + 50 x 2 = 100 bonus
    assert.equal(result.team3.roundScore, 300);
  });

  it('checkWinner with 3+ teams', () => {
    const mode6 = GAME_MODES[6];
    // team1, team2, team3
    assert.equal(checkWinner({ team1: 500, team2: 400, team3: 300 }, 500, mode6), 'team1');
    assert.equal(checkWinner({ team1: 400, team2: 500, team3: 600 }, 500, mode6), 'team3');
    assert.equal(checkWinner({ team1: 500, team2: 500, team3: 300 }, 500, mode6), null); // tie
    assert.equal(checkWinner({ team1: 300, team2: 400, team3: 499 }, 500, mode6), null); // nobody
  });

  it('checkWinner with 4 teams (8p)', () => {
    const mode8 = GAME_MODES[8];
    assert.equal(checkWinner({ team1: 520, team2: 510, team3: 200, team4: 100 }, 500, mode8), 'team1');
    assert.equal(checkWinner({ team1: 500, team2: 500, team3: 500, team4: 500 }, 500, mode8), null); // tie
  });

  it('cumulative scores track across rounds', () => {
    const bids = { p1: 3, p2: 3, p3: 4, p4: 3 };
    const tricks = { p1: 3, p2: 4, p3: 4, p4: 2 };
    const scores = { team1: 100, team2: 200 };
    const books = { team1: 2, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: bid 7, took 7, +70. newTotal = 170
    assert.equal(result.team1.newTotal, 170);
    // Team 2: bid 6, took 6, +60. newTotal = 260
    assert.equal(result.team2.newTotal, 260);
  });

  it('multiple book penalty rounds accounted for', () => {
    const bids = { p1: 1, p2: 3, p3: 1, p4: 3 };
    const tricks = { p1: 5, p2: 3, p3: 5, p4: 0 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 3, team2: 0 }; // already 3 books

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: bid 2, took 10 => made (+20), 8 overtricks
    // Books: 3 + 8 = 11 >= 10 => penalty -100, books reset to 1
    assert.equal(result.team1.books, 1);
    assert.equal(result.team1.roundScore, 20 + 8 - 100); // -72
  });
});

// ===== TRICK VALIDATION EDGE CASES =====

describe('Trick Validation - Edge Cases', () => {
  it('mega card follows suit correctly', () => {
    const hand = [
      { suit: 'H', rank: '5', mega: true },
      { suit: 'D', rank: 'K', mega: false },
    ];
    const trick = [{ card: { suit: 'H', rank: 'A' }, playerId: 'p1' }];
    // Must follow hearts — mega heart is still a heart
    assert.ok(validatePlay({ suit: 'H', rank: '5', mega: true }, hand, trick, false).valid);
    assert.equal(validatePlay({ suit: 'D', rank: 'K', mega: false }, hand, trick, false).valid, false);
  });

  it('mega spade trump wins over regular spade of same rank', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'S', rank: '5', mega: false } },
      { playerId: 'p2', card: { suit: 'S', rank: '5', mega: true } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });

  it('mega trump beats regular non-trump', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: 'A', mega: false } },
      { playerId: 'p2', card: { suit: 'S', rank: '2', mega: true } },
      { playerId: 'p3', card: { suit: 'H', rank: 'K', mega: false } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });

  it('higher mega spade beats lower mega spade', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'S', rank: '3', mega: true } },
      { playerId: 'p2', card: { suit: 'S', rank: '7', mega: true } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });

  it('regular spade next rank beats mega spade lower rank', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'S', rank: '5', mega: true } },
      { playerId: 'p2', card: { suit: 'S', rank: '6', mega: false } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });
});

// ===== BOT BIDDING =====

describe('Bot Bidding', () => {
  function makeMinimalGameState(playerCount, scores, books, settings) {
    const mode = GAME_MODES[playerCount];
    const players = [];
    let pidCounter = 0;
    for (const tc of mode.teams) {
      const teamNum = parseInt(tc.id.replace('team', ''), 10);
      for (let i = 0; i < tc.size; i++) {
        pidCounter++;
        players.push({ id: `p${pidCounter}`, name: `P${pidCounter}`, team: teamNum });
      }
    }
    const lookup = buildTeamLookup(mode, players);
    return {
      players,
      bids: {},
      scores: scores || initTeamScores(mode),
      books: books || initTeamScores(mode),
      settings: settings || { ...DEFAULT_GAME_SETTINGS },
      teamLookup: lookup,
      mode,
      roundNumber: 2,
      tricksTaken: {},
    };
  }

  it('strong hand bids high', () => {
    const hand = [
      { suit: 'S', rank: 'A', mega: false },
      { suit: 'S', rank: 'K', mega: false },
      { suit: 'S', rank: 'Q', mega: false },
      { suit: 'H', rank: 'A', mega: false },
      { suit: 'H', rank: 'K', mega: false },
      { suit: 'D', rank: 'A', mega: false },
      { suit: 'D', rank: 'K', mega: false },
      { suit: 'C', rank: 'A', mega: false },
      { suit: 'C', rank: '3', mega: false },
      { suit: 'C', rank: '4', mega: false },
      { suit: 'H', rank: '2', mega: false },
      { suit: 'D', rank: '2', mega: false },
      { suit: 'D', rank: '3', mega: false },
    ];
    const gs = makeMinimalGameState(4);
    const bid = botBid(hand, 3, [3, 3], gs, 'p1');
    // A/K/Q of spades + 3 off-suit aces + K's = strong hand
    assert.ok(bid >= 5, `Expected bid >= 5 but got ${bid}`);
  });

  it('weak hand bids low', () => {
    const hand = [
      { suit: 'H', rank: '2', mega: false },
      { suit: 'H', rank: '3', mega: false },
      { suit: 'H', rank: '4', mega: false },
      { suit: 'H', rank: '5', mega: false },
      { suit: 'D', rank: '2', mega: false },
      { suit: 'D', rank: '3', mega: false },
      { suit: 'D', rank: '4', mega: false },
      { suit: 'D', rank: '5', mega: false },
      { suit: 'C', rank: '2', mega: false },
      { suit: 'C', rank: '3', mega: false },
      { suit: 'C', rank: '4', mega: false },
      { suit: 'C', rank: '5', mega: false },
      { suit: 'C', rank: '6', mega: false },
    ];
    const gs = makeMinimalGameState(4);
    const bid = botBid(hand, 3, [3, 3], gs, 'p1');
    // All low cards, no spades = very weak
    assert.ok(bid <= 2, `Expected bid <= 2 but got ${bid}`);
  });

  it('bid is always in range 1-13', () => {
    // Test with various random hands
    for (let trial = 0; trial < 10; trial++) {
      const deck = shuffle(createDeck());
      const hand = deck.slice(0, 13);
      const gs = makeMinimalGameState(4);
      const bid = botBid(hand, undefined, [], gs, 'p1');
      assert.ok(bid >= 1 && bid <= 13, `Bid ${bid} out of range`);
    }
  });

  it('8-player mode bids more conservatively', () => {
    // Same strong hand, test 4p vs 8p
    const hand = [
      { suit: 'S', rank: 'A', mega: false },
      { suit: 'S', rank: 'K', mega: false },
      { suit: 'H', rank: 'A', mega: false },
      { suit: 'H', rank: 'K', mega: false },
      { suit: 'D', rank: 'A', mega: false },
      { suit: 'D', rank: '7', mega: false },
      { suit: 'D', rank: '3', mega: false },
      { suit: 'C', rank: '8', mega: false },
      { suit: 'C', rank: '4', mega: false },
      { suit: 'C', rank: '3', mega: false },
      { suit: 'C', rank: '2', mega: false },
      { suit: 'H', rank: '2', mega: false },
      { suit: 'H', rank: '3', mega: false },
    ];
    const gs4 = makeMinimalGameState(4);
    const gs8 = makeMinimalGameState(8);
    const bid4 = botBid(hand, 3, [3, 3], gs4, 'p1');
    const bid8 = botBid(hand, undefined, [2, 2, 2, 2, 2, 2], gs8, 'p1');
    assert.ok(bid8 <= bid4, `8p bid (${bid8}) should be <= 4p bid (${bid4})`);
  });
});

describe('Bot - getDesperationContext', () => {
  it('returns non-desperate when opponents far from winning', () => {
    const mode = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const lookup = buildTeamLookup(mode, players);
    const gs = {
      players, scores: { team1: 100, team2: 100 },
      books: { team1: 0, team2: 0 },
      settings: { ...DEFAULT_GAME_SETTINGS },
      teamLookup: lookup, mode,
    };
    const desp = getDesperationContext(gs, 'p1', 3, [3, 3]);
    assert.equal(desp.desperate, false);
    assert.equal(desp.ourScore, 100);
    assert.equal(desp.oppScore, 100);
  });

  it('returns desperate when opponents can win this round', () => {
    const mode = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const lookup = buildTeamLookup(mode, players);
    const gs = {
      players, scores: { team1: 100, team2: 450 },
      books: { team1: 0, team2: 0 },
      settings: { ...DEFAULT_GAME_SETTINGS },
      teamLookup: lookup, mode,
    };
    const desp = getDesperationContext(gs, 'p1', 3, [5, 5]);
    // Opp projected: 450 + 10*10 = 550 >= 500
    assert.equal(desp.desperate, true);
    assert.equal(desp.oppCanWin, true);
  });

  it('returns correct structure', () => {
    const mode = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const lookup = buildTeamLookup(mode, players);
    const gs = {
      players, scores: { team1: 0, team2: 0 },
      books: { team1: 0, team2: 0 },
      settings: { ...DEFAULT_GAME_SETTINGS },
      teamLookup: lookup, mode,
    };
    const desp = getDesperationContext(gs, 'p1', undefined, []);
    assert.equal(typeof desp.desperate, 'boolean');
    assert.equal(typeof desp.oppCanWin, 'boolean');
    assert.equal(typeof desp.ourScore, 'number');
    assert.equal(typeof desp.oppScore, 'number');
    assert.equal(typeof desp.winTarget, 'number');
    assert.equal(typeof desp.bookThreshold, 'number');
    assert.equal(typeof desp.tricksPerRound, 'number');
  });
});

describe('Bot - evaluateBlindNil', () => {
  it('returns false when blindNil setting disabled', () => {
    const gs = {
      players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 }],
      bids: { p3: 5 },
      scores: { team1: 0, team2: 400 },
      settings: { ...DEFAULT_GAME_SETTINGS, blindNil: false },
      roundNumber: 5,
      teamLookup: buildTeamLookup(GAME_MODES[4], [
        { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      ]),
    };
    assert.equal(evaluateBlindNil(gs, 'p1'), false);
  });

  it('returns false in round 1', () => {
    const gs = {
      players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 }],
      bids: { p3: 5 },
      scores: { team1: 0, team2: 400 },
      settings: { ...DEFAULT_GAME_SETTINGS, blindNil: true },
      roundNumber: 1,
      teamLookup: buildTeamLookup(GAME_MODES[4], [
        { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      ]),
    };
    assert.equal(evaluateBlindNil(gs, 'p1'), false);
  });

  it('returns false if partner has not bid yet (first bidder)', () => {
    const gs = {
      players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 }],
      bids: {}, // no bids yet
      scores: { team1: 0, team2: 400 },
      settings: { ...DEFAULT_GAME_SETTINGS, blindNil: true },
      roundNumber: 5,
      teamLookup: buildTeamLookup(GAME_MODES[4], [
        { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      ]),
    };
    assert.equal(evaluateBlindNil(gs, 'p1'), false);
  });

  it('returns false if partner bid nil', () => {
    const gs = {
      players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 }],
      bids: { p3: 0 },
      scores: { team1: 0, team2: 400 },
      settings: { ...DEFAULT_GAME_SETTINGS, blindNil: true },
      roundNumber: 5,
      teamLookup: buildTeamLookup(GAME_MODES[4], [
        { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      ]),
    };
    assert.equal(evaluateBlindNil(gs, 'p1'), false);
  });

  it('returns false if partner bid too low (<4)', () => {
    const gs = {
      players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 }],
      bids: { p3: 3 },
      scores: { team1: 0, team2: 400 },
      settings: { ...DEFAULT_GAME_SETTINGS, blindNil: true },
      roundNumber: 5,
      teamLookup: buildTeamLookup(GAME_MODES[4], [
        { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      ]),
    };
    assert.equal(evaluateBlindNil(gs, 'p1'), false);
  });

  it('returns false when deficit is too small', () => {
    const gs = {
      players: [{ id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 }],
      bids: { p3: 5 },
      scores: { team1: 300, team2: 350 }, // only 50 deficit, oppProximity 150
      settings: { ...DEFAULT_GAME_SETTINGS, blindNil: true },
      roundNumber: 5,
      teamLookup: buildTeamLookup(GAME_MODES[4], [
        { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      ]),
    };
    // deficit=50 < 150 and oppProximity=150 > 200? No... 500-350=150.
    // deficit < 150 && oppProximity > 200 → 50 < 150 is true, 150 > 200 is false
    // So it does NOT return false here. Let me adjust.
    // To guarantee false: deficit < 150 AND oppProximity > 200
    const gs2 = {
      ...gs,
      scores: { team1: 200, team2: 250 }, // deficit=50, oppProximity=250
    };
    assert.equal(evaluateBlindNil(gs2, 'p1'), false);
  });
});

// ===== LOBBY - PAUSE/RESUME =====

describe('Lobby - Pause & Resume', () => {
  // Helper to set up a game
  function setupGameLobby() {
    const host = uniqueSocket();
    const lobby = createLobby(host, 'Alice');
    const sockets = [host];
    for (let i = 1; i < 4; i++) {
      const sid = uniqueSocket();
      sockets.push(sid);
      joinLobby(sid, `P${i}`, lobby.code);
    }
    autoAssignTeams(lobby.code);
    const players = arrangeSeating([...lobby.players], getMode(4));
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
    lobby.game = game;
    return { lobby, sockets, game };
  }

  it('pauseGame creates vacancy and pauses', () => {
    const { lobby, sockets, game } = setupGameLobby();
    const departingId = sockets[1]; // P1
    const gamePlayer = game.players.find(p => p.id === departingId);
    const vacancy = pauseGame(lobby.code, departingId);

    assert.ok(vacancy);
    assert.equal(lobby.paused, true);
    assert.equal(lobby.vacantSeats.length, 1);
    assert.equal(vacancy.seatIndex, gamePlayer.seatIndex);
    assert.equal(vacancy.team, gamePlayer.team);
    // Cleanup
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('fillSeatWithBot fills vacancy and unpauses', () => {
    const { lobby, sockets, game } = setupGameLobby();
    const departingId = sockets[1];
    const gamePlayer = game.players.find(p => p.id === departingId);
    pauseGame(lobby.code, departingId);

    const result = fillSeatWithBot(lobby.code, gamePlayer.seatIndex);
    assert.ok(!result.error);
    assert.ok(result.resumed);
    assert.ok(result.botPlayer.isBot);
    assert.equal(lobby.paused, false);
    assert.equal(lobby.vacantSeats.length, 0);
    // Cleanup
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('fillSeat with human player works', () => {
    const { lobby, sockets, game } = setupGameLobby();
    const departingId = sockets[1];
    const gamePlayer = game.players.find(p => p.id === departingId);
    pauseGame(lobby.code, departingId);

    // Add a spectator who will fill the seat
    const spectator = uniqueSocket();
    joinLobby(spectator, 'Spectator', lobby.code);

    const result = fillSeat(lobby.code, spectator, gamePlayer.seatIndex);
    assert.ok(!result.error);
    assert.ok(result.resumed);
    assert.equal(lobby.paused, false);
    // Cleanup
    leaveLobby(spectator);
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('multiple vacancies require all to be filled', () => {
    const { lobby, sockets, game } = setupGameLobby();
    const p1 = sockets[1];
    const p2 = sockets[2];
    const gp1 = game.players.find(p => p.id === p1);
    const gp2 = game.players.find(p => p.id === p2);
    pauseGame(lobby.code, p1);
    pauseGame(lobby.code, p2);

    assert.equal(lobby.vacantSeats.length, 2);
    assert.equal(lobby.paused, true);

    // Fill first seat
    const r1 = fillSeatWithBot(lobby.code, gp1.seatIndex);
    assert.equal(r1.resumed, false); // still one vacancy
    assert.equal(lobby.paused, true);

    // Fill second seat
    const r2 = fillSeatWithBot(lobby.code, gp2.seatIndex);
    assert.equal(r2.resumed, true);
    assert.equal(lobby.paused, false);
    // Cleanup
    for (const s of sockets.reverse()) leaveLobby(s);
  });

  it('fillSeat rejects invalid seat', () => {
    const { lobby, sockets } = setupGameLobby();
    pauseGame(lobby.code, sockets[1]);
    const result = fillSeat(lobby.code, sockets[0], 99); // invalid seatIndex
    assert.ok(result.error);
    for (const s of sockets.reverse()) leaveLobby(s);
  });
});

// ===== 3-PLAYER SOLO MODE SCORING =====

describe('3-Player Solo Scoring', () => {
  const mode3 = GAME_MODES[3];
  const players3 = [
    { id: 'p1', team: 1 },
    { id: 'p2', team: 2 },
    { id: 'p3', team: 3 },
  ];
  const lookup3 = buildTeamLookup(mode3, players3);

  it('each player scored independently', () => {
    const bids = { p1: 4, p2: 5, p3: 4 };
    const tricks = { p1: 5, p2: 5, p3: 3 };
    const scores = initTeamScores(mode3);
    const books = initTeamScores(mode3);

    const result = scoreRound(players3, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode3, lookup3);

    // P1: bid 4, took 5 → 41
    assert.equal(result.team1.roundScore, 41);
    assert.equal(result.team1.books, 1);
    // P2: bid 5, took 5 → 50
    assert.equal(result.team2.roundScore, 50);
    // P3: bid 4, took 3 → set = -40
    assert.equal(result.team3.roundScore, -40);
  });

  it('3p nil scoring', () => {
    const bids = { p1: 0, p2: 6, p3: 7 };
    const tricks = { p1: 0, p2: 6, p3: 7 };
    const scores = initTeamScores(mode3);
    const books = initTeamScores(mode3);

    const result = scoreRound(players3, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode3, lookup3);

    // P1 nil made = +100
    assert.equal(result.team1.roundScore, 100);
  });

  it('3p checkWinner with 3 teams', () => {
    assert.equal(checkWinner({ team1: 500, team2: 300, team3: 400 }, 500, mode3), 'team1');
    assert.equal(checkWinner({ team1: 300, team2: 300, team3: 300 }, 500, mode3), null);
    // Two above target
    assert.equal(checkWinner({ team1: 520, team2: 510, team3: 300 }, 500, mode3), 'team1');
    // Tie above target
    assert.equal(checkWinner({ team1: 500, team2: 500, team3: 300 }, 500, mode3), null);
  });
});

// ===== DECK EDGE CASES =====

describe('Deck - Edge Cases', () => {
  it('3p deck removes correct number of low cards', () => {
    const mode = GAME_MODES[3];
    const deck = createDeck(mode);
    assert.equal(deck.length, 39);
    // Removed 13 cards — lowest cards (all 2s, all 3s, then some 4s)
    const has2 = deck.some(c => c.rank === '2' && !c.mega);
    assert.equal(has2, false, '3p deck should not have any 2s');
  });

  it('deck cards all have mega property', () => {
    for (let n = 3; n <= 8; n++) {
      const mode = GAME_MODES[n];
      const deck = createDeck(mode);
      for (const card of deck) {
        assert.equal(typeof card.mega, 'boolean', `${n}p deck card ${card.rank}${card.suit} should have boolean mega`);
      }
    }
  });

  it('5p deck has exactly 13 mega cards', () => {
    const mode = GAME_MODES[5];
    const deck = createDeck(mode);
    const megaCards = deck.filter(c => c.mega);
    assert.equal(megaCards.length, 13);
  });

  it('8p deck has exactly 52 mega cards', () => {
    const mode = GAME_MODES[8];
    const deck = createDeck(mode);
    const megaCards = deck.filter(c => c.mega);
    assert.equal(megaCards.length, 52);
  });

  it('shuffle does not lose cards', () => {
    for (let n = 3; n <= 8; n++) {
      const mode = GAME_MODES[n];
      const deck = createDeck(mode);
      const shuffled = shuffle(deck);
      assert.equal(shuffled.length, deck.length, `${n}p shuffle should preserve count`);
    }
  });
});

// ===== GAME STATE - FULL ROUND INTEGRITY =====

describe('GameState - Round Integrity', () => {
  it('all cards in dealt hands are unique', () => {
    for (let n = 3; n <= 8; n++) {
      const players = makeTestPlayers(n);
      const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
      const allCards = [];
      for (const hand of Object.values(game.hands)) {
        allCards.push(...hand);
      }
      const keys = allCards.map(c => `${c.suit}_${c.rank}_${c.mega}`);
      assert.equal(new Set(keys).size, allCards.length, `${n}p dealt hands should have no duplicates`);
    }
  });

  it('round history grows with each round', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });

    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
      for (let trick = 0; trick < 13; trick++) {
        for (let card = 0; card < 4; card++) {
          const pid = game.getCurrentTurnPlayerId();
          for (const c of game.hands[pid]) {
            if (!game.playCard(pid, c).error) break;
          }
        }
      }
      assert.equal(game.roundHistory.length, round + 1);
      if (game.phase !== 'gameOver') game.startNewRound();
      else break;
    }
  });

  it('round summary contains all required fields', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    for (let trick = 0; trick < 13; trick++) {
      for (let card = 0; card < 4; card++) {
        const pid = game.getCurrentTurnPlayerId();
        for (const c of game.hands[pid]) {
          if (!game.playCard(pid, c).error) break;
        }
      }
    }
    const summary = game.roundHistory[0];
    assert.ok(summary.roundNumber);
    assert.ok(summary.bids);
    assert.ok(summary.tricksTaken);
    assert.ok(summary.teamScores);
    assert.ok(summary.teamTotals);
    assert.ok(summary.teamBooks);
    assert.ok(Array.isArray(summary.blindNilPlayers));
  });

  it('cardsPlayed tracks all played cards after round', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });
    for (let i = 0; i < 4; i++) game.placeBid(game.getCurrentTurnPlayerId(), 3);
    for (let trick = 0; trick < 13; trick++) {
      for (let card = 0; card < 4; card++) {
        const pid = game.getCurrentTurnPlayerId();
        for (const c of game.hands[pid]) {
          if (!game.playCard(pid, c).error) break;
        }
      }
    }
    // 13 tricks x 4 cards = 52 total cards played
    assert.equal(game.cardsPlayed.length, 52);
  });
});

console.log('Coverage test suites defined. Running...');
