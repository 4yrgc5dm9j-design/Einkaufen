import { Router } from 'express';
import { db, plainAll } from '../db.js';
import { str, int, notFound, oneOf, localDateTime, bad } from '../../public/js/shared/validate.js';
import { nextDue, toLocalDate } from '../../public/js/shared/recurrence.js';

export const remindersRouter = Router();
const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'];

function getReminder(req, id) {
  const r = db.prepare('SELECT * FROM reminders WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!r) throw notFound('Erinnerung nicht gefunden.');
  return r;
}

function assignee(req, value) {
  const id = int(value);
  if (!id) return null;
  const ok = db.prepare('SELECT 1 FROM users WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!ok) throw bad('Diese Person gehört nicht zu deinem Haushalt.');
  return id;
}

remindersRouter.get('/', (req, res) => {
  const rows = db
    .prepare(`SELECT r.*, a.name AS assigned_name, a.color AS assigned_color, c.name AS created_by_name
              FROM reminders r LEFT JOIN users a ON a.id = r.assigned_to LEFT JOIN users c ON c.id = r.created_by
              WHERE r.household_id = ? AND (r.done = 0 OR r.done_at > datetime('now', '-14 days'))
              ORDER BY r.done, r.due_at IS NULL, r.due_at, r.priority DESC, r.id DESC`)
    .all(req.user.household_id);
  res.json(plainAll(rows));
});

remindersRouter.post('/', (req, res) => {
  const b = req.body;
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO reminders (household_id, created_by, assigned_to, title, notes, due_at, repeat, priority)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.household_id, req.user.id, assignee(req, b.assigned_to), str(b.title, { max: 200, required: true, field: 'Titel' }),
      str(b.notes, { max: 2000 }), localDateTime(b.due_at), oneOf(b.repeat, REPEATS, 'none'), int(b.priority, { min: 0, max: 2, fallback: 0 }));
  res.status(201).json({ id: Number(lastInsertRowid) });
});

remindersRouter.put('/:id', (req, res) => {
  const r = getReminder(req, req.params.id);
  const b = req.body;
  const due = localDateTime(b.due_at);
  db.prepare(`UPDATE reminders SET title = ?, notes = ?, due_at = ?, repeat = ?, priority = ?, assigned_to = ?,
              notified = CASE WHEN ? IS NOT due_at THEN 0 ELSE notified END WHERE id = ?`)
    .run(str(b.title, { max: 200, required: true, field: 'Titel' }), str(b.notes, { max: 2000 }), due, oneOf(b.repeat, REPEATS, 'none'),
      int(b.priority, { min: 0, max: 2, fallback: 0 }), assignee(req, b.assigned_to), due, r.id);
  res.json({ ok: true });
});

/** Abhaken. Wiederkehrende Erinnerungen rücken stattdessen auf den nächsten Termin vor. */
remindersRouter.post('/:id/toggle', (req, res) => {
  const r = getReminder(req, req.params.id);
  if (!r.done && r.repeat !== 'none' && r.due_at) {
    let next = nextDue(r.due_at, r.repeat);
    const today = toLocalDate(new Date());
    // überfällige Serien bis in die Zukunft vorspulen
    for (let i = 0; i < 400 && next && next.slice(0, 10) < today; i++) next = nextDue(next, r.repeat);
    db.prepare('UPDATE reminders SET due_at = ?, notified = 0 WHERE id = ?').run(next, r.id);
    return res.json({ ok: true, next });
  }
  db.prepare(`UPDATE reminders SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?`)
    .run(r.done ? 0 : 1, r.done ? 0 : 1, r.id);
  res.json({ ok: true });
});

remindersRouter.delete('/:id', (req, res) => {
  const r = getReminder(req, req.params.id);
  db.prepare('DELETE FROM reminders WHERE id = ?').run(r.id);
  res.json({ ok: true });
});
