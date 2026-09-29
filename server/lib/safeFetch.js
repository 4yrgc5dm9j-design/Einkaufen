import dns from 'node:dns/promises';
import net from 'node:net';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublicUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Nur http(s)-Adressen sind erlaubt.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error('Diese Adresse ist nicht erreichbar.');
  }
}

/**
 * fetch() mit Schutz vor Anfragen ins interne Netz, Zeitlimit und Größenlimit.
 * Gibt { buffer, contentType, url } zurück.
 */
export async function safeFetch(rawUrl, { maxBytes = 4 * 1024 * 1024, timeoutMs = 12000, accept = '*/*' } = {}) {
  let url = new URL(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 5; hop++) {
      await assertPublicUrl(url);
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url);
        continue;
      }
      if (!res.ok) throw new Error(`Die Seite antwortete mit Status ${res.status}.`);
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          controller.abort();
          throw new Error('Die Antwort ist zu groß.');
        }
        chunks.push(value);
      }
      return { buffer: Buffer.concat(chunks), contentType: res.headers.get('content-type') || '', url: url.toString() };
    }
    throw new Error('Zu viele Weiterleitungen.');
  } catch (err) {
    // Fehler externer Seiten werden als 502 an den Browser weitergereicht
    const message = err.name === 'AbortError' ? 'Zeitüberschreitung beim Abrufen.' : err.message;
    const known = /^(Nur|Diese|Die|Zu viele|Zeitüberschreitung)/.test(message);
    throw Object.assign(new Error(known ? message : 'Die Seite konnte nicht abgerufen werden.'), { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts) {
  const { buffer } = await safeFetch(url, { accept: 'application/json', ...opts });
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Ungültige Antwort der Rezeptquelle.'), { status: 502 });
  }
}

export async function fetchText(url, opts) {
  const { buffer, url: finalUrl } = await safeFetch(url, { accept: 'text/html,application/xhtml+xml', ...opts });
  return { text: buffer.toString('utf8'), url: finalUrl };
}
