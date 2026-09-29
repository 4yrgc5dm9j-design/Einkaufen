// Abgleich zwischen Geräten ohne Server: Ein Gerät exportiert seine Daten (Datei oder Code),
// das andere führt sie zusammen. Pro Eintrag gewinnt die neuere Änderung; Löschungen werden
// über "Grabsteine" weitergegeben, damit Gelöschtes nicht wieder auftaucht.
import { tables, TABLES, save, flush, kvGet, kvSet, tombstone } from './store.js';

const FORMAT = 'alltag-sync';

export async function exportData({ withImages = true } = {}) {
  const images = {};
  if (withImages) {
    for (const ref of new Set(tables.recipes.flatMap((r) => r.images || []))) {
      if (!String(ref).startsWith('img:')) continue;
      const data = await kvGet(`img:${ref.slice(4)}`);
      if (data) images[ref] = data;
    }
  }
  return { format: FORMAT, version: 1, exported_at: new Date().toISOString(), tables: structuredClone(tables), images };
}

export async function importData(data) {
  if (!data || data.format !== FORMAT || typeof data.tables !== 'object') {
    throw Object.assign(new Error('Das ist keine gültige Alltag-Datei.'), { status: 400 });
  }
  let added = 0;
  let updated = 0;

  for (const name of TABLES) {
    const incoming = Array.isArray(data.tables[name]) ? data.tables[name] : [];
    if (!incoming.length) continue;
    const byId = new Map(tables[name].map((r) => [r.id, r]));
    let changed = false;
    for (const row of incoming) {
      if (!row || row.id == null) continue;
      const local = byId.get(row.id);
      if (!local) {
        tables[name].push(row);
        byId.set(row.id, row);
        added++;
        changed = true;
      } else if ((row.updated_at || 0) > (local.updated_at || 0)) {
        Object.keys(local).forEach((k) => delete local[k]);
        Object.assign(local, row);
        updated++;
        changed = true;
      }
    }
    if (changed) save(name);
  }

  // Löschungen anwenden
  const graves = new Map();
  for (const t of tables.tombstones) graves.set(t.id, Math.max(graves.get(t.id) || 0, t.updated_at));
  for (const name of TABLES) {
    if (name === 'tombstones') continue;
    const before = tables[name].length;
    tables[name] = tables[name].filter((r) => !(graves.get(`${name}:${r.id}`) >= (r.updated_at || 0)));
    if (tables[name].length !== before) save(name);
  }

  // Gleichnamige Einkaufslisten (z. B. zwei Mal „Einkaufsliste“) zusammenlegen – deterministisch auf beiden Geräten
  const byName = new Map();
  for (const list of [...tables.shopping_lists].sort((a, b) => a.id - b.id)) {
    const key = list.name.trim().toLowerCase();
    const keep = byName.get(key);
    if (!keep) {
      byName.set(key, list);
      continue;
    }
    for (const item of tables.shopping_items) if (item.list_id === list.id) item.list_id = keep.id;
    tables.shopping_lists = tables.shopping_lists.filter((l) => l.id !== list.id);
    tombstone('shopping_lists', list.id);
    save('shopping_lists', 'shopping_items');
  }

  // Gleiche Personenfarben auflösen (auf beiden Geräten gleich: die jüngere Person weicht aus)
  const PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e'];
  const taken = new Set();
  for (const u of [...tables.users].sort((a, b) => a.id - b.id)) {
    if (taken.has(u.color)) {
      u.color = PALETTE.find((c) => !taken.has(c)) || u.color;
      save('users');
    }
    taken.add(u.color);
  }

  // Haushaltsname: nur ein Eintrag
  const households = tables.meta.filter((m) => m.id === 'household');
  if (households.length > 1) {
    const newest = households.sort((a, b) => b.updated_at - a.updated_at)[0];
    tables.meta = [...tables.meta.filter((m) => m.id !== 'household'), newest];
    save('meta');
  }

  for (const [ref, dataUrl] of Object.entries(data.images || {})) {
    if (!/^img:[a-z0-9]+$/.test(ref) || !String(dataUrl).startsWith('data:image/')) continue;
    if (!(await kvGet(`img:${ref.slice(4)}`))) await kvSet(`img:${ref.slice(4)}`, dataUrl);
  }

  await flush();
  return { added, updated };
}
