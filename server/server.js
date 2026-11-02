'use strict';

/*
 * TS Solution website + admin panel server (Node.js, no external packages).
 *
 *   npm start               serve the site on http://localhost:3000
 *   npm run create-admin    create or reset an admin account
 *
 * Environment:
 *   PORT=3000  HOST=127.0.0.1  COOKIE_SECURE=1 (set when served over HTTPS)
 *   TRUST_PROXY=1 (behind a reverse proxy: use X-Forwarded-For / -Proto)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const auth = require('./auth');
const { ValidationError, FONT_PAIRS, SECTION_IDS, SECTION_KEYS, BRAND_THEME, describe } = require('./schema');
const { ICONS } = require('./icons');
const { render } = require('./render');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ROOT = store.ROOT;
const ADMIN_DIR = path.join(ROOT, 'admin');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/* ---------- helpers ---------- */
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
const isSecure = (req) => process.env.COOKIE_SECURE === '1' || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');

function baseHeaders(res, admin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', admin ? 'DENY' : 'SAMEORIGIN');
  if (admin) {
    res.setHeader('Content-Security-Policy', ADMIN_CSP);
    res.setHeader('Cache-Control', 'no-store');
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
const fail = (res, status, error, extra = {}) => sendJson(res, status, { error, ...extra });

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Request is too large.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 1024 * 1024) {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/json')) throw Object.assign(new Error('Expected JSON.'), { status: 415 });
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Malformed JSON.'), { status: 400 }); }
}

function serveFile(req, res, file, { cache = 'no-cache', admin = false } = {}) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return notFound(res, admin);
    const lastModified = stat.mtime.toUTCString();
    baseHeaders(res, admin);
    if (req.headers['if-modified-since'] === lastModified) { res.writeHead(304); return res.end(); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Last-Modified': lastModified,
      'Cache-Control': admin ? 'no-store' : cache,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function notFound(res, admin) {
  if (!res.headersSent) baseHeaders(res, admin);
  res.writeHead(404, { 'Content-Type': MIME['.txt'] });
  res.end('Not found');
}

/* Resolve a URL path inside a directory; refuse traversal and hidden files. */
function safeJoin(dir, urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const file = path.resolve(dir, '.' + path.posix.normalize('/' + decoded));
  if (file !== dir && !file.startsWith(dir + path.sep)) return null;
  if (path.relative(dir, file).split(path.sep).some((part) => part.startsWith('.'))) return null;
  return file;
}

/* ---------- previews of unsaved changes (kept 10 minutes) ---------- */
const previews = new Map();
setInterval(() => {
  for (const [id, p] of previews) if (Date.now() - p.created > 10 * 60 * 1000) previews.delete(id);
}, 60 * 1000).unref();

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  // Same-origin check for every state-changing request (defence in depth with SameSite + CSRF token)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.origin;
    let sameOrigin = true;
    if (origin) {
      try { sameOrigin = new URL(origin).host === req.headers.host; } catch { sameOrigin = false; }
    }
    if (!sameOrigin) return fail(res, 403, 'Cross-origin request blocked.');
  }

  /* --- public auth endpoints --- */
  if (route === 'POST /api/admin/login') {
    const ip = clientIp(req);
    const wait = auth.lockedFor(ip);
    if (wait) return fail(res, 429, `Too many failed attempts. Try again in ${Math.ceil(wait / 60000)} minute(s).`);
    if (!auth.hasAccounts()) return fail(res, 503, 'No admin account exists yet. Run "npm run create-admin" on the server first.');
    const body = await readJson(req, 4096);
    const username = auth.checkCredentials(body.username, body.password);
    if (!username) {
      auth.recordFailure(ip);
      return fail(res, 401, 'Incorrect username or password.');
    }
    auth.clearFailures(ip);
    const { token, session } = auth.createSession(username);
    res.setHeader('Set-Cookie', auth.sessionCookie(token, isSecure(req)));
    return sendJson(res, 200, { username, csrf: session.csrf });
  }

  const session = auth.getSession(req);
  if (route === 'GET /api/admin/session') {
    if (!session) return fail(res, 401, 'Not signed in.');
    return sendJson(res, 200, { username: session.username, csrf: session.csrf });
  }

  /* --- everything below requires a signed-in admin --- */
  if (!session) return fail(res, 401, 'Your session has expired. Please sign in again.');
  if (req.method !== 'GET' && !auth.checkCsrf(req, session)) return fail(res, 403, 'Security token missing or invalid. Reload the page and try again.');

  if (route === 'POST /api/admin/logout') {
    auth.destroySession(session.token);
    res.setHeader('Set-Cookie', auth.clearCookie(isSecure(req)));
    return sendJson(res, 200, { ok: true });
  }

  if (route === 'GET /api/admin/meta') {
    return sendJson(res, 200, {
      icons: Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, { label: v.label, svg: v.svg }])),
      fonts: Object.fromEntries(Object.entries(FONT_PAIRS).map(([k, v]) => [k, { label: v.label, head: v.head, body: v.body, url: v.url }])),
      sectionIds: SECTION_IDS, sectionKeys: SECTION_KEYS, brandTheme: BRAND_THEME, minPassword: auth.MIN_PASSWORD,
      rules: describe(),
    });
  }

  if (route === 'GET /api/admin/content') return sendJson(res, 200, store.getState());

  if (route === 'PUT /api/admin/content') {
    const body = await readJson(req);
    try {
      const state = await store.saveContent(body.content, { savedBy: session.username, baseVersion: body.baseVersion });
      return sendJson(res, 200, state);
    } catch (e) {
      if (e instanceof ValidationError) return fail(res, 422, e.message, { field: e.path });
      if (e instanceof store.ConflictError) return fail(res, 409, e.message);
      if (e instanceof store.MissingImageError) return fail(res, 422, e.message);
      throw e;
    }
  }

  if (route === 'POST /api/admin/preview') {
    const body = await readJson(req);
    try {
      const { validate } = require('./schema');
      const html = render(validate(body.content), { mediaInfo: store.mediaInfo })
        .replace('<head>', '<head>\n  <base href="/" />\n  <meta name="robots" content="noindex" />');
      const id = crypto.randomBytes(16).toString('hex');
      previews.set(id, { html, username: session.username, created: Date.now() });
      return sendJson(res, 200, { url: `/admin/preview/${id}` });
    } catch (e) {
      if (e instanceof ValidationError) return fail(res, 422, e.message, { field: e.path });
      throw e;
    }
  }

  if (route === 'GET /api/admin/media') return sendJson(res, 200, { items: store.listMedia() });

  if (route === 'POST /api/admin/media') {
    const body = await readJson(req, 8 * 1024 * 1024);
    const data = String(body.data || '').replace(/^data:[^;,]*;base64,/, '');
    if (!data || !/^[A-Za-z0-9+/=\s]+$/.test(data)) return fail(res, 400, 'No image data received.');
    try {
      return sendJson(res, 201, { item: store.saveUpload(String(body.name || ''), Buffer.from(data, 'base64')) });
    } catch (e) { return fail(res, 422, e.message); }
  }

  if (route === 'DELETE /api/admin/media') {
    const body = await readJson(req, 4096);
    try { await store.deleteUpload(String(body.path || '')); return sendJson(res, 200, { ok: true }); }
    catch (e) { return fail(res, e.status || 422, e.message); }
  }

  if (route === 'GET /api/admin/history') {
    const current = store.getState().version;
    return sendJson(res, 200, { items: store.historyList().map((h) => ({ ...h, current: h.version === current })) });
  }

  if (route === 'POST /api/admin/history/restore') {
    const body = await readJson(req, 4096);
    try { return sendJson(res, 200, await store.restoreVersion(String(body.id || ''), session.username)); }
    catch (e) {
      if (e instanceof ValidationError) return fail(res, 422, `That version can no longer be restored: ${e.message}`);
      return fail(res, 422, e.message);
    }
  }

  if (route === 'POST /api/admin/password') {
    const body = await readJson(req, 4096);
    if (!auth.checkCredentials(session.username, String(body.current || ''))) return fail(res, 403, 'Your current password is incorrect.', { field: 'current' });
    const problem = auth.passwordProblem(body.next, session.username);
    if (problem) return fail(res, 422, problem, { field: 'next' });
    auth.upsertAccount(session.username, body.next); // signs out every session of this user…
    const { token, session: fresh } = auth.createSession(session.username); // …then keep this one signed in
    res.setHeader('Set-Cookie', auth.sessionCookie(token, isSecure(req)));
    return sendJson(res, 200, { ok: true, csrf: fresh.csrf });
  }

  return fail(res, 404, 'Unknown API endpoint.');
}

