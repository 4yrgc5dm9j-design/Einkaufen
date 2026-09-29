import { api } from '../api.js';
import { html, setHTML, icon, $, on, openModal, toast, toastError, formData, avatar, WEEKDAYS } from '../ui.js';
import { localStorageGet, localStorageSet } from '../app.js';
import { toLocalDate, addDays, RECURRENCE_LABELS } from '../shared/recurrence.js';
import { dueLabel } from './home.js';

const REPEAT_LABELS = { ...RECURRENCE_LABELS, none: 'Nicht wiederholen' };
const PRIO = ['Normal', 'Wichtig', 'Dringend'];

/** Versteht einfache Angaben wie „Müll rausbringen morgen 19 Uhr“ oder „Oma anrufen Freitag“. */
export function parseQuickReminder(text) {
  let title = ` ${text.trim()} `;
  let date = null;
  let time = null;
  const today = new Date();
  const lower = () => title.toLowerCase();

  const timeMatch = title.match(/\s(?:um\s)?(\d{1,2})(?::(\d{2}))?\s?uhr\b|\s(?:um\s)?(\d{1,2}):(\d{2})\b/i);
  if (timeMatch) {
    const h = Number(timeMatch[1] ?? timeMatch[3]);
    const m = Number(timeMatch[2] ?? timeMatch[4] ?? 0);
    if (h < 24 && m < 60) {
      time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      title = title.replace(timeMatch[0], ' ');
    }
  }
  const rel = [
    [/\s(heute|heut)\b/i, 0],
    [/\sübermorgen\b/i, 2],
    [/\smorgen\b/i, 1],
  ];
  for (const [re, n] of rel) {
    if (re.test(title)) {
      date = addDays(today, n);
      title = title.replace(re, ' ');
      break;
    }
  }
  if (!date) {
    const idx = WEEKDAYS.findIndex((d) => new RegExp(`\\s(am\\s)?${d}\\b`, 'i').test(lower()));
    if (idx >= 0) {
      let diff = (idx - today.getDay() + 7) % 7 || 7;
      date = addDays(today, diff);
      title = title.replace(new RegExp(`\\s(am\\s)?${WEEKDAYS[idx]}\\b`, 'i'), ' ');
    }
  }
  const dm = title.match(/\s(?:am\s)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (!date && dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : today.getFullYear();
    date = new Date(y, Number(dm[2]) - 1, Number(dm[1]));
    if (!dm[3] && date < addDays(today, -1)) date.setFullYear(y + 1);
    title = title.replace(dm[0], ' ');
  }
  if (time && !date) date = today;
  title = title.replace(/\s+/g, ' ').trim();
  const due = date ? `${toLocalDate(date)}${time ? `T${time}` : ''}` : null;
  return { title: title || text.trim(), due_at: due };
}

export async function render(view, { query }, ctx) {
  view.dataset.accent = 'rem';
  ctx.setTitle('Erinnerungen');
  let items = [];
  let filter = localStorageGet('rem-filter') || 'all';

  const load = async () => {
    items = await api.get('/reminders');
  };

  const draw = () => {
    const now = new Date();
    const todayStr = toLocalDate(now);
    const nowStr = `${todayStr}T${now.toTimeString().slice(0, 5)}`;
    const tomorrow = toLocalDate(addDays(now, 1));
    const week = toLocalDate(addDays(now, 7));
    const mine = (r) => filter === 'all' || (filter === 'me' ? !r.assigned_to || r.assigned_to === ctx.user.id : r.assigned_to === Number(filter));
    const list = items.filter(mine);
    const open = list.filter((r) => !r.done);
    const isOverdue = (r) => r.due_at && (r.due_at.length > 10 ? r.due_at < nowStr : r.due_at < todayStr);
    const groups = [
      ['Überfällig', open.filter(isOverdue), '🔥'],
      ['Heute', open.filter((r) => r.due_at && !isOverdue(r) && r.due_at.slice(0, 10) === todayStr), '☀️'],
      ['Morgen', open.filter((r) => r.due_at && r.due_at.slice(0, 10) === tomorrow), '🌙'],
      ['Diese Woche', open.filter((r) => r.due_at && r.due_at.slice(0, 10) > tomorrow && r.due_at.slice(0, 10) <= week), '📆'],
      ['Später', open.filter((r) => r.due_at && r.due_at.slice(0, 10) > week), '🗓️'],
      ['Ohne Datum', open.filter((r) => !r.due_at), '📝'],
      ['Erledigt', list.filter((r) => r.done), '✅'],
    ];

    setHTML(
      view,
      html`
      <div class="add-bar">
        <form class="add-input" id="quick-form" autocomplete="off">
          <input name="text" id="quick-text" placeholder="z. B. Müll rausbringen morgen 19 Uhr" aria-label="Neue Erinnerung" enterkeyhint="done">
          <button class="btn btn-ghost" type="button" data-action="detail" aria-label="Mit Details">${icon('more', 18)}</button>
          <button class="btn btn-primary" type="submit" aria-label="Hinzufügen">${icon('plus')}</button>
        </form>
        <div class="muted small" id="quick-hint" style="padding:6px 8px 0;min-height:22px"></div>
      </div>
      ${ctx.members.length > 1
        ? html`<div class="chips" style="margin-bottom:6px">
            <button class="chip ${filter === 'all' ? 'active' : ''}" data-filter="all">Alle</button>
            <button class="chip ${filter === 'me' ? 'active' : ''}" data-filter="me">Für mich</button>
            ${ctx.members.filter((m) => m.id !== ctx.user.id).map((m) => html`<button class="chip ${filter === String(m.id) ? 'active' : ''}" data-filter="${m.id}"><span class="swatch" style="--c:${m.color}"></span>${m.name}</button>`)}
          </div>`
        : ''}
      ${open.length || list.some((r) => r.done)
        ? groups
            .filter(([, arr]) => arr.length)
            .map(
              ([name, arr, emoji]) => html`<section class="rem-group">
                <div class="section-title rem-group-title">${emoji} ${name}<span class="count">${arr.length}</span></div>
                ${arr.map((r) => row(r, todayStr, isOverdue(r)))}
              </section>`,
            )
        : html`<div class="empty"><div class="empty-emoji">🔔</div><h3>Alles erledigt!</h3><p>Leg Erinnerungen an – mit Uhrzeit bekommst du eine Benachrichtigung aufs Handy. Wiederkehrende Aufgaben wie „Pflanzen gießen“ rücken nach dem Abhaken automatisch weiter.</p></div>`}`,
    );
  };

  const row = (r, todayStr, overdue) => {
    const who = r.assigned_to ? ctx.member(r.assigned_to) : null;
    return html`<div class="rem-item ${r.done ? 'done' : ''}" data-id="${r.id}">
      <span class="check" data-toggle="${r.id}" role="checkbox" aria-checked="${r.done ? 'true' : 'false'}" tabindex="0">${icon('check', 15)}</span>
      <div class="rem-body" data-open="${r.id}">
        <div class="rem-title">${r.priority ? html`<span class="prio prio-${r.priority}" style="margin-right:6px"></span>` : ''}${r.title}</div>
        ${r.notes ? html`<div class="muted small" style="margin-top:2px">${r.notes}</div>` : ''}
        <div class="rem-meta">
          ${r.due_at ? html`<span class="${overdue && !r.done ? 'overdue' : ''}">${icon('clock', 13)} ${dueLabel(r.due_at, todayStr)}</span>` : ''}
          ${r.repeat !== 'none' ? html`<span>${icon('repeat', 13)} ${RECURRENCE_LABELS[r.repeat]}</span>` : ''}
          ${ctx.members.length > 1 ? html`<span>${who ? html`${avatar(who, 18)} ${who.id === ctx.user.id ? 'Ich' : who.name}` : html`${icon('users', 13)} Alle`}</span>` : ''}
        </div>
      </div>
    </div>`;
  };

  const refresh = async () => {
    await load();
    draw();
  };

  function dialog(r, preset = {}) {
    const isNew = !r;
    const base = r || { title: '', notes: '', due_at: null, repeat: 'none', priority: 0, assigned_to: null, ...preset };
    const m = openModal({
      title: isNew ? 'Neue Erinnerung' : 'Erinnerung',
      body: html`<form id="rem-form">
        <div class="field"><input class="input" name="title" value="${base.title}" placeholder="Was soll erledigt werden?" required autofocus style="font-size:17px;font-weight:650;height:52px"></div>
        <div class="grid-2">
          <div class="field"><label>Datum</label><input class="input" type="date" name="date" value="${base.due_at ? base.due_at.slice(0, 10) : ''}"></div>
          <div class="field"><label>Uhrzeit</label><input class="input" type="time" name="time" value="${base.due_at?.length > 10 ? base.due_at.slice(11, 16) : ''}"></div>
        </div>
        <div class="chips" style="margin:-4px 0 14px">
          <button type="button" class="chip" data-quick="0">Heute</button>
          <button type="button" class="chip" data-quick="1">Morgen</button>
          <button type="button" class="chip" data-quick="7">In einer Woche</button>
          <button type="button" class="chip" data-quick="">Kein Datum</button>
        </div>
        <div class="grid-2">
          <div class="field"><label>Wiederholen</label><select class="input" name="repeat">${Object.entries(REPEAT_LABELS).map(([k, v]) => html`<option value="${k}" ${k === base.repeat ? 'selected' : ''}>${v}</option>`)}</select></div>
          <div class="field"><label>Priorität</label><select class="input" name="priority">${PRIO.map((p, i) => html`<option value="${i}" ${i === base.priority ? 'selected' : ''}>${p}</option>`)}</select></div>
        </div>
        ${ctx.members.length > 1
          ? html`<div class="field"><label>Für wen?</label><select class="input" name="assigned_to">
              <option value="">Alle im Haushalt</option>
              ${ctx.members.map((mem) => html`<option value="${mem.id}" ${base.assigned_to === mem.id ? 'selected' : ''}>${mem.id === ctx.user.id ? `${mem.name} (ich)` : mem.name}</option>`)}
            </select></div>`
          : ''}
        <div class="field"><label>Notiz</label><textarea class="input" name="notes" rows="2" style="min-height:70px">${base.notes}</textarea></div>
        <p class="muted small">${icon('bell', 13)} Mit Uhrzeit wirst du zum Zeitpunkt benachrichtigt (Benachrichtigungen in den Einstellungen aktivieren).</p>
      </form>`,
      footer: html`${isNew ? '' : html`<button class="btn btn-ghost" data-del style="color:var(--danger)">${icon('trash', 16)}</button><span class="spacer"></span>`}
        <button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Speichern</button>`,
    });
    m.el.dataset.accent = 'rem';
    const form = $('#rem-form', m.el);
    on(m.el, 'click', '[data-quick]', (e, el) => {
      form.elements.date.value = el.dataset.quick === '' ? '' : toLocalDate(addDays(new Date(), Number(el.dataset.quick)));
      if (el.dataset.quick === '') form.elements.time.value = '';
    });
    const save = async () => {
      const f = formData(form);
      if (!f.title.trim()) return form.elements.title.focus();
      const body = {
        title: f.title,
        notes: f.notes,
        due_at: f.date ? `${f.date}${f.time ? `T${f.time}` : ''}` : f.time ? `${toLocalDate(new Date())}T${f.time}` : null,
        repeat: f.repeat,
        priority: Number(f.priority),
        assigned_to: f.assigned_to ? Number(f.assigned_to) : null,
      };
      try {
        if (isNew) await api.post('/reminders', body);
        else await api.put(`/reminders/${r.id}`, body);
        m.close();
        refresh();
      } catch (err) {
        toastError(err);
      }
    };
    $('[data-save]', m.el).onclick = save;
    form.onsubmit = (e) => {
      e.preventDefault();
      save();
    };
    const del = $('[data-del]', m.el);
    if (del)
      del.onclick = async () => {
        await api.del(`/reminders/${r.id}`).catch(toastError);
        m.close();
        toast('Erinnerung gelöscht');
        refresh();
      };
  }

  view.addEventListener('input', (e) => {
    if (e.target.id !== 'quick-text') return;
    const p = parseQuickReminder(e.target.value);
    $('#quick-hint', view).textContent = e.target.value && p.due_at ? `⏰ ${dueLabel(p.due_at, toLocalDate(new Date()))} · „${p.title}“` : '';
  });
  view.addEventListener('submit', async (e) => {
    if (e.target.id !== 'quick-form') return;
    e.preventDefault();
    const text = e.target.elements.text.value.trim();
    if (!text) return;
    try {
      const body = parseQuickReminder(text);
      if (filter !== 'all' && filter !== 'me') body.assigned_to = Number(filter);
      await api.post('/reminders', body);
      await refresh();
      $('#quick-text', view).focus();
    } catch (err) {
      toastError(err);
    }
  });
  on(view, 'click', '[data-action=detail]', () => {
    const text = $('#quick-text', view).value;
    dialog(null, text ? parseQuickReminder(text) : {});
  });
  on(view, 'click', '[data-filter]', (e, el) => {
    filter = el.dataset.filter;
    localStorageSet('rem-filter', filter);
    draw();
  });
  const toggle = async (id) => {
    const r = items.find((x) => x.id === Number(id));
    const el = view.querySelector(`.rem-item[data-id="${id}"]`);
    el?.classList.add('done');
    try {
      const res = await api.post(`/reminders/${id}/toggle`);
      if (res.next) toast(`Erledigt ✓ Nächstes Mal: ${dueLabel(res.next, toLocalDate(new Date()))}`, { type: 'success' });
      else if (!r.done)
        toast('Erledigt ✓', {
          type: 'success',
          action: 'Rückgängig',
          onAction: async () => {
            await api.post(`/reminders/${id}/toggle`);
            refresh();
          },
        });
      setTimeout(refresh, 250);
    } catch (err) {
      toastError(err);
    }
  };
  on(view, 'click', '[data-toggle]', (e, el) => toggle(el.dataset.toggle));
  on(view, 'keydown', '[data-toggle]', (e, el) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle(el.dataset.toggle);
    }
  });
  on(view, 'click', '[data-open]', (e, el) => dialog(items.find((r) => r.id === Number(el.dataset.open))));

  await refresh();
  if (query.get('new')) dialog(null);
}
