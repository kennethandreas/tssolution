'use strict';

/*
 * Checks that the PHP backend behaves exactly like the Node one:
 *   1. renders byte-identical index.html for the current content and for edge-case variants
 *   2. accepts/rejects the same invalid inputs with the same field + message
 *
 *   npm run build:cpanel && npm run check:php            (uses "php" on PATH)
 *   PHP_BIN=/path/to/php npm run check:php               (another PHP version)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { validate } = require('../server/schema');
const { render } = require('../server/render');
const { mediaInfo } = require('../server/store');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'deploy', 'cpanel', 'public_html');
const PHP = process.env.PHP_BIN || 'php';
const PHP_ARGS = (process.env.PHP_ARGS || '').split(' ').filter(Boolean);
const YEAR = 2026;
const tmp = path.join(os.tmpdir(), `tss-parity-${process.pid}.json`);

if (!fs.existsSync(path.join(PUB, 'app', 'shared.json'))) {
  console.error('Run "npm run build:cpanel" first.');
  process.exit(1);
}

const php = (input, mode = '') => {
  fs.writeFileSync(tmp, JSON.stringify(input));
  return execFileSync(PHP, [...PHP_ARGS, path.join(__dirname, 'php-render-cli.php'), PUB, tmp, String(YEAR), mode].filter(Boolean),
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
};
const nodeValidate = (input) => {
  try { return { ok: validate(input) }; } catch (e) { return { error: e.message, field: e.path }; }
};

let pass = 0;
let fail = 0;
const check = (ok, name, detail = '') => {
  if (ok) { pass++; console.log('  ✔', name); } else { fail++; console.log('  ✘', name, detail); }
};

const base = validate(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'content.json'), 'utf8')));
console.log(`PHP: ${execFileSync(PHP, [...PHP_ARGS, '-r', 'echo PHP_VERSION;'], { encoding: 'utf8' })}\n# Render parity`);

const variants = {
  'current content': (c) => c,
  'tricky text (quotes, <tags>, &, emoji, "0")': (c) => {
    c.hero.title = 'Tom & Jerry\'s "best" <b>service</b> 🚀';
    c.hero.eyebrow = '0';
    c.footer.tagline = '0';
    c.clients.items.push({ name: 'Ätna Ölwerke', logo: '' }, { name: 'aardvark', logo: '' }, { name: 'Zeta', logo: 'assets/img/logo-ts-solution.png' });
  },
  'sections reordered/hidden, no facts, motion off': (c) => {
    c.layout.reverse();
    c.layout[1].visible = false;
    c.layout[2].inNav = false;
    c.facts.visible = false;
    Object.keys(c.motion).forEach((k) => { if (typeof c.motion[k] === 'boolean') c.motion[k] = false; });
    c.motion.speed = 'quick';
  },
  'empty optionals, unsorted clients, other font/colors': (c) => {
    Object.assign(c.hero, { eyebrow: '', lead: '', primaryLabel: '', secondaryHref: '', showScrollCue: false });
    Object.assign(c.contact, { fax: '', secondaryLabel: '', mapLabel: '', eyebrow: '', intro: '' });
    c.contact.map = { lat: 1.5, lng: -0.25, zoom: 3, query: '' };
    c.about.paragraphs = []; c.about.sectors = []; c.about.values = []; c.about.project.visible = false;
    c.standards.photos = [];
    c.clients.sortAlpha = false; c.clients.collapsedRows = 5;
    c.footer = { ...c.footer, showContact: false, backToTopLabel: '', copyright: 'No year here' };
    c.site.url = ''; c.site.ogTitle = ''; c.site.ogImage = '';
    c.theme = { accent: '#ffc266', accentStrong: '#ff9f1a', accentInk: '#8a4600', ink: '#101010', fontPair: 'inter' };
    c.facts.items = [{ value: '2013', suffix: '', label: 'Founded', countUp: false }, { value: '24/7', suffix: '', label: 'Support', countUp: true }];
  },
};

for (const [name, mutate] of Object.entries(variants)) {
  const c = JSON.parse(JSON.stringify(base));
  mutate(c);
  const content = validate(c);
  const expected = render(content, { mediaInfo, year: YEAR });
  const actual = php(content);
  let detail = '';
  if (expected !== actual) {
    let i = 0;
    while (expected[i] === actual[i]) i++;
    detail = `\n      first difference at ${i}:\n      node: ${JSON.stringify(expected.slice(i - 80, i + 80))}\n      php:  ${JSON.stringify(actual.slice(i - 80, i + 80))}`;
  }
  check(expected === actual, `identical HTML — ${name}`, detail);
}

console.log('\n# Validation parity');
const cases = {
  'javascript: link': (c) => { c.hero.primaryHref = 'javascript:alert(1)'; },
  'protocol-relative link': (c) => { c.hero.primaryHref = '//evil.example'; },
  'image traversal': (c) => { c.hero.image = '../../data/admin.json'; },
  'unreadable accent': (c) => { c.theme.accent = '#151515'; },
  'css injection in color': (c) => { c.theme.accent = 'red; } body {'; },
  'unknown font': (c) => { c.theme.fontPair = 'comic'; },
  'duplicate layout key': (c) => { c.layout[1].key = 'about'; },
  'too long title': (c) => { c.hero.title = 'x'.repeat(141); },
  'exactly max length with emoji': (c) => { c.hero.title = '🚀'.repeat(70); },
  'one over max with emoji': (c) => { c.hero.title = 'a' + '🚀'.repeat(70); },
  'blank required title': (c) => { c.hero.title = '   '; },
  'no facts': (c) => { c.facts.items = []; },
  'too many photos': (c) => { c.standards.photos = [...c.standards.photos, ...c.standards.photos]; },
  'bad phone': (c) => { c.contact.phones[0] = '021<b>'; },
  'number as string': (c) => { c.clients.collapsedRows = '4'; },
  'number out of range': (c) => { c.clients.collapsedRows = 9; },
  'float for integer': (c) => { c.contact.map.zoom = 12.5; },
  'boolean as string': (c) => { c.facts.visible = 'yes'; },
  'unknown icon': (c) => { c.about.sectors[0].icon = '<svg>'; },
  'bad site url': (c) => { c.site.url = 'https://example.com/'; },
  'control chars + newlines stripped': (c) => { c.hero.title = 'A\u0007B\r\nC   \n  D'; c.hero.lead = '  line1\r\nline2  '; },
  'unknown keys dropped': (c) => { c.extra = 1; c.hero.extra = 2; },
  'list given as object': (c) => { c.clients.items = { a: 1 }; },
  'object given as list': (c) => { c.hero = [1, 2]; },
  'null content': () => null,
};
for (const [name, mutate] of Object.entries(cases)) {
  let c = JSON.parse(JSON.stringify(base));
  const r = mutate(c);
  if (r === null) c = null;
  const expected = nodeValidate(c);
  const actual = JSON.parse(php(c, 'validate'));
  check(JSON.stringify(expected) === JSON.stringify(actual), `same result — ${name}`,
    `\n      node: ${JSON.stringify(expected).slice(0, 200)}\n      php:  ${JSON.stringify(actual).slice(0, 200)}`);
}

fs.rmSync(tmp, { force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
