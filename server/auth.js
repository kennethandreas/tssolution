'use strict';

/*
 * Admin authentication.
 *  - Accounts live in data/admin.json (never served), passwords hashed with scrypt.
 *  - Sessions are random 256-bit tokens kept in server memory, sent as an
 *    HttpOnly + SameSite=Strict cookie. Restarting the server signs everyone out.
 *  - Each session has a CSRF token that must accompany every state-changing request.
 *  - Repeated failed logins from one IP are locked out for 15 minutes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ADMIN_FILE = path.join(__dirname, '..', 'data', 'admin.json');
const COOKIE = 'tss_admin';
const IDLE_MS = 2 * 60 * 60 * 1000;     // sign out after 2 h without activity
const ABSOLUTE_MS = 12 * 60 * 60 * 1000; // and after 12 h regardless
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_PASSWORD = 10;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* ---------- accounts ---------- */
function readAccounts() {
  try { return JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8')).users || []; } catch { return []; }
}
function writeAccounts(users) {
  const tmp = `${ADMIN_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ADMIN_FILE);
}
const hasAccounts = () => readAccounts().length > 0;

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function passwordProblem(password, username) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return 'Password is too long.';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'Password must not contain the username.';
  return null;
}

function upsertAccount(username, password) {
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(username || '')) throw new Error('Username must be 3–40 characters: letters, numbers, . _ -');
  const problem = passwordProblem(password, username);
  if (problem) throw new Error(problem);
  const users = readAccounts();
  const existing = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  const record = { username, ...hashPassword(password), passwordChangedAt: new Date().toISOString() };
  if (existing) Object.assign(existing, record);
  else users.push({ ...record, createdAt: record.passwordChangedAt });
  writeAccounts(users);
  revokeSessions(username);
  return Boolean(existing);
}

// constant-ish time: always run scrypt, even for unknown users
const DUMMY = hashPassword('dummy-password-for-timing');
function checkCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 200) return null;
  const user = readAccounts().find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
  const rec = user || DUMMY;
  const computed = crypto.scryptSync(password, Buffer.from(rec.salt, 'hex'), 64, SCRYPT);
  const ok = crypto.timingSafeEqual(computed, Buffer.from(rec.hash, 'hex'));
  return ok && user ? user.username : null;
}

/* ---------- login throttling ---------- */
const attempts = new Map(); // ip -> { fails, first, lockedUntil }
function lockedFor(ip) {
  const a = attempts.get(ip);
  if (!a) return 0;
  if (a.lockedUntil && a.lockedUntil > Date.now()) return a.lockedUntil - Date.now();
  if (Date.now() - a.first > LOCK_MS) attempts.delete(ip);
  return 0;
}
function recordFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { fails: 0, first: now };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) { a.lockedUntil = now + LOCK_MS; a.fails = 0; a.first = now; }
  attempts.set(ip, a);
}
const clearFailures = (ip) => attempts.delete(ip);

/* ---------- sessions ---------- */
const sessions = new Map(); // token -> { username, csrf, created, lastSeen }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const session = { username, csrf: crypto.randomBytes(24).toString('hex'), created: now, lastSeen: now };
  sessions.set(token, session);
  return { token, session };
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const s = sessions.get(token);
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastSeen > IDLE_MS || now - s.created > ABSOLUTE_MS) { sessions.delete(token); return null; }
  // the account may have been removed or its password reset from the CLI
  if (!readAccounts().some((u) => u.username === s.username)) { sessions.delete(token); return null; }
  s.lastSeen = now;
  return { token, ...s };
}

function destroySession(token) { sessions.delete(token); }

function revokeSessions(username, exceptToken) {
  for (const [token, s] of sessions) {
    if (s.username.toLowerCase() === username.toLowerCase() && token !== exceptToken) sessions.delete(token);
  }
}

function checkCsrf(req, session) {
  const sent = req.headers['x-csrf-token'];
  if (typeof sent !== 'string' || sent.length !== session.csrf.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(session.csrf));
}

function sessionCookie(token, secure, maxAgeSec = ABSOLUTE_MS / 1000) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}
const clearCookie = (secure) => sessionCookie('', secure, 0);

// prune expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (now - s.lastSeen > IDLE_MS || now - s.created > ABSOLUTE_MS) sessions.delete(t);
}, 10 * 60 * 1000).unref();

module.exports = {
  hasAccounts, upsertAccount, readAccounts, checkCredentials, passwordProblem,
  lockedFor, recordFailure, clearFailures,
  createSession, getSession, destroySession, revokeSessions, checkCsrf,
  sessionCookie, clearCookie, MIN_PASSWORD,
};
