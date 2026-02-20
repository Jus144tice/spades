import {
  createLobby, joinLobby, leaveLobby, getLobby, getPlayerInfo,
  addChatMessage, assignTeam, autoAssignTeams, canStartGame,
  arrangeSeating, addBot, removeBot, updatePlayerSocket, updateGameSettings,
} from './lobby.js';
import { GameState } from './game/GameState.js';
import { botBid, botPlayCard, evaluateBlindNil } from './botAI.js';
import pool from './db/index.js';
import { mergeWithDefaults } from './game/preferences.js';
import { AFK_TURN_TIMEOUT, AFK_THRESHOLD } from './game/constants.js';
import {
  getAfkState, getPlayerAfk, getPlayerTimeout, resetPlayerAfk, incrementAfk,
  clearTurnTimer, clearRoundTimers, cleanupAfkState, remapPlayerAfk,
} from './afkManager.js';

// Delay range for bot actions (ms) — feels more natural
const BOT_DELAY_MIN = 800;
const BOT_DELAY_MAX = 2000;
const TRICK_DISPLAY_DELAY = 1800; // must be >= client's TRICK_DISPLAY_DELAY
const RECONNECT_GRACE_PERIOD = 60000;

// Track disconnect grace period timers
const disconnectTimers = new Map();

function botDelay() {
  return BOT_DELAY_MIN + Math.random() * (BOT_DELAY_MAX - BOT_DELAY_MIN);
}

function isSinglePlayerGame(lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return false;
  return lobby.game.players.filter(p => !p.isBot).length <= 1;
}

// --- Helpers to reduce boilerplate ---

function requireHost(socket, action, callback) {
  const info = getPlayerInfo(socket.id);
  if (!info) return;
  const lobby = getLobby(info.lobbyCode);
  if (!lobby || lobby.hostId !== socket.id) {
    socket.emit('error_msg', { message: `Only the host can ${action}` });
    return;
  }
  callback(info, lobby);
}

function broadcastGameState(io, lobby, eventName) {
  for (const player of lobby.game.players) {
    if (!player.isBot) {
      io.to(player.id).emit(eventName, lobby.game.getStateForPlayer(player.id));
    }
  }
  const spectators = lobby.players.filter(p => !p.team && !p.isBot);
  for (const spec of spectators) {
    io.to(spec.id).emit(eventName, { ...lobby.game.getStateForPlayer(spec.id), isSpectator: true });
  }
}

function buildBotGameState(game) {
  return {
    currentTrick: game.currentTrick,
    bids: game.bids,
    tricksTaken: game.tricksTaken,
    players: game.players,
    spadesBroken: game.spadesBroken,
    cardsPlayed: game.cardsPlayed,
  };
}

function getBidContext(game, playerId) {
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  const partnerIndex = (playerIndex + 2) % 4;
  const partnerId = game.players[partnerIndex].id;
  const opp1Index = (playerIndex + 1) % 4;
  const opp2Index = (playerIndex + 3) % 4;
  return {
    hand: game.hands[playerId],
    partnerBid: game.bids[partnerId],
    opponentBids: [game.bids[game.players[opp1Index].id], game.bids[game.players[opp2Index].id]],
  };
}

// --- Socket event handlers ---

