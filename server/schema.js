'use strict';

/*
 * Content schema + server-side validation.
 *
 * Every admin save goes through validate(): unknown keys are dropped, strings
 * are trimmed and length-limited, links/images/colors are checked against
 * safe patterns, and list sizes are bounded so the layout cannot break.
 * Missing optional values fall back to the declared default, which also lets
 * older content.json files pick up newly added settings.
 */

const { ICON_KEYS } = require('./icons');

class ValidationError extends Error {
  constructor(path, message) {
    super(`${path || 'content'}: ${message}`);
    this.path = path;
    this.detail = message;
  }
}

/* ---------- type builders ---------- */
const str = (max, opts = {}) => ({ t: 'str', max, ...opts });          // single line
const text = (max, opts = {}) => ({ t: 'str', max, multiline: true, ...opts });
const bool = (def) => ({ t: 'bool', def });
const num = (min, max, def, opts = {}) => ({ t: 'num', min, max, def, ...opts });
const oneOf = (values, def) => ({ t: 'enum', values, def });
const color = (def) => ({ t: 'color', def });
const href = (opts = {}) => ({ t: 'href', ...opts });
const image = (opts = {}) => ({ t: 'image', ...opts });
const icon = (def = 'check') => ({ t: 'enum', values: ICON_KEYS, def });
const obj = (shape) => ({ t: 'obj', shape });
const list = (item, min, max) => ({ t: 'list', item, min, max });

