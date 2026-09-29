import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alltag-test-'));
process.env.DATA_DIR = dir;
const { createApp } = await import('../server/index.js');

let server;
let base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', cookie },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

test('Registrierung, Haushalt teilen und Datentrennung', async () => {
  const anna = client();
  const ben = client();
  const eve = client();
  assert.equal((await anna('POST', '/auth/register', { name: 'Anna', email: 'anna@x.de', password: 'geheim123' })).status, 201);
  assert.equal((await ben('POST', '/auth/register', { name: 'Ben', email: 'ben@x.de', password: 'geheim123' })).status, 201);
  assert.equal((await eve('POST', '/auth/register', { name: 'Eve', email: 'eve@x.de', password: 'geheim123' })).status, 201);
  assert.equal((await anna('POST', '/auth/register', { name: 'A', email: 'anna@x.de', password: 'geheim123' })).status, 400);

  // Ben legt Daten an, die beim Beitritt übernommen werden
  const benMe = (await ben('GET', '/me')).body;
  const benList = (await ben('GET', '/shopping')).body.lists[0].id;
  await ben('POST', '/shopping/items', { list_id: benList, text: '1 kg Äpfel' });
  await ben('POST', '/calendar/events', { title: 'Privat', start: '2026-10-01T10:00', end: '2026-10-01T11:00', visibility: 'private' });

  // Einladung und Annahme
  assert.equal((await anna('POST', '/household/invite', { email: 'ben@x.de' })).status, 201);
  const inv = (await ben('GET', '/me')).body.invitations.incoming[0];
  assert.ok(inv);
  assert.equal((await ben('POST', `/household/invitations/${inv.id}/accept`)).status, 200);

  const annaMe = (await anna('GET', '/me')).body;
  assert.equal(annaMe.household.members.length, 2);
  assert.notEqual(annaMe.household.id, benMe.user.household_id);

  // Einkaufsliste wurde zusammengeführt
  const shopping = (await anna('GET', '/shopping')).body;
  assert.equal(shopping.lists.length, 1);
  assert.equal(shopping.items[0].name, 'Äpfel');
  // Gleicher Artikel wird zusammengezählt
  await anna('POST', '/shopping/items', { list_id: shopping.lists[0].id, text: '500 g Äpfel' });
  await anna('POST', '/shopping/items', { list_id: shopping.lists[0].id, text: '1 kg äpfel' });
  const items = (await anna('GET', '/shopping')).body.items;
  assert.equal(items.find((i) => i.unit === 'kg').quantity, 2);

  // Private Termine sieht nur der Besitzer
  const annaEvents = (await anna('GET', '/calendar/events?from=2026-09-01&to=2026-11-01')).body;
  const benEvents = (await ben('GET', '/calendar/events?from=2026-09-01&to=2026-11-01')).body;
  assert.equal(annaEvents.length, 0);
  assert.equal(benEvents.length, 1);

  // Fremde Haushalte sehen nichts
  const eveList = (await eve('GET', '/shopping')).body;
  assert.equal(eveList.items.length, 0);
  assert.equal((await eve('PATCH', `/shopping/items/${items[0].id}`, { checked: true })).status, 404);
  assert.equal((await eve('DELETE', `/calendar/events/${benEvents[0].id}`)).status, 404);
});

test('Rezepte, Essensplan und Erinnerungen', async () => {
  const c = client();
  await c('POST', '/auth/register', { name: 'Chris', email: 'chris@x.de', password: 'geheim123' });
  const { body: created } = await c('POST', '/recipes', {
    title: 'Pfannkuchen',
    servings: 2,
    ingredients: [{ quantity: 200, unit: 'g', name: 'Mehl' }, { quantity: 2, unit: '', name: 'Eier' }],
    steps: ['Alles verrühren.', 'Ausbacken.'],
    tags: ['süß'],
    images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='],
  });
  const recipe = (await c('GET', `/recipes/${created.id}`)).body;
  assert.equal(recipe.ingredients.length, 2);
  assert.match(recipe.images[0], /^\/uploads\/[a-f0-9]{24}\.png$/);

  assert.equal((await c('POST', '/mealplan', { date: '2026-10-01', slot: 'dinner', recipe_id: created.id })).status, 201);
  const plan = (await c('GET', '/mealplan?from=2026-09-28&to=2026-10-05')).body;
  assert.equal(plan[0].recipe_title, 'Pfannkuchen');

  const { body: rem } = await c('POST', '/reminders', { title: 'Müll', due_at: '2026-09-29T19:00', repeat: 'weekly' });
  const toggled = (await c('POST', `/reminders/${rem.id}/toggle`)).body;
  assert.ok(toggled.next > '2026-09-29T19:00');
  assert.equal((await c('POST', '/reminders', { title: '' })).status, 400);
});

test('Schreibende Anfragen ohne JSON werden abgelehnt, ohne Login gibt es nichts', async () => {
  const res = await fetch(`${base}/auth/login`, { method: 'POST', body: 'email=x' });
  assert.equal(res.status, 415);
  assert.equal((await fetch(`${base}/shopping`)).status, 401);
});
