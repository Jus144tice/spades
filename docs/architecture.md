# Architecture

Graham Spades is an Express + Socket.io backend behind a React/Vite single-page app, backed by
PostgreSQL.

## Stack

- **Server** — Node.js, Express, Socket.io, Passport (Google OAuth), PostgreSQL.
- **Client** — React 18, Vite, Socket.io client.
- **Sessions** — `express-session` cookies stored in PostgreSQL via `connect-pg-simple`.

In production Express serves the built client from `client/dist/` and the realtime game over the
same origin. In development Vite (port 3000) proxies `/auth`, `/api` and `/socket.io` to Express
(port 3001).

## Realtime game — Socket.io

Game state is authoritative on the server and pushed **per player**, so a hand is only ever sent
to the seat that holds it. The server emits events such as `game_state`, `card_played`,
`trick_won`, `round_scored` and `game_over`; the client sends actions as Socket.io events —
`place_bid`, `play_card`, `create_lobby`, `join_lobby` (a room code), and the rest. Live lobby
and in-progress game state lives in memory (`server/lobby.js`, `server/game/`); only finished
games and aggregate stats are persisted.

## HTTP surface

A small REST surface sits alongside the socket:

- `/auth/*` — Google sign-in (`/auth/google` and its callback), `/auth/me` (the current user;
  also issues a CSRF token), and `/auth/logout`.
- `/api/*` — preferences (read/write), player stats and leaderboards (overall and per game
  mode), and `/api/health`.

Mutating HTTP requests carry an `x-csrf-token` header (a double-submit cookie). There is no
published OpenAPI document; the contract is the source.

## Persistence

PostgreSQL via the `pg` driver with raw SQL. The schema (`server/db/schema.sql`) is auto-created
on first start and covers accounts, sessions, games, rounds, bids, team scores and player stats.
