<div align="center">

<img src="assets/img/logo-ts-solution.png" alt="TS Solution" height="72">

# TS Solution — Website & Admin CMS

Company profile website for **TS Solution** (PT Hamparan Indah Rejeki), a facility service company,
with a custom-built, zero-dependency content management system.

[![Live Site](https://img.shields.io/badge/live-tssolution.co.id-0a7d4f?style=flat-square)](https://tssolution.co.id)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![PHP](https://img.shields.io/badge/PHP-7.4%2B-777BB4?style=flat-square&logo=php&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Dependencies](https://img.shields.io/badge/dependencies-0-success?style=flat-square)

</div>

---

## Overview

The public site is a fast, fully static HTML page. Behind it sits an admin panel that lets
non-technical staff manage every part of the website — text, images, layout, branding and SEO —
without touching code. Each save validates the content, regenerates the static page and stores a
restorable version.

The project runs without a database and without any npm or Composer packages, so it can be
hosted on standard shared cPanel hosting at minimal cost.

## Features

**Public website**
- Static, SEO-friendly HTML that works fully without JavaScript
- Responsive layout with WebP images and responsive image sizes
- Animations that respect `prefers-reduced-motion`
- Open Graph / social sharing metadata

**Admin panel**
- Edit all texts, buttons and links across every section
- Manage services, sectors, values, field photos, client logos and office contacts
- Reorder, show/hide and rename sections and menu items
- Brand colors with automatic contrast checks and curated font pairings
- Media library with secure image uploads
- Version history with one-click restore (last 30 versions)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (custom properties), Vanilla JavaScript |
| Backend | Node.js 18+ (built-in modules only) · PHP 7.4+ |
| Storage | JSON files — no database |
| Server | Apache (`.htaccess`), cPanel, Let's Encrypt SSL |
| Tooling | Custom build script, PHP ↔ Node.js parity test |

## Architecture

```
            ┌──────────────┐   save    ┌────────────────────┐
  Admin ──▶ │  Admin panel │ ────────▶ │ Backend (Node/PHP) │
            └──────────────┘           │  • validate input  │
                                       │  • write JSON      │
                                       │  • render HTML     │
                                       │  • store version   │
                                       └─────────┬──────────┘
                                                 ▼
  Visitor ◀──────────── index.html (static) + assets/
```

Two interchangeable backends expose the **same API**, so the admin UI is identical in both:

| Backend | Purpose | Location |
|---|---|---|
| PHP | Production on Apache / cPanel hosting | `php/` |
| Node.js | Local development and preview | `server/` |

Validation rules and rendering have a single source of truth in the Node.js code. The PHP
backend consumes the exported schema at build time, and `npm run check:php` verifies that both
backends render byte-identical HTML and validate input identically.

## Getting Started

**Requirements:** Node.js 18 or newer (no `npm install` needed).

```bash
git clone https://github.com/kennethandreas/tssolution.git
cd tssolution

npm run create-admin   # create an admin account (password min. 10 characters)
npm start              # http://localhost:3000
```

The admin panel is available at `http://localhost:3000/admin`.

| Command | Description |
|---|---|
| `npm start` | Start the local server (`PORT=8080 npm start` to change port) |
| `npm run create-admin` | Create an admin account or reset a password |
| `npm run list-admins` | List admin accounts |
| `npm run build:cpanel` | Build the production package for cPanel |
| `npm run check:php` | Verify PHP and Node.js backends produce identical output |

## Project Structure

```
├── index.html          Generated public page — edit content via /admin
├── assets/             Stylesheets, scripts, images and uploads
├── admin/              Admin panel interface
├── data/
│   └── content.json    All site content and settings (single source of truth)
├── server/             Node.js backend (render, schema, auth, storage)
├── php/                PHP backend for production hosting
└── scripts/            Build and parity-check tooling
```

## Security

- Passwords hashed with **scrypt**; credentials are never committed
- Sessions via random tokens in `HttpOnly`, `SameSite=Strict` cookies (2 h idle / 12 h max)
- **CSRF** token and same-origin check on every change
- Login rate limiting — 5 failed attempts trigger a 15-minute lockout
- All input validated server-side; all output HTML-escaped
- Uploads restricted to PNG/JPEG/WebP, verified by file signature, max 5 MB, randomized names
- Private data stored outside the web root; `.htaccess` blocks code, config and data files

## Deployment

Production runs on cPanel / Apache with PHP — no database, Node.js or Composer required on the
server.

```bash
npm run build:cpanel
```

This creates an upload-ready package in `deploy/cpanel/`. See
**[DEPLOY-CPANEL.md](DEPLOY-CPANEL.md)** for the full step-by-step guide.

---

<div align="center">

© 2026 TS Solution · PT Hamparan Indah Rejeki. All rights reserved.

</div>
