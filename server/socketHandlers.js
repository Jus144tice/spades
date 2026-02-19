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
  findPlayerByUserId,
  updatePlayerSocket,
  updateGameSettings,
} from './lobby.js';
import { GameState } from './game/GameState.js';
import { botBid, botPlayCard } from './botAI.js';
import pool from './db/index.js';
import { mergeWithDefaults } from './game/preferences.js';
import { AFK_TURN_TIMEOUT, AFK_FAST_TIMEOUT, AFK_THRESHOLD } from './game/constants.js';

// Delay range for bot actions (ms) - feels more natural
const BOT_DELAY_MIN = 800;
const BOT_DELAY_MAX = 2000;
const TRICK_DISPLAY_DELAY = 1800; // must be >= client's TRICK_DISPLAY_DELAY
const RECONNECT_GRACE_PERIOD = 60000; // 60s before permanently removing a disconnected player

// Track disconnect grace period timers: oldSocketId -> { timer, lobbyCode, userId, playerName }
const disconnectTimers = new Map();

// --- AFK timer state ---
// Per-lobby AFK tracking: lobbyCode -> { turnTimer, roundTimers, gameOverTimer, players }
const lobbyAfkState = new Map();

function getAfkState(lobbyCode) {
  if (!lobbyAfkState.has(lobbyCode)) {
    lobbyAfkState.set(lobbyCode, {
      turnTimer: null,
      roundTimers: new Map(),
      gameOverTimer: null,
      players: new Map(), // playerId -> { consecutive: 0, isAfk: false }
    });
  }
  return lobbyAfkState.get(lobbyCode);
}

function getPlayerAfk(lobbyCode, playerId) {
  const afk = getAfkState(lobbyCode);
  if (!afk.players.has(playerId)) {
    afk.players.set(playerId, { consecutive: 0, isAfk: false });
  }
  return afk.players.get(playerId);
}

function getPlayerTimeout(lobbyCode, playerId) {
  const pAfk = getPlayerAfk(lobbyCode, playerId);
  return pAfk.isAfk ? AFK_FAST_TIMEOUT : AFK_TURN_TIMEOUT;
}

function resetPlayerAfk(io, lobbyCode, playerId) {
  const afk = getAfkState(lobbyCode);
  const pAfk = afk.players.get(playerId);
  if (!pAfk) return;
  const wasAfk = pAfk.isAfk;
  pAfk.consecutive = 0;
  pAfk.isAfk = false;
  if (wasAfk) {
    io.to(lobbyCode).emit('player_afk_changed', { playerId, isAfk: false });
  }
}

function clearTurnTimer(lobbyCode) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;
  if (afk.turnTimer) {
    clearTimeout(afk.turnTimer);
    afk.turnTimer = null;
  }
}

function clearRoundTimers(lobbyCode) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;
  for (const timer of afk.roundTimers.values()) {
    clearTimeout(timer);
  }
  afk.roundTimers.clear();
}

function clearGameOverTimer(lobbyCode) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;
  if (afk.gameOverTimer) {
    clearTimeout(afk.gameOverTimer);
    afk.gameOverTimer = null;
  }
}

function cleanupAfkState(lobbyCode) {
  clearTurnTimer(lobbyCode);
  clearRoundTimers(lobbyCode);
  clearGameOverTimer(lobbyCode);
  lobbyAfkState.delete(lobbyCode);
}

