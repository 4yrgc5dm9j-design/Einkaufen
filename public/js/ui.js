// Kleine UI-Bibliothek: sicheres HTML-Templating, Modals, Toasts, Formatierung.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}
export const raw = (s) => new Raw(String(s ?? ''));

function renderValue(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
}

/** Tagged template: Werte werden escaped, außer sie sind raw() oder html``-Ergebnisse. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function setHTML(el, content) {
  el.innerHTML = content instanceof Raw ? content.s : esc(content);
  return el;
}

/** Event-Delegation: on(root, 'click', '[data-action=x]', handler) */
export function on(root, type, selector, handler) {
  const fn = (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

// ---------- Icons (Lucide-Stil, inline SVG) ----------
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.6l2.3 12.2a1.6 1.6 0 0 0 1.6 1.3h8.8a1.6 1.6 0 0 0 1.6-1.2L21.5 7H6"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H19"/><path d="M8 7h7M8 11h5"/>',
  chef: '<path d="M6 13.9A4 4 0 0 1 7.2 6a5 5 0 0 1 9.6 0A4 4 0 0 1 18 13.9V20H6z"/><path d="M6 17h12"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-5-5L5 21"/>',
  camera: '<path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  utensils: '<path d="M3 2v7a3 3 0 0 0 3 3v10M9 2v7M6 2v4"/><path d="M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3zm0 0v7"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.2.3 1.7 1.2 2.7 2.5 2.7z"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  sparkles: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
};

export function icon(name, size = 20, extra = '') {
  return raw(
    `<svg class="icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`,
  );
}

// ---------- Toasts ----------
export function toast(message, { type = 'info', action, onAction, duration = 3200 } = {}) {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  setHTML(el, html`<span>${message}</span>${action ? html`<button class="toast-action">${action}</button>` : ''}`);
  host.appendChild(el);
  // höchstens zwei Hinweise gleichzeitig
  while (host.children.length > 2) host.firstElementChild.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  };
  if (action) el.querySelector('.toast-action').onclick = () => {
    onAction?.();
    close();
  };
  setTimeout(close, action ? duration + 2500 : duration);
}

export const toastError = (err) => toast(err?.message || String(err), { type: 'error' });

// ---------- Modal / Bottom-Sheet ----------
let modalStack = 0;
export function openModal({ title, body, footer, wide = false, onClose, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  setHTML(
    wrap,
    html`<div class="modal ${wide ? 'modal-wide' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${title || 'Dialog'}">
      <div class="modal-handle"></div>
      ${title ? html`<header class="modal-header"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button></header>` : ''}
      <div class="modal-body">${body || ''}</div>
      ${footer ? html`<footer class="modal-footer">${footer}</footer>` : ''}
    </div>`,
  );
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  modalStack++;
  requestAnimationFrame(() => wrap.classList.add('show'));
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.classList.remove('show');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      wrap.remove();
      modalStack--;
      if (!modalStack) document.body.classList.remove('modal-open');
    }, 200);
    onClose?.();
  };
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap) close();
  });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  const modal = wrap.querySelector('.modal');
  setTimeout(() => modal.querySelector('[autofocus]')?.focus(), 60);
  return { el: modal, close };
}

export function confirmDialog(message, { confirmText = 'Löschen', danger = true, title = 'Bist du sicher?' } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const m = openModal({
      title,
      body: html`<p class="muted">${message}</p>`,
      footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button>`,
      onClose: () => resolve(result),
    });
    m.el.querySelector('[data-ok]').onclick = () => {
      result = true;
      m.close();
    };
  });
}

// ---------- Formatierung ----------
export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function formatDate(date, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return new Intl.DateTimeFormat('de-DE', opts).format(date);
}

export function formatMinutes(min) {
  if (!min) return '';
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function avatar(user, size = 32) {
  if (!user) return '';
  return html`<span class="avatar" style="--c:${user.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px" title="${user.name}">${initials(user.name)}</span>`;
}

// ---------- Rezept-Platzhalterbilder ----------
const FOOD_EMOJI = [
  [/pizza/i, '🍕'], [/pasta|nudel|spaghetti|lasagne|penne|tagliatelle|gnocchi/i, '🍝'], [/salat|salad|bowl/i, '🥗'],
  [/suppe|eintopf|soup|stew/i, '🍲'], [/curry|dal|thai/i, '🍛'], [/kuchen|torte|cake|muffin|brownie/i, '🍰'],
  [/keks|cookie|plätzchen/i, '🍪'], [/burger/i, '🍔'], [/taco|burrito|wrap|mexi/i, '🌮'], [/sushi|reis|rice|risotto/i, '🍚'],
  [/fisch|lachs|fish|salmon/i, '🐟'], [/hähnchen|huhn|chicken|pute/i, '🍗'], [/steak|rind|beef|schnitzel/i, '🥩'],
  [/pfannkuchen|pancake|waffel/i, '🥞'], [/brot|bread|brötchen/i, '🍞'], [/ei|omelett|egg/i, '🍳'], [/smoothie|shake/i, '🥤'],
  [/auflauf|gratin|casserole/i, '🥘'], [/kartoffel|potato|pommes/i, '🥔'], [/gemüse|veggie|vegan/i, '🥦'], [/dessert|eis|pudding/i, '🍨'],
];
const GRADIENTS = [
  ['#fde68a', '#fb923c'], ['#fecaca', '#f472b6'], ['#bbf7d0', '#34d399'], ['#bfdbfe', '#818cf8'],
  ['#fed7aa', '#f87171'], ['#ddd6fe', '#c084fc'], ['#a7f3d0', '#2dd4bf'], ['#fef08a', '#a3e635'],
];

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function foodEmoji(title) {
  return FOOD_EMOJI.find(([re]) => re.test(title))?.[1] || '🍽️';
}

export function recipeImage(recipe, cls = '') {
  const src = recipe.images?.[0] || recipe.image;
  if (src) return html`<img class="${cls}" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback="${recipe.title || ''}">`;
  return placeholder(recipe.title || '', cls);
}

function placeholder(title, cls) {
  const [a, b] = GRADIENTS[hash(title) % GRADIENTS.length];
  return html`<div class="img-fallback ${cls}" style="background:linear-gradient(135deg,${a},${b})">${foodEmoji(title)}</div>`;
}

// Nicht ladbare Rezeptbilder durch Platzhalter ersetzen (inline onerror ist per CSP verboten)
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img?.tagName === 'IMG' && img.dataset.fallback !== undefined) {
      const tmp = document.createElement('div');
      tmp.innerHTML = placeholder(img.dataset.fallback, img.className).s;
      img.replaceWith(tmp.firstElementChild);
    }
  },
  true,
);

/** Verkleinert ein Bild im Browser und liefert eine JPEG-data-URL. */
export function resizeImage(file, maxSize = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    img.src = url;
  });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}
