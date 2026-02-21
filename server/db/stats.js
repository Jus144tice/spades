/**
 * Player stats computation and leaderboard queries.
 * Stats are updated incrementally inside the saveGameResults transaction.
 */

export async function updatePlayerStats(client, game, winningTeam) {
  const winTeamNum = winningTeam === 'team1' ? 1 : 2;

  for (const player of game.players) {
    // Only track stats for human players with accounts
    if (player.isBot || !player.userId) continue;

    const isWinner = player.team === winTeamNum;
    const teamKey = player.team === 1 ? 'team1' : 'team2';

    // Find partner (seat +2 mod 4)
    const partnerIndex = (player.seatIndex + 2) % 4;
    const partner = game.players[partnerIndex];

    let roundsPlayed = 0;
    let perfectBids = 0;
    let timesSet = 0;
    let totalTricks = 0;
    let totalBidSum = 0;
    let nilAttempts = 0;
    let nilsMade = 0;
    let blindNilAttempts = 0;
    let blindNilsMade = 0;
    let totalBags = 0;
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
      if (!round.moonshot && partner) {
        const partnerBid = round.bids[partner.id];
        const partnerTricks = round.tricksTaken[partner.id] || 0;

        if (partnerBid !== undefined) {
          // Identify nil vs non-nil for team
          const teamBids = [
            { id: player.id, bid, tricks, isNil: bid === 0 },
            { id: partner.id, bid: partnerBid, tricks: partnerTricks, isNil: partnerBid === 0 },
          ];

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

          // Bags (overtricks when bid is made)
          if (combinedBid > 0 && effectiveTricks >= combinedBid) {
            totalBags += effectiveTricks - combinedBid;
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
      totalBags,             // $14
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
    totalBags: s.total_bags,
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
      totalBags: 0, moonshotWins: 0, highestGameScore: 0,
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
    totalBags: s.total_bags,
    moonshotWins: s.moonshot_wins,
    highestGameScore: s.highest_game_score,
  };
}
