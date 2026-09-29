// Lokales „Backend“ für die reine Web-App (GitHub Pages): beantwortet dieselben
// API-Aufrufe wie der Node-Server, speichert aber alles im Browser (IndexedDB).
import { tables, load, save, remove, newId, nowMs, nowIso, storeImages, resolveImages, deleteImage } from './store.js';
import { str, int, num, bad, notFound, oneOf, color, localDate, localDateTime, jsonArray, HttpError } from '../shared/validate.js';
import { parseIngredient, guessCategory, CATEGORIES } from '../shared/ingredients.js';
import { RECURRENCE_LABELS, nextDue, toLocalDate } from '../shared/recurrence.js';
import { BUNDESLAENDER } from '../shared/holidays.js';
import * as web from './web.js';

const SESSION_KEY = 'alltag:session';
const USER_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e'];
const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

// ---------- Hilfen ----------
const session = {
  get() {
    try {
      return Number(localStorage.getItem(SESSION_KEY)) || null;
    } catch {
      return null;
    }
  },
  set(id) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, String(id));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* privat-Modus */
    }
  },
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 120000;
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(await pbkdf2(password, salt, iterations))}`;
}

async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  return hex(await pbkdf2(password, unhex(salt), Number(iter))) === hash;
}

function household() {
  return tables.meta.find((m) => m.id === 'household');
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, color: u.color, bundesland: u.bundesland, household_id: 'local' };
}

const members = () => tables.users.map((u) => ({ id: u.id, name: u.name, email: u.email, color: u.color })).sort((a, b) => a.id - b.id);
const userById = (id) => tables.users.find((u) => u.id === id);

function currentUser() {
  const u = userById(session.get());
  if (!u) throw new HttpError(401, 'Bitte melde dich an.');
  return u;
}

function touch(record) {
  record.updated_at = nowMs();
  return record;
}

function insert(table, record) {
  const row = { id: newId(), created_at: nowIso(), ...record, updated_at: nowMs() };
  tables[table].push(row);
  save(table);
  return row;
}

function find(table, id, message) {
  const row = tables[table].find((r) => r.id === Number(id));
  if (!row) throw notFound(message);
  return row;
}

function ensureHousehold(name) {
  if (household()) return;
  tables.meta.push({ id: 'household', name, updated_at: nowMs() });
  save('meta');
  if (!tables.shopping_lists.length) insert('shopping_lists', { name: 'Einkaufsliste', icon: '🛒', sort: 0 });
}

// ---------- Konto ----------
const routes = [];
const route = (method, pattern, fn, { auth = true } = {}) => routes.push({ method, re: new RegExp(`^${pattern}$`), fn, auth });

route('GET', '/auth/config', () => ({ registrationCodeRequired: false, mode: 'local', hasUsers: tables.users.length > 0 }), { auth: false });

route(
  'POST',
  '/auth/register',
  async (_p, b) => {
    const name = str(b.name, { max: 60, required: true, field: 'Name' });
    const email = str(b.email, { max: 200, required: true, field: 'E-Mail' }).toLowerCase();
    const password = String(b.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (password.length < 8) throw bad('Das Passwort muss mindestens 8 Zeichen lang sein.');
    if (tables.users.some((u) => u.email === email)) throw bad('Mit dieser E-Mail gibt es auf diesem Gerät bereits ein Konto.');
    ensureHousehold(`Haushalt von ${name}`);
    const user = insert('users', {
      email,
      name,
      password_hash: await hashPassword(password),
      // Zufällige Startfarbe, damit zwei Handys selten dieselbe Farbe vergeben
      color: USER_COLORS.filter((c) => !tables.users.some((x) => x.color === c))[Math.floor(Math.random() * 6)] || USER_COLORS[0],
      bundesland: tables.users[0]?.bundesland || 'NW',
    });
    session.set(user.id);
    return { ok: true };
  },
  { auth: false },
);

route(
  'POST',
  '/auth/login',
  async (_p, b) => {
    const email = str(b.email, { max: 200 }).toLowerCase();
    const user = tables.users.find((u) => u.email === email);
    if (!user || !(await verifyPassword(String(b.password || ''), user.password_hash))) {
      throw new HttpError(401, 'E-Mail oder Passwort ist falsch.');
    }
    session.set(user.id);
    return { ok: true };
  },
  { auth: false },
);

route('POST', '/auth/logout', () => {
  session.set(null);
  return { ok: true };
}, { auth: false });

route('GET', '/me', (_p, _b, _q, u) => {
  const h = household();
  return {
    user: publicUser(u),
    household: { id: 'local', name: h?.name || 'Haushalt', members: members() },
    invitations: { incoming: [], outgoing: [] },
    vapidPublicKey: null,
    bundeslaender: BUNDESLAENDER,
    mode: 'local',
  };
});

route('PATCH', '/me', (_p, b, _q, u) => {
  if (b.name !== undefined) u.name = str(b.name, { max: 60, required: true, field: 'Name' });
  if (b.color !== undefined) u.color = color(b.color, u.color);
  if (b.bundesland !== undefined) u.bundesland = oneOf(b.bundesland, Object.keys(BUNDESLAENDER), u.bundesland);
  touch(u);
  save('users');
  return { ok: true };
});

route('POST', '/me/password', async (_p, b, _q, u) => {
  if (!(await verifyPassword(String(b.current || ''), u.password_hash))) throw bad('Das aktuelle Passwort ist falsch.');
  if (String(b.password || '').length < 8) throw bad('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
  u.password_hash = await hashPassword(String(b.password));
  touch(u);
  save('users');
  return { ok: true };
});

route('DELETE', '/me', async (_p, b, _q, u) => {
  if (!(await verifyPassword(String(b.password || ''), u.password_hash))) throw bad('Das Passwort ist falsch.');
  remove('users', (x) => x.id === u.id);
  session.set(null);
  return { ok: true };
});

route('PATCH', '/household', (_p, b) => {
  const h = household();
  h.name = str(b.name, { max: 80, required: true, field: 'Name' });
  touch(h);
  save('meta');
  return { ok: true };
});

// ---------- Einkauf ----------
function remember(name, category) {
  const key = name.toLowerCase();
  const row = tables.shopping_history.find((h) => h.id === key);
  if (row) {
    row.uses += 1;
    row.category = category;
    row.last_used = nowIso();
    touch(row);
  } else tables.shopping_history.push({ id: key, name, category, uses: 1, last_used: nowIso(), updated_at: nowMs() });
  save('shopping_history');
}

function addItem(u, listId, { name, quantity, unit, note = '', category, recipe_title = null }) {
  const cat = oneOf(category, CATEGORY_NAMES, null) || tables.shopping_history.find((h) => h.id === name.toLowerCase())?.category || guessCategory(name);
  const existing = tables.shopping_items.find(
    (i) => i.list_id === listId && !i.checked && i.name.toLowerCase() === name.toLowerCase() && i.unit === (unit || ''),
  );
  if (existing) {
    existing.quantity = existing.quantity != null && quantity != null ? existing.quantity + quantity : existing.quantity ?? quantity;
    const recipes = new Set([...(existing.recipe_title || '').split(', '), recipe_title].filter(Boolean));
    existing.recipe_title = [...recipes].join(', ') || null;
    existing.note = existing.note || note;
    touch(existing);
    save('shopping_items');
    remember(name, cat);
    return existing.id;
  }
  const row = insert('shopping_items', { list_id: listId, name, quantity, unit: unit || '', note, category: cat, checked: 0, added_by: u.id, recipe_title, checked_at: null });
  remember(name, cat);
  return row.id;
}

route('GET', '/shopping', () => {
  const lists = [...tables.shopping_lists].sort((a, b) => a.sort - b.sort || a.id - b.id);
  const items = tables.shopping_items
    .map((i) => {
      const by = userById(i.added_by);
      return { ...i, added_by_name: by?.name || null, added_by_color: by?.color || null };
    })
    .sort((a, b) => a.checked - b.checked || String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id);
  return { lists, items };
});

route('GET', '/shopping/suggestions', (_p, _b, q) => {
  const term = str(q.get('q'), { max: 60 }).toLowerCase();
  const rows = [...tables.shopping_history]
    .filter((h) => !term || h.name.toLowerCase().includes(term))
    .sort((a, b) => b.uses - a.uses || String(b.last_used).localeCompare(String(a.last_used)))
    .slice(0, term ? 8 : 16);
  return rows.map((h) => ({ name: h.name, category: h.category }));
});

route('POST', '/shopping/lists', (_p, b) => {
  const sort = Math.max(0, ...tables.shopping_lists.map((l) => l.sort)) + 1;
  const row = insert('shopping_lists', { name: str(b.name, { max: 40, required: true, field: 'Name' }), icon: str(b.icon, { max: 8 }) || '🛒', sort });
  return { id: row.id };
});

route('PATCH', '/shopping/lists/(\\d+)', ([id], b) => {
  const list = find('shopping_lists', id, 'Liste nicht gefunden.');
  if (b.name !== undefined) list.name = str(b.name, { max: 40, required: true, field: 'Name' });
  if (b.icon !== undefined) list.icon = str(b.icon, { max: 8 }) || '🛒';
  touch(list);
  save('shopping_lists');
  return { ok: true };
});

route('DELETE', '/shopping/lists/(\\d+)', ([id]) => {
  const list = find('shopping_lists', id, 'Liste nicht gefunden.');
  if (tables.shopping_lists.length <= 1) throw bad('Die letzte Liste kann nicht gelöscht werden.');
  remove('shopping_items', (i) => i.list_id === list.id);
  remove('shopping_lists', (l) => l.id === list.id);
  return { ok: true };
});

route('POST', '/shopping/lists/(\\d+)/clear-checked', ([id]) => {
  const list = find('shopping_lists', id, 'Liste nicht gefunden.');
  return { removed: remove('shopping_items', (i) => i.list_id === list.id && i.checked).length };
});

route('POST', '/shopping/items', (_p, b, _q, u) => {
  const list = find('shopping_lists', b.list_id, 'Liste nicht gefunden.');
  let item;
  if (b.text !== undefined) {
    const parsed = parseIngredient(str(b.text, { max: 200, required: true, field: 'Eintrag' }));
    item = { ...parsed, name: parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1) };
  } else {
    item = { name: str(b.name, { max: 120, required: true, field: 'Name' }), quantity: num(b.quantity), unit: str(b.unit, { max: 20 }), note: str(b.note, { max: 200 }) };
  }
  item.category = b.category;
  return { id: addItem(u, list.id, item) };
});

route('POST', '/shopping/items/bulk', (_p, b, _q, u) => {
  const list = find('shopping_lists', b.list_id, 'Liste nicht gefunden.');
  const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
  if (!items.length) throw bad('Keine Zutaten ausgewählt.');
  const recipeTitle = str(b.recipe_title, { max: 120 }) || null;
  for (const it of items) {
    const name = str(it.name, { max: 120 });
    if (name) addItem(u, list.id, { name, quantity: num(it.quantity), unit: str(it.unit, { max: 20 }), note: str(it.note, { max: 200 }), recipe_title: recipeTitle });
  }
  return { ok: true, count: items.length };
});

route('PATCH', '/shopping/items/(\\d+)', ([id], b) => {
  const item = find('shopping_items', id, 'Eintrag nicht gefunden.');
  if (b.name !== undefined) item.name = str(b.name, { max: 120, required: true, field: 'Name' });
  if (b.quantity !== undefined) item.quantity = num(b.quantity);
  if (b.unit !== undefined) item.unit = str(b.unit, { max: 20 });
  if (b.note !== undefined) item.note = str(b.note, { max: 200 });
  if (b.category !== undefined) {
    item.category = oneOf(b.category, CATEGORY_NAMES, item.category);
    remember(item.name, item.category);
  }
  if (b.list_id !== undefined) item.list_id = find('shopping_lists', b.list_id, 'Liste nicht gefunden.').id;
  if (b.checked !== undefined) {
    const checked = b.checked ? 1 : 0;
    if (checked && !item.checked) item.checked_at = nowIso();
    if (!checked) item.checked_at = null;
    item.checked = checked;
  }
  touch(item);
  save('shopping_items');
  return { ok: true };
});

route('DELETE', '/shopping/items/(\\d+)', ([id]) => {
  find('shopping_items', id, 'Eintrag nicht gefunden.');
  remove('shopping_items', (i) => i.id === Number(id));
  return { ok: true };
});

// ---------- Rezepte ----------
function normalizeRecipe(body) {
  const ingredients = jsonArray(body.ingredients)
    .slice(0, 150)
    .map((i) => ({
      quantity: num(i?.quantity),
      unit: str(i?.unit, { max: 20 }),
      name: str(i?.name, { max: 150 }),
      note: str(i?.note, { max: 200 }),
      ...(i?.group ? { group: str(i.group, { max: 80 }) } : {}),
    }))
    .filter((i) => i.name);
  return {
    title: str(body.title, { max: 150, required: true, field: 'Titel' }),
    description: str(body.description, { max: 2000 }),
    servings: int(body.servings, { min: 1, max: 99, fallback: 4 }),
    prep_minutes: int(body.prep_minutes, { min: 0, max: 10000 }),
    cook_minutes: int(body.cook_minutes, { min: 0, max: 10000 }),
    difficulty: str(body.difficulty, { max: 20 }),
    ingredients,
    steps: jsonArray(body.steps).map((s) => str(s, { max: 3000 })).filter(Boolean).slice(0, 100),
    tags: [...new Set(jsonArray(body.tags).map((t) => str(t, { max: 30 })).filter(Boolean))].slice(0, 15),
    source_url: /^https?:\/\//.test(String(body.source_url || '')) ? str(body.source_url, { max: 500 }) : '',
  };
}

async function withImages(r) {
  return { ...r, favorite: !!r.favorite, images: await resolveImages(r.images) };
}

async function cleanupImages(refs) {
  const used = new Set(tables.recipes.flatMap((r) => r.images || []));
  for (const ref of refs || []) if (String(ref).startsWith('img:') && !used.has(ref)) await deleteImage(ref);
}

route('GET', '/recipes/discover/search', (_p, _b, q) => {
  const query = str(q.get('q'), { max: 80, required: true, field: 'Suchbegriff' });
  return web.searchRecipes(query, { offset: int(q.get('offset'), { min: 0, max: 1000, fallback: 0 }) });
});
route('GET', '/recipes/discover/(\\w+)/([\\w-]+)', ([source, id]) => web.getExternalRecipe(source, decodeURIComponent(id)));
route('POST', '/recipes/import', (_p, b) => {
  const url = str(b.url, { max: 1000, required: true, field: 'Adresse' });
  if (!/^https?:\/\//i.test(url)) throw bad('Bitte gib eine vollständige Adresse (https://…) ein.');
  return web.importFromUrl(url);
});

route('GET', '/recipes', async () => {
  const rows = [...tables.recipes].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.updated_at - a.updated_at);
  const out = [];
  for (const r of rows) {
    // Für die Übersicht reicht das Titelbild
    const cover = r.images?.length ? await resolveImages([r.images[0]]) : [];
    out.push({ ...r, favorite: !!r.favorite, images: cover, steps: undefined, ingredient_count: r.ingredients.length });
  }
  return out;
});

route('GET', '/recipes/(\\d+)', async ([id]) => {
  const r = find('recipes', id, 'Rezept nicht gefunden.');
  return { ...(await withImages(r)), created_by_name: userById(r.created_by)?.name || null };
});

route('POST', '/recipes', async (_p, b, _q, u) => {
  const r = normalizeRecipe(b);
  const images = await storeImages(jsonArray(b.images));
  const row = insert('recipes', { ...r, images, favorite: 0, created_by: u.id });
  return { id: row.id };
});

route('PUT', '/recipes/(\\d+)', async ([id], b) => {
  const existing = find('recipes', id, 'Rezept nicht gefunden.');
  const old = existing.images || [];
  Object.assign(existing, normalizeRecipe(b), { images: await storeImages(jsonArray(b.images)) });
  touch(existing);
  save('recipes');
  await cleanupImages(old.filter((i) => !existing.images.includes(i)));
  return { ok: true };
});

route('PATCH', '/recipes/(\\d+)/favorite', ([id], b) => {
  const r = find('recipes', id, 'Rezept nicht gefunden.');
  r.favorite = b.favorite ? 1 : 0;
  touch(r);
  save('recipes');
  return { ok: true };
});

route('DELETE', '/recipes/(\\d+)', async ([id]) => {
  const r = find('recipes', id, 'Rezept nicht gefunden.');
  remove('recipes', (x) => x.id === r.id);
  remove('meal_plan', (m) => m.recipe_id === r.id);
  await cleanupImages(r.images);
  return { ok: true };
});

// ---------- Kalender ----------
const visibleTo = (u) => (e) => e.visibility === 'shared' || e.owner_id === u.id;

function withOwner(e) {
  const o = userById(e.owner_id);
  return { ...e, owner_name: o?.name || 'Unbekannt', owner_color: o?.color || '#64748b' };
}

function normalizeEvent(b) {
  const allDay = !!b.all_day;
  const title = str(b.title, { max: 150, required: true, field: 'Titel' });
  let start;
  let end;
  if (allDay) {
    start = localDate(b.start, { required: true, field: 'Beginn' });
    end = localDate(b.end) || start;
  } else {
    start = localDateTime(b.start, { required: true, field: 'Beginn', allowDate: false });
    end = localDateTime(b.end, { allowDate: false }) || start;
  }
  if (end < start) throw bad('Das Ende liegt vor dem Beginn.');
  return {
    title,
    start,
    end,
    all_day: allDay ? 1 : 0,
    location: str(b.location, { max: 200 }),
    notes: str(b.notes, { max: 4000 }),
    color: color(b.color),
    visibility: oneOf(b.visibility, ['shared', 'private'], 'shared'),
    recurrence: oneOf(b.recurrence, Object.keys(RECURRENCE_LABELS), 'none'),
    recurrence_until: localDate(b.recurrence_until),
    reminder_minutes: int(b.reminder_minutes, { min: 0, max: 60 * 24 * 30 }),
  };
}

function getEvent(u, id) {
  const e = tables.events.find((x) => x.id === Number(id) && visibleTo(u)(x));
  if (!e) throw notFound('Termin nicht gefunden.');
  return e;
}

route('GET', '/calendar/events', (_p, _b, q, u) => {
  const from = localDate(q.get('from'), { required: true, field: 'from' });
  const to = localDate(q.get('to'), { required: true, field: 'to' });
  return tables.events
    .filter(visibleTo(u))
    .filter((e) =>
      e.recurrence === 'none'
        ? e.start < to && e.end.slice(0, 10) >= from
        : e.start < to && (!e.recurrence_until || e.recurrence_until >= from),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(withOwner);
});

route('GET', '/calendar/events/search', (_p, _b, q, u) => {
  const term = str(q.get('q'), { max: 80 }).toLowerCase();
  if (!term) return [];
  return tables.events
    .filter(visibleTo(u))
    .filter((e) => [e.title, e.location, e.notes].join(' ').toLowerCase().includes(term))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 50)
    .map(withOwner);
});

route('POST', '/calendar/events', (_p, b, _q, u) => ({ id: insert('events', { ...normalizeEvent(b), owner_id: u.id }).id }));

route('PUT', '/calendar/events/(\\d+)', ([id], b, _q, u) => {
  const ev = getEvent(u, id);
  const e = normalizeEvent(b);
  if (ev.owner_id !== u.id) e.visibility = ev.visibility;
  Object.assign(ev, e);
  touch(ev);
  save('events');
  return { ok: true };
});

route('POST', '/calendar/events/(\\d+)/end-series', ([id], b, _q, u) => {
  const ev = getEvent(u, id);
  const before = localDate(b.before, { required: true });
  const until = new Date(`${before}T12:00`);
  until.setDate(until.getDate() - 1);
  const untilStr = toLocalDate(until);
  if (untilStr < ev.start.slice(0, 10)) remove('events', (x) => x.id === ev.id);
  else {
    ev.recurrence_until = untilStr;
    touch(ev);
    save('events');
  }
  return { ok: true };
});

route('DELETE', '/calendar/events/(\\d+)', ([id], _b, _q, u) => {
  const ev = getEvent(u, id);
  remove('events', (x) => x.id === ev.id);
  return { ok: true };
});

// ---------- Erinnerungen ----------
const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'];

function assignee(value) {
  const id = int(value);
  if (!id) return null;
  if (!userById(id)) throw bad('Diese Person gehört nicht zu deinem Haushalt.');
  return id;
}

route('GET', '/reminders', () => {
  const cutoff = Date.now() - 14 * 86400000;
  return tables.reminders
    .filter((r) => !r.done || (r.done_at_ms || 0) > cutoff)
    .map((r) => ({
      ...r,
      assigned_name: userById(r.assigned_to)?.name || null,
      assigned_color: userById(r.assigned_to)?.color || null,
      created_by_name: userById(r.created_by)?.name || null,
    }))
    .sort(
      (a, b) =>
        a.done - b.done ||
        (a.due_at == null) - (b.due_at == null) ||
        String(a.due_at || '').localeCompare(String(b.due_at || '')) ||
        b.priority - a.priority ||
        b.id - a.id,
    );
});

route('POST', '/reminders', (_p, b, _q, u) => {
  const row = insert('reminders', {
    created_by: u.id,
    assigned_to: assignee(b.assigned_to),
    title: str(b.title, { max: 200, required: true, field: 'Titel' }),
    notes: str(b.notes, { max: 2000 }),
    due_at: localDateTime(b.due_at),
    repeat: oneOf(b.repeat, REPEATS, 'none'),
    priority: int(b.priority, { min: 0, max: 2, fallback: 0 }),
    done: 0,
    done_at_ms: null,
  });
  return { id: row.id };
});

route('PUT', '/reminders/(\\d+)', ([id], b) => {
  const r = find('reminders', id, 'Erinnerung nicht gefunden.');
  Object.assign(r, {
    title: str(b.title, { max: 200, required: true, field: 'Titel' }),
    notes: str(b.notes, { max: 2000 }),
    due_at: localDateTime(b.due_at),
    repeat: oneOf(b.repeat, REPEATS, 'none'),
    priority: int(b.priority, { min: 0, max: 2, fallback: 0 }),
    assigned_to: assignee(b.assigned_to),
  });
  touch(r);
  save('reminders');
  return { ok: true };
});

route('POST', '/reminders/(\\d+)/toggle', ([id]) => {
  const r = find('reminders', id, 'Erinnerung nicht gefunden.');
  if (!r.done && r.repeat !== 'none' && r.due_at) {
    let next = nextDue(r.due_at, r.repeat);
    const today = toLocalDate(new Date());
    for (let i = 0; i < 400 && next && next.slice(0, 10) < today; i++) next = nextDue(next, r.repeat);
    r.due_at = next;
    touch(r);
    save('reminders');
    return { ok: true, next };
  }
  r.done = r.done ? 0 : 1;
  r.done_at_ms = r.done ? Date.now() : null;
  touch(r);
  save('reminders');
  return { ok: true };
});

route('DELETE', '/reminders/(\\d+)', ([id]) => {
  find('reminders', id, 'Erinnerung nicht gefunden.');
  remove('reminders', (r) => r.id === Number(id));
  return { ok: true };
});

// ---------- Essensplan ----------
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

route('GET', '/mealplan', async (_p, _b, q) => {
  const from = localDate(q.get('from'), { required: true, field: 'from' });
  const to = localDate(q.get('to'), { required: true, field: 'to' });
  const out = [];
  for (const m of tables.meal_plan.filter((x) => x.date >= from && x.date < to).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const r = m.recipe_id ? tables.recipes.find((x) => x.id === m.recipe_id) : null;
    out.push({
      ...m,
      recipe_title: r?.title || null,
      recipe_images: r?.images?.length ? await resolveImages([r.images[0]]) : [],
      recipe_servings: r?.servings || null,
      recipe_ingredients: r?.ingredients || [],
      prep_minutes: r?.prep_minutes || null,
      cook_minutes: r?.cook_minutes || null,
    });
  }
  return out;
});

route('POST', '/mealplan', (_p, b, _q, u) => {
  const date = localDate(b.date, { required: true });
  let recipeId = int(b.recipe_id);
  if (recipeId && !tables.recipes.some((r) => r.id === recipeId)) recipeId = null;
  const title = str(b.title, { max: 150 });
  if (!recipeId && !title) throw bad('Bitte wähle ein Rezept oder gib ein Gericht ein.');
  const row = insert('meal_plan', { date, slot: oneOf(b.slot, SLOTS, 'dinner'), recipe_id: recipeId, title, servings: int(b.servings, { min: 1, max: 99 }), created_by: u.id });
  return { id: row.id };
});

route('PATCH', '/mealplan/(\\d+)', ([id], b) => {
  const m = find('meal_plan', id);
  if (b.date !== undefined) m.date = localDate(b.date, { required: true });
  if (b.slot !== undefined) m.slot = oneOf(b.slot, SLOTS, m.slot);
  if (b.servings !== undefined) m.servings = int(b.servings, { min: 1, max: 99 });
  touch(m);
  save('meal_plan');
  return { ok: true };
});

route('DELETE', '/mealplan/(\\d+)', ([id]) => {
  find('meal_plan', id);
  remove('meal_plan', (m) => m.id === Number(id));
  return { ok: true };
});

// ---------- Abgleich zwischen Geräten ----------
route('GET', '/sync/export', async (_p, _b, q) => {
  const { exportData } = await import('./sync.js');
  return exportData({ withImages: q.get('images') !== '0' });
});
route('POST', '/sync/import', async (_p, b) => {
  const { importData } = await import('./sync.js');
  return importData(b);
});

// Serverfunktionen, die es lokal nicht gibt
for (const p of ['/household/invite', '/household/invitations/(\\d+)/(accept|decline)', '/household/leave', '/push/(subscribe|unsubscribe|test)']) {
  route('POST', p, () => {
    throw bad('Diese Funktion gibt es nur in der Server-Version. Nutze „Mit Partner abgleichen“.');
  });
}

// ---------- Einstieg ----------
export async function handle(method, url, body) {
  await load();
  const [path, qs] = url.split('?');
  const query = new URLSearchParams(qs || '');
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = path.match(r.re);
    if (!m) continue;
    const user = r.auth ? currentUser() : null;
    return r.fn(m.slice(1), body || {}, query, user);
  }
  throw notFound('Nicht gefunden.');
}