function botDelay() {
  return BOT_DELAY_MIN + Math.random() * (BOT_DELAY_MAX - BOT_DELAY_MIN);
}

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

    // Chat counts as activity — reset AFK status
    resetPlayerAfk(io, info.lobbyCode, socket.id);

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

  socket.on('update_game_settings', (settings) => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || lobby.hostId !== socket.id) {
      socket.emit('error_msg', { message: 'Only the host can change game settings' });
      return;
    }

    const result = updateGameSettings(info.lobbyCode, settings);
    if (result.error) {
      socket.emit('error_msg', { message: result.error });
      return;
    }

    io.to(info.lobbyCode).emit('game_settings_updated', result.gameSettings);
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

    // Send each human player their hand
    for (const player of seatedPlayers) {
      if (!player.isBot) {
        const state = lobby.game.getStateForPlayer(player.id);
        io.to(player.id).emit('game_started', state);
      }
    }

    // Send spectators the game state (no hand)
    const spectators = lobby.players.filter(p => !p.team && !p.isBot);
    for (const spec of spectators) {
      const state = lobby.game.getStateForPlayer(spec.id);
      io.to(spec.id).emit('game_started', { ...state, isSpectator: true });
    }

    // Trigger bot turns if a bot needs to bid first
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
      playerId: socket.id,
      bid,
      blindNil: !!blindNil,
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

    clearTurnTimer(info.lobbyCode);
    resetPlayerAfk(io, info.lobbyCode, socket.id);

    processCardPlay(io, info.lobbyCode, socket.id, card);
  });

  socket.on('ready_for_next_round', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby || !lobby.game || !lobby.readyForNextRound) return;

    // Clear this player's round summary timer and reset AFK
    const afk = lobbyAfkState.get(info.lobbyCode);
    if (afk && afk.roundTimers.has(socket.id)) {
      clearTimeout(afk.roundTimers.get(socket.id));
      afk.roundTimers.delete(socket.id);
    }
    resetPlayerAfk(io, info.lobbyCode, socket.id);

    lobby.readyForNextRound.add(socket.id);

    // Check if all human players are ready
    const humanPlayers = lobby.game.players.filter(p => !p.isBot);
    const allReady = humanPlayers.every(p => lobby.readyForNextRound.has(p.id));

    if (allReady) {
      lobby.readyForNextRound = null;
      lobby.game.startNewRound();

      for (const player of lobby.game.players) {
        if (!player.isBot) {
          const state = lobby.game.getStateForPlayer(player.id);
          io.to(player.id).emit('new_round', state);
        }
      }

      // Send spectators the new round state
      const spectators = lobby.players.filter(p => !p.team && !p.isBot);
      for (const spec of spectators) {
        const state = lobby.game.getStateForPlayer(spec.id);
        io.to(spec.id).emit('new_round', state);
      }

      const msg = addChatMessage(info.lobbyCode, null, `Round ${lobby.game.roundNumber} - Deal 'em up!`);
      io.to(info.lobbyCode).emit('chat_message', msg);

      scheduleBotTurn(io, info.lobbyCode);
    }
  });

  socket.on('return_to_lobby', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    const lobby = getLobby(info.lobbyCode);
    if (!lobby) return;

    cleanupAfkState(info.lobbyCode);

    lobby.game = null;
    for (const p of lobby.players) {
      p.team = null;
    }

    io.to(info.lobbyCode).emit('returned_to_lobby', {
      players: lobby.players,
    });
  });

  // --- Rejoin after reconnection ---
  socket.on('rejoin', ({ lobbyCode }) => {
    const userId = socket.userId;
    if (!userId || !lobbyCode) {
      socket.emit('rejoin_failed');
      return;
    }

    const lobby = getLobby(lobbyCode);
    if (!lobby) {
      socket.emit('rejoin_failed');
      return;
    }

    // Find the player in this lobby by userId
    const player = lobby.players.find(p => p.userId === userId);
    if (!player) {
      socket.emit('rejoin_failed');
      return;
    }

    const oldSocketId = player.id;

    // Cancel the grace period timer if one is running
    const timerInfo = disconnectTimers.get(oldSocketId);
    if (timerInfo) {
      clearTimeout(timerInfo.timer);
      disconnectTimers.delete(oldSocketId);
    }

    // Remap all socket IDs (lobby, game state, hands, bids, etc.)
    updatePlayerSocket(oldSocketId, socket.id, lobbyCode);

    // Remap AFK state for this player's new socket ID
    const afk = lobbyAfkState.get(lobbyCode);
    if (afk && afk.players.has(oldSocketId)) {
      const pAfk = afk.players.get(oldSocketId);
      afk.players.delete(oldSocketId);
      afk.players.set(socket.id, pAfk);
      // Remap round timer if one exists
      if (afk.roundTimers.has(oldSocketId)) {
        const timer = afk.roundTimers.get(oldSocketId);
        afk.roundTimers.delete(oldSocketId);
        afk.roundTimers.set(socket.id, timer);
      }
    }

    // Join the socket room
    socket.join(lobbyCode);

    console.log(`Player ${player.name} rejoined (${oldSocketId} -> ${socket.id})`);

    const msg = addChatMessage(lobbyCode, null, `${player.name} reconnected`);
    io.to(lobbyCode).emit('chat_message', msg);
    io.to(lobbyCode).emit('player_reconnected', { playerId: socket.id });

    // Send current state back to the rejoining player
    if (lobby.game) {
      const isGamePlayer = lobby.game.players.some(p => p.id === socket.id);
      const gameState = lobby.game.getStateForPlayer(socket.id);
      // Include round summary if we're in scoring phase
      const roundSummary = lobby.game.phase === 'scoring'
        ? lobby.game.roundHistory[lobby.game.roundHistory.length - 1]
        : null;
      // Include game over data if applicable
      let gameOverData = null;
      if (lobby.game.phase === 'gameOver') {
        const winTarget = lobby.game.settings?.winTarget || 500;
        const winner = lobby.game.scores.team1 >= winTarget ? 'team1' : 'team2';
        const winTeamPlayers = lobby.game.players
          .filter(p => p.team === (winner === 'team1' ? 1 : 2))
          .map(p => p.name);
        gameOverData = {
          winningTeam: winner,
          winningPlayers: winTeamPlayers,
          finalScores: lobby.game.scores,
          roundHistory: lobby.game.roundHistory,
        };
      }

      socket.emit('rejoin_success', {
        screen: 'game',
        lobbyCode,
        playerId: socket.id,
        players: lobby.players,
        isHost: lobby.hostId === socket.id,
        chatLog: lobby.chatLog,
        roundSummary,
        gameOverData,
        isSpectator: !isGamePlayer,
        gameSettings: lobby.gameSettings,
        ...gameState,
      });
    } else {
      socket.emit('rejoin_success', {
        screen: 'lobby',
        lobbyCode,
        playerId: socket.id,
        players: lobby.players,
        isHost: lobby.hostId === socket.id,
        chatLog: lobby.chatLog,
        gameSettings: lobby.gameSettings,
      });
    }
  });

  // Explicit leave — always immediate, no grace period
  socket.on('leave_lobby', () => {
    cancelDisconnectTimer(socket.id);
    permanentlyDisconnect(io, socket.id);
  });

  // Connection lost — start grace period for authenticated users
  socket.on('disconnect', () => {
    const info = getPlayerInfo(socket.id);
    if (!info) return;

    // Authenticated users get a grace period to reconnect
    if (socket.userId) {
      console.log(`${info.playerName} disconnected, ${RECONNECT_GRACE_PERIOD / 1000}s grace period started`);

      const timer = setTimeout(() => {
        disconnectTimers.delete(socket.id);
        permanentlyDisconnect(io, socket.id);
      }, RECONNECT_GRACE_PERIOD);

      disconnectTimers.set(socket.id, {
        timer,
        lobbyCode: info.lobbyCode,
        userId: socket.userId,
        playerName: info.playerName,
      });

      // Notify others
      const msg = addChatMessage(info.lobbyCode, null, `${info.playerName} lost connection...`);
      io.to(info.lobbyCode).emit('chat_message', msg);
      io.to(info.lobbyCode).emit('player_disconnected', { playerId: socket.id });
      return;
    }

    // Guests/unauthenticated — disconnect immediately
    permanentlyDisconnect(io, socket.id);
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
      // Delay round results so players can see the last trick before the modal appears
      const roundSummary = result.roundSummary;
      const gameOver = result.gameOver;
      const winningTeam = result.winningTeam;
      const scores = { ...lobby.game.scores };
      const books = { ...lobby.game.books };
      const roundHistory = [...lobby.game.roundHistory];
      const gamePlayers = lobby.game.players;

      setTimeout(() => {
        io.to(lobbyCode).emit('round_scored', {
          roundSummary,
          scores,
          books,
        });

        if (gameOver) {
          const winTeamPlayers = gamePlayers
            .filter(p => p.team === (winningTeam === 'team1' ? 1 : 2))
            .map(p => p.name);

          io.to(lobbyCode).emit('game_over', {
            winningTeam,
            winningPlayers: winTeamPlayers,
            finalScores: scores,
            roundHistory,
          });

          const msg = addChatMessage(lobbyCode, null, `Game over! ${winTeamPlayers.join(' & ')} win!`);
          io.to(lobbyCode).emit('chat_message', msg);

          // Save game results to database (fire-and-forget)
          saveGameResults(lobby.game, winningTeam).catch(err => {
            console.error('Failed to save game results:', err);
          });

          // Clear any lingering turn timer, then start game over timer
          clearTurnTimer(lobbyCode);
          startGameOverTimer(io, lobbyCode);
        } else {
          // Wait for human players to dismiss the round summary before starting next round
          lobby.readyForNextRound = new Set();
          // Start AFK timers for round summary dismissal
          startRoundSummaryTimers(io, lobbyCode);
        }
      }, TRICK_DISPLAY_DELAY);

      return; // No bot turns needed — round is over
    }

    // After a completed trick, wait for the display delay before next bot turn
    // so the client can show all 4 cards before clearing
    setTimeout(() => {
      scheduleBotTurn(io, lobbyCode);
    }, TRICK_DISPLAY_DELAY);
    return;
  }

  // No trick completed — schedule next bot turn immediately
  scheduleBotTurn(io, lobbyCode);
}

