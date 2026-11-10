'use strict';

/*
 * File-based persistence:
 *   data/content.json   current content (plain JSON, safe to back up / version)
 *   data/history/*.json previous versions (newest 30 kept) for one-click restore
 *   index.html          public page, regenerated from content on every save
 *   assets/uploads/     images uploaded through the admin panel
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validate } = require('./schema');
const { render } = require('./render');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const INDEX_FILE = path.join(ROOT, 'index.html');
const IMG_DIR = path.join(ROOT, 'assets', 'img');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');
const HISTORY_KEEP = 30;

fs.mkdirSync(HISTORY_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- helpers ---------- */
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// serialise writes so two saves can never interleave
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

/* ---------- image dimensions (PNG / JPEG / WebP) ---------- */
function imageInfo(buf) {
  if (buf.length < 30) return null;
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { type: 'png', ext: '.png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: walk segments until a start-of-frame marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', ext: '.jpg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    return null;
  }
  // WebP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { type: 'webp', ext: '.webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.subarray(21, 25);
      return { type: 'webp', ext: '.webp', width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { type: 'webp', ext: '.webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

/* ---------- media library ---------- */
let mediaCache = null;

function scanMedia() {
  const out = new Map();
  for (const [dir, rel, deletable] of [[IMG_DIR, 'assets/img', false], [UPLOAD_DIR, 'assets/uploads', true]]) {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      if (!stat.isFile()) continue;
      const fd = fs.openSync(file, 'r');
      const head = Buffer.alloc(Math.min(stat.size, 65536));
      fs.readSync(fd, head, 0, head.length, 0);
      fs.closeSync(fd);
      const info = imageInfo(head);
      out.set(`${rel}/${name}`, {
        path: `${rel}/${name}`, name, size: stat.size, modified: stat.mtimeMs, deletable,
        width: info ? info.width : null, height: info ? info.height : null,
      });
    }
  }
  mediaCache = out;
  return out;
}

const media = () => mediaCache || scanMedia();
const mediaInfo = (p) => {
  const m = media().get(p);
  return m && m.width ? { width: m.width, height: m.height } : null;
};

/* All image paths referenced anywhere in the content */
function imagePaths(content) {
  const found = new Set();
  (function walk(v) {
    if (typeof v === 'string') { if (/^assets\/(img|uploads)\//.test(v)) found.add(v); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(content);
  return found;
}

/* ---------- content ---------- */
function readContentFile() {
  const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
  return { raw, content: JSON.parse(raw) };
}

function historyList() {
  return fs.readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort().reverse()
    .map((f) => {
      try {
        const h = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
        return { id: f.replace(/\.json$/, ''), savedAt: h.savedAt, savedBy: h.savedBy, note: h.note || '', version: h.version };
      } catch { return null; }
    })
    .filter(Boolean);
}

function getState() {
  const { raw, content } = readContentFile();
  const version = hash(raw);
  const latest = historyList().find((h) => h.version === version);
  return { content, version, updatedAt: latest ? latest.savedAt : null, updatedBy: latest ? latest.savedBy : null };
}

function publish(content) {
  writeAtomic(INDEX_FILE, render(content, { mediaInfo }));
}

function addHistory(content, raw, savedBy, note) {
  const savedAt = new Date().toISOString();
  const id = `${savedAt.replace(/[:.]/g, '-')}_${crypto.randomBytes(3).toString('hex')}`;
  writeAtomic(path.join(HISTORY_DIR, `${id}.json`), JSON.stringify({ savedAt, savedBy, note, version: hash(raw), content }, null, 2));
  const files = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith('.json')).sort();
  files.slice(0, Math.max(0, files.length - HISTORY_KEEP)).forEach((f) => fs.unlinkSync(path.join(HISTORY_DIR, f)));
}

class ConflictError extends Error {}
class MissingImageError extends Error {}

/* Validate, store, regenerate index.html, record history. */
function saveContent(input, { savedBy, baseVersion, note = '' }) {
  return serial(() => {
    const current = getState();
    if (baseVersion && baseVersion !== current.version) {
      throw new ConflictError('The content was changed somewhere else since you opened it. Reload to get the latest version, then re-apply your edits.');
    }
    const content = validate(input);
    scanMedia();
    const missing = [...imagePaths(content)].filter((p) => !media().has(p));
    if (missing.length) throw new MissingImageError(`Image not found in the media library: ${missing.join(', ')}`);

    const raw = JSON.stringify(content, null, 2) + '\n';
    writeAtomic(CONTENT_FILE, raw);
    publish(content);
    addHistory(content, raw, savedBy, note);
    return getState();
  });
}

function restoreVersion(id, savedBy) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid version id');
  const file = path.join(HISTORY_DIR, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error('That version no longer exists');
  const h = JSON.parse(fs.readFileSync(file, 'utf8'));
  const when = new Date(h.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return saveContent(h.content, { savedBy, note: `Restored version from ${when}` });
}

/* Startup: make sure content is valid, index.html is current and history has a starting point. */
function init() {
  const { raw, content } = readContentFile();
  const valid = validate(content);
  scanMedia();
  publish(valid);
  if (!historyList().length) addHistory(valid, raw, 'system', 'Initial content');
}

/* ---------- uploads ---------- */
const MAX_UPLOAD = 5 * 1024 * 1024;

function saveUpload(originalName, buffer) {
  if (buffer.length > MAX_UPLOAD) throw new Error('Image is larger than 5 MB. Please resize or compress it first.');
  const info = imageInfo(buffer);
  if (!info || !info.width || !info.height) throw new Error('Only PNG, JPEG and WebP images are supported.');
  if (info.width > 6000 || info.height > 6000) throw new Error('Image dimensions are too large (max 6000 × 6000 px).');
  const base = String(originalName || 'image')
    .replace(/\.[^.]*$/, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
  const name = `${base}-${crypto.randomBytes(3).toString('hex')}${info.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer, { flag: 'wx' });
  scanMedia();
  return media().get(`assets/uploads/${name}`);
}

function deleteUpload(p) {
  return serial(() => {
    const item = scanMedia().get(p);
    if (!item || !item.deletable) throw new Error('Only images uploaded through the admin panel can be deleted.');
    if (imagePaths(getState().content).has(p)) {
      const err = new Error('This image is still used on the website. Replace it everywhere first, then delete it.');
      err.status = 409;
      throw err;
    }
    fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(p)));
    scanMedia();
  });
}

function listMedia() {
  const used = imagePaths(getState().content);
  return [...scanMedia().values()]
    .map((m) => ({ ...m, inUse: used.has(m.path) }))
    .sort((a, b) => (b.deletable - a.deletable) || b.modified - a.modified);
}

module.exports = {
  ROOT, DATA_DIR, init, getState, saveContent, restoreVersion, historyList,
  saveUpload, deleteUpload, listMedia, mediaInfo, imageInfo, ConflictError, MissingImageError,
};