/* ---------- routing ---------- */
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    baseHeaders(res, true);
    return handleApi(req, res, url);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  // Admin pages
  if (p === '/admin' || p === '/admin/') {
    if (!auth.getSession(req)) return redirect(res, '/admin/login');
    return serveFile(req, res, path.join(ADMIN_DIR, 'app.html'), { admin: true });
  }
  if (p === '/admin/login') {
    if (auth.getSession(req)) return redirect(res, '/admin');
    return serveFile(req, res, path.join(ADMIN_DIR, 'login.html'), { admin: true });
  }
  if (p.startsWith('/admin/static/')) {
    const file = safeJoin(path.join(ADMIN_DIR, 'static'), p.slice('/admin/static/'.length));
    return file ? serveFile(req, res, file, { admin: true }) : notFound(res, true);
  }
  if (p.startsWith('/admin/preview/')) {
    const s = auth.getSession(req);
    const preview = previews.get(p.slice('/admin/preview/'.length));
    if (!s || !preview || preview.username !== s.username) return notFound(res, true);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    return res.end(preview.html);
  }
  if (p.startsWith('/admin')) return notFound(res, true);

  // Public site: index.html and /assets only (data/, server/ etc. are never served)
  if (p === '/' || p === '/index.html') return serveFile(req, res, path.join(ROOT, 'index.html'));
  if (p.startsWith('/assets/')) {
    const file = safeJoin(path.join(ROOT, 'assets'), p.slice('/assets/'.length));
    if (!file || file.includes(`${path.sep}_originals${path.sep}`)) return notFound(res);
    return serveFile(req, res, file);
  }
  return notFound(res);
}

store.init();

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) fail(res, status, status === 500 ? 'Something went wrong on the server. Please try again.' : err.message);
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TS Solution site:  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/`);
  console.log(`Admin panel:       http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/admin`);
  if (!auth.hasAccounts()) console.log('No admin account yet — run "npm run create-admin" to create one.');
});
