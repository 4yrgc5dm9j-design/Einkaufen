import { Router } from 'express';
import { db, tx, plain, plainAll } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth, rateLimit } from '../auth.js';
import { str, color, oneOf, bad, notFound, HttpError } from '../../public/js/shared/validate.js';
import { BUNDESLAENDER } from '../../public/js/shared/holidays.js';
import { vapidPublicKey } from '../push.js';

export const accountRouter = Router();

const USER_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e'];

function createHousehold(name) {
  const { lastInsertRowid } = db.prepare('INSERT INTO households (name) VALUES (?)').run(name);
  const id = Number(lastInsertRowid);
  db.prepare("INSERT INTO shopping_lists (household_id, name, icon, sort) VALUES (?, 'Einkaufsliste', '🛒', 0)").run(id);
  return id;
}

export function householdMembers(householdId) {
  return plainAll(db.prepare('SELECT id, name, email, color FROM users WHERE household_id = ? ORDER BY id').all(householdId));
}

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

accountRouter.post('/auth/register', limiter, (req, res) => {
  const name = str(req.body.name, { max: 60, required: true, field: 'Name' });
  const email = str(req.body.email, { max: 200, required: true, field: 'E-Mail' }).toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Bitte gib eine gültige E-Mail-Adresse ein.');
  if (password.length < 8) throw bad('Das Passwort muss mindestens 8 Zeichen lang sein.');
  if (config.registrationCode && req.body.code !== config.registrationCode) {
    throw new HttpError(403, 'Der Registrierungscode ist falsch.');
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw bad('Mit dieser E-Mail gibt es bereits ein Konto.');

  const userId = tx(() => {
    const householdId = createHousehold(`Haushalt von ${name}`);
    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (email, name, password_hash, color, household_id) VALUES (?, ?, ?, ?, ?)')
      .run(email, name, hashPassword(password), USER_COLORS[count % USER_COLORS.length], householdId);
    return Number(lastInsertRowid);
  });
  createSession(res, req, userId);
  res.status(201).json({ ok: true });
});

accountRouter.post('/auth/login', limiter, (req, res) => {
  const email = str(req.body.email, { max: 200 }).toLowerCase();
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    throw new HttpError(401, 'E-Mail oder Passwort ist falsch.');
  }
  createSession(res, req, user.id);
  res.json({ ok: true });
});

accountRouter.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

accountRouter.get('/auth/config', (req, res) => {
  res.json({ registrationCodeRequired: !!config.registrationCode });
});

// ---------- ab hier angemeldet ----------
accountRouter.use(requireAuth);

accountRouter.get('/me', (req, res) => {
  const u = req.user;
  const household = plain(db.prepare('SELECT id, name FROM households WHERE id = ?').get(u.household_id));
  const incoming = plainAll(
    db.prepare(`SELECT i.id, i.created_at, u.name AS from_name, u.email AS from_email, h.name AS household_name
                FROM invitations i JOIN users u ON u.id = i.from_user_id JOIN households h ON h.id = i.household_id
                WHERE i.to_user_id = ? AND i.status = 'pending' ORDER BY i.id DESC`).all(u.id),
  );
  const outgoing = plainAll(
    db.prepare(`SELECT i.id, i.created_at, u.name AS to_name, u.email AS to_email
                FROM invitations i JOIN users u ON u.id = i.to_user_id
                WHERE i.household_id = ? AND i.status = 'pending' ORDER BY i.id DESC`).all(u.household_id),
  );
  res.json({
    user: u,
    household: { ...household, members: householdMembers(u.household_id) },
    invitations: { incoming, outgoing },
    vapidPublicKey: vapidPublicKey(),
    bundeslaender: BUNDESLAENDER,
  });
});

accountRouter.patch('/me', (req, res) => {
  const u = req.user;
  const name = req.body.name !== undefined ? str(req.body.name, { max: 60, required: true, field: 'Name' }) : u.name;
  const c = req.body.color !== undefined ? color(req.body.color, u.color) : u.color;
  const bl = req.body.bundesland !== undefined ? oneOf(req.body.bundesland, Object.keys(BUNDESLAENDER), u.bundesland) : u.bundesland;
  db.prepare('UPDATE users SET name = ?, color = ?, bundesland = ? WHERE id = ?').run(name, c, bl, u.id);
  res.json({ ok: true });
});

accountRouter.post('/me/password', (req, res) => {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body.current || ''), row.password_hash)) throw bad('Das aktuelle Passwort ist falsch.');
  const next = String(req.body.password || '');
  if (next.length < 8) throw bad('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

accountRouter.delete('/me', (req, res) => {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body.password || ''), row.password_hash)) throw bad('Das Passwort ist falsch.');
  tx(() => {
    const hid = req.user.household_id;
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    if (!db.prepare('SELECT 1 FROM users WHERE household_id = ?').get(hid)) db.prepare('DELETE FROM households WHERE id = ?').run(hid);
  });
  destroySession(req, res);
  res.json({ ok: true });
});

