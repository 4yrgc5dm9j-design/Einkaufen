import { api } from '../api.js';
import { html, setHTML, icon, $, $$, on, recipeImage, formatMinutes, toast, toastError, confirmDialog, openModal, formData } from '../ui.js';
import { formatQuantity, unitLabel } from '../shared/ingredients.js';
import { toLocalDate } from '../shared/recurrence.js';

export async function render(view, { params, external }, ctx) {
  view.dataset.accent = 'recipe';
  ctx.setTitle('Rezept');
  setHTML(view, html`<div class="skeleton" style="height:300px;border-radius:24px"></div><div class="skeleton" style="height:120px;margin-top:16px"></div>`);

  let recipe;
  try {
    recipe = external ? await api.get(`/recipes/discover/${params[0]}/${encodeURIComponent(params[1])}`) : await api.get(`/recipes/${params[0]}`);
  } catch (err) {
    setHTML(view, html`<div class="empty"><div class="empty-emoji">🍳</div><h3>Rezept nicht verfügbar</h3><p>${err.message}</p><a class="btn btn-soft" href="#/rezepte">Zurück</a></div>`);
    return;
  }
  ctx.setTitle(recipe.title);

  let servings = recipe.servings || 4;
  const selected = new Set(recipe.ingredients.map((_, i) => i));
  const doneSteps = new Set();
  let wakeLock = null;

  const factor = () => servings / (recipe.servings || 4);
  const total = (recipe.prep_minutes || 0) + (recipe.cook_minutes || 0);

  const ingredientsHtml = () => {
    let lastGroup;
    return html`${recipe.ingredients.map((ing, i) => {
      const q = ing.quantity != null ? ing.quantity * factor() : null;
      const groupHead = ing.group && ing.group !== lastGroup ? html`<li class="ing-group">${ing.group}</li>` : '';
      lastGroup = ing.group;
      return html`${groupHead}<li data-ing="${i}">
        <span class="check ${selected.has(i) ? 'on' : ''}">${icon('check', 13)}</span>
        <span class="amount">${formatQuantity(q)} ${unitLabel(ing.unit, q)}</span>
        <span class="name">${ing.name}${ing.note ? html` <span class="note">${ing.note}</span>` : ''}</span>
      </li>`;
    })}`;
  };

  const draw = () => {
    const images = recipe.images || [];
    setHTML(
      view,
      html`
      <div class="recipe-hero">
        ${recipeImage(recipe)}
        <div class="hero-actions">
          <button class="icon-btn" data-action="back" aria-label="Zurück" style="margin-right:auto">${icon('chevronLeft')}</button>
          ${external
            ? ''
            : html`<button class="icon-btn ${recipe.favorite ? 'on' : ''}" data-action="fav" aria-label="Favorit">${icon('heart')}</button>
              <a class="icon-btn" href="#/rezepte/${recipe.id}/bearbeiten" aria-label="Bearbeiten">${icon('edit')}</a>`}
        </div>
        <div class="hero-text">
          ${recipe.tags?.length ? html`<div class="tags">${recipe.tags.slice(0, 4).map((t) => html`<span class="tag">${t}</span>`)}</div>` : ''}
          <h2>${recipe.title}</h2>
          ${recipe.rating ? html`<div style="margin-top:6px;font-weight:700">${icon('star', 15)} ${String(Math.round(recipe.rating * 10) / 10).replace('.', ',')}</div>` : ''}
        </div>
      </div>

      <div class="stat-row">
        <div class="stat"><strong>${total ? formatMinutes(total) : '–'}</strong><small>Zeit</small></div>
        <div class="stat"><strong>${recipe.ingredients.length}</strong><small>Zutaten</small></div>
        <div class="stat"><strong>${recipe.difficulty || (recipe.steps.length ? `${recipe.steps.length} Schritte` : '–')}</strong><small>${recipe.difficulty ? 'Schwierigkeit' : 'Zubereitung'}</small></div>
      </div>

      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:16px">
        ${external ? html`<button class="btn btn-primary" data-action="save">${icon('heart', 17)} In meine Rezepte</button>` : ''}
        <button class="btn btn-soft" data-action="plan">${icon('utensils', 17)} Einplanen</button>
        <button class="btn btn-ghost" data-action="cook">${icon('flame', 17)} Kochmodus</button>
        ${recipe.source_url ? html`<a class="btn btn-ghost" href="${recipe.source_url}" target="_blank" rel="noopener noreferrer">${icon('external', 16)} Quelle</a>` : ''}
        ${external ? '' : html`<button class="btn btn-ghost" data-action="delete" style="color:var(--danger)">${icon('trash', 16)}</button>`}
      </div>

      ${recipe.description ? html`<p style="margin-bottom:16px;color:var(--text-2)">${recipe.description}</p>` : ''}
      ${images.length > 1 ? html`<div class="gallery">${images.map((src) => html`<img src="${src}" alt="" data-zoom="${src}" loading="lazy" referrerpolicy="no-referrer">`)}</div>` : ''}

      <div class="recipe-layout">
        <section class="card card-pad ingredients-card">
          <div class="row" style="justify-content:space-between;flex-wrap:wrap">
            <h3 style="font-size:18px">Zutaten</h3>
            <div class="servings">
              <button data-action="less" aria-label="Weniger Portionen">${icon('minus', 16)}</button>
              <span>${servings} ${servings === 1 ? 'Portion' : 'Portionen'}</span>
              <button data-action="more" aria-label="Mehr Portionen">${icon('plus', 16)}</button>
            </div>
          </div>
          <ul class="ing-list" id="ing-list">${ingredientsHtml()}</ul>
          <button class="btn btn-primary btn-block" data-action="shop" style="--accent:var(--shop)" ${selected.size ? '' : 'disabled'}>
            ${icon('cart', 18)} ${selected.size} ${selected.size === 1 ? 'Zutat' : 'Zutaten'} auf die Einkaufsliste
          </button>
          <p class="muted small" style="margin-top:8px;text-align:center">Tippe Zutaten an, die du schon zu Hause hast.</p>
        </section>

        <section class="card card-pad">
          <h3 style="font-size:18px;margin-bottom:14px">Zubereitung</h3>
          ${recipe.steps.length
            ? html`<ol class="steps">${recipe.steps.map((s, i) => html`<li data-step="${i}" class="${doneSteps.has(i) ? 'done' : ''}">${s}</li>`)}</ol>`
            : html`<p class="muted">Keine Zubereitungsschritte hinterlegt.</p>`}
          ${recipe.created_by_name ? html`<p class="muted small" style="margin-top:16px">Hinzugefügt von ${recipe.created_by_name}</p>` : ''}
        </section>
      </div>`,
    );
  };

  const redrawIngredients = () => {
    setHTML($('#ing-list', view), ingredientsHtml());
    const btn = $('[data-action=shop]', view);
    btn.disabled = !selected.size;
    setHTML(btn, html`${icon('cart', 18)} ${selected.size} ${selected.size === 1 ? 'Zutat' : 'Zutaten'} auf die Einkaufsliste`);
    $('.servings span', view).textContent = `${servings} ${servings === 1 ? 'Portion' : 'Portionen'}`;
  };

  draw();

  on(view, 'click', '[data-ing]', (e, el) => {
    const i = Number(el.dataset.ing);
    if (selected.has(i)) selected.delete(i);
    else selected.add(i);
    redrawIngredients();
  });
  on(view, 'click', '[data-step]', (e, el) => {
    const i = Number(el.dataset.step);
    if (doneSteps.has(i)) doneSteps.delete(i);
    else doneSteps.add(i);
    el.classList.toggle('done');
  });
  on(view, 'click', '[data-zoom]', (e, el) => {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = html`<img src="${el.dataset.zoom}" alt="">`.s;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  });

  on(view, 'click', '[data-action]', async (e, el) => {
    const a = el.dataset.action;
    if (a === 'back') history.length > 1 ? history.back() : ctx.navigate('/rezepte');
    if (a === 'less' && servings > 1) {
      servings--;
      redrawIngredients();
    }
    if (a === 'more' && servings < 99) {
      servings++;
      redrawIngredients();
    }
    if (a === 'shop') addToShopping();
    if (a === 'fav') {
      recipe.favorite = !recipe.favorite;
      el.classList.toggle('on', recipe.favorite);
      api.patch(`/recipes/${recipe.id}/favorite`, { favorite: recipe.favorite }).catch(toastError);
    }
    if (a === 'save') {
      el.disabled = true;
      try {
        const { id } = await api.post('/recipes', recipe);
        toast('In deinen Rezepten gespeichert 💛', { type: 'success' });
        ctx.navigate(`/rezepte/${id}`);
      } catch (err) {
        toastError(err);
        el.disabled = false;
      }
    }
    if (a === 'delete') {
      if (!(await confirmDialog(`„${recipe.title}“ wird endgültig gelöscht.`))) return;
      await api.del(`/recipes/${recipe.id}`);
      toast('Rezept gelöscht');
      ctx.navigate('/rezepte');
    }
    if (a === 'plan') planDialog();
    if (a === 'cook') toggleCookMode(el);
  });

  async function addToShopping() {
    const { lists } = await api.get('/shopping');
    const items = [...selected].sort((a, b) => a - b).map((i) => {
      const ing = recipe.ingredients[i];
      return { ...ing, quantity: ing.quantity != null ? Math.round(ing.quantity * factor() * 100) / 100 : null };
    });
    const send = async (listId) => {
      try {
        await api.post('/shopping/items/bulk', { list_id: listId, items, recipe_title: recipe.title });
        toast(`${items.length} Zutaten hinzugefügt 🛒`, { type: 'success', action: 'Zur Liste', onAction: () => ctx.navigate('/einkauf') });
      } catch (err) {
        toastError(err);
      }
    };
    if (lists.length === 1) return send(lists[0].id);
    const m = openModal({
      title: 'Auf welche Liste?',
      body: html`<div class="pick-list">${lists.map((l) => html`<button class="pick-item" data-list="${l.id}"><span style="font-size:24px">${l.icon}</span><strong>${l.name}</strong></button>`)}</div>`,
    });
    on(m.el, 'click', '[data-list]', (e, el) => {
      m.close();
      send(Number(el.dataset.list));
    });
  }

  function planDialog() {
    const today = toLocalDate(new Date());
    const m = openModal({
      title: 'Im Essensplan eintragen',
      body: html`<form id="plan-form">
        <div class="grid-2">
          <div class="field"><label>Tag</label><input class="input" type="date" name="date" value="${today}" required></div>
          <div class="field"><label>Mahlzeit</label><select class="input" name="slot">
            <option value="breakfast">Frühstück</option><option value="lunch">Mittagessen</option><option value="dinner" selected>Abendessen</option><option value="snack">Snack</option>
          </select></div>
        </div>
        ${external ? html`<p class="muted small">Das Rezept wird dafür in deinen Rezepten gespeichert.</p>` : ''}
      </form>`,
      footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-save style="--accent:var(--meal)">Eintragen</button>`,
    });
    $('[data-save]', m.el).onclick = async () => {
      const body = formData($('#plan-form', m.el));
      try {
        let recipeId = recipe.id;
        if (external) recipeId = (await api.post('/recipes', recipe)).id;
        await api.post('/mealplan', { ...body, recipe_id: recipeId, servings });
        m.close();
        toast('Im Essensplan eingetragen 🍽️', { type: 'success', action: 'Ansehen', onAction: () => ctx.navigate('/essensplan') });
      } catch (err) {
        toastError(err);
      }
    };
  }

  async function toggleCookMode(btn) {
    if (wakeLock) {
      await wakeLock.release().catch(() => {});
      wakeLock = null;
      btn.classList.remove('btn-soft');
      toast('Kochmodus aus');
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      btn.classList.add('btn-soft');
      toast('Kochmodus an – der Bildschirm bleibt eingeschaltet 🔥');
    } catch {
      toast('Dein Browser unterstützt den Kochmodus leider nicht.');
    }
  }

  return () => {
    wakeLock?.release().catch(() => {});
    $$('.lightbox').forEach((l) => l.remove());
  };
}
