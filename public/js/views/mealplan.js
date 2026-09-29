import { api } from '../api.js';
import { html, setHTML, icon, $, on, openModal, recipeImage, toast, toastError, formatDate, WEEKDAYS } from '../ui.js';
import { toLocalDate, addDays } from '../shared/recurrence.js';

const SLOTS = { breakfast: 'Frühstück', lunch: 'Mittag', dinner: 'Abend', snack: 'Snack' };
const SLOT_ORDER = Object.keys(SLOTS);

function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

let weekStart = mondayOf(new Date());

export async function render(view, _p, ctx) {
  view.dataset.accent = 'meal';
  ctx.setTitle('Essensplan');
  let entries = [];
  let recipes = null;

  const load = async () => {
    entries = await api.get(`/mealplan?from=${toLocalDate(weekStart)}&to=${toLocalDate(addDays(weekStart, 7))}`);
  };

  const draw = () => {
    const todayStr = toLocalDate(new Date());
    const end = addDays(weekStart, 6);
    const withRecipes = entries.filter((e) => e.recipe_id);
    setHTML(
      view,
      html`
      <div class="recipes-toolbar">
        <div class="segmented">
          <a href="#/rezepte">${icon('book', 16)} Meine</a>
          <a href="#/rezepte/entdecken">${icon('globe', 16)} Entdecken</a>
          <a href="#/essensplan" class="active">${icon('utensils', 16)} Wochenplan</a>
        </div>
      </div>
      <div class="week-nav">
        <button class="icon-btn filled" data-nav="-1" aria-label="Vorige Woche">${icon('chevronLeft')}</button>
        <button class="icon-btn filled" data-nav="1" aria-label="Nächste Woche">${icon('chevronRight')}</button>
        <h3>KW ${isoWeek(weekStart)} · ${formatDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short' })}</h3>
        <button class="btn btn-ghost btn-sm" data-nav="0">Diese Woche</button>
        <button class="btn btn-primary btn-sm" data-action="shop" style="--accent:var(--shop)" ${withRecipes.length ? '' : 'disabled'}>${icon('cart', 16)} Wocheneinkauf</button>
      </div>
      <div class="meal-days">
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const day = addDays(weekStart, i);
          const ds = toLocalDate(day);
          const dayEntries = entries
            .filter((e) => e.date === ds)
            .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
          return html`<div class="meal-day ${ds === todayStr ? 'today' : ''}">
            <div class="meal-day-head"><strong>${WEEKDAYS[day.getDay()]}</strong><small>${formatDate(day, { day: 'numeric', month: 'numeric' })}</small></div>
            ${dayEntries.map(
              (e) => html`<div class="meal-entry">
                ${recipeImage({ title: e.recipe_title || e.title, images: e.recipe_images }, 'thumb')}
                ${e.recipe_id
                  ? html`<a class="info" href="#/rezepte/${e.recipe_id}"><small>${SLOTS[e.slot]}</small><strong>${e.recipe_title}</strong></a>`
                  : html`<div class="info"><small>${SLOTS[e.slot]}</small><strong>${e.title}</strong></div>`}
                <button class="icon-btn" data-del="${e.id}" aria-label="Entfernen" style="width:30px;height:30px">${icon('x', 15)}</button>
              </div>`,
            )}
            <button class="meal-add" data-add="${ds}">${icon('plus', 15)} Hinzufügen</button>
          </div>`;
        })}
      </div>`,
    );
  };

  const refresh = async () => {
    await load();
    draw();
  };

  on(view, 'click', '[data-nav]', (e, el) => {
    const n = Number(el.dataset.nav);
    weekStart = n === 0 ? mondayOf(new Date()) : addDays(weekStart, 7 * n);
    refresh();
  });
  on(view, 'click', '[data-del]', async (e, el) => {
    await api.del(`/mealplan/${el.dataset.del}`).catch(toastError);
    refresh();
  });
  on(view, 'click', '[data-add]', (e, el) => addDialog(el.dataset.add));
  on(view, 'click', '[data-action=shop]', () => shopDialog());

  async function addDialog(date) {
    if (!recipes) recipes = await api.get('/recipes');
    let slot = 'dinner';
    const m = openModal({
      title: `${WEEKDAYS[new Date(`${date}T12:00`).getDay()]}, ${formatDate(new Date(`${date}T12:00`), { day: 'numeric', month: 'long' })}`,
      body: html`
        <div class="segmented" style="width:100%;margin-bottom:14px" id="slot-pick">
          ${Object.entries(SLOTS).map(([k, v]) => html`<button type="button" data-slot="${k}" class="${k === slot ? 'active' : ''}" style="flex:1">${v}</button>`)}
        </div>
        <form class="add-input" id="free-form" style="box-shadow:none">
          <input name="title" placeholder="Freitext, z. B. Reste oder Essen gehen" autocomplete="off">
          <button class="btn btn-primary btn-sm" type="submit" style="height:40px">${icon('plus', 16)}</button>
        </form>
        <div class="search" style="margin-top:12px"><span>${icon('search', 18)}</span><input class="input" id="pick-q" type="search" placeholder="Rezept suchen …"></div>
        <div class="pick-list" id="pick-list"></div>`,
    });
    m.el.dataset.accent = 'meal';
    const drawList = () => {
      const q = $('#pick-q', m.el).value.toLowerCase();
      const list = recipes.filter((r) => !q || r.title.toLowerCase().includes(q));
      setHTML(
        $('#pick-list', m.el),
        list.length
          ? html`${list.map((r) => html`<button class="pick-item" data-recipe="${r.id}">${recipeImage(r, 'thumb')}<div><strong>${r.title}</strong><div class="muted small">${r.servings} Portionen${r.favorite ? ' · ❤️' : ''}</div></div></button>`)}`
          : html`<div class="empty" style="padding:20px"><p>${recipes.length ? 'Kein passendes Rezept.' : 'Noch keine Rezepte gespeichert.'}</p><a class="btn btn-soft btn-sm" href="#/rezepte/entdecken" data-close>Rezepte entdecken</a></div>`,
      );
    };
    drawList();
    $('#pick-q', m.el).addEventListener('input', drawList);
    on(m.el, 'click', '[data-slot]', (e, el) => {
      slot = el.dataset.slot;
      m.el.querySelectorAll('[data-slot]').forEach((b) => b.classList.toggle('active', b === el));
    });
    const save = async (body) => {
      try {
        await api.post('/mealplan', { date, slot, ...body });
        m.close();
        refresh();
      } catch (err) {
        toastError(err);
      }
    };
    on(m.el, 'click', '[data-recipe]', (e, el) => save({ recipe_id: Number(el.dataset.recipe) }));
    $('#free-form', m.el).addEventListener('submit', (e) => {
      e.preventDefault();
      const title = e.target.elements.title.value.trim();
      if (title) save({ title });
    });
  }

  async function shopDialog() {
    const withRecipes = entries.filter((e) => e.recipe_id);
    const { lists } = await api.get('/shopping');
    const m = openModal({
      title: 'Wocheneinkauf',
      body: html`<p class="muted" style="margin-bottom:12px">Zutaten dieser Gerichte auf die Einkaufsliste setzen:</p>
        <div class="pick-list">${withRecipes.map(
          (e) => html`<label class="pick-item" style="cursor:pointer"><input type="checkbox" checked data-entry="${e.id}" style="width:20px;height:20px;accent-color:var(--shop)">
            ${recipeImage({ title: e.recipe_title, images: e.recipe_images }, 'thumb')}
            <div><strong>${e.recipe_title}</strong><div class="muted small">${WEEKDAYS[new Date(`${e.date}T12:00`).getDay()]} · ${e.recipe_ingredients.length} Zutaten</div></div></label>`,
        )}</div>
        ${lists.length > 1 ? html`<div class="field" style="margin-top:14px"><label>Liste</label><select class="input" id="list-pick">${lists.map((l) => html`<option value="${l.id}">${l.icon} ${l.name}</option>`)}</select></div>` : ''}`,
      footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-go style="--accent:var(--shop)">${icon('cart', 16)} Hinzufügen</button>`,
    });
    $('[data-go]', m.el).onclick = async () => {
      const listId = Number($('#list-pick', m.el)?.value || lists[0].id);
      const chosen = [...m.el.querySelectorAll('[data-entry]:checked')].map((c) => withRecipes.find((e) => e.id === Number(c.dataset.entry)));
      try {
        for (const e of chosen) {
          const factor = e.servings && e.recipe_servings ? e.servings / e.recipe_servings : 1;
          const items = e.recipe_ingredients.map((i) => ({ ...i, quantity: i.quantity != null ? Math.round(i.quantity * factor * 100) / 100 : null }));
          if (items.length) await api.post('/shopping/items/bulk', { list_id: listId, items, recipe_title: e.recipe_title });
        }
        m.close();
        toast('Zutaten für die Woche hinzugefügt 🛒', { type: 'success', action: 'Zur Liste', onAction: () => ctx.navigate('/einkauf') });
      } catch (err) {
        toastError(err);
      }
    };
  }

  setHTML(view, html`<div class="skeleton" style="height:400px"></div>`);
  await refresh();
}
