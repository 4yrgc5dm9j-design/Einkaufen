// Tests für die reine Web-App (lokales Backend im Browser, hier mit Speicher-Fallback).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
};

const { handle } = await import('../public/js/local/backend.js');
const store = await import('../public/js/local/store.js');

test('Konto, Einkauf, Kalender und Rezepte lokal', async () => {
  await assert.rejects(handle('GET', '/me'), { status: 401 });
  await handle('POST', '/auth/register', { name: 'Anna', email: 'anna@x.de', password: 'geheim123' });
  const me = await handle('GET', '/me');
  assert.equal(me.user.name, 'Anna');
  assert.equal(me.mode, 'local');

  const { lists } = await handle('GET', '/shopping');
  await handle('POST', '/shopping/items', { list_id: lists[0].id, text: '1 kg Kartoffeln' });
  await handle('POST', '/shopping/items', { list_id: lists[0].id, text: '500 g kartoffeln' });
  const { items } = await handle('GET', '/shopping');
  assert.equal(items.length, 2); // unterschiedliche Einheiten
  await handle('POST', '/shopping/items', { list_id: lists[0].id, text: '2 kg Kartoffeln' });
  assert.equal((await handle('GET', '/shopping')).items.find((i) => i.unit === 'kg').quantity, 3);

  await handle('POST', '/calendar/events', { title: 'Yoga', start: '2026-10-01T18:00', end: '2026-10-01T19:00', recurrence: 'weekly' });
  await handle('POST', '/calendar/events', { title: 'Geheim', start: '2026-10-02T18:00', end: '2026-10-02T19:00', visibility: 'private' });
  assert.equal((await handle('GET', '/calendar/events?from=2026-10-05&to=2026-10-12')).length, 1);

  const { id } = await handle('POST', '/recipes', {
    title: 'Pfannkuchen',
    ingredients: [{ quantity: 200, unit: 'g', name: 'Mehl' }],
    steps: ['Rühren'],
    images: ['data:image/png;base64,iVBORw0KGgo='],
  });
  const recipe = await handle('GET', `/recipes/${id}`);
  assert.equal(recipe.images[0], 'data:image/png;base64,iVBORw0KGgo=');
  assert.match(store.tables.recipes[0].images[0], /^img:/);

  const { id: rid } = await handle('POST', '/reminders', { title: 'Müll', due_at: '2026-09-29T19:00', repeat: 'weekly' });
  assert.ok((await handle('POST', `/reminders/${rid}/toggle`)).next > '2026-09-29');

  await handle('POST', '/auth/logout');
  await assert.rejects(handle('POST', '/auth/login', { email: 'anna@x.de', password: 'falsch123' }), { status: 401 });
  await handle('POST', '/auth/login', { email: 'anna@x.de', password: 'geheim123' });
});

test('Abgleich zwischen zwei Geräten', async () => {
  // Stand von Gerät A sichern
  const exportA = await handle('GET', '/sync/export');
  const annaId = store.tables.users[0].id;

  // Gerät B simulieren: leerer Speicher, Ben registriert sich
  for (const t of store.TABLES) store.tables[t] = [];
  await handle('POST', '/auth/register', { name: 'Ben', email: 'ben@x.de', password: 'geheim123' });
  store.tables.users[0].color = exportA.tables.users[0].color; // absichtlich gleiche Farbe
  const benList = (await handle('GET', '/shopping')).lists[0].id;
  await handle('POST', '/shopping/items', { list_id: benList, text: 'Milch' });
  const exportB = await handle('GET', '/sync/export');

  // B übernimmt die Daten von A
  const res = await handle('POST', '/sync/import', exportA);
  assert.ok(res.added > 0);
  const me = await handle('GET', '/me');
  assert.equal(me.household.members.length, 2);
  const shopping = await handle('GET', '/shopping');
  assert.equal(shopping.lists.length, 1, 'gleichnamige Listen werden zusammengelegt');
  assert.deepEqual(shopping.items.map((i) => i.name).sort(), ['Kartoffeln', 'Kartoffeln', 'Milch']);
  // Annas privater Termin bleibt für Ben unsichtbar
  const evs = await handle('GET', '/calendar/events?from=2026-09-01&to=2026-11-01');
  assert.deepEqual(evs.map((e) => e.title), ['Yoga']);
  // Foto wurde mit übertragen
  const recipes = await handle('GET', '/recipes');
  assert.equal(recipes[0].images[0], 'data:image/png;base64,iVBORw0KGgo=');

  // Ben löscht die Milch -> beim erneuten Import auf A darf sie nicht zurückkommen
  const milk = shopping.items.find((i) => i.name === 'Milch');
  await handle('DELETE', `/shopping/items/${milk.id}`);
  const exportB2 = await handle('GET', '/sync/export');

  // zurück zu Gerät A
  for (const t of store.TABLES) store.tables[t] = structuredClone(exportA.tables[t]);
  localStorage.setItem('alltag:session', String(annaId));
  await handle('POST', '/sync/import', exportB);
  assert.ok((await handle('GET', '/shopping')).items.some((i) => i.name === 'Milch'));
  await handle('POST', '/sync/import', exportB2);
  assert.ok(!(await handle('GET', '/shopping')).items.some((i) => i.name === 'Milch'));
  // Ben kann sich auf Annas Gerät anmelden
  await handle('POST', '/auth/login', { email: 'ben@x.de', password: 'geheim123' });

  await assert.rejects(handle('POST', '/sync/import', { foo: 1 }), { status: 400 });
});

test('Gleiche Farben werden beim Abgleich aufgelöst', async () => {
  const colors = store.tables.users.map((u) => u.color);
  assert.equal(new Set(colors).size, colors.length);
});
