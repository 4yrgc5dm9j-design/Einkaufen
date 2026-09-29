import { api } from '../api.js';
import { html, setHTML, icon, recipeImage, formatDate, raw, avatar, toast, toastError, WEEKDAYS_SHORT } from '../ui.js';
import { loadOccurrences, occurrencesOn, timeLabel, toLocalDate, addDays } from '../events.js';
import { upcomingHolidays, holidaysOn } from '../shared/holidays.js';
import { formatQuantity, unitLabel } from '../shared/ingredients.js';

function greeting(h) {
  if (h < 5) return ['Gute Nacht', 'night'];
  if (h < 11) return ['Guten Morgen', 'morning'];
  if (h < 17) return ['Hallo', 'day'];
  if (h < 22) return ['Guten Abend', 'evening'];
  return ['Gute Nacht', 'night'];
}

const HERO_BG = {
  morning: 'radial-gradient(circle at 85% 15%, #fde68a 0, transparent 40%), linear-gradient(135deg, #f97316, #ec4899 55%, #8b5cf6)',
  day: 'radial-gradient(circle at 85% 10%, #a5f3fc 0, transparent 40%), linear-gradient(135deg, #6366f1, #3b82f6 55%, #06b6d4)',
  evening: 'radial-gradient(circle at 85% 15%, #fda4af 0, transparent 40%), linear-gradient(135deg, #7c3aed, #db2777 60%, #f97316)',
  night: 'radial-gradient(circle at 85% 15%, #818cf8 0, transparent 40%), linear-gradient(135deg, #1e1b4b, #4338ca 60%, #7c3aed)',
};

function heroArt(phase) {
  const moon = phase === 'night';
  return raw(`<svg class="hero-art" viewBox="0 0 220 220" aria-hidden="true">
    <defs><radialGradient id="sunG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></radialGradient></defs>
    <circle cx="140" cy="78" r="46" fill="url(#sunG)"/>
    ${moon ? '<circle cx="160" cy="66" r="40" fill="#312e81" opacity=".85"/>' : '<g stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"><path d="M140 12v12M140 132v12M74 78h12M194 78h12M93 31l8 8M179 117l8 8M93 125l8-8M179 39l8-8"/></g>'}
    <path d="M40 176c20-22 48-22 66 0 14-14 38-14 50 2 12-6 30-2 36 12H30c0-6 4-12 10-14z" fill="#fff" fill-opacity=".28"/>
    <circle cx="44" cy="44" r="4" fill="#fff" fill-opacity=".7"/><circle cx="198" cy="150" r="3" fill="#fff" fill-opacity=".6"/><circle cx="70" cy="120" r="2.5" fill="#fff" fill-opacity=".6"/>
  </svg>`);
}

