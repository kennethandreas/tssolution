'use strict';

/*
 * Builds the upload package for Apache/cPanel hosting (PHP backend):
 *
 *   npm run build:cpanel
 *
 * Output (deploy/cpanel/, git-ignored):
 *   public_html/              exactly what goes into the hosting's public_html folder
 *   tssolution-cpanel.zip     the same files zipped (upload + "Extract" in cPanel File Manager)
 *   SETUP-TOKEN.txt           one-time token for https://<domain>/admin/setup — keep it private
 *
 * Nothing on the server is touched; this only writes inside deploy/cpanel/.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { validate, describe, SCHEMA, PATTERNS, SECTION_KEYS, SECTION_IDS, FONT_PAIRS, BRAND_THEME } = require('../server/schema');
const { ICONS } = require('../server/icons');
const { render } = require('../server/render');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'deploy', 'cpanel');
const PUB = path.join(OUT, 'public_html');

/* ---------- helpers ---------- */
function copyDir(src, dest, skip = () => false) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (skip(from, entry)) continue;
    if (entry.isDirectory()) copyDir(from, to, skip);
    else fs.copyFileSync(from, to);
  }
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

// RegExp → { source, flags } so PHP can rebuild the same pattern
const toJson = (value) => JSON.parse(JSON.stringify(value, (k, v) => (v instanceof RegExp ? { source: v.source, flags: v.flags } : v)));

/* ---------- minimal ZIP writer (deflate), no dependencies ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function writeZip(zipPath, baseDir, files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const name of files) {
    const data = fs.readFileSync(path.join(baseDir, name));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so permissions below are honoured
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...parts, cdBuf, end]));
}

/* ---------- build ---------- */
function build() {
  // safety: only ever clear our own output folder
  if (!OUT.startsWith(path.join(ROOT, 'deploy'))) throw new Error('Unexpected output path');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(PUB, { recursive: true });

  const content = validate(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8')));

  // public site assets (original PNG exports are not needed online)
  copyDir(path.join(ROOT, 'assets'), path.join(PUB, 'assets'), (from) => from.includes(`${path.sep}_originals`));
  fs.mkdirSync(path.join(PUB, 'assets', 'uploads'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'php', 'uploads.htaccess'), path.join(PUB, 'assets', 'uploads', '.htaccess'));

  // admin UI (unchanged) + PHP backend
  copyDir(path.join(ROOT, 'admin'), path.join(PUB, 'admin'));
  copyDir(path.join(ROOT, 'php', 'api'), path.join(PUB, 'api'));
  copyDir(path.join(ROOT, 'php', 'app'), path.join(PUB, 'app'));
  fs.copyFileSync(path.join(ROOT, 'php', '.htaccess'), path.join(PUB, '.htaccess'));

  // shared definitions so PHP enforces exactly the Node rules
  const shared = {
    schema: toJson(SCHEMA),
    patterns: toJson(PATTERNS),
    icons: Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, { label: v.label, svg: v.svg }])),
    fonts: FONT_PAIRS,
    brandTheme: BRAND_THEME,
    sectionKeys: SECTION_KEYS,
    sectionIds: SECTION_IDS,
    rules: describe(),
  };
  fs.writeFileSync(path.join(PUB, 'app', 'shared.json'), JSON.stringify(shared));
  fs.writeFileSync(path.join(PUB, 'app', 'seed-content.json'), JSON.stringify(content, null, 2) + '\n');

  // config with a fresh one-time setup token (never committed)
  const token = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(path.join(PUB, 'app', 'config.php'), `<?php
// Generated by "npm run build:cpanel". Keep this file private.
defined('TSS_APP') || exit;
return [
    // One-time token for https://<your-domain>/admin/setup (creating the first admin account).
    'setup_token' => '${token}',
    // Private data folder. Empty = "tssolution-data" next to public_html (recommended).
    'data_dir' => '',
    // Secure cookie flag: 'auto' detects HTTPS; set true once the site is HTTPS-only.
    'cookie_secure' => 'auto',
];
`);
  fs.writeFileSync(path.join(OUT, 'SETUP-TOKEN.txt'),
    `Setup token for https://tssolution.co.id/admin/setup\n\n${token}\n\nUse it once to create the admin account. Do not share or upload this file.\n`);

  // the public page, rendered with image sizes from the package itself
  const { mediaInfo } = require('../server/store');
  fs.writeFileSync(path.join(PUB, 'index.html'), render(content, { mediaInfo }));

  const files = listFiles(PUB).sort();
  writeZip(path.join(OUT, 'tssolution-cpanel.zip'), PUB, files);

  const size = files.reduce((n, f) => n + fs.statSync(path.join(PUB, f)).size, 0);
  console.log(`Built ${files.length} files (${(size / 1024 / 1024).toFixed(1)} MB) in deploy/cpanel/public_html`);
  console.log('Zip:   deploy/cpanel/tssolution-cpanel.zip');
  console.log('Token: deploy/cpanel/SETUP-TOKEN.txt (needed once at /admin/setup)');
}

build();
