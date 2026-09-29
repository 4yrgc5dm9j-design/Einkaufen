import webpush from 'web-push';
import { db, getSetting, setSetting, plainAll } from './db.js';
import { config } from './config.js';
import { expandEvent, parseLocal, toLocalDateTime } from '../public/js/shared/recurrence.js';

let keys = null;

function ensureKeys() {
  if (keys) return keys;
  const stored = getSetting('vapid');
  keys = stored ? JSON.parse(stored) : webpush.generateVAPIDKeys();
  if (!stored) setSetting('vapid', JSON.stringify(keys));
  webpush.setVapidDetails(config.contactEmail, keys.publicKey, keys.privateKey);
  return keys;
}

export const vapidPublicKey = () => ensureKeys().publicKey;

export function saveSubscription(userId, sub) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw Object.assign(new Error('Ungültiges Abo.'), { status: 400 });
  if (!/^https:\/\//.test(sub.endpoint)) throw Object.assign(new Error('Ungültiges Abo.'), { status: 400 });
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
              ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}

export function removeSubscription(userId, endpoint) {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

export async function sendToUsers(userIds, payload) {
  ensureKeys();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return 0;
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        else console.warn('Push fehlgeschlagen:', err.statusCode || err.message);
      }
    }),
  );
  return sent;
}

const fmtTime = (s) => (s.includes('T') ? s.slice(11, 16) : '');

function markSent(key) {
  const r = db.prepare('INSERT OR IGNORE INTO notifications_sent (key) VALUES (?)').run(key);
  return r.changes > 0;
}

/** Prüft jede Minute fällige Erinnerungen und Termin-Benachrichtigungen. */
async function tick() {
  const now = new Date();
  const nowStr = toLocalDateTime(now);

  // Erinnerungen (nur mit Uhrzeit)
  const due = db
    .prepare(`SELECT r.*, (SELECT GROUP_CONCAT(id) FROM users WHERE household_id = r.household_id) AS members
              FROM reminders r WHERE done = 0 AND notified = 0 AND due_at IS NOT NULL AND length(due_at) = 16 AND due_at <= ?`)
    .all(nowStr);
  for (const r of due) {
    db.prepare('UPDATE reminders SET notified = 1 WHERE id = ?').run(r.id);
    const targets = r.assigned_to ? [r.assigned_to] : String(r.members || '').split(',').map(Number);
    await sendToUsers(targets, { title: `⏰ ${r.title}`, body: r.notes || 'Erinnerung ist fällig', url: '/#/erinnerungen', tag: `rem-${r.id}` });
  }

  // Termine mit Vorab-Erinnerung
  const horizon = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
  const events = plainAll(db.prepare('SELECT * FROM events WHERE reminder_minutes IS NOT NULL').all());
  for (const ev of events) {
    for (const occ of expandEvent(ev, new Date(now.getTime() - 24 * 3600 * 1000), horizon)) {
      const start = parseLocal(occ.all_day ? `${occ.start}T09:00` : occ.start);
      const notifyAt = new Date(start.getTime() - ev.reminder_minutes * 60000);
      // Nur innerhalb von 15 Minuten nach dem Benachrichtigungszeitpunkt senden (kein Nachholen alter Termine)
      if (notifyAt > now || now - notifyAt > 15 * 60000) continue;
      if (!markSent(`ev-${ev.id}-${occ.start}-${ev.reminder_minutes}`)) continue;
      const targets =
        ev.visibility === 'private'
          ? [ev.owner_id]
          : db.prepare('SELECT id FROM users WHERE household_id = ?').all(ev.household_id).map((u) => u.id);
      const when = occ.all_day ? 'Ganztägig' : `um ${fmtTime(occ.start)} Uhr`;
      await sendToUsers(targets, {
        title: `📅 ${ev.title}`,
        body: `${occ.start.slice(0, 10) === nowStr.slice(0, 10) ? 'Heute' : occ.start.slice(8, 10) + '.' + occ.start.slice(5, 7) + '.'} ${when}${ev.location ? ' · ' + ev.location : ''}`,
        url: `/#/kalender?date=${occ.start.slice(0, 10)}`,
        tag: `ev-${ev.id}-${occ.start}`,
      });
    }
  }

  db.prepare("DELETE FROM notifications_sent WHERE sent_at < datetime('now', '-30 days')").run();
}

export function startScheduler() {
  ensureKeys();
  const run = () => tick().catch((err) => console.error('Scheduler-Fehler:', err));
  setTimeout(run, 5000).unref();
  setInterval(run, 60 * 1000).unref();
}
