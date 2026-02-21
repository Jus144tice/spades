/**
 * Player stats computation and leaderboard queries.
 * Stats are updated incrementally inside the saveGameResults transaction.
 */

import { teamKeyToNum, teamNumToKey } from '../game/modeHelpers.js';

export async function updatePlayerStats(client, game, winningTeam) {
  const winTeamNum = teamKeyToNum(winningTeam);
  const teamLookup = game.teamLookup;

  for (const player of game.players) {
    // Only track stats for human players with accounts
    if (player.isBot || !player.userId) continue;

    const isWinner = player.team === winTeamNum;
    const teamKey = teamNumToKey(player.team);

    // Find teammates using teamLookup (supports N-player modes)
    const partnerIds = teamLookup
      ? teamLookup.getPartnerIds(player.id)
      : [game.players[(player.seatIndex + 2) % 4]?.id].filter(Boolean);
    const partners = partnerIds.map(pid => game.players.find(p => p.id === pid)).filter(Boolean);

    let roundsPlayed = 0;
    let perfectBids = 0;
    let timesSet = 0;
    let totalTricks = 0;
    let totalBidSum = 0;
    let nilAttempts = 0;
    let nilsMade = 0;
    let blindNilAttempts = 0;
    let blindNilsMade = 0;
    let totalBooks = 0;
    let moonshotWins = 0;

    for (const round of game.roundHistory) {
      // Skip rounds where this player wasn't present (mid-game replacement)
      if (round.bids[player.id] === undefined) continue;

      roundsPlayed++;
      const bid = round.bids[player.id];
      const tricks = round.tricksTaken[player.id] || 0;
      const isBlindNil = round.blindNilPlayers?.includes(player.id);

      totalBidSum += bid;
      totalTricks += tricks;

      // Nil tracking
      if (bid === 0 && isBlindNil) {
        blindNilAttempts++;
        if (tricks === 0) blindNilsMade++;
      } else if (bid === 0) {
        nilAttempts++;
        if (tricks === 0) nilsMade++;
      }

      // Perfect bid (non-nil, exact tricks)
      if (bid > 0 && tricks === bid) {
        perfectBids++;
      }

      // Moonshot detection
      if (round.moonshot === teamKey) {
        moonshotWins++;
      }

      // Set detection (mirrors scoring.js logic)
      // Only count if not a moonshot round
      if (!round.moonshot && partners.length > 0) {
        // Build team bids array for this player + all teammates
        const teamBids = [
          { id: player.id, bid, tricks, isNil: bid === 0 },
        ];
        let allPartnersPresent = true;
        for (const p of partners) {
          const pBid = round.bids[p.id];
          if (pBid === undefined) { allPartnersPresent = false; break; }
          teamBids.push({
            id: p.id, bid: pBid,
            tricks: round.tricksTaken[p.id] || 0,
            isNil: pBid === 0,
          });
        }

        if (allPartnersPresent) {
          const nonNilBids = teamBids.filter(b => !b.isNil);
          const nilBids = teamBids.filter(b => b.isNil);
          const combinedBid = nonNilBids.reduce((sum, b) => sum + b.bid, 0);
          const nonNilTricks = nonNilBids.reduce((sum, b) => sum + b.tricks, 0);
          const failedNilTricks = nilBids
            .filter(b => b.tricks > 0)
            .reduce((sum, b) => sum + b.tricks, 0);
          const effectiveTricks = nonNilTricks + failedNilTricks;

          if (combinedBid > 0 && effectiveTricks < combinedBid) {
            timesSet++;
          }

          // Books (overtricks when bid is made)
          if (combinedBid > 0 && effectiveTricks >= combinedBid) {
            totalBooks += effectiveTricks - combinedBid;
          }
        }
      }
    }

    // Highest game score (only on wins)
    const teamScore = game.scores[teamKey];
    const highestScore = isWinner ? teamScore : 0;

    await client.query(`
      INSERT INTO player_stats (
        user_id, games_played, games_won, games_lost,
        current_win_streak, best_win_streak,
        total_rounds, perfect_bids, times_set,
        total_tricks_taken, total_bid_sum,
        nil_attempts, nils_made,
        blind_nil_attempts, blind_nils_made,
        total_bags, moonshot_wins, highest_game_score, last_played_at
      ) VALUES (
        $1, 1, $2, $3,
        $4, $4,
        $5, $6, $7,
        $8, $9,
        $10, $11,
        $12, $13,
        $14, $15, $16, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        games_played = player_stats.games_played + 1,
        games_won = player_stats.games_won + $2,
        games_lost = player_stats.games_lost + $3,
        current_win_streak = CASE
          WHEN $2 = 1 THEN player_stats.current_win_streak + 1
          ELSE 0
        END,
        best_win_streak = GREATEST(
          player_stats.best_win_streak,
          CASE
            WHEN $2 = 1 THEN player_stats.current_win_streak + 1
            ELSE player_stats.best_win_streak
          END
        ),
        total_rounds = player_stats.total_rounds + $5,
        perfect_bids = player_stats.perfect_bids + $6,
        times_set = player_stats.times_set + $7,
        total_tricks_taken = player_stats.total_tricks_taken + $8,
        total_bid_sum = player_stats.total_bid_sum + $9,
        nil_attempts = player_stats.nil_attempts + $10,
        nils_made = player_stats.nils_made + $11,
        blind_nil_attempts = player_stats.blind_nil_attempts + $12,
        blind_nils_made = player_stats.blind_nils_made + $13,
        total_bags = player_stats.total_bags + $14,
        moonshot_wins = player_stats.moonshot_wins + $15,
        highest_game_score = GREATEST(player_stats.highest_game_score, $16),
        last_played_at = NOW()
    `, [
      player.userId,
      isWinner ? 1 : 0,     // $2 games_won
      isWinner ? 0 : 1,     // $3 games_lost
      isWinner ? 1 : 0,     // $4 streak seed
      roundsPlayed,          // $5
      perfectBids,           // $6
      timesSet,              // $7
      totalTricks,           // $8
      totalBidSum,           // $9
      nilAttempts,           // $10
      nilsMade,              // $11
      blindNilAttempts,      // $12
      blindNilsMade,         // $13
      totalBooks,             // $14
      moonshotWins,          // $15
      highestScore,          // $16
    ]);
  }
}

