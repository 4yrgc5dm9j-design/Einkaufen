import { api } from '../api.js';
import { html, setHTML, icon, $, on, recipeImage, formatMinutes, toastError } from '../ui.js';
import { localStorageGet, localStorageSet } from '../app.js';

const POPULAR = ['Lasagne', 'Curry', 'Pfannkuchen', 'Gulasch', 'Chili con Carne', 'Bananenbrot', 'Gemüsesuppe', 'Risotto', 'Käsespätzle', 'Pizza'];

// Letzte Suche merken, damit „Zurück“ aus der Detailansicht nicht neu sucht
let lastSearch = { q: '', results: [], errors: [], offset: 0 };

export async function render(view, { tab, query }, ctx) {
  view.dataset.accent = 'recipe';
  ctx.setTitle('Rezepte');

  const header = html`<div class="recipes-toolbar">
      <div class="segmented">
        <a href="#/rezepte" class="${tab === 'mine' ? 'active' : ''}">${icon('book', 16)} Meine</a>
        <a href="#/rezepte/entdecken" class="${tab === 'discover' ? 'active' : ''}">${icon('globe', 16)} Entdecken</a>
        <a href="#/essensplan">${icon('utensils', 16)} Wochenplan</a>
      </div>
      ${tab === 'mine'
        ? html`<div class="search"><span>${icon('search', 18)}</span><input class="input" id="q" type="search" placeholder="Rezepte, Zutaten, Tags …" value="${localStorageGet('recipe-q') || ''}"></div>
          <div class="row desktop-only" style="gap:8px">
            <a class="btn btn-ghost" href="#/rezepte/import">${icon('link', 17)} Import</a>
            <a class="btn btn-primary" href="#/rezepte/neu">${icon('plus', 17)} Neues Rezept</a>
          </div>`
        : ''}
    </div>`;

  if (tab === 'discover') return renderDiscover(view, header, query);

  let recipes = [];
  let tagFilter = '';
  let favOnly = false;

  const draw = () => {
    const q = ($('#q', view)?.value || '').toLowerCase().trim();
    const filtered = recipes.filter(
      (r) =>
        (!favOnly || r.favorite) &&
        (!tagFilter || r.tags.includes(tagFilter)) &&
        (!q || [r.title, r.description, ...r.tags].join(' ').toLowerCase().includes(q)),
    );
    const tags = [...new Set(recipes.flatMap((r) => r.tags))].slice(0, 20);
    setHTML(
      $('#recipe-body', view),
      html`${recipes.length
        ? html`<div class="chips" style="margin-bottom:16px">
            <button class="chip ${favOnly ? 'active' : ''}" data-fav-filter>${icon('heart', 15)} Favoriten</button>
            ${tags.map((t) => html`<button class="chip ${t === tagFilter ? 'active' : ''}" data-tag="${t}">${t}</button>`)}
          </div>`
        : ''}
        ${filtered.length
          ? html`<div class="recipe-grid">${filtered.map((r) => card(r))}</div>`
          : recipes.length
            ? html`<div class="empty"><div class="empty-emoji">🔍</div><h3>Nichts gefunden</h3><p>Versuch es mit einem anderen Suchbegriff – oder such im Internet.</p><a class="btn btn-soft" href="#/rezepte/entdecken?q=${encodeURIComponent(q)}">${icon('globe', 17)} Im Internet suchen</a></div>`
            : html`<div class="empty">
                <div class="empty-emoji">👩‍🍳</div>
                <h3>Dein Kochbuch ist noch leer</h3>
                <p>Finde Rezepte im Internet, importiere sie per Link oder schreib deine eigenen Lieblingsrezepte auf – mit Fotos.</p>
                <div class="row" style="flex-wrap:wrap;justify-content:center">
                  <a class="btn btn-primary" href="#/rezepte/entdecken">${icon('globe', 17)} Rezepte entdecken</a>
                  <a class="btn btn-ghost" href="#/rezepte/neu">${icon('plus', 17)} Eigenes Rezept</a>
                </div>
              </div>`}`,
    );
  };

  const card = (r) => html`<a class="recipe-card" href="#/rezepte/${r.id}">
    ${recipeImage(r, 'cover')}
    <button class="fav ${r.favorite ? 'on' : ''}" data-fav="${r.id}" aria-label="Favorit">${icon('heart', 18)}</button>
    <div class="body">
      <h3>${r.title}</h3>
      <div class="meta">
        ${r.prep_minutes || r.cook_minutes ? html`<span>${icon('clock', 14)} ${formatMinutes((r.prep_minutes || 0) + (r.cook_minutes || 0))}</span>` : ''}
        <span>${icon('users', 14)} ${r.servings}</span>
        ${r.tags[0] ? html`<span class="tag">${r.tags[0]}</span>` : ''}
      </div>
    </div>
  </a>`;

  setHTML(
    view,
    html`${header}<div id="recipe-body">${html`<div class="recipe-grid">${[1, 2, 3, 4].map(() => html`<div class="skeleton" style="aspect-ratio:3/4"></div>`)}</div>`}</div>
    <a class="fab" href="#/rezepte/neu" aria-label="Neues Rezept">${icon('plus', 26)}</a>`,
  );
  recipes = await api.get('/recipes');
  draw();

  view.addEventListener('input', (e) => {
    if (e.target.id === 'q') {
      localStorageSet('recipe-q', e.target.value);
      draw();
    }
  });
  on(view, 'click', '[data-tag]', (e, el) => {
    tagFilter = tagFilter === el.dataset.tag ? '' : el.dataset.tag;
    draw();
  });
  on(view, 'click', '[data-fav-filter]', () => {
    favOnly = !favOnly;
    draw();
  });
  on(view, 'click', '[data-fav]', async (e, el) => {
    e.preventDefault();
    e.stopPropagation();
    const r = recipes.find((x) => x.id === Number(el.dataset.fav));
    r.favorite = !r.favorite;
    el.classList.toggle('on', r.favorite);
    try {
      await api.patch(`/recipes/${r.id}/favorite`, { favorite: r.favorite });
    } catch (err) {
      toastError(err);
    }
  });
}

