import { AFK_TURN_TIMEOUT, AFK_FAST_TIMEOUT, AFK_THRESHOLD } from './game/constants.js';

// Per-lobby AFK tracking: lobbyCode -> { turnTimer, roundTimers, gameOverTimer, players }
const lobbyAfkState = new Map();

export function getAfkState(lobbyCode) {
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

export function getPlayerAfk(lobbyCode, playerId) {
  const afk = getAfkState(lobbyCode);
  if (!afk.players.has(playerId)) {
    afk.players.set(playerId, { consecutive: 0, isAfk: false });
  }
  return afk.players.get(playerId);
}

export function getPlayerTimeout(lobbyCode, playerId) {
  const pAfk = getPlayerAfk(lobbyCode, playerId);
  return pAfk.isAfk ? AFK_FAST_TIMEOUT : AFK_TURN_TIMEOUT;
}

export function resetPlayerAfk(io, lobbyCode, playerId) {
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

export function incrementAfk(io, lobbyCode, playerId) {
  const pAfk = getPlayerAfk(lobbyCode, playerId);
  pAfk.consecutive++;
  if (pAfk.consecutive >= AFK_THRESHOLD && !pAfk.isAfk) {
    pAfk.isAfk = true;
    io.to(lobbyCode).emit('player_afk_changed', { playerId, isAfk: true });
  }
  return pAfk;
}

export function clearTurnTimer(lobbyCode) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;
  if (afk.turnTimer) {
    clearTimeout(afk.turnTimer);
    afk.turnTimer = null;
  }
}

export function clearRoundTimers(lobbyCode) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;
  for (const timer of afk.roundTimers.values()) {
    clearTimeout(timer);
  }
  afk.roundTimers.clear();
}

export function clearGameOverTimer(lobbyCode) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;
  if (afk.gameOverTimer) {
    clearTimeout(afk.gameOverTimer);
    afk.gameOverTimer = null;
  }
}

export function cleanupAfkState(lobbyCode) {
  clearTurnTimer(lobbyCode);
  clearRoundTimers(lobbyCode);
  clearGameOverTimer(lobbyCode);
  lobbyAfkState.delete(lobbyCode);
}

// Remap AFK state when a player's socket ID changes (reconnection)
export function remapPlayerAfk(lobbyCode, oldSocketId, newSocketId) {
  const afk = lobbyAfkState.get(lobbyCode);
  if (!afk) return;

  if (afk.players.has(oldSocketId)) {
    const pAfk = afk.players.get(oldSocketId);
    afk.players.delete(oldSocketId);
    afk.players.set(newSocketId, pAfk);
  }

  if (afk.roundTimers.has(oldSocketId)) {
    const timer = afk.roundTimers.get(oldSocketId);
    afk.roundTimers.delete(oldSocketId);
    afk.roundTimers.set(newSocketId, timer);
  }
}
