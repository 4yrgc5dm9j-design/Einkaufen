import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Termine werden als lokale Zeit gespeichert – der Server rechnet in dieser Zeitzone.
process.env.TZ = process.env.TZ || 'Europe/Berlin';

const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');

export const config = {
  root,
  port: Number(process.env.PORT) || 3000,
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  publicDir: path.join(root, 'public'),
  // Hinter einem Reverse-Proxy (HTTPS) auf "1" setzen, damit Cookies als "Secure" markiert werden.
  trustProxy: process.env.TRUST_PROXY === '1',
  // Optional: Registrierung nur mit diesem Code erlauben (für öffentlich erreichbare Instanzen).
  registrationCode: process.env.REGISTRATION_CODE || '',
  contactEmail: process.env.VAPID_CONTACT || 'mailto:admin@example.com',
  sessionDays: 60,
};
