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
  last_login TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  winning_team SMALLINT -- 1 or 2
);

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
