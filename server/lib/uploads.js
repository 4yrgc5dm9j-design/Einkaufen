import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { safeFetch } from './safeFetch.js';

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function sniffType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  if (buf.slice(4, 12).toString().startsWith('ftypavi')) return 'image/avif';
  return null;
}

function store(buffer) {
  const type = sniffType(buffer);
  if (!type) throw Object.assign(new Error('Nur Bilder (JPG, PNG, WebP, GIF, AVIF) sind erlaubt.'), { status: 400 });
  const name = `${crypto.randomBytes(12).toString('hex')}.${TYPES[type]}`;
  fs.writeFileSync(path.join(config.uploadDir, name), buffer);
  return `/uploads/${name}`;
}

/** Speichert ein Bild aus einer data:-URL (vom Browser bereits verkleinert). */
export function saveDataUrl(dataUrl) {
  const m = String(dataUrl).match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  if (!m) throw Object.assign(new Error('Ungültiges Bild.'), { status: 400 });
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw Object.assign(new Error('Das Bild ist zu groß (max. 8 MB).'), { status: 413 });
  return store(buffer);
}

/** Lädt ein Bild aus dem Internet herunter und speichert es lokal. */
export async function saveRemoteImage(url) {
  const { buffer } = await safeFetch(url, { maxBytes: 8 * 1024 * 1024, accept: 'image/*' });
  return store(buffer);
}

/** Entfernt lokal gespeicherte Bilder, die nicht mehr verwendet werden. */
export function deleteLocalImages(urls) {
  for (const u of urls || []) {
    const m = String(u).match(/^\/uploads\/([a-f0-9]{24}\.[a-z]+)$/);
    if (m) fs.rm(path.join(config.uploadDir, m[1]), { force: true }, () => {});
  }
}
