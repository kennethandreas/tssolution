/* TS Solution – site interactions (no dependencies) */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Motion features switched on in the admin panel (Motion & effects)
  var root = document.documentElement;
  var motionOn = function (name) { return root.classList.contains('m-' + name); };

  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initMenu();
    initActiveNav();
    initReveal();
    initCounters();
    initClientList();
    setYear();
  });

  /* Header gains a shadow once the page is scrolled */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var ticking = false;
    var update = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* Mobile menu: toggle, close on link click, Escape, outside click or resize */
  function initMenu() {
    var toggle = document.querySelector('.menu-toggle');
    var nav = document.getElementById('main-nav');
    if (!toggle || !nav) return;

    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('is-open') && !e.target.closest('.site-header')) setOpen(false);
    });
    window.matchMedia('(min-width: 1101px)').addEventListener('change', function (mq) {
      if (mq.matches) setOpen(false);
    });
  }

  /* Highlight the nav link for the section currently in view */
  function initActiveNav() {
    var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var byId = {};
    links.forEach(function (l) { byId[l.getAttribute('href').slice(1)] = l; });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        // Sections hidden from the nav highlight the nav item they follow
        var id = entry.target.getAttribute('data-nav-group') || entry.target.id;
        links.forEach(function (l) { l.classList.remove('is-active'); l.removeAttribute('aria-current'); });
        if (byId[id]) { byId[id].classList.add('is-active'); byId[id].setAttribute('aria-current', 'true'); }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    document.querySelectorAll('main section[id]').forEach(function (el) { observer.observe(el); });
  }

  /* Reveal elements as they scroll into view */
  function initReveal() {
    var items = document.querySelectorAll('[data-reveal]');
    if (reduceMotion || !motionOn('reveal') || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible', 'is-revealed'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('is-visible');
        // Drop the stagger delay once the entrance is done so hover feels instant
        el.addEventListener('transitionend', function done(e) {
          if (e.target !== el || e.propertyName !== 'opacity') return;
          el.classList.add('is-revealed');
          el.removeEventListener('transitionend', done);
        });
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* Count up the numeric facts once, when visible */
  function initCounters() {
    var counters = document.querySelectorAll('[data-count]');
    if (reduceMotion || !motionOn('counters') || !counters.length || !('IntersectionObserver' in window)) return;

    var format = function (n) { return n.toLocaleString('en-US'); };

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count'), 10);
        var duration = 1400;
        var start = null;
        var step = function (ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = format(Math.round(target * eased));
          if (p < 1) window.requestAnimationFrame(step);
        };
        el.textContent = '0';
        window.requestAnimationFrame(step);
        obs.unobserve(el);
      });
    }, { threshold: 0.6 });

    counters.forEach(function (el) { observer.observe(el); });
  }

  /* Client list: collapse to a few rows with a Show more / Show less toggle.
     How many stay visible per breakpoint is set in CSS (.is-collapsed). */
  function initClientList() {
    var list = document.getElementById('client-list');
    var toggle = document.querySelector('.client-toggle');
    if (!list || !toggle) return;

    var label = toggle.querySelector('.client-toggle-label');
    var moreLabel = toggle.getAttribute('data-more-label') || 'Show more';
    var lessLabel = toggle.getAttribute('data-less-label') || 'Show less';
    var items = Array.prototype.slice.call(list.children);

    var hiddenCount = function () {
      return items.filter(function (el) { return getComputedStyle(el).display === 'none'; }).length;
    };

    var render = function () {
      var expanded = !list.classList.contains('is-collapsed');
      toggle.setAttribute('aria-expanded', String(expanded));
      if (expanded) {
        label.textContent = lessLabel;
        toggle.hidden = false;
      } else {
        var n = hiddenCount();
        label.textContent = moreLabel + ' (' + n + ')';
        toggle.hidden = n === 0;
      }
    };

    list.classList.add('is-collapsed');
    render();

    toggle.addEventListener('click', function () {
      var collapsing = !list.classList.contains('is-collapsed');
      list.classList.toggle('is-collapsed', collapsing);
      render();
      // After collapsing, keep the button in view so the visitor isn't left far below the list
      if (collapsing) {
        var rect = toggle.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          toggle.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      }
    });

    // Visible row count changes with the grid's column count
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 150);
    });
  }

  function setYear() {
    var el = document.querySelector('[data-year]');
    if (el) el.textContent = new Date().getFullYear();
  }
})();
