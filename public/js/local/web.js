// Rezepte aus dem Internet direkt im Browser abrufen. Viele Seiten erlauben keine
// Abrufe von fremden Webseiten (CORS) – dann wird über einen öffentlichen CORS-Proxy gegangen.
import {
  recipeFromHtml, noRecipeError, CK_API, chefkochSearchResults, chefkochToRecipe, chefkochSearchUrl, chefkochHtmlResults,
  MEALDB, mealToRecipe, mealSearchResults,
} from '../shared/recipeParse.js';

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Holt eine Adresse – zuerst direkt, dann über die Proxys. */
async function fetchText(url, { direct = true } = {}) {
  const attempts = [...(direct ? [(u) => u] : []), ...PROXIES];
  let lastErr;
  for (const make of attempts) {
    try {
      return await fetchWithTimeout(make(url));
    } catch (err) {
      lastErr = err;
    }
  }
  throw Object.assign(new Error(lastErr?.name === 'AbortError' ? 'Zeitüberschreitung beim Abrufen.' : 'Die Seite konnte nicht abgerufen werden.'), { status: 502 });
}

async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Ungültige Antwort der Rezeptquelle.'), { status: 502 });
  }
}

export async function searchRecipes(query, { offset = 0 } = {}) {
  const errors = [];
  const chefkoch = fetchJson(`${CK_API}/recipes?query=${encodeURIComponent(query)}&limit=24&offset=${offset}&minimumRating=0`, { direct: false })
    .then(chefkochSearchResults)
    .catch(async (err) => {
      try {
        return offset ? [] : chefkochHtmlResults(await fetchText(chefkochSearchUrl(query), { direct: false }));
      } catch {
        errors.push(`Chefkoch: ${err.message}`);
        return [];
      }
    });
  const mealdb = offset
    ? Promise.resolve([])
    : fetchJson(`${MEALDB}/search.php?s=${encodeURIComponent(query)}`)
        .then(mealSearchResults)
        .catch((err) => {
          errors.push(`TheMealDB: ${err.message}`);
          return [];
        });
  const [a, b] = await Promise.all([chefkoch, mealdb]);
  return { results: [...a, ...b], errors };
}

export async function getExternalRecipe(source, id) {
  if (source === 'chefkoch') return { ...chefkochToRecipe(await fetchJson(`${CK_API}/recipes/${encodeURIComponent(id)}`, { direct: false })), source };
  if (source === 'mealdb') {
    const meal = (await fetchJson(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`)).meals?.[0];
    if (!meal) throw Object.assign(new Error('Rezept nicht gefunden.'), { status: 404 });
    return { ...mealToRecipe(meal), source };
  }
  throw Object.assign(new Error('Unbekannte Quelle.'), { status: 400 });
}

export async function importFromUrl(url) {
  const chefkochId = String(url).match(/chefkoch\.de\/rezepte\/(\d+)/)?.[1];
  if (chefkochId) {
    try {
      return chefkochToRecipe(await fetchJson(`${CK_API}/recipes/${chefkochId}`, { direct: false }));
    } catch {
      /* auf generischen Import zurückfallen */
    }
  }
  const html = await fetchText(url, { direct: false });
  const recipe = recipeFromHtml(html, url);
  if (!recipe) throw noRecipeError(html);
  return recipe;
}
