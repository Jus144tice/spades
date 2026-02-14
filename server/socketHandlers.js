import {
  createLobby,
  joinLobby,
  leaveLobby,
  getLobby,
  getPlayerInfo,
  addChatMessage,
  assignTeam,
  autoAssignTeams,
  canStartGame,
  arrangeSeating,
  addBot,
  removeBot,
} from './lobby.js';
import { GameState } from './game/GameState.js';
import { botBid, botPlayCard } from './botAI.js';

// Delay range for bot actions (ms) - feels more natural
const BOT_DELAY_MIN = 800;
const BOT_DELAY_MAX = 2000;

function botDelay() {
  return BOT_DELAY_MIN + Math.random() * (BOT_DELAY_MAX - BOT_DELAY_MIN);
}

export function registerHandlers(io, socket) {
  socket.on('create_lobby', ({ playerName }) => {
    const lobby = createLobby(socket.id, playerName);
    socket.join(lobby.code);
    socket.emit('lobby_created', {
      lobbyCode: lobby.code,
      playerId: socket.id,
      players: lobby.players,
      isHost: true,
    });
  });

  socket.on('join_lobby', ({ playerName, lobbyCode }) => {
    const result = joinLobby(socket.id, playerName, lobbyCode);
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    socket.join(result.lobby.code);
    socket.emit('lobby_joined', {
      lobbyCode: result.lobby.code,
      playerId: socket.id,
      players: result.lobby.players,
      chatLog: result.lobby.chatLog,
      isHost: false,
    });

    socket.to(result.lobby.code).emit('player_joined', {
      player: result.player,
      players: result.lobby.players,
    });

    const msg = addChatMessage(result.lobby.code, null, `${playerName} joined the room`);
    io.to(result.lobby.code).emit('chat_message', msg);
  });

  socket.on('add_bot', () => {
    try {
      const info = getPlayerInfo(socket.id);
      if (!info) { console.log('add_bot: no player info for', socket.id); return; }

      const lobby = getLobby(info.lobbyCode);
      if (!lobby || lobby.hostId !== socket.id) {
        socket.emit('error_msg', { message: 'Only the host can add bots' });
        return;
      }

      const result = addBot(info.lobbyCode);
      if (result.error) {
        socket.emit('error_msg', { message: result.error });
        return;
      }

      console.log('Bot added:', result.player.name, '- emitting to', socket.id);

      const joinData = {
        player: result.player,
        players: result.lobby.players,
      };

      socket.emit('player_joined', joinData);
      socket.to(info.lobbyCode).emit('player_joined', joinData);

      const msg = addChatMessage(info.lobbyCode, null, `${result.player.name} (Bot) joined the room`);
      socket.emit('chat_message', msg);
      socket.to(info.lobbyCode).emit('chat_message', msg);
    } catch (err) {
      console.error('add_bot error:', err);
      socket.emit('error_msg', { message: 'Failed to add bot' });
    }
  });

  socket.on('remove_bot', ({ botId }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) {
      socket.emit('error_msg', { message: 'Only the host can remove bots' });
      return;
    }

    const result = removeBot(info.lobbyCode, botId);
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    const leftData = {
      playerId: botId,
      playerName: result.botName,
      players: result.players,
    };

    socket.emit('player_left', leftData);
    socket.to(info.lobbyCode).emit('player_left', leftData);

    const msg = addChatMessage(info.lobbyCode, null, `${result.botName} (Bot) was removed`);
    socket.emit('chat_message', msg);
    socket.to(info.lobbyCode).emit('chat_message', msg);
  });

  socket.on('send_chat', ({ message }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const msg = addChatMessage(info.lobbyCode, info.playerName, message);
    if (msg) {
      io.to(info.lobbyCode).emit('chat_message', msg);
    }
  });

  socket.on('assign_team', ({ targetPlayerId, team }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) {
      socket.emit('error_msg', { message: 'Only the host can assign teams' });
      return;
    }

    const result = assignTeam(info.lobbyCode, targetPlayerId, team);
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    io.to(info.lobbyCode).emit('teams_updated', { players: result.players });
  });

  socket.on('auto_assign_teams', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) {
      socket.emit('error_msg', { message: 'Only the host can auto-assign teams' });
      return;
    }

    const result = autoAssignTeams(info.lobbyCode);
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    io.to(info.lobbyCode).emit('teams_updated', { players: result.players });

    const msg = addChatMessage(info.lobbyCode, null, 'Teams were randomly assigned!');
    io.to(info.lobbyCode).emit('chat_message', msg);
  });

  socket.on('start_game', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const check = canStartGame(info.lobbyCode, socket.id);
    if (check.error) {
      socket.emit('error_msg', { message: check.error });
      return;
    }

    const lobby = getLobby(info.lobbyCode);
    const seatedPlayers = arrangeSeating(lobby.players);
    lobby.game = new GameState(seatedPlayers);
    lobby.players = seatedPlayers;

    const msg = addChatMessage(info.lobbyCode, null, 'The game has started!');
    io.to(info.lobbyCode).emit('chat_message', msg);

    // Send each human player their hand
    for (const player of seatedPlayers) {
      if (!player.isBot) {
        const state = lobby.game.getStateForPlayer(player.id);
        io.to(player.id).emit('game_started', state);
      }
    }

    // Trigger bot turns if a bot needs to bid first
    scheduleBotTurn(io, info.lobbyCode);
  });

  socket.on('place_bid', ({ bid }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || !lobby.game) return;

    const result = lobby.game.placeBid(socket.id, bid);
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    io.to(info.lobbyCode).emit('bid_placed', {
      playerId: socket.id,
      bid,
      allBidsIn: result.allBidsIn,
      nextTurnId: result.nextTurnId,
    });

    if (result.allBidsIn) {
      const msg = addChatMessage(info.lobbyCode, null, 'All bids are in! Let\'s play!');
      io.to(info.lobbyCode).emit('chat_message', msg);
    }

    // Trigger bot turn if next player is a bot
    scheduleBotTurn(io, info.lobbyCode);
  });

  socket.on('play_card', ({ card }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || !lobby.game) return;

    processCardPlay(io, info.lobbyCode, socket.id, card);
  });

  socket.on('return_to_lobby', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby) return;

    lobby.game = null;
    for (const p of lobby.players) {
      p.team = null;
    }

    io.to(info.lobbyCode).emit('returned_to_lobby', {
      players: lobby.players,
    });
  });

  socket.on('leave_lobby', () => {
    handleDisconnect(io, socket);
  });

  socket.on('disconnect', () => {
    handleDisconnect(io, socket);
  });
}

