// Gemeinsam von Server und Browser genutzt: lokale Datums-Hilfen und Wiederholungen von Terminen.
// Zeiten werden als lokale ISO-Strings ohne Zeitzone gespeichert: "2026-09-29T14:30" bzw. "2026-09-29".

const pad = (n) => String(n).padStart(2, '0');

export function parseLocal(str) {
  if (!str) return null;
  const [datePart, timePart = '00:00'] = String(str).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function toLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalDateTime(date) {
  return `${toLocalDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Monat addieren; am Monatsende auf den letzten gültigen Tag kürzen (31.01. -> 28./29.02.). */
export function addMonths(date, n, anchorDay = date.getDate()) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(anchorDay, last));
  return d;
}

function step(recurrence, i, anchor) {
  switch (recurrence) {
    case 'daily':
      return addDays(anchor, i);
    case 'weekly':
      return addDays(anchor, 7 * i);
    case 'biweekly':
      return addDays(anchor, 14 * i);
    case 'monthly':
      return addMonths(anchor, i, anchor.getDate());
    case 'yearly':
      return addMonths(anchor, 12 * i, anchor.getDate());
    default:
      return null;
  }
}

/**
 * Liefert alle Vorkommen eines Termins, die den Zeitraum [rangeStart, rangeEnd) berühren.
 * Jedes Vorkommen hat start/end als lokale Strings und occurrence (Index).
 */
export function expandEvent(event, rangeStart, rangeEnd) {
  const start = parseLocal(event.start);
  const end = parseLocal(event.end) || start;
  const allDay = !!event.all_day;
  // Ganztägige Termine: end ist der letzte Tag (inklusiv)
  const effEnd = allDay ? addDays(end, 1) : end;
  const duration = Math.max(0, effEnd - start);
  const fmt = allDay ? toLocalDate : toLocalDateTime;
  const until = event.recurrence_until ? addDays(parseLocal(event.recurrence_until), 1) : null;
  const out = [];

  const push = (s, i) => {
    const e = new Date(s.getTime() + duration);
    if (e > rangeStart && s < rangeEnd) {
      out.push({
        ...event,
        start: fmt(s),
        end: allDay ? toLocalDate(addDays(e, -1)) : fmt(e),
        occurrence: i,
        series_start: event.start,
        series_end: event.end,
      });
    }
  };

  const rec = event.recurrence || 'none';
  if (rec === 'none') {
    push(start, 0);
    return out;
  }

  const limit = 3000;
  if (rec === 'weekdays') {
    let offset = Math.max(0, Math.floor((rangeStart - start - duration) / 86400000) - 1);
    for (let n = 0; n < limit; n++, offset++) {
      const d = addDays(start, offset);
      if (d >= rangeEnd || (until && d >= until)) break;
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) push(d, offset);
    }
    return out;
  }

  // Schneller Einstieg: grob in die Nähe von rangeStart springen
  let i = 0;
  const approxDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 30.4, yearly: 365.25 }[rec] || 1;
  const skip = Math.floor((rangeStart - start - duration) / (approxDays * 86400000)) - 2;
  if (skip > 0) i = skip;
  for (let n = 0; n < limit; n++, i++) {
    const s = step(rec, i, start);
    if (!s || s >= rangeEnd || (until && s >= until)) break;
    push(s, i);
  }
  return out;
}

export const RECURRENCE_LABELS = {
  none: 'Einmalig',
  daily: 'Täglich',
  weekdays: 'Werktags (Mo–Fr)',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Monatlich',
  yearly: 'Jährlich',
};

/** Nächstes Fälligkeitsdatum einer sich wiederholenden Erinnerung. */
export function nextDue(dueStr, repeat) {
  const d = parseLocal(dueStr);
  if (!d) return null;
  const hasTime = String(dueStr).includes('T');
  let next;
  switch (repeat) {
    case 'daily': next = addDays(d, 1); break;
    case 'weekdays': {
      next = addDays(d, 1);
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
      break;
    }
    case 'weekly': next = addDays(d, 7); break;
    case 'biweekly': next = addDays(d, 14); break;
    case 'monthly': next = addMonths(d, 1); break;
    case 'yearly': next = addMonths(d, 12); break;
    default: return null;
  }
  return hasTime ? toLocalDateTime(next) : toLocalDate(next);
}
