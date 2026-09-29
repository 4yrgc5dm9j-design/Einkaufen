import { Router } from 'express';
import { db, tx, plainAll } from '../db.js';
import { str, num, int, bad, notFound, oneOf } from '../lib/validate.js';
import { parseIngredient, guessCategory, CATEGORIES } from '../../public/js/shared/ingredients.js';

export const shoppingRouter = Router();
const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

function getList(req, id) {
  const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!list) throw notFound('Liste nicht gefunden.');
  return list;
}

function getItem(req, id) {
  const item = db.prepare('SELECT * FROM shopping_items WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!item) throw notFound('Eintrag nicht gefunden.');
  return item;
}

function remember(householdId, name, category) {
  db.prepare(`INSERT INTO shopping_history (household_id, name, category) VALUES (?, ?, ?)
              ON CONFLICT(household_id, name) DO UPDATE SET uses = uses + 1, last_used = datetime('now'), category = excluded.category`)
    .run(householdId, name, category);
}

function knownCategory(householdId, name) {
  return db.prepare('SELECT category FROM shopping_history WHERE household_id = ? AND name = ?').get(householdId, name)?.category;
}

/** Fügt einen Eintrag hinzu oder erhöht die Menge eines gleichen, noch offenen Eintrags. */
function addItem(req, listId, { name, quantity, unit, note = '', category, recipe_title = null }) {
  const hid = req.user.household_id;
  const cat = oneOf(category, CATEGORY_NAMES, null) || knownCategory(hid, name) || guessCategory(name);
  const existing = db
    .prepare('SELECT * FROM shopping_items WHERE list_id = ? AND checked = 0 AND name = ? COLLATE NOCASE AND unit = ?')
    .get(listId, name, unit || '');
  if (existing) {
    const q = existing.quantity != null && quantity != null ? existing.quantity + quantity : existing.quantity ?? quantity;
    const recipes = new Set([...(existing.recipe_title || '').split(', '), recipe_title].filter(Boolean));
    db.prepare('UPDATE shopping_items SET quantity = ?, recipe_title = ?, note = ? WHERE id = ?').run(
      q,
      [...recipes].join(', ') || null,
      existing.note || note,
      existing.id,
    );
    remember(hid, name, cat);
    return existing.id;
  }
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO shopping_items (list_id, household_id, name, quantity, unit, note, category, added_by, recipe_title)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(listId, hid, name, quantity, unit || '', note, cat, req.user.id, recipe_title);
  remember(hid, name, cat);
  return Number(lastInsertRowid);
}

shoppingRouter.get('/', (req, res) => {
  const hid = req.user.household_id;
  const lists = plainAll(db.prepare('SELECT * FROM shopping_lists WHERE household_id = ? ORDER BY sort, id').all(hid));
  const items = plainAll(
    db.prepare(`SELECT i.*, u.name AS added_by_name, u.color AS added_by_color FROM shopping_items i
                LEFT JOIN users u ON u.id = i.added_by WHERE i.household_id = ? ORDER BY i.checked, i.created_at DESC`).all(hid),
  );
  res.json({ lists, items });
});

shoppingRouter.get('/suggestions', (req, res) => {
  const q = str(req.query.q, { max: 60 });
  const rows = q
    ? db.prepare(`SELECT name, category FROM shopping_history WHERE household_id = ? AND name LIKE ? ORDER BY uses DESC LIMIT 8`).all(req.user.household_id, `%${q}%`)
    : db.prepare(`SELECT name, category FROM shopping_history WHERE household_id = ? ORDER BY uses DESC, last_used DESC LIMIT 16`).all(req.user.household_id);
  res.json(plainAll(rows));
});

shoppingRouter.post('/lists', (req, res) => {
  const name = str(req.body.name, { max: 40, required: true, field: 'Name' });
  const icon = str(req.body.icon, { max: 8 }) || '🛒';
  const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS s FROM shopping_lists WHERE household_id = ?').get(req.user.household_id).s;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO shopping_lists (household_id, name, icon, sort) VALUES (?, ?, ?, ?)')
    .run(req.user.household_id, name, icon, sort);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

shoppingRouter.patch('/lists/:id', (req, res) => {
  const list = getList(req, req.params.id);
  const name = req.body.name !== undefined ? str(req.body.name, { max: 40, required: true, field: 'Name' }) : list.name;
  const icon = req.body.icon !== undefined ? str(req.body.icon, { max: 8 }) || '🛒' : list.icon;
  db.prepare('UPDATE shopping_lists SET name = ?, icon = ? WHERE id = ?').run(name, icon, list.id);
  res.json({ ok: true });
});

shoppingRouter.delete('/lists/:id', (req, res) => {
  const list = getList(req, req.params.id);
  const count = db.prepare('SELECT COUNT(*) AS n FROM shopping_lists WHERE household_id = ?').get(req.user.household_id).n;
  if (count <= 1) throw bad('Die letzte Liste kann nicht gelöscht werden.');
  db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(list.id);
  res.json({ ok: true });
});

shoppingRouter.post('/lists/:id/clear-checked', (req, res) => {
  const list = getList(req, req.params.id);
  const r = db.prepare('DELETE FROM shopping_items WHERE list_id = ? AND checked = 1').run(list.id);
  res.json({ removed: r.changes });
});

shoppingRouter.post('/items', (req, res) => {
  const list = getList(req, req.body.list_id);
  let item;
  if (req.body.text !== undefined) {
    const parsed = parseIngredient(str(req.body.text, { max: 200, required: true, field: 'Eintrag' }));
    item = { ...parsed, name: parsed.name.charAt(0).toUpperCase() + parsed.name.slice(1) };
  } else {
    item = {
      name: str(req.body.name, { max: 120, required: true, field: 'Name' }),
      quantity: num(req.body.quantity),
      unit: str(req.body.unit, { max: 20 }),
      note: str(req.body.note, { max: 200 }),
    };
  }
  item.category = req.body.category;
  const id = addItem(req, list.id, item);
  res.status(201).json({ id });
});

shoppingRouter.post('/items/bulk', (req, res) => {
  const list = getList(req, req.body.list_id);
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 200) : [];
  if (!items.length) throw bad('Keine Zutaten ausgewählt.');
  const recipeTitle = str(req.body.recipe_title, { max: 120 }) || null;
  tx(() => {
    for (const it of items) {
      const name = str(it.name, { max: 120 });
      if (!name) continue;
      addItem(req, list.id, { name, quantity: num(it.quantity), unit: str(it.unit, { max: 20 }), note: str(it.note, { max: 200 }), recipe_title: recipeTitle });
    }
  });
  res.status(201).json({ ok: true, count: items.length });
});

shoppingRouter.patch('/items/:id', (req, res) => {
  const item = getItem(req, req.params.id);
  const b = req.body;
  const next = {
    name: b.name !== undefined ? str(b.name, { max: 120, required: true, field: 'Name' }) : item.name,
    quantity: b.quantity !== undefined ? num(b.quantity) : item.quantity,
    unit: b.unit !== undefined ? str(b.unit, { max: 20 }) : item.unit,
    note: b.note !== undefined ? str(b.note, { max: 200 }) : item.note,
    category: b.category !== undefined ? oneOf(b.category, CATEGORY_NAMES, item.category) : item.category,
    checked: b.checked !== undefined ? (b.checked ? 1 : 0) : item.checked,
    list_id: b.list_id !== undefined ? getList(req, int(b.list_id)).id : item.list_id,
  };
  db.prepare(`UPDATE shopping_items SET name = ?, quantity = ?, unit = ?, note = ?, category = ?, checked = ?, list_id = ?,
              checked_at = CASE WHEN ? = 1 AND checked = 0 THEN datetime('now') WHEN ? = 0 THEN NULL ELSE checked_at END
              WHERE id = ?`)
    .run(next.name, next.quantity, next.unit, next.note, next.category, next.checked, next.list_id, next.checked, next.checked, item.id);
  if (b.category !== undefined) remember(req.user.household_id, next.name, next.category);
  res.json({ ok: true });
});

shoppingRouter.delete('/items/:id', (req, res) => {
  const item = getItem(req, req.params.id);
  db.prepare('DELETE FROM shopping_items WHERE id = ?').run(item.id);
  res.json({ ok: true });
});
