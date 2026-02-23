/**
 * Middleware & HTTP layer smoke tests.
 *
 * These tests verify that the security middleware stack (CSRF, rate limiting,
 * session, cookie parsing) can be assembled and works correctly. They build
 * a lightweight Express app with the same middleware config as production
 * (no database required).
 *
 * Added after a production outage caused by csrf-csrf v4 renaming
 * `generateToken` → `generateCsrfToken` — which our game-logic tests
 * couldn't catch.
 *
 * Run with: node --test server/tests/middleware.test.js
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { doubleCsrf } from 'csrf-csrf';
import { createServer } from 'http';

// ===== csrf-csrf API contract =====

describe('csrf-csrf API contract', () => {
  it('doubleCsrf returns generateCsrfToken and doubleCsrfProtection', () => {
    const result = doubleCsrf({
      getSecret: () => 'test-secret',
      getSessionIdentifier: (req) => req.session?.id || '',
      cookieName: 'csrf',
      cookieOptions: { httpOnly: true, sameSite: 'lax', secure: false, path: '/', signed: true },
      getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    });

    assert.equal(typeof result.generateCsrfToken, 'function', 'generateCsrfToken must be a function');
    assert.equal(typeof result.doubleCsrfProtection, 'function', 'doubleCsrfProtection must be a function');
  });

  it('doubleCsrf requires getSessionIdentifier', () => {
    // csrf-csrf v4 requires getSessionIdentifier — omitting it should throw or
    // produce a broken setup. We verify our config shape is accepted.
    const result = doubleCsrf({
      getSecret: () => 'test-secret',
      getSessionIdentifier: () => 'test-session',
      cookieName: 'csrf',
      cookieOptions: { httpOnly: true, sameSite: 'lax', secure: false, path: '/' },
      getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    });
    assert.ok(result.generateCsrfToken, 'should produce a token generator');
  });
});

// ===== Express middleware stack smoke test =====

describe('Middleware stack smoke test', () => {
  const SECRET = 'test-secret-for-middleware-tests';
  let app, server, baseUrl;

  // Build a minimal Express app with the same middleware as production
  const setup = () => {
    app = express();
    app.set('trust proxy', 1);

    app.use(session({
      secret: SECRET,
      resave: false,
      saveUninitialized: true, // true for testing (no real store)
      cookie: { secure: false },
    }));
    app.use(express.json());
    app.use(cookieParser(SECRET));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(limiter);

    const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
      getSecret: () => SECRET,
      getSessionIdentifier: (req) => req.session?.id || '',
      cookieName: 'csrf',
      cookieOptions: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        signed: false, // unsigned for testability with Node fetch
      },
      getTokenFromRequest: (req) => req.headers['x-csrf-token'],
    });
    app.use(doubleCsrfProtection);

    // Mimics /auth/me — the route that broke in production
    app.get('/auth/me', (req, res) => {
      const csrfToken = generateCsrfToken(req, res);
      res.json({ error: 'Not authenticated', csrfToken });
    });

    // A protected POST route (mimics /auth/logout)
    app.post('/protected', (req, res) => {
      res.json({ ok: true });
    });

    return new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  };

  after(() => {
    if (server) server.close();
  });

  it('GET /auth/me returns 200 with a CSRF token', async () => {
    await setup();

    const res = await fetch(`${baseUrl}/auth/me`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(body.csrfToken, 'response must include csrfToken');
    assert.equal(typeof body.csrfToken, 'string');
    assert.ok(body.csrfToken.length > 10, 'csrfToken must be a real token');
  });

  it('POST without CSRF token is rejected (403)', async () => {
    const res = await fetch(`${baseUrl}/protected`, { method: 'POST' });
    assert.equal(res.status, 403, 'POST without CSRF token should be 403');
  });

  it('POST with valid CSRF token succeeds', async () => {
    // Step 1: GET to obtain CSRF token + cookies
    const getRes = await fetch(`${baseUrl}/auth/me`);
    const setCookies = getRes.headers.getSetCookie();
    const { csrfToken } = await getRes.json();

    // Parse just name=value from each Set-Cookie header (strip attributes)
    const cookieHeader = setCookies
      .map(c => c.split(';')[0])
      .join('; ');

    // Step 2: POST with the token and cookies
    const postRes = await fetch(`${baseUrl}/protected`, {
      method: 'POST',
      headers: {
        'X-CSRF-Token': csrfToken,
        'Cookie': cookieHeader,
      },
    });
    assert.equal(postRes.status, 200, 'POST with valid CSRF token should succeed');
    const body = await postRes.json();
    assert.deepEqual(body, { ok: true });
  });

  it('rate limiter headers are present', async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    assert.ok(
      res.headers.get('ratelimit-limit') || res.headers.get('x-ratelimit-limit'),
      'rate limit headers should be present'
    );
  });
});

// ===== Package import smoke tests =====

describe('Security package imports', () => {
  it('express-rate-limit exports a function', () => {
    assert.equal(typeof rateLimit, 'function');
  });

  it('cookie-parser exports a function', () => {
    assert.equal(typeof cookieParser, 'function');
  });

  it('csrf-csrf exports doubleCsrf', () => {
    assert.equal(typeof doubleCsrf, 'function');
  });

  it('express-session exports a function', () => {
    assert.equal(typeof session, 'function');
  });
});
