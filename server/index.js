import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool, { initDB } from './db/index.js';
import { registerHandlers } from './socketHandlers.js';
import { validatePreferences, mergeWithDefaults, hasCompletedSetup, PRESETS, TABLE_COLORS, DEFAULTS } from './game/preferences.js';
import { getPlayerStats, getLeaderboard, getModeLeaderboard, getPlayerModeStats } from './db/stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const server = createServer(app);

// --- Session setup ---
const PgSession = connectPgSimple(session);
const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'spades.sid',
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },

});

app.use(sessionMiddleware);
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

// --- Passport Google OAuth ---
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
  proxy: true,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const googleId = profile.id;
    const displayName = profile.displayName || profile.emails?.[0]?.value || 'Player';
    const avatarUrl = profile.photos?.[0]?.value || null;

    // Upsert user — new users get default preferences
    const result = await pool.query(
      `INSERT INTO users (google_id, display_name, avatar_url, last_login, preferences)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (google_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         last_login = NOW()
       RETURNING *`,
      [googleId, displayName, avatarUrl, JSON.stringify(DEFAULTS)]
    );

    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0] || null);
  } catch (err) {
    done(err);
  }
});

// --- Auth routes ---
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('/');
  }
);

app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    const prefs = req.user.preferences || {};
    res.json({
      id: req.user.id,
      displayName: req.user.display_name,
      avatarUrl: req.user.avatar_url,
      preferences: mergeWithDefaults(prefs),
      hasCompletedSetup: hasCompletedSetup(prefs),
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    req.session.destroy(() => {
      res.clearCookie('spades.sid');
      res.json({ ok: true });
    });
  });
});

// --- Preferences API ---
app.get('/api/preferences', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  const prefs = mergeWithDefaults(req.user.preferences || {});
  res.json({ preferences: prefs, presets: PRESETS, tableColors: TABLE_COLORS });
});

app.put('/api/preferences', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const validated = validatePreferences(req.body);
    const merged = mergeWithDefaults({ ...(req.user.preferences || {}), ...validated });

    await pool.query(
      'UPDATE users SET preferences = $1 WHERE id = $2',
      [JSON.stringify(merged), req.user.id]
    );

    // Update session so subsequent requests see new prefs
    req.user.preferences = merged;

    res.json({ preferences: merged });
  } catch (err) {
    console.error('Failed to update preferences:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// --- Stats & Leaderboard API ---
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });
    const stats = await getPlayerStats(pool, userId);
    res.json(stats);
  } catch (err) {
    console.error('Stats query error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const sortBy = req.query.sort || 'games_won';
    const rows = await getLeaderboard(pool, sortBy);
    res.json(rows);
  } catch (err) {
    console.error('Leaderboard query error:', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.get('/api/leaderboard/mode/:gameMode', async (req, res) => {
  try {
    const gameMode = parseInt(req.params.gameMode, 10);
    if (![3, 4, 5, 6, 7, 8].includes(gameMode)) {
      return res.status(400).json({ error: 'Invalid game mode' });
    }
    const result = await getModeLeaderboard(pool, {
      gameMode,
      sortBy: req.query.sort || 'games_won',
      blindNil: req.query.blindNil || 'any',
      moonshot: req.query.moonshot || 'any',
      tenBidBonus: req.query.tenBidBonus || 'any',
      minGames: parseInt(req.query.minGames, 10) || 1,
    });
    res.json(result);
  } catch (err) {
    console.error('Mode leaderboard query error:', err);
    res.status(500).json({ error: 'Failed to fetch mode leaderboard' });
  }
});

app.get('/api/stats/:userId/mode/:gameMode', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const gameMode = parseInt(req.params.gameMode, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });
    if (![3, 4, 5, 6, 7, 8].includes(gameMode)) {
      return res.status(400).json({ error: 'Invalid game mode' });
    }
    const stats = await getPlayerModeStats(pool, userId, {
      gameMode,
      blindNil: req.query.blindNil || 'any',
      moonshot: req.query.moonshot || 'any',
      tenBidBonus: req.query.tenBidBonus || 'any',
    });
    res.json(stats || {
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0, winRate: 0,
      totalRounds: 0, perfectBids: 0, bidAccuracy: 0,
      nilAttempts: 0, nilsMade: 0, totalTricksTaken: 0, avgBid: '0',
    });
  } catch (err) {
    console.error('Mode stats query error:', err);
    res.status(500).json({ error: 'Failed to fetch mode stats' });
  }
});

// --- Socket.io ---
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Share session with Socket.io
io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
  // Extract user from session
  const user = socket.request.session?.passport?.user;
  if (user) {
    // Deserialize user id is stored in session; attach it to socket
    socket.userId = user; // This is the serialized user id (integer)
  }
  console.log(`Player connected: ${socket.id} (userId: ${socket.userId || 'guest'})`);
  registerHandlers(io, socket);
});

// Serve built client in production
app.use(express.static(join(__dirname, '..', 'client', 'dist')));

app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// --- Start ---
const PORT = process.env.PORT || 3001;

async function start() {
  await initDB();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is in use. Killing the old process...`);
      import('child_process').then(({ execSync }) => {
        try {
          // Find and kill the process on the port (Windows)
          const result = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf-8' });
          const pid = result.trim().split(/\s+/).pop();
          if (pid && pid !== '0') {
            execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8' });
            console.log(`Killed PID ${pid}. Retrying...`);
            setTimeout(() => server.listen(PORT), 1000);
          }
        } catch {
          console.error(`Could not free port ${PORT}. Kill the process manually.`);
          process.exit(1);
        }
      });
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Spades server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