export function registerHandlers(io, socket) {
  socket.on('create_lobby', ({ playerName }) => {
    const lobby = createLobby(socket.id, playerName, socket.userId);
    socket.join(lobby.code);
    socket.emit('lobby_created', {
      lobbyCode: lobby.code,
      playerId: socket.id,
      players: lobby.players,
      isHost: true,
      gameSettings: lobby.gameSettings,
    });
  });

  socket.on('join_lobby', ({ playerName, lobbyCode }) => {
    const result = joinLobby(socket.id, playerName, lobbyCode, socket.userId);
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
      gameSettings: result.lobby.gameSettings,
    });

    socket.to(result.lobby.code).emit('player_joined', {
      player: result.player,
      players: result.lobby.players,
    });

    const msg = addChatMessage(result.lobby.code, null, `${playerName} joined the room`);
    io.to(result.lobby.code).emit('chat_message', msg);
  });

  socket.on('add_bot', () => {
    requireHost(socket, 'add bots', (info, lobby) => {
      try {
        const result = addBot(info.lobbyCode);
        if (result.error) {
          socket.emit('error_msg', { message: result.error });
          return;
        }

        const joinData = { player: result.player, players: result.lobby.players };
        io.to(info.lobbyCode).emit('player_joined', joinData);

        const msg = addChatMessage(info.lobbyCode, null, `${result.player.name} (Bot) joined the room`);
        io.to(info.lobbyCode).emit('chat_message', msg);
      } catch (err) {
        console.error('add_bot error:', err);
        socket.emit('error_msg', { message: 'Failed to add bot' });
      }
    });
  });

  socket.on('remove_bot', ({ botId }) => {
    requireHost(socket, 'remove bots', (info) => {
      const result = removeBot(info.lobbyCode, botId);
      if (result.error) {
        socket.emit('error_msg', { message: result.error });
        return;
      }

      io.to(info.lobbyCode).emit('player_left', {
        playerId: botId,
        playerName: result.botName,
        players: result.players,
      });

      const msg = addChatMessage(info.lobbyCode, null, `${result.botName} (Bot) was removed`);
      io.to(info.lobbyCode).emit('chat_message', msg);
    });
  });

  socket.on('send_chat', ({ message }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    resetPlayerAfk(io, info.lobbyCode, socket.id);

    const msg = addChatMessage(info.lobbyCode, info.playerName, message);
    if (msg) io.to(info.lobbyCode).emit('chat_message', msg);
  });

  socket.on('assign_team', ({ targetPlayerId, team }) => {
    requireHost(socket, 'assign teams', (info) => {
      const result = assignTeam(info.lobbyCode, targetPlayerId, team);
      if (result.error) {
        socket.emit('error_msg', { message: result.error });
        return;
      }
      io.to(info.lobbyCode).emit('teams_updated', { players: result.players });
    });
  });

  socket.on('auto_assign_teams', () => {
    requireHost(socket, 'auto-assign teams', (info) => {
      const result = autoAssignTeams(info.lobbyCode);
      if (result.error) {
        socket.emit('error_msg', { message: result.error });
        return;
      }
      io.to(info.lobbyCode).emit('teams_updated', { players: result.players });
      const msg = addChatMessage(info.lobbyCode, null, 'Teams were randomly assigned!');
      io.to(info.lobbyCode).emit('chat_message', msg);
    });
  });

  socket.on('update_game_settings', (settings) => {
    requireHost(socket, 'change game settings', (info) => {
      const result = updateGameSettings(info.lobbyCode, settings);
      if (result.error) {
        socket.emit('error_msg', { message: result.error });
        return;
      }
      io.to(info.lobbyCode).emit('game_settings_updated', result.gameSettings);
    });
  });

  socket.on('start_game', async () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const check = canStartGame(info.lobbyCode, socket.id);
    if (check.error) {
      socket.emit('error_msg', { message: check.error });
      return;
    }

    const lobby = getLobby(info.lobbyCode);
    const teamPlayers = lobby.players.filter(p => p.team !== null);
    const seatedPlayers = arrangeSeating(teamPlayers);

    // Fetch preferences for all human players
    const playerPreferences = {};
    const humanPlayers = seatedPlayers.filter(p => !p.isBot && p.userId);
    if (humanPlayers.length > 0) {
      try {
        const userIds = humanPlayers.map(p => p.userId);
        const result = await pool.query(
          `SELECT id, preferences FROM users WHERE id = ANY($1)`,
          [userIds]
        );
        for (const row of result.rows) {
          const player = humanPlayers.find(p => p.userId === row.id);
          if (player) {
            playerPreferences[player.id] = mergeWithDefaults(row.preferences || {});
          }
        }
      } catch (err) {
        console.error('Failed to fetch player preferences:', err);
      }
    }

    lobby.game = new GameState(seatedPlayers, playerPreferences, lobby.gameSettings);

    const msg = addChatMessage(info.lobbyCode, null, 'The game has started!');
    io.to(info.lobbyCode).emit('chat_message', msg);

    broadcastGameState(io, lobby, 'game_started');
    scheduleBotTurn(io, info.lobbyCode);
  });

  socket.on('place_bid', ({ bid, blindNil }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || !lobby.game) return;

    clearTurnTimer(info.lobbyCode);
    resetPlayerAfk(io, info.lobbyCode, socket.id);

    const result = lobby.game.placeBid(socket.id, bid, { blindNil: !!blindNil });
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    io.to(info.lobbyCode).emit('bid_placed', {
      playerId: socket.id, bid, blindNil: !!blindNil,
      allBidsIn: result.allBidsIn, nextTurnId: result.nextTurnId,
    });

    if (result.allBidsIn) {
      const msg = addChatMessage(info.lobbyCode, null, 'All bids are in! Let\'s play!');
      io.to(info.lobbyCode).emit('chat_message', msg);
    }

    scheduleBotTurn(io, info.lobbyCode);
  });

  socket.on('play_card', ({ card }) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || !lobby.game) return;

    clearTurnTimer(info.lobbyCode);
    resetPlayerAfk(io, info.lobbyCode, socket.id);

    processCardPlay(io, info.lobbyCode, socket.id, card);
  });

  socket.on('ready_for_next_round', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || !lobby.game || !lobby.readyForNextRound) return;

    // Clear this player's round summary timer
    const afk = getAfkState(info.lobbyCode);
    if (afk.roundTimers.has(socket.id)) {
      clearTimeout(afk.roundTimers.get(socket.id));
      afk.roundTimers.delete(socket.id);
    }
    resetPlayerAfk(io, info.lobbyCode, socket.id);

    lobby.readyForNextRound.add(socket.id);
    checkAllReady(io, info.lobbyCode, lobby);
  });

  socket.on('return_to_lobby', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby) return;

    cleanupAfkState(info.lobbyCode);
    returnToLobby(io, info.lobbyCode, lobby);
  });

  // --- Rejoin after reconnection ---
  socket.on('rejoin', ({ lobbyCode }) => {
    const userId = socket.userId;
    if (!userId || !lobbyCode) { socket.emit('rejoin_failed'); return; }

    const lobby = getLobby(lobbyCode);
    if (!lobby) { socket.emit('rejoin_failed'); return; }

    const player = lobby.players.find(p => p.userId === userId);
    if (!player) { socket.emit('rejoin_failed'); return; }

    const oldSocketId = player.id;

    // Cancel grace period timer
    const timerInfo = disconnectTimers.get(oldSocketId);
    if (timerInfo) {
      clearTimeout(timerInfo.timer);
      disconnectTimers.delete(oldSocketId);
    }

    updatePlayerSocket(oldSocketId, socket.id, lobbyCode);
    remapPlayerAfk(lobbyCode, oldSocketId, socket.id);

    socket.join(lobbyCode);
    console.log(`Player ${player.name} rejoined (${oldSocketId} -> ${socket.id})`);

    const msg = addChatMessage(lobbyCode, null, `${player.name} reconnected`);
    io.to(lobbyCode).emit('chat_message', msg);
    io.to(lobbyCode).emit('player_reconnected', { playerId: socket.id });

    // Send current state
    if (lobby.game) {
      const isGamePlayer = lobby.game.players.some(p => p.id === socket.id);
      const gameState = lobby.game.getStateForPlayer(socket.id);
      const roundSummary = lobby.game.phase === 'scoring'
        ? lobby.game.roundHistory[lobby.game.roundHistory.length - 1] : null;

      let gameOverData = null;
      if (lobby.game.phase === 'gameOver') {
        const winTarget = lobby.game.settings?.winTarget || 500;
        const winner = lobby.game.scores.team1 >= winTarget ? 'team1' : 'team2';
        gameOverData = {
          winningTeam: winner,
          winningPlayers: lobby.game.players
            .filter(p => p.team === (winner === 'team1' ? 1 : 2)).map(p => p.name),
          finalScores: lobby.game.scores,
          roundHistory: lobby.game.roundHistory,
        };
      }

      socket.emit('rejoin_success', {
        screen: 'game', lobbyCode, playerId: socket.id,
        players: lobby.players, isHost: lobby.hostId === socket.id,
        chatLog: lobby.chatLog, roundSummary, gameOverData,
        isSpectator: !isGamePlayer, gameSettings: lobby.gameSettings,
        ...gameState,
      });
    } else {
      socket.emit('rejoin_success', {
        screen: 'lobby', lobbyCode, playerId: socket.id,
        players: lobby.players, isHost: lobby.hostId === socket.id,
        chatLog: lobby.chatLog, gameSettings: lobby.gameSettings,
      });
    }
  });

  socket.on('leave_lobby', () => {
    cancelDisconnectTimer(socket.id);
    permanentlyDisconnect(io, socket.id);
  });

  socket.on('disconnect', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    if (socket.userId) {
      console.log(`${info.playerName} disconnected, ${RECONNECT_GRACE_PERIOD / 1000}s grace period started`);

      const timer = setTimeout(() => {
        disconnectTimers.delete(socket.id);
        permanentlyDisconnect(io, socket.id);
      }, RECONNECT_GRACE_PERIOD);

      disconnectTimers.set(socket.id, {
        timer, lobbyCode: info.lobbyCode,
        userId: socket.userId, playerName: info.playerName,
      });

      const msg = addChatMessage(info.lobbyCode, null, `${info.playerName} lost connection...`);
      io.to(info.lobbyCode).emit('chat_message', msg);
      io.to(info.lobbyCode).emit('player_disconnected', { playerId: socket.id });
      return;
    }

    permanentlyDisconnect(io, socket.id);
  });
}

