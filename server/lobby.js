import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_GAME_SETTINGS } from './game/constants.js';
import { getMode } from './game/modes.js';

const lobbies = new Map();
const playerSockets = new Map(); // socketId -> { playerName, lobbyCode }

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure unique
  if (lobbies.has(code)) return generateCode();
  return code;
}

export function createLobby(socketId, playerName, userId) {
  const code = generateCode();
  const player = { id: socketId, name: playerName, team: null, userId: userId || null };
  const lobby = {
    code,
    hostId: socketId,
    players: [player],
    chatLog: [],
    game: null,
    gameSettings: { ...DEFAULT_GAME_SETTINGS },
    paused: false,
    vacantSeats: [],   // { seatIndex, team, previousPlayerName }
  };
  lobbies.set(code, lobby);
  playerSockets.set(socketId, { playerName, lobbyCode: code });
  return lobby;
}

export function joinLobby(socketId, playerName, lobbyCode, userId) {
  const code = lobbyCode.toUpperCase();
  const lobby = lobbies.get(code);
  if (!lobby) return { error: 'Room not found' };
  if (lobby.players.length >= 10) return { error: 'Room is full' };
  if (lobby.players.some(p => p.name === playerName)) {
    return { error: 'Name already taken in this room' };
  }

  const player = { id: socketId, name: playerName, team: null, userId: userId || null };
  lobby.players.push(player);
  playerSockets.set(socketId, { playerName, lobbyCode: code });
  // If game is in progress, they join as a spectator (team: null)
  const joinedAsSpectator = !!lobby.game;
  return { lobby, player, joinedAsSpectator };
}

export function leaveLobby(socketId) {
  const info = playerSockets.get(socketId);
  if (!info) return null;

  const lobby = lobbies.get(info.lobbyCode);
  if (!lobby) {
    playerSockets.delete(socketId);
    return null;
  }

  // Check if the leaving player is in an active game
  let gamePaused = false;
  let pauseResult = null;
  if (lobby.game && lobby.game.phase !== 'gameOver') {
    const gamePlayer = lobby.game.players.find(p => p.id === socketId);
    if (gamePlayer) {
      pauseResult = pauseGame(info.lobbyCode, socketId);
      gamePaused = !!pauseResult;
    }
  }

  lobby.players = lobby.players.filter(p => p.id !== socketId);
  playerSockets.delete(socketId);

  // Check if all humans are gone
  const humanPlayers = lobby.players.filter(p => !p.isBot);
  if (humanPlayers.length === 0) {
    lobbies.delete(info.lobbyCode);
    return { lobbyCode: info.lobbyCode, playerName: info.playerName, disbanded: true };
  }

  // Transfer host if needed (to a human)
  let newHostId = null;
  if (lobby.hostId === socketId) {
    const nextHuman = lobby.players.find(p => !p.isBot);
    lobby.hostId = nextHuman.id;
    newHostId = lobby.hostId;
  }

  return {
    lobbyCode: info.lobbyCode,
    playerName: info.playerName,
    disbanded: false,
    newHostId,
    gamePaused,
    pauseResult,
  };
}

const BOT_PREFIXES = [
  'Lil', 'Big', 'OG', 'DJ', 'Slick', 'Lucky', 'Smooth', 'Quick',
  'Ace', 'King', 'Sneaky', 'Shady', 'Tricky', 'Steady', 'Silent',
  'Wild', 'Sly', 'Cool', 'Swift', 'Wise',
];
const BOT_NAMES = [
  'Ricky', 'Shonda', 'Malik', 'Tanya', 'Dre', 'Keisha', 'Carlos', 'Jasmine',
  'Andre', 'Monique', 'Dante', 'Nikki', 'Ray', 'Tasha', 'Jerome', 'Cece',
  'Tony', 'Maria', 'Dev', 'Rosa', 'Omar', 'Jade', 'Kev', 'Mya',
];
let botCounter = 0;

function generateBotName(usedNames) {
  // Try a random prefix + name combo (up to 20 attempts)
  for (let i = 0; i < 20; i++) {
    const prefix = BOT_PREFIXES[Math.floor(Math.random() * BOT_PREFIXES.length)];
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const fullName = `${prefix} ${name}`;
    if (!usedNames.includes(fullName)) return fullName;
  }
  // Fallback: plain name
  for (const name of BOT_NAMES) {
    if (!usedNames.includes(name)) return name;
  }
  return `Bot-${++botCounter}`;
}

