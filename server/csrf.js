/**
 * CSRF protection setup (double-submit cookie).
 *
 * Shared by the server and its tests so the tests exercise the *same* cookie
 * options production runs with. The previous config was duplicated in the test
 * file with `signed: false` "for testability", which is exactly how a broken
 * `signed: true` reached production with a green test suite.
 *
 * The CSRF cookie must stay UNSIGNED. csrf-csrf v4 reads the token from
 * `req.cookies` only, while cookie-parser moves signed cookies into
 * `req.signedCookies` and deletes them from `req.cookies`. A signed cookie
 * therefore reads back as empty and every state-changing request fails with a
 * 403. Nothing is lost: the token is already an HMAC of the session id keyed
 * with SESSION_SECRET, so cookie signing adds no protection.
 */
import { doubleCsrf } from 'csrf-csrf';

export const CSRF_COOKIE_NAME = 'csrf';

export function createCsrf({ secret, secure }) {
  return doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (req) => req.session?.id || '',
    cookieName: CSRF_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
    },
    // v4 option name — v3's `getTokenFromRequest` is silently ignored.
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  });
}
