import { api } from '../api.js';
import { html, setHTML, icon, $, on, toast, toastError, resizeImage, formData } from '../ui.js';
import { parseIngredient, formatIngredient } from '../shared/ingredients.js';

function ingredientsToText(ingredients) {
  const lines = [];
  let group;
  for (const ing of ingredients || []) {
    if (ing.group && ing.group !== group) {
      lines.push(`${ing.group}:`);
      group = ing.group;
    }
    lines.push(formatIngredient(ing));
  }
  return lines.join('\n');
}

function textToIngredients(text) {
  const out = [];
  let group;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/^[-•*]\s*/, '').trim();
    if (!line) continue;
    if (/:$/.test(line) && !/^\d/.test(line)) {
      group = line.slice(0, -1).trim();
      continue;
    }
    const ing = parseIngredient(line);
    if (ing) out.push(group ? { ...ing, group } : ing);
  }
  return out;
}

export async function render(view, { params, importMode }, ctx) {
  view.dataset.accent = 'recipe';
  const id = params[0];
  let recipe = { title: '', description: '', servings: 4, prep_minutes: '', cook_minutes: '', difficulty: '', ingredients: [], steps: [], tags: [], images: [], source_url: '' };
  if (id) recipe = await api.get(`/recipes/${id}`);
  let images = [...(recipe.images || [])];
  ctx.setTitle(id ? 'Rezept bearbeiten' : importMode ? 'Rezept importieren' : 'Neues Rezept');

  const drawImages = () =>
    setHTML(
      $('#images', view),
      html`${images.map(
        (src, i) => html`<div class="thumb"><img src="${src}" alt="" referrerpolicy="no-referrer">${i === 0 ? html`<span class="main-badge">Titelbild</span>` : html`<button type="button" class="main-badge" data-main="${i}" style="border:none;cursor:pointer">Als Titel</button>`}<button type="button" data-remove="${i}" aria-label="Bild entfernen">${icon('x', 14)}</button></div>`,
      )}
      <label class="add-image">${icon('camera', 22)}<span>Foto hinzufügen</span><input type="file" accept="image/*" multiple hidden id="file-input"></label>`,
    );

  const fill = (r) => {
    const f = $('#recipe-form', view);
    f.elements.title.value = r.title || '';
    f.elements.description.value = r.description || '';
    f.elements.servings.value = r.servings || 4;
    f.elements.prep_minutes.value = r.prep_minutes ?? '';
    f.elements.cook_minutes.value = r.cook_minutes ?? '';
    f.elements.difficulty.value = r.difficulty || '';
    f.elements.tags.value = (r.tags || []).join(', ');
    f.elements.ingredients.value = ingredientsToText(r.ingredients);
    f.elements.steps.value = (r.steps || []).join('\n\n');
    f.elements.source_url.value = r.source_url || '';
    images = [...(r.images || [])];
    drawImages();
  };

  setHTML(
    view,
    html`
    ${importMode
      ? html`<section class="discover-hero" style="margin-bottom:18px">
          <h2>Rezept per Link importieren</h2>
          <p>Kopiere die Adresse eines Rezepts (z. B. von Chefkoch, Lecker, Eat Smarter oder einem Foodblog) und füge sie hier ein.</p>
          <form class="add-input" id="import-form">
            <input name="url" type="url" placeholder="https://www.chefkoch.de/rezepte/…" required autofocus>
            <button class="btn btn-primary" type="submit" style="--accent:var(--recipe)">${icon('link', 18)} Laden</button>
          </form>
        </section>`
      : ''}
    <form id="recipe-form" class="${importMode ? 'hidden' : ''}" novalidate>
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="label" style="margin-bottom:10px">Fotos</div>
        <div class="image-edit" id="images"></div>
      </div>
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="field"><label for="r-title">Titel</label><input class="input" id="r-title" name="title" required placeholder="z. B. Omas Apfelkuchen"></div>
        <div class="field"><label for="r-desc">Beschreibung</label><textarea class="input" id="r-desc" name="description" rows="2" style="min-height:70px" placeholder="Kurz und lecker …"></textarea></div>
        <div class="grid-2">
          <div class="field"><label>Portionen</label><input class="input" name="servings" type="number" min="1" max="99" inputmode="numeric"></div>
          <div class="field"><label>Schwierigkeit</label><select class="input" name="difficulty"><option value="">–</option><option>simpel</option><option>normal</option><option>pfiffig</option></select></div>
          <div class="field"><label>Vorbereitung (Min.)</label><input class="input" name="prep_minutes" type="number" min="0" inputmode="numeric"></div>
          <div class="field"><label>Kochen/Backen (Min.)</label><input class="input" name="cook_minutes" type="number" min="0" inputmode="numeric"></div>
        </div>
        <div class="field"><label>Tags</label><input class="input" name="tags" placeholder="z. B. vegetarisch, schnell, Kuchen"></div>
      </div>
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="field"><label for="r-ing">Zutaten <span class="muted" style="font-weight:500">– eine pro Zeile</span></label>
          <textarea class="input" id="r-ing" name="ingredients" rows="8" placeholder="500 g Mehl&#10;1 Pck. Trockenhefe&#10;2 EL Olivenöl&#10;Salz&#10;&#10;Für den Belag:&#10;200 g Mozzarella"></textarea>
          <small class="muted">Tipp: Zeilen mit Doppelpunkt am Ende („Für den Teig:“) werden zu Überschriften.</small>
        </div>
        <div class="field"><label for="r-steps">Zubereitung <span class="muted" style="font-weight:500">– ein Schritt pro Absatz</span></label>
          <textarea class="input" id="r-steps" name="steps" rows="10" placeholder="Den Ofen auf 200 °C vorheizen.&#10;&#10;Mehl und Hefe vermischen …"></textarea>
        </div>
        <div class="field"><label>Quelle (optional)</label><input class="input" name="source_url" type="url" placeholder="https://…"></div>
      </div>
      <div class="row" style="justify-content:flex-end;gap:10px">
        <a class="btn btn-ghost" href="${id ? `#/rezepte/${id}` : '#/rezepte'}">Abbrechen</a>
        <button class="btn btn-primary" type="submit">${icon('check', 18)} Speichern</button>
      </div>
    </form>`,
  );
  fill(recipe);

  view.addEventListener('change', async (e) => {
    if (e.target.id !== 'file-input') return;
    const files = [...e.target.files].slice(0, 10);
    for (const file of files) {
      try {
        images.push(await resizeImage(file));
      } catch (err) {
        toastError(err);
      }
    }
    drawImages();
  });
  on(view, 'click', '[data-remove]', (e, el) => {
    images.splice(Number(el.dataset.remove), 1);
    drawImages();
  });
  on(view, 'click', '[data-main]', (e, el) => {
    const [img] = images.splice(Number(el.dataset.main), 1);
    images.unshift(img);
    drawImages();
  });

  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (e.target.id === 'import-form') {
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      setHTML(btn, html`<span class="spinner" style="width:18px;height:18px"></span> Lädt …`);
      try {
        const imported = await api.post('/recipes/import', { url: e.target.elements.url.value.trim() });
        fill(imported);
        $('#recipe-form', view).classList.remove('hidden');
        toast('Rezept geladen – prüfen und speichern ✨', { type: 'success' });
        $('#recipe-form', view).scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        toastError(err);
        $('#recipe-form', view).classList.remove('hidden');
      } finally {
        btn.disabled = false;
        setHTML(btn, html`${icon('link', 18)} Laden`);
      }
      return;
    }
    const f = formData(e.target);
    if (!f.title.trim()) {
      toast('Bitte gib einen Titel ein.', { type: 'error' });
      e.target.elements.title.focus();
      return;
    }
    const body = {
      ...f,
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      ingredients: textToIngredients(f.ingredients),
      steps: f.steps.split(/\n\s*\n/.test(f.steps.trim()) ? /\n\s*\n/ : /\n/).map((s) => s.replace(/^\d+[.)]\s*/, '').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
      images,
    };
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (id) {
        await api.put(`/recipes/${id}`, body);
        ctx.navigate(`/rezepte/${id}`);
      } else {
        const res = await api.post('/recipes', body);
        ctx.navigate(`/rezepte/${res.id}`);
      }
      toast('Gespeichert 👩‍🍳', { type: 'success' });
    } catch (err) {
      toastError(err);
      btn.disabled = false;
    }
  });
}