export async function render(view, _p, ctx) {
  const now = new Date();
  const [greet, phase] = greeting(now.getHours());
  ctx.setTitle('Start');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = toLocalDate(today);

  setHTML(view, html`<div class="hero" style="--hero-bg:${HERO_BG[phase]}"><small>${formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</small><h2>${greet}, ${ctx.user.name}!</h2><div class="hero-stats"><span class="skeleton" style="width:120px;height:30px;opacity:.4"></span></div></div>
    <div class="dash-grid">${[1, 2, 3].map(() => html`<div class="card skeleton" style="height:180px"></div>`)}</div>`);

  const [occ, reminders, shopping, meals] = await Promise.all([
    loadOccurrences(today, addDays(today, 8)).catch(() => []),
    api.get('/reminders').catch(() => []),
    api.get('/shopping').catch(() => ({ lists: [], items: [] })),
    api.get(`/mealplan?from=${todayStr}&to=${toLocalDate(addDays(today, 1))}`).catch(() => []),
  ]);

  const todayEvents = occurrencesOn(occ, today);
  const upcoming = occ
    .filter((o) => o.start.slice(0, 10) > todayStr)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);
  const openRem = reminders.filter((r) => !r.done);
  const dueRem = openRem.filter((r) => r.due_at && r.due_at.slice(0, 10) <= todayStr);
  const openItems = shopping.items.filter((i) => !i.checked);
  const hol = holidaysOn(todayStr, ctx.user.bundesland);
  const nextHolidays = upcomingHolidays(addDays(today, hol.some((h) => h.official) ? 1 : 0), ctx.user.bundesland, 3);
  const pendingInvites = ctx.me.invitations.incoming;

  const stats = [
    `📅 ${todayEvents.length} ${todayEvents.length === 1 ? 'Termin' : 'Termine'} heute`,
    `🛒 ${openItems.length} auf der Liste`,
    dueRem.length ? `⏰ ${dueRem.length} fällig` : null,
    hol[0] ? `🎉 ${hol[0].name}` : null,
  ].filter(Boolean);

  setHTML(
    view,
    html`
    <div class="hero" style="--hero-bg:${HERO_BG[phase]}">
      ${heroArt(phase)}
      <small>${formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
      <h2>${greet}, ${ctx.user.name}!</h2>
      <div class="hero-stats">${stats.map((s) => html`<span>${s}</span>`)}</div>
    </div>

    ${pendingInvites.length
      ? html`<div class="card card-pad" style="margin-top:14px;display:flex;gap:12px;align-items:center;border-color:var(--primary)">
          <div class="icon-chip">${icon('users')}</div>
          <div class="grow"><strong>${pendingInvites[0].from_name}</strong> lädt dich in „${pendingInvites[0].household_name}“ ein.</div>
          <a class="btn btn-primary btn-sm" href="#/einstellungen">Ansehen</a>
        </div>`
      : ''}

    <div class="quick-actions">
      <a class="quick-action" href="#/einkauf" data-accent="shop"><span class="icon-chip">${icon('cart')}</span>Einkauf</a>
      <a class="quick-action" href="#/rezepte/entdecken" data-accent="recipe"><span class="icon-chip">${icon('search')}</span>Rezept finden</a>
      <a class="quick-action" href="#/kalender?new=1" data-accent="cal"><span class="icon-chip">${icon('calendar')}</span>Termin</a>
      <a class="quick-action" href="#/erinnerungen?new=1" data-accent="rem"><span class="icon-chip">${icon('bell')}</span>Erinnerung</a>
    </div>

    <div class="dash-grid">
      <section class="card card-pad" data-accent="cal">
        <div class="card-title"><span class="icon-chip">${icon('calendar', 18)}</span>Heute<a class="more" href="#/kalender">Kalender →</a></div>
        ${todayEvents.length
          ? html`<ul class="list-plain">${todayEvents.map(
              (o) => html`<li><a class="mini-item" href="#/kalender?date=${todayStr}&view=day"><span class="time">${timeLabel(o, today)}</span><span class="bar" style="--c:${o.displayColor}"></span><span class="title">${o.title}</span>${o.visibility === 'private' ? icon('lock', 14, 'muted') : ''}</a></li>`,
            )}</ul>`
          : html`<p class="muted small" style="padding:4px 10px 8px">Keine Termine heute – genieß den Tag! ☀️</p>`}
        ${upcoming.length
          ? html`<div class="section-title" style="margin:12px 10px 4px">Demnächst</div>
            <ul class="list-plain">${upcoming.map(
              (o) => html`<li><a class="mini-item" href="#/kalender?date=${o.start.slice(0, 10)}&view=day"><span class="time">${shortDay(o.start)}</span><span class="bar" style="--c:${o.displayColor}"></span><span class="title">${o.title}</span><span class="sub">${o.all_day ? '' : o.start.slice(11, 16)}</span></a></li>`,
            )}</ul>`
          : ''}
      </section>

      <section class="card card-pad" data-accent="shop">
        <div class="card-title"><span class="icon-chip">${icon('cart', 18)}</span>Einkaufsliste<a class="more" href="#/einkauf">Öffnen →</a></div>
        ${openItems.length
          ? html`<ul class="list-plain">${openItems.slice(0, 6).map(
              (i) => html`<li class="mini-item" data-item="${i.id}" style="cursor:pointer"><span class="check" style="width:22px;height:22px">${icon('check', 14)}</span><span class="title">${i.name}</span>${i.quantity != null || i.unit ? html`<span class="qty">${formatQuantity(i.quantity)} ${unitLabel(i.unit, i.quantity)}</span>` : ''}</li>`,
            )}</ul>
            ${openItems.length > 6 ? html`<p class="muted small" style="padding:6px 10px 0">+ ${openItems.length - 6} weitere</p>` : ''}`
          : html`<p class="muted small" style="padding:4px 10px 8px">Alles erledigt – die Liste ist leer. 🎉</p>`}
      </section>

      <section class="card card-pad" data-accent="rem">
        <div class="card-title"><span class="icon-chip">${icon('bell', 18)}</span>Erinnerungen<a class="more" href="#/erinnerungen">Alle →</a></div>
        ${openRem.length
          ? html`<ul class="list-plain">${openRem.slice(0, 5).map((r) => {
              const overdue = r.due_at && r.due_at < (r.due_at.length > 10 ? toLocalDate(now) + 'T' + now.toTimeString().slice(0, 5) : todayStr);
              return html`<li><a class="mini-item" href="#/erinnerungen"><span class="prio prio-${r.priority}" style="${r.priority ? '' : 'background:var(--surface-3)'}"></span><span class="title">${r.title}</span>${r.due_at ? html`<span class="sub" style="${overdue ? 'color:var(--danger);font-weight:700' : ''}">${dueLabel(r.due_at, todayStr)}</span>` : ''}${r.assigned_to ? avatar(ctx.member(r.assigned_to), 22) : ''}</a></li>`;
            })}</ul>`
          : html`<p class="muted small" style="padding:4px 10px 8px">Nichts zu erledigen. ✨</p>`}
      </section>

      <section class="card card-pad" data-accent="meal">
        <div class="card-title"><span class="icon-chip">${icon('utensils', 18)}</span>Heute gibt's<a class="more" href="#/essensplan">Essensplan →</a></div>
        ${meals.length
          ? meals.map(
              (m) => html`<a class="meal-feature" href="${m.recipe_id ? `#/rezepte/${m.recipe_id}` : '#/essensplan'}" style="margin-bottom:10px">
                ${recipeImage({ title: m.recipe_title || m.title, images: m.recipe_images }, 'thumb')}
                <div><small class="muted" style="font-weight:700">${{ breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snack' }[m.slot]}</small><h3 style="font-size:16px">${m.recipe_title || m.title}</h3></div>
              </a>`,
            )
          : html`<p class="muted small" style="padding:4px 10px 12px">Noch nichts geplant.</p><a class="btn btn-soft btn-sm" href="#/essensplan">${icon('plus', 16)} Gericht planen</a>`}
      </section>

      <section class="card card-pad" data-accent="cal">
        <div class="card-title"><span class="icon-chip" style="background:var(--danger-soft);color:var(--danger)">${icon('flag', 18)}</span>Nächste Feiertage</div>
        <ul class="list-plain">${nextHolidays.map((h) => {
          const d = new Date(`${h.date}T12:00`);
          const days = Math.round((d - today) / 86400000);
          return html`<li class="mini-item"><span class="time">${d.getDate()}.${d.getMonth() + 1}.</span><span class="title">${h.name}</span><span class="sub">${days <= 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`}</span></li>`;
        })}</ul>
      </section>
    </div>`,
  );

  // Schnell abhaken direkt von der Startseite
  view.addEventListener('click', async (e) => {
    const li = e.target.closest('[data-item]');
    if (!li) return;
    li.style.opacity = '0.4';
    li.querySelector('.check').classList.add('on');
    try {
      await api.patch(`/shopping/items/${li.dataset.item}`, { checked: true });
      toast('Abgehakt ✓', { type: 'success', duration: 1500 });
      setTimeout(() => li.remove(), 300);
    } catch (err) {
      li.style.opacity = '';
      toastError(err);
    }
  });
}

function shortDay(s) {
  const d = new Date(`${s.slice(0, 10)}T12:00`);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}.`;
}

export function dueLabel(due, todayStr) {
  const d = due.slice(0, 10);
  const time = due.length > 10 ? ` ${due.slice(11, 16)}` : '';
  if (d === todayStr) return `Heute${time}`;
  const diff = Math.round((new Date(`${d}T12:00`) - new Date(`${todayStr}T12:00`)) / 86400000);
  if (diff === 1) return `Morgen${time}`;
  if (diff === -1) return `Gestern${time}`;
  return `${formatDate(new Date(`${d}T12:00`), { day: 'numeric', month: 'short' })}${time}`;
}

