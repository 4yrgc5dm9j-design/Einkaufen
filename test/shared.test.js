import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, guessCategory, formatIngredient } from '../public/js/shared/ingredients.js';
import { expandEvent, nextDue } from '../public/js/shared/recurrence.js';
import { holidaysForYear, easterSunday } from '../public/js/shared/holidays.js';

test('Zutaten werden erkannt', () => {
  assert.deepEqual(parseIngredient('200 g Mehl (Type 405)'), { quantity: 200, unit: 'g', name: 'Mehl', note: 'Type 405' });
  assert.deepEqual(parseIngredient('1/2 TL Salz'), { quantity: 0.5, unit: 'TL', name: 'Salz', note: '' });
  assert.deepEqual(parseIngredient('½ Bund Petersilie, gehackt'), { quantity: 0.5, unit: 'Bund', name: 'Petersilie', note: 'gehackt' });
  assert.equal(parseIngredient('1-2 Zehen Knoblauch').quantity, 2);
  assert.equal(parseIngredient('1 1/2 cups flour').quantity, 1.5);
  assert.equal(parseIngredient('200g Zucker').unit, 'g');
  assert.deepEqual(parseIngredient('Salz'), { quantity: null, unit: '', name: 'Salz', note: '' });
});

test('Zutaten werden skaliert und formatiert', () => {
  assert.equal(formatIngredient(parseIngredient('2 Zehen Knoblauch'), 1.5), '3 Zehen Knoblauch');
  assert.equal(formatIngredient(parseIngredient('1 Dose Tomaten'), 0.5), '½ Dose Tomaten');
});

test('Kategorien: längster Treffer gewinnt', () => {
  assert.equal(guessCategory('Tomatenmark'), 'Vorrat');
  assert.equal(guessCategory('Tomaten'), 'Obst & Gemüse');
  assert.equal(guessCategory('Kokosmilch'), 'Vorrat');
  assert.equal(guessCategory('Milch'), 'Milch & Eier');
  assert.equal(guessCategory('Paprikapulver'), 'Gewürze & Öle');
  assert.equal(guessCategory('Reis'), 'Vorrat');
  assert.equal(guessCategory('Klopapier'), 'Drogerie & Haushalt');
});

test('Wöchentliche Termine werden aufgefächert', () => {
  const ev = { start: '2026-09-01T10:00', end: '2026-09-01T11:00', all_day: 0, recurrence: 'weekly' };
  const occ = expandEvent(ev, new Date(2026, 8, 14), new Date(2026, 8, 30));
  assert.deepEqual(occ.map((o) => o.start), ['2026-09-15T10:00', '2026-09-22T10:00', '2026-09-29T10:00']);
});

test('Monatliche Termine am 31. landen am Monatsende', () => {
  const ev = { start: '2026-01-31', end: '2026-01-31', all_day: 1, recurrence: 'monthly' };
  const occ = expandEvent(ev, new Date(2026, 1, 1), new Date(2026, 4, 1));
  assert.deepEqual(occ.map((o) => o.start), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('Mehrtägige ganztägige Termine und Enddatum der Serie', () => {
  const ev = { start: '2026-10-01', end: '2026-10-03', all_day: 1, recurrence: 'none' };
  assert.equal(expandEvent(ev, new Date(2026, 9, 3), new Date(2026, 9, 4)).length, 1);
  assert.equal(expandEvent(ev, new Date(2026, 9, 4), new Date(2026, 9, 5)).length, 0);
  const series = { start: '2026-09-01T08:00', end: '2026-09-01T09:00', all_day: 0, recurrence: 'daily', recurrence_until: '2026-09-03' };
  assert.equal(expandEvent(series, new Date(2026, 8, 1), new Date(2026, 8, 30)).length, 3);
});

test('Werktags-Serie überspringt das Wochenende', () => {
  const ev = { start: '2026-09-25T07:00', end: '2026-09-25T07:30', all_day: 0, recurrence: 'weekdays' };
  const occ = expandEvent(ev, new Date(2026, 8, 25), new Date(2026, 8, 30));
  assert.deepEqual(occ.map((o) => o.start.slice(0, 10)), ['2026-09-25', '2026-09-28', '2026-09-29']);
});

test('Nächste Fälligkeit wiederkehrender Erinnerungen', () => {
  assert.equal(nextDue('2026-09-29T19:00', 'weekly'), '2026-10-06T19:00');
  assert.equal(nextDue('2026-10-02', 'weekdays'), '2026-10-05');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
});

test('Feiertage', () => {
  assert.equal(easterSunday(2026).toDateString(), new Date(2026, 3, 5).toDateString());
  const nw = holidaysForYear(2026, 'NW');
  assert.ok(nw.get('2026-06-04').some((h) => h.name === 'Fronleichnam' && h.official));
  assert.ok(nw.get('2026-10-03').some((h) => h.official));
  const be = holidaysForYear(2026, 'BE');
  assert.ok(!be.has('2026-06-04'));
  assert.ok(be.get('2026-03-08').some((h) => h.official));
  const sn = holidaysForYear(2026, 'SN');
  assert.ok(sn.get('2026-11-18').some((h) => h.name === 'Buß- und Bettag'));
});