// --- AFK turn timer ---

function startHumanTurnTimer(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;
  if (lobby.game.phase === 'gameOver' || lobby.game.phase === 'scoring') return;

  const currentPlayerId = lobby.game.getCurrentTurnPlayerId();
  const currentPlayer = lobby.game.players.find(p => p.id === currentPlayerId);
  if (!currentPlayer || currentPlayer.isBot) return;

  clearTurnTimer(lobbyCode);

  const timeout = getPlayerTimeout(lobbyCode, currentPlayerId);
  const endsAt = Date.now() + timeout;
  const afk = getAfkState(lobbyCode);

  io.to(lobbyCode).emit('turn_timer', { playerId: currentPlayerId, endsAt });

  afk.turnTimer = setTimeout(() => {
    afk.turnTimer = null;
    executeAfkTurn(io, lobbyCode, currentPlayerId);
  }, timeout);
}

function executeAfkTurn(io, lobbyCode, playerId) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game) return;

  // Verify it's still this player's turn
  const currentPlayerId = lobby.game.getCurrentTurnPlayerId();
  if (currentPlayerId !== playerId) return;

  const game = lobby.game;
  const player = game.players.find(p => p.id === playerId);
  if (!player) return;

  // Increment AFK counter
  const pAfk = getPlayerAfk(lobbyCode, playerId);
  pAfk.consecutive++;
  const firstTimeout = pAfk.consecutive === 1;

  if (pAfk.consecutive >= AFK_THRESHOLD && !pAfk.isAfk) {
    pAfk.isAfk = true;
    io.to(lobbyCode).emit('player_afk_changed', { playerId, isAfk: true });
  }

  if (firstTimeout) {
    const msg = addChatMessage(lobbyCode, null, `${player.name}'s turn was auto-played`);
    io.to(lobbyCode).emit('chat_message', msg);
  }

  if (game.phase === 'bidding') {
    // Use bot AI to pick a bid
    const hand = game.hands[playerId];
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    const partnerIndex = (playerIndex + 2) % 4;
    const partnerId = game.players[partnerIndex].id;
    const partnerBid = game.bids[partnerId];

    const opp1Index = (playerIndex + 1) % 4;
    const opp2Index = (playerIndex + 3) % 4;
    const opponentBids = [game.bids[game.players[opp1Index].id], game.bids[game.players[opp2Index].id]];

    let bid = botBid(hand, partnerBid, opponentBids, game);

    // Respect double nil restriction
    if (bid === 0 && !game.settings.doubleNil && partnerBid === 0) {
      bid = 1;
    }

    const result = game.placeBid(playerId, bid, { blindNil: false });
    if (result.error) return;

    io.to(lobbyCode).emit('bid_placed', {
      playerId,
      bid,
      blindNil: false,
      allBidsIn: result.allBidsIn,
      nextTurnId: result.nextTurnId,
    });

    if (result.allBidsIn) {
      const msg2 = addChatMessage(lobbyCode, null, 'All bids are in! Let\'s play!');
      io.to(lobbyCode).emit('chat_message', msg2);
    }

    scheduleBotTurn(io, lobbyCode);

  } else if (game.phase === 'playing') {
    const hand = game.hands[playerId];
    const gameStateForBot = {
      currentTrick: game.currentTrick,
      bids: game.bids,
      tricksTaken: game.tricksTaken,
      players: game.players,
      spadesBroken: game.spadesBroken,
      cardsPlayed: game.cardsPlayed,
    };

    const card = botPlayCard(hand, gameStateForBot, playerId);
    if (!card) return;

    processCardPlay(io, lobbyCode, playerId, card);
  }
}