// --- Game flow helpers ---

function returnToLobby(io, lobbyCode, lobby) {
  lobby.game = null;
  for (const p of lobby.players) p.team = null;
  io.to(lobbyCode).emit('returned_to_lobby', { players: lobby.players });
}

function checkAllReady(io, lobbyCode, lobby) {
  const humanPlayers = lobby.game.players.filter(p => !p.isBot);
  if (!humanPlayers.every(p => lobby.readyForNextRound.has(p.id))) return;

  clearRoundTimers(lobbyCode);
  lobby.readyForNextRound = null;
  lobby.game.startNewRound();

  broadcastGameState(io, lobby, 'new_round');

  const msg = addChatMessage(lobbyCode, null, `Round ${lobby.game.roundNumber} - Deal 'em up!`);
  io.to(lobbyCode).emit('chat_message', msg);

  scheduleBotTurn(io, lobbyCode);
}

// --- Process a card play (works for both humans and bots) ---

function processCardPlay(io, lobbyCode, playerId, card) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;

  const result = lobby.game.playCard(playerId, card);
  if (result.error) {
    io.to(playerId).emit?.('error_msg', { message: result.error });
    return;
  }

  io.to(lobbyCode).emit('card_played', {
    playerId, card, nextTurnId: result.nextTurnId,
  });

  if (result.trickComplete) {
    io.to(lobbyCode).emit('trick_won', {
      winnerId: result.winnerId,
      trick: result.trick,
      tricksTaken: lobby.game.tricksTaken,
    });

    if (result.roundOver) {
      handleRoundOver(io, lobbyCode, lobby, result);
      return;
    }

    // Wait for display delay before next bot turn
    setTimeout(() => scheduleBotTurn(io, lobbyCode), TRICK_DISPLAY_DELAY);
    return;
  }

  scheduleBotTurn(io, lobbyCode);
}

