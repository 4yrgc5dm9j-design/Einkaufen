// Rezepte aus dem Internet (Server-Variante): Suche (Chefkoch, TheMealDB) und Import beliebiger Rezeptseiten.
import { fetchJson, fetchText } from './safeFetch.js';
import {
  recipeFromHtml, noRecipeError, CK_API, chefkochSearchResults, chefkochToRecipe, chefkochSearchUrl, chefkochHtmlResults,
  MEALDB, mealToRecipe, mealSearchResults,
} from '../../public/js/shared/recipeParse.js';

export { extractJsonLdBlocks, recipeFromJsonLd, parseDuration, cleanText } from '../../public/js/shared/recipeParse.js';

/** Importiert ein Rezept von einer beliebigen Webseite. */
export async function importFromUrl(rawUrl) {
  const chefkochId = String(rawUrl).match(/chefkoch\.de\/rezepte\/(\d+)/)?.[1];
  if (chefkochId) {
    try {
      return chefkochToRecipe(await fetchJson(`${CK_API}/recipes/${chefkochId}`));
    } catch {
      /* auf generischen Import zurückfallen */
    }
  }
  const { text: html, url } = await fetchText(rawUrl);
  const recipe = recipeFromHtml(html, url);
  if (!recipe) throw noRecipeError(html);
  return recipe;
}

/** Sucht parallel in allen Quellen; Fehler einzelner Quellen werden gesammelt, nicht geworfen. */
export async function searchRecipes(query, { offset = 0 } = {}) {
  const errors = [];
  const chefkoch = fetchJson(`${CK_API}/recipes?query=${encodeURIComponent(query)}&limit=24&offset=${offset}&minimumRating=0`)
    .then(chefkochSearchResults)
    .catch(async (err) => {
      try {
        return offset ? [] : chefkochHtmlResults((await fetchText(chefkochSearchUrl(query))).text);
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
  if (source === 'chefkoch') return { ...chefkochToRecipe(await fetchJson(`${CK_API}/recipes/${encodeURIComponent(id)}`)), source };
  if (source === 'mealdb') {
    const meal = (await fetchJson(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`)).meals?.[0];
    if (!meal) throw Object.assign(new Error('Rezept nicht gefunden.'), { status: 404 });
    return { ...mealToRecipe(meal), source };
  }
  throw Object.assign(new Error('Unbekannte Quelle.'), { status: 400 });
}
