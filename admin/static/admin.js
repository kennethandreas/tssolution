/* TS Solution admin panel – vanilla JS, talks to /api/admin/* */
(function () {
  'use strict';

  /* =====================================================================
     Small DOM + data helpers
     ===================================================================== */
  const $ = (sel, el = document) => el.querySelector(sel);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c === undefined || c === null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  // Trusted, static SVG markup only (icons defined in this file or served by /meta)
  function svg(inner, cls) {
    const span = document.createElement('span');
    span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${inner}</svg>`;
    return span.firstChild;
  }

  const UI = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    header: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    facts: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    about: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    services: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    why: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    clients: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
    contact: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
    footer: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>',
    layout: '<rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10" width="18" height="5" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>',
    theme: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="7.5" r="1.5"/><circle cx="16" cy="10" r="1.5"/><path d="M12 21a3 3 0 0 1 0-6h1.5"/>',
    motion: '<path d="M4 17c3-6 6-6 8 0s5 6 8 0"/><path d="M4 9h3M17 9h3"/>',
    seo: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    media: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    account: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const splitPath = (p) => String(p).split('.').filter(Boolean);
  function getPath(obj, path) {
    return splitPath(path).reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = splitPath(path);
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }
  const join = (base, key) => (key === '' || key === undefined ? base : base ? `${base}.${key}` : String(key));
  const ruleKey = (path) => String(path).replace(/\.\d+(?=\.|$)/g, '[]');
  const fromServerPath = (p) => String(p || '').replace(/\[(\d+)\]/g, '.$1');

  function timeAgo(iso) {
    if (!iso) return '';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }
  const fullDate = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  /* =====================================================================
     State + API
     ===================================================================== */
  const S = {
    csrf: '', user: '', meta: null,
    content: null, savedJson: '', version: '', updatedAt: null, updatedBy: null,
    route: 'overview', saving: false, openItems: new Set(), titleUpdaters: [],
  };
  const DRAFT_KEY = 'tss-admin-draft';

  async function api(method, url, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = S.csrf;
    let res;
    try {
      res = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw Object.assign(new Error('Could not reach the server. Check your connection and try again.'), { status: 0 });
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (res.status === 401) { sessionExpired(); throw Object.assign(new Error(data.error || 'Session expired'), { status: 401 }); }
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, field: data.field });
    return data;
  }

  function sessionExpired() {
    if (isDirty()) {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ version: S.version, content: S.content })); } catch { /* storage unavailable */ }
    }
    window.removeEventListener('beforeunload', beforeUnload);
    window.location.replace('/admin/login');
  }

  const isDirty = () => S.content && JSON.stringify(S.content) !== S.savedJson;

  function applyState(state) {
    S.content = clone(state.content);
    S.savedJson = JSON.stringify(state.content);
    S.version = state.version;
    S.updatedAt = state.updatedAt;
    S.updatedBy = state.updatedBy;
  }

  /* =====================================================================
     Feedback: toasts + confirm dialog
     ===================================================================== */
  function toast(type, title, message, action) {
    const el = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
      h('span', { class: 't-icon' }, svg(type === 'error' ? UI.alert : UI.check)),
      h('div', { class: 't-body' }, h('strong', { text: title }), message ? h('span', { text: message }) : null,
        action ? h('div', null, h('a', { href: action.href, target: '_blank', rel: 'noopener', text: action.label })) : null),
      h('button', { class: 't-close', type: 'button', 'aria-label': 'Dismiss', text: '×', onclick: () => dismiss() }));
    const dismiss = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 250); };
    $('#toasts').append(el);
    setTimeout(dismiss, type === 'error' ? 9000 : 4500);
  }

  function confirmDialog({ title, text, ok = 'Confirm', danger = false }) {
    const dlg = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    const okBtn = $('#confirm-ok');
    okBtn.textContent = ok;
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    return new Promise((resolve) => {
      dlg.returnValue = 'cancel';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
      $('#confirm-cancel').focus();
    });
  }

  document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  // Close on backdrop clicks only: e.target is also the dialog for clicks on its own padding,
  // so check the pointer really is outside the dialog box.
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => {
    if (e.target !== d || e.detail === 0) return; // detail 0 = keyboard-triggered
    const r = d.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) d.close();
  }));

  /* =====================================================================
     Field renderers
     ===================================================================== */
  function onEdited() {
    S.titleUpdaters.forEach((fn) => fn());
    updateChrome();
  }

  function fieldShell(path, label, input, { help, count, required } = {}) {
    const id = `f-${path.replace(/[^a-z0-9]/gi, '-')}`;
    if (input.tagName && !input.id) input.id = id;
    const counter = count ? h('span', { class: 'count' }) : null;
    const wrap = h('div', { class: 'field', dataset: { path } },
      label ? h('label', { for: input.id || id }, h('span', null, label, required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null), counter) : null,
      input,
      help ? h('p', { class: 'help', text: help }) : null);
    if (counter) {
      const update = () => {
        const n = input.value.length;
        counter.textContent = `${n}/${count}`;
        counter.classList.toggle('over', n > count);
      };
      input.addEventListener('input', update);
      update();
    }
    return wrap;
  }

  function textField(spec, base) {
    const path = join(base, spec.key);
    const rule = S.meta.rules[ruleKey(path)] || {};
    const multiline = spec.type === 'textarea';
    const input = h(multiline ? 'textarea' : 'input', {
      type: multiline ? undefined : 'text',
      rows: multiline ? spec.rows || 3 : undefined,
      maxlength: rule.max, placeholder: spec.placeholder,
      required: rule.required || undefined, spellcheck: spec.mono ? 'false' : undefined,
      list: spec.datalist, autocomplete: 'off',
    });
    input.value = getPath(S.content, path) ?? '';
    input.addEventListener('input', () => { setPath(S.content, path, input.value); clearError(input); onEdited(); });
    if (spec.inline) return input;
    return fieldShell(path, spec.label, input, { help: spec.help, count: rule.max && rule.max >= 40 ? rule.max : null, required: rule.required });
  }

  function linkField(spec, base) {
    return textField({ ...spec, mono: true, datalist: 'section-links', placeholder: spec.placeholder || '#contact',
      help: spec.help || 'A section (#services), a web address (https://…), mailto:, tel: or a page path (/…).' }, base);
  }

  function numberField(spec, base) {
    const path = join(base, spec.key);
    const rule = S.meta.rules[ruleKey(path)] || {};
    const input = h('input', { type: 'number', min: rule.min, max: rule.max, step: spec.step || (rule.integer ? 1 : 'any') });
    input.value = getPath(S.content, path) ?? '';
    input.addEventListener('input', () => {
      setPath(S.content, path, input.value === '' ? '' : Number(input.value));
      clearError(input); onEdited();
    });
    return fieldShell(path, spec.label, input, { help: spec.help });
  }

  function toggleField(spec, base) {
    const path = join(base, spec.key);
    const input = h('input', { type: 'checkbox', checked: Boolean(getPath(S.content, path)) });
    input.addEventListener('change', () => { setPath(S.content, path, input.checked); onEdited(); if (spec.onchange) spec.onchange(input.checked); });
    return h('label', { class: 'toggle', dataset: { path } }, input, h('span', { class: 'track', 'aria-hidden': 'true' }),
      h('span', { class: 'toggle-text' }, h('strong', { text: spec.label }), spec.help ? h('span', { text: spec.help }) : null));
  }

  function selectField(spec, base) {
    const path = join(base, spec.key);
    const options = typeof spec.options === 'function' ? spec.options() : spec.options;
    const select = h('select', null, options.map(([v, l]) => h('option', { value: v, text: l })));
    select.value = String(getPath(S.content, path));
    select.addEventListener('change', () => {
      const raw = select.value;
      setPath(S.content, path, spec.numeric ? Number(raw) : raw);
      onEdited();
      if (spec.onchange) spec.onchange(raw);
    });
    return fieldShell(path, spec.label, select, { help: typeof spec.help === 'function' ? spec.help() : spec.help });
  }

  function iconField(spec, base) {
    const path = join(base, spec.key);
    const icons = S.meta.icons;
    const preview = h('span', { class: 'icon-preview' });
    const paint = () => { preview.replaceChildren(svg((icons[getPath(S.content, path)] || icons.check).svg)); };
    const select = h('select', null, Object.entries(icons).map(([k, v]) => h('option', { value: k, text: v.label })));
    select.value = getPath(S.content, path);
    select.addEventListener('change', () => { setPath(S.content, path, select.value); paint(); onEdited(); });
    paint();
    const row = h('div', { class: 'icon-select' }, preview, select);
    select.id = `f-${path.replace(/[^a-z0-9]/gi, '-')}`;
    return fieldShell(path, spec.label || 'Icon', row, {});
  }

  function colorField(spec, base) {
    const path = join(base, spec.key);
    const value = getPath(S.content, path);
    const picker = h('input', { type: 'color', value, 'aria-label': `${spec.label} picker` });
    const hex = h('input', { type: 'text', value, maxlength: 7, spellcheck: 'false' });
    const sync = (v, from) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
      setPath(S.content, path, v.toLowerCase());
      if (from !== picker) picker.value = v;
      if (from !== hex) hex.value = v.toLowerCase();
      clearError(hex);
      onEdited();
      if (spec.onchange) spec.onchange();
    };
    picker.addEventListener('input', () => sync(picker.value, picker));
    hex.addEventListener('input', () => sync(hex.value.trim(), hex));
    hex.id = `f-${path.replace(/[^a-z0-9]/gi, '-')}`;
    const wrap = fieldShell(path, spec.label, h('div', { class: 'color-row' }, picker, hex), { help: spec.help });
    wrap.querySelector('label').setAttribute('for', hex.id);
    if (spec.after) wrap.append(spec.after(path));
    return wrap;
  }

  function imageField(spec, base) {
    const path = join(base, spec.key);
    const rule = S.meta.rules[ruleKey(path)] || {};
    const box = h('div', { class: 'image-field' });
    const draw = () => {
      const val = getPath(S.content, path);
      const info = val && S.mediaIndex ? S.mediaIndex.get(val) : null;
      box.replaceChildren(
        h('div', { class: `image-thumb${val ? '' : ' empty'}` }, val ? h('img', { src: `/${val}`, alt: '' }) : 'No image'),
        h('div', { class: 'image-meta' },
          val ? h('code', { text: val }) : h('span', { class: 'help', text: 'No image selected' }),
          info && info.width ? h('span', { class: 'help', text: `${info.width} × ${info.height}px · ${kb(info.size)}` }) : null,
          h('div', { class: 'image-actions' },
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: val ? 'Replace…' : 'Choose image…',
              onclick: () => openMediaPicker(val, (picked) => { setPath(S.content, path, picked); draw(); onEdited(); }) }),
            rule.optional && val ? h('button', { type: 'button', class: 'link-btn', text: 'Remove',
              onclick: () => { setPath(S.content, path, ''); draw(); onEdited(); } }) : null)));
    };
    draw();
    const wrap = h('div', { class: 'field', dataset: { path } },
      h('span', { class: 'field-label' }, h('span', null, spec.label, rule.optional ? '' : h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }))),
      box, spec.help ? h('p', { class: 'help', text: spec.help }) : null);
    return wrap;
  }

  /* ---------- repeatable lists ---------- */
  function listField(spec, base) {
    const path = join(base, spec.key);
    const rule = S.meta.rules[ruleKey(path)] || { min: 0, max: 99 };
    const wrap = h('div', { class: spec.sub ? 'sub-list' : '', dataset: { path } });
    let filter = '';

    const titleOf = (item, i) => {
      const t = spec.title ? spec.title(item, i) : (typeof item === 'string' ? item : '');
      return t && String(t).trim() ? String(t) : null;
    };

    function moveOpen(i, j) {
      const a = `${path}.${i}`, b = `${path}.${j}`;
      const next = new Set();
      S.openItems.forEach((k) => {
        if (k === a || k.startsWith(`${a}.`)) next.add(b + k.slice(a.length));
        else if (k === b || k.startsWith(`${b}.`)) next.add(a + k.slice(b.length));
        else next.add(k);
      });
      S.openItems = next;
    }

    function draw() {
      const arr = getPath(S.content, path) || [];
      const order = spec.order ? spec.order(arr) : arr.map((_, i) => i);
      const sortable = spec.sortable !== false && !(spec.sortLocked && spec.sortLocked());
      S.titleUpdaters = S.titleUpdaters.filter((fn) => fn.owner !== wrap);

      const toolbar = h('div', { class: 'list-toolbar' },
        h('span', { class: 'list-meta', text: `${arr.length} item${arr.length === 1 ? '' : 's'}${rule.max < 50 ? ` · max ${rule.max}` : ''}${spec.sortLocked && spec.sortLocked() ? ' · shown A–Z' : ''}` }),
        spec.search ? h('input', { type: 'search', placeholder: `Search ${spec.label.toLowerCase()}…`, value: filter, 'aria-label': `Search ${spec.label}`,
          oninput: (e) => { filter = e.target.value.toLowerCase(); applyFilter(); } }) : null);

      const list = h('div', { class: 'list' });
      if (!arr.length) list.append(h('div', { class: 'list-empty', text: spec.empty || 'Nothing here yet.' }));

      order.forEach((i, pos) => {
        const itemPath = `${path}.${i}`;
        const item = arr[i];
        const open = S.openItems.has(itemPath);
        const actions = h('div', { class: 'item-actions' },
          sortable ? h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move up', title: 'Move up', disabled: pos === 0 || undefined,
            onclick: () => { swap(i, order[pos - 1]); } }, svg(UI.up)) : null,
          sortable ? h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move down', title: 'Move down', disabled: pos === order.length - 1 || undefined,
            onclick: () => { swap(i, order[pos + 1]); } }, svg(UI.down)) : null,
          h('button', { type: 'button', class: 'icon-button danger', 'aria-label': 'Delete', title: arr.length <= rule.min ? `At least ${rule.min} required` : 'Delete',
            disabled: arr.length <= rule.min || undefined, onclick: () => remove(i) }, svg(UI.trash)));

        let el;
        if (spec.simple) {
          // one inline input per row (bullets, phone numbers, paragraphs)
          const input = spec.simple === 'textarea'
            ? textField({ type: 'textarea', key: '', inline: true, rows: 3 }, itemPath)
            : textField({ type: 'text', key: '', inline: true, placeholder: spec.placeholder }, itemPath);
          input.setAttribute('aria-label', `${spec.itemLabel || 'Item'} ${pos + 1}`);
          el = h('div', { class: 'item simple', dataset: { path: itemPath } },
            h('div', { class: 'item-head' }, h('span', { class: 'item-index', text: pos + 1 }), h('div', { class: 'field', style: 'flex:1;margin:0', dataset: { path: itemPath } }, input), actions));
        } else {
          const titleEl = h('span', { class: 'item-title' });
          const thumbSrc = spec.thumb ? spec.thumb(item) : null;
          const paintTitle = () => {
            const t = titleOf(getPath(S.content, itemPath), i);
            titleEl.textContent = t || `Untitled ${spec.itemLabel || 'item'}`;
            titleEl.classList.toggle('placeholder', !t);
          };
          paintTitle();
          paintTitle.owner = wrap;
          S.titleUpdaters.push(paintTitle);
          const body = h('div', { class: 'item-body', hidden: !open || undefined }, renderFields(spec.item, itemPath));
          const handle = h('button', { type: 'button', class: 'item-handle', 'aria-expanded': String(open) },
            svg(UI.chevron, 'chev'), h('span', { class: 'item-index', text: pos + 1 }),
            thumbSrc ? h('img', { class: 'item-thumb', src: `/${thumbSrc}`, alt: '' }) : null, titleEl);
          el = h('div', { class: `item${open ? ' open' : ''}`, dataset: { path: itemPath } }, h('div', { class: 'item-head' }, handle, actions), body);
          handle.addEventListener('click', () => {
            const isOpen = body.hidden;
            body.hidden = !isOpen;
            el.classList.toggle('open', isOpen);
            handle.setAttribute('aria-expanded', String(isOpen));
            if (isOpen) S.openItems.add(itemPath); else S.openItems.delete(itemPath);
          });
        }
        el.dataset.index = i;
        list.append(el);
      });

      const add = h('button', { type: 'button', class: 'btn btn-ghost btn-sm list-add', disabled: arr.length >= rule.max || undefined,
        onclick: () => {
          const next = getPath(S.content, path);
          next.push(spec.newItem ? spec.newItem() : '');
          if (!spec.simple) S.openItems.add(`${path}.${next.length - 1}`);
          onEdited(); draw();
          const last = wrap.querySelector(`[data-path="${path}.${next.length - 1}"] input, [data-path="${path}.${next.length - 1}"] textarea`);
          if (last) last.focus();
        } }, svg(UI.plus), arr.length >= rule.max ? `Maximum of ${rule.max} reached` : spec.addLabel || 'Add item');

      // replaceChildren would print null as text, so drop the optional parts that are absent
      wrap.replaceChildren(...[
        spec.sub ? h('span', { class: 'field-label', text: spec.label }) : null,
        toolbar, list, add, spec.extra ? spec.extra(draw) : null,
        spec.help ? h('p', { class: 'help', text: spec.help }) : null,
      ].filter(Boolean));
      applyFilter();
    }

    // match against the current data, so items renamed since the last draw are found too
    function applyFilter() {
      const arr = getPath(S.content, path) || [];
      wrap.querySelectorAll(':scope > .list > .item').forEach((el) => {
        const t = (titleOf(arr[Number(el.dataset.index)], Number(el.dataset.index)) || '').toLowerCase();
        el.hidden = Boolean(filter) && !t.includes(filter);
      });
    }

    function swap(i, j) {
      const arr = getPath(S.content, path);
      [arr[i], arr[j]] = [arr[j], arr[i]];
      moveOpen(i, j);
      onEdited(); draw();
      const btn = wrap.querySelector(`[data-path="${path}.${j}"] .item-actions button`);
      if (btn) btn.closest('.item').querySelector('.item-handle, input, textarea').focus();
    }

    async function remove(i) {
      const arr = getPath(S.content, path);
      const label = titleOf(arr[i], i);
      if (!spec.simple || (label && label.length > 0 && spec.confirmDelete)) {
        const ok = await confirmDialog({ title: `Delete ${spec.itemLabel || 'item'}?`, text: label ? `“${label}” will be removed when you save.` : 'This item will be removed when you save.', ok: 'Delete', danger: true });
        if (!ok) return;
      }
      arr.splice(i, 1);
      S.openItems = new Set([...S.openItems].filter((k) => !k.startsWith(`${path}.`)));
      onEdited(); draw();
    }

    wrap.redraw = draw;
    draw();
    return wrap;
  }

  /* ---------- spec dispatcher ---------- */
  function renderFields(specs, base) {
    const list = Array.isArray(specs) ? specs : [specs];
    return list.map((spec) => renderField(spec, base));
  }

  function renderField(spec, base = '') {
    switch (spec.type) {
      case 'text': case 'textarea': return textField(spec, base);
      case 'link': return linkField(spec, base);
      case 'number': return numberField(spec, base);
      case 'toggle': return toggleField(spec, base);
      case 'select': return selectField(spec, base);
      case 'icon': return iconField(spec, base);
      case 'color': return colorField(spec, base);
      case 'image': return imageField(spec, base);
      case 'list': return listField(spec, base);
      case 'grid': return h('div', { class: `grid-${spec.cols || 2}` }, renderFields(spec.fields, base));
      case 'card': return h('section', { class: 'card' },
        spec.title ? h('div', { class: 'card-head' }, h('div', null, h('h2', { text: spec.title }), spec.help ? h('p', { text: spec.help }) : null), spec.aside ? spec.aside() : null) : null,
        renderFields(spec.fields || [], base));
      case 'custom': return spec.render(base);
      default: throw new Error(`Unknown field type ${spec.type}`);
    }
  }

  // shorthand builders
  const F = {
    text: (key, label, o = {}) => ({ type: 'text', key, label, ...o }),
    area: (key, label, o = {}) => ({ type: 'textarea', key, label, ...o }),
    link: (key, label, o = {}) => ({ type: 'link', key, label, ...o }),
    toggle: (key, label, help, o = {}) => ({ type: 'toggle', key, label, help, ...o }),
    image: (key, label, o = {}) => ({ type: 'image', key, label, ...o }),
    icon: (key, label) => ({ type: 'icon', key, label }),
    grid: (fields, cols = 2) => ({ type: 'grid', fields, cols }),
    card: (title, fields, o = {}) => ({ type: 'card', title, fields, ...o }),
    list: (key, label, o = {}) => ({ type: 'list', key, label, ...o }),
  };

  /* =====================================================================
     Panels
     ===================================================================== */
  const SECTION_NAMES = {
    about: ['About us', 'Company story, sectors, P Project, values'],
    services: ['Services', 'Service cards with photos and lists'],
    whyUs: ['Why us', 'Added value: feature photo + 7 points'],
    standards: ['Field photos', 'Photo strip of our teams at work'],
    clients: ['Clients', 'Client names/logos with Show more'],
    contact: ['Contact', 'Offices, phones, map'],
  };

  const PANELS = [
    { id: 'overview', label: 'Overview', icon: UI.overview, keys: [] },
    { group: 'Content' },
    { id: 'header', label: 'Header & hero', icon: UI.header, keys: ['header', 'hero'] },
    { id: 'facts', label: 'Key facts', icon: UI.facts, keys: ['facts'] },
    { id: 'about', label: 'About us', icon: UI.about, keys: ['about'] },
    { id: 'services', label: 'Services', icon: UI.services, keys: ['services'] },
    { id: 'whyUs', label: 'Why us', icon: UI.why, keys: ['whyUs'] },
    { id: 'standards', label: 'Field photos', icon: UI.media, keys: ['standards'] },
    { id: 'clients', label: 'Clients', icon: UI.clients, keys: ['clients'] },
    { id: 'contact', label: 'Contact', icon: UI.contact, keys: ['contact'] },
    { id: 'footer', label: 'Footer', icon: UI.footer, keys: ['footer'] },
    { group: 'Design' },
    { id: 'layout', label: 'Sections & order', icon: UI.layout, keys: ['layout'] },
    { id: 'theme', label: 'Colors & fonts', icon: UI.theme, keys: ['theme'] },
    { id: 'motion', label: 'Motion & effects', icon: UI.motion, keys: ['motion'] },
    { group: 'Site' },
    { id: 'seo', label: 'SEO & sharing', icon: UI.seo, keys: ['site'] },
    { id: 'media', label: 'Media library', icon: UI.media, keys: [] },
    { id: 'history', label: 'Version history', icon: UI.history, keys: [] },
    { id: 'account', label: 'Account', icon: UI.account, keys: [] },
  ];
  const panelById = Object.fromEntries(PANELS.filter((p) => p.id).map((p) => [p.id, p]));
  const panelForKey = (key) => PANELS.find((p) => p.keys && p.keys.includes(key)) || panelById.overview;

  const sectionHeadCard = (prefix, title, { subtitle = true } = {}) => F.card(title, [
    F.grid([F.text(`${prefix}.eyebrow`, 'Small label above the title', { help: 'Optional, shown in orange capitals.' }), F.text(`${prefix}.title`, 'Section title')]),
    subtitle ? F.area(`${prefix}.subtitle`, 'Intro text', { rows: 2 }) : null,
  ].filter(Boolean));

  const bulletList = (key, label) => F.list(key, label, {
    sub: true, itemLabel: 'line', addLabel: 'Add line', title: (b) => (b.note ? `${b.text} ${b.note}` : b.text),
    newItem: () => ({ text: '', note: '' }),
    item: [F.grid([F.text('text', 'Text'), F.text('note', 'Small note (optional)', { help: 'Shown smaller underneath, e.g. (Regular contract).' })])],
  });

  const PANEL_FIELDS = {
    header: [
      F.card('Header', [
        F.image('header.logo', 'Logo', { help: 'Shown at 168 px wide. A transparent PNG works best.' }),
        F.grid([F.text('header.logoAlt', 'Logo description (for screen readers)'), F.text('header.homeLabel', 'First menu item')]),
        F.grid([F.text('header.ctaLabel', 'Menu button label', { help: 'Leave empty to hide the orange menu button.' }), F.link('header.ctaHref', 'Menu button link')]),
        F.toggle('header.showPhone', 'Show call button in the header', 'Uses the first phone number from Contact.'),
      ], { help: 'Logo and navigation bar. Menu items come from Sections & order.' }),
      F.card('Hero', [
        F.text('hero.eyebrow', 'Small label above the headline'),
        F.area('hero.title', 'Headline', { rows: 2 }),
        F.area('hero.lead', 'Intro paragraph', { rows: 3 }),
        F.image('hero.image', 'Background photo', { help: 'Wide photo (about 1920 × 870). People should stand on the left; the text sits on the right.' }),
        F.grid([F.text('hero.primaryLabel', 'Main button label'), F.link('hero.primaryHref', 'Main button link')]),
        F.grid([F.text('hero.secondaryLabel', 'Second button label'), F.link('hero.secondaryHref', 'Second button link')]),
        F.toggle('hero.showScrollCue', 'Show the scroll-down arrow'),
      ], { help: 'The first screen visitors see.' }),
    ],
    facts: [
      F.card('Key facts', [
        F.toggle('facts.visible', 'Show the key facts bar', 'The white bar overlapping the bottom of the hero.'),
        F.list('facts.items', 'Facts', {
          itemLabel: 'fact', addLabel: 'Add fact', title: (f) => `${f.value}${f.suffix} ${f.label}`.trim(),
          newItem: () => ({ value: '', suffix: '', label: '', countUp: true }),
          item: [
            F.grid([F.text('value', 'Number or short value', { help: 'Digits only to animate, e.g. 1500 (shown as 1,500).' }), F.text('suffix', 'After the number', { help: 'e.g. + or %' })]),
            F.text('label', 'Label'),
            F.toggle('countUp', 'Count up when scrolled into view', 'Only works when the value is a whole number.'),
          ],
        }),
      ], { help: 'Up to 4 short figures. They count up once when they appear.' }),
    ],
    about: [
      F.card('Introduction', [
        F.grid([F.text('about.eyebrow', 'Small label above the title'), F.text('about.title', 'Section title')]),
        F.area('about.lead', 'Lead paragraph (larger text)', { rows: 3 }),
        F.list('about.paragraphs', 'More paragraphs', { sub: true, simple: 'textarea', itemLabel: 'Paragraph', addLabel: 'Add paragraph', confirmDelete: true }),
      ]),
      F.card('Sectors', [
        F.list('about.sectors', 'Sectors', {
          itemLabel: 'sector', addLabel: 'Add sector', title: (s) => s.label, newItem: () => ({ icon: 'office', label: '' }),
          item: [F.grid([F.icon('icon', 'Icon'), F.text('label', 'Sector name')])],
        }),
      ], { help: 'Shown as a list beside the introduction.' }),
      F.card('“P Project” highlight', [
        F.toggle('about.project.visible', 'Show this highlight'),
        F.grid([F.text('about.project.badge', 'Badge letter(s)'), F.text('about.project.title', 'Title')]),
        F.area('about.project.text', 'Text', { rows: 5 }),
      ]),
      F.card('Values', [
        F.list('about.values', 'Values', {
          itemLabel: 'value', addLabel: 'Add value', title: (v) => v.title, newItem: () => ({ icon: 'check', title: '', text: '' }),
          item: [F.grid([F.icon('icon', 'Icon'), F.text('title', 'Title')]), F.text('text', 'Short description')],
        }),
      ], { help: 'Small cards under the highlight (up to 4).' }),
    ],
    services: [
      sectionHeadCard('services', 'Section heading'),
      F.card('Services', [
        F.list('services.items', 'Services', {
          itemLabel: 'service', addLabel: 'Add service', title: (s) => s.title, thumb: (s) => s.image,
          newItem: () => ({ title: '', image: 'assets/img/cleaner.webp', imageAlt: '', bullets: [{ text: '', note: '' }] }),
          item: [
            F.text('title', 'Service name'),
            F.image('image', 'Photo', { help: 'Shown in a 4:3 frame; square or landscape photos work best.' }),
            F.text('imageAlt', 'Photo description (for screen readers)'),
            bulletList('bullets', 'What is included'),
          ],
        }),
      ], { help: 'Each service is a card with a photo and a checklist.' }),
    ],
    whyUs: [
      sectionHeadCard('whyUs', 'Section heading'),
      F.card('Feature photo', [
        F.image('whyUs.featureImage', 'Photo'),
        F.grid([F.text('whyUs.featureCaption', 'Caption on the photo'), F.text('whyUs.featureAlt', 'Photo description (for screen readers)')]),
      ]),
      F.card('Points', [
        F.list('whyUs.items', 'Points', {
          itemLabel: 'point', addLabel: 'Add point', title: (p) => p.title, newItem: () => ({ icon: 'check', title: '', text: '' }),
          item: [F.grid([F.icon('icon', 'Icon'), F.text('title', 'Title')]), F.area('text', 'Description', { rows: 2 })],
        }),
      ], { help: 'Numbered automatically (01, 02…) in the order shown here.' }),
    ],
    standards: [
      F.card('Field photos', [
        F.list('standards.photos', 'Photos', {
          itemLabel: 'photo', addLabel: 'Add photo', title: (p) => p.alt || p.image, thumb: (p) => p.image,
          newItem: () => ({ image: 'assets/img/field-cleaning.webp', alt: '' }),
          item: [F.image('image', 'Photo', { help: 'Shown in a portrait 4:5 frame.' }), F.text('alt', 'Photo description (for screen readers)')],
        }),
      ], { help: 'Up to 4 photos shown in a row between “Why us” and the clients. Remove all photos to hide the strip.' }),
    ],
    clients: [
      F.card('Section settings', [
        F.grid([F.text('clients.eyebrow', 'Small label above the title'), F.text('clients.title', 'Section title')]),
        F.toggle('clients.sortAlpha', 'Sort clients alphabetically (A–Z)', 'Turn off to use the order of the list below.', { onchange: () => { const l = document.querySelector('[data-path="clients.items"]'); if (l && l.redraw) l.redraw(); } }),
        { type: 'select', key: 'clients.collapsedRows', label: 'Rows shown before “Show more”', numeric: true,
          options: [2, 3, 4, 5].map((r) => [String(r), `${r} rows — ${r * 3} clients on desktop, ${Math.min(r * 3, (r + 1) * 2)} on tablet, ${r * 2} on mobile`]) },
        F.grid([F.text('clients.showMoreLabel', '“Show more” button label', { help: 'The number of hidden clients is added automatically.' }), F.text('clients.showLessLabel', '“Show less” button label')]),
      ]),
      F.card('Clients', [
        F.list('clients.items', 'Clients', {
          itemLabel: 'client', addLabel: 'Add client', search: true, title: (c) => c.name, thumb: (c) => c.logo || null,
          newItem: () => ({ name: '', logo: '' }), empty: 'No clients yet.',
          sortLocked: () => S.content.clients.sortAlpha,
          order: (arr) => (S.content.clients.sortAlpha
            ? arr.map((_, i) => i).sort((a, b) => (arr[a].name || '').localeCompare(arr[b].name || '', 'en', { sensitivity: 'base' }))
            : arr.map((_, i) => i)),
          item: [
            F.text('name', 'Client name'),
            F.image('logo', 'Logo (optional)', { help: 'Shown in a fixed 76 × 44 px box so all logos line up. PNG with transparent background recommended.' }),
          ],
          extra: (redraw) => bulkAdd(redraw),
        }),
      ], { help: 'Shown as tiles. Clients with a logo show the logo instead of the check mark.' }),
    ],
    contact: [
      F.card('Section heading', [
        F.grid([F.text('contact.eyebrow', 'Small label above the title'), F.text('contact.title', 'Section title')]),
        F.area('contact.intro', 'Intro text', { rows: 2 }),
      ]),
      F.card('Offices', [
        F.text('contact.officeLabel', 'Label'),
        F.list('contact.offices', 'Offices', {
          itemLabel: 'office', addLabel: 'Add office', title: (o) => [o.line1, o.line2].filter(Boolean).join(', '),
          newItem: () => ({ line1: '', line2: '' }),
          item: [F.grid([F.text('line1', 'Address line 1'), F.text('line2', 'Address line 2')])],
        }),
      ]),
      F.card('Phone & fax', [
        F.text('contact.phoneLabel', 'Phone label'),
        F.list('contact.phones', 'Phone numbers', { sub: true, simple: 'text', itemLabel: 'Phone', addLabel: 'Add phone number', placeholder: '(021) 2962 0480',
          help: 'The first number is used for the header call button and “Call us”. Numbers starting with 0 are dialled as +62.' }),
        F.text('contact.fax', 'Fax (optional)'),
      ]),
      F.card('Buttons', [
        F.grid([F.text('contact.secondaryLabel', 'Call button label', { help: 'Leave empty to hide.' }), F.text('contact.mapLabel', '“Open in Google Maps” link label', { help: 'Leave empty to hide the link.' })]),
      ]),
      F.card('Map', [
        F.grid([{ type: 'number', key: 'contact.map.lat', label: 'Latitude', step: 'any' }, { type: 'number', key: 'contact.map.lng', label: 'Longitude', step: 'any' }]),
        F.grid([{ type: 'number', key: 'contact.map.zoom', label: 'Zoom (3–20)' }, F.text('contact.map.query', 'Place name for the Google Maps link')]),
      ], { help: 'Tip: right-click your office in Google Maps and click the coordinates to copy them.' }),
    ],
    footer: [
      F.card('Footer', [
        F.grid([F.text('footer.brand', 'Company name'), F.text('footer.tagline', 'Line under the name')]),
        F.text('footer.copyright', 'Copyright line', { help: '{year} is replaced with the current year.' }),
        F.text('footer.backToTopLabel', '“Back to top” label', { help: 'Leave empty to hide.' }),
        F.toggle('footer.showContact', 'Show the phone number in the footer', 'Uses the first phone number from Contact.'),
      ], { help: 'Footer links follow the menu (Sections & order).' }),
    ],
    seo: [
      F.card('Search engines', [
        F.text('site.title', 'Page title', { help: 'Shown in browser tabs and Google results. Aim for under 60 characters.' }),
        F.area('site.description', 'Description', { rows: 3, help: 'Shown under the title in Google results. Aim for 120–160 characters.' }),
        F.text('site.keywords', 'Keywords (comma separated)'),
        F.text('site.url', 'Website address', { mono: true, help: 'Used for the canonical link and share image, e.g. https://tssolution.co.id' }),
      ]),
      F.card('Sharing (WhatsApp, LinkedIn, Facebook…)', [
        F.text('site.ogTitle', 'Share title', { help: 'Leave empty to use the page title.' }),
        F.area('site.ogDescription', 'Share description', { rows: 2, help: 'Leave empty to use the description.' }),
        F.image('site.ogImage', 'Share image', { help: 'JPEG or PNG about 1200 × 630 works best on every platform.' }),
      ]),
    ],
  };

  /* bulk add for clients */
  function bulkAdd(redraw) {
    const area = h('textarea', { rows: 4, placeholder: 'One client name per line', 'aria-label': 'Client names, one per line' });
    const details = h('details', { class: 'bulk' },
      h('summary', { class: 'link-btn', text: 'Add several clients at once' }),
      h('div', { class: 'field', style: 'margin-top:.75rem' }, area,
        h('div', { class: 'image-actions' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Add to list', onclick: () => {
          const items = S.content.clients.items;
          const existing = new Set(items.map((c) => c.name.trim().toLowerCase()));
          const max = S.meta.rules['clients.items'].max;
          let added = 0, skipped = 0;
          area.value.split('\n').map((s) => s.trim()).filter(Boolean).forEach((name) => {
            if (existing.has(name.toLowerCase()) || items.length >= max) { skipped++; return; }
            items.push({ name: name.slice(0, 100), logo: '' }); existing.add(name.toLowerCase()); added++;
          });
          area.value = '';
          onEdited(); redraw();
          toast('success', `${added} client${added === 1 ? '' : 's'} added`, skipped ? `${skipped} skipped (duplicates or list full).` : 'Remember to save & publish.');
        } }))));
    return details;
  }

  /* ---------- custom panels ---------- */
  function overviewPanel() {
    const c = S.content;
    const visible = c.layout.filter((s) => s.visible);
    const logos = c.clients.items.filter((x) => x.logo).length;
    const stat = (n, label) => h('div', { class: 'stat' }, h('strong', { text: n }), h('span', { text: label }));
    const row = (ok, text) => h('div', { class: 'check-row' }, h('span', { class: `mark${ok ? '' : ' warn'}` }, svg(ok ? UI.check : UI.alert)), h('span', { text }));
    const shortcut = (id) => h('a', { class: 'shortcut', href: `#${id}` }, svg(panelById[id].icon), panelById[id].label);
    const hidden = c.layout.filter((s) => !s.visible).map((s) => SECTION_NAMES[s.key][0]);
    return [
      h('p', { class: 'panel-intro', text: `Signed in as ${S.user}. Edit any part of the landing page, preview it, then “Save & publish” to update the live website.` }),
      h('div', { class: 'stats' },
        stat(`${visible.length}/${c.layout.length}`, 'sections visible'),
        stat(c.services.items.length, 'services'),
        stat(c.clients.items.length, 'clients'),
        stat(S.updatedAt ? timeAgo(S.updatedAt) : '—', S.updatedBy ? `last published by ${S.updatedBy}` : 'last published')),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Quick edit' })),
        h('div', { class: 'shortcuts' }, ['header', 'facts', 'services', 'clients', 'contact', 'layout', 'theme', 'media'].map(shortcut))),
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Status' })),
        row(!isDirty(), isDirty() ? 'You have unsaved changes — preview them, then Save & publish.' : 'Everything is published.'),
        row(!hidden.length, hidden.length ? `Hidden sections: ${hidden.join(', ')}.` : 'All sections are visible.'),
        row(true, `${logos} of ${c.clients.items.length} clients have a logo${c.clients.sortAlpha ? ', sorted A–Z' : ''}.`),
        row(c.contact.phones.length > 0, `Main phone number: ${c.contact.phones[0]}`)),
    ];
  }

  function layoutPanel() {
    const card = h('section', { class: 'card' });
    const draw = () => {
      const rows = S.content.layout.map((s, i) => {
        const vis = h('input', { type: 'checkbox', checked: s.visible, 'aria-label': `Show ${SECTION_NAMES[s.key][0]}` });
        vis.addEventListener('change', () => { s.visible = vis.checked; onEdited(); draw(); });
        const nav = h('input', { type: 'checkbox', checked: s.inNav, 'aria-label': `Show ${SECTION_NAMES[s.key][0]} in menu` });
        nav.addEventListener('change', () => { s.inNav = nav.checked; onEdited(); });
        const label = h('input', { type: 'text', value: s.navLabel, maxlength: 30, 'aria-label': `Menu label for ${SECTION_NAMES[s.key][0]}` });
        label.addEventListener('input', () => { s.navLabel = label.value; clearError(label); onEdited(); });
        const move = (d) => { const arr = S.content.layout; [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; onEdited(); draw(); card.querySelectorAll('.order-btns')[i + d].querySelector(d < 0 ? 'button' : 'button:last-child').focus(); };
        return h('div', { class: `layout-row${s.visible ? '' : ' is-hidden'}`, dataset: { path: `layout.${i}` } },
          h('div', { class: 'order-btns' },
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move up', disabled: i === 0 || undefined, onclick: () => move(-1) }, svg(UI.up)),
            h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Move down', disabled: i === S.content.layout.length - 1 || undefined, onclick: () => move(1) }, svg(UI.down))),
          h('div', { class: 'layout-name' }, h('strong', { text: SECTION_NAMES[s.key][0] }), h('span', { text: `#${S.meta.sectionIds[s.key]} · ${SECTION_NAMES[s.key][1]}` })),
          h('div', { class: 'layout-label field', dataset: { path: `layout.${i}.navLabel` }, style: 'margin:0' }, label),
          h('label', { class: 'toggle layout-nav' }, nav, h('span', { class: 'track' }), h('span', { class: 'toggle-text' }, h('strong', { text: 'In menu' }))),
          h('label', { class: 'toggle' }, vis, h('span', { class: 'track' }), h('span', { class: 'toggle-text' }, h('strong', { text: 'Visible' }))));
      });
      card.replaceChildren(
        h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Page sections' }),
          h('p', { text: 'Reorder sections, hide them, and choose which appear in the menu. Background shading alternates automatically.' }))),
        h('div', { class: 'layout-fixed' }, svg(UI.header), 'Header, hero and key facts always stay at the top (the facts bar can be hidden under Key facts).'),
        ...rows);
    };
    draw();
    return [card];
  }

  function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

  function themePanel() {
    const t = S.content.theme;
    const checks = {
      accent: () => [contrast(t.ink, t.accent), 4.5, 'dark text on buttons'],
      accentStrong: () => [contrast(t.ink, t.accentStrong), 3, 'button text on hover'],
      accentInk: () => [contrast(t.accentInk, '#ffffff'), 4.5, 'on white background'],
      ink: () => [contrast(t.ink, '#ffffff'), 10, 'on white background'],
    };
    const badges = {};
    const preview = h('div', { class: 'theme-preview' },
      h('p', { class: 'tp-eyebrow', text: 'What we do' }),
      h('h3', { text: 'Our Services' }),
      h('p', { text: 'Integrated Facility Service solutions to support operational excellence across industries.' }),
      h('span', { class: 'tp-btn', text: 'Get in touch' }), h('span', { class: 'tp-chip' }, svg(S.meta.icons.check.svg)));
    const loadFont = (key) => {
      const url = S.meta.fonts[key].url;
      if (!document.querySelector(`link[data-font="${key}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: url, dataset: { font: key } }));
    };
    const paint = () => {
      const f = S.meta.fonts[t.fontPair];
      loadFont(t.fontPair);
      preview.style.setProperty('--tp-accent', t.accent);
      preview.style.setProperty('--tp-accent-strong', t.accentStrong);
      preview.style.setProperty('--tp-accent-ink', t.accentInk);
      preview.style.setProperty('--tp-ink', t.ink);
      preview.style.setProperty('--tp-soft', `color-mix(in srgb, ${t.accent} 13%, white)`);
      preview.style.setProperty('--tp-head', f.head);
      preview.style.setProperty('--tp-body', f.body);
      Object.entries(badges).forEach(([k, el]) => {
        const [ratio, min, what] = checks[k]();
        const ok = ratio >= min;
        el.className = `contrast ${ok ? 'ok' : 'bad'}`;
        el.textContent = `${ratio.toFixed(1)}:1 ${what} · ${ok ? 'readable' : `needs ${min}:1`}`;
      });
    };
    const badge = (key) => () => { badges[key] = h('span', { class: 'contrast' }); return badges[key]; };
    const colors = F.card('Brand colors', [
      F.grid([
        { type: 'color', key: 'theme.accent', label: 'Accent (buttons, highlights)', onchange: paint, after: badge('accent') },
        { type: 'color', key: 'theme.accentStrong', label: 'Accent hover / icons', onchange: paint, after: badge('accentStrong') },
        { type: 'color', key: 'theme.accentInk', label: 'Accent text (small orange labels)', onchange: paint, after: badge('accentInk') },
        { type: 'color', key: 'theme.ink', label: 'Headings & dark text', onchange: paint, after: badge('ink') },
      ]),
    ], { help: 'Colors must stay readable — the server rejects combinations that fail the contrast checks.',
      aside: () => h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Reset to brand colors', onclick: async () => {
        if (!(await confirmDialog({ title: 'Reset colors and font?', text: 'Restores the original TS Solution orange, dark text and Roboto + Open Sans.', ok: 'Reset' }))) return;
        Object.assign(S.content.theme, S.meta.brandTheme); onEdited(); renderPanel();
      } }) });
    const fonts = F.card('Typography', [
      { type: 'select', key: 'theme.fontPair', label: 'Font pairing (headings + body text)', options: Object.entries(S.meta.fonts).map(([k, v]) => [k, v.label]), onchange: paint },
    ], { help: 'Curated pairings that fit the layout. Sizes and spacing stay fixed so nothing breaks.' });
    const out = [renderField(colors), renderField(fonts), h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', { text: 'Preview' })), preview)];
    paint();
    return out;
  }

  function motionPanel() {
    const demo = h('div', { class: 'motion-demo', 'aria-hidden': 'true' }, h('div'), h('div'), h('div'));
    const play = () => {
      demo.style.setProperty('--demo-dur', { relaxed: '1s', standard: '.7s', quick: '.45s' }[S.content.motion.speed]);
      demo.classList.remove('run'); void demo.offsetWidth; demo.classList.add('run');
    };
    return [
      renderField(F.card('Animations', [
        F.toggle('motion.heroIntro', 'Hero entrance', 'Photo settles and the headline, text and buttons rise in on page load.'),
        F.toggle('motion.heroSheen', 'Hero light sweep', 'A single soft light passes across the window photo.'),
        F.toggle('motion.scrollReveal', 'Scroll reveal', 'Sections fade up as they come into view; the How-we-work steps appear in sequence.'),
        F.toggle('motion.counters', 'Number count-up', 'Key facts count up once when visible.'),
        F.toggle('motion.hoverEffects', 'Hover lift & zoom', 'Cards lift and photos zoom slightly on mouse-over.'),
      ], { help: 'Visitors who turn on “reduce motion” on their device never see these animations.' })),
      renderField(F.card('Speed', [
        { type: 'select', key: 'motion.speed', label: 'Reveal speed', options: [['relaxed', 'Relaxed (1 s)'], ['standard', 'Standard (0.7 s)'], ['quick', 'Quick (0.45 s)']], onchange: play },
        { type: 'custom', render: () => h('div', null, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Play sample', onclick: play }), demo) },
      ])),
    ];
  }

  /* ---------- media ---------- */
  async function loadMedia() {
    const { items } = await api('GET', '/api/admin/media');
    S.media = items;
    S.mediaIndex = new Map(items.map((m) => [m.path, m]));
    return items;
  }

  // Large photos are resized (max 2400 px) and converted to WebP in the browser before upload.
  async function prepareUpload(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(`${file.name}: only PNG, JPEG and WebP images are supported.`);
    const MAX_SIDE = 2400;
    let blob = file;
    let name = file.name;
    if (window.createImageBitmap) {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (scale < 1 || file.size > 1.5 * 1024 * 1024) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bmp.width * scale);
        canvas.height = Math.round(bmp.height * scale);
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const out = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
        if (out && out.type === 'image/webp' && out.size < file.size) { blob = out; name = name.replace(/\.[^.]+$/, '.webp'); }
      }
      bmp.close && bmp.close();
    }
    if (blob.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MB even after compression.`);
    const data = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      fr.readAsDataURL(blob);
    });
    return { name, data };
  }

  async function uploadFiles(files) {
    const uploaded = [];
    for (const file of files) {
      try {
        const payload = await prepareUpload(file);
        const { item } = await api('POST', '/api/admin/media', payload);
        uploaded.push(item);
      } catch (e) {
        if (e.status !== 401) toast('error', 'Upload failed', e.message);
      }
    }
    if (uploaded.length) toast('success', `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded`);
    await loadMedia();
    return uploaded;
  }

  function dropzone(onDone) {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: true, 'aria-label': 'Upload images' });
    const zone = h('div', { class: 'dropzone' }, svg(UI.upload), h('strong', { text: 'Drop images here or click to upload' }),
      h('span', { text: 'PNG, JPEG or WebP · large photos are resized to 2400 px and compressed automatically' }), input);
    const handle = async (files) => {
      if (!files.length) return;
      zone.classList.add('drag');
      const up = await uploadFiles([...files]);
      zone.classList.remove('drag');
      input.value = '';
      onDone(up);
    };
    input.addEventListener('change', () => handle(input.files));
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', (e) => handle(e.dataTransfer.files));
    return zone;
  }

  function mediaCard(m, { pick, current, onDelete } = {}) {
    const tag = pick ? 'button' : 'div';
    const card = h(tag, { class: `media-card${current ? ' selected' : ''}`, type: pick ? 'button' : undefined, title: m.path,
      onclick: pick ? () => pick(m.path) : undefined },
      h('div', { class: 'badges' }, current ? h('span', { class: 'badge current', text: 'Selected' }) : null, m.inUse ? h('span', { class: 'badge use', text: 'In use' }) : null, m.deletable ? null : h('span', { class: 'badge', text: 'Built-in' })),
      h('div', { class: 'thumb' }, h('img', { src: `/${m.path}`, alt: '', loading: 'lazy' })),
      h('div', { class: 'info' }, h('strong', { text: m.name }), m.width ? `${m.width} × ${m.height} · ${kb(m.size)}` : kb(m.size)));
    if (onDelete && m.deletable) {
      card.append(h('div', { class: 'card-actions' }, h('button', { type: 'button', class: 'icon-button danger', 'aria-label': `Delete ${m.name}`, title: m.inUse ? 'In use on the website' : 'Delete',
        disabled: m.inUse || undefined, onclick: () => onDelete(m) }, svg(UI.trash))));
    }
    return card;
  }

  async function openMediaPicker(current, onPick) {
    const dlg = $('#media-dialog');
    const body = $('#media-dialog-body');
    let filter = 'all';
    const grid = h('div', { class: 'media-grid' });
    const draw = () => {
      const items = (S.media || []).filter((m) => filter === 'all' || (filter === 'uploads' ? m.deletable : !m.deletable));
      grid.replaceChildren(...items.map((m) => mediaCard(m, { current: m.path === current, pick: (p) => { dlg.close(); onPick(p); } })));
    };
    const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Filter images' },
      [['all', 'All'], ['uploads', 'Uploaded'], ['builtin', 'Built-in']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === filter), text: l,
        onclick: (e) => { filter = k; seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); draw(); } })));
    body.replaceChildren(dropzone((up) => { draw(); if (up.length === 1) { dlg.close(); onPick(up[0].path); } }), h('div', { class: 'media-tools' }, seg), grid);
    grid.append(h('p', { class: 'loading', text: 'Loading images…' }));
    dlg.showModal();
    try { await loadMedia(); draw(); } catch (e) { if (e.status !== 401) toast('error', 'Could not load images', e.message); }
  }

  function mediaPanel() {
    const grid = h('div', { class: 'media-grid' }, h('p', { class: 'loading', text: 'Loading images…' }));
    const draw = () => grid.replaceChildren(...S.media.map((m) => mediaCard(m, { onDelete: async (item) => {
      if (!(await confirmDialog({ title: 'Delete image?', text: `${item.name} will be permanently deleted from the server.`, ok: 'Delete', danger: true }))) return;
      try { await api('DELETE', '/api/admin/media', { path: item.path }); toast('success', 'Image deleted'); await loadMedia(); draw(); }
      catch (e) { if (e.status !== 401) toast('error', 'Could not delete image', e.message); }
    } })));
    loadMedia().then(draw).catch((e) => { if (e.status !== 401) toast('error', 'Could not load images', e.message); });
    return [
      h('p', { class: 'panel-intro', text: 'Upload photos and logos here or straight from any image field. Images used on the website cannot be deleted; built-in images are part of the site files.' }),
      dropzone(() => draw()),
      h('section', { class: 'card' }, grid),
    ];
  }

  /* ---------- history ---------- */
  function historyPanel() {
    const card = h('section', { class: 'card' }, h('p', { class: 'loading', text: 'Loading versions…' }));
    const load = async () => {
      try {
        const { items } = await api('GET', '/api/admin/history');
        card.replaceChildren(
          h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Published versions' }), h('p', { text: 'Every save is kept (latest 30). Restoring a version publishes it again; the current version stays in the list.' }))),
          ...items.map((v) => h('div', { class: 'history-row' },
            h('div', { class: 'when' }, h('strong', { text: fullDate(v.savedAt) }), h('span', { text: `by ${v.savedBy}${v.note ? ` · ${v.note}` : ''}` })),
            v.current ? h('span', { class: 'badge current', text: 'Live now' })
              : h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Restore', onclick: () => restore(v) }))));
      } catch (e) { if (e.status !== 401) card.replaceChildren(h('p', { class: 'form-error', text: e.message })); }
    };
    const restore = async (v) => {
      const extra = isDirty() ? ' Your unsaved changes will be lost.' : '';
      if (!(await confirmDialog({ title: 'Restore this version?', text: `The website will be republished with the content from ${fullDate(v.savedAt)}.${extra}`, ok: 'Restore & publish' }))) return;
      try {
        applyState(await api('POST', '/api/admin/history/restore', { id: v.id }));
        toast('success', 'Version restored', 'The website has been updated.', { href: '/', label: 'View website' });
        updateChrome(); load();
      } catch (e) { if (e.status !== 401) toast('error', 'Restore failed', e.message); }
    };
    load();
    return [card];
  }

  /* ---------- account ---------- */
  function accountPanel() {
    const min = S.meta.minPassword;
    const cur = h('input', { type: 'password', autocomplete: 'current-password', id: 'pw-current' });
    const next = h('input', { type: 'password', autocomplete: 'new-password', id: 'pw-next', minlength: min });
    const again = h('input', { type: 'password', autocomplete: 'new-password', id: 'pw-again' });
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { type: 'submit', class: 'btn btn-primary', text: 'Change password' });
    const form = h('form', { class: 'card', novalidate: true },
      h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Change password' }), h('p', { text: `Signed in as ${S.user}. Other devices are signed out after the change.` }))),
      h('input', { type: 'text', autocomplete: 'username', value: S.user, hidden: true, readonly: true }),
      fieldShell('pw-current', 'Current password', cur),
      h('div', { class: 'grid-2' }, fieldShell('pw-next', 'New password', next, { help: `At least ${min} characters.` }), fieldShell('pw-again', 'Repeat new password', again)),
      err, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (!cur.value || !next.value) return fail('Fill in your current and new password.');
      if (next.value.length < min) return fail(`The new password must be at least ${min} characters.`);
      if (next.value !== again.value) return fail('The new passwords do not match.');
      submit.disabled = true;
      try {
        const r = await api('POST', '/api/admin/password', { current: cur.value, next: next.value });
        S.csrf = r.csrf;
        form.reset();
        toast('success', 'Password changed', 'Other sessions have been signed out.');
      } catch (ex) { if (ex.status !== 401) fail(ex.message); }
      submit.disabled = false;
    });
    return [form, h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('div', null, h('h2', { text: 'Admin accounts' }),
      h('p', { text: 'Accounts are created on the server with “npm run create-admin”. Credentials are never stored in the website files.' }))))];
  }

  /* =====================================================================
     Rendering + chrome
     ===================================================================== */
  function dirtyPanels() {
    if (!isDirty()) return new Set();
    const saved = JSON.parse(S.savedJson);
    const out = new Set();
    Object.keys(S.content).forEach((k) => { if (JSON.stringify(S.content[k]) !== JSON.stringify(saved[k])) out.add(panelForKey(k).id); });
    return out;
  }

  function renderNav() {
    const dirty = dirtyPanels();
    const nav = $('#side-nav');
    nav.replaceChildren(...PANELS.map((p) => (p.group
      ? h('p', { class: 'nav-group', text: p.group })
      : h('a', { class: 'side-link', href: `#${p.id}`, 'aria-current': p.id === S.route ? 'page' : undefined },
        svg(p.icon), p.label, dirty.has(p.id) ? h('span', { class: 'dot', title: 'Unsaved changes' }) : null))));
  }

  function updateChrome() {
    const dirty = isDirty();
    $('#save-btn').disabled = !dirty || S.saving;
    $('#discard-btn').disabled = !dirty || S.saving;
    const status = $('#save-status');
    status.replaceChildren(dirty
      ? h('span', { class: 'pill', text: 'Unsaved changes' })
      : h('span', { text: S.updatedAt ? `Published ${timeAgo(S.updatedAt)}${S.updatedBy ? ` by ${S.updatedBy}` : ''}` : 'Published' }));
    renderNav();
  }

  function renderPanel() {
    const p = panelById[S.route] || panelById.overview;
    S.titleUpdaters = [];
    $('#panel-title').textContent = p.label;
    document.title = `${p.label} · TS Solution admin`;
    let nodes;
    switch (p.id) {
      case 'overview': nodes = overviewPanel(); break;
      case 'layout': nodes = layoutPanel(); break;
      case 'theme': nodes = themePanel(); break;
      case 'motion': nodes = motionPanel(); break;
      case 'media': nodes = mediaPanel(); break;
      case 'history': nodes = historyPanel(); break;
      case 'account': nodes = accountPanel(); break;
      default: nodes = renderFields(PANEL_FIELDS[p.id], '');
    }
    $('#panel').replaceChildren(...nodes.filter(Boolean));
    updateChrome();
  }

  function route() {
    const id = location.hash.replace('#', '') || 'overview';
    S.route = panelById[id] ? id : 'overview';
    renderPanel();
    $('#sidebar').classList.remove('open');
    $('#nav-toggle').setAttribute('aria-expanded', 'false');
    $('#panel').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ---------- validation errors from the server ---------- */
  function clearError(input) {
    const f = input.closest('.field');
    if (f && f.classList.contains('has-error')) { f.classList.remove('has-error'); const m = f.querySelector('.field-error'); if (m) m.remove(); }
  }

  function showFieldError(serverPath, message) {
    const path = fromServerPath(serverPath);
    if (!path) return;
    const panel = panelForKey(splitPath(path)[0]);
    // open every list item on the way to the field
    const parts = splitPath(path);
    for (let i = 1; i <= parts.length; i++) if (/^\d+$/.test(parts[i - 1])) S.openItems.add(parts.slice(0, i).join('.'));
    if (S.route !== panel.id) { S.route = panel.id; history.replaceState(null, '', `#${panel.id}`); }
    renderPanel();
    // the closest element we can find for this path
    let target = null;
    for (let p = path; p && !target; p = p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '') {
      const sel = `[data-path="${CSS.escape(p)}"]`;
      target = document.querySelector(`.field${sel}`) || document.querySelector(sel);
    }
    if (!target) return '';
    const field = target;
    field.classList.add('has-error');
    field.append(h('p', { class: 'field-error', text: message.replace(/^[^:]+:\s*/, '') }));
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = field.querySelector('input, textarea, select, button');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 300);
    const labelEl = field.querySelector(':scope > label > span, :scope > .field-label > span, :scope > .field-label, .toggle-text strong');
    const card = field.closest('.card');
    const cardTitle = card && card.querySelector('.card-head h2');
    return (labelEl && labelEl.textContent.replace(/\s*\*$/, '').trim()) || (cardTitle && cardTitle.textContent) || '';
  }

  const plainError = (msg) => String(msg).replace(/^[^:]+:\s*/, '');

  /* =====================================================================
     Actions
     ===================================================================== */
  async function save() {
    if (!isDirty() || S.saving) return;
    S.saving = true;
    const btn = $('#save-btn');
    btn.querySelector('span').textContent = 'Publishing…';
    updateChrome();
    try {
      const state = await api('PUT', '/api/admin/content', { content: S.content, baseVersion: S.version });
      applyState(state);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast('success', 'Published', 'The website has been updated.', { href: '/', label: 'View website' });
      renderPanel();
    } catch (e) {
      if (e.status === 409) {
        if (await confirmDialog({ title: 'Content changed elsewhere', text: `${e.message}`, ok: 'Load latest version', danger: true })) {
          applyState(await api('GET', '/api/admin/content')); renderPanel();
        }
      } else if (e.status !== 401) {
        const label = e.field ? showFieldError(e.field, e.message) : '';
        toast('error', 'Not published', label ? `${label}: ${plainError(e.message)}` : e.message);
      }
    } finally {
      S.saving = false;
      btn.querySelector('span').textContent = 'Save & publish';
      updateChrome();
    }
  }

  async function discard() {
    if (!isDirty()) return;
    if (!(await confirmDialog({ title: 'Discard unsaved changes?', text: 'All edits since the last publish will be lost.', ok: 'Discard', danger: true }))) return;
    S.content = JSON.parse(S.savedJson);
    renderPanel();
    toast('success', 'Changes discarded');
  }

  async function preview() {
    const btn = $('#preview-btn');
    btn.disabled = true;
    try {
      const { url } = await api('POST', '/api/admin/preview', { content: S.content });
      const dlg = $('#preview-dialog');
      $('#preview-frame').src = url;
      $('#preview-title').textContent = isDirty() ? 'Preview — unsaved changes' : 'Preview — published version';
      dlg.showModal();
    } catch (e) {
      if (e.status !== 401) {
        const label = e.field ? showFieldError(e.field, e.message) : '';
        toast('error', 'Preview failed', label ? `${label}: ${plainError(e.message)}` : e.message);
      }
    } finally { btn.disabled = false; }
  }

  $('#preview-dialog').querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
    $('#preview-dialog').querySelectorAll('.segmented button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#preview-frame').style.width = b.dataset.width;
  }));
  $('#preview-dialog').addEventListener('close', () => { $('#preview-frame').src = 'about:blank'; });

  async function logout() {
    if (isDirty() && !(await confirmDialog({ title: 'Sign out with unsaved changes?', text: 'Your unsaved edits will be lost.', ok: 'Sign out', danger: true }))) return;
    try { await api('POST', '/api/admin/logout', {}); } catch { /* already signed out */ }
    window.removeEventListener('beforeunload', beforeUnload);
    window.location.replace('/admin/login');
  }

  function beforeUnload(e) { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } }

  /* =====================================================================
     Boot
     ===================================================================== */
  async function boot() {
    try {
      const session = await api('GET', '/api/admin/session');
      S.csrf = session.csrf; S.user = session.username;
      const [meta, state] = await Promise.all([api('GET', '/api/admin/meta'), api('GET', '/api/admin/content')]);
      S.meta = meta;
      applyState(state);
      loadMedia().then(() => { if (S.route !== 'media') renderPanel(); }).catch(() => {});
    } catch (e) {
      if (e.status !== 401) $('#panel').replaceChildren(h('p', { class: 'form-error', text: `Could not load the admin panel: ${e.message}` }));
      return;
    }

    // quick picks for link fields
    document.body.append(h('datalist', { id: 'section-links' },
      h('option', { value: '#home' }), ...S.meta.sectionKeys.map((k) => h('option', { value: `#${S.meta.sectionIds[k]}` }))));

    $('#avatar').textContent = S.user.slice(0, 1);
    $('#user-name').textContent = `Signed in as ${S.user}`;

    // offer to restore edits kept when a session expired mid-edit
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (draft && draft.version === S.version) {
        sessionStorage.removeItem(DRAFT_KEY);
        if (await confirmDialog({ title: 'Restore unsaved changes?', text: 'Your session expired while you had unsaved edits. Restore them now?', ok: 'Restore edits' })) S.content = draft.content;
      }
    } catch { /* ignore */ }

    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', beforeUnload);
    $('#save-btn').addEventListener('click', save);
    $('#discard-btn').addEventListener('click', discard);
    $('#preview-btn').addEventListener('click', preview);
    $('#logout-btn').addEventListener('click', logout);
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
    const userBtn = $('#user-btn'), pop = $('#user-pop');
    userBtn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; userBtn.setAttribute('aria-expanded', String(!pop.hidden)); });
    document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) { pop.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); } });
    pop.addEventListener('click', (e) => { if (e.target.closest('a')) pop.hidden = true; });
    $('#nav-toggle').addEventListener('click', () => {
      const open = $('#sidebar').classList.toggle('open');
      $('#nav-toggle').setAttribute('aria-expanded', String(open));
    });
    setInterval(updateChrome, 60 * 1000); // keep "published x min ago" fresh

    route();
  }

  boot();
})();