function handleRoundOver(io, lobbyCode, lobby, result) {
  const { roundSummary, gameOver, winningTeam } = result;
  const scores = { ...lobby.game.scores };
  const books = { ...lobby.game.books };
  const roundHistory = [...lobby.game.roundHistory];
  const gamePlayers = lobby.game.players;

  setTimeout(() => {
    io.to(lobbyCode).emit('round_scored', { roundSummary, scores, books });

    if (gameOver) {
      const winTeamPlayers = gamePlayers
        .filter(p => p.team === (winningTeam === 'team1' ? 1 : 2))
        .map(p => p.name);

      io.to(lobbyCode).emit('game_over', {
        winningTeam, winningPlayers: winTeamPlayers,
        finalScores: scores, roundHistory,
      });

      const msg = addChatMessage(lobbyCode, null, `Game over! ${winTeamPlayers.join(' & ')} win!`);
      io.to(lobbyCode).emit('chat_message', msg);

      if (!isSinglePlayerGame(lobbyCode)) {
        saveGameResults(lobby.game, winningTeam).catch(err => {
          console.error('Failed to save game results:', err);
        });
      }

      clearTurnTimer(lobbyCode);
      startGameOverTimer(io, lobbyCode);
    } else {
      lobby.readyForNextRound = new Set();
      startRoundSummaryTimers(io, lobbyCode);
    }
  }, TRICK_DISPLAY_DELAY);
}

// --- AFK turn timer ---