function startRoundSummaryTimers(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby || !lobby.game || !lobby.readyForNextRound) return;

  const humanPlayers = lobby.game.players.filter(p => !p.isBot);

  for (const player of humanPlayers) {
    const timeout = getPlayerTimeout(lobbyCode, player.id);
    const afk = getAfkState(lobbyCode);

    const timer = setTimeout(() => {
      afk.roundTimers.delete(player.id);
      if (!lobby.readyForNextRound) return;

      // Auto-ready this player
      lobby.readyForNextRound.add(player.id);

      // Increment AFK counter
      const pAfk = getPlayerAfk(lobbyCode, player.id);
      pAfk.consecutive++;
      if (pAfk.consecutive >= AFK_THRESHOLD && !pAfk.isAfk) {
        pAfk.isAfk = true;
        io.to(lobbyCode).emit('player_afk_changed', { playerId: player.id, isAfk: true });
      }

      // Check if all human players are now ready
      const allReady = humanPlayers.every(p => lobby.readyForNextRound.has(p.id));
      if (allReady) {
        clearRoundTimers(lobbyCode);
        lobby.readyForNextRound = null;
        lobby.game.startNewRound();

        for (const p of lobby.game.players) {
          if (!p.isBot) {
            const state = lobby.game.getStateForPlayer(p.id);
            io.to(p.id).emit('new_round', state);
          }
        }

        // Send spectators the new round state
        const spectators = lobby.players.filter(p => !p.team && !p.isBot);
        for (const spec of spectators) {
          const state = lobby.game.getStateForPlayer(spec.id);
          io.to(spec.id).emit('new_round', state);
        }

        const msg = addChatMessage(lobbyCode, null, `Round ${lobby.game.roundNumber} - Deal 'em up!`);
        io.to(lobbyCode).emit('chat_message', msg);

        scheduleBotTurn(io, lobbyCode);
      }
    }, timeout);

    afk.roundTimers.set(player.id, timer);
  }
}

