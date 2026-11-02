# TS Solution – website + admin panel

Single-page website for https://tssolution.co.id with a built-in admin panel.
Production runs on standard **cPanel/Apache + PHP 7.4+** hosting (no database); locally it
runs on Node.js 18+. **No npm or Composer packages** in either case.

## Quick start

```bash
npm run create-admin      # once: choose a username + password (min 10 characters)
npm start                 # http://localhost:3000  ·  admin at http://localhost:3000/admin
```

Change the port with `PORT=8080 npm start`. To reset a forgotten password, run
`npm run create-admin -- <username>` again on the server. `npm run list-admins` shows the accounts.

## How it works

```
data/content.json      all page content + settings (the single source of truth)
server/render.js       turns content.json into index.html (same markup as before)
index.html             GENERATED on every save — edit content in /admin, not here
data/history/          the last 30 published versions (restorable from the admin)
assets/uploads/        images uploaded in the admin
data/admin.json        admin accounts (scrypt-hashed passwords) — never commit or share
```

Saving in the admin validates everything on the server, writes `data/content.json`,
regenerates `index.html` and records a history version. The public page itself stays a
plain static file, so it loads fast, works without JavaScript and is fully indexable.

What can be managed: all texts, buttons and links; hero, key facts, About (sectors,
P Project, values), Services, Why us, field photos, Clients (names, logos, A–Z
sorting, rows shown before “Show more”), Contact (offices, phones, map), Footer, SEO/sharing;
section order, visibility and menu labels; brand colors (with contrast checks) and
curated font pairs; animations on/off and speed; media library; version history.

## Security

- Sessions: random token in an HttpOnly, SameSite=Strict cookie; 2 h idle / 12 h max.
- Every change needs a per-session CSRF token and a same-origin request.
- 5 failed logins from one IP → 15 minute lockout.
- All input validated server-side (types, lengths, safe links/images, list sizes,
  readable colors); all output HTML-escaped.
- Uploads: PNG/JPEG/WebP only, checked by file signature, max 5 MB, random file names.
- Only `index.html` and `/assets/*` are publicly served — `data/`, `server/` are not.
  On cPanel the private data lives outside `public_html`, and `.htaccess` blocks `app/`,
  config/JSON files and script execution in `assets/uploads/`.

## Deployment

There are two interchangeable backends with the same API, so the admin UI is identical:

| Backend | Use for | Code |
|---|---|---|
| **PHP** (Apache/cPanel, PHP 7.4+) | **production on CBN cPanel hosting** | `php/` |
| Node.js (no packages) | local editing/preview, or a Node-capable server | `server/` |

**cPanel (production):** `npm run build:cpanel` creates `deploy/cpanel/tssolution-cpanel.zip`
plus a one-time setup token. Step-by-step instructions: **[DEPLOY-CPANEL.md](DEPLOY-CPANEL.md)**.

The PHP backend reads the schema, icons and fonts exported from the Node code at build time
(`app/shared.json`), so validation rules have one source of truth. After changing
`server/render.js` or `server/schema.js`, mirror the change in `php/app/` and run
`npm run build:cpanel && npm run check:php` — it fails unless the PHP backend renders
byte-identical HTML and validates exactly like Node.

**Node server** (only if a host supports Node.js apps): behind HTTPS / a reverse proxy run
`HOST=127.0.0.1 PORT=3000 TRUST_PROXY=1 COOKIE_SECURE=1 npm start`, keep it running with a
process manager, and back up `data/` and `assets/uploads/`.

## Design notes

Brand tokens live at the top of `assets/css/styles.css`; the admin overrides colors/fonts
through a small generated `<style id="site-theme">` block. Animations respect
`prefers-reduced-motion`, and the page is fully visible without JavaScript.