function startHumanTurnTimer(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;
  if (lobby.game.phase === 'gameOver' || lobby.game.phase === 'scoring') return;

  const currentPlayerId = lobby.game.getCurrentTurnPlayerId();
  const currentPlayer = lobby.game.players.find(p => p.id === currentPlayerId);
  if (!currentPlayer || currentPlayer.isBot) return;
  if (isSinglePlayerGame(lobbyCode)) return;

  clearTurnTimer(lobbyCode);

  const timeout = getPlayerTimeout(lobbyCode, currentPlayerId);
  const afk = getAfkState(lobbyCode);

  io.to(lobbyCode).emit('turn_timer', { playerId: currentPlayerId, endsAt: Date.now() + timeout });

  afk.turnTimer = setTimeout(() => {
    afk.turnTimer = null;
    executeAfkTurn(io, lobbyCode, currentPlayerId);
  }, timeout);
}

function executeAfkTurn(io, lobbyCode, playerId) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;
  if (lobby.game.getCurrentTurnPlayerId() !== playerId) return;

  const game = lobby.game;
  const player = game.players.find(p => p.id === playerId);
  if (!player) return;

  const pAfk = incrementAfk(io, lobbyCode, playerId);
  if (pAfk.consecutive === 1) {
    const msg = addChatMessage(lobbyCode, null, `${player.name}'s turn was auto-played`);
    io.to(lobbyCode).emit('chat_message', msg);
  }

  if (game.phase === 'bidding') {
    const ctx = getBidContext(game, playerId);
    const bid = botBid(ctx.hand, ctx.partnerBid, ctx.opponentBids, game);

    const result = game.placeBid(playerId, bid, { blindNil: false });
    if (result.error) return;

    io.to(lobbyCode).emit('bid_placed', {
      playerId, bid, blindNil: false,
      allBidsIn: result.allBidsIn, nextTurnId: result.nextTurnId,
    });

    if (result.allBidsIn) {
      const msg = addChatMessage(lobbyCode, null, 'All bids are in! Let\'s play!');
      io.to(lobbyCode).emit('chat_message', msg);
    }

    scheduleBotTurn(io, lobbyCode);
  } else if (game.phase === 'playing') {
    const card = botPlayCard(game.hands[playerId], buildBotGameState(game), playerId);
    if (!card) return;
    processCardPlay(io, lobbyCode, playerId, card);
  }
}

function startRoundSummaryTimers(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game || !lobby.readyForNextRound) return;
  if (isSinglePlayerGame(lobbyCode)) return;

  const humanPlayers = lobby.game.players.filter(p => !p.isBot);

  for (const player of humanPlayers) {
    const timeout = getPlayerTimeout(lobbyCode, player.id);
    const afk = getAfkState(lobbyCode);

    const timer = setTimeout(() => {
      afk.roundTimers.delete(player.id);
      if (!lobby.readyForNextRound) return;

      lobby.readyForNextRound.add(player.id);
      incrementAfk(io, lobbyCode, player.id);
      checkAllReady(io, lobbyCode, lobby);
    }, timeout);

    afk.roundTimers.set(player.id, timer);
  }
}

function startGameOverTimer(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby) return;
  if (isSinglePlayerGame(lobbyCode)) return;

  const afk = getAfkState(lobbyCode);
  afk.gameOverTimer = setTimeout(() => {
    afk.gameOverTimer = null;
    const currentLobby = getLobby(lobbyCode);
    if (!currentLobby || !currentLobby.game) return;

    returnToLobby(io, lobbyCode, currentLobby);
    cleanupAfkState(lobbyCode);
  }, AFK_TURN_TIMEOUT);
}

// --- Bot turn scheduling ---

function scheduleBotTurn(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;
  if (lobby.game.phase === 'gameOver' || lobby.game.phase === 'scoring') return;

  const currentPlayerId = lobby.game.getCurrentTurnPlayerId();
  const currentPlayer = lobby.game.players.find(p => p.id === currentPlayerId);

  if (!currentPlayer || !currentPlayer.isBot) {
    startHumanTurnTimer(io, lobbyCode);
    return;
  }

  setTimeout(() => executeBotTurn(io, lobbyCode, currentPlayerId), botDelay());
}

