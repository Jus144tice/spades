/**
 * Client-side mode utilities for layout and display.
 * Provides seat position calculations for N-player layouts.
 * The server sends mode info (playerCount, teamCount, etc.) via game state.
 */

/**
 * For 4-player mode, the classic fixed positions.
 * Offsets from the player's own seat (0=me): 0=bottom, 1=left, 2=top, 3=right.
 */
const FOUR_PLAYER_POSITIONS = ['bottom', 'left', 'top', 'right'];

/**
 * Get the CSS position name for a player relative to "me" in a 4-player game.
 * Returns one of: 'bottom', 'left', 'top', 'right'
 */
export function getFourPlayerPosition(playerIndex, myIndex) {
  const offset = (playerIndex - myIndex + 4) % 4;
  return FOUR_PLAYER_POSITIONS[offset];
}

/**
 * Get angle (in degrees) for a player seat in a polygon layout.
 * Seat 0 (me) is at the bottom (270°). Others are distributed clockwise.
 * @param {number} offset - relative offset from "me" (0 = me, 1 = next clockwise, etc.)
 * @param {number} playerCount - total number of players
 * @returns {number} angle in degrees (0° = top, 90° = right, 180° = bottom, 270° = left)
 */
export function getSeatAngle(offset, playerCount) {
  // Start from bottom (180°) and go clockwise
  return (180 + (offset * 360 / playerCount)) % 360;
}

/**
 * Get CSS position (as percentages) for a player seat in polygon layout.
 * Returns { left, top } as percentage strings for absolute positioning.
 * @param {number} offset - relative offset from "me"
 * @param {number} playerCount - total number of players
 * @returns {{ left: string, top: string }}
 */
export function getSeatPosition(offset, playerCount) {
  const angle = getSeatAngle(offset, playerCount);
  const rad = (angle - 90) * Math.PI / 180; // -90 to start from top
  // Elliptical layout: wider than tall
  const x = 50 + 42 * Math.cos(rad);
  const y = 50 + 40 * Math.sin(rad);
  return { left: `${x}%`, top: `${y}%` };
}

/**
 * Get trick card position for polygon layout.
 * Returns { left, top } for absolute positioning within the trick area.
 * Cards are placed closer to center than seats.
 * @param {number} offset - relative offset from "me"
 * @param {number} playerCount - total number of players
 * @returns {{ left: string, top: string }}
 */
export function getTrickCardPosition(offset, playerCount) {
  const angle = getSeatAngle(offset, playerCount);
  const rad = (angle - 90) * Math.PI / 180;
  const x = 50 + 25 * Math.cos(rad);
  const y = 50 + 25 * Math.sin(rad);
  return { left: `${x}%`, top: `${y}%` };
}

/**
 * Get the number of teams for display purposes.
 * Falls back to mode info from server, or defaults to 2.
 */
export function getTeamCount(mode) {
  return mode?.teamCount || 2;
}

/**
 * Get cards per player for display purposes.
 * Falls back to 13.
 */
export function getCardsPerPlayer(mode) {
  return mode?.cardsPerPlayer || 13;
}

/**
 * Get tricks per round for display purposes.
 * Falls back to 13.
 */
export function getTricksPerRound(mode) {
  return mode?.tricksPerRound || 13;
}
