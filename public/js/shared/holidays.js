// Gesetzliche Feiertage in Deutschland (inkl. Bundesland-spezifischer) und besondere Tage.

export const BUNDESLAENDER = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Ostersonntag nach der Gaußschen Osterformel (anonymer gregorianischer Algorithmus). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Liefert eine Map "YYYY-MM-DD" -> [{ name, official }] für ein Jahr.
 * official = gesetzlicher Feiertag im gewählten Bundesland; sonst besonderer Tag (kein freier Tag).
 */
export function holidaysForYear(year, state = 'NW') {
  const E = easterSunday(year);
  const list = [];
  const add = (date, name, states = null) => {
    const official = states === null || states.includes(state);
    list.push({ date: iso(date), name, official });
  };
  const fixed = (m, d) => new Date(year, m - 1, d);

  add(fixed(1, 1), 'Neujahr');
  if (['BW', 'BY', 'ST'].includes(state)) add(fixed(1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  if (['BE', 'MV'].includes(state)) add(fixed(3, 8), 'Internationaler Frauentag', ['BE', 'MV']);
  add(plus(E, -2), 'Karfreitag');
  add(E, 'Ostersonntag', ['BB']);
  add(plus(E, 1), 'Ostermontag');
  add(fixed(5, 1), 'Tag der Arbeit');
  add(plus(E, 39), 'Christi Himmelfahrt');
  add(plus(E, 49), 'Pfingstsonntag', ['BB']);
  add(plus(E, 50), 'Pfingstmontag');
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(state)) add(plus(E, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  if (['SL', 'BY'].includes(state)) add(fixed(8, 15), state === 'BY' ? 'Mariä Himmelfahrt (teilw.)' : 'Mariä Himmelfahrt', ['SL', 'BY']);
  if (state === 'TH') add(fixed(9, 20), 'Weltkindertag', ['TH']);
  add(fixed(10, 3), 'Tag der Deutschen Einheit');
  const reformation = ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'];
  if (reformation.includes(state)) add(fixed(10, 31), 'Reformationstag', reformation);
  const allerheiligen = ['BW', 'BY', 'NW', 'RP', 'SL'];
  if (allerheiligen.includes(state)) add(fixed(11, 1), 'Allerheiligen', allerheiligen);
  if (state === 'SN') {
    // Mittwoch vor dem 23. November
    let d = fixed(11, 22);
    while (d.getDay() !== 3) d = plus(d, -1);
    add(d, 'Buß- und Bettag', ['SN']);
  }
  add(fixed(12, 25), '1. Weihnachtstag');
  add(fixed(12, 26), '2. Weihnachtstag');

  // Besondere Tage (keine gesetzlichen Feiertage)
  const special = (date, name) => list.push({ date: iso(date), name, official: false });
  special(fixed(2, 14), 'Valentinstag');
  special(plus(E, -52), 'Weiberfastnacht');
  special(plus(E, -48), 'Rosenmontag');
  special(plus(E, -46), 'Aschermittwoch');
  // Muttertag: 2. Sonntag im Mai
  let may = fixed(5, 1);
  while (may.getDay() !== 0) may = plus(may, 1);
  special(plus(may, 7), 'Muttertag');
  special(plus(E, 39), 'Vatertag');
  // Zeitumstellung: letzter Sonntag im März / Oktober
  const lastSunday = (m) => {
    let d = new Date(year, m, 0);
    while (d.getDay() !== 0) d = plus(d, -1);
    return d;
  };
  special(lastSunday(3), 'Beginn Sommerzeit');
  special(lastSunday(10), 'Ende Sommerzeit');
  special(fixed(10, 31), 'Halloween');
  special(fixed(12, 6), 'Nikolaus');
  // Advent: 4. Advent = letzter Sonntag vor dem 25.12.
  let advent4 = fixed(12, 24);
  while (advent4.getDay() !== 0) advent4 = plus(advent4, -1);
  for (let n = 1; n <= 4; n++) special(plus(advent4, -7 * (4 - n)), `${n}. Advent`);
  special(fixed(12, 24), 'Heiligabend');
  special(fixed(12, 31), 'Silvester');

  const map = new Map();
  for (const h of list) {
    if (!map.has(h.date)) map.set(h.date, []);
    map.get(h.date).push(h);
  }
  // gesetzliche Feiertage zuerst
  for (const arr of map.values()) arr.sort((a, b) => b.official - a.official);
  return map;
}

const cache = new Map();
export function holidaysOn(dateStr, state) {
  const year = Number(dateStr.slice(0, 4));
  const key = `${year}-${state}`;
  if (!cache.has(key)) cache.set(key, holidaysForYear(year, state));
  return cache.get(key).get(dateStr) || [];
}

/** Nächste gesetzliche Feiertage ab heute. */
export function upcomingHolidays(fromDate, state, count = 3) {
  const out = [];
  const start = iso(fromDate);
  for (let y = fromDate.getFullYear(); y <= fromDate.getFullYear() + 1 && out.length < count; y++) {
    const map = holidaysForYear(y, state);
    const dates = [...map.keys()].sort();
    for (const d of dates) {
      if (d < start) continue;
      for (const h of map.get(d)) if (h.official) out.push(h);
      if (out.length >= count) break;
    }
  }
  return out.slice(0, count);
}
