// Lokale Datenhaltung im Browser (IndexedDB). Jede Tabelle ist ein Array im Speicher
// und wird bei Änderungen als Ganzes unter "table:<name>" gesichert. Fotos liegen
// getrennt unter "img:<key>", damit Tabellen klein bleiben.

export const TABLES = [
  'meta',
  'users',
  'shopping_lists',
  'shopping_items',
  'shopping_history',
  'recipes',
  'events',
  'reminders',
  'meal_plan',
  'tombstones',
];

export const tables = Object.fromEntries(TABLES.map((t) => [t, []]));

// ---------- IndexedDB (mit Speicher-Fallback, z. B. für Tests in Node) ----------
const memory = new Map();
let dbPromise = null;

function idb() {
  if (typeof indexedDB === 'undefined') return null;
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('alltag', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function kvGet(key) {
  const p = idb();
  if (!p) return memory.get(key);
  const db = await p;
  return new Promise((resolve, reject) => {
    const req = db.transaction('kv').objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key, value) {
  const p = idb();
  if (!p) return void memory.set(key, value);
  const db = await p;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    if (value === undefined) tx.objectStore('kv').delete(key);
    else tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Laden / Speichern ----------
let loaded = null;
export function load() {
  loaded ??= (async () => {
    for (const t of TABLES) tables[t] = (await kvGet(`table:${t}`)) || [];
    // Speicher möglichst dauerhaft anfordern (Safari löscht sonst ggf. nach längerer Nichtnutzung)
    globalThis.navigator?.storage?.persist?.().catch(() => {});
  })();
  return loaded;
}

const dirty = new Set();
let timer = null;
let pending = Promise.resolve();

/** Tabelle zum Speichern vormerken (gebündelt). */
export function save(...names) {
  for (const n of names) dirty.add(n);
  clearTimeout(timer);
  timer = setTimeout(flush, 120);
}

export function flush() {
  clearTimeout(timer);
  const names = [...dirty];
  dirty.clear();
  pending = pending.then(() => Promise.all(names.map((n) => kvSet(`table:${n}`, tables[n])))).catch((err) => console.error('Speichern fehlgeschlagen', err));
  return pending;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

// ---------- IDs & Zeit ----------
let lastId = 0;
/** Zahlen-IDs, die auch geräteübergreifend eindeutig sind (Zeitstempel + Zufall, < 2^53). */
export function newId() {
  let id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  if (id <= lastId) id = lastId + 1;
  lastId = id;
  return id;
}

export const nowMs = () => Date.now();
export const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Gelöschte Einträge merken, damit sie beim Abgleich nicht vom anderen Gerät zurückkommen. */
export function tombstone(table, id) {
  tables.tombstones.push({ id: `${table}:${id}`, table, record_id: id, updated_at: nowMs() });
  save('tombstones');
}

export function remove(table, predicate) {
  const removed = tables[table].filter(predicate);
  if (!removed.length) return [];
  tables[table] = tables[table].filter((r) => !predicate(r));
  for (const r of removed) if (r.id != null) tombstone(table, r.id);
  save(table);
  return removed;
}

// ---------- Fotos ----------
const imageCache = new Map(); // key -> dataURL
const reverseCache = new Map(); // dataURL -> key

export async function putImage(dataUrl) {
  if (reverseCache.has(dataUrl)) return `img:${reverseCache.get(dataUrl)}`;
  const key = newId().toString(36);
  await kvSet(`img:${key}`, dataUrl);
  imageCache.set(key, dataUrl);
  reverseCache.set(dataUrl, key);
  return `img:${key}`;
}

export async function getImage(ref) {
  const key = String(ref).slice(4);
  if (!imageCache.has(key)) {
    const data = await kvGet(`img:${key}`);
    if (!data) return null;
    imageCache.set(key, data);
    reverseCache.set(data, key);
  }
  return imageCache.get(key);
}

export async function deleteImage(ref) {
  const key = String(ref).slice(4);
  const data = imageCache.get(key);
  imageCache.delete(key);
  if (data) reverseCache.delete(data);
  await kvSet(`img:${key}`, undefined);
}

/** Wandelt gespeicherte Bild-Referenzen in anzeigbare data:-URLs. */
export async function resolveImages(images) {
  const out = [];
  for (const ref of images || []) {
    if (String(ref).startsWith('img:')) {
      const data = await getImage(ref);
      if (data) out.push(data);
    } else out.push(ref);
  }
  return out;
}

/** Wandelt data:-URLs aus der Oberfläche wieder in Referenzen um (neue Bilder werden gespeichert). */
export async function storeImages(images) {
  const out = [];
  for (const img of (images || []).slice(0, 12)) {
    const s = String(img || '');
    if (s.startsWith('data:image/')) out.push(await putImage(s));
    else if (s.startsWith('img:') || /^https?:\/\//.test(s)) out.push(s);
  }
  return out;
}

export { kvGet, kvSet };