const HREF_RE = /^(#[A-Za-z0-9_-]*|https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:\+?[0-9\s()-]+|\/(?!\/)[^\s"'<>]*)$/;
const IMAGE_RE = /^assets\/(img|uploads)\/[A-Za-z0-9_.-]+\.(png|jpe?g|webp)$/i;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const SECTION_KEYS = ['about', 'services', 'whyUs', 'standards', 'clients', 'contact'];
const SECTION_IDS = { about: 'about', services: 'services', whyUs: 'why-us', standards: 'standards', clients: 'clients', contact: 'contact' };

const FONT_PAIRS = {
  'roboto-opensans': {
    label: 'Roboto + Open Sans (current)',
    head: '"Roboto", "Helvetica Neue", Arial, sans-serif',
    body: '"Open Sans", "Helvetica Neue", Arial, sans-serif',
    url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Roboto:wght@500;700&display=swap',
  },
  'montserrat-opensans': {
    label: 'Montserrat + Open Sans (company profile)',
    head: '"Montserrat", "Helvetica Neue", Arial, sans-serif',
    body: '"Open Sans", "Helvetica Neue", Arial, sans-serif',
    url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&family=Open+Sans:wght@400;600&display=swap',
  },
  'inter': {
    label: 'Inter',
    head: '"Inter", "Helvetica Neue", Arial, sans-serif',
    body: '"Inter", "Helvetica Neue", Arial, sans-serif',
    url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  'poppins-opensans': {
    label: 'Poppins + Open Sans',
    head: '"Poppins", "Helvetica Neue", Arial, sans-serif',
    body: '"Open Sans", "Helvetica Neue", Arial, sans-serif',
    url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Poppins:wght@500;700&display=swap',
  },
};

const BRAND_THEME = { accent: '#ffab4c', accentStrong: '#f58220', accentInk: '#a3530b', ink: '#151515', fontPair: 'roboto-opensans' };

const bullet = obj({ text: str(120, { required: true }), note: str(120) });

const SCHEMA = obj({
  site: obj({
    title: str(90, { required: true }),
    url: str(120, { pattern: /^https?:\/\/[^\s"'<>/]+$/, patternMsg: 'must be a site address like https://tssolution.co.id (no trailing slash)' }),
    description: text(300),
    keywords: str(300),
    ogTitle: str(90),
    ogDescription: text(300),
    ogImage: image({ optional: true }),
  }),
  theme: obj({
    accent: color(BRAND_THEME.accent),
    accentStrong: color(BRAND_THEME.accentStrong),
    accentInk: color(BRAND_THEME.accentInk),
    ink: color(BRAND_THEME.ink),
    fontPair: oneOf(Object.keys(FONT_PAIRS), BRAND_THEME.fontPair),
  }),
  motion: obj({
    heroIntro: bool(true),
    heroSheen: bool(true),
    scrollReveal: bool(true),
    counters: bool(true),
    hoverEffects: bool(true),
    speed: oneOf(['relaxed', 'standard', 'quick'], 'standard'),
  }),
  header: obj({
    logo: image(),
    logoAlt: str(120, { required: true }),
    homeLabel: str(30, { required: true }),
    ctaLabel: str(30),
    ctaHref: href({ optional: true }),
    showPhone: bool(true),
  }),
  hero: obj({
    eyebrow: str(60),
    title: str(140, { required: true }),
    lead: text(400),
    image: image(),
    primaryLabel: str(40),
    primaryHref: href({ optional: true }),
    secondaryLabel: str(40),
    secondaryHref: href({ optional: true }),
    showScrollCue: bool(true),
  }),
  facts: obj({
    visible: bool(true),
    items: list(obj({
      value: str(12, { required: true }),
      suffix: str(6),
      label: str(60, { required: true }),
      countUp: bool(true),
    }), 1, 4),
  }),
  layout: list(obj({
    key: oneOf(SECTION_KEYS),
    visible: bool(true),
    navLabel: str(30, { required: true }),
    inNav: bool(true),
  }), SECTION_KEYS.length, SECTION_KEYS.length),
  about: obj({
    eyebrow: str(60),
    title: str(100, { required: true }),
    lead: text(600),
    paragraphs: list(text(800, { required: true }), 0, 6),
    sectors: list(obj({ icon: icon('office'), label: str(80, { required: true }) }), 0, 12),
    project: obj({
      visible: bool(true),
      badge: str(3),
      title: str(80, { required: true }),
      text: text(1200),
    }),
    values: list(obj({ icon: icon('thumbsUp'), title: str(60, { required: true }), text: str(160) }), 0, 4),
  }),
  services: obj({
    eyebrow: str(60),
    title: str(100, { required: true }),
    subtitle: text(300),
    items: list(obj({
      title: str(60, { required: true }),
      image: image(),
      imageAlt: str(160),
      bullets: list(bullet, 1, 12),
    }), 1, 6),
  }),
  whyUs: obj({
    eyebrow: str(60),
    title: str(100, { required: true }),
    subtitle: text(300),
    featureImage: image(),
    featureAlt: str(160),
    featureCaption: str(80),
    items: list(obj({ icon: icon('check'), title: str(70, { required: true }), text: text(240) }), 1, 9),
  }),
  // Former "How we work" section: only its field photo strip remains
  standards: obj({
    photos: list(obj({ image: image(), alt: str(160) }), 0, 4),
  }),
  clients: obj({
    eyebrow: str(60),
    title: str(100, { required: true }),
    sortAlpha: bool(true),
    collapsedRows: num(2, 5, 3, { integer: true }),
    showMoreLabel: str(30, { required: true }),
    showLessLabel: str(30, { required: true }),
    items: list(obj({ name: str(100, { required: true }), logo: image({ optional: true }) }), 0, 200),
  }),
  contact: obj({
    eyebrow: str(60),
    title: str(100, { required: true }),
    intro: text(300),
    officeLabel: str(30),
    offices: list(obj({ line1: str(100, { required: true }), line2: str(100) }), 1, 4),
    phoneLabel: str(30),
    phones: list(str(30, { required: true, pattern: /^[+0-9\s()-]+$/, patternMsg: 'use digits, spaces, +, ( ) and - only' }), 1, 5),
    fax: str(30, { pattern: /^[+0-9\s()-]*$/, patternMsg: 'use digits, spaces, +, ( ) and - only' }),
    secondaryLabel: str(30),
    mapLabel: str(40),
    map: obj({
      lat: num(-90, 90, -6.2276721),
      lng: num(-180, 180, 107.0041869),
      zoom: num(3, 20, 15, { integer: true }),
      query: str(120),
    }),
  }),
  footer: obj({
    brand: str(60, { required: true }),
    tagline: str(120),
    copyright: str(200),
    showContact: bool(true),
    backToTopLabel: str(30),
  }),
});

/* ---------- validation ---------- */
function validateNode(node, value, path) {
  switch (node.t) {
    case 'str': {
      if (value === undefined || value === null) value = node.def !== undefined ? node.def : '';
      if (typeof value !== 'string') throw new ValidationError(path, 'must be text');
      // normalise line endings, strip control characters, trim
      value = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
      value = node.multiline ? value.trim() : value.replace(/\s*\n\s*/g, ' ').trim();
      if (node.required && !value) throw new ValidationError(path, 'is required');
      if (value.length > node.max) throw new ValidationError(path, `must be at most ${node.max} characters`);
      if (value && node.pattern && !node.pattern.test(value)) throw new ValidationError(path, node.patternMsg || 'has an invalid format');
      return value;
    }
    case 'bool':
      if (value === undefined || value === null) return node.def !== undefined ? node.def : false;
      if (typeof value !== 'boolean') throw new ValidationError(path, 'must be true or false');
      return value;
    case 'num': {
      if (value === undefined || value === null || value === '') value = node.def;
      const n = typeof value === 'string' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new ValidationError(path, 'must be a number');
      if (node.integer && !Number.isInteger(n)) throw new ValidationError(path, 'must be a whole number');
      if (n < node.min || n > node.max) throw new ValidationError(path, `must be between ${node.min} and ${node.max}`);
      return n;
    }
    case 'enum':
      if ((value === undefined || value === null) && node.def !== undefined) return node.def;
      if (!node.values.includes(value)) throw new ValidationError(path, 'is not an allowed option');
      return value;
    case 'color':
      if (value === undefined || value === null || value === '') return node.def;
      if (typeof value !== 'string' || !HEX_RE.test(value)) throw new ValidationError(path, 'must be a hex color like #ffab4c');
      return value.toLowerCase();
    case 'href':
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') throw new ValidationError(path, 'must be a link');
      value = value.trim();
      if (!value) {
        if (node.optional) return '';
        throw new ValidationError(path, 'is required');
      }
      if (value.length > 300 || !HREF_RE.test(value)) {
        throw new ValidationError(path, 'must be a section link (#about), a web address (https://…), mailto:, tel: or a site path (/…)');
      }
      return value;
    case 'image':
      if (value === undefined || value === null) value = '';
      if (typeof value !== 'string') throw new ValidationError(path, 'must be an image path');
      value = value.trim();
      if (!value) {
        if (node.optional) return '';
        throw new ValidationError(path, 'please choose an image');
      }
      if (!IMAGE_RE.test(value) || value.includes('..')) throw new ValidationError(path, 'must be an image from the media library');
      return value;
    case 'obj': {
      if (value === undefined || value === null) value = {};
      if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(path, 'has an invalid structure');
      const out = {};
      for (const [key, child] of Object.entries(node.shape)) {
        out[key] = validateNode(child, value[key], path ? `${path}.${key}` : key);
      }
      return out;
    }
    case 'list': {
      if (value === undefined || value === null) value = [];
      if (!Array.isArray(value)) throw new ValidationError(path, 'must be a list');
      if (value.length < node.min) throw new ValidationError(path, `needs at least ${node.min} item${node.min === 1 ? '' : 's'}`);
      if (value.length > node.max) throw new ValidationError(path, `can have at most ${node.max} items`);
      return value.map((v, i) => validateNode(node.item, v, `${path}[${i}]`));
    }
    default:
      throw new Error(`Unknown schema node ${node.t}`);
  }
}

/* ---------- colour checks so text stays readable ---------- */
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function checkTheme(theme) {
  const problems = [];
  if (contrast(theme.ink, theme.accent) < 4.5) problems.push(['theme.accent', 'dark text on the accent color (buttons) needs a contrast of at least 4.5:1 — choose a lighter accent']);
  if (contrast(theme.ink, theme.accentStrong) < 3) problems.push(['theme.accentStrong', 'button hover color is too dark for the button text — choose a lighter color']);
  if (contrast(theme.accentInk, '#ffffff') < 4.5) problems.push(['theme.accentInk', 'accent text on white needs a contrast of at least 4.5:1 — choose a darker color']);
  if (contrast(theme.ink, '#ffffff') < 10) problems.push(['theme.ink', 'heading/text color must stay very dark for readability']);
  return problems;
}

function validate(content) {
  const clean = validateNode(SCHEMA, content, '');

  const keys = clean.layout.map((s) => s.key);
  if (new Set(keys).size !== SECTION_KEYS.length) throw new ValidationError('layout', 'each section must appear exactly once');

  const themeProblems = checkTheme(clean.theme);
  if (themeProblems.length) throw new ValidationError(themeProblems[0][0], themeProblems[0][1]);

  return clean;
}

/* Flattened rules for the admin UI (max lengths, required, list sizes), keyed like "about.sectors[].label" */
function describe(node = SCHEMA, path = '', out = {}) {
  const { t } = node;
  if (t === 'obj') Object.entries(node.shape).forEach(([k, child]) => describe(child, path ? `${path}.${k}` : k, out));
  else if (t === 'list') { out[path] = { t, min: node.min, max: node.max }; describe(node.item, `${path}[]`, out); }
  else if (t === 'str') out[path] = { t, max: node.max, required: Boolean(node.required), multiline: Boolean(node.multiline) };
  else if (t === 'num') out[path] = { t, min: node.min, max: node.max, integer: Boolean(node.integer) };
  else if (t === 'enum') out[path] = { t, values: node.values };
  else out[path] = { t, optional: Boolean(node.optional) };
  return out;
}

const PATTERNS = { href: HREF_RE, image: IMAGE_RE, hex: HEX_RE };

module.exports = {
  validate, describe, ValidationError, SCHEMA, PATTERNS, SECTION_KEYS, SECTION_IDS, FONT_PAIRS, BRAND_THEME, contrast, checkTheme,
};