// --- Process a card play (works for both humans and bots) ---

function processCardPlay(io, lobbyCode, playerId, card) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;

  const result = lobby.game.playCard(playerId, card);
  if (result.error) {
    // For humans, emit error; bots shouldn't hit this
    io.to(playerId).emit?.('error_msg', { message: result.error });
    return;
  }

  io.to(lobbyCode).emit('card_played', {
    playerId,
    card,
    nextTurnId: result.nextTurnId,
  });

  if (result.trickComplete) {
    io.to(lobbyCode).emit('trick_won', {
      winnerId: result.winnerId,
      trick: result.trick,
      tricksTaken: lobby.game.tricksTaken,
    });

    if (result.roundOver) {
      io.to(lobbyCode).emit('round_scored', {
        roundSummary: result.roundSummary,
        scores: lobby.game.scores,
        books: lobby.game.books,
      });

      if (result.gameOver) {
        const winTeamPlayers = lobby.game.players
          .filter(p => p.team === (result.winningTeam === 'team1' ? 1 : 2))
          .map(p => p.name);

        io.to(lobbyCode).emit('game_over', {
          winningTeam: result.winningTeam,
          winningPlayers: winTeamPlayers,
          finalScores: lobby.game.scores,
          roundHistory: lobby.game.roundHistory,
        });

        const msg = addChatMessage(lobbyCode, null, `Game over! ${winTeamPlayers.join(' & ')} win!`);
        io.to(lobbyCode).emit('chat_message', msg);
        return; // No more bot turns needed
      } else {
        lobby.game.startNewRound();
        for (const player of lobby.game.players) {
          if (!player.isBot) {
            const state = lobby.game.getStateForPlayer(player.id);
            io.to(player.id).emit('new_round', state);
          }
        }

        const msg = addChatMessage(lobbyCode, null, `Round ${lobby.game.roundNumber} - Deal 'em up!`);
        io.to(lobbyCode).emit('chat_message', msg);
      }
    }
  }

  // Schedule next bot turn if needed
  scheduleBotTurn(io, lobbyCode);
}