function executeBotTurn(io, lobbyCode, botId) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;
  if (lobby.game.getCurrentTurnPlayerId() !== botId) return;

  const game = lobby.game;

  if (game.phase === 'bidding') {
    const ctx = getBidContext(game, botId);
    const goBlindNil = evaluateBlindNil(game, botId);

    let bid, isBlindNil = false;
    if (goBlindNil) { bid = 0; isBlindNil = true; }
    else { bid = botBid(ctx.hand, ctx.partnerBid, ctx.opponentBids, game); }

    const result = game.placeBid(botId, bid, { blindNil: isBlindNil });
    if (result.error) return;

    io.to(lobbyCode).emit('bid_placed', {
      playerId: botId, bid, blindNil: isBlindNil,
      allBidsIn: result.allBidsIn, nextTurnId: result.nextTurnId,
    });

    if (result.allBidsIn) {
      const msg = addChatMessage(lobbyCode, null, 'All bids are in! Let\'s play!');
      io.to(lobbyCode).emit('chat_message', msg);
    }

    scheduleBotTurn(io, lobbyCode);
  } else if (game.phase === 'playing') {
    const card = botPlayCard(game.hands[botId], buildBotGameState(game), botId);
    if (!card) return;
    processCardPlay(io, lobbyCode, botId, card);
  }
}

// --- Disconnect handling ---

function cancelDisconnectTimer(socketId) {
  const timerInfo = disconnectTimers.get(socketId);
  if (timerInfo) {
    clearTimeout(timerInfo.timer);
    disconnectTimers.delete(socketId);
  }
}

function permanentlyDisconnect(io, socketId) {
  let wasGamePlayer = false;
  const preCheckInfo = getPlayerInfo(socketId);
  if (preCheckInfo) {
    const preCheckLobby = getLobby(preCheckInfo.lobbyCode);
    if (preCheckLobby && preCheckLobby.game) {
      wasGamePlayer = preCheckLobby.game.players.some(p => p.id === socketId);
    }
  }

  const result = leaveLobby(socketId);
  if (!result || result.disbanded) return;

  const lobby = getLobby(result.lobbyCode);

  if (lobby && lobby.game && wasGamePlayer && lobby.game.phase !== 'gameOver') {
    cleanupAfkState(result.lobbyCode);
    returnToLobby(io, result.lobbyCode, lobby);

    const msg = addChatMessage(result.lobbyCode, null, `${result.playerName} left. Game has been cancelled.`);
    io.to(result.lobbyCode).emit('chat_message', msg);
  }

  io.to(result.lobbyCode).emit('player_left', {
    playerId: socketId, playerName: result.playerName,
    newHostId: result.newHostId, players: lobby ? lobby.players : [],
  });

  const msg = addChatMessage(result.lobbyCode, null, `${result.playerName} left the room`);
  if (msg) io.to(result.lobbyCode).emit('chat_message', msg);
}

// --- Save game results to PostgreSQL ---

async function saveGameResults(game, winningTeam) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const winTeamNum = winningTeam === 'team1' ? 1 : 2;

    const gameRes = await client.query(
      `INSERT INTO games (ended_at, winning_team) VALUES (NOW(), $1) RETURNING id`,
      [winTeamNum]
    );
    const gameId = gameRes.rows[0].id;

    for (const player of game.players) {
      await client.query(
        `INSERT INTO game_players (game_id, user_id, team, seat_index, bot_name, is_winner)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [gameId, player.isBot ? null : (player.userId || null), player.team,
         player.seatIndex, player.isBot ? player.name : null, player.team === winTeamNum]
      );
    }

    for (const round of game.roundHistory) {
      await client.query(
        `INSERT INTO game_rounds (game_id, round_number, team1_round_score, team2_round_score, team1_total, team2_total, team1_bags, team2_bags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [gameId, round.roundNumber, round.team1Score, round.team2Score,
         round.team1Total, round.team2Total, round.team1Books || 0, round.team2Books || 0]
      );

      for (const player of game.players) {
        const bid = round.bids[player.id];
        if (bid !== undefined) {
          await client.query(
            `INSERT INTO round_bids (game_id, round_number, user_id, bot_name, bid, tricks_taken)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [gameId, round.roundNumber, player.isBot ? null : (player.userId || null),
             player.isBot ? player.name : null, bid, round.tricksTaken[player.id] ?? 0]
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log(`Game ${gameId} saved to database`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
