import { Router } from 'express';
import { db, plainAll } from '../db.js';
import { str, int, bad, notFound, oneOf, color, localDate, localDateTime } from '../../public/js/shared/validate.js';
import { RECURRENCE_LABELS, toLocalDate } from '../../public/js/shared/recurrence.js';

export const calendarRouter = Router();

const VISIBLE = `household_id = ? AND (visibility = 'shared' OR owner_id = ?)`;

function getEvent(req, id) {
  const ev = db.prepare(`SELECT * FROM events WHERE id = ? AND ${VISIBLE}`).get(id, req.user.household_id, req.user.id);
  if (!ev) throw notFound('Termin nicht gefunden.');
  return ev;
}

function normalize(body) {
  const allDay = !!body.all_day;
  const title = str(body.title, { max: 150, required: true, field: 'Titel' });
  let start;
  let end;
  if (allDay) {
    start = localDate(body.start, { required: true, field: 'Beginn' });
    end = localDate(body.end) || start;
  } else {
    start = localDateTime(body.start, { required: true, field: 'Beginn', allowDate: false });
    end = localDateTime(body.end, { allowDate: false }) || start;
  }
  if (end < start) throw bad('Das Ende liegt vor dem Beginn.');
  return {
    title,
    start,
    end,
    all_day: allDay ? 1 : 0,
    location: str(body.location, { max: 200 }),
    notes: str(body.notes, { max: 4000 }),
    color: color(body.color),
    visibility: oneOf(body.visibility, ['shared', 'private'], 'shared'),
    recurrence: oneOf(body.recurrence, Object.keys(RECURRENCE_LABELS), 'none'),
    recurrence_until: localDate(body.recurrence_until),
    reminder_minutes: int(body.reminder_minutes, { min: 0, max: 60 * 24 * 30 }),
  };
}

/** Termine, die den Zeitraum berühren können (Serien werden im Browser aufgefächert). */
calendarRouter.get('/events', (req, res) => {
  const from = localDate(req.query.from, { required: true, field: 'from' });
  const to = localDate(req.query.to, { required: true, field: 'to' });
  const rows = db
    .prepare(`SELECT e.*, u.name AS owner_name, u.color AS owner_color FROM events e JOIN users u ON u.id = e.owner_id
              WHERE e.household_id = ? AND (e.visibility = 'shared' OR e.owner_id = ?)
              AND (
                (e.recurrence = 'none' AND e.start < ? AND substr(e.end, 1, 10) >= ?)
                OR (e.recurrence != 'none' AND e.start < ? AND (e.recurrence_until IS NULL OR e.recurrence_until >= ?))
              ) ORDER BY e.start`)
    .all(req.user.household_id, req.user.id, to, from, to, from);
  res.json(plainAll(rows));
});

calendarRouter.get('/events/search', (req, res) => {
  const q = str(req.query.q, { max: 80 });
  if (!q) return res.json([]);
  const rows = db
    .prepare(`SELECT e.*, u.name AS owner_name, u.color AS owner_color FROM events e JOIN users u ON u.id = e.owner_id
              WHERE e.household_id = ? AND (e.visibility = 'shared' OR e.owner_id = ?)
              AND (e.title LIKE ? OR e.location LIKE ? OR e.notes LIKE ?) ORDER BY e.start DESC LIMIT 50`)
    .all(req.user.household_id, req.user.id, `%${q}%`, `%${q}%`, `%${q}%`);
  res.json(plainAll(rows));
});

calendarRouter.post('/events', (req, res) => {
  const e = normalize(req.body);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO events (household_id, owner_id, title, start, end, all_day, location, notes, color, visibility,
              recurrence, recurrence_until, reminder_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.household_id, req.user.id, e.title, e.start, e.end, e.all_day, e.location, e.notes, e.color, e.visibility,
      e.recurrence, e.recurrence_until, e.reminder_minutes);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

calendarRouter.put('/events/:id', (req, res) => {
  const ev = getEvent(req, req.params.id);
  const e = normalize(req.body);
  // Nur der Besitzer darf einen Termin privat machen
  const visibility = ev.owner_id === req.user.id ? e.visibility : ev.visibility;
  db.prepare(`UPDATE events SET title = ?, start = ?, end = ?, all_day = ?, location = ?, notes = ?, color = ?, visibility = ?,
              recurrence = ?, recurrence_until = ?, reminder_minutes = ? WHERE id = ?`)
    .run(e.title, e.start, e.end, e.all_day, e.location, e.notes, e.color, visibility, e.recurrence, e.recurrence_until,
      e.reminder_minutes, ev.id);
  res.json({ ok: true });
});

/** Einzelnes Vorkommen einer Serie entfernen: Serie davor beenden (einfache Variante: "ab hier"). */
calendarRouter.post('/events/:id/end-series', (req, res) => {
  const ev = getEvent(req, req.params.id);
  const before = localDate(req.body.before, { required: true });
  const until = new Date(`${before}T12:00`);
  until.setDate(until.getDate() - 1);
  const untilStr = toLocalDate(until);
  if (untilStr < ev.start.slice(0, 10)) db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  else db.prepare('UPDATE events SET recurrence_until = ? WHERE id = ?').run(untilStr, ev.id);
  res.json({ ok: true });
});

calendarRouter.delete('/events/:id', (req, res) => {
  const ev = getEvent(req, req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(ev.id);
  res.json({ ok: true });
});
