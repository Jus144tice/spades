-- Session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  preferences JSONB DEFAULT '{}' NOT NULL
);

-- Add preferences column if missing (for existing databases)
DO $$ BEGIN
  ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}' NOT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  winning_team SMALLINT, -- 1, 2, 3, or 4
  game_mode SMALLINT DEFAULT 4 -- player count (3-8)
);

-- Add game_mode column if missing (for existing databases)
DO $$ BEGIN
  ALTER TABLE games ADD COLUMN game_mode SMALLINT DEFAULT 4;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add game settings columns if missing (for existing databases)
DO $$ BEGIN
  ALTER TABLE games ADD COLUMN win_target SMALLINT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE games ADD COLUMN book_threshold SMALLINT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE games ADD COLUMN blind_nil BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE games ADD COLUMN moonshot BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE games ADD COLUMN ten_bid_bonus BOOLEAN DEFAULT TRUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_games_mode ON games(game_mode);

-- Game players (links users to games)
CREATE TABLE IF NOT EXISTS game_players (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- null for bots
  team SMALLINT NOT NULL, -- 1 or 2
  seat_index SMALLINT NOT NULL,
  bot_name VARCHAR(50), -- non-null for bots
  is_winner BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);

-- Game rounds
CREATE TABLE IF NOT EXISTS game_rounds (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL,
  team1_round_score INTEGER NOT NULL,
  team2_round_score INTEGER NOT NULL,
  team1_total INTEGER NOT NULL,
  team2_total INTEGER NOT NULL,
  team1_bags SMALLINT DEFAULT 0,
  team2_bags SMALLINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_game_rounds_game ON game_rounds(game_id);

-- Round bids (per-player bids and tricks taken each round)
CREATE TABLE IF NOT EXISTS round_bids (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  bot_name VARCHAR(50),
  bid SMALLINT NOT NULL,
  tricks_taken SMALLINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_round_bids_game ON round_bids(game_id);
CREATE INDEX IF NOT EXISTS idx_round_bids_user ON round_bids(user_id);

-- Team round scores (normalized, supports N teams)
CREATE TABLE IF NOT EXISTS team_round_scores (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number SMALLINT NOT NULL,
  team_number SMALLINT NOT NULL,
  round_score INTEGER NOT NULL,
  total_score INTEGER NOT NULL,
  bags SMALLINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_team_round_scores_game ON team_round_scores(game_id);

-- One-time migration: clear old game data when player_stats doesn't exist yet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'player_stats') THEN
    TRUNCATE games, game_players, game_rounds, round_bids CASCADE;
    RAISE NOTICE 'Cleared old game data for stats migration';
  END IF;
END $$;

-- Player stats (denormalized, updated incrementally at game end)
CREATE TABLE IF NOT EXISTS player_stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  current_win_streak INTEGER DEFAULT 0,
  best_win_streak INTEGER DEFAULT 0,
  total_rounds INTEGER DEFAULT 0,
  perfect_bids INTEGER DEFAULT 0,
  times_set INTEGER DEFAULT 0,
  total_tricks_taken INTEGER DEFAULT 0,
  total_bid_sum INTEGER DEFAULT 0,
  nil_attempts INTEGER DEFAULT 0,
  nils_made INTEGER DEFAULT 0,
  blind_nil_attempts INTEGER DEFAULT 0,
  blind_nils_made INTEGER DEFAULT 0,
  total_bags INTEGER DEFAULT 0,
  moonshot_wins INTEGER DEFAULT 0,
  highest_game_score INTEGER DEFAULT 0,
  last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
