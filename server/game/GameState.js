import { createDeck, shuffle, deal } from './deck.js';
import { validatePlay, determineTrickWinner } from './tricks.js';
import { scoreRound, checkWinner } from './scoring.js';
import { getCardValue, DEFAULT_GAME_SETTINGS } from './constants.js';
import { parseCardSort, DEFAULTS } from './preferences.js';
import { getMode } from './modes.js';
import { buildTeamLookup, initTeamScores, getTeamKeys } from './modeHelpers.js';

export class GameState {
  constructor(players, playerPreferences = {}, gameSettings = {}, mode) {
    // players: [{ id, name, team, seatIndex }] - ordered by seating
    this.players = players;
    this.playerCount = players.length;
    // playerPreferences: { playerId: { cardSort, tableColor } }
    this.playerPreferences = playerPreferences;
    this.settings = { ...DEFAULT_GAME_SETTINGS, ...gameSettings };
    this.mode = mode || getMode(this.playerCount);
    this.teamLookup = buildTeamLookup(this.mode, this.players);
    this.phase = 'bidding'; // bidding | playing | scoring | gameOver
    this.dealerIndex = Math.floor(Math.random() * this.playerCount);
    this.hands = {};
    this.bids = {};
    this.blindNilPlayers = new Set();
    this.currentTrick = [];
    this.tricksTaken = {};
    this.currentTurnIndex = -1;
    this.trickLeaderIndex = -1;
    this.spadesBroken = false;
    this.scores = initTeamScores(this.mode);
    this.books = initTeamScores(this.mode);
    this.roundNumber = 0;
    this.roundHistory = [];
    this.tricksPlayed = 0;
    this.cardsPlayed = []; // All cards played this round (for bot card memory)

    this.startNewRound();
  }

  startNewRound() {
    this.roundNumber++;
    this.phase = 'bidding';
    this.bids = {};
    this.blindNilPlayers = new Set();
    this.tricksTaken = {};
    this.currentTrick = [];
    this.spadesBroken = false;
    this.tricksPlayed = 0;
    this.cardsPlayed = [];

    for (const p of this.players) {
      this.tricksTaken[p.id] = 0;
    }

    // Deal cards
    const deck = shuffle(createDeck(this.mode));
    const hands = deal(deck, this.playerCount);
    for (let i = 0; i < this.playerCount; i++) {
      const pid = this.players[i].id;
      const prefs = this.playerPreferences[pid];
      this.hands[pid] = this.sortHand(hands[i], prefs);
    }

    // Bidding starts left of dealer
    this.currentTurnIndex = (this.dealerIndex + 1) % this.playerCount;
  }

