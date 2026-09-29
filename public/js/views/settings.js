import { api } from '../api.js';
import { html, setHTML, icon, $, on, toast, toastError, confirmDialog, openModal, formData, avatar } from '../ui.js';
import { applyTheme, localStorageGet, localStorageSet, pushStatus, enablePush, disablePush, logout } from '../app.js';
import { offerFile, downloadIcs } from '../ics.js';

// ---------- Abgleich (nur lokale Web-App) ----------
async function gzipBase64(text) {
  if (typeof CompressionStream === 'undefined') return `A1:${btoa(unescape(encodeURIComponent(text)))}`;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `A1Z:${btoa(bin)}`;
}

async function unBase64(code) {
  const c = code.trim().replace(/\s+/g, '');
  if (c.startsWith('A1:')) return decodeURIComponent(escape(atob(c.slice(3))));
  if (!c.startsWith('A1Z:')) throw new Error('Das ist kein gültiger Abgleich-Code.');
  const bytes = Uint8Array.from(atob(c.slice(4)), (ch) => ch.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function syncResult(res) {
  localStorageSet('last-sync', new Date().toISOString());
  const n = res.added + res.updated;
  toast(n ? `Abgeglichen ✓ ${res.added} neu, ${res.updated} aktualisiert` : 'Alles war schon auf dem neuesten Stand ✓', { type: 'success' });
}

const USER_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ef4444', '#22c55e', '#f97316', '#64748b'];

export async function render(view, _p, ctx) {
  ctx.setTitle('Einstellungen');
  let push = await pushStatus().catch(() => 'unsupported');

  const local = ctx.me.mode === 'local';

  const syncBox = () => {
    const last = localStorageGet('last-sync');
    return html`<div class="invite-box" style="margin-top:14px">
      <strong style="display:flex;align-items:center;gap:8px">${icon('refresh', 18)} Mit Partner abgleichen</strong>
      <ol class="muted small" style="margin:8px 0 12px;padding-left:18px;line-height:1.6">
        <li>Tippe auf <b>„Daten senden“</b> und schick die Datei z. B. per WhatsApp oder AirDrop.</li>
        <li>Dein Partner öffnet Alltag und tippt auf <b>„Daten empfangen“</b> und wählt die Datei.</li>
        <li>Danach genauso zurück – dann habt ihr beide denselben Stand.</li>
      </ol>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn btn-primary btn-sm" data-action="sync-send">${icon('upload', 16)} Daten senden</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon('refresh', 16)} Daten empfangen<input type="file" id="sync-file" accept=".json,application/json" hidden></label>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px">
        <button class="btn btn-ghost btn-sm" data-action="code-copy">Code kopieren (ohne Fotos)</button>
        <button class="btn btn-ghost btn-sm" data-action="code-paste">Code einfügen</button>
      </div>
      <p class="muted small" style="margin-top:10px">Deine Daten liegen nur auf diesem Gerät. ${last ? `Letzter Abgleich: ${new Date(last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}.` : ''} Die Datei ist auch deine Sicherung.</p>
    </div>
    <p class="muted small" style="margin-top:10px">Weitere Person auf <em>diesem</em> Gerät? Abmelden und „Registrieren“ wählen.</p>`;
  };

  const draw = () => {
    const { user, household, invitations, bundeslaender } = ctx.me;
    const theme = localStorageGet('theme') || 'auto';
    const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    setHTML(
      view,
      html`
      ${invitations.incoming.map(
        (inv) => html`<div class="card card-pad invite-box" style="border:none;margin-bottom:16px">
          <div class="row" style="align-items:flex-start">
            <div class="icon-chip" style="background:var(--surface)">${icon('mail', 18)}</div>
            <div class="grow">
              <strong>${inv.from_name}</strong> (${inv.from_email}) möchte, dass du dem Haushalt „${inv.household_name}“ beitrittst.
              <div class="muted small" style="margin-top:4px">Ihr teilt dann Kalender, Einkaufslisten, Rezepte, Essensplan und Erinnerungen. ${household.members.length === 1 ? 'Deine bisherigen Daten werden übernommen.' : ''}</div>
              <div class="row" style="margin-top:12px">
                <button class="btn btn-primary btn-sm" data-accept="${inv.id}">${icon('check', 16)} Beitreten</button>
                <button class="btn btn-ghost btn-sm" data-decline="${inv.id}">Ablehnen</button>
              </div>
            </div>
          </div>
        </div>`,
      )}
      <div class="settings-grid">
        <section class="card card-pad">
          <div class="card-title"><span class="icon-chip">${icon('users', 18)}</span>Haushalt</div>
          <form id="household-form" class="row" style="margin-bottom:10px">
            <input class="input grow" name="name" value="${household.name}" aria-label="Name des Haushalts">
            <button class="btn btn-ghost" type="submit">Umbenennen</button>
          </form>
          ${household.members.map(
            (m) => html`<div class="member-row">${avatar(m, 40)}<div class="info"><strong>${m.name}${m.id === user.id ? ' (du)' : ''}</strong><small>${m.email}</small></div></div>`,
          )}
          ${invitations.outgoing.map(
            (inv) => html`<div class="member-row" style="opacity:.75"><span class="avatar" style="--c:var(--surface-3);width:40px;height:40px;color:var(--muted)">${icon('mail', 18)}</span><div class="info"><strong>${inv.to_name}</strong><small>Einladung ausstehend · ${inv.to_email}</small></div><button class="btn btn-ghost btn-sm" data-decline="${inv.id}">Zurückziehen</button></div>`,
          )}
          ${local ? syncBox() : html`<form id="invite-form" style="margin-top:14px">
            <label class="label" for="invite-email">Person einladen</label>
            <div class="row" style="margin-top:6px">
              <input class="input grow" id="invite-email" name="email" type="email" placeholder="E-Mail des Kontos" required>
              <button class="btn btn-primary" type="submit">${icon('mail', 16)} Einladen</button>
            </div>
            <p class="muted small" style="margin-top:8px">Die Person muss bereits ein Konto haben und die Einladung annehmen. Danach teilt ihr Kalender, Einkaufslisten, Rezepte und Erinnerungen. Private Termine bleiben privat.</p>
          </form>`}
          ${household.members.length > 1 && !local ? html`<button class="btn btn-ghost btn-sm" data-action="leave" style="margin-top:10px;color:var(--danger)">${icon('logout', 15)} Haushalt verlassen</button>` : ''}
        </section>

        <section class="card card-pad">
          <div class="card-title"><span class="icon-chip">${avatar(user, 30)}</span>Profil</div>
          <form id="profile-form">
            <div class="field"><label>Name</label><input class="input" name="name" value="${user.name}"></div>
            <div class="field"><label>Deine Farbe im Kalender</label>
              <div class="color-picker">${USER_COLORS.map((c) => html`<label><input type="radio" name="color" value="${c}" ${c === user.color ? 'checked' : ''}><span style="--c:${c}"></span></label>`)}</div>
            </div>
            <div class="field"><label>Bundesland (für Feiertage)</label>
              <select class="input" name="bundesland">${Object.entries(bundeslaender).map(([k, v]) => html`<option value="${k}" ${k === user.bundesland ? 'selected' : ''}>${v}</option>`)}</select>
            </div>
            <button class="btn btn-primary" type="submit">Speichern</button>
          </form>
        </section>

        <section class="card card-pad">
          <div class="card-title"><span class="icon-chip">${icon('bell', 18)}</span>Benachrichtigungen</div>
          <div class="setting-row">
            <div class="info"><strong>Push-Benachrichtigungen</strong><small>${
              push === 'unsupported'
                ? 'Dieser Browser unterstützt keine Push-Nachrichten. Auf dem iPhone: App erst zum Home-Bildschirm hinzufügen.'
                : push === 'denied'
                  ? 'Blockiert – bitte in den Browser-Einstellungen erlauben.'
                  : local
                  ? 'Hinweise für fällige Erinnerungen und Termine.'
                  : 'Für Termine und Erinnerungen auf diesem Gerät.'
            }</small></div>
            ${push === 'on' || push === 'off'
              ? html`<label class="switch"><input type="checkbox" id="push-toggle" ${push === 'on' ? 'checked' : ''}><span class="track"></span></label>`
              : ''}
          </div>
          ${push === 'on' && !local ? html`<button class="btn btn-ghost btn-sm" data-action="test-push" style="margin-top:8px">Test senden</button>` : ''}
          ${local ? html`<p class="muted small" style="margin-top:8px">Hinweise erscheinen, solange Alltag geöffnet ist. Für zuverlässige Wecker übernimm Termine in den Kalender deines Handys – mit Erinnerung:</p>` : ''}
          <button class="btn btn-ghost btn-sm" data-action="ics-all" style="margin-top:8px">${icon('calendar', 15)} Alle Termine in Handy-Kalender</button>
        </section>

        <section class="card card-pad">
          <div class="card-title"><span class="icon-chip">${icon('sun', 18)}</span>Darstellung</div>
          <div class="segmented" style="width:100%">
            ${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(
              ([k, v]) => html`<button data-theme-choice="${k}" class="${theme === k ? 'active' : ''}" style="flex:1">${v}</button>`,
            )}
          </div>
          ${!isStandalone
            ? html`<div class="setting-row" style="margin-top:10px"><div class="info"><strong>Als App installieren</strong><small>iPhone: Teilen → „Zum Home-Bildschirm“. Android/Chrome: Menü → „App installieren“.</small></div></div>`
            : ''}
        </section>

        <section class="card card-pad">
          <div class="card-title"><span class="icon-chip">${icon('lock', 18)}</span>Konto</div>
          <div class="setting-row"><div class="info"><strong>${user.email}</strong><small>Angemeldet</small></div><button class="btn btn-ghost btn-sm" data-action="logout">${icon('logout', 15)} Abmelden</button></div>
          <div class="setting-row"><div class="info"><strong>Passwort ändern</strong></div><button class="btn btn-ghost btn-sm" data-action="password">Ändern</button></div>
          <div class="setting-row"><div class="info"><strong>Konto löschen</strong><small>Entfernt dein Konto endgültig.</small></div><button class="btn btn-ghost btn-sm" data-action="delete" style="color:var(--danger)">Löschen</button></div>
        </section>
      </div>`,
    );
  };

  const reload = async () => {
    await ctx.refreshMe();
    draw();
  };

  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      if (e.target.id === 'profile-form') {
        await api.patch('/me', f);
        toast('Profil gespeichert', { type: 'success' });
      }
      if (e.target.id === 'household-form') {
        await api.patch('/household', f);
        toast('Haushalt umbenannt', { type: 'success' });
      }
      if (e.target.id === 'invite-form') {
        await api.post('/household/invite', f);
        toast('Einladung verschickt 💌 – sie erscheint beim Gegenüber in den Einstellungen.', { type: 'success' });
      }
      reload();
    } catch (err) {
      toastError(err);
    }
  });

  on(view, 'click', '[data-accept]', async (e, el) => {
    try {
      await api.post(`/household/invitations/${el.dataset.accept}/accept`);
      toast('Willkommen im gemeinsamen Haushalt! 🏡', { type: 'success' });
      reload();
    } catch (err) {
      toastError(err);
    }
  });
  on(view, 'click', '[data-decline]', async (e, el) => {
    await api.post(`/household/invitations/${el.dataset.decline}/decline`).catch(toastError);
    reload();
  });
  on(view, 'click', '[data-theme-choice]', (e, el) => {
    localStorageSet('theme', el.dataset.themeChoice);
    applyTheme(el.dataset.themeChoice);
    draw();
  });
  view.addEventListener('change', async (e) => {
    if (e.target.id === 'sync-file') {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const res = await api.post('/sync/import', JSON.parse(await file.text()));
        syncResult(res);
        reload();
      } catch (err) {
        toastError(err.status ? err : new Error('Die Datei konnte nicht gelesen werden.'));
      }
      return;
    }
    if (e.target.id !== 'push-toggle') return;
    try {
      if (e.target.checked) {
        await enablePush();
        toast('Benachrichtigungen aktiviert 🔔', { type: 'success' });
      } else {
        await disablePush();
        toast('Benachrichtigungen deaktiviert');
      }
    } catch (err) {
      toastError(err);
    }
    push = await pushStatus().catch(() => 'unsupported');
    draw();
  });

  on(view, 'click', '[data-action]', async (e, el) => {
    const a = el.dataset.action;
    if (a === 'logout') logout();
    if (a === 'sync-send') {
      try {
        const data = await api.get('/sync/export');
        const date = new Date().toISOString().slice(0, 10);
        await offerFile(`alltag-${ctx.user.name.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-')}-${date}.json`, JSON.stringify(data), 'application/json');
        localStorageSet('last-sync', new Date().toISOString());
      } catch (err) {
        toastError(err);
      }
    }
    if (a === 'code-copy') {
      try {
        const code = await gzipBase64(JSON.stringify(await api.get('/sync/export?images=0')));
        await navigator.clipboard.writeText(code);
        toast(`Code kopiert (${Math.round(code.length / 1024)} KB) – jetzt z. B. per WhatsApp schicken.`, { type: 'success' });
      } catch (err) {
        toastError(err);
      }
    }
    if (a === 'code-paste') {
      const m = openModal({
        title: 'Code einfügen',
        body: html`<p class="muted small" style="margin-bottom:10px">Füge den Code ein, den dein Partner dir geschickt hat.</p><textarea class="input" id="sync-code" rows="5" placeholder="A1Z:…" autofocus></textarea>`,
        footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-ok>Abgleichen</button>`,
      });
      $('[data-ok]', m.el).onclick = async () => {
        try {
          const res = await api.post('/sync/import', JSON.parse(await unBase64($('#sync-code', m.el).value)));
          m.close();
          syncResult(res);
          reload();
        } catch (err) {
          toastError(err.status ? err : new Error('Der Code ist ungültig oder unvollständig.'));
        }
      };
    }
    if (a === 'ics-all') {
      try {
        const events = await api.get('/calendar/events?from=2000-01-01&to=2100-01-01');
        if (!events.length) return toast('Noch keine Termine vorhanden.');
        await downloadIcs(events, 'alltag-termine.ics');
      } catch (err) {
        toastError(err);
      }
    }
    if (a === 'test-push') {
      const { sent } = await api.post('/push/test');
      toast(sent ? 'Test gesendet – gleich sollte eine Nachricht erscheinen.' : 'Kein Gerät registriert.');
    }
    if (a === 'leave') {
      if (!(await confirmDialog('Du verlässt den gemeinsamen Haushalt. Gemeinsame Daten bleiben dort, deine privaten Termine nimmst du mit.', { confirmText: 'Verlassen' }))) return;
      await api.post('/household/leave').catch(toastError);
      reload();
    }
    if (a === 'password') {
      const m = openModal({
        title: 'Passwort ändern',
        body: html`<form id="pw-form">
          <div class="field"><label>Aktuelles Passwort</label><input class="input" type="password" name="current" autocomplete="current-password" required autofocus></div>
          <div class="field"><label>Neues Passwort</label><input class="input" type="password" name="password" autocomplete="new-password" minlength="8" required></div>
        </form>`,
        footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-primary" data-save>Ändern</button>`,
      });
      $('[data-save]', m.el).onclick = async () => {
        try {
          await api.post('/me/password', formData($('#pw-form', m.el)));
          m.close();
          toast('Passwort geändert', { type: 'success' });
        } catch (err) {
          toastError(err);
        }
      };
    }
    if (a === 'delete') {
      const m = openModal({
        title: 'Konto löschen',
        body: html`<p class="muted" style="margin-bottom:12px">Das kann nicht rückgängig gemacht werden. Gemeinsame Daten bleiben für die anderen im Haushalt erhalten.</p>
          <div class="field"><label>Passwort zur Bestätigung</label><input class="input" type="password" id="del-pw" autocomplete="current-password"></div>`,
        footer: html`<button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-danger" data-ok>Endgültig löschen</button>`,
      });
      $('[data-ok]', m.el).onclick = async () => {
        try {
          await api.del('/me', { password: $('#del-pw', m.el).value });
          location.reload();
        } catch (err) {
          toastError(err);
        }
      };
    }
  });

  await reload();
}
