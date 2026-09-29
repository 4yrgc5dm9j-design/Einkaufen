import { Router } from 'express';
import { db, plainAll } from '../db.js';
import { str, int, notFound, oneOf, localDate, bad, jsonArray } from '../lib/validate.js';

export const mealplanRouter = Router();
const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

mealplanRouter.get('/', (req, res) => {
  const from = localDate(req.query.from, { required: true, field: 'from' });
  const to = localDate(req.query.to, { required: true, field: 'to' });
  const rows = db
    .prepare(`SELECT m.*, r.title AS recipe_title, r.images AS recipe_images, r.servings AS recipe_servings,
              r.ingredients AS recipe_ingredients, r.prep_minutes, r.cook_minutes
              FROM meal_plan m LEFT JOIN recipes r ON r.id = m.recipe_id
              WHERE m.household_id = ? AND m.date >= ? AND m.date < ? ORDER BY m.date, m.id`)
    .all(req.user.household_id, from, to);
  res.json(
    plainAll(rows).map((r) => ({
      ...r,
      recipe_images: jsonArray(r.recipe_images),
      recipe_ingredients: jsonArray(r.recipe_ingredients),
    })),
  );
});

mealplanRouter.post('/', (req, res) => {
  const b = req.body;
  const date = localDate(b.date, { required: true });
  let recipeId = int(b.recipe_id);
  if (recipeId && !db.prepare('SELECT 1 FROM recipes WHERE id = ? AND household_id = ?').get(recipeId, req.user.household_id)) {
    recipeId = null;
  }
  const title = str(b.title, { max: 150 });
  if (!recipeId && !title) throw bad('Bitte wähle ein Rezept oder gib ein Gericht ein.');
  const { lastInsertRowid } = db
    .prepare('INSERT INTO meal_plan (household_id, date, slot, recipe_id, title, servings, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.household_id, date, oneOf(b.slot, SLOTS, 'dinner'), recipeId, title, int(b.servings, { min: 1, max: 99 }), req.user.id);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

mealplanRouter.patch('/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM meal_plan WHERE id = ? AND household_id = ?').get(req.params.id, req.user.household_id);
  if (!m) throw notFound();
  const date = req.body.date !== undefined ? localDate(req.body.date, { required: true }) : m.date;
  const slot = req.body.slot !== undefined ? oneOf(req.body.slot, SLOTS, m.slot) : m.slot;
  const servings = req.body.servings !== undefined ? int(req.body.servings, { min: 1, max: 99 }) : m.servings;
  db.prepare('UPDATE meal_plan SET date = ?, slot = ?, servings = ? WHERE id = ?').run(date, slot, servings, m.id);
  res.json({ ok: true });
});

mealplanRouter.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM meal_plan WHERE id = ? AND household_id = ?').run(req.params.id, req.user.household_id);
  if (!r.changes) throw notFound();
  res.json({ ok: true });
});