// --- Bot turn scheduling ---

function scheduleBotTurn(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;
  if (lobby.game.phase === 'gameOver' || lobby.game.phase === 'scoring') return;

  const currentPlayerId = lobby.game.getCurrentTurnPlayerId();
  const currentPlayer = lobby.game.players.find(p => p.id === currentPlayerId);

  if (!currentPlayer || !currentPlayer.isBot) return;

  setTimeout(() => {
    executeBotTurn(io, lobbyCode, currentPlayerId);
  }, botDelay());
}

function executeBotTurn(io, lobbyCode, botId) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;

  // Verify it's still this bot's turn
  const currentPlayerId = lobby.game.getCurrentTurnPlayerId();
  if (currentPlayerId !== botId) return;

  const game = lobby.game;
  const botPlayer = game.players.find(p => p.id === botId);
  if (!botPlayer) return;

  if (game.phase === 'bidding') {
    // Calculate bot bid
    const hand = game.hands[botId];
    const botIndex = game.players.findIndex(p => p.id === botId);
    const partnerIndex = (botIndex + 2) % 4;
    const partnerId = game.players[partnerIndex].id;
    const partnerBid = game.bids[partnerId]; // may be undefined if partner hasn't bid yet

    const opp1Index = (botIndex + 1) % 4;
    const opp2Index = (botIndex + 3) % 4;
    const opponentBids = [game.bids[game.players[opp1Index].id], game.bids[game.players[opp2Index].id]];

    const bid = botBid(hand, partnerBid, opponentBids, game);

    const result = game.placeBid(botId, bid);
    if (result.error) return; // shouldn't happen

    io.to(lobbyCode).emit('bid_placed', {
      playerId: botId,
      bid,
      allBidsIn: result.allBidsIn,
      nextTurnId: result.nextTurnId,
    });

    if (result.allBidsIn) {
      const msg = addChatMessage(lobbyCode, null, 'All bids are in! Let\'s play!');
      io.to(lobbyCode).emit('chat_message', msg);
    }

    // Continue with next bot if needed
    scheduleBotTurn(io, lobbyCode);

  } else if (game.phase === 'playing') {
    const hand = game.hands[botId];
    const gameStateForBot = {
      currentTrick: game.currentTrick,
      bids: game.bids,
      tricksTaken: game.tricksTaken,
      players: game.players,
      spadesBroken: game.spadesBroken,
    };

    const card = botPlayCard(hand, gameStateForBot, botId);
    if (!card) return;

    processCardPlay(io, lobbyCode, botId, card);
  }
}

function handleDisconnect(io, socket) {
  const result = leaveLobby(socket.id);
  if (!result || result.disbanded) return;

  const lobby = getLobby(result.lobbyCode);

  if (lobby && lobby.game) {
    lobby.game = null;
    for (const p of lobby.players) {
      p.team = null;
    }

    const msg = addChatMessage(
      result.lobbyCode,
      null,
      `${result.playerName} left. Game has been cancelled.`
    );
    io.to(result.lobbyCode).emit('chat_message', msg);
    io.to(result.lobbyCode).emit('returned_to_lobby', { players: lobby.players });
  }

  io.to(result.lobbyCode).emit('player_left', {
    playerId: socket.id,
    playerName: result.playerName,
    newHostId: result.newHostId,
    players: lobby ? lobby.players : [],
  });

  const msg = addChatMessage(result.lobbyCode, null, `${result.playerName} left the room`);
  if (msg) {
    io.to(result.lobbyCode).emit('chat_message', msg);
  }
}
