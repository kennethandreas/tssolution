# TS Solution — Company Website & Admin CMS

Corporate website for **TS Solution** ([tssolution.co.id](https://tssolution.co.id)), an Indonesian
facility services company, with a purpose-built content management system. The public site is a
fast, fully static page; a secure admin panel lets non-technical staff edit every section, image,
color and SEO setting and republish the site in one click.

![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-7.4+-777BB4?logo=php&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

---

## Highlights

- **Zero dependencies** — no npm or Composer packages in either backend, which removes supply-chain
  risk and keeps the site maintainable on basic shared hosting.
- **Static output, dynamic editing** — every save validates the content, regenerates `index.html` and
  stores a versioned snapshot. Visitors always receive a plain HTML file that loads fast, works
  without JavaScript and is fully indexable.
- **Two interchangeable backends, one API** — a Node.js server for local editing and a PHP backend for
  production cPanel hosting. A parity check fails the build unless both render byte-identical HTML
  and apply exactly the same validation rules.
- **Hardened admin** — scrypt-hashed passwords, HttpOnly/SameSite=Strict session cookies with idle and
  absolute timeouts, per-session CSRF tokens, same-origin enforcement, login rate limiting and
  signature-checked image uploads.

## Features

**Public website**
- Single-page company profile: hero, key facts, about (sectors, values), services, why us,
  field photos, client logos, multi-office contact with map, and footer.
- Responsive WebP/JPEG images, SEO and Open Graph metadata, animations that respect
  `prefers-reduced-motion`.

**Admin panel (`/admin`)**
- Edit all texts, buttons and links; reorder, hide or rename sections and menu items.
- Client list management (logos, A–Z sorting, "show more" threshold).
- Brand colors with automatic contrast checks and curated font pairings.
- Media library for uploads; animation toggles and speed.
- Version history of the last 30 publications with one-click restore.

## Architecture

```
data/content.json ──► render (server/render.js | php/app/render.php) ──► index.html (static)
        ▲                                                                   │
        └──────── admin UI (admin/) ── JSON API (server/ | php/api/) ◄──────┘
                     validation: server/schema.js  ⇄  php/app/schema.php
```

| Path | Responsibility |
|---|---|
| `server/` | Node.js backend: HTTP server, auth/sessions, schema validation, renderer, file store, CLI |
| `php/` | PHP backend with the same API for Apache/cPanel (no database required) |
| `admin/` | Admin single-page interface (vanilla JS) |
| `assets/` | Public CSS, JS and optimized images |
| `data/content.json` | Single source of truth for all page content and settings |
| `scripts/` | cPanel release builder and Node ⇄ PHP parity checker |

In production, private data (content, history, accounts) lives outside `public_html`, and `.htaccess`
rules block the application folder, configuration/JSON files and script execution in uploads.

## Getting Started

**Requirements:** Node.js 18+ (local), PHP 7.4+ with Apache (production).

```bash
git clone https://github.com/kennethandreas/tssolution.git
cd tssolution

npm run create-admin      # create an admin account (password min. 10 characters)
npm start                 # http://localhost:3000  ·  admin: http://localhost:3000/admin
```

Other commands:

```bash
npm run list-admins                   # list admin accounts
npm run create-admin -- <username>    # reset a password
PORT=8080 npm start                   # custom port
```

## Deployment

```bash
npm run build:cpanel      # creates deploy/cpanel/tssolution-cpanel.zip + one-time setup token
npm run check:php         # verifies PHP output and validation match the Node backend
```

The step-by-step production guide (upload, admin setup, HTTPS, verification, rollback and backups)
is in [`DEPLOY-CPANEL.md`](DEPLOY-CPANEL.md). The `deploy/` folder is git-ignored because it contains the
setup token.

## Author

Designed and developed by **Kenneth Andreas** ([@kennethandreas](https://github.com/kennethandreas)):
website, CMS, both backends and production deployment.

## License

**Proprietary — all rights reserved.** This source code is published for portfolio viewing only;
copying, modification, redistribution or deployment is not permitted without written permission.
See [`LICENSE`](LICENSE).

Company name, logo, photographs, client logos and website content belong to TS Solution.
