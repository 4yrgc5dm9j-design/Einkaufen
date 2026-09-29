import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import './db.js';
import { requireAuth } from './auth.js';
import { accountRouter } from './routes/account.js';
import { shoppingRouter } from './routes/shopping.js';
import { recipesRouter } from './routes/recipes.js';
import { calendarRouter } from './routes/calendar.js';
import { remindersRouter } from './routes/reminders.js';
import { mealplanRouter } from './routes/mealplan.js';
import { saveSubscription, removeSubscription, sendToUsers, startScheduler } from './push.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'",
    });
    next();
  });

  app.use('/api', express.json({ limit: '40mb' }));

  // CSRF-Schutz: schreibende API-Aufrufe nur als JSON (zusätzlich zu SameSite-Cookies)
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Nur JSON-Anfragen werden akzeptiert.' });
    }
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/shopping', requireAuth, shoppingRouter);
  app.use('/api/recipes', requireAuth, recipesRouter);
  app.use('/api/calendar', requireAuth, calendarRouter);
  app.use('/api/reminders', requireAuth, remindersRouter);
  app.use('/api/mealplan', requireAuth, mealplanRouter);

  app.post('/api/push/subscribe', requireAuth, (req, res) => {
    saveSubscription(req.user.id, req.body);
    res.json({ ok: true });
  });
  app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
    removeSubscription(req.user.id, String(req.body.endpoint || ''));
    res.json({ ok: true });
  });
  app.post('/api/push/test', requireAuth, async (req, res) => {
    const sent = await sendToUsers([req.user.id], { title: '🔔 Test', body: 'Benachrichtigungen funktionieren!', url: '/#/' });
    res.json({ sent });
  });

  app.use('/api', accountRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

  // Hochgeladene Bilder nur für angemeldete Nutzer
  app.use('/uploads', requireAuth, express.static(config.uploadDir, { maxAge: '30d', immutable: true, fallthrough: false }));

  app.use(
    express.static(config.publicDir, {
      setHeaders(res, file) {
        if (file.endsWith('sw.js') || file.endsWith('.html')) res.set('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('/*splat', (req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));

  // Fehlerbehandlung
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Die Daten sind zu groß.' });
    // Fehler mit gesetztem Status sind für Nutzer gedacht; alles andere ist ein unerwarteter Serverfehler.
    const status = err.status || err.statusCode;
    if (!status) {
      console.error(err);
      return res.status(500).json({ error: 'Interner Fehler. Bitte versuche es erneut.' });
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(config.root, 'server/index.js')) {
  const app = createApp();
  startScheduler();
  app.listen(config.port, () => {
    console.log(`Alltag läuft auf http://localhost:${config.port}`);
  });
}
