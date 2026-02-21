import { createDeck, shuffle, deal } from './deck.js';
import { validatePlay, determineTrickWinner } from './tricks.js';
import { scoreRound, checkWinner } from './scoring.js';
import { RANK_VALUE, DEFAULT_GAME_SETTINGS } from './constants.js';
import { parseCardSort, DEFAULTS } from './preferences.js';

export class GameState {
  constructor(players, playerPreferences = {}, gameSettings = {}) {
    // players: [{ id, name, team }] - ordered so 0+2=team1, 1+3=team2
    this.players = players;
    // playerPreferences: { playerId: { cardSort, tableColor } }
    this.playerPreferences = playerPreferences;
    this.settings = { ...DEFAULT_GAME_SETTINGS, ...gameSettings };
    this.phase = 'bidding'; // bidding | playing | scoring | gameOver
    this.dealerIndex = Math.floor(Math.random() * 4);
    this.hands = {};
    this.bids = {};
    this.blindNilPlayers = new Set();
    this.currentTrick = [];
    this.tricksTaken = {};
    this.currentTurnIndex = -1;
    this.trickLeaderIndex = -1;
    this.spadesBroken = false;
    this.scores = { team1: 0, team2: 0 };
    this.books = { team1: 0, team2: 0 };
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
    const deck = shuffle(createDeck());
    const hands = deal(deck);
    for (let i = 0; i < 4; i++) {
      const pid = this.players[i].id;
      const prefs = this.playerPreferences[pid];
      this.hands[pid] = this.sortHand(hands[i], prefs);
    }

    // Bidding starts left of dealer
    this.currentTurnIndex = (this.dealerIndex + 1) % 4;
  }

  sortHand(hand, prefs) {
    const cardSort = prefs?.cardSort || DEFAULTS.cardSort;
    const { suitOrder, rankDirection } = parseCardSort(cardSort);
    const rankMul = rankDirection === 'desc' ? -1 : 1;
    return hand.sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return rankMul * (RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
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
    if (!Number.isInteger(bid) || bid < 0 || bid > 13) {
      return { error: 'Bid must be 0-13' };
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
    if (Object.keys(this.bids).length === 4) {
      this.phase = 'playing';
      // First lead is left of dealer
      this.currentTurnIndex = (this.dealerIndex + 1) % 4;
      this.trickLeaderIndex = this.currentTurnIndex;
      return { allBidsIn: true, nextTurnId: this.getCurrentTurnPlayerId() };
    }

    // Next bidder
    this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
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
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
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
    if (this.currentTrick.length === 4) {
      const winnerId = determineTrickWinner(this.currentTrick);
      this.tricksTaken[winnerId]++;
      this.tricksPlayed++;

      const completedTrick = [...this.currentTrick];
      // Record all cards from this trick for card memory
      for (const play of completedTrick) {
        this.cardsPlayed.push({ playerId: play.playerId, card: play.card });
      }
      this.currentTrick = [];

      // All 13 tricks done?
      if (this.tricksPlayed === 13) {
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
    this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
    return {
      trickComplete: false,
      nextTurnId: this.getCurrentTurnPlayerId(),
    };
  }

  endRound(lastTrickWinnerId, lastTrick) {
    this.phase = 'scoring';

    // Moonshot check: team bids 13 combined and takes all 13 tricks = instant win
    if (this.settings.moonshot) {
      const teams = {
        team1: [this.players[0].id, this.players[2].id],
        team2: [this.players[1].id, this.players[3].id],
      };
      for (const [teamKey, playerIds] of Object.entries(teams)) {
        const combinedBid = playerIds.reduce((sum, id) => sum + this.bids[id], 0);
        const combinedTricks = playerIds.reduce((sum, id) => sum + this.tricksTaken[id], 0);
        if (combinedBid === 13 && combinedTricks === 13) {
          this.phase = 'gameOver';
          const roundSummary = {
            roundNumber: this.roundNumber,
            bids: { ...this.bids },
            tricksTaken: { ...this.tricksTaken },
            team1Score: teamKey === 'team1' ? 'MOONSHOT' : 0,
            team2Score: teamKey === 'team2' ? 'MOONSHOT' : 0,
            team1Total: this.scores.team1,
            team2Total: this.scores.team2,
            team1Books: this.books.team1,
            team2Books: this.books.team2,
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
      this.blindNilPlayers
    );

    // Update totals
    this.scores.team1 = roundResult.team1.newTotal;
    this.scores.team2 = roundResult.team2.newTotal;
    this.books.team1 = roundResult.team1.books;
    this.books.team2 = roundResult.team2.books;

    // Build round summary
    const roundSummary = {
      roundNumber: this.roundNumber,
      bids: { ...this.bids },
      tricksTaken: { ...this.tricksTaken },
      team1Score: roundResult.team1.roundScore,
      team2Score: roundResult.team2.roundScore,
      team1Total: this.scores.team1,
      team2Total: this.scores.team2,
      team1Books: this.books.team1,
      team2Books: this.books.team2,
      blindNilPlayers: [...this.blindNilPlayers],
    };
    this.roundHistory.push(roundSummary);

    // Check winner
    const winner = checkWinner(this.scores, this.settings.winTarget);
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
    this.dealerIndex = (this.dealerIndex + 1) % 4;

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
    return true;
  }

  getStateForPlayer(playerId) {
    // Re-sort hand for this specific player's preferences (hand may have been
    // initially sorted with their prefs, but this ensures correctness after mid-round changes)
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
    };
  }
}
