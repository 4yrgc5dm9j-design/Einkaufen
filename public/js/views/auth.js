import { api } from '../api.js';
import { html, setHTML, $, formData } from '../ui.js';

export async function render(root, _params, { onLoggedIn }) {
  let mode = 'login';
  let codeRequired = false;
  try {
    codeRequired = (await api.get('/auth/config')).registrationCodeRequired;
  } catch {
    /* ignorieren */
  }

  const draw = () => {
    setHTML(
      root,
      html`<div class="auth">
        <section class="auth-hero">
          <div class="floating" aria-hidden="true">
            <span class="f1">🛒</span>
            <span class="f2">🗓️</span>
            <span class="f3">🍝</span>
            <span class="f4">⏰</span>
            <span class="f5">🥗</span>
          </div>
          <h1>Euer Alltag. Gemeinsam organisiert.</h1>
          <p>Einkaufsliste, Rezepte aus dem Netz, Essensplan, gemeinsamer Kalender und Erinnerungen – alles an einem Ort.</p>
        </section>
        <section class="auth-panel">
          <div class="auth-card">
            <h2>${mode === 'login' ? 'Willkommen zurück 👋' : 'Konto erstellen ✨'}</h2>
            <p class="muted">${mode === 'login' ? 'Melde dich an, um weiterzumachen.' : 'In einer Minute startklar.'}</p>
            <div class="segmented" role="tablist">
              <button type="button" class="${mode === 'login' ? 'active' : ''}" data-mode="login">Anmelden</button>
              <button type="button" class="${mode === 'register' ? 'active' : ''}" data-mode="register">Registrieren</button>
            </div>
            <form id="auth-form" novalidate>
              ${mode === 'register'
                ? html`<div class="field"><label for="f-name">Dein Name</label><input class="input" id="f-name" name="name" autocomplete="given-name" required placeholder="z. B. Alex"></div>`
                : ''}
              <div class="field"><label for="f-email">E-Mail</label><input class="input" id="f-email" name="email" type="email" autocomplete="email" required placeholder="du@beispiel.de"></div>
              <div class="field"><label for="f-pw">Passwort</label><input class="input" id="f-pw" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="8" placeholder="${mode === 'login' ? '••••••••' : 'mindestens 8 Zeichen'}"></div>
              ${mode === 'register' && codeRequired
                ? html`<div class="field"><label for="f-code">Registrierungscode</label><input class="input" id="f-code" name="code" required placeholder="Code vom Betreiber"></div>`
                : ''}
              <div class="form-error" id="auth-error" role="alert"></div>
              <button class="btn btn-primary btn-block" type="submit">${mode === 'login' ? 'Anmelden' : 'Konto erstellen'}</button>
            </form>
          </div>
        </section>
      </div>`,
    );
    $('#auth-form', root).querySelector('input')?.focus();
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) {
      mode = b.dataset.mode;
      draw();
    }
  });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    $('#auth-error', root).textContent = '';
    try {
      await api.post(mode === 'login' ? '/auth/login' : '/auth/register', formData(form));
      root.replaceWith(Object.assign(document.createElement('div'), { id: 'app' }));
      onLoggedIn();
    } catch (err) {
      $('#auth-error', root).textContent = err.message;
      btn.disabled = false;
    }
  });
  draw();
}
