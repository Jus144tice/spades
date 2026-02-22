# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@spades-game.dev** (or open a [private security advisory](https://github.com/Jus144tice/spades/security/advisories/new) on this repository).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to expect

- **Acknowledgment** within 48 hours
- **Assessment** within 1 week
- **Fix or mitigation** as soon as practical, depending on severity

### Scope

The following are in scope:

- Server-side game logic and socket handlers
- Authentication and session management
- Database queries and data handling
- Client-side code that could enable cheating or data exposure

The following are out of scope:

- Issues in third-party dependencies (report these upstream, though we appreciate a heads-up)
- Denial of service via normal game mechanics (e.g., creating many rooms)
- Social engineering

## Security Best Practices

This project follows these security practices:

- **Server-authoritative game logic** — all moves validated server-side
- **Parameterized database queries** — no raw SQL interpolation
- **Session-based authentication** — via Passport.js with Google OAuth
- **Input validation** — all socket event payloads validated and sanitized
- **Dependency monitoring** — Dependabot enabled for automated vulnerability alerts