// ---------- Haushalt ----------

accountRouter.patch('/household', (req, res) => {
  const name = str(req.body.name, { max: 80, required: true, field: 'Name' });
  db.prepare('UPDATE households SET name = ? WHERE id = ?').run(name, req.user.household_id);
  res.json({ ok: true });
});

accountRouter.post('/household/invite', (req, res) => {
  const email = str(req.body.email, { max: 200, required: true, field: 'E-Mail' }).toLowerCase();
  const target = db.prepare('SELECT id, household_id FROM users WHERE email = ?').get(email);
  if (!target) throw notFound('Es gibt noch kein Konto mit dieser E-Mail. Die Person muss sich zuerst registrieren.');
  if (target.id === req.user.id) throw bad('Du kannst dich nicht selbst einladen.');
  if (target.household_id === req.user.household_id) throw bad('Diese Person ist bereits in deinem Haushalt.');
  const existing = db
    .prepare("SELECT 1 FROM invitations WHERE to_user_id = ? AND household_id = ? AND status = 'pending'")
    .get(target.id, req.user.household_id);
  if (existing) throw bad('Es gibt bereits eine offene Einladung.');
  db.prepare('INSERT INTO invitations (from_user_id, to_user_id, household_id) VALUES (?, ?, ?)').run(req.user.id, target.id, req.user.household_id);
  res.status(201).json({ ok: true });
});

/** Verschiebt alle Daten eines Haushalts in einen anderen (beim Beitreten). */
function mergeHouseholdInto(fromId, toId) {
  const targetList = db.prepare('SELECT id FROM shopping_lists WHERE household_id = ? ORDER BY sort, id LIMIT 1').get(toId);
  const lists = db.prepare('SELECT id, name FROM shopping_lists WHERE household_id = ?').all(fromId);
  for (const list of lists) {
    const sameName = db.prepare('SELECT id FROM shopping_lists WHERE household_id = ? AND name = ?').get(toId, list.name);
    const dest = sameName?.id ?? targetList?.id;
    if (dest) {
      db.prepare('UPDATE shopping_items SET list_id = ?, household_id = ? WHERE list_id = ?').run(dest, toId, list.id);
      db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(list.id);
    } else {
      db.prepare('UPDATE shopping_lists SET household_id = ? WHERE id = ?').run(toId, list.id);
      db.prepare('UPDATE shopping_items SET household_id = ? WHERE list_id = ?').run(toId, list.id);
    }
  }
  for (const table of ['recipes', 'events', 'reminders', 'meal_plan']) {
    db.prepare(`UPDATE ${table} SET household_id = ? WHERE household_id = ?`).run(toId, fromId);
  }
}

accountRouter.post('/household/invitations/:id/accept', (req, res) => {
  const inv = db.prepare("SELECT * FROM invitations WHERE id = ? AND to_user_id = ? AND status = 'pending'").get(req.params.id, req.user.id);
  if (!inv) throw notFound('Einladung nicht gefunden.');
  tx(() => {
    const oldId = req.user.household_id;
    db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(inv.household_id, req.user.id);
    db.prepare("UPDATE invitations SET status = 'accepted' WHERE id = ?").run(inv.id);
    const othersLeft = db.prepare('SELECT 1 FROM users WHERE household_id = ?').get(oldId);
    if (!othersLeft) {
      mergeHouseholdInto(oldId, inv.household_id);
      db.prepare('DELETE FROM households WHERE id = ?').run(oldId);
    } else {
      // Nur die eigenen Termine mitnehmen, gemeinsame Daten bleiben im alten Haushalt
      db.prepare('UPDATE events SET household_id = ? WHERE owner_id = ?').run(inv.household_id, req.user.id);
    }
  });
  res.json({ ok: true });
});

accountRouter.post('/household/invitations/:id/decline', (req, res) => {
  const r = db
    .prepare("UPDATE invitations SET status = 'declined' WHERE id = ? AND status = 'pending' AND (to_user_id = ? OR household_id = ?)")
    .run(req.params.id, req.user.id, req.user.household_id);
  if (!r.changes) throw notFound('Einladung nicht gefunden.');
  res.json({ ok: true });
});

accountRouter.post('/household/leave', (req, res) => {
  const members = householdMembers(req.user.household_id);
  if (members.length < 2) throw bad('Du bist allein in diesem Haushalt.');
  tx(() => {
    const newId = createHousehold(`Haushalt von ${req.user.name}`);
    db.prepare('UPDATE users SET household_id = ? WHERE id = ?').run(newId, req.user.id);
    db.prepare("UPDATE events SET household_id = ? WHERE owner_id = ? AND visibility = 'private'").run(newId, req.user.id);
    db.prepare('UPDATE reminders SET assigned_to = NULL WHERE assigned_to = ?').run(req.user.id);
  });
  res.json({ ok: true });
});