export function addBot(lobbyCode) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return { error: 'Lobby not found' };
  if (lobby.players.length >= 10) return { error: 'Room is full' };
  if (lobby.game) return { error: 'Game already in progress' };

  const usedNames = lobby.players.map(p => p.name);
  const botName = generateBotName(usedNames);

  const botId = `bot-${uuidv4().slice(0, 8)}`;
  const player = { id: botId, name: botName, team: null, isBot: true };
  lobby.players.push(player);

  return { player, lobby };
}

export function removeBot(lobbyCode, botId) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return { error: 'Lobby not found' };

  const bot = lobby.players.find(p => p.id === botId && p.isBot);
  if (!bot) return { error: 'Bot not found' };

  lobby.players = lobby.players.filter(p => p.id !== botId);
  return { players: lobby.players, botName: bot.name };
}

export function getLobby(lobbyCode) {
  return lobbies.get(lobbyCode);
}

export function getPlayerInfo(socketId) {
  return playerSockets.get(socketId);
}

export function addChatMessage(lobbyCode, sender, message) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return null;
  const msg = { sender, message, timestamp: Date.now() };
  lobby.chatLog.push(msg);
  return msg;
}

export function assignTeam(lobbyCode, targetPlayerId, team) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return { error: 'Lobby not found' };

  const player = lobby.players.find(p => p.id === targetPlayerId);
  if (!player) return { error: 'Player not found' };

  // Validate team size limit (skip if unassigning to null/spectator)
  if (team !== null) {
    const mode = getMode(lobby.gameSettings.gameMode || 4);
    const teamConfig = mode.teams.find(t => t.id === `team${team}`);
    if (teamConfig) {
      const currentCount = lobby.players.filter(p => p.team === team && p.id !== targetPlayerId).length;
      if (currentCount >= teamConfig.size) {
        return { error: `Team ${team} is full` };
      }
    }
  }

  player.team = team; // 1, 2, 3, 4, ... or null (spectator)
  return { players: lobby.players };
}

export function autoAssignTeams(lobbyCode) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return { error: 'Lobby not found' };

  const mode = getMode(lobby.gameSettings.gameMode || 4);

  // Clear existing assignments
  for (const p of lobby.players) {
    p.team = null;
  }

  if (lobby.players.length < mode.playerCount) {
    return { error: `Need at least ${mode.playerCount} players` };
  }

  // Shuffle all players
  const indices = lobby.players.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Assign to teams per mode config
  let assignIdx = 0;
  for (let teamNum = 0; teamNum < mode.teams.length; teamNum++) {
    const teamConfig = mode.teams[teamNum];
    for (let s = 0; s < teamConfig.size; s++) {
      if (assignIdx < indices.length) {
        lobby.players[indices[assignIdx]].team = teamNum + 1;
        assignIdx++;
      }
    }
  }
  // Remaining players stay as spectators (team: null)

  return { players: lobby.players };
}

export function canStartGame(lobbyCode, requesterId) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return { error: 'Lobby not found' };
  if (lobby.hostId !== requesterId) return { error: 'Only the host can start the game' };

  const mode = getMode(lobby.gameSettings.gameMode || 4);

  // Validate each team has the correct number of players
  for (let teamNum = 0; teamNum < mode.teams.length; teamNum++) {
    const teamConfig = mode.teams[teamNum];
    const teamPlayers = lobby.players.filter(p => p.team === teamNum + 1);
    if (teamPlayers.length !== teamConfig.size) {
      return { error: `Team ${teamNum + 1} needs exactly ${teamConfig.size} player${teamConfig.size > 1 ? 's' : ''}` };
    }
  }

  return { valid: true };
}

/**
 * Arrange players so partners sit directly across from each other.
 *
 * For modes with a spoiler (5p, 7p), the layout uses playerCount+1 positions
 * (e.g., hexagon for 5p, octagon for 7p). Partners sit at exactly half the
 * layout distance apart (directly across). The spoiler occupies one of the
 * remaining positions, and the seat across from them stays empty.
 *
 * For even modes (4p, 6p, 8p), layoutSeats == playerCount and all seats are used.
 *
 * Examples (layout positions):
 *   4p (4 seats): [T1a, T2a, T1b, T2b] — partners at offset 2
 *   5p (6 seats): [T1a, T2a, Spoiler, T1b, T2b, _empty_] — partners at offset 3
 *   6p (6 seats): [T1a, T2a, T3a, T1b, T2b, T3b] — partners at offset 3
 *   7p (8 seats): [T1a, T2a, T3a, Spoiler, T1b, T2b, T3b, _empty_] — partners at offset 4
 *   8p (8 seats): [T1a, T2a, T3a, T4a, T1b, T2b, T3b, T4b] — partners at offset 4
 */
