import { api } from '../api.js';
import { html, setHTML, icon, $, on, openModal, toast, toastError, confirmDialog, formData, debounce } from '../ui.js';
import { localStorageGet, localStorageSet } from '../app.js';
import { CATEGORIES, categoryIcon, formatQuantity, unitLabel, KNOWN_UNITS } from '../shared/ingredients.js';

const LIST_ICONS = ['🛒', '🥦', '🧴', '🏠', '🎉', '🍷', '🐾', '💊', '🎁', '🔧'];

export async function render(view, _p, ctx) {
  view.dataset.accent = 'shop';
  ctx.setTitle('Einkaufsliste');
  let data = { lists: [], items: [] };
  let listId = Number(localStorageGet('list')) || null;
  let suggestions = [];
  let showSuggestions = false;

  const load = async () => {
    data = await api.get('/shopping');
    if (!data.lists.some((l) => l.id === listId)) listId = data.lists[0]?.id;
  };

  const draw = () => {
    const items = data.items.filter((i) => i.list_id === listId);
    const open = items.filter((i) => !i.checked);
    const done = items.filter((i) => i.checked);
    const total = items.length;
    const byCat = new Map();
    for (const c of CATEGORIES) byCat.set(c.name, []);
    for (const i of open) (byCat.get(i.category) || byCat.get('Sonstiges')).push(i);
    const list = data.lists.find((l) => l.id === listId);
    const memberCount = ctx.members.length;

    setHTML(
      view,
      html`
      <div class="list-tabs chips">
        ${data.lists.map((l) => {
          const n = data.items.filter((i) => i.list_id === l.id && !i.checked).length;
          return html`<button class="chip ${l.id === listId ? 'active' : ''}" data-list="${l.id}">${l.icon} ${l.name}${n ? html` <span style="opacity:.6">${n}</span>` : ''}</button>`;
        })}
        <button class="chip" data-action="new-list">${icon('plus', 16)} Liste</button>
      </div>

      <div class="add-bar">
        <form class="add-input" id="add-form" autocomplete="off">
          <input id="add-text" name="text" placeholder="z. B. 2 kg Kartoffeln" aria-label="Neuer Eintrag" enterkeyhint="done">
          <button class="btn btn-primary" type="submit" aria-label="Hinzufügen">${icon('plus')}<span class="desktop-only">Hinzufügen</span></button>
        </form>
        <div class="suggestions chips ${showSuggestions && suggestions.length ? '' : 'hidden'}" id="suggestions">
          ${suggestions.map((s) => html`<button class="chip" type="button" data-suggest="${s.name}">${categoryIcon(s.category)} ${s.name}</button>`)}
        </div>
      </div>

      ${total
        ? html`<div class="row" style="margin:6px 4px 4px;gap:12px">
            <div class="progress grow"><div style="width:${total ? Math.round((done.length / total) * 100) : 0}%"></div></div>
            <small class="muted" style="font-weight:700">${done.length}/${total}</small>
            <button class="icon-btn" data-action="edit-list" aria-label="Liste bearbeiten">${icon('more')}</button>
          </div>`
        : ''}

      ${!open.length && !done.length
        ? html`<div class="empty">
            <div class="empty-emoji">🛒</div>
            <h3>${list?.name || 'Liste'} ist leer</h3>
            <p>Tippe oben ein, was ihr braucht – Mengen wie „500 g Hackfleisch“ werden automatisch erkannt und nach Kategorien sortiert.</p>
            ${memberCount > 1 ? html`<p class="small">Änderungen siehst du gemeinsam in Echtzeit.</p>` : ''}
            <a class="btn btn-soft" href="#/rezepte">${icon('chef', 18)} Zutaten aus Rezepten übernehmen</a>
          </div>`
        : ''}

      ${[...byCat.entries()].filter(([, arr]) => arr.length).map(
        ([cat, arr]) => html`<div class="category-block">
          <div class="category-head"><span>${categoryIcon(cat)}</span>${cat}<span class="count">${arr.length}</span></div>
          <div class="items">${arr.map((i) => itemRow(i))}</div>
        </div>`,
      )}

      ${done.length
        ? html`<div class="category-block" style="margin-top:18px">
            <div class="category-head">✅ Im Wagen<span class="count">${done.length}</span>
              <button class="btn btn-ghost btn-sm" style="margin-left:10px" data-action="clear">${icon('trash', 15)} Leeren</button></div>
            <div class="items">${done.map((i) => itemRow(i))}</div>
          </div>`
        : ''}
      `,
    );
  };

  const itemRow = (i) => {
    const q = i.quantity != null || i.unit ? `${formatQuantity(i.quantity)} ${unitLabel(i.unit, i.quantity)}`.trim() : '';
    const who = ctx.members.length > 1 && i.added_by_color ? html`<span class="who" style="--c:${i.added_by_color}" title="von ${i.added_by_name}"></span>` : '';
    return html`<div class="item ${i.checked ? 'checked' : ''}" data-id="${i.id}">
      <span class="check">${icon('check', 16)}</span>
      <div class="item-main">
        <div class="item-name">${i.name}</div>
        ${i.note || i.recipe_title || who ? html`<div class="item-meta">${who}${i.note ? html`<span>${i.note}</span>` : ''}${i.recipe_title ? html`<span>🍳 ${i.recipe_title}</span>` : ''}</div>` : ''}
      </div>
      ${q ? html`<span class="qty">${q}</span>` : ''}
      <button class="icon-btn" data-edit="${i.id}" aria-label="Bearbeiten">${icon('edit', 17)}</button>
    </div>`;
  };

  const refresh = async () => {
    await load();
    const focused = document.activeElement?.id === 'add-text';
    const value = $('#add-text', view)?.value || '';
    draw();
    if (focused) {
      const input = $('#add-text', view);
      input.value = value;
      input.focus();
    }
  };

  const loadSuggestions = debounce(async (q) => {
    try {
      suggestions = await api.get(`/shopping/suggestions?q=${encodeURIComponent(q)}`);
      const names = new Set(data.items.filter((i) => !i.checked && i.list_id === listId).map((i) => i.name.toLowerCase()));
      suggestions = suggestions.filter((s) => !names.has(s.name.toLowerCase())).slice(0, 10);
      const box = $('#suggestions', view);
      if (!box) return;
      setHTML(box, html`${suggestions.map((s) => html`<button class="chip" type="button" data-suggest="${s.name}">${categoryIcon(s.category)} ${s.name}</button>`)}`);
      box.classList.toggle('hidden', !showSuggestions || !suggestions.length);
    } catch {
      /* egal */
    }
  }, 150);

  const add = async (text) => {
    if (!text.trim()) return;
    try {
      await api.post('/shopping/items', { list_id: listId, text });
      await refresh();
      const input = $('#add-text', view);
      input.value = '';
      input.focus();
      loadSuggestions('');
    } catch (err) {
      toastError(err);
    }
  };

  // ---- Events ----
  view.addEventListener('submit', (e) => {
    if (e.target.id !== 'add-form') return;
    e.preventDefault();
    add($('#add-text', view).value);
  });
  view.addEventListener('input', (e) => {
    if (e.target.id === 'add-text') loadSuggestions(e.target.value.replace(/^[\d.,/½¼¾\s]+(g|kg|ml|l|stk|el|tl)?\s*/i, ''));
  });
  view.addEventListener('focusin', (e) => {
    if (e.target.id === 'add-text') {
      showSuggestions = true;
      loadSuggestions(e.target.value);
    }
  });
  view.addEventListener('focusout', (e) => {
    if (e.target.id === 'add-text') {
      setTimeout(() => {
        if (document.activeElement?.closest?.('#suggestions') || document.activeElement?.id === 'add-text') return;
        showSuggestions = false;
        $('#suggestions', view)?.classList.add('hidden');
      }, 200);
    }
  });
  on(view, 'mousedown', '[data-suggest]', (e) => e.preventDefault());
  on(view, 'click', '[data-suggest]', (e, el) => add(el.dataset.suggest));

  on(view, 'click', '[data-list]', (e, el) => {
    listId = Number(el.dataset.list);
    localStorageSet('list', listId);
    draw();
  });

  on(view, 'click', '.item', async (e, el) => {
    if (e.target.closest('[data-edit]')) return;
    const item = data.items.find((i) => i.id === Number(el.dataset.id));
    if (!item) return;
    item.checked = item.checked ? 0 : 1;
    el.classList.toggle('checked', !!item.checked);
    el.classList.add('pop');
    try {
      await api.patch(`/shopping/items/${item.id}`, { checked: !!item.checked });
      setTimeout(refresh, 350);
    } catch (err) {
      toastError(err);
      refresh();
    }
  });

  on(view, 'click', '[data-edit]', (e, el) => editItem(data.items.find((i) => i.id === Number(el.dataset.edit))));

  on(view, 'click', '[data-action]', async (e, el) => {
    const action = el.dataset.action;
    if (action === 'clear') {
      const removed = data.items.filter((i) => i.list_id === listId && i.checked);
      await api.post(`/shopping/lists/${listId}/clear-checked`);
      toast(`${removed.length} erledigte Einträge entfernt`, {
        action: 'Rückgängig',
        onAction: async () => {
          await api.post('/shopping/items/bulk', { list_id: listId, items: removed.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, note: i.note })) });
          refresh();
        },
      });
      refresh();
    }
    if (action === 'new-list') listDialog();
    if (action === 'edit-list') listDialog(data.lists.find((l) => l.id === listId));
  });

  function editItem(item) {
    if (!item) return;
    const m = openModal({
      title: 'Eintrag bearbeiten',
      body: html`<form id="item-form">
        <div class="field"><label>Name</label><input class="input" name="name" value="${item.name}" required></div>
        <div class="grid-2">
          <div class="field"><label>Menge</label><input class="input" name="quantity" inputmode="decimal" value="${item.quantity ?? ''}"></div>
          <div class="field"><label>Einheit</label><input class="input" name="unit" list="units" value="${item.unit}"></div>
        </div>
        <datalist id="units">${KNOWN_UNITS.map((u) => html`<option value="${u}">`)}</datalist>
        <div class="field"><label>Notiz</label><input class="input" name="note" value="${item.note}" placeholder="z. B. Bio, die große Packung"></div>
        <div class="grid-2">
          <div class="field"><label>Kategorie</label><select class="input" name="category">${CATEGORIES.map((c) => html`<option ${c.name === item.category ? 'selected' : ''} value="${c.name}">${c.icon} ${c.name}</option>`)}</select></div>
          <div class="field"><label>Liste</label><select class="input" name="list_id">${data.lists.map((l) => html`<option ${l.id === item.list_id ? 'selected' : ''} value="${l.id}">${l.icon} ${l.name}</option>`)}</select></div>
        </div>
        ${item.added_by_name ? html`<p class="muted small">Hinzugefügt von ${item.added_by_name}</p>` : ''}
      </form>`,
      footer: html`<button class="btn btn-ghost" data-del style="color:var(--danger)">${icon('trash', 16)}</button><span class="spacer"></span>
        <button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>`,
    });
    m.el.dataset.accent = 'shop';
    const save = async () => {
      try {
        await api.patch(`/shopping/items/${item.id}`, formData($('#item-form', m.el)));
        m.close();
        refresh();
      } catch (err) {
        toastError(err);
      }
    };
    $('[data-save]', m.el).onclick = save;
    $('#item-form', m.el).onsubmit = (e) => {
      e.preventDefault();
      save();
    };
    $('[data-del]', m.el).onclick = async () => {
      await api.del(`/shopping/items/${item.id}`);
      m.close();
      refresh();
    };
  }

  function listDialog(list) {
    let chosen = list?.icon || '🛒';
    const m = openModal({
      title: list ? 'Liste bearbeiten' : 'Neue Liste',
      body: html`<form id="list-form">
        <div class="field"><label>Name</label><input class="input" name="name" value="${list?.name || ''}" placeholder="z. B. Drogerie" required autofocus></div>
        <div class="label" style="margin-bottom:8px">Symbol</div>
        <div class="chips" style="flex-wrap:wrap">${LIST_ICONS.map((i) => html`<button type="button" class="chip ${i === chosen ? 'active' : ''}" data-icon="${i}" style="font-size:18px">${i}</button>`)}</div>
      </form>`,
      footer: html`${list ? html`<button class="btn btn-ghost" data-del style="color:var(--danger)">Löschen</button><span class="spacer"></span>` : ''}
        <button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>`,
    });
    m.el.dataset.accent = 'shop';
    on(m.el, 'click', '[data-icon]', (e, el) => {
      chosen = el.dataset.icon;
      m.el.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('active', b === el));
    });
    const save = async () => {
      const body = { ...formData($('#list-form', m.el)), icon: chosen };
      try {
        if (list) await api.patch(`/shopping/lists/${list.id}`, body);
        else {
          const { id } = await api.post('/shopping/lists', body);
          listId = id;
          localStorageSet('list', id);
        }
        m.close();
        refresh();
      } catch (err) {
        toastError(err);
      }
    };
    $('[data-save]', m.el).onclick = save;
    $('#list-form', m.el).onsubmit = (e) => {
      e.preventDefault();
      save();
    };
    const del = $('[data-del]', m.el);
    if (del)
      del.onclick = async () => {
        if (!(await confirmDialog(`„${list.name}“ und alle Einträge darin löschen?`))) return;
        try {
          await api.del(`/shopping/lists/${list.id}`);
          m.close();
          refresh();
        } catch (err) {
          toastError(err);
        }
      };
  }

  await load();
  draw();

  // Gemeinsames Einkaufen: regelmäßig synchronisieren
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible' && !document.body.classList.contains('modal-open')) refresh().catch(() => {});
  }, 8000);
  const onVisible = () => document.visibilityState === 'visible' && refresh().catch(() => {});
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
