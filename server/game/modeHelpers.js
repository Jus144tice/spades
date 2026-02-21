/**
 * Utility functions that derive team relationships and score structures
 * from a game mode config and seated players array.
 */

/**
 * Build a team lookup object from mode config and seated players.
 * Players must have `id`, `team` (number), and `seatIndex` properties.
 *
 * Returns an object with:
 *   teamsByKey: { team1: [playerId, ...], team2: [...], ... }
 *   getPartnerIds(playerId): array of teammate IDs (empty for solo teams)
 *   getOpponentIds(playerId): array of all non-teammate IDs
 *   getTeamKey(playerId): 'team1', 'team2', etc.
 *   isSpoiler(playerId): boolean
 */
export function buildTeamLookup(mode, players) {
  // Build teamsByKey: { team1: [id1, id2], team2: [id3, id4], ... }
  const teamsByKey = {};
  for (const tc of mode.teams) {
    teamsByKey[tc.id] = [];
  }
  for (const p of players) {
    const key = 'team' + p.team;
    if (teamsByKey[key]) {
      teamsByKey[key].push(p.id);
    }
  }

  // Map player ID -> team key
  const playerTeamMap = {};
  for (const [teamKey, ids] of Object.entries(teamsByKey)) {
    for (const id of ids) {
      playerTeamMap[id] = teamKey;
    }
  }

  // Map team key -> team config
  const teamConfigMap = {};
  for (const tc of mode.teams) {
    teamConfigMap[tc.id] = tc;
  }

  return {
    teamsByKey,

    getPartnerIds(playerId) {
      const teamKey = playerTeamMap[playerId];
      if (!teamKey) return [];
      return teamsByKey[teamKey].filter(id => id !== playerId);
    },

    getOpponentIds(playerId) {
      const teamKey = playerTeamMap[playerId];
      if (!teamKey) return players.map(p => p.id).filter(id => id !== playerId);
      return players
        .filter(p => playerTeamMap[p.id] !== teamKey)
        .map(p => p.id);
    },

    getTeamKey(playerId) {
      return playerTeamMap[playerId] || null;
    },

    isSpoiler(playerId) {
      const teamKey = playerTeamMap[playerId];
      if (!teamKey) return false;
      return teamConfigMap[teamKey]?.spoiler || false;
    },
  };
}

/**
 * Initialize a scores/books object with 0 for each team in the mode.
 * Returns e.g. { team1: 0, team2: 0 } for 4-player,
 * { team1: 0, team2: 0, team3: 0 } for 5/6-player.
 */
export function initTeamScores(mode) {
  const scores = {};
  for (const tc of mode.teams) {
    scores[tc.id] = 0;
  }
  return scores;
}

/**
 * Get an array of team keys for the mode.
 * Returns e.g. ['team1', 'team2'] for 4-player.
 */
export function getTeamKeys(mode) {
  return mode.teams.map(tc => tc.id);
}

/**
 * Parse a team key like 'team1' into the numeric team number (1).
 */
export function teamKeyToNum(teamKey) {
  return parseInt(teamKey.replace('team', ''), 10);
}

/**
 * Convert a numeric team number (1, 2, 3...) to a team key ('team1', 'team2', 'team3'...).
 */
export function teamNumToKey(teamNum) {
  return 'team' + teamNum;
}
