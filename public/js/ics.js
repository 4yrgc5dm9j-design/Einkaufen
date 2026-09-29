// Termine als .ics-Datei, damit sie im Kalender des Handys landen (inkl. Erinnerungs-Alarm).
import { RECURRENCE_LABELS } from './shared/recurrence.js';

const RRULE = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

const escapeText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
const compact = (s) => s.replace(/[-:]/g, '');

function addDay(dateStr) {
  const d = new Date(`${dateStr}T12:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function eventLines(ev) {
  const lines = ['BEGIN:VEVENT', `UID:alltag-${ev.id}@alltag`, `DTSTAMP:${compact(new Date().toISOString().slice(0, 19))}Z`];
  if (ev.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${compact(ev.start.slice(0, 10))}`, `DTEND;VALUE=DATE:${addDay(ev.end.slice(0, 10))}`);
  } else {
    lines.push(`DTSTART;TZID=Europe/Berlin:${compact(ev.start)}00`, `DTEND;TZID=Europe/Berlin:${compact(ev.end)}00`);
  }
  lines.push(`SUMMARY:${escapeText(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.notes) lines.push(`DESCRIPTION:${escapeText(ev.notes)}`);
  if (RRULE[ev.recurrence]) {
    lines.push(`RRULE:${RRULE[ev.recurrence]}${ev.recurrence_until ? `;UNTIL=${compact(ev.recurrence_until)}T235959Z` : ''}`);
  }
  if (ev.reminder_minutes != null) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(ev.title)}`, `TRIGGER:-PT${ev.reminder_minutes}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

export function toIcs(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alltag//DE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events.flatMap(eventLines),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

/** Bietet eine Datei zum Teilen/Speichern an (Teilen-Menü auf dem Handy, sonst Download). */
export async function offerFile(filename, content, type) {
  const file = new File([content], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadIcs(events, filename = 'termine.ics') {
  return offerFile(filename, toIcs(events), 'text/calendar');
}

export { RECURRENCE_LABELS };