export async function getLeaderboard(pool, sortBy = 'games_won') {
  const allowed = [
    'games_won', 'games_played', 'win_rate', 'best_win_streak',
    'perfect_bids', 'nils_made', 'moonshot_wins', 'total_tricks_taken',
  ];
  const sortColumn = allowed.includes(sortBy) ? sortBy : 'games_won';

  const orderExpr = sortColumn === 'win_rate'
    ? 'ROUND(ps.games_won::numeric / NULLIF(ps.games_played, 0) * 100, 1)'
    : `ps.${sortColumn}`;

  const result = await pool.query(`
    SELECT
      ps.*,
      u.display_name,
      u.avatar_url,
      ROUND(ps.games_won::numeric / NULLIF(ps.games_played, 0) * 100, 1) AS win_rate
    FROM player_stats ps
    JOIN users u ON u.id = ps.user_id
    WHERE ps.games_played > 0
    ORDER BY ${orderExpr} DESC NULLS LAST, ps.games_played DESC
    LIMIT 50
  `);

  return result.rows.map((s, i) => ({
    rank: i + 1,
    userId: s.user_id,
    displayName: s.display_name,
    avatarUrl: s.avatar_url,
    gamesPlayed: s.games_played,
    gamesWon: s.games_won,
    gamesLost: s.games_lost,
    winRate: parseFloat(s.win_rate) || 0,
    currentWinStreak: s.current_win_streak,
    bestWinStreak: s.best_win_streak,
    totalRounds: s.total_rounds,
    perfectBids: s.perfect_bids,
    timesSet: s.times_set,
    totalTricksTaken: s.total_tricks_taken,
    avgBid: s.total_rounds > 0 ? (s.total_bid_sum / s.total_rounds).toFixed(1) : '0',
    nilAttempts: s.nil_attempts,
    nilsMade: s.nils_made,
    blindNilAttempts: s.blind_nil_attempts,
    blindNilsMade: s.blind_nils_made,
    totalBooks: s.total_bags,
    moonshotWins: s.moonshot_wins,
    highestGameScore: s.highest_game_score,
  }));
}

