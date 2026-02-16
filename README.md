# Spades

A multiplayer Spades card game with Google OAuth login, real-time gameplay via Socket.io, and smart bot AI opponents.

## Features

- **Real-time multiplayer** via Socket.io (1-4 human players, bots fill remaining seats)
- **Google OAuth** login (required to play)
- **Smart bot AI** with:
  - Realistic bidding (ace/king counting, void ruffing, nil detection)
  - Card memory (tracks all played cards, identifies master cards and voids)
  - Dynamic set/duck disposition (adjusts strategy based on books remaining)
  - Partner signaling (reads and sends card signals to coordinate play)
  - Nil protection and nil busting tactics
  - Trick consolidation (dumps inevitable winners on partner's tricks to minimize bags)
- **Game stats** tracked in PostgreSQL (wins, losses, round history)
- **Round summary modal** with score breakdown after each round
- **Lobby system** with shareable room codes

## Tech Stack

- **Server:** Node.js, Express, Socket.io, Passport (Google OAuth), PostgreSQL
- **Client:** React 18, Vite, Socket.io Client
- **Database:** PostgreSQL with connect-pg-simple for sessions

## Prerequisites

- Node.js 18+
- PostgreSQL running locally (or remote connection string)
- Google OAuth credentials (Client ID and Secret)

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/Jus144tice/spades.git
cd spades
npm install
cd client && npm install && cd ..
```

### 2. Set up PostgreSQL

Create a database:

```bash
psql -U postgres -c "CREATE DATABASE spades;"
```

The schema is auto-created on first server start (via `server/db/index.js`), or you can run it manually:

```bash
psql -U postgres -d spades -f server/db/schema.sql
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/spades
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SESSION_SECRET=any-random-string-here
```

### 4. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (local dev)
   - `https://yourdomain.com/auth/google/callback` (production)
4. Copy the Client ID and Secret into your `.env`

### 5. Run in development

```bash
npm run dev
```

This starts both the Express server (port 3001) and Vite dev server (port 3000) concurrently. Open `http://localhost:3000` in your browser.

### 6. Run in production

Build the client and serve everything from Express:

```bash
npm run build
npm start
```

The server runs on port 3001 and serves the built client from `client/dist/`.

## Testing with ngrok

To let others play from different machines:

```bash
ngrok http 3000
```

Add the ngrok URL as an authorized redirect URI in Google Cloud Console:

```
https://your-ngrok-subdomain.ngrok-free.dev/auth/google/callback
```

The app automatically handles dynamic hosts via proxy trust and relative callback URLs.

## Project Structure

```
spades/
  client/                  # React frontend (Vite)
    src/
      components/          # Game UI components (Hand, Scoreboard, etc.)
      context/             # React contexts (GameContext, SocketContext, AuthContext)
      screens/             # JoinScreen, GameScreen
  server/
    index.js               # Express server, Passport auth, session setup
    socketHandlers.js       # Socket.io game event handlers
    botAI.js                # Bot AI (bidding, card play, signaling)
    game/
      GameState.js          # Core game state machine
      deck.js               # Deck creation, shuffle, deal
      tricks.js             # Trick validation and winner determination
      scoring.js            # Round scoring (bids, bags, nil bonuses)
      constants.js          # Card rank values
    db/
      index.js              # PostgreSQL pool and schema init
      schema.sql            # Database schema
  .env                      # Environment variables (not committed)
```

## Game Rules

Standard partnership Spades:
- 4 players in 2 teams (seats 0+2 vs 1+3)
- 13 tricks per round, spades are trump
- Bid 0 = Nil (bonus/penalty of 100 points)
- Making your bid: bid x 10 points + 1 per overtrick (bag)
- Missing your bid: -(bid x 10) points
- 10 accumulated bags = -100 penalty
- 10+ tricks in a round with a non-nil bid = +50 bonus
- First team to 500 wins
