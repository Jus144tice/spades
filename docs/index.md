# Graham Spades

A multiplayer **Spades** card game, live at [grahamspades.com](https://grahamspades.com). Sign
in with Google, create or join a table by code, and play 3–8 players — with smart bot AI filling
any empty seats.

## Game modes

Spades adapts its teams to the table size:

| Players | Teams |
|---|---|
| 3 | 3 solo players |
| 4 | 2 teams of 2 (classic) |
| 5 | 2 teams of 2 + 1 spoiler (2× scoring) |
| 6 | 3 teams of 2 |
| 7 | 3 teams of 2 + 1 spoiler (2× scoring) |
| 8 | 4 teams of 2 (full double deck) |

Five- to eight-player modes use an extended deck with visually distinct **mega cards**.

## Playing

- **Lobby & rooms** — create a table, share its room code, or browse public rooms. Empty seats
  fill with bots, and game settings are configurable per room.
- **Real-time play** over Socket.io: bids, plays, tricks and scores update live for every seat,
  with a round-summary breakdown after each round.
- **Reconnection** — the game pauses and resumes if a player drops, and a returning player
  rejoins their seat.

## The bots

The bot AI bids realistically (ace/king counting, void ruffing, nil detection), remembers every
card played to identify master cards and voids, signals to its partner, and adjusts its
set/duck strategy as books run down — including nil protection and nil-busting tactics.

## Stats

Wins, losses, streaks and round history are tracked per player in PostgreSQL, with a leaderboard.

For how the pieces fit together, see [Architecture](architecture.md). The full developer setup
guide lives in the repository's `README.md`.