function startGameOverTimer(io, lobbyCode) {
  const lobby = getLobby(lobbyCode);
  if (!lobby) return;

  const afk = getAfkState(lobbyCode);

  // Use 60s default for game over return
  afk.gameOverTimer = setTimeout(() => {
    afk.gameOverTimer = null;
    const currentLobby = getLobby(lobbyCode);
    if (!currentLobby || !currentLobby.game) return;

    currentLobby.game = null;
    for (const p of currentLobby.players) {
      p.team = null;
    }

    io.to(lobbyCode).emit('returned_to_lobby', {
      players: currentLobby.players,
    });

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
    // Human player's turn — start AFK timer
    startHumanTurnTimer(io, lobbyCode);
    return;
  }

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

    let bid = botBid(hand, partnerBid, opponentBids, game);

    // Bots respect double nil restriction
    if (bid === 0 && !game.settings.doubleNil && partnerBid === 0) {
      bid = 1;
    }

    const result = game.placeBid(botId, bid, { blindNil: false });
    if (result.error) return; // shouldn't happen

    io.to(lobbyCode).emit('bid_placed', {
      playerId: botId,
      bid,
      blindNil: false,
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
      cardsPlayed: game.cardsPlayed,
    };

    const card = botPlayCard(hand, gameStateForBot, botId);
    if (!card) return;

    processCardPlay(io, lobbyCode, botId, card);
  }
}

function cancelDisconnectTimer(socketId) {
  const timerInfo = disconnectTimers.get(socketId);
  if (timerInfo) {
    clearTimeout(timerInfo.timer);
    disconnectTimers.delete(socketId);
  }
}

function permanentlyDisconnect(io, socketId) {
  // Check if the player is a game player BEFORE removing them from lobby
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

  // Only cancel the game if a seated game player left, not a spectator
  if (lobby && lobby.game && wasGamePlayer) {
    cleanupAfkState(result.lobbyCode);
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
    playerId: socketId,
    playerName: result.playerName,
    newHostId: result.newHostId,
    players: lobby ? lobby.players : [],
  });

  const msg = addChatMessage(result.lobbyCode, null, `${result.playerName} left the room`);
  if (msg) {
    io.to(result.lobbyCode).emit('chat_message', msg);
  }
}

