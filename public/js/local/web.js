// Rezepte aus dem Internet direkt im Browser abrufen. Die meisten Seiten (z. B. Chefkoch) erlauben
// keine Abrufe von fremden Webseiten (CORS) – deshalb läuft der Abruf über den Dienst „Jina Reader“
// (r.jina.ai), der die Seite abholt und mit CORS-Freigabe zurückgibt. Stand der Prüfung (scripts/check-sources.mjs):
// Jina funktioniert zuverlässig, allorigins.win und corsproxy.io sind nicht mehr nutzbar.
import {
  recipeFromHtml, noRecipeError, CK_API, chefkochSearchResults, chefkochToRecipe, chefkochSearchUrl, chefkochHtmlResults,
  MEALDB, mealToRecipe, mealSearchResults,
} from '../shared/recipeParse.js';

const JINA = 'https://r.jina.ai/';

async function fetchWithTimeout(url, { headers = {}, ms = 20000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Holt eine Adresse als Text.
 *  kind 'json': Rohinhalt (z. B. API-Antworten)
 *  kind 'html': vollständiges HTML inkl. Rezeptdaten (schema.org)
 */
async function fetchText(url, { kind = 'html', direct = false } = {}) {
  const attempts = [];
  if (direct) attempts.push(() => fetchWithTimeout(url, { ms: 10000 }));
  attempts.push(() => fetchWithTimeout(JINA + url, { headers: { 'X-Return-Format': kind === 'json' ? 'text' : 'html' } }));
  // zweiter Versuch, falls Jina kurz überlastet ist, danach allorigins als Reserve
  attempts.push(() => fetchWithTimeout(JINA + url, { headers: { 'X-Return-Format': kind === 'json' ? 'text' : 'html', 'X-No-Cache': 'true' } }));
  attempts.push(() => fetchWithTimeout(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { ms: 12000 }));
  let lastErr;
  for (const attempt of attempts) {
    try {
      const text = await attempt();
      if (text && text.trim()) return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw Object.assign(
    new Error(lastErr?.name === 'AbortError' ? 'Zeitüberschreitung beim Abrufen. Bitte versuch es gleich noch einmal.' : 'Die Seite konnte gerade nicht abgerufen werden. Bitte versuch es gleich noch einmal.'),
    { status: 502 },
  );
}

async function fetchJson(url, opts) {
  let text = await fetchText(url, { kind: 'json', ...opts });
  // Falls doch eine HTML-Hülle kommt (<pre>…</pre>), den Inhalt herauslösen
  const pre = text.match(/<pre[^>]*>([\s\S]*)<\/pre>/i);
  if (pre) text = pre[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Ungültige Antwort der Rezeptquelle.'), { status: 502 });
  }
}

export async function searchRecipes(query, { offset = 0 } = {}) {
  const errors = [];
  const chefkoch = fetchJson(`${CK_API}/recipes?query=${encodeURIComponent(query)}&limit=24&offset=${offset}&minimumRating=0`)
    .then(chefkochSearchResults)
    .catch(async (err) => {
      try {
        return offset ? [] : chefkochHtmlResults(await fetchText(chefkochSearchUrl(query)));
      } catch {
        errors.push(`Chefkoch: ${err.message}`);
        return [];
      }
    });
  const mealdb = offset
    ? Promise.resolve([])
    : fetchJson(`${MEALDB}/search.php?s=${encodeURIComponent(query)}`, { direct: true })
        .then(mealSearchResults)
        .catch((err) => {
          errors.push(`TheMealDB: ${err.message}`);
          return [];
        });
  const [a, b] = await Promise.all([chefkoch, mealdb]);
  return { results: [...a, ...b], errors };
}

export async function getExternalRecipe(source, id) {
  if (source === 'chefkoch') return { ...chefkochToRecipe(await fetchJson(`${CK_API}/recipes/${encodeURIComponent(id)}`)), source };
  if (source === 'mealdb') {
    const meal = (await fetchJson(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`, { direct: true })).meals?.[0];
    if (!meal) throw Object.assign(new Error('Rezept nicht gefunden.'), { status: 404 });
    return { ...mealToRecipe(meal), source };
  }
  throw Object.assign(new Error('Unbekannte Quelle.'), { status: 400 });
}

export async function importFromUrl(url) {
  const chefkochId = String(url).match(/chefkoch\.de\/rezepte\/(\d+)/)?.[1];
  if (chefkochId) {
    try {
      return chefkochToRecipe(await fetchJson(`${CK_API}/recipes/${chefkochId}`));
    } catch {
      /* auf generischen Import zurückfallen */
    }
  }
  const html = await fetchText(url);
  const recipe = recipeFromHtml(html, url);
  if (!recipe) throw noRecipeError(html);
  return recipe;
}
