import { createDeck, shuffle, deal } from './deck.js';
import { validatePlay, determineTrickWinner } from './tricks.js';
import { scoreRound, checkWinner } from './scoring.js';
import { RANK_VALUE } from './constants.js';

export class GameState {
  constructor(players) {
    // players: [{ id, name, team }] - ordered so 0+2=team1, 1+3=team2
    this.players = players;
    this.phase = 'bidding'; // bidding | playing | scoring | gameOver
    this.dealerIndex = Math.floor(Math.random() * 4);
    this.hands = {};
    this.bids = {};
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
      this.hands[this.players[i].id] = this.sortHand(hands[i]);
    }

    // Bidding starts left of dealer
    this.currentTurnIndex = (this.dealerIndex + 1) % 4;
  }

  sortHand(hand) {
    const suitOrder = { C: 0, D: 1, S: 2, H: 3 };
    return hand.sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
  }

  getCurrentTurnPlayerId() {
    return this.players[this.currentTurnIndex].id;
  }

  placeBid(playerId, bid) {
    if (this.phase !== 'bidding') {
      return { error: 'Not in bidding phase' };
    }
    if (this.getCurrentTurnPlayerId() !== playerId) {
      return { error: 'Not your turn to bid' };
    }
    if (!Number.isInteger(bid) || bid < 0 || bid > 13) {
      return { error: 'Bid must be 0-13' };
    }

    this.bids[playerId] = bid;

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

    const roundResult = scoreRound(
      this.players,
      this.bids,
      this.tricksTaken,
      this.scores,
      this.books
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
    };
    this.roundHistory.push(roundSummary);

    // Check winner
    const winner = checkWinner(this.scores);
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

  getStateForPlayer(playerId) {
    return {
      phase: this.phase,
      hand: this.hands[playerId] || [],
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
    };
  }
}
