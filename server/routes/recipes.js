import { Router } from 'express';
import { db, plain, plainAll } from '../db.js';
import { str, int, num, bad, notFound, jsonArray } from '../lib/validate.js';
import { searchRecipes, getExternalRecipe, importFromUrl } from '../lib/recipeSources.js';
import { saveDataUrl, saveRemoteImage, deleteLocalImages } from '../lib/uploads.js';
import { rateLimit } from '../auth.js';

export const recipesRouter = Router();

const JSON_FIELDS = ['ingredients', 'steps', 'tags', 'images'];

function decode(row) {
  if (!row) return row;
  const r = plain(row);
  for (const f of JSON_FIELDS) r[f] = jsonArray(r[f]);
  r.favorite = !!r.favorite;
  return r;
}

function getRecipe(req, id) {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ? AND household_id = ?').get(id, req.user.household_id);
  if (!row) throw notFound('Rezept nicht gefunden.');
  return decode(row);
}

async function localizeImages(images) {
  const out = [];
  for (const img of images.slice(0, 12)) {
    const url = String(img || '');
    if (url.startsWith('/uploads/')) out.push(url);
    else if (url.startsWith('data:image/')) out.push(saveDataUrl(url));
    else if (/^https?:\/\//.test(url)) {
      // Bilder aus dem Internet lokal speichern, damit sie dauerhaft verfügbar sind
      try {
        out.push(await saveRemoteImage(url));
      } catch {
        out.push(url);
      }
    }
  }
  return out;
}

function normalize(body) {
  const title = str(body.title, { max: 150, required: true, field: 'Titel' });
  const ingredients = jsonArray(body.ingredients)
    .slice(0, 150)
    .map((i) => ({
      quantity: num(i?.quantity),
      unit: str(i?.unit, { max: 20 }),
      name: str(i?.name, { max: 150 }),
      note: str(i?.note, { max: 200 }),
      ...(i?.group ? { group: str(i.group, { max: 80 }) } : {}),
    }))
    .filter((i) => i.name);
  const steps = jsonArray(body.steps).map((s) => str(s, { max: 3000 })).filter(Boolean).slice(0, 100);
  const tags = [...new Set(jsonArray(body.tags).map((t) => str(t, { max: 30 })).filter(Boolean))].slice(0, 15);
  return {
    title,
    description: str(body.description, { max: 2000 }),
    servings: int(body.servings, { min: 1, max: 99, fallback: 4 }),
    prep_minutes: int(body.prep_minutes, { min: 0, max: 10000 }),
    cook_minutes: int(body.cook_minutes, { min: 0, max: 10000 }),
    difficulty: str(body.difficulty, { max: 20 }),
    ingredients,
    steps,
    tags,
    source_url: /^https?:\/\//.test(String(body.source_url || '')) ? str(body.source_url, { max: 500 }) : '',
  };
}

// ---------- Internet ----------

const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 40 });

recipesRouter.get('/discover/search', searchLimiter, async (req, res) => {
  const q = str(req.query.q, { max: 80, required: true, field: 'Suchbegriff' });
  res.json(await searchRecipes(q, { offset: int(req.query.offset, { min: 0, max: 1000, fallback: 0 }) }));
});

recipesRouter.get('/discover/:source/:id', searchLimiter, async (req, res) => {
  res.json(await getExternalRecipe(req.params.source, req.params.id));
});

recipesRouter.post('/import', searchLimiter, async (req, res) => {
  const url = str(req.body.url, { max: 1000, required: true, field: 'Adresse' });
  if (!/^https?:\/\//i.test(url)) throw bad('Bitte gib eine vollständige Adresse (https://…) ein.');
  res.json(await importFromUrl(url));
});

// ---------- Eigene Rezepte ----------

recipesRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM recipes WHERE household_id = ? ORDER BY favorite DESC, updated_at DESC')
    .all(req.user.household_id)
    .map(decode);
  const q = String(req.query.q || '').toLowerCase().trim();
  const filtered = q
    ? rows.filter((r) => [r.title, r.description, ...r.tags, ...r.ingredients.map((i) => i.name)].join(' ').toLowerCase().includes(q))
    : rows;
  res.json(
    filtered.map(({ steps, ...r }) => ({ ...r, ingredient_count: r.ingredients.length, ingredients: undefined })),
  );
});

recipesRouter.get('/:id', (req, res) => {
  const recipe = getRecipe(req, req.params.id);
  const author = db.prepare('SELECT name FROM users WHERE id = ?').get(recipe.created_by);
  res.json({ ...recipe, created_by_name: author?.name || null });
});

recipesRouter.post('/', async (req, res) => {
  const r = normalize(req.body);
  const images = await localizeImages(jsonArray(req.body.images));
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO recipes (household_id, created_by, title, description, servings, prep_minutes, cook_minutes, difficulty,
              ingredients, steps, tags, images, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.user.household_id, req.user.id, r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes, r.difficulty,
      JSON.stringify(r.ingredients), JSON.stringify(r.steps), JSON.stringify(r.tags), JSON.stringify(images), r.source_url);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

recipesRouter.put('/:id', async (req, res) => {
  const existing = getRecipe(req, req.params.id);
  const r = normalize(req.body);
  const images = await localizeImages(jsonArray(req.body.images));
  db.prepare(`UPDATE recipes SET title = ?, description = ?, servings = ?, prep_minutes = ?, cook_minutes = ?, difficulty = ?,
              ingredients = ?, steps = ?, tags = ?, images = ?, source_url = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(r.title, r.description, r.servings, r.prep_minutes, r.cook_minutes, r.difficulty, JSON.stringify(r.ingredients),
      JSON.stringify(r.steps), JSON.stringify(r.tags), JSON.stringify(images), r.source_url, existing.id);
  deleteLocalImages(existing.images.filter((i) => !images.includes(i)));
  res.json({ ok: true });
});

recipesRouter.patch('/:id/favorite', (req, res) => {
  const r = getRecipe(req, req.params.id);
  db.prepare('UPDATE recipes SET favorite = ? WHERE id = ?').run(req.body.favorite ? 1 : 0, r.id);
  res.json({ ok: true });
});

recipesRouter.delete('/:id', (req, res) => {
  const r = getRecipe(req, req.params.id);
  db.prepare('DELETE FROM recipes WHERE id = ?').run(r.id);
  deleteLocalImages(r.images);
  res.json({ ok: true });
});
