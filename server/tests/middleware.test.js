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
 * These tests import the real CSRF setup from server/csrf.js rather than
 * re-declaring it. An earlier version of this file duplicated the config with
 * `signed: false` "for testability" while production ran `signed: true`, so the
 * suite stayed green through a second outage in which every PUT/POST 403'd.
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
import { readFileSync } from 'fs';
import { createCsrf, CSRF_COOKIE_NAME } from '../csrf.js';

// ===== csrf-csrf API contract =====

describe('csrf-csrf API contract', () => {
  it('createCsrf returns generateCsrfToken and doubleCsrfProtection', () => {
    const result = createCsrf({ secret: 'test-secret', secure: false });

    assert.equal(typeof result.generateCsrfToken, 'function', 'generateCsrfToken must be a function');
    assert.equal(typeof result.doubleCsrfProtection, 'function', 'doubleCsrfProtection must be a function');
  });

  it('reads the token using the v4 option name', () => {
    // v4 renamed `getTokenFromRequest` → `getCsrfTokenFromRequest`. The old name
    // is silently ignored, so a config using it only works by accident (the v4
    // default happens to read the same header). Assert we pass the live name.
    const source = readFileSync(new URL('../csrf.js', import.meta.url), 'utf8');
    assert.match(source, /getCsrfTokenFromRequest\s*:/, 'must use the v4 option name');
    assert.doesNotMatch(source, /[^s]getTokenFromRequest\s*:/, 'must not use the removed v3 option name');
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
      cookie: { secure: process.env.NODE_ENV === 'production' },
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

    // The real production CSRF setup — only `secure` is relaxed so the cookie
    // survives plain HTTP in tests. Everything else is what the server runs.
    const { generateCsrfToken, doubleCsrfProtection } = createCsrf({
      secret: SECRET,
      secure: false,
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

    // A protected PUT route (mimics /api/preferences)
    app.put('/protected', (req, res) => {
      res.json({ ok: true });
    });

    // Match production's clean-403 handler
    app.use((err, req, res, next) => {
      if (err.code === 'EBADCSRFTOKEN' || err.message === 'invalid csrf token') {
        return res.status(403).json({ error: 'Invalid or missing CSRF token' });
      }
      next(err);
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

  it('PUT with valid CSRF token succeeds (mimics /api/preferences)', async () => {
    // Regression: saving preferences 403'd in production for every logged-in
    // user because the CSRF cookie was signed and read back empty.
    const getRes = await fetch(`${baseUrl}/auth/me`);
    const { csrfToken } = await getRes.json();
    const cookieHeader = getRes.headers.getSetCookie()
      .map(c => c.split(';')[0])
      .join('; ');

    const putRes = await fetch(`${baseUrl}/protected`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({ tableColor: '#0f1923' }),
    });
    assert.equal(putRes.status, 200, 'PUT with valid CSRF token should succeed');
  });

  it('CSRF cookie is unsigned so csrf-csrf can read it back', async () => {
    // csrf-csrf v4 reads the token from `req.cookies` only. cookie-parser moves
    // signed cookies into `req.signedCookies` and DELETES them from
    // `req.cookies`, so a signed cookie reads back as '' and every
    // state-changing request 403s. The cookie must not carry the 's:' prefix.
    const res = await fetch(`${baseUrl}/auth/me`);
    const { csrfToken } = await res.json();

    const csrfCookie = res.headers.getSetCookie()
      .find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    assert.ok(csrfCookie, 'a CSRF cookie must be set');

    const value = decodeURIComponent(csrfCookie.split(';')[0].split('=')[1]);
    assert.ok(!value.startsWith('s:'), 'CSRF cookie must not be signed');
    assert.equal(value, csrfToken, 'cookie value must match the token handed to the client');
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
