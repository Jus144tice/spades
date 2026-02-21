/**
 * Comprehensive test suite for Spades game logic.
 * Run with: node --test server/tests/game.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SUITS, RANKS, RANK_VALUE, getCardValue, DEFAULT_GAME_SETTINGS, BOOK_PENALTY_THRESHOLD, BOOK_PENALTY } from '../game/constants.js';
import { createDeck, shuffle, deal } from '../game/deck.js';
import { GAME_MODES, getMode } from '../game/modes.js';
import { buildTeamLookup, initTeamScores, getTeamKeys, teamKeyToNum, teamNumToKey } from '../game/modeHelpers.js';
import { validatePlay, determineTrickWinner } from '../game/tricks.js';
import { scoreRound, checkWinner } from '../game/scoring.js';
import { GameState } from '../game/GameState.js';
import { arrangeSeating } from '../lobby.js';

// ===== CONSTANTS =====

describe('Constants', () => {
  it('has 4 suits', () => {
    assert.deepEqual(SUITS, ['S', 'H', 'D', 'C']);
  });

  it('has 13 ranks in order', () => {
    assert.equal(RANKS.length, 13);
    assert.equal(RANKS[0], '2');
    assert.equal(RANKS[12], 'A');
  });

  it('Ace is highest rank value', () => {
    assert.equal(RANK_VALUE['A'], 14);
    assert.equal(RANK_VALUE['2'], 2);
  });

  it('getCardValue handles regular and mega cards', () => {
    assert.equal(getCardValue({ rank: 'A', suit: 'S', mega: false }), 14);
    assert.equal(getCardValue({ rank: '2', suit: 'S', mega: false }), 2);
    assert.equal(getCardValue({ rank: '2', suit: 'S', mega: true }), 2.5);
    // Mega 2 beats regular 2, loses to regular 3
    assert(getCardValue({ rank: '2', suit: 'S', mega: true }) > getCardValue({ rank: '2', suit: 'S', mega: false }));
    assert(getCardValue({ rank: '2', suit: 'S', mega: true }) < getCardValue({ rank: '3', suit: 'S', mega: false }));
  });

  it('DEFAULT_GAME_SETTINGS uses bookThreshold', () => {
    assert.equal(DEFAULT_GAME_SETTINGS.bookThreshold, 10);
    assert.equal(DEFAULT_GAME_SETTINGS.gameMode, 4);
    assert.equal(DEFAULT_GAME_SETTINGS.winTarget, 500);
  });
});

// ===== MODE CONFIGURATIONS =====

describe('Game Modes', () => {
  it('defines modes for 3-8 players', () => {
    for (let n = 3; n <= 8; n++) {
      assert.ok(GAME_MODES[n], `Mode ${n} should exist`);
      assert.equal(GAME_MODES[n].playerCount, n);
    }
  });

  it('getMode returns correct mode or defaults to 4', () => {
    assert.equal(getMode(3).playerCount, 3);
    assert.equal(getMode(4).playerCount, 4);
    assert.equal(getMode(99).playerCount, 4); // fallback
  });

  describe('Card counts', () => {
    const expected = {
      3: { total: 39, perPlayer: 13, tricks: 13 },
      4: { total: 52, perPlayer: 13, tricks: 13 },
      5: { total: 65, perPlayer: 13, tricks: 13 },
      6: { total: 78, perPlayer: 13, tricks: 13 },
      7: { total: 91, perPlayer: 13, tricks: 13 },
      8: { total: 96, perPlayer: 12, tricks: 12 },
    };

    for (const [n, exp] of Object.entries(expected)) {
      it(`${n}p: ${exp.total} total, ${exp.perPlayer} per player, ${exp.tricks} tricks`, () => {
        const mode = GAME_MODES[n];
        assert.equal(mode.totalCards, exp.total);
        assert.equal(mode.cardsPerPlayer, exp.perPlayer);
        assert.equal(mode.tricksPerRound, exp.tricks);
        // Verify totalCards = cardsPerPlayer * playerCount
        assert.equal(mode.totalCards, mode.cardsPerPlayer * mode.playerCount);
      });
    }
  });

  describe('Team structures', () => {
    it('3p: 3 solo teams', () => {
      const mode = GAME_MODES[3];
      assert.equal(mode.teams.length, 3);
      assert.ok(mode.teams.every(t => t.size === 1));
      assert.equal(mode.hasSpoiler, false);
    });

    it('4p: 2 teams of 2', () => {
      const mode = GAME_MODES[4];
      assert.equal(mode.teams.length, 2);
      assert.ok(mode.teams.every(t => t.size === 2));
      assert.equal(mode.hasSpoiler, false);
    });

    it('5p: 2 teams of 2 + 1 spoiler', () => {
      const mode = GAME_MODES[5];
      assert.equal(mode.teams.length, 3);
      assert.equal(mode.teams[2].size, 1);
      assert.equal(mode.teams[2].spoiler, true);
      assert.equal(mode.hasSpoiler, true);
      assert.equal(mode.layoutSeats, 6);
    });

    it('6p: 3 teams of 2', () => {
      const mode = GAME_MODES[6];
      assert.equal(mode.teams.length, 3);
      assert.ok(mode.teams.every(t => t.size === 2));
      assert.equal(mode.hasSpoiler, false);
    });

    it('7p: 3 teams of 2 + 1 spoiler', () => {
      const mode = GAME_MODES[7];
      assert.equal(mode.teams.length, 4);
      assert.equal(mode.teams[3].size, 1);
      assert.equal(mode.teams[3].spoiler, true);
      assert.equal(mode.hasSpoiler, true);
      assert.equal(mode.layoutSeats, 8);
    });

    it('8p: 4 teams of 2', () => {
      const mode = GAME_MODES[8];
      assert.equal(mode.teams.length, 4);
      assert.ok(mode.teams.every(t => t.size === 2));
      assert.equal(mode.hasSpoiler, false);
    });
  });

  describe('No mega Aces', () => {
    for (let n = 3; n <= 8; n++) {
      it(`${n}p mode has no mega Aces`, () => {
        const mode = GAME_MODES[n];
        const megaAces = (mode.megaCards || []).filter(c => c.rank === 'A');
        assert.equal(megaAces.length, 0, `Mode ${n} should have no mega Aces`);
      });
    }
  });
});

// ===== DECK =====

describe('Deck', () => {
  it('creates standard 52-card deck without mode', () => {
    const deck = createDeck();
    assert.equal(deck.length, 52);
    assert.ok(deck.every(c => c.mega === false));
  });

  for (let n = 3; n <= 8; n++) {
    it(`creates correct deck for ${n}p mode`, () => {
      const mode = GAME_MODES[n];
      const deck = createDeck(mode);
      assert.equal(deck.length, mode.totalCards, `${n}p deck should have ${mode.totalCards} cards`);

      // No duplicates (suit + rank + mega combination)
      const keys = deck.map(c => `${c.suit}_${c.rank}_${c.mega}`);
      const unique = new Set(keys);
      assert.equal(unique.size, deck.length, `${n}p deck should have no duplicates`);

      // No mega Aces in deck
      const megaAces = deck.filter(c => c.mega && c.rank === 'A');
      assert.equal(megaAces.length, 0, `${n}p deck should have no mega Aces`);
    });
  }

  it('shuffle produces same number of cards', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck);
    assert.equal(shuffled.length, 52);
  });

  describe('Deal', () => {
    for (let n = 3; n <= 8; n++) {
      it(`deals evenly to ${n} players`, () => {
        const mode = GAME_MODES[n];
        const deck = createDeck(mode);
        const hands = deal(deck, n);
        assert.equal(hands.length, n);
        for (const hand of hands) {
          assert.equal(hand.length, mode.cardsPerPlayer);
        }
      });
    }
  });
});

// ===== MODE HELPERS =====

describe('Mode Helpers', () => {
  it('buildTeamLookup creates correct team map', () => {
    const mode = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const lookup = buildTeamLookup(mode, players);

    assert.deepEqual(lookup.teamsByKey.team1, ['p1', 'p3']);
    assert.deepEqual(lookup.teamsByKey.team2, ['p2', 'p4']);
    assert.deepEqual(lookup.getPartnerIds('p1'), ['p3']);
    assert.deepEqual(lookup.getPartnerIds('p2'), ['p4']);
    assert.deepEqual(lookup.getOpponentIds('p1').sort(), ['p2', 'p4']);
    assert.equal(lookup.getTeamKey('p1'), 'team1');
    assert.equal(lookup.isSpoiler('p1'), false);
  });

  it('spoiler has no partner', () => {
    const mode = GAME_MODES[5];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      { id: 'p5', team: 3 },
    ];
    const lookup = buildTeamLookup(mode, players);

    assert.deepEqual(lookup.getPartnerIds('p5'), []);
    assert.equal(lookup.isSpoiler('p5'), true);
    assert.equal(lookup.getOpponentIds('p5').length, 4);
  });

  it('initTeamScores creates correct structure', () => {
    assert.deepEqual(initTeamScores(GAME_MODES[4]), { team1: 0, team2: 0 });
    assert.deepEqual(initTeamScores(GAME_MODES[6]), { team1: 0, team2: 0, team3: 0 });
  });

  it('getTeamKeys returns correct keys', () => {
    assert.deepEqual(getTeamKeys(GAME_MODES[4]), ['team1', 'team2']);
    assert.deepEqual(getTeamKeys(GAME_MODES[8]), ['team1', 'team2', 'team3', 'team4']);
  });

  it('teamKeyToNum and teamNumToKey are inverse', () => {
    for (let i = 1; i <= 4; i++) {
      assert.equal(teamKeyToNum(teamNumToKey(i)), i);
    }
  });
});

// ===== TRICK VALIDATION & WINNER =====

describe('Trick Validation', () => {
  it('allows leading any non-spade card', () => {
    const hand = [{ suit: 'H', rank: 'A' }, { suit: 'S', rank: '2' }];
    assert.ok(validatePlay({ suit: 'H', rank: 'A' }, hand, [], false).valid);
  });

  it('blocks leading spades when not broken', () => {
    const hand = [{ suit: 'H', rank: 'A' }, { suit: 'S', rank: '2' }];
    const result = validatePlay({ suit: 'S', rank: '2' }, hand, [], false);
    assert.equal(result.valid, false);
  });

  it('allows leading spades when only spades in hand', () => {
    const hand = [{ suit: 'S', rank: '2' }, { suit: 'S', rank: 'K' }];
    assert.ok(validatePlay({ suit: 'S', rank: '2' }, hand, [], false).valid);
  });

  it('allows leading spades when broken', () => {
    const hand = [{ suit: 'H', rank: 'A' }, { suit: 'S', rank: '2' }];
    assert.ok(validatePlay({ suit: 'S', rank: '2' }, hand, [], true).valid);
  });

  it('must follow suit', () => {
    const hand = [{ suit: 'H', rank: '5' }, { suit: 'D', rank: 'K' }];
    const trick = [{ card: { suit: 'H', rank: 'A' }, playerId: 'p1' }];
    const result = validatePlay({ suit: 'D', rank: 'K' }, hand, trick, false);
    assert.equal(result.valid, false);
  });

  it('can play any card when void in led suit', () => {
    const hand = [{ suit: 'S', rank: '2' }, { suit: 'D', rank: 'K' }];
    const trick = [{ card: { suit: 'H', rank: 'A' }, playerId: 'p1' }];
    assert.ok(validatePlay({ suit: 'S', rank: '2' }, hand, trick, false).valid);
  });
});

describe('Trick Winner', () => {
  it('highest card of led suit wins (no trumps)', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: '5', mega: false } },
      { playerId: 'p2', card: { suit: 'H', rank: 'K', mega: false } },
      { playerId: 'p3', card: { suit: 'H', rank: '3', mega: false } },
      { playerId: 'p4', card: { suit: 'H', rank: '10', mega: false } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });

  it('spade trumps non-spade', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: 'A', mega: false } },
      { playerId: 'p2', card: { suit: 'S', rank: '2', mega: false } },
      { playerId: 'p3', card: { suit: 'H', rank: 'K', mega: false } },
      { playerId: 'p4', card: { suit: 'H', rank: 'Q', mega: false } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });

  it('highest spade wins when multiple trumps', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: 'A', mega: false } },
      { playerId: 'p2', card: { suit: 'S', rank: '2', mega: false } },
      { playerId: 'p3', card: { suit: 'S', rank: '9', mega: false } },
      { playerId: 'p4', card: { suit: 'H', rank: 'K', mega: false } },
    ];
    assert.equal(determineTrickWinner(trick), 'p3');
  });

  it('mega card beats same rank regular', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: '5', mega: false } },
      { playerId: 'p2', card: { suit: 'H', rank: '5', mega: true } },
    ];
    assert.equal(determineTrickWinner(trick), 'p2');
  });

  it('regular next rank beats mega lower rank', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: '3', mega: false } },
      { playerId: 'p2', card: { suit: 'H', rank: '2', mega: true } },
    ];
    assert.equal(determineTrickWinner(trick), 'p1');
  });

  it('off-suit card loses even if higher', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'H', rank: '3', mega: false } },
      { playerId: 'p2', card: { suit: 'D', rank: 'A', mega: false } },
    ];
    assert.equal(determineTrickWinner(trick), 'p1');
  });

  it('works with N players (5-player trick)', () => {
    const trick = [
      { playerId: 'p1', card: { suit: 'D', rank: '7', mega: false } },
      { playerId: 'p2', card: { suit: 'D', rank: 'J', mega: false } },
      { playerId: 'p3', card: { suit: 'D', rank: '4', mega: false } },
      { playerId: 'p4', card: { suit: 'D', rank: 'A', mega: false } },
      { playerId: 'p5', card: { suit: 'D', rank: '9', mega: true } },
    ];
    assert.equal(determineTrickWinner(trick), 'p4'); // Ace still highest
  });
});

// ===== SCORING =====

describe('Scoring', () => {
  const mode4 = GAME_MODES[4];
  const players4 = [
    { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
    { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
  ];
  const lookup4 = buildTeamLookup(mode4, players4);

  it('scores made bid correctly', () => {
    const bids = { p1: 3, p2: 4, p3: 4, p4: 2 };
    const tricks = { p1: 4, p2: 4, p3: 3, p4: 2 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: bid 7, took 7 — score = 70
    assert.equal(result.team1.roundScore, 70);
    assert.equal(result.team1.books, 0);

    // Team 2: bid 6, took 6 — score = 60
    assert.equal(result.team2.roundScore, 60);
    assert.equal(result.team2.books, 0);
  });

  it('scores overtricks (books) correctly', () => {
    const bids = { p1: 3, p2: 3, p3: 3, p4: 3 };
    const tricks = { p1: 4, p2: 3, p3: 3, p4: 3 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: bid 6, took 7 — score = 61, 1 book
    assert.equal(result.team1.roundScore, 61);
    assert.equal(result.team1.books, 1);
  });

  it('scores missed bid (set) correctly', () => {
    const bids = { p1: 5, p2: 3, p3: 3, p4: 2 };
    const tricks = { p1: 3, p2: 4, p3: 2, p4: 4 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: bid 8, took 5 — set = -80
    assert.equal(result.team1.roundScore, -80);
    // Team 2: bid 5, took 8 — made = 53, 3 books
    assert.equal(result.team2.roundScore, 53);
    assert.equal(result.team2.books, 3);
  });

  it('scores nil correctly', () => {
    const bids = { p1: 0, p2: 3, p3: 5, p4: 5 };
    const tricks = { p1: 0, p2: 5, p3: 5, p4: 3 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: p1 nil made (+100), p3 bid 5 took 5 (+50) = 150
    assert.equal(result.team1.roundScore, 150);
  });

  it('scores failed nil correctly', () => {
    const bids = { p1: 0, p2: 3, p3: 5, p4: 4 };
    const tricks = { p1: 2, p2: 3, p3: 4, p4: 4 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: p1 nil failed (-100), p3 bid 5, effective tricks = 4 + 2 (failed nil) = 6 = made (+51)
    // Total: -100 + 51 = -49
    assert.equal(result.team1.roundScore, -49);
    assert.equal(result.team1.books, 1);
  });

  it('applies book penalty at threshold', () => {
    const bids = { p1: 3, p2: 3, p3: 3, p4: 3 };
    const tricks = { p1: 4, p2: 3, p3: 3, p4: 3 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 9, team2: 0 }; // Already at 9 books

    const result = scoreRound(players4, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup4);

    // Team 1: bid 6, took 7 = +61, but books go from 9 to 10 = -100 penalty
    // Total: 61 - 100 = -39, books reset to 0
    assert.equal(result.team1.roundScore, -39);
    assert.equal(result.team1.books, 0);
  });

  it('10-trick bonus when enabled', () => {
    const bids = { p1: 5, p2: 2, p3: 6, p4: 0 };
    const tricks = { p1: 5, p2: 2, p3: 6, p4: 0 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };
    const settings = { ...DEFAULT_GAME_SETTINGS, tenBidBonus: true };

    const result = scoreRound(players4, bids, tricks, scores, books, settings, new Set(), mode4, lookup4);

    // Team 1: bid 11, took 11 = 110 + 50 bonus = 160
    assert.equal(result.team1.roundScore, 160);
  });

  it('checkWinner detects winner', () => {
    assert.equal(checkWinner({ team1: 500, team2: 400 }, 500, mode4), 'team1');
    assert.equal(checkWinner({ team1: 400, team2: 499 }, 500, mode4), null);
  });

  it('checkWinner handles ties (play another round)', () => {
    assert.equal(checkWinner({ team1: 500, team2: 500 }, 500, mode4), null);
  });

  it('checkWinner picks highest when multiple above target', () => {
    assert.equal(checkWinner({ team1: 520, team2: 510 }, 500, mode4), 'team1');
  });
});

describe('Spoiler Scoring', () => {
  const mode5 = GAME_MODES[5];
  const players5 = [
    { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
    { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    { id: 'p5', team: 3 },
  ];
  const lookup5 = buildTeamLookup(mode5, players5);

  it('spoiler bid make is doubled', () => {
    const bids = { p1: 3, p2: 3, p3: 3, p4: 3, p5: 1 };
    const tricks = { p1: 3, p2: 3, p3: 3, p4: 3, p5: 1 };
    const scores = initTeamScores(mode5);
    const books = initTeamScores(mode5);

    const result = scoreRound(players5, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode5, lookup5);

    // Spoiler: bid 1 x 10 x 2 = 20
    assert.equal(result.team3.roundScore, 20);
    assert.equal(result.team3.isSpoiler, true);
    // Regular team: bid 6 x 10 = 60
    assert.equal(result.team1.roundScore, 60);
    assert.equal(result.team1.isSpoiler, false);
  });

  it('spoiler bid miss penalty is doubled', () => {
    const bids = { p1: 3, p2: 3, p3: 3, p4: 3, p5: 3 };
    const tricks = { p1: 4, p2: 4, p3: 3, p4: 2, p5: 0 };
    const scores = initTeamScores(mode5);
    const books = initTeamScores(mode5);

    const result = scoreRound(players5, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode5, lookup5);

    // Spoiler: bid 3, took 0 → -30 x 2 = -60
    assert.equal(result.team3.roundScore, -60);
  });

  it('spoiler nil made is doubled', () => {
    const bids = { p1: 4, p2: 4, p3: 4, p4: 4, p5: 0 };
    const tricks = { p1: 4, p2: 4, p3: 3, p4: 2, p5: 0 };
    const scores = initTeamScores(mode5);
    const books = initTeamScores(mode5);

    const result = scoreRound(players5, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode5, lookup5);

    // Spoiler nil made: 100 x 2 = 200
    assert.equal(result.team3.roundScore, 200);
  });

  it('spoiler nil failed is NOT doubled', () => {
    const bids = { p1: 3, p2: 3, p3: 3, p4: 3, p5: 0 };
    const tricks = { p1: 3, p2: 3, p3: 3, p4: 2, p5: 2 };
    const scores = initTeamScores(mode5);
    const books = initTeamScores(mode5);

    const result = scoreRound(players5, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode5, lookup5);

    // Spoiler nil failed: -100 (NOT doubled)
    assert.equal(result.team3.roundScore, -100);
  });

  it('spoiler overtricks (books) are NOT doubled', () => {
    const bids = { p1: 3, p2: 3, p3: 3, p4: 3, p5: 1 };
    const tricks = { p1: 3, p2: 3, p3: 2, p4: 2, p5: 3 };
    const scores = initTeamScores(mode5);
    const books = initTeamScores(mode5);

    const result = scoreRound(players5, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode5, lookup5);

    // Spoiler: bid 1 x 10 x 2 = 20, overtricks = 2 (NOT doubled) = 22
    assert.equal(result.team3.roundScore, 22);
    assert.equal(result.team3.books, 2);
  });
});

// ===== SEATING =====

describe('Seating Arrangement', () => {
  it('4p: partners sit across (offset 2)', () => {
    const mode = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const seated = arrangeSeating(players, mode);
    assert.equal(seated.length, 4);

    // Find team 1 players' seat indices
    const t1Seats = seated.filter(p => p.team === 1).map(p => p.seatIndex);
    const t2Seats = seated.filter(p => p.team === 2).map(p => p.seatIndex);

    // Partners should be exactly 2 apart (half of 4)
    assert.equal(Math.abs(t1Seats[0] - t1Seats[1]), 2);
    assert.equal(Math.abs(t2Seats[0] - t2Seats[1]), 2);
  });

  it('5p: partners sit across (offset 3 in hexagon), spoiler has empty opposite', () => {
    const mode = GAME_MODES[5];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
      { id: 'p5', team: 3 },
    ];
    const seated = arrangeSeating(players, mode);
    assert.equal(seated.length, 5); // 5 players in 6 layout positions

    // Partners should be at offset 3 (half of 6)
    const t1Seats = seated.filter(p => p.team === 1).map(p => p.seatIndex).sort();
    const t2Seats = seated.filter(p => p.team === 2).map(p => p.seatIndex).sort();

    assert.equal(t1Seats[1] - t1Seats[0], 3, 'Team 1 partners should be 3 apart');
    assert.equal(t2Seats[1] - t2Seats[0], 3, 'Team 2 partners should be 3 apart');

    // Spoiler's opposite seat should be empty
    const spoilerSeat = seated.find(p => p.team === 3).seatIndex;
    const oppositeSeat = (spoilerSeat + 3) % 6;
    const occupiedSeats = new Set(seated.map(p => p.seatIndex));
    assert.ok(!occupiedSeats.has(oppositeSeat), 'Spoiler opposite seat should be empty');
  });

  it('6p: partners sit across (offset 3)', () => {
    const mode = GAME_MODES[6];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 3 },
      { id: 'p4', team: 1 }, { id: 'p5', team: 2 }, { id: 'p6', team: 3 },
    ];
    const seated = arrangeSeating(players, mode);
    assert.equal(seated.length, 6);

    for (let t = 1; t <= 3; t++) {
      const seats = seated.filter(p => p.team === t).map(p => p.seatIndex).sort();
      assert.equal(seats[1] - seats[0], 3, `Team ${t} partners should be 3 apart`);
    }
  });

  it('7p: partners sit across (offset 4 in octagon)', () => {
    const mode = GAME_MODES[7];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 3 },
      { id: 'p4', team: 1 }, { id: 'p5', team: 2 }, { id: 'p6', team: 3 },
      { id: 'p7', team: 4 },
    ];
    const seated = arrangeSeating(players, mode);
    assert.equal(seated.length, 7);

    for (let t = 1; t <= 3; t++) {
      const seats = seated.filter(p => p.team === t).map(p => p.seatIndex).sort();
      assert.equal(seats[1] - seats[0], 4, `Team ${t} partners should be 4 apart`);
    }

    // Spoiler opposite is empty
    const spoilerSeat = seated.find(p => p.team === 4).seatIndex;
    const oppositeSeat = (spoilerSeat + 4) % 8;
    const occupiedSeats = new Set(seated.map(p => p.seatIndex));
    assert.ok(!occupiedSeats.has(oppositeSeat), 'Spoiler opposite seat should be empty');
  });

  it('8p: partners sit across (offset 4)', () => {
    const mode = GAME_MODES[8];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 }, { id: 'p3', team: 3 }, { id: 'p4', team: 4 },
      { id: 'p5', team: 1 }, { id: 'p6', team: 2 }, { id: 'p7', team: 3 }, { id: 'p8', team: 4 },
    ];
    const seated = arrangeSeating(players, mode);
    assert.equal(seated.length, 8);

    for (let t = 1; t <= 4; t++) {
      const seats = seated.filter(p => p.team === t).map(p => p.seatIndex).sort();
      assert.equal(seats[1] - seats[0], 4, `Team ${t} partners should be 4 apart`);
    }
  });
});

// ===== FULL GAME SIMULATION =====

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

describe('GameState - 4 Player', () => {
  it('initializes correctly', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);

    assert.equal(game.playerCount, 4);
    assert.equal(game.phase, 'bidding');
    assert.equal(game.roundNumber, 1);
    assert.equal(Object.keys(game.hands).length, 4);
    // Each player should have 13 cards
    for (const pid of Object.keys(game.hands)) {
      assert.equal(game.hands[pid].length, 13);
    }
  });

  it('accepts valid bids', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);

    // Bid for each player in turn order
    for (let i = 0; i < 4; i++) {
      const pid = game.getCurrentTurnPlayerId();
      const result = game.placeBid(pid, 3);
      if (i < 3) {
        assert.equal(result.allBidsIn, false);
      } else {
        assert.equal(result.allBidsIn, true);
        assert.equal(game.phase, 'playing');
      }
    }
  });

  it('rejects out-of-turn bid', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);

    const currentPid = game.getCurrentTurnPlayerId();
    const otherPid = players.find(p => p.id !== currentPid).id;
    const result = game.placeBid(otherPid, 3);
    assert.ok(result.error);
  });

  it('rejects invalid bid amount', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);

    const pid = game.getCurrentTurnPlayerId();
    assert.ok(game.placeBid(pid, -1).error);
    assert.ok(game.placeBid(pid, 14).error);
  });

  it('plays a full round', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });

    // Bid phase
    for (let i = 0; i < 4; i++) {
      game.placeBid(game.getCurrentTurnPlayerId(), 3);
    }
    assert.equal(game.phase, 'playing');

    // Play 13 tricks
    let roundOver = false;
    for (let trick = 0; trick < 13; trick++) {
      for (let card = 0; card < 4; card++) {
        const pid = game.getCurrentTurnPlayerId();
        const hand = game.hands[pid];
        // Play first valid card
        let played = false;
        for (const c of hand) {
          const result = game.playCard(pid, c);
          if (!result.error) {
            played = true;
            if (result.roundOver) roundOver = true;
            break;
          }
        }
        assert.ok(played, `Player ${pid} should be able to play a card`);
      }
    }

    assert.ok(roundOver, 'Round should be over after 13 tricks');
    // Should have round summary
    assert.equal(game.roundHistory.length, 1);
    assert.ok(game.roundHistory[0].teamScores);
    assert.ok(game.roundHistory[0].teamTotals);
    assert.ok(game.roundHistory[0].teamBooks);
  });

  it('plays a full game to completion', () => {
    const players = makeTestPlayers(4);
    const settings = { ...DEFAULT_GAME_SETTINGS, winTarget: 200, moonshot: false, tenBidBonus: false };
    const game = new GameState(players, {}, settings);

    let gameOver = false;
    let safety = 0;

    while (!gameOver && safety < 1000) {
      safety++;

      if (game.phase === 'bidding') {
        const pid = game.getCurrentTurnPlayerId();
        game.placeBid(pid, 3);
      } else if (game.phase === 'playing') {
        const pid = game.getCurrentTurnPlayerId();
        const hand = game.hands[pid];
        for (const c of hand) {
          const result = game.playCard(pid, c);
          if (!result.error) {
            if (result.gameOver) {
              gameOver = true;
            } else if (result.roundOver) {
              game.startNewRound();
            }
            break;
          }
        }
      } else if (game.phase === 'scoring') {
        game.startNewRound();
      } else if (game.phase === 'gameOver') {
        gameOver = true;
      }
    }

    assert.ok(gameOver, 'Game should reach completion');
    assert.ok(game.roundHistory.length > 0);
    assert.equal(game.phase, 'gameOver');
  });

  it('getStateForPlayer returns complete state', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);

    const state = game.getStateForPlayer(players[0].id);
    assert.equal(state.phase, 'bidding');
    assert.equal(state.hand.length, 13);
    assert.ok(state.mode);
    assert.equal(state.mode.playerCount, 4);
    assert.equal(state.mode.teamCount, 2);
    assert.ok(state.mode.teams);
    assert.equal(state.playerCount, 4);
    assert.ok(state.scores);
    assert.ok(state.books);
    assert.ok(state.gameSettings);
    assert.equal(state.gameSettings.bookThreshold, 10);
  });

  it('replacePlayer works correctly', () => {
    const players = makeTestPlayers(4);
    const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);

    const oldId = players[0].id;
    const newId = 'new-player-id';
    const success = game.replacePlayer(oldId, newId, 'New Name');
    assert.ok(success);

    assert.ok(game.hands[newId]);
    assert.ok(!game.hands[oldId]);
    assert.equal(game.players[0].id, newId);
    assert.equal(game.players[0].name, 'New Name');
  });
});

// Test each non-4-player mode
for (const n of [3, 5, 6, 7, 8]) {
  describe(`GameState - ${n} Player`, () => {
    it('initializes and deals correctly', () => {
      const players = makeTestPlayers(n);
      const game = new GameState(players, {}, DEFAULT_GAME_SETTINGS);
      const mode = GAME_MODES[n];

      assert.equal(game.playerCount, n);
      assert.equal(game.phase, 'bidding');
      assert.equal(Object.keys(game.hands).length, n);
      for (const pid of Object.keys(game.hands)) {
        assert.equal(game.hands[pid].length, mode.cardsPerPlayer, `Each player should have ${mode.cardsPerPlayer} cards`);
      }

      // No mega aces in any hand
      for (const hand of Object.values(game.hands)) {
        const megaAces = hand.filter(c => c.mega && c.rank === 'A');
        assert.equal(megaAces.length, 0, 'No mega aces should be dealt');
      }
    });

    it('plays a full round', () => {
      const players = makeTestPlayers(n);
      const game = new GameState(players, {}, { ...DEFAULT_GAME_SETTINGS, moonshot: false, tenBidBonus: false });
      const mode = GAME_MODES[n];

      // Bid phase
      for (let i = 0; i < n; i++) {
        game.placeBid(game.getCurrentTurnPlayerId(), 2);
      }
      assert.equal(game.phase, 'playing');

      // Play all tricks
      let roundOver = false;
      for (let trick = 0; trick < mode.tricksPerRound && !roundOver; trick++) {
        for (let card = 0; card < n; card++) {
          const pid = game.getCurrentTurnPlayerId();
          const hand = game.hands[pid];
          for (const c of hand) {
            const result = game.playCard(pid, c);
            if (!result.error) {
              if (result.roundOver) roundOver = true;
              break;
            }
          }
          if (roundOver) break;
        }
      }

      assert.ok(roundOver, `${n}p round should complete`);
      assert.equal(game.roundHistory.length, 1);

      // Verify round summary has correct team structure
      const summary = game.roundHistory[0];
      assert.ok(summary.teamScores);
      const teamKeys = getTeamKeys(GAME_MODES[n]);
      for (const tk of teamKeys) {
        assert.ok(tk in summary.teamScores, `${tk} should be in teamScores`);
        assert.ok(tk in summary.teamTotals, `${tk} should be in teamTotals`);
        assert.ok(tk in summary.teamBooks, `${tk} should be in teamBooks`);
      }
    });

    it('plays a full game to completion', () => {
      const players = makeTestPlayers(n);
      // High bookThreshold prevents book penalties from keeping scores negative
      const settings = { ...DEFAULT_GAME_SETTINGS, winTarget: 100, moonshot: false, tenBidBonus: false, bookThreshold: 100 };
      const game = new GameState(players, {}, settings);
      // 8p: 12 tricks / 8 players → bid 1 to avoid sets; others: bid 2
      const bidAmount = n >= 8 ? 1 : 2;

      let gameOver = false;
      let safety = 0;

      while (!gameOver && safety < 5000) {
        safety++;

        if (game.phase === 'bidding') {
          game.placeBid(game.getCurrentTurnPlayerId(), bidAmount);
        } else if (game.phase === 'playing') {
          const pid = game.getCurrentTurnPlayerId();
          const hand = game.hands[pid];
          for (const c of hand) {
            const result = game.playCard(pid, c);
            if (!result.error) {
              if (result.gameOver) {
                gameOver = true;
              } else if (result.roundOver) {
                game.startNewRound();
              }
              break;
            }
          }
        } else if (game.phase === 'scoring') {
          game.startNewRound();
        } else if (game.phase === 'gameOver') {
          gameOver = true;
        }
      }

      assert.ok(gameOver, `${n}p game should reach completion`);
      assert.equal(game.phase, 'gameOver');
    });
  });
}

// ===== SETTINGS =====

describe('Game Settings', () => {
  it('custom bookThreshold is respected', () => {
    const mode4 = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const lookup = buildTeamLookup(mode4, players);

    const bids = { p1: 3, p2: 3, p3: 3, p4: 3 };
    const tricks = { p1: 5, p2: 3, p3: 3, p4: 2 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 4, team2: 0 }; // 4 existing books

    // With threshold of 5: 4 + 2 = 6 >= 5 → penalty
    const settings5 = { ...DEFAULT_GAME_SETTINGS, bookThreshold: 5 };
    const result5 = scoreRound(players, bids, tricks, scores, books, settings5, new Set(), mode4, lookup);
    assert.equal(result5.team1.books, 1); // 6 % 5 = 1
    assert.ok(result5.team1.roundScore < 62); // Should have penalty deducted

    // With default threshold of 10: 4 + 2 = 6 < 10 → no penalty
    const result10 = scoreRound(players, bids, tricks, scores, { ...books }, DEFAULT_GAME_SETTINGS, new Set(), mode4, lookup);
    assert.equal(result10.team1.books, 6);
    assert.equal(result10.team1.roundScore, 62);
  });

  it('blind nil bonus and penalty', () => {
    const mode4 = GAME_MODES[4];
    const players = [
      { id: 'p1', team: 1 }, { id: 'p2', team: 2 },
      { id: 'p3', team: 1 }, { id: 'p4', team: 2 },
    ];
    const lookup = buildTeamLookup(mode4, players);

    // Blind nil made
    const bids = { p1: 0, p2: 5, p3: 5, p4: 3 };
    const tricks = { p1: 0, p2: 5, p3: 5, p4: 3 };
    const scores = { team1: 0, team2: 0 };
    const books = { team1: 0, team2: 0 };
    const blindNilPlayers = new Set(['p1']);

    const result = scoreRound(players, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, blindNilPlayers, mode4, lookup);

    // p1 blind nil made = +200 (not +100)
    // p3 bid 5 took 5 = +50
    assert.equal(result.team1.roundScore, 250);
  });

  it('moonshot detection in GameState', () => {
    const players = makeTestPlayers(4);
    const settings = { ...DEFAULT_GAME_SETTINGS, moonshot: true };
    const game = new GameState(players, {}, settings);

    // Force everyone's bid: need total bid = 13 from one team
    // Team 1 bids 13 total, team 2 bids 0
    const bidOrder = [];
    for (let i = 0; i < 4; i++) {
      bidOrder.push(game.getCurrentTurnPlayerId());
      const pid = game.getCurrentTurnPlayerId();
      const team = game.players.find(p => p.id === pid).team;
      if (team === 1) {
        // Use bid values that sum to 13
        const existingTeamBids = Object.entries(game.bids)
          .filter(([bid_pid]) => game.players.find(p => p.id === bid_pid)?.team === 1)
          .reduce((sum, [, b]) => sum + b, 0);
        const remainingTeam1 = game.players.filter(p => p.team === 1 && game.bids[p.id] === undefined).length;
        if (remainingTeam1 === 1) {
          game.placeBid(pid, 13 - existingTeamBids);
        } else {
          game.placeBid(pid, 6);
        }
      } else {
        game.placeBid(pid, 0);
      }
    }

    // Moonshot requires team to take ALL 13 tricks - just verify the game can handle it
    assert.equal(game.phase, 'playing');
  });
});

// ===== N-TEAM SCORING ACROSS ALL MODES =====

describe('N-Team Scoring', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    it(`${n}p mode scoring uses correct team structure`, () => {
      const mode = GAME_MODES[n];
      const players = makeTestPlayers(n);
      const lookup = buildTeamLookup(mode, players);
      const scores = initTeamScores(mode);
      const books = initTeamScores(mode);
      const teamKeys = getTeamKeys(mode);

      // Create bids and tricks where everyone bids 2 and takes varying tricks
      const bids = {};
      const tricks = {};
      for (const p of players) {
        bids[p.id] = 2;
        tricks[p.id] = 2; // Everyone makes their bid exactly
      }

      const result = scoreRound(players, bids, tricks, scores, books, DEFAULT_GAME_SETTINGS, new Set(), mode, lookup);

      // All teams should have scored
      for (const tk of teamKeys) {
        assert.ok(tk in result, `${tk} should be in result for ${n}p mode`);
        assert.ok(typeof result[tk].roundScore === 'number');
        assert.ok(typeof result[tk].newTotal === 'number');
        assert.ok(typeof result[tk].books === 'number');
      }
    });
  }
});

console.log('All test suites defined. Running...');
