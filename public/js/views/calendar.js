import { api } from '../api.js';
import { html, setHTML, icon, $, on, openModal, toast, toastError, formatDate, formData, avatar, MONTHS, WEEKDAYS_SHORT, debounce } from '../ui.js';
import { localStorageGet, localStorageSet } from '../app.js';
import { loadOccurrences, occurrencesOn, timeLabel } from '../events.js';
import { toLocalDate, toLocalDateTime, parseLocal, addDays, addMonths, RECURRENCE_LABELS } from '../shared/recurrence.js';
import { holidaysOn } from '../shared/holidays.js';

export const EVENT_COLORS = ['#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];
const REMINDERS = [
  ['', 'Keine'],
  ['0', 'Zum Beginn'],
  ['5', '5 Minuten vorher'],
  ['15', '15 Minuten vorher'],
  ['30', '30 Minuten vorher'],
  ['60', '1 Stunde vorher'],
  ['120', '2 Stunden vorher'],
  ['1440', '1 Tag vorher'],
  ['2880', '2 Tage vorher'],
  ['10080', '1 Woche vorher'],
];
const HOUR = 52;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export async function render(view, { query }, ctx) {
  view.dataset.accent = 'cal';
  ctx.setTitle('Kalender', html`<button class="icon-btn" data-action="search" aria-label="Suchen">${icon('search')}</button>`);

  let mode = query.get('view') || localStorageGet('cal-view') || (matchMedia('(min-width: 960px)').matches ? 'month' : 'month');
  let cursor = query.get('date') ? parseLocal(query.get('date')) : startOfDay(new Date());
  let selected = new Date(cursor);
  let hidden = new Set(JSON.parse(localStorageGet('cal-hidden') || '[]'));
  let occurrences = [];
  const state = ctx.user.bundesland;

  const range = () => {
    if (mode === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const start = mondayOf(first);
      return [start, addDays(start, 42)];
    }
    if (mode === 'week') {
      const start = mondayOf(cursor);
      return [start, addDays(start, 7)];
    }
    if (mode === 'day') return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
    return [startOfDay(cursor), addDays(startOfDay(cursor), 60)];
  };

  const visible = () => occurrences.filter((o) => !hidden.has(o.owner_id));

  const title = () => {
    if (mode === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (mode === 'week') {
      const [s] = range();
      const e = addDays(s, 6);
      return s.getMonth() === e.getMonth()
        ? `${s.getDate()}.–${e.getDate()}. ${MONTHS[s.getMonth()]} ${s.getFullYear()}`
        : `${formatDate(s, { day: 'numeric', month: 'short' })} – ${formatDate(e, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (mode === 'day') return formatDate(cursor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return `Ab ${formatDate(cursor, { day: 'numeric', month: 'long' })}`;
  };

  const shell = () => {
    setHTML(
      view,
      html`
      <div class="cal-toolbar">
        <div class="nav">
          <button class="icon-btn filled" data-nav="-1" aria-label="Zurück">${icon('chevronLeft')}</button>
          <button class="icon-btn filled" data-nav="1" aria-label="Weiter">${icon('chevronRight')}</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-nav="0">Heute</button>
        <h3 class="grow">${title()}</h3>
        <div class="segmented">
          ${[['month', 'Monat'], ['week', 'Woche'], ['day', 'Tag'], ['agenda', 'Liste']].map(
            ([k, v]) => html`<button data-mode="${k}" class="${mode === k ? 'active' : ''}">${v}</button>`,
          )}
        </div>
        <button class="btn btn-primary btn-sm desktop-only" data-action="new">${icon('plus', 16)} Termin</button>
      </div>
      ${ctx.members.length > 1
        ? html`<div class="chips cal-people">${ctx.members.map(
            (m) => html`<button class="chip ${hidden.has(m.id) ? 'off' : ''}" data-person="${m.id}"><span class="swatch" style="--c:${m.color}"></span>${m.id === ctx.user.id ? 'Ich' : m.name}</button>`,
          )}</div>`
        : ''}
      <div id="cal-body"><div class="skeleton" style="height:420px"></div></div>
      <button class="fab" data-action="new" aria-label="Neuer Termin">${icon('plus', 26)}</button>`,
    );
  };

  const draw = () => {
    const body = $('#cal-body', view);
    if (mode === 'month') setHTML(body, monthView());
    else if (mode === 'week' || mode === 'day') {
      setHTML(body, timeGrid(mode === 'week' ? 7 : 1));
      const scroller = $('.tg-scroll', body);
      const now = new Date();
      scroller.scrollTop = Math.max(0, ((startOfDay(now) <= cursor && mode === 'day') || mode === 'week' ? Math.max(7, now.getHours() - 1) : 7) * HOUR - 10);
    } else setHTML(body, agendaView());
  };

  const refresh = async () => {
    const [from, to] = range();
    try {
      occurrences = await loadOccurrences(from, to);
    } catch (err) {
      toastError(err);
    }
    shell();
    draw();
  };

  // ---------- Monatsansicht ----------
  function monthView() {
    const [start] = range();
    const todayStr = toLocalDate(new Date());
    const selStr = toLocalDate(selected);
    const occ = visible();
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const ds = toLocalDate(d);
      const hol = holidaysOn(ds, state);
      const dayOcc = occurrencesOn(occ, d);
      const max = 3 - (hol.length ? 1 : 0);
      cells.push(html`<div class="day-cell ${d.getMonth() !== cursor.getMonth() ? 'other' : ''} ${ds === todayStr ? 'today' : ''} ${d.getDay() % 6 === 0 ? 'weekend' : ''} ${hol.some((h) => h.official) ? 'holiday' : ''}" data-day="${ds}" style="${ds === selStr ? 'box-shadow:inset 0 0 0 2px var(--cal)' : ''}">
        <span class="day-num">${d.getDate()}</span>
        ${hol.slice(0, 1).map((h) => html`<span class="holiday-label ${h.official ? '' : 'special'}" title="${h.name}">${h.name}</span>`)}
        ${dayOcc.slice(0, max).map((o) => html`<span class="ev-chip ${o.all_day ? 'allday' : ''}" style="--c:${o.displayColor}" data-occ="${o.id}|${o.start}" title="${o.title}">${o.all_day ? '' : o.start.slice(0, 10) === ds ? o.start.slice(11, 16) + ' ' : ''}${o.title}</span>`)}
        ${dayOcc.length > max ? html`<span class="ev-more">+${dayOcc.length - max}</span>` : ''}
      </div>`);
    }
    return html`<div class="month">
        <div class="month-head">${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<div>${WEEKDAYS_SHORT[d]}</div>`)}</div>
        <div class="month-grid">${cells}</div>
      </div>
      <div class="day-agenda">${dayList(selected)}</div>`;
  }

  function dayList(day) {
    const ds = toLocalDate(day);
    const hol = holidaysOn(ds, state);
    const occ = occurrencesOn(visible(), day);
    return html`<div class="agenda-date ${ds === toLocalDate(new Date()) ? 'today' : ''}" style="margin-top:6px">
        <span class="big">${day.getDate()}.</span><span>${formatDate(day, { weekday: 'long', month: 'long' })}</span>
        <button class="btn btn-soft btn-sm" style="margin-left:auto" data-new-day="${ds}">${icon('plus', 15)} Termin</button>
      </div>
      ${hol.map((h) => holidayRow(h))}
      ${occ.length ? occ.map((o) => eventRow(o, day)) : hol.length ? '' : html`<p class="muted small" style="padding:6px 4px">Keine Termine.</p>`}`;
  }

  const holidayRow = (h) =>
    html`<div class="event-row holiday-row" style="${h.official ? '' : 'background:var(--surface-2)'}"><span class="bar" style="--c:${h.official ? 'var(--danger)' : 'var(--muted)'}"></span><div class="what"><strong>${h.official ? '🎉 ' : ''}${h.name}</strong><small>${h.official ? 'Gesetzlicher Feiertag' : 'Besonderer Tag'}</small></div></div>`;

  function eventRow(o, day) {
    const owner = ctx.member(o.owner_id);
    const t = timeLabel(o, day);
    return html`<div class="event-row" data-occ="${o.id}|${o.start}">
      <span class="bar" style="--c:${o.displayColor}"></span>
      <div class="when">${t}${!o.all_day && t !== 'Ganztägig' && !t.startsWith('bis') ? html`<small>${o.end.slice(11, 16)}</small>` : ''}</div>
      <div class="what">
        <strong>${o.title}</strong>
        <small>
          ${o.location ? html`<span>${icon('mapPin', 13)} ${o.location}</span>` : ''}
          ${o.recurrence !== 'none' ? html`<span>${icon('repeat', 13)} ${RECURRENCE_LABELS[o.recurrence]}</span>` : ''}
          ${o.visibility === 'private' ? html`<span>${icon('lock', 13)} Privat</span>` : ''}
          ${o.reminder_minutes != null ? html`<span>${icon('bell', 13)}</span>` : ''}
        </small>
      </div>
      ${ctx.members.length > 1 ? avatar(owner, 26) : ''}
    </div>`;
  }

  // ---------- Wochen-/Tagesansicht ----------
  function layoutDay(events) {
    // Überlappende Termine nebeneinander anordnen
    const sorted = [...events].sort((a, b) => a._s - b._s || b._e - a._e);
    const out = [];
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      const cols = [];
      for (const ev of cluster) {
        let c = cols.findIndex((end) => end <= ev._s);
        if (c === -1) {
          c = cols.length;
          cols.push(0);
        }
        cols[c] = ev._e;
        ev._col = c;
      }
      for (const ev of cluster) out.push({ ...ev, _cols: cols.length });
      cluster = [];
    };
    for (const ev of sorted) {
      if (ev._s >= clusterEnd && cluster.length) flush();
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev._e);
    }
    if (cluster.length) flush();
    return out;
  }

  function timeGrid(days) {
    const [start] = range();
    const todayStr = toLocalDate(new Date());
    const occ = visible();
    const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const head = dates.map((d) => {
      const ds = toLocalDate(d);
      const hol = holidaysOn(ds, state).find((h) => h.official) || holidaysOn(ds, state)[0];
      return html`<div class="${ds === todayStr ? 'today' : ''}" data-goto-day="${ds}">${WEEKDAYS_SHORT[d.getDay()]}<br><span class="num">${d.getDate()}</span>${hol ? html`<span class="hol" style="${hol.official ? '' : 'color:var(--muted)'}">${hol.name}</span>` : ''}</div>`;
    });

    const allDay = dates.map((d) => {
      const list = occurrencesOn(occ, d).filter((o) => o.all_day || o.start.slice(0, 10) !== o.end.slice(0, 10));
      return html`<div>${list.map((o) => html`<span class="ev-chip allday" style="--c:${o.displayColor}" data-occ="${o.id}|${o.start}">${o.title}</span>`)}</div>`;
    });

    const cols = dates.map((d) => {
      const ds = toLocalDate(d);
      const timed = occurrencesOn(occ, d)
        .filter((o) => !o.all_day && o.start.slice(0, 10) === o.end.slice(0, 10))
        .map((o) => {
          const s = parseLocal(o.start);
          const e = parseLocal(o.end);
          const sm = s.getHours() * 60 + s.getMinutes();
          const em = Math.max(sm + 20, e.getHours() * 60 + e.getMinutes());
          return { ...o, _s: sm, _e: em };
        });
      const laid = layoutDay(timed);
      return html`<div class="tg-col ${d.getDay() % 6 === 0 ? 'weekend' : ''}" data-col="${ds}">
        ${laid.map((o) => {
          const top = (o._s / 60) * HOUR;
          const height = Math.max(22, ((o._e - o._s) / 60) * HOUR - 2);
          const w = 100 / o._cols;
          return html`<div class="tg-event" style="--c:${o.displayColor};top:${top}px;height:${height}px;left:calc(${w * o._col}% + 2px);width:calc(${w}% - 4px)" data-occ="${o.id}|${o.start}">
            <strong>${o.visibility === 'private' ? '🔒 ' : ''}${o.title}</strong>${height > 34 ? html`<small>${o.start.slice(11, 16)}–${o.end.slice(11, 16)}${o.location ? ` · ${o.location}` : ''}</small>` : ''}
          </div>`;
        })}
        ${ds === todayStr ? html`<div class="now-line" style="top:${(nowMin / 60) * HOUR}px"></div>` : ''}
      </div>`;
    });

    return html`<div class="timegrid" style="--days:${days};--hour:${HOUR}px">
      <div class="tg-head"><div></div>${head}</div>
      <div class="tg-allday"><div>ganzt.</div>${allDay}</div>
      <div class="tg-scroll">
        <div class="tg-body">
          <div class="tg-hours">${Array.from({ length: 24 }, (_, h) => html`<div>${h ? `${String(h).padStart(2, '0')}:00` : ''}</div>`)}</div>
          ${cols}
        </div>
      </div>
    </div>`;
  }

  // ---------- Listenansicht ----------
  function agendaView() {
    const [start] = range();
    const out = [];
    const occ = visible();
    for (let i = 0; i < 60; i++) {
      const d = addDays(start, i);
      const ds = toLocalDate(d);
      const hol = holidaysOn(ds, state).filter((h) => h.official);
      const dayOcc = occurrencesOn(occ, d);
      if (!dayOcc.length && !hol.length) continue;
      out.push(html`<div class="agenda-day">
        <div class="agenda-date ${ds === toLocalDate(new Date()) ? 'today' : ''}"><span class="big">${d.getDate()}.</span><span>${formatDate(d, { weekday: 'long', month: 'long' })}</span></div>
        ${hol.map((h) => holidayRow(h))}
        ${dayOcc.map((o) => eventRow(o, d))}
      </div>`);
    }
    return out.length
      ? html`${out}`
      : html`<div class="empty"><div class="empty-emoji">📅</div><h3>Keine Termine in den nächsten 60 Tagen</h3><p>Leg los und plane etwas Schönes!</p><button class="btn btn-primary" data-action="new">${icon('plus', 17)} Termin anlegen</button></div>`;
  }

  // ---------- Termin-Dialog ----------
  function eventDialog(occ, preset = {}) {
    const isNew = !occ;
    const isSeries = occ && occ.recurrence !== 'none';
    const base = occ
      ? { ...occ, start: isSeries ? occ.series_start : occ.start, end: isSeries ? occ.series_end : occ.end }
      : (() => {
          const s = preset.start || (() => {
            const n = new Date();
            const d = parseLocal(toLocalDate(selected));
            d.setHours(Math.min(22, n.getHours() + 1), 0);
            return d;
          })();
          const e = new Date(s.getTime() + 60 * 60000);
          return { title: '', start: toLocalDateTime(s), end: toLocalDateTime(e), all_day: preset.allDay ? 1 : 0, visibility: 'shared', recurrence: 'none', color: null, reminder_minutes: null, location: '', notes: '' };
        })();
    const isOwner = isNew || occ.owner_id === ctx.user.id;
    const sDate = base.start.slice(0, 10);
    const eDate = base.end.slice(0, 10);
    const sTime = base.start.slice(11, 16) || '09:00';
    const eTime = base.end.slice(11, 16) || '10:00';
    const owner = occ ? ctx.member(occ.owner_id) : ctx.user;

    const m = openModal({
      title: isNew ? 'Neuer Termin' : 'Termin',
      body: html`<form id="ev-form" novalidate>
        <div class="field"><input class="input" name="title" value="${base.title}" placeholder="Titel, z. B. Zahnarzt" required autofocus style="font-size:18px;font-weight:650;height:52px"></div>
        <label class="switch" style="margin-bottom:14px"><input type="checkbox" name="all_day" ${base.all_day ? 'checked' : ''}><span class="track"></span>Ganztägig</label>
        <div class="grid-2">
          <div class="field"><label>Beginn</label><input class="input" type="date" name="start_date" value="${sDate}" required></div>
          <div class="field time-field"><label>Uhrzeit</label><input class="input" type="time" name="start_time" value="${sTime}" step="300"></div>
          <div class="field"><label>Ende</label><input class="input" type="date" name="end_date" value="${eDate}"></div>
          <div class="field time-field"><label>Uhrzeit</label><input class="input" type="time" name="end_time" value="${eTime}" step="300"></div>
        </div>
        ${isSeries ? html`<p class="muted small" style="margin:-4px 0 12px">${icon('repeat', 13)} Änderungen gelten für die ganze Serie.</p>` : ''}
        <div class="field"><label>Ort</label><input class="input" name="location" value="${base.location}" placeholder="optional"></div>
        <div class="grid-2">
          <div class="field"><label>Wiederholen</label><select class="input" name="recurrence">${Object.entries(RECURRENCE_LABELS).map(([k, v]) => html`<option value="${k}" ${k === base.recurrence ? 'selected' : ''}>${v}</option>`)}</select></div>
          <div class="field until-field"><label>Bis (optional)</label><input class="input" type="date" name="recurrence_until" value="${base.recurrence_until || ''}"></div>
        </div>
        <div class="field"><label>Erinnerung</label><select class="input" name="reminder_minutes">${REMINDERS.map(([k, v]) => html`<option value="${k}" ${String(base.reminder_minutes ?? '') === k ? 'selected' : ''}>${v}</option>`)}</select></div>
        <div class="field"><label>Farbe</label>
          <div class="color-picker">
            <label class="auto" title="Farbe der Person (${owner?.name})"><input type="radio" name="color" value="" ${!base.color ? 'checked' : ''}><span style="--c:${owner?.color}"></span></label>
            ${EVENT_COLORS.map((c) => html`<label><input type="radio" name="color" value="${c}" ${base.color === c ? 'checked' : ''}><span style="--c:${c}"></span></label>`)}
          </div>
        </div>
        ${isOwner && ctx.members.length > 1
          ? html`<div class="field"><label>Sichtbarkeit</label><div class="seg-radio">
              <label><input type="radio" name="visibility" value="shared" ${base.visibility !== 'private' ? 'checked' : ''}><span>${icon('users', 15)} Gemeinsam</span></label>
              <label><input type="radio" name="visibility" value="private" ${base.visibility === 'private' ? 'checked' : ''}><span>${icon('lock', 15)} Nur ich</span></label>
            </div></div>`
          : html`<input type="hidden" name="visibility" value="${base.visibility}">`}
        <div class="field"><label>Notizen</label><textarea class="input" name="notes" rows="3" style="min-height:80px" placeholder="optional">${base.notes}</textarea></div>
        ${!isNew && ctx.members.length > 1 ? html`<p class="muted small">Erstellt von ${owner?.name || 'unbekannt'}</p>` : ''}
      </form>`,
      footer: html`${!isNew ? html`<button class="btn btn-ghost" data-del style="color:var(--danger)">${icon('trash', 16)}</button><span class="spacer"></span>` : ''}
        <button class="btn btn-ghost" data-close>Abbrechen</button>
        <button class="btn btn-primary" data-save>Speichern</button>`,
    });
    m.el.dataset.accent = 'cal';
    const form = $('#ev-form', m.el);
    const sync = () => {
      const allDay = form.elements.all_day.checked;
      m.el.querySelectorAll('.time-field').forEach((f) => f.classList.toggle('hidden', allDay));
      m.el.querySelector('.until-field').classList.toggle('hidden', form.elements.recurrence.value === 'none');
    };
    form.addEventListener('change', (e) => {
      // Ende automatisch mitschieben, wenn der Beginn geändert wird
      if (e.target.name === 'start_date' || e.target.name === 'start_time') {
        const oldS = parseLocal(`${sDate}T${sTime}`);
        const oldE = parseLocal(`${eDate}T${eTime}`);
        const dur = Math.max(0, oldE - oldS);
        const newS = parseLocal(`${form.elements.start_date.value}T${form.elements.start_time.value || '00:00'}`);
        if (newS && !isNaN(newS)) {
          const newE = new Date(newS.getTime() + dur);
          form.elements.end_date.value = toLocalDate(newE);
          form.elements.end_time.value = toLocalDateTime(newE).slice(11, 16);
        }
      }
      sync();
    });
    sync();

    const save = async () => {
      const f = formData(form);
      if (!f.title.trim()) {
        toast('Bitte gib einen Titel ein.', { type: 'error' });
        form.elements.title.focus();
        return;
      }
      const body = {
        title: f.title,
        all_day: f.all_day,
        start: f.all_day ? f.start_date : `${f.start_date}T${f.start_time || '00:00'}`,
        end: f.all_day ? f.end_date || f.start_date : `${f.end_date || f.start_date}T${f.end_time || f.start_time || '00:00'}`,
        location: f.location,
        notes: f.notes,
        color: f.color || null,
        visibility: f.visibility || 'shared',
        recurrence: f.recurrence,
        recurrence_until: f.recurrence !== 'none' ? f.recurrence_until || null : null,
        reminder_minutes: f.reminder_minutes === '' ? null : Number(f.reminder_minutes),
      };
      try {
        if (isNew) await api.post('/calendar/events', body);
        else await api.put(`/calendar/events/${occ.id}`, body);
        m.close();
        selected = parseLocal(body.start.slice(0, 10));
        if (body.reminder_minutes != null && 'Notification' in window && Notification.permission === 'default') {
          toast('Tipp: Aktiviere Benachrichtigungen in den Einstellungen, damit Erinnerungen ankommen.', { action: 'Öffnen', onAction: () => ctx.navigate('/einstellungen') });
        } else toast(isNew ? 'Termin angelegt 📅' : 'Termin gespeichert', { type: 'success' });
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
        if (isSeries) {
          const choice = openModal({
            title: 'Serientermin löschen',
            body: html`<p class="muted">Dieser Termin ist Teil einer Serie.</p>`,
            footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button>
              <button class="btn btn-ghost" data-from style="color:var(--danger)">Ab hier</button>
              <button class="btn btn-danger" data-all>Ganze Serie</button>`,
          });
          $('[data-from]', choice.el).onclick = async () => {
            await api.post(`/calendar/events/${occ.id}/end-series`, { before: occ.start.slice(0, 10) }).catch(toastError);
            choice.close();
            m.close();
            refresh();
          };
          $('[data-all]', choice.el).onclick = async () => {
            await api.del(`/calendar/events/${occ.id}`).catch(toastError);
            choice.close();
            m.close();
            refresh();
          };
          return;
        }
        await api.del(`/calendar/events/${occ.id}`).catch(toastError);
        m.close();
        toast('Termin gelöscht');
        refresh();
      };
  }

  function searchDialog() {
    const m = openModal({
      title: 'Termine suchen',
      body: html`<div class="search"><span>${icon('search', 18)}</span><input class="input" id="ev-q" type="search" placeholder="Titel, Ort, Notiz …" autofocus></div><div id="ev-results" style="margin-top:12px"></div>`,
    });
    m.el.dataset.accent = 'cal';
    const run = debounce(async () => {
      const q = $('#ev-q', m.el).value.trim();
      if (!q) return setHTML($('#ev-results', m.el), '');
      const res = await api.get(`/calendar/events/search?q=${encodeURIComponent(q)}`);
      setHTML(
        $('#ev-results', m.el),
        res.length
          ? html`${res.map((e) => html`<div class="event-row" data-goto="${e.start.slice(0, 10)}"><span class="bar" style="--c:${e.color || e.owner_color}"></span><div class="when">${formatDate(parseLocal(e.start), { day: 'numeric', month: 'short' })}<small>${e.start.slice(0, 4)}</small></div><div class="what"><strong>${e.title}</strong><small>${e.recurrence !== 'none' ? RECURRENCE_LABELS[e.recurrence] : e.all_day ? 'Ganztägig' : e.start.slice(11, 16)}${e.location ? ` · ${e.location}` : ''}</small></div></div>`)}`
          : html`<p class="muted">Nichts gefunden.</p>`,
      );
    }, 250);
    $('#ev-q', m.el).addEventListener('input', run);
    on(m.el, 'click', '[data-goto]', (e, el) => {
      m.close();
      cursor = parseLocal(el.dataset.goto);
      selected = new Date(cursor);
      mode = mode === 'agenda' ? 'month' : mode;
      refresh();
    });
  }

  // ---------- Interaktion ----------
  const findOcc = (key) => {
    const [id, start] = key.split('|');
    return occurrences.find((o) => o.id === Number(id) && o.start === start);
  };

  on(view, 'click', '[data-occ]', (e, el) => {
    e.stopPropagation();
    const occ = findOcc(el.dataset.occ);
    if (occ) eventDialog(occ);
  });
  on(view, 'click', '[data-day]', (e, el) => {
    if (e.target.closest('[data-occ]')) return;
    const d = parseLocal(el.dataset.day);
    if (toLocalDate(d) === toLocalDate(selected) && matchMedia('(min-width: 960px)').matches) {
      // Doppelte Auswahl auf dem Desktop: direkt neuen Termin anlegen
      return eventDialog(null, { start: (() => { const s = new Date(d); s.setHours(9); return s; })() });
    }
    selected = d;
    if (d.getMonth() !== cursor.getMonth()) {
      cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      return refresh();
    }
    draw();
  });
  on(view, 'click', '[data-new-day]', (e, el) => {
    const s = parseLocal(el.dataset.newDay);
    s.setHours(Math.min(22, new Date().getHours() + 1));
    eventDialog(null, { start: s });
  });
  on(view, 'click', '[data-col]', (e, el) => {
    if (e.target.closest('[data-occ]')) return;
    const rect = el.getBoundingClientRect();
    const minutes = Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30;
    const s = parseLocal(el.dataset.col);
    s.setMinutes(Math.max(0, Math.min(23 * 60 + 30, minutes)));
    eventDialog(null, { start: s });
  });
  on(view, 'click', '[data-goto-day]', (e, el) => {
    cursor = parseLocal(el.dataset.gotoDay);
    selected = new Date(cursor);
    mode = 'day';
    localStorageSet('cal-view', mode);
    refresh();
  });
  on(view, 'click', '[data-mode]', (e, el) => {
    mode = el.dataset.mode;
    localStorageSet('cal-view', mode);
    if (mode !== 'month') cursor = new Date(selected);
    refresh();
  });
  on(view, 'click', '[data-nav]', (e, el) => {
    const n = Number(el.dataset.nav);
    if (n === 0) {
      cursor = startOfDay(new Date());
      selected = new Date(cursor);
    } else if (mode === 'month') {
      cursor = addMonths(new Date(cursor.getFullYear(), cursor.getMonth(), 1), n, 1);
      selected = new Date(cursor);
    } else if (mode === 'week') cursor = addDays(cursor, 7 * n);
    else if (mode === 'day') cursor = addDays(cursor, n);
    else cursor = addDays(cursor, 30 * n);
    if (mode !== 'month') selected = new Date(cursor);
    refresh();
  });
  on(view, 'click', '[data-person]', (e, el) => {
    const id = Number(el.dataset.person);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    localStorageSet('cal-hidden', JSON.stringify([...hidden]));
    el.classList.toggle('off');
    draw();
  });
  on(view, 'click', '[data-action=new]', () => eventDialog(null));
  const topbarHandler = (e) => {
    if (e.target.closest('[data-action=search]')) searchDialog();
  };
  document.getElementById('topbar-actions')?.addEventListener('click', topbarHandler);

  // Wischen zum Blättern auf dem Handy
  let touchX = null;
  view.addEventListener('touchstart', (e) => {
    if (e.target.closest('.month, .tg-head')) touchX = e.touches[0].clientX;
  }, { passive: true });
  view.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) view.querySelector(`[data-nav="${dx < 0 ? 1 : -1}"]`)?.click();
  });

  await refresh();
  if (query.get('new')) eventDialog(null);

  return () => document.getElementById('topbar-actions')?.removeEventListener('click', topbarHandler);
}
