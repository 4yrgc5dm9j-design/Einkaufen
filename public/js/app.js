import { api } from './api.js';
import { MODE } from './config.js';
import { html, setHTML, icon, avatar, $, toast } from './ui.js';

const NAV = [
  { path: '/', label: 'Start', icon: 'home', tab: true },
  { path: '/einkauf', label: 'Einkauf', icon: 'cart', tab: true, accent: 'shop' },
  { path: '/rezepte', label: 'Rezepte', icon: 'chef', tab: true, accent: 'recipe' },
  { path: '/essensplan', label: 'Essensplan', icon: 'utensils', accent: 'meal' },
  { path: '/kalender', label: 'Kalender', icon: 'calendar', tab: true, accent: 'cal' },
  { path: '/erinnerungen', label: 'Erinnerungen', short: 'Erinnern', icon: 'bell', tab: true, accent: 'rem' },
  { path: '/einstellungen', label: 'Einstellungen', icon: 'settings' },
];

const ROUTES = [
  [/^\/$/, () => import('./views/home.js')],
  [/^\/einkauf$/, () => import('./views/shopping.js')],
  [/^\/rezepte$/, () => import('./views/recipes.js'), { tab: 'mine' }],
  [/^\/rezepte\/entdecken$/, () => import('./views/recipes.js'), { tab: 'discover' }],
  [/^\/rezepte\/neu$/, () => import('./views/recipeEditor.js')],
  [/^\/rezepte\/import$/, () => import('./views/recipeEditor.js'), { importMode: true }],
  [/^\/rezepte\/extern\/(\w+)\/([\w-]+)$/, () => import('./views/recipeDetail.js'), { external: true }],
  [/^\/rezepte\/(\d+)\/bearbeiten$/, () => import('./views/recipeEditor.js')],
  [/^\/rezepte\/(\d+)$/, () => import('./views/recipeDetail.js')],
  [/^\/essensplan$/, () => import('./views/mealplan.js')],
  [/^\/kalender$/, () => import('./views/calendar.js')],
  [/^\/erinnerungen$/, () => import('./views/reminders.js')],
  [/^\/einstellungen$/, () => import('./views/settings.js')],
];

export const ctx = {
  me: null,
  get user() {
    return this.me?.user;
  },
  get members() {
    return this.me?.household?.members || [];
  },
  member(id) {
    return this.members.find((m) => m.id === id);
  },
  async refreshMe() {
    this.me = await api.get('/me');
    renderChrome();
    return this.me;
  },
  navigate(path) {
    location.hash = `#${path}`;
  },
  setTitle(title, actions = '') {
    const t = $('#topbar-title');
    if (t) t.textContent = title;
    const a = $('#topbar-actions');
    if (a) setHTML(a, actions);
    document.title = title ? `${title} · Alltag` : 'Alltag';
  },
};

// ---------- Theme ----------
export function applyTheme(theme = localStorageGet('theme') || 'auto') {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1117' : '#f6f7fb');
}

export function localStorageGet(key) {
  try {
    return localStorage.getItem(`alltag:${key}`);
  } catch {
    return null;
  }
}
export function localStorageSet(key, value) {
  try {
    localStorage.setItem(`alltag:${key}`, value);
  } catch {
    /* privat-Modus */
  }
}