export function arrangeSeating(players, mode) {
  const modeConfig = mode || getMode(4);
  const ls = modeConfig.layoutSeats || modeConfig.playerCount;
  const half = ls / 2;

  // Separate pair teams (size 2) from solo teams (size 1)
  const pairTeams = [];
  const soloTeams = [];
  for (const tc of modeConfig.teams) {
    const teamNum = parseInt(tc.id.replace('team', ''), 10);
    const teamPlayers = players.filter(p => p.team === teamNum);
    if (tc.size === 2) {
      pairTeams.push(teamPlayers);
    } else {
      soloTeams.push(teamPlayers);
    }
  }

  // Use layoutSeats positions (may be > playerCount for spoiler modes)
  const layoutPositions = new Array(ls).fill(null);

  // Place pair teams: first member at position i, partner at position i + half
  for (let i = 0; i < pairTeams.length; i++) {
    const [a, b] = pairTeams[i];
    layoutPositions[i] = a;
    layoutPositions[i + half] = b;
  }

  // Place solo teams in first available empty positions
  const empties = [];
  for (let i = 0; i < ls; i++) {
    if (layoutPositions[i] === null) empties.push(i);
  }
  let soloIdx = 0;
  for (const teamPlayers of soloTeams) {
    for (const p of teamPlayers) {
      if (soloIdx < empties.length) {
        layoutPositions[empties[soloIdx]] = p;
        soloIdx++;
      }
    }
  }

  // Build seated array from occupied positions, preserving layout position as seatIndex
  const seated = [];
  for (let i = 0; i < ls; i++) {
    if (layoutPositions[i] !== null) {
      seated.push({ ...layoutPositions[i], seatIndex: i });
    }
  }

  return seated;
}

export function findPlayerByUserId(userId) {
  for (const [code, lobby] of lobbies) {
    const player = lobby.players.find(p => p.userId === userId);
    if (player) return { player, lobbyCode: code, lobby };
  }
  return null;
}

export function updateGameSettings(lobbyCode, settings) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return { error: 'Lobby not found' };
  if (lobby.game) return { error: 'Cannot change settings during a game' };

  const s = lobby.gameSettings;

  if (typeof settings.winTarget === 'number') {
    s.winTarget = Math.max(100, Math.min(1000, Math.round(settings.winTarget)));
  }
  if (typeof settings.bagThreshold === 'number') {
    s.bagThreshold = Math.max(5, Math.min(15, Math.round(settings.bagThreshold)));
  }
  if (typeof settings.blindNil === 'boolean') s.blindNil = settings.blindNil;
  if (typeof settings.moonshot === 'boolean') s.moonshot = settings.moonshot;
  if (typeof settings.tenBidBonus === 'boolean') s.tenBidBonus = settings.tenBidBonus;
  if (typeof settings.gameMode === 'number') {
    const validModes = [3, 4, 5, 6, 7, 8];
    if (validModes.includes(settings.gameMode) && settings.gameMode !== s.gameMode) {
      s.gameMode = settings.gameMode;
      // Reset all team assignments when mode changes (team structure differs per mode)
      for (const p of lobby.players) {
        p.team = null;
      }
      return { gameSettings: { ...s }, teamsReset: true, players: lobby.players };
    }
  }

  return { gameSettings: { ...s } };
}

export function updatePlayerSocket(oldSocketId, newSocketId, lobbyCode) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby) return false;

  const player = lobby.players.find(p => p.id === oldSocketId);
  if (!player) return false;

  player.id = newSocketId;
  if (lobby.hostId === oldSocketId) {
    lobby.hostId = newSocketId;
  }

  const info = playerSockets.get(oldSocketId);
  if (info) {
    playerSockets.delete(oldSocketId);
    playerSockets.set(newSocketId, info);
  }

  // Update readyForNextRound set if it exists
  if (lobby.readyForNextRound && lobby.readyForNextRound.has(oldSocketId)) {
    lobby.readyForNextRound.delete(oldSocketId);
    lobby.readyForNextRound.add(newSocketId);
  }

  // Update game state if active
  if (lobby.game) {
    lobby.game.replacePlayer(oldSocketId, newSocketId, null);
  }

  return true;
}

