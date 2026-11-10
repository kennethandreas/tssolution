'use strict';

/*
 * Renders the public landing page (index.html) from validated content.
 * The markup mirrors the hand-built page so assets/css/styles.css and
 * assets/js/main.js keep working unchanged. Every value is escaped.
 */

const { iconSvg } = require('./icons');
const { SECTION_IDS, FONT_PAIRS } = require('./schema');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const PHONE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const TILE_MARK = '<span class="tile-mark" aria-hidden="true"><i></i><i></i></span>';

/* (021) 2962 0480 -> +622129620480 ; numbers starting with 0 are treated as Indonesian */
function telHref(display) {
  const d = String(display).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return `tel:${d}`;
  if (d.startsWith('62')) return `tel:+${d}`;
  if (d.startsWith('0')) return `tel:+62${d.slice(1)}`;
  return `tel:${d}`;
}

function mix(hex, withHex, amount) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(withHex.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, '0')).join('');
}

function render(content, opts = {}) {
  const c = content;
  const mediaInfo = opts.mediaInfo || (() => null);
  const year = opts.year || new Date().getFullYear();
  const font = FONT_PAIRS[c.theme.fontPair] || FONT_PAIRS['roboto-opensans'];

  // width/height attributes prevent layout shift when the size is known
  const img = (src, { alt = '', cls = '', lazy = true, extra = '' } = {}) => {
    const info = mediaInfo(src);
    const dims = info ? ` width="${info.width}" height="${info.height}"` : '';
    const loading = lazy ? ' loading="lazy" decoding="async"' : '';
    return `<img src="${esc(src)}"${dims}${loading}${cls ? ` class="${cls}"` : ''} alt="${esc(alt)}"${extra} />`;
  };

  /* ---- layout: visible sections, alternating backgrounds, nav ---- */
  const visible = c.layout.filter((s) => s.visible);
  const navItems = visible.filter((s) => s.inNav);
  let lastNav = 'home';
  const sectionMeta = {};
  visible.forEach((s, i) => {
    const id = SECTION_IDS[s.key];
    sectionMeta[s.key] = { id, alt: i % 2 === 1, navGroup: s.inNav ? null : lastNav };
    if (s.inNav) lastNav = id;
  });
  const sectionAttrs = (key, labelledby) => {
    const m = sectionMeta[key];
    return `class="section${m.alt ? ' section-alt' : ''}" id="${m.id}" aria-labelledby="${labelledby}"${m.navGroup ? ` data-nav-group="${m.navGroup}"` : ''}`;
  };
  const head = (eyebrow, id, title, sub, center) => `
        <div class="section-head${center ? ' center' : ''}" data-reveal>
          ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
          <h2 id="${id}">${esc(title)}</h2>${sub ? `
          <p class="section-sub">${esc(sub)}</p>` : ''}
        </div>`;

  const primaryPhone = c.contact.phones[0];

  /* ---- motion + theme ---- */
  const m = c.motion;
  const htmlClasses = [
    m.heroIntro && 'm-hero', m.heroSheen && 'm-sheen', m.scrollReveal && 'm-reveal',
    m.counters && 'm-counters', m.hoverEffects && 'm-hover',
  ].filter(Boolean).join(' ');
  const revealDur = { relaxed: '1s', standard: '.7s', quick: '.45s' }[m.speed];

  const rows = c.clients.collapsedRows;
  const visDesktop = rows * 3;
  const visTablet = Math.min(visDesktop, (rows + 1) * 2);
  const visMobile = rows * 2;
  const hideFrom = (n) => `.js .client-grid.is-collapsed .client:nth-child(n + ${n + 1}) { display: none; }`;

  const themeCss = `
    :root {
      --orange: ${c.theme.accent};
      --orange-strong: ${c.theme.accentStrong};
      --orange-ink: ${c.theme.accentInk};
      --orange-soft: ${mix(c.theme.accent, '#ffffff', 0.13)};
      --ink: ${c.theme.ink};
      --font-head: ${font.head};
      --font-body: ${font.body};
      --reveal-dur: ${revealDur};
    }
    ${hideFrom(visDesktop)}
    @media (max-width: 1024px) { ${hideFrom(visTablet)} }
    @media (max-width: 560px) { ${hideFrom(visMobile)} }`;

  /* ---- sections ---- */
  const sections = {
    about: () => {
      const a = c.about;
      return `
    <!-- About -->
    <section ${sectionAttrs('about', 'about-title')}>
      <div class="container">${head(a.eyebrow, 'about-title', a.title, '', false)}

        <div class="about-grid">
          <div class="about-text" data-reveal>${a.lead ? `
            <p class="lead">${esc(a.lead)}</p>` : ''}${a.paragraphs.map((p) => `
            <p>${esc(p)}</p>`).join('')}
          </div>
${a.sectors.length ? `
          <ol class="sector-list" data-reveal style="--d: 1">${a.sectors.map((s) => `
            <li>
              <span class="sector-icon" aria-hidden="true">${iconSvg(s.icon)}</span>
              ${esc(s.label)}
            </li>`).join('')}
          </ol>` : ''}
        </div>
${a.project.visible ? `
        <div class="p-project" data-reveal>
          ${a.project.badge ? `<div class="p-project-badge" aria-hidden="true">${esc(a.project.badge)}</div>` : ''}
          <div>
            <h3>${esc(a.project.title)}</h3>
            <p>${esc(a.project.text)}</p>
          </div>
        </div>` : ''}
${a.values.length ? `
        <div class="values">${a.values.map((v, i) => `
          <article class="value-card" data-reveal style="--d: ${i % 2}">
            <span class="value-icon" aria-hidden="true">${iconSvg(v.icon)}</span>
            <div>
              <h3>${esc(v.title)}</h3>
              ${v.text ? `<p>${esc(v.text)}</p>` : ''}
            </div>
          </article>`).join('')}
        </div>` : ''}
      </div>
    </section>`;
    },

    services: () => {
      const s = c.services;
      return `
    <!-- Services -->
    <section ${sectionAttrs('services', 'services-title')}>
      <div class="container">${head(s.eyebrow, 'services-title', s.title, s.subtitle, true)}

        <div class="service-grid">${s.items.map((it, i) => `
          <article class="service-card" data-reveal style="--d: ${i % 3}">
            <div class="service-media">
              ${img(it.image, { alt: it.imageAlt })}
            </div>
            <div class="service-body">
              <h3>${esc(it.title)}</h3>
              <ul class="check-list">${it.bullets.map((b) => `
                <li>${esc(b.text)}${b.note ? ` <small>${esc(b.note)}</small>` : ''}</li>`).join('')}
              </ul>
            </div>
          </article>`).join('')}
        </div>
      </div>
    </section>`;
    },

    whyUs: () => {
      const w = c.whyUs;
      return `
    <!-- Added value -->
    <section ${sectionAttrs('whyUs', 'why-title')}>
      <div class="container">${head(w.eyebrow, 'why-title', w.title, w.subtitle, false)}

        <div class="why-grid">
          <figure class="why-feature" data-reveal>
            ${img(w.featureImage, { alt: w.featureAlt })}${w.featureCaption ? `
            <figcaption>
              ${TILE_MARK}
              ${esc(w.featureCaption)}
            </figcaption>` : ''}
          </figure>
${w.items.map((it, i) => `
          <article class="why-item" data-reveal style="--d: ${(i + 1) % 3}">
            <span class="why-icon" aria-hidden="true">${iconSvg(it.icon)}</span>
            <span class="why-num">${String(i + 1).padStart(2, '0')}</span>
            <h3>${esc(it.title)}</h3>
            ${it.text ? `<p>${esc(it.text)}</p>` : ''}
          </article>`).join('')}
        </div>
      </div>
    </section>`;
    },

    // Former "How we work" section, now only its field photo strip
    standards: () => {
      const st = c.standards;
      if (!st.photos.length) return '';
      return `
    <!-- Field photos -->
    <section ${sectionAttrs('standards', '').replace(' aria-labelledby=""', ' aria-label="Our teams at work"').replace('class="section', 'class="section section-photos')}>
      <div class="container">
        <ul class="field-strip" style="--photos: ${st.photos.length}">${st.photos.map((p, i) => `
          <li data-reveal style="--d: ${i}">
            ${img(p.image, { alt: p.alt })}
          </li>`).join('')}
        </ul>
      </div>
    </section>`;
    },

    clients: () => {
      const cl = c.clients;
      const items = cl.sortAlpha
        ? [...cl.items].sort((x, y) => x.name.localeCompare(y.name, 'en', { sensitivity: 'base' }))
        : cl.items;
      return `
    <!-- Clients -->
    <section ${sectionAttrs('clients', 'clients-title')}>
      <div class="container">${head(cl.eyebrow, 'clients-title', cl.title, '', true)}

        <ul class="client-grid" id="client-list">${items.map((it, i) => `
          <li class="client${it.logo ? ' has-logo' : ''}" data-reveal style="--d: ${i % 3}">${it.logo
            ? `<span class="client-logo">${img(it.logo, { alt: '' })}</span>`
            : `<span class="client-check" aria-hidden="true">${CHECK_SVG}</span>`}${esc(it.name)}</li>`).join('')}
        </ul>

        <div class="client-more">
          <button type="button" class="btn btn-ghost client-toggle" aria-controls="client-list" aria-expanded="false" data-more-label="${esc(cl.showMoreLabel)}" data-less-label="${esc(cl.showLessLabel)}" hidden>
            <span class="client-toggle-label">${esc(cl.showMoreLabel)}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </div>
      </div>
    </section>`;
    },

    contact: () => {
      const ct = c.contact;
      const mapSrc = `https://maps.google.com/maps?q=${ct.map.lat},${ct.map.lng}&z=${ct.map.zoom}&output=embed`;
      const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ct.map.query || `${ct.map.lat},${ct.map.lng}`)}`;
      return `
    <!-- Contact -->
    <section ${sectionAttrs('contact', 'contact-title')}>
      <div class="container contact-grid">
        <div class="contact-info" data-reveal>
          ${ct.eyebrow ? `<p class="eyebrow">${esc(ct.eyebrow)}</p>` : ''}
          <h2 id="contact-title">${esc(ct.title)}</h2>
          ${ct.intro ? `<p class="contact-intro">${esc(ct.intro)}</p>` : ''}

          <ul class="contact-list">
            <li>
              <span class="contact-icon" aria-hidden="true">${PIN_SVG}</span>
              <div>
                <span class="contact-label">${esc(ct.officeLabel)}</span>
                <address>${ct.offices.map((o) => `
                  <span class="office">${esc(o.line1)}${o.line2 ? `<br />${esc(o.line2)}` : ''}</span>`).join('')}
                </address>
              </div>
            </li>
            <li>
              <span class="contact-icon" aria-hidden="true">${PHONE_SVG.replace(' aria-hidden="true"', '')}</span>
              <div>
                <span class="contact-label">${esc(ct.phoneLabel)}</span>
                <span class="contact-phones">${ct.phones.map((p) => `
                  <a href="${esc(telHref(p))}">${esc(p)}</a>`).join('')}
                </span>${ct.fax ? `
                <span class="contact-note">Fax ${esc(ct.fax)}</span>` : ''}
              </div>
            </li>
          </ul>
${ct.secondaryLabel ? `
          <div class="contact-actions">
            <a href="${esc(telHref(primaryPhone))}" class="btn btn-primary">
              ${PHONE_SVG}
              ${esc(ct.secondaryLabel)}
            </a>
          </div>` : ''}${ct.mapLabel ? `
          <a class="map-link" href="${esc(mapLink)}" target="_blank" rel="noopener">${esc(ct.mapLabel)}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>
          </a>` : ''}
        </div>

        <div class="contact-map" data-reveal style="--d: 1">
          <iframe
            title="Map showing ${esc(ct.map.query || 'our office')}"
            src="${esc(mapSrc)}"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>
    </section>`;
    },
  };

  /* ---- page ---- */
  const navLinks = navItems.map((s) => `
          <li><a href="#${SECTION_IDS[s.key]}" class="nav-link">${esc(s.navLabel)}</a></li>`).join('');
  const footerLinks = navItems.map((s) => `
          <li><a href="#${SECTION_IDS[s.key]}">${esc(s.navLabel)}</a></li>`).join('');
  const firstSection = visible[0];
  const h = c.hero;
  const f = c.facts;
  const siteUrl = c.site.url || '';
  const copyright = esc(c.footer.copyright).replace('{year}', `<span data-year>${year}</span>`);

  return `<!DOCTYPE html>
<!-- Generated by the TS Solution admin panel from data/content.json. Edit content in /admin, not here. -->
<html lang="en" class="${htmlClasses}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(c.site.title)}</title>
  <meta name="description" content="${esc(c.site.description)}" />
  <meta name="keywords" content="${esc(c.site.keywords)}" />
  <meta name="theme-color" content="${esc(c.theme.accent)}" />
  <meta name="icbm" content="${c.contact.map.lat},${c.contact.map.lng}" />
  <meta name="geo.position" content="${c.contact.map.lat};${c.contact.map.lng}" />
  <meta name="geo.placename" content="Kota Bekasi" />
  <meta property="og:title" content="${esc(c.site.ogTitle || c.site.title)}" />
  <meta property="og:description" content="${esc(c.site.ogDescription || c.site.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="en" />${siteUrl ? `
  <meta property="og:url" content="${esc(siteUrl)}" />` : ''}${siteUrl && c.site.ogImage ? `
  <meta property="og:image" content="${esc(`${siteUrl}/${c.site.ogImage}`)}" />` : ''}${siteUrl ? `
  <link rel="canonical" href="${esc(siteUrl)}" />` : ''}
  <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${esc(font.url)}" />
  <link rel="preload" as="image" href="${esc(h.image)}" />
  <link rel="stylesheet" href="assets/css/styles.css" />
  <style id="site-theme">${themeCss}
  </style>
  <script>document.documentElement.classList.add('js');</script>
  <script src="assets/js/main.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>

  <!-- Header -->
  <header class="site-header" id="top">
    <div class="container header-inner">
      <a class="brand" href="#home" aria-label="${esc(c.footer.brand)}, back to top">
        ${img(c.header.logo, { alt: c.header.logoAlt, lazy: false })}
      </a>

      <nav class="main-nav" id="main-nav" aria-label="Main">
        <ul>
          <li><a href="#home" class="nav-link">${esc(c.header.homeLabel)}</a></li>${navLinks}${c.header.ctaLabel && c.header.ctaHref ? `
          <li class="nav-cta"><a href="${esc(c.header.ctaHref)}" class="btn btn-primary btn-sm">${esc(c.header.ctaLabel)}</a></li>` : ''}
        </ul>
      </nav>

      <div class="header-actions">${c.header.showPhone ? `
        <a class="icon-btn" href="${esc(telHref(primaryPhone))}" aria-label="Call ${esc(primaryPhone)}">
          ${PHONE_SVG}
        </a>` : ''}
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-nav">
          <span class="menu-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="menu-toggle-label">Menu</span>
        </button>
      </div>
    </div>
  </header>

  <main id="main-content">

    <!-- Hero -->
    <section class="hero" id="home" aria-label="Introduction">
      <div class="hero-media" aria-hidden="true">
        ${img(h.image, { alt: '', lazy: false, extra: ' fetchpriority="high"' })}
        <span class="hero-sheen"></span>
      </div>

      <div class="container hero-inner">
        <div class="hero-content">${h.eyebrow ? `
          <p class="eyebrow hero-anim" style="--d: 0">
            ${TILE_MARK}
            ${esc(h.eyebrow)}
          </p>` : ''}
          <h1 class="hero-anim" style="--d: 1">${esc(h.title)}</h1>${h.lead ? `
          <p class="hero-lead hero-anim" style="--d: 2">${esc(h.lead)}</p>` : ''}
          <div class="hero-actions hero-anim" style="--d: 3">${h.primaryLabel && h.primaryHref ? `
            <a href="${esc(h.primaryHref)}" class="btn btn-primary">
              ${esc(h.primaryLabel)}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </a>` : ''}${h.secondaryLabel && h.secondaryHref ? `
            <a href="${esc(h.secondaryHref)}" class="btn btn-ghost">${esc(h.secondaryLabel)}</a>` : ''}
          </div>
        </div>
      </div>
${h.showScrollCue && firstSection ? `
      <a class="scroll-cue" href="#${SECTION_IDS[firstSection.key]}" aria-label="Scroll to ${esc(firstSection.navLabel)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </a>` : ''}
    </section>
${f.visible ? `
    <!-- Key facts -->
    <section class="facts" aria-label="Key facts">
      <div class="container">
        <ul class="facts-grid" style="--fact-cols: ${f.items.length}">${f.items.map((it, i) => {
          const numeric = /^\d+$/.test(it.value);
          const shown = numeric ? Number(it.value).toLocaleString('en-US') : it.value;
          const value = numeric && it.countUp ? `<span data-count="${it.value}">${shown}</span>` : esc(shown);
          return `
          <li class="fact" data-reveal style="--d: ${i}">
            <strong>${value}${esc(it.suffix)}</strong>
            <span>${esc(it.label)}</span>
          </li>`;
        }).join('')}
        </ul>
      </div>
    </section>` : ''}
${visible.map((s) => sections[s.key]()).join('\n')}
  </main>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="tile-mark tile-mark-lg" aria-hidden="true"><i></i><i></i></span>
        <div>
          <strong>${esc(c.footer.brand)}</strong>
          ${c.footer.tagline ? `<span>${esc(c.footer.tagline)}</span>` : ''}
        </div>
      </div>
      <nav aria-label="Footer">
        <h3 class="visually-hidden">Navigation</h3>
        <ul class="footer-nav">
          <li><a href="#home">${esc(c.header.homeLabel)}</a></li>${footerLinks}
        </ul>
      </nav>
    </div>${c.footer.showContact ? `
    <div class="container footer-contact">
      <a href="${esc(telHref(primaryPhone))}">${esc(primaryPhone)}</a>
    </div>` : ''}
    <div class="container footer-bottom">
      <p>${copyright}</p>${c.footer.backToTopLabel ? `
      <a href="#home" class="back-to-top">${esc(c.footer.backToTopLabel)}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
      </a>` : ''}
    </div>
  </footer>
</body>
</html>
`;
}

module.exports = { render, esc, telHref };
