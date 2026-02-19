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
import { validatePreferences, mergeWithDefaults, hasCompletedSetup, PRESETS, TABLE_COLORS } from './game/preferences.js';

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

    // Upsert user
    const result = await pool.query(
      `INSERT INTO users (google_id, display_name, avatar_url, last_login)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (google_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         last_login = NOW()
       RETURNING *`,
      [googleId, displayName, avatarUrl]
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
      res.clearCookie('connect.sid');
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

// --- Stats API ---
app.get('/api/stats/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid userId' });

    const result = await pool.query(`
      SELECT
        COUNT(*) AS games_played,
        COUNT(*) FILTER (WHERE gp.is_winner = true) AS games_won,
        COUNT(*) FILTER (WHERE gp.is_winner = false) AS games_lost
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = $1 AND g.ended_at IS NOT NULL
    `, [userId]);

    const stats = result.rows[0];
    res.json({
      gamesPlayed: parseInt(stats.games_played),
      gamesWon: parseInt(stats.games_won),
      gamesLost: parseInt(stats.games_lost),
    });
  } catch (err) {
    console.error('Stats query error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
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
  server.listen(PORT, () => {
    console.log(`Spades server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