export async function getPlayerStats(pool, userId) {
  const result = await pool.query(
    `SELECT * FROM player_stats WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0,
      winRate: 0, currentWinStreak: 0, bestWinStreak: 0,
      totalRounds: 0, perfectBids: 0, timesSet: 0,
      totalTricksTaken: 0, avgBid: '0',
      nilAttempts: 0, nilsMade: 0,
      blindNilAttempts: 0, blindNilsMade: 0,
      totalBooks: 0, moonshotWins: 0, highestGameScore: 0,
    };
  }

  const s = result.rows[0];
  return {
    gamesPlayed: s.games_played,
    gamesWon: s.games_won,
    gamesLost: s.games_lost,
    winRate: s.games_played > 0 ? Math.round(s.games_won / s.games_played * 100) : 0,
    currentWinStreak: s.current_win_streak,
    bestWinStreak: s.best_win_streak,
    totalRounds: s.total_rounds,
    perfectBids: s.perfect_bids,
    timesSet: s.times_set,
    totalTricksTaken: s.total_tricks_taken,
    avgBid: s.total_rounds > 0 ? (s.total_bid_sum / s.total_rounds).toFixed(1) : '0',
    nilAttempts: s.nil_attempts,
    nilsMade: s.nils_made,
    blindNilAttempts: s.blind_nil_attempts,
    blindNilsMade: s.blind_nils_made,
    totalBooks: s.total_bags,
    moonshotWins: s.moonshot_wins,
    highestGameScore: s.highest_game_score,
  };
}

/**
 * Build WHERE conditions and params for game mode + settings filters.
 */
function buildModeFilters(gameMode, { blindNil = 'any', moonshot = 'any', tenBidBonus = 'any' } = {}) {
  const conditions = ['g.game_mode = $1', 'g.ended_at IS NOT NULL'];
  const params = [gameMode];
  let idx = 2;

  if (blindNil !== 'any') {
    conditions.push(`g.blind_nil = $${idx}`);
    params.push(blindNil === 'on');
    idx++;
  }
  if (moonshot !== 'any') {
    conditions.push(`g.moonshot = $${idx}`);
    params.push(moonshot === 'on');
    idx++;
  }
  if (tenBidBonus !== 'any') {
    conditions.push(`g.ten_bid_bonus = $${idx}`);
    params.push(tenBidBonus === 'on');
    idx++;
  }

  return { conditions, params, nextIdx: idx };
}

/**
 * Dynamic leaderboard for a specific game mode, with optional settings filters.
 */
export async function getModeLeaderboard(pool, options = {}) {
  const {
    gameMode,
    sortBy = 'games_won',
    blindNil = 'any',
    moonshot = 'any',
    tenBidBonus = 'any',
    minGames = 1,
  } = options;

  const allowed = [
    'games_won', 'games_played', 'win_rate', 'perfect_bids',
    'bid_accuracy', 'nils_made', 'total_tricks_taken', 'avg_bid',
  ];
  const safeSortBy = allowed.includes(sortBy) ? sortBy : 'games_won';

  const { conditions, params, nextIdx } = buildModeFilters(gameMode, { blindNil, moonshot, tenBidBonus });
  const whereClause = conditions.join(' AND ');

  const minGamesIdx = nextIdx;
  params.push(minGames);

  const query = `
    WITH filtered_games AS (
      SELECT g.id FROM games g WHERE ${whereClause}
    ),
    player_game_stats AS (
      SELECT
        gp.user_id,
        COUNT(DISTINCT gp.game_id) AS games_played,
        COUNT(DISTINCT gp.game_id) FILTER (WHERE gp.is_winner) AS games_won,
        COUNT(DISTINCT gp.game_id) FILTER (WHERE NOT gp.is_winner) AS games_lost
      FROM game_players gp
      JOIN filtered_games fg ON fg.id = gp.game_id
      WHERE gp.user_id IS NOT NULL
      GROUP BY gp.user_id
    ),
    player_round_stats AS (
      SELECT
        rb.user_id,
        COUNT(*) AS total_rounds,
        COUNT(*) FILTER (WHERE rb.bid > 0 AND rb.tricks_taken = rb.bid) AS perfect_bids,
        COUNT(*) FILTER (WHERE rb.bid = 0) AS nil_attempts,
        COUNT(*) FILTER (WHERE rb.bid = 0 AND rb.tricks_taken = 0) AS nils_made,
        COALESCE(SUM(rb.tricks_taken), 0) AS total_tricks_taken,
        COALESCE(SUM(rb.bid), 0) AS total_bid_sum
      FROM round_bids rb
      JOIN filtered_games fg ON fg.id = rb.game_id
      WHERE rb.user_id IS NOT NULL
      GROUP BY rb.user_id
    )
    SELECT
      u.id AS user_id,
      u.display_name,
      u.avatar_url,
      pgs.games_played,
      pgs.games_won,
      pgs.games_lost,
      ROUND(pgs.games_won::numeric / NULLIF(pgs.games_played, 0) * 100, 1) AS win_rate,
      COALESCE(prs.total_rounds, 0) AS total_rounds,
      COALESCE(prs.perfect_bids, 0) AS perfect_bids,
      COALESCE(prs.nil_attempts, 0) AS nil_attempts,
      COALESCE(prs.nils_made, 0) AS nils_made,
      COALESCE(prs.total_tricks_taken, 0) AS total_tricks_taken,
      CASE WHEN COALESCE(prs.total_rounds, 0) > 0
        THEN ROUND(prs.total_bid_sum::numeric / prs.total_rounds, 1) ELSE 0
      END AS avg_bid,
      CASE WHEN COALESCE(prs.total_rounds, 0) > 0
        THEN ROUND(prs.perfect_bids::numeric / prs.total_rounds * 100, 1) ELSE 0
      END AS bid_accuracy
    FROM player_game_stats pgs
    JOIN users u ON u.id = pgs.user_id
    LEFT JOIN player_round_stats prs ON prs.user_id = pgs.user_id
    WHERE pgs.games_played >= $${minGamesIdx}
    ORDER BY ${safeSortBy} DESC NULLS LAST, pgs.games_played DESC
    LIMIT 50
  `;

  const result = await pool.query(query, params);

  // Get total matching game count for context display
  const countParams = params.slice(0, nextIdx - 1);
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM games g WHERE ${whereClause}`,
    countParams
  );
  const totalGames = parseInt(countResult.rows[0]?.total || '0', 10);

  return {
    totalGames,
    rows: result.rows.map((s, i) => ({
      rank: i + 1,
      userId: s.user_id,
      displayName: s.display_name,
      avatarUrl: s.avatar_url,
      gamesPlayed: parseInt(s.games_played),
      gamesWon: parseInt(s.games_won),
      gamesLost: parseInt(s.games_lost),
      winRate: parseFloat(s.win_rate) || 0,
      totalRounds: parseInt(s.total_rounds),
      perfectBids: parseInt(s.perfect_bids),
      bidAccuracy: parseFloat(s.bid_accuracy) || 0,
      nilAttempts: parseInt(s.nil_attempts),
      nilsMade: parseInt(s.nils_made),
      totalTricksTaken: parseInt(s.total_tricks_taken),
      avgBid: parseFloat(s.avg_bid) || 0,
    })),
  };
}

