// Dünner Wrapper um die JSON-API – entweder per fetch zum Server oder an das lokale Backend im Browser.
import { MODE } from './config.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let localBackend = null;

async function request(method, url, body) {
  if (MODE === 'local') {
    localBackend ??= import('./local/backend.js');
    const { handle } = await localBackend;
    try {
      // Deep-Copy wie bei einer echten Netzwerkanfrage, damit Ansichten keine gespeicherten Objekte verändern
      return structuredClone(await handle(method, url, body ? structuredClone(body) : {}));
    } catch (err) {
      if (err.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new ApiError(err.status || 500, err.status ? err.message : 'Interner Fehler: ' + err.message);
    }
  }
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(`api${url}`, opts);
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new ApiError(res.status, data.error || `Fehler ${res.status}`);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url, body) => request('DELETE', url, body),
};