// ---------- Layout ----------
function currentPath() {
  return (location.hash.replace(/^#/, '') || '/').split('?')[0];
}

export function queryParams() {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}

function renderChrome() {
  const root = $('#app');
  if (!ctx.me) return;
  const pending = ctx.me.invitations.incoming.length;
  if (!$('.shell', root)) {
    setHTML(
      root,
      html`<div class="shell">
        <aside class="sidebar">
          <a class="brand" href="#/">
            <span class="brand-mark">${icon('sparkles', 20)}</span>
            <span>Alltag</span>
          </a>
          <nav class="side-nav" id="side-nav"></nav>
          <div class="side-footer" id="side-footer"></div>
        </aside>
        <div class="main">
          <header class="topbar">
            <h1 id="topbar-title"></h1>
            <div class="topbar-actions" id="topbar-actions"></div>
            <a href="#/einstellungen" class="topbar-avatar" id="topbar-avatar" aria-label="Einstellungen"></a>
          </header>
          <main id="view" class="view"></main>
        </div>
        <nav class="tabbar" id="tabbar"></nav>
      </div>`,
    );
  }
  const path = currentPath();
  const active = (p) => (p === '/' ? path === '/' : path.startsWith(p));
  setHTML(
    $('#side-nav'),
    html`${NAV.map(
      (n) => html`<a href="#${n.path}" class="nav-item ${active(n.path) ? 'active' : ''}" data-accent="${n.accent || ''}">
        ${icon(n.icon, 20)}<span>${n.label}</span>
        ${n.path === '/einstellungen' && pending ? html`<span class="badge">${pending}</span>` : ''}
      </a>`,
    )}`,
  );
  setHTML(
    $('#tabbar'),
    html`${NAV.filter((n) => n.tab).map(
      (n) => html`<a href="#${n.path}" class="tab ${active(n.path) || (n.path === '/rezepte' && path === '/essensplan') ? 'active' : ''}" data-accent="${n.accent || ''}">
        ${icon(n.icon, 22)}<span>${n.short || n.label}</span>
      </a>`,
    )}`,
  );
  const members = ctx.members;
  setHTML(
    $('#side-footer'),
    html`<a href="#/einstellungen" class="household-card">
      <div class="avatar-stack">${members.map((m) => avatar(m, 30))}</div>
      <div class="household-meta">
        <strong>${ctx.me.household.name}</strong>
        <small>${members.length === 1 ? 'Nur du' : `${members.length} Personen`}</small>
      </div>
    </a>`,
  );
  setHTML(
    $('#topbar-avatar'),
    html`${avatar(ctx.user, 34)}${pending ? html`<span class="dot"></span>` : ''}`,
  );
}

// ---------- Router ----------
let cleanup = null;
let renderToken = 0;

async function route() {
  const path = currentPath();
  const token = ++renderToken;
  let match = null;
  for (const [re, loader, extra] of ROUTES) {
    const m = path.match(re);
    if (m) {
      match = { params: m.slice(1), loader, extra: extra || {} };
      break;
    }
  }
  if (!match) {
    ctx.navigate('/');
    return;
  }
  renderChrome();
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  // Frisches Element pro Seite, damit Event-Listener der vorigen Ansicht verschwinden
  const old = $('#view');
  const view = old.cloneNode(false);
  old.replaceWith(view);
  delete view.dataset.accent;
  view.className = 'view view-enter';
  view.dataset.route = path.split('/')[1] || 'home';
  try {
    const mod = await match.loader();
    if (token !== renderToken) return;
    setHTML(view, '');
    ctx.setTitle('');
    cleanup = await mod.render(view, { params: match.params, ...match.extra, query: queryParams() }, ctx);
    if (token === renderToken) {
      requestAnimationFrame(() => view.classList.remove('view-enter'));
      window.scrollTo(0, 0);
    }
  } catch (err) {
    console.error(err);
    if (token === renderToken) setHTML(view, html`<div class="empty"><div class="empty-emoji">😕</div><h3>Das hat nicht geklappt</h3><p>${err.message}</p><button class="btn btn-primary">Neu laden</button></div>`);
    $('#view .btn')?.addEventListener('click', () => location.reload());
  }
}

// ---------- Push ----------
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function pushStatus() {
  if (MODE === 'local') {
    if (!('Notification' in window)) return 'unsupported';
    return { granted: 'on', denied: 'denied' }[Notification.permission] || 'off';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]);
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
  if (MODE === 'local') return;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(ctx.me.vapidPublicKey) });
  }
  await api.post('/push/subscribe', sub.toJSON());
}

export async function disablePush() {
  if (MODE === 'local') throw new Error('Benachrichtigungen kannst du in den Einstellungen deines Handys bzw. Browsers ausschalten.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}

// ---------- Start ----------
async function showAuth() {
  const mod = await import('./views/auth.js');
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  ctx.me = null;
  await mod.render($('#app'), {}, { onLoggedIn: boot });
}

async function boot() {
  try {
    await ctx.refreshMe();
  } catch (err) {
    if (err.status === 401) return showAuth();
    setHTML($('#app'), html`<div class="empty full"><div class="empty-emoji">📡</div><h3>Keine Verbindung</h3><p>${err.message}</p></div>`);
    return;
  }
  // Nach dem Login frisches Layout aufbauen
  if (!$('.shell')) setHTML($('#app'), '');
  renderChrome();
  route();
  if (MODE === 'local') import('./local/notify.js').then((m) => m.startLocalNotifications(ctx.user.id));
}

window.addEventListener('hashchange', () => ctx.me && route());
window.addEventListener('auth:expired', () => {
  if (ctx.me) {
    toast('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
    showAuth();
  }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

applyTheme();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();

export function logout() {
  return api.post('/auth/logout').then(() => {
    setHTML($('#app'), '');
    showAuth();
  });
}

