// Benachrichtigungen ohne Server: Solange die App geöffnet ist (oder kurz im Hintergrund),
// wird jede Minute geprüft, ob Erinnerungen oder Termine fällig sind.
import { api } from '../api.js';
import { toast } from '../ui.js';
import { expandEvent, parseLocal, toLocalDateTime } from '../shared/recurrence.js';

const KEY = 'alltag:notified';

function sentSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markSent(set, key) {
  set.add(key);
  try {
    localStorage.setItem(KEY, JSON.stringify([...set].slice(-400)));
  } catch {
    /* egal */
  }
}

async function show(title, body, url) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) return reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: title, data: { url } });
      return new Notification(title, { body });
    } catch {
      /* Fallback unten */
    }
  }
  toast(`${title} – ${body}`, { duration: 8000 });
}

async function check(userId) {
  const now = new Date();
  const nowStr = toLocalDateTime(now);
  const sent = sentSet();

  const reminders = await api.get('/reminders').catch(() => []);
  for (const r of reminders) {
    if (r.done || !r.due_at || r.due_at.length !== 16 || r.due_at > nowStr) continue;
    if (r.assigned_to && r.assigned_to !== userId) continue;
    const key = `rem-${r.id}-${r.due_at}`;
    if (sent.has(key)) continue;
    // Nur frische Fälligkeiten melden (nicht alles Überfällige beim ersten Öffnen)
    if (now - parseLocal(r.due_at) < 6 * 3600000) await show(`⏰ ${r.title}`, r.notes || 'Erinnerung ist fällig', './#/erinnerungen');
    markSent(sent, key);
  }

  const from = new Date(now.getTime() - 86400000);
  const to = new Date(now.getTime() + 8 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const d = (x) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const events = await api.get(`/calendar/events?from=${d(from)}&to=${d(to)}`).catch(() => []);
  for (const ev of events) {
    if (ev.reminder_minutes == null) continue;
    for (const occ of expandEvent(ev, from, to)) {
      const start = parseLocal(occ.all_day ? `${occ.start}T09:00` : occ.start);
      const at = new Date(start.getTime() - ev.reminder_minutes * 60000);
      const key = `ev-${ev.id}-${occ.start}-${ev.reminder_minutes}`;
      if (at > now || sent.has(key)) continue;
      if (now - at < 30 * 60000) await show(`📅 ${ev.title}`, occ.all_day ? 'Heute ganztägig' : `um ${occ.start.slice(11, 16)} Uhr${ev.location ? ` · ${ev.location}` : ''}`, './#/kalender');
      markSent(sent, key);
    }
  }
}

let timer = null;
let currentUser = null;
const run = () => currentUser && check(currentUser).catch(() => {});

export function startLocalNotifications(userId) {
  if (!timer) {
    timer = setInterval(run, 60000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  }
  currentUser = userId;
  setTimeout(run, 3000);
}