// --- Pause / Resume ---

export function pauseGame(lobbyCode, departingPlayerId) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby || !lobby.game) return null;

  const gamePlayer = lobby.game.players.find(p => p.id === departingPlayerId);
  if (!gamePlayer) return null;

  lobby.paused = true;
  const vacancy = {
    seatIndex: gamePlayer.seatIndex,
    team: gamePlayer.team,
    previousPlayerName: gamePlayer.name,
  };
  lobby.vacantSeats.push(vacancy);
  return vacancy;
}

export function fillSeat(lobbyCode, socketId, seatIndex) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby || !lobby.game || !lobby.paused) return { error: 'No seat to fill' };

  const vacantIndex = lobby.vacantSeats.findIndex(v => v.seatIndex === seatIndex);
  if (vacantIndex === -1) return { error: 'Seat not vacant' };

  const vacant = lobby.vacantSeats[vacantIndex];
  const player = lobby.players.find(p => p.id === socketId);
  if (!player) return { error: 'Player not in room' };

  // Assign team to the filling player
  player.team = vacant.team;

  // Find the game player entry for that seat and remap
  const gamePlayer = lobby.game.players.find(p => p.seatIndex === seatIndex);
  if (gamePlayer) {
    const oldId = gamePlayer.id;
    lobby.game.replacePlayer(oldId, socketId, player.name, {
      isBot: player.isBot || false,
      userId: player.userId || null,
    });
  }

  // Remove this vacancy
  lobby.vacantSeats.splice(vacantIndex, 1);

  // If no more vacant seats, unpause
  if (lobby.vacantSeats.length === 0) {
    lobby.paused = false;
  }

  return { resumed: !lobby.paused, vacant, player };
}

export function fillSeatWithBot(lobbyCode, seatIndex) {
  const lobby = lobbies.get(lobbyCode);
  if (!lobby || !lobby.game || !lobby.paused) return { error: 'No seat to fill' };

  const vacantIndex = lobby.vacantSeats.findIndex(v => v.seatIndex === seatIndex);
  if (vacantIndex === -1) return { error: 'Seat not vacant' };

  const vacant = lobby.vacantSeats[vacantIndex];
  const usedNames = lobby.players.map(p => p.name);
  const botName = generateBotName(usedNames);
  const botId = `bot-${uuidv4().slice(0, 8)}`;

  const botPlayer = { id: botId, name: botName, team: vacant.team, isBot: true };
  lobby.players.push(botPlayer);

  // Remap in game state
  const gamePlayer = lobby.game.players.find(p => p.seatIndex === seatIndex);
  if (gamePlayer) {
    const oldId = gamePlayer.id;
    lobby.game.replacePlayer(oldId, botId, botName, { isBot: true, userId: null });
  }

  // Remove this vacancy
  lobby.vacantSeats.splice(vacantIndex, 1);

  if (lobby.vacantSeats.length === 0) {
    lobby.paused = false;
  }

  return { resumed: !lobby.paused, vacant, botPlayer };
}

// --- Room list for browser ---

export function getRoomList() {
  const rooms = [];
  for (const [code, lobby] of lobbies) {
    const humanCount = lobby.players.filter(p => !p.isBot).length;
    if (humanCount === 0) continue;

    const mode = getMode(lobby.gameSettings.gameMode || 4);

    const teamPlayers = lobby.game
      ? lobby.game.players
      : lobby.players.filter(p => p.team !== null);
    const spectators = lobby.players.filter(p =>
      !lobby.game
        ? p.team === null
        : !lobby.game.players.some(gp => gp.id === p.id)
    );

    rooms.push({
      code,
      hostName: lobby.players.find(p => p.id === lobby.hostId)?.name || 'Unknown',
      playerCount: teamPlayers.length,
      maxPlayers: mode.playerCount,
      spectatorCount: spectators.length,
      status: lobby.paused ? 'paused' : lobby.game ? 'playing' : 'waiting',
      vacantSeats: lobby.vacantSeats.length,
      gameMode: mode.playerCount,
      gameInfo: lobby.game ? {
        scores: { ...lobby.game.scores },
        roundNumber: lobby.game.roundNumber,
      } : null,
      settings: {
        winTarget: lobby.gameSettings.winTarget,
      },
    });
  }
  return rooms;
}
