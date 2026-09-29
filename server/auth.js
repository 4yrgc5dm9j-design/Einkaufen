import crypto from 'node:crypto';
import { db, plain } from './db.js';
import { config } from './config.js';

const COOKIE = 'alltag_sid';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const maxAge = config.sessionDays * 24 * 3600 * 1000;
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + maxAge);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge, path: '/' });
}

export function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function userFromRequest(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const row = db
    .prepare(`SELECT u.id, u.email, u.name, u.color, u.bundesland, u.household_id, s.expires_at
              FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`)
    .get(sha256(token));
  if (!row || row.expires_at < Date.now()) return null;
  const { expires_at, ...user } = plain(row);
  return user;
}

/** Middleware: requires a logged-in user and exposes it as req.user. */
export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Bitte melde dich an.' });
  req.user = user;
  next();
}

/** Very small in-memory rate limiter for login/registration attempts. */
const attempts = new Map();
export function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = `${req.path}:${req.ip}`;
    const now = Date.now();
    const entry = attempts.get(key) || { count: 0, reset: now + windowMs };
    if (entry.reset < now) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    attempts.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'Zu viele Versuche. Bitte warte kurz.' });
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.reset < now) attempts.delete(key);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}, 10 * 60 * 1000).unref();