/**
 * Per-mode stats for a specific player.
 */
export async function getPlayerModeStats(pool, userId, options = {}) {
  const { gameMode, blindNil = 'any', moonshot = 'any', tenBidBonus = 'any' } = options;

  const { conditions, params, nextIdx } = buildModeFilters(gameMode, { blindNil, moonshot, tenBidBonus });
  const whereClause = conditions.join(' AND ');

  const userIdx = nextIdx;
  params.push(userId);

  const query = `
    WITH filtered_games AS (
      SELECT g.id FROM games g WHERE ${whereClause}
    )
    SELECT
      COUNT(DISTINCT gp.game_id) AS games_played,
      COUNT(DISTINCT gp.game_id) FILTER (WHERE gp.is_winner) AS games_won,
      COUNT(DISTINCT gp.game_id) FILTER (WHERE NOT gp.is_winner) AS games_lost,
      (SELECT COUNT(*) FROM round_bids rb JOIN filtered_games fg ON fg.id = rb.game_id WHERE rb.user_id = $${userIdx}) AS total_rounds,
      (SELECT COUNT(*) FROM round_bids rb JOIN filtered_games fg ON fg.id = rb.game_id WHERE rb.user_id = $${userIdx} AND rb.bid > 0 AND rb.tricks_taken = rb.bid) AS perfect_bids,
      (SELECT COUNT(*) FROM round_bids rb JOIN filtered_games fg ON fg.id = rb.game_id WHERE rb.user_id = $${userIdx} AND rb.bid = 0) AS nil_attempts,
      (SELECT COUNT(*) FROM round_bids rb JOIN filtered_games fg ON fg.id = rb.game_id WHERE rb.user_id = $${userIdx} AND rb.bid = 0 AND rb.tricks_taken = 0) AS nils_made,
      (SELECT COALESCE(SUM(rb.tricks_taken), 0) FROM round_bids rb JOIN filtered_games fg ON fg.id = rb.game_id WHERE rb.user_id = $${userIdx}) AS total_tricks_taken,
      (SELECT COALESCE(SUM(rb.bid), 0) FROM round_bids rb JOIN filtered_games fg ON fg.id = rb.game_id WHERE rb.user_id = $${userIdx}) AS total_bid_sum
    FROM game_players gp
    JOIN filtered_games fg ON fg.id = gp.game_id
    WHERE gp.user_id = $${userIdx}
  `;

  const result = await pool.query(query, params);
  const s = result.rows[0];
  if (!s || parseInt(s.games_played) === 0) return null;

  const totalRounds = parseInt(s.total_rounds);
  const perfectBids = parseInt(s.perfect_bids);
  return {
    gamesPlayed: parseInt(s.games_played),
    gamesWon: parseInt(s.games_won),
    gamesLost: parseInt(s.games_lost),
    winRate: parseInt(s.games_played) > 0
      ? Math.round(parseInt(s.games_won) / parseInt(s.games_played) * 100) : 0,
    totalRounds,
    perfectBids,
    bidAccuracy: totalRounds > 0 ? Math.round(perfectBids / totalRounds * 100) : 0,
    nilAttempts: parseInt(s.nil_attempts),
    nilsMade: parseInt(s.nils_made),
    totalTricksTaken: parseInt(s.total_tricks_taken),
    avgBid: totalRounds > 0 ? (parseInt(s.total_bid_sum) / totalRounds).toFixed(1) : '0',
  };
}