async function renderDiscover(view, header, query) {
  const initial = query.get('q') || lastSearch.q;
  setHTML(
    view,
    html`${header}
    <section class="discover-hero">
      <h2>Was möchtest du kochen?</h2>
      <p>Durchsuche tausende Rezepte – Zutaten landen mit einem Tipp auf deiner Einkaufsliste.</p>
      <form class="add-input" id="search-form">
        <input id="sq" name="q" type="search" placeholder="z. B. Lasagne, Linsencurry, Apfelkuchen" value="${initial}" enterkeyhint="search">
        <button class="btn btn-primary" type="submit" style="--accent:var(--recipe)">${icon('search', 18)}<span class="desktop-only">Suchen</span></button>
      </form>
      <div class="chips">${POPULAR.map((p) => html`<button class="chip" data-q="${p}">${p}</button>`)}</div>
    </section>
    <div class="card card-pad" style="margin-bottom:18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span class="icon-chip">${icon('link', 18)}</span>
      <div class="grow" style="min-width:180px"><strong>Rezept von einer Webseite?</strong><div class="muted small">Link einfügen – Zutaten, Schritte und Bild werden automatisch übernommen (Chefkoch, Lecker, Eat Smarter, Blogs …).</div></div>
      <a class="btn btn-soft" href="#/rezepte/import">Link importieren</a>
    </div>
    <div id="results"></div>`,
  );

  const results = $('#results', view);

  const showResults = (data, append = false) => {
    const cards = data.results.map(
      (r) => html`<a class="recipe-card" href="#/rezepte/extern/${r.source}/${encodeURIComponent(r.id)}">
        ${recipeImage({ title: r.title, image: r.image }, 'cover')}
        <span class="source">${r.sourceLabel}</span>
        <div class="body">
          <h3>${r.title}</h3>
          ${r.subtitle ? html`<div class="muted small" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${r.subtitle}</div>` : ''}
          <div class="meta">
            ${r.rating ? html`<span class="rating">${icon('star', 14)} ${String(r.rating).replace('.', ',')}${r.votes ? html` <span class="muted">(${r.votes})</span>` : ''}</span>` : ''}
            ${r.minutes ? html`<span>${icon('clock', 14)} ${formatMinutes(r.minutes)}</span>` : ''}
          </div>
        </div>
      </a>`,
    );
    if (append) {
      const grid = $('.recipe-grid', results);
      grid.insertAdjacentHTML('beforeend', html`${cards}`.s);
      $('#more', results)?.remove();
    } else if (!data.results.length) {
      setHTML(
        results,
        html`<div class="empty"><div class="empty-emoji">🥲</div><h3>Keine Rezepte gefunden</h3>
          <p>${data.errors?.length ? 'Die Rezeptquellen sind gerade nicht erreichbar. Versuch es später erneut oder importiere ein Rezept per Link.' : 'Probier einen anderen Suchbegriff.'}</p></div>`,
      );
      return;
    } else {
      setHTML(results, html`<div class="section-title">${data.results.length}${data.results.length >= 24 ? '+' : ''} Rezepte für „${lastSearch.q}“</div><div class="recipe-grid">${cards}</div>`);
    }
    if (data.results.filter((r) => r.source === 'chefkoch').length >= 24) {
      results.insertAdjacentHTML('beforeend', html`<div style="text-align:center;margin-top:20px" id="more"><button class="btn btn-ghost" data-more>Mehr laden</button></div>`.s);
    }
  };

  const search = async (q) => {
    q = q.trim();
    if (!q) return;
    $('#sq', view).value = q;
    history.replaceState(null, '', `#/rezepte/entdecken?q=${encodeURIComponent(q)}`);
    setHTML(results, html`<div class="recipe-grid">${[1, 2, 3, 4, 5, 6].map(() => html`<div class="skeleton" style="aspect-ratio:3/4"></div>`)}</div>`);
    try {
      const data = await api.get(`/recipes/discover/search?q=${encodeURIComponent(q)}`);
      lastSearch = { q, ...data, offset: 0 };
      showResults(data);
    } catch (err) {
      setHTML(results, html`<div class="empty"><div class="empty-emoji">📡</div><h3>Suche fehlgeschlagen</h3><p>${err.message}</p></div>`);
    }
  };

  view.addEventListener('submit', (e) => {
    e.preventDefault();
    search($('#sq', view).value);
  });
  on(view, 'click', '[data-q]', (e, el) => search(el.dataset.q));
  on(view, 'click', '[data-more]', async (e, el) => {
    el.disabled = true;
    try {
      lastSearch.offset += 24;
      const data = await api.get(`/recipes/discover/search?q=${encodeURIComponent(lastSearch.q)}&offset=${lastSearch.offset}`);
      lastSearch.results = [...lastSearch.results, ...data.results];
      showResults(data, true);
    } catch (err) {
      toastError(err);
      el.disabled = false;
    }
  });

  if (initial && lastSearch.q === initial && lastSearch.results.length) showResults(lastSearch);
  else if (initial) search(initial);
}

