import { api } from './api.js';
import { expandEvent, toLocalDate, parseLocal, addDays } from './shared/recurrence.js';

/** Lädt Termine im Zeitraum [from, to) und fächert Serien in einzelne Vorkommen auf. */
export async function loadOccurrences(from, to) {
  const events = await api.get(`/calendar/events?from=${toLocalDate(from)}&to=${toLocalDate(to)}`);
  const out = [];
  for (const ev of events) {
    for (const occ of expandEvent(ev, from, to)) {
      out.push({ ...occ, displayColor: ev.color || ev.owner_color });
    }
  }
  return out.sort((a, b) => (b.all_day - a.all_day) || a.start.localeCompare(b.start));
}

/** Vorkommen, die einen bestimmten Tag berühren. */
export function occurrencesOn(occurrences, day) {
  const d = toLocalDate(day);
  return occurrences.filter((o) => o.start.slice(0, 10) <= d && o.end.slice(0, 10) >= d && !(o.end === `${d}T00:00` && !o.all_day && o.start.slice(0, 10) < d));
}

export function timeLabel(occ, day) {
  if (occ.all_day) return 'Ganztägig';
  const d = day ? toLocalDate(day) : occ.start.slice(0, 10);
  const startsToday = occ.start.slice(0, 10) === d;
  const endsToday = occ.end.slice(0, 10) === d;
  if (!startsToday && !endsToday) return 'Ganztägig';
  if (!startsToday) return `bis ${occ.end.slice(11, 16)}`;
  return occ.start.slice(11, 16);
}

export { toLocalDate, parseLocal, addDays };