  sortHand(hand, prefs) {
    const cardSort = prefs?.cardSort || DEFAULTS.cardSort;
    const { suitOrder, rankDirection } = parseCardSort(cardSort);
    const rankMul = rankDirection === 'desc' ? -1 : 1;
    return hand.sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return rankMul * (getCardValue(a) - getCardValue(b));
    });
  }

  getCurrentTurnPlayerId() {
    return this.players[this.currentTurnIndex].id;
  }

  placeBid(playerId, bid, options = {}) {
    if (this.phase !== 'bidding') {
      return { error: 'Not in bidding phase' };
    }
    if (this.getCurrentTurnPlayerId() !== playerId) {
      return { error: 'Not your turn to bid' };
    }
    if (!Number.isInteger(bid) || bid < 0 || bid > this.mode.cardsPerPlayer) {
      return { error: `Bid must be 0-${this.mode.cardsPerPlayer}` };
    }

    // Blind nil validation
    if (options.blindNil) {
      if (!this.settings.blindNil) {
        return { error: 'Blind nil is not enabled' };
      }
      if (bid !== 0) {
        return { error: 'Blind nil must be a nil bid' };
      }
    }

    this.bids[playerId] = bid;
    if (options.blindNil) {
      this.blindNilPlayers.add(playerId);
    }

    // Check if all bids are in
    if (Object.keys(this.bids).length === this.playerCount) {
      this.phase = 'playing';
      // First lead is left of dealer
      this.currentTurnIndex = (this.dealerIndex + 1) % this.playerCount;
      this.trickLeaderIndex = this.currentTurnIndex;
      return { allBidsIn: true, nextTurnId: this.getCurrentTurnPlayerId() };
    }

    // Next bidder
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerCount;
    return { allBidsIn: false, nextTurnId: this.getCurrentTurnPlayerId() };
  }

  playCard(playerId, card) {
    if (this.phase !== 'playing') {
      return { error: 'Not in playing phase' };
    }
    if (this.getCurrentTurnPlayerId() !== playerId) {
      return { error: 'Not your turn' };
    }

    const hand = this.hands[playerId];
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank && !!c.mega === !!card.mega);
    if (cardIndex === -1) {
      return { error: 'You don\'t have that card' };
    }

    const validation = validatePlay(card, hand, this.currentTrick, this.spadesBroken);
    if (!validation.valid) {
      return { error: validation.reason };
    }

    // Play the card
    hand.splice(cardIndex, 1);
    this.currentTrick.push({ playerId, card });

    // Check if spades broken
    if (card.suit === 'S') {
      this.spadesBroken = true;
    }

    // Trick complete?
    if (this.currentTrick.length === this.playerCount) {
      const winnerId = determineTrickWinner(this.currentTrick);
      this.tricksTaken[winnerId]++;
      this.tricksPlayed++;

      const completedTrick = [...this.currentTrick];
      // Record all cards from this trick for card memory
      for (const play of completedTrick) {
        this.cardsPlayed.push({ playerId: play.playerId, card: play.card });
      }
      this.currentTrick = [];

      // All tricks done?
      if (this.tricksPlayed === this.mode.tricksPerRound) {
        return this.endRound(winnerId, completedTrick);
      }

      // Winner leads next trick
      this.trickLeaderIndex = this.players.findIndex(p => p.id === winnerId);
      this.currentTurnIndex = this.trickLeaderIndex;

      return {
        trickComplete: true,
        trick: completedTrick,
        winnerId,
        nextTurnId: this.getCurrentTurnPlayerId(),
      };
    }

    // Next player's turn
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.playerCount;
    return {
      trickComplete: false,
      nextTurnId: this.getCurrentTurnPlayerId(),
    };
  }

  endRound(lastTrickWinnerId, lastTrick) {
    this.phase = 'scoring';
    const teamKeys = getTeamKeys(this.mode);

    // Moonshot check: team bids 13 combined and takes all 13 tricks = instant win
    if (this.settings.moonshot) {
      const { teamsByKey } = this.teamLookup;
      for (const teamKey of teamKeys) {
        const playerIds = teamsByKey[teamKey];
        const combinedBid = playerIds.reduce((sum, id) => sum + this.bids[id], 0);
        const combinedTricks = playerIds.reduce((sum, id) => sum + this.tricksTaken[id], 0);
        if (combinedBid === this.mode.tricksPerRound && combinedTricks === this.mode.tricksPerRound) {
          this.phase = 'gameOver';

          // Build dynamic team scores for round summary
          const teamScores = {};
          const teamTotals = {};
          const teamBooks = {};
          for (const tk of teamKeys) {
            teamScores[tk] = tk === teamKey ? 'MOONSHOT' : 0;
            teamTotals[tk] = this.scores[tk];
            teamBooks[tk] = this.books[tk];
          }

          const roundSummary = {
            roundNumber: this.roundNumber,
            bids: { ...this.bids },
            tricksTaken: { ...this.tricksTaken },
            // Dynamic N-team fields
            teamScores,
            teamTotals,
            teamBooks,
            // Backward-compat flat fields (for 4-player clients)
            team1Score: teamScores.team1 ?? 0,
            team2Score: teamScores.team2 ?? 0,
            team1Total: this.scores.team1 ?? 0,
            team2Total: this.scores.team2 ?? 0,
            team1Books: this.books.team1 ?? 0,
            team2Books: this.books.team2 ?? 0,
            moonshot: teamKey,
            blindNilPlayers: [...this.blindNilPlayers],
          };
          this.roundHistory.push(roundSummary);
          return {
            trickComplete: true,
            trick: lastTrick,
            winnerId: lastTrickWinnerId,
            roundOver: true,
            roundSummary,
            gameOver: true,
            winningTeam: teamKey,
          };
        }
      }
    }

    const roundResult = scoreRound(
      this.players,
      this.bids,
      this.tricksTaken,
      this.scores,
      this.books,
      this.settings,
      this.blindNilPlayers,
      this.mode,
      this.teamLookup
    );

    // Update totals dynamically for all teams
    for (const teamKey of teamKeys) {
      if (roundResult[teamKey]) {
        this.scores[teamKey] = roundResult[teamKey].newTotal;
        this.books[teamKey] = roundResult[teamKey].books;
      }
    }

    // Build round summary with dynamic team fields
    const teamScores = {};
    const teamTotals = {};
    const teamBooks = {};
    for (const teamKey of teamKeys) {
      teamScores[teamKey] = roundResult[teamKey]?.roundScore ?? 0;
      teamTotals[teamKey] = this.scores[teamKey] ?? 0;
      teamBooks[teamKey] = this.books[teamKey] ?? 0;
    }

    const roundSummary = {
      roundNumber: this.roundNumber,
      bids: { ...this.bids },
      tricksTaken: { ...this.tricksTaken },
      // Dynamic N-team fields
      teamScores,
      teamTotals,
      teamBooks,
      // Backward-compat flat fields
      team1Score: teamScores.team1 ?? 0,
      team2Score: teamScores.team2 ?? 0,
      team1Total: this.scores.team1 ?? 0,
      team2Total: this.scores.team2 ?? 0,
      team1Books: this.books.team1 ?? 0,
      team2Books: this.books.team2 ?? 0,
      blindNilPlayers: [...this.blindNilPlayers],
    };
    this.roundHistory.push(roundSummary);

    // Check winner
    const winner = checkWinner(this.scores, this.settings.winTarget, this.mode);
    if (winner) {
      this.phase = 'gameOver';
      return {
        trickComplete: true,
        trick: lastTrick,
        winnerId: lastTrickWinnerId,
        roundOver: true,
        roundSummary,
        gameOver: true,
        winningTeam: winner,
      };
    }

    // Rotate dealer and start new round
    this.dealerIndex = (this.dealerIndex + 1) % this.playerCount;

    return {
      trickComplete: true,
      trick: lastTrick,
      winnerId: lastTrickWinnerId,
      roundOver: true,
      roundSummary,
      gameOver: false,
    };
  }

  replacePlayer(oldId, newId, newName, props = {}) {
    const gamePlayer = this.players.find(p => p.id === oldId);
    if (!gamePlayer) return false;

    gamePlayer.id = newId;
    if (newName !== null) gamePlayer.name = newName;
    if (props.isBot !== undefined) gamePlayer.isBot = props.isBot;
    if (props.userId !== undefined) gamePlayer.userId = props.userId;

    // Remap all player-ID-keyed state
    if (this.hands[oldId]) {
      this.hands[newId] = this.hands[oldId];
      delete this.hands[oldId];
    }
    if (this.bids[oldId] !== undefined) {
      this.bids[newId] = this.bids[oldId];
      delete this.bids[oldId];
    }
    if (this.tricksTaken[oldId] !== undefined) {
      this.tricksTaken[newId] = this.tricksTaken[oldId];
      delete this.tricksTaken[oldId];
    }
    if (this.playerPreferences[oldId]) {
      this.playerPreferences[newId] = this.playerPreferences[oldId];
      delete this.playerPreferences[oldId];
    }
    for (const t of this.currentTrick) {
      if (t.playerId === oldId) t.playerId = newId;
    }
    for (const c of this.cardsPlayed) {
      if (c.playerId === oldId) c.playerId = newId;
    }
    if (this.blindNilPlayers.has(oldId)) {
      this.blindNilPlayers.delete(oldId);
      this.blindNilPlayers.add(newId);
    }

    // Rebuild team lookup after player swap
    this.teamLookup = buildTeamLookup(this.mode, this.players);

    return true;
  }

  getStateForPlayer(playerId) {
    const hand = this.hands[playerId] || [];
    return {
      phase: this.phase,
      hand,
      bids: { ...this.bids },
      currentTrick: this.currentTrick.map(t => ({ playerId: t.playerId, card: t.card })),
      tricksTaken: { ...this.tricksTaken },
      scores: { ...this.scores },
      books: { ...this.books },
      currentTurnId: this.phase !== 'gameOver' ? this.getCurrentTurnPlayerId() : null,
      dealerIndex: this.dealerIndex,
      spadesBroken: this.spadesBroken,
      roundNumber: this.roundNumber,
      roundHistory: this.roundHistory,
      players: this.players.map(p => ({ id: p.id, name: p.name, team: p.team, seatIndex: p.seatIndex, isBot: p.isBot || false })),
      gameSettings: this.settings,
      blindNilPlayers: [...this.blindNilPlayers],
      playerCount: this.playerCount,
      mode: {
        playerCount: this.mode.playerCount,
        teamCount: this.mode.teamCount,
        cardsPerPlayer: this.mode.cardsPerPlayer,
        tricksPerRound: this.mode.tricksPerRound,
        hasSpoiler: this.mode.hasSpoiler,
        seatingPattern: this.mode.seatingPattern,
        teams: this.mode.teams,
      },
    };
  }
}