// --- Save game results to PostgreSQL ---

async function saveGameResults(game, winningTeam) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const winTeamNum = winningTeam === 'team1' ? 1 : 2;

    // Insert game record
    const gameRes = await client.query(
      `INSERT INTO games (ended_at, winning_team) VALUES (NOW(), $1) RETURNING id`,
      [winTeamNum]
    );
    const gameId = gameRes.rows[0].id;

    // Insert game_players
    for (const player of game.players) {
      const isWinner = player.team === winTeamNum;
      await client.query(
        `INSERT INTO game_players (game_id, user_id, team, seat_index, bot_name, is_winner)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          gameId,
          player.isBot ? null : (player.userId || null),
          player.team,
          player.seatIndex,
          player.isBot ? player.name : null,
          isWinner,
        ]
      );
    }

    // Insert game_rounds and round_bids
    for (const round of game.roundHistory) {
      await client.query(
        `INSERT INTO game_rounds (game_id, round_number, team1_round_score, team2_round_score, team1_total, team2_total, team1_bags, team2_bags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          gameId,
          round.roundNumber,
          round.team1Score,
          round.team2Score,
          round.team1Total,
          round.team2Total,
          round.team1Books || 0,
          round.team2Books || 0,
        ]
      );

      // Insert per-player bids for this round
      for (const player of game.players) {
        const bid = round.bids[player.id];
        const tricks = round.tricksTaken[player.id];
        if (bid !== undefined) {
          await client.query(
            `INSERT INTO round_bids (game_id, round_number, user_id, bot_name, bid, tricks_taken)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              gameId,
              round.roundNumber,
              player.isBot ? null : (player.userId || null),
              player.isBot ? player.name : null,
              bid,
              tricks ?? 0,
            ]
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
