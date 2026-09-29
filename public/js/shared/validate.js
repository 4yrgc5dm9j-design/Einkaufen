export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Nicht gefunden.') => new HttpError(404, msg);

export function str(value, { max = 500, required = false, field = 'Feld' } = {}) {
  const s = value == null ? '' : String(value).trim();
  if (required && !s) throw bad(`${field} darf nicht leer sein.`);
  return s.slice(0, max);
}

export function int(value, { min = -Infinity, max = Infinity, fallback = null } = {}) {
  if (value === '' || value == null) return fallback;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function num(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function oneOf(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

export function color(value, fallback = null) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : fallback;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function localDate(value, { required = false, field = 'Datum' } = {}) {
  if (!value) {
    if (required) throw bad(`${field} fehlt.`);
    return null;
  }
  const s = String(value).slice(0, 10);
  if (!DATE_RE.test(s)) throw bad(`${field} ist ungültig.`);
  return s;
}

export function localDateTime(value, { required = false, field = 'Zeitpunkt', allowDate = true } = {}) {
  if (!value) {
    if (required) throw bad(`${field} fehlt.`);
    return null;
  }
  const s = String(value).slice(0, 16);
  if (DATETIME_RE.test(s)) return s;
  if (allowDate && DATE_RE.test(s)) return s;
  throw bad(`${field} ist ungültig.`);
}

export function jsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
