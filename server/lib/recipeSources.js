// Rezepte aus dem Internet: Suche (Chefkoch, TheMealDB) und Import beliebiger Rezeptseiten (schema.org/Recipe).
import { fetchJson, fetchText } from './safeFetch.js';
import { parseIngredient } from '../../public/js/shared/ingredients.js';

// ---------- Hilfsfunktionen ----------

const decodeEntities = (s) =>
  String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

export const cleanText = (s) => decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** ISO-8601-Dauer ("PT1H30M") -> Minuten */
export function parseDuration(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Math.round(value);
  const m = String(value).match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i);
  if (!m || !m[0] || m[0] === 'P') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  const minutes = (Number(m[1]) || 0) * 1440 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return minutes || null;
}

function parseServings(value) {
  const v = Array.isArray(value) ? value[0] : value;
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 && n < 100 ? n : 4;
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function imageUrls(image) {
  return asArray(image)
    .map((img) => (typeof img === 'string' ? img : img?.url || img?.contentUrl))
    .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
}

function flattenInstructions(instr) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node === 'string') {
      // Manche Seiten liefern alles in einem String
      for (const part of cleanText(node.replace(/<\/(p|li)>|<br\s*\/?>/gi, '\n')).split(/\n+/)) {
        if (part.trim()) out.push(part.trim());
      }
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    const type = asArray(node['@type']).join(',');
    if (type.includes('HowToSection')) return walk(node.itemListElement);
    if (node.text) return out.push(cleanText(node.text));
    if (node.name) return out.push(cleanText(node.name));
  };
  walk(instr);
  // sehr lange Einzeltexte in Absätze teilen
  if (out.length === 1 && out[0].length > 400) {
    return out[0].split(/(?<=\.)\s+(?=[A-ZÄÖÜ])/).reduce((acc, sentence) => {
      if (!acc.length || acc[acc.length - 1].length > 220) acc.push(sentence);
      else acc[acc.length - 1] += ` ${sentence}`;
      return acc;
    }, []);
  }
  return out;
}

// ---------- JSON-LD (schema.org/Recipe) ----------

function findRecipeNode(data) {
  const stack = [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    const types = asArray(node['@type']).map(String);
    if (types.some((t) => t.toLowerCase() === 'recipe')) return node;
    if (node['@graph']) stack.push(node['@graph']);
    if (node.mainEntity) stack.push(node.mainEntity);
  }
  return null;
}

export function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      try {
        // Einige Seiten enthalten Steuerzeichen/Zeilenumbrüche in Strings
        blocks.push(JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, ' ')));
      } catch {
        /* ignorieren */
      }
    }
  }
  return blocks;
}

function metaContent(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  return decodeEntities((html.match(re) || html.match(re2) || [])[1] || '');
}

export function recipeFromJsonLd(node, sourceUrl) {
  const ingredients = asArray(node.recipeIngredient || node.ingredients)
    .map((s) => parseIngredient(cleanText(s)))
    .filter(Boolean);
  const keywords = typeof node.keywords === 'string' ? node.keywords.split(',') : asArray(node.keywords);
  const tags = [...new Set([...asArray(node.recipeCategory), ...asArray(node.recipeCuisine), ...keywords].map((t) => cleanText(t)).filter((t) => t && t.length < 30))].slice(0, 8);
  const rating = node.aggregateRating ? Number(node.aggregateRating.ratingValue) || null : null;
  return {
    title: cleanText(node.name) || 'Rezept',
    description: cleanText(node.description).slice(0, 600),
    servings: parseServings(node.recipeYield),
    prep_minutes: parseDuration(node.prepTime),
    cook_minutes: parseDuration(node.cookTime) ?? (node.totalTime && !node.prepTime ? parseDuration(node.totalTime) : null),
    difficulty: '',
    ingredients,
    steps: flattenInstructions(node.recipeInstructions),
    tags,
    images: imageUrls(node.image).slice(0, 4),
    source_url: sourceUrl,
    rating,
  };
}

/** Importiert ein Rezept von einer beliebigen Webseite. */
export async function importFromUrl(rawUrl) {
  const chefkochId = String(rawUrl).match(/chefkoch\.de\/rezepte\/(\d+)/)?.[1];
  if (chefkochId) {
    try {
      return await chefkochRecipe(chefkochId);
    } catch {
      /* auf generischen Import zurückfallen */
    }
  }
  const { text: html, url } = await fetchText(rawUrl);
  for (const block of extractJsonLdBlocks(html)) {
    const node = findRecipeNode(block);
    if (node) return recipeFromJsonLd(node, url);
  }
  const title = metaContent(html, 'og:title') || cleanText((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]);
  const err = new Error(
    title
      ? `Auf „${title.slice(0, 80)}“ wurde kein strukturiertes Rezept gefunden. Du kannst es manuell anlegen.`
      : 'Auf dieser Seite wurde kein Rezept gefunden.',
  );
  err.status = 422;
  throw err;
}

// ---------- Chefkoch ----------

const CK_API = 'https://api.chefkoch.de/v2';

function chefkochImage(recipe, format = 'crop-960x720') {
  const tpl = recipe.previewImageUrlTemplate;
  if (!tpl || recipe.hasImage === false) return null;
  return tpl.replace('<format>', format);
}

async function chefkochSearch(query, offset = 0) {
  const data = await fetchJson(`${CK_API}/recipes?query=${encodeURIComponent(query)}&limit=24&offset=${offset}&minimumRating=0`);
  return (data.results || []).map(({ recipe }) => ({
    source: 'chefkoch',
    sourceLabel: 'Chefkoch',
    id: String(recipe.id),
    title: recipe.title,
    subtitle: recipe.subtitle || '',
    image: chefkochImage(recipe, 'crop-480x360'),
    minutes: recipe.totalTime || recipe.preparationTime || null,
    rating: recipe.rating?.rating ? Math.round(recipe.rating.rating * 10) / 10 : null,
    votes: recipe.rating?.numVotes || 0,
    url: recipe.siteUrl || `https://www.chefkoch.de/rezepte/${recipe.id}`,
  }));
}

async function chefkochRecipe(id) {
  const r = await fetchJson(`${CK_API}/recipes/${encodeURIComponent(id)}`);
  const ingredients = [];
  for (const group of r.ingredientGroups || []) {
    for (const ing of group.ingredients || []) {
      ingredients.push({
        quantity: ing.amount ? Number(ing.amount) : null,
        unit: parseIngredient(`1 ${ing.unit || ''} x`)?.unit || ing.unit || '',
        name: cleanText(ing.name),
        note: cleanText(ing.usageInfo || '').replace(/^,\s*/, ''),
        group: group.header || undefined,
      });
    }
  }
  const image = chefkochImage(r);
  return {
    title: r.title,
    description: r.subtitle || '',
    servings: r.servings || 4,
    prep_minutes: r.preparationTime || null,
    cook_minutes: r.cookingTime || null,
    difficulty: ['', 'simpel', 'normal', 'pfiffig'][r.difficulty] || '',
    ingredients,
    steps: flattenInstructions(r.instructions || ''),
    tags: (r.tags || []).slice(0, 8),
    images: image ? [image] : [],
    source_url: r.siteUrl || `https://www.chefkoch.de/rezepte/${r.id}`,
    rating: r.rating?.rating || null,
  };
}

/** Fallback: Chefkoch-Suchseite (HTML) auswerten, falls die API nicht antwortet. */
async function chefkochHtmlSearch(query) {
  const slug = encodeURIComponent(query.trim().replace(/\s+/g, '-'));
  const { text: html } = await fetchText(`https://www.chefkoch.de/rs/s0/${slug}/Rezepte.html`);
  const results = [];
  for (const block of extractJsonLdBlocks(html)) {
    for (const list of asArray(block)) {
      if (asArray(list['@type']).includes('ItemList')) {
        for (const el of asArray(list.itemListElement)) {
          const url = el.url || el.item?.url;
          const id = String(url || '').match(/rezepte\/(\d+)/)?.[1];
          if (!id) continue;
          results.push({
            source: 'chefkoch',
            sourceLabel: 'Chefkoch',
            id,
            title: cleanText(el.name || el.item?.name || decodeURIComponent(url.split('/').pop()).replace(/\.html$/, '').replace(/-/g, ' ')),
            subtitle: '',
            image: imageUrls(el.image || el.item?.image)[0] || null,
            minutes: null,
            rating: null,
            votes: 0,
            url,
          });
        }
      }
    }
  }
  return results;
}

// ---------- TheMealDB (international, englisch) ----------

function mealToRecipe(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    const measure = (m[`strMeasure${i}`] || '').trim();
    const parsed = parseIngredient(`${measure} ${name}`) || { quantity: null, unit: '', name, note: '' };
    ingredients.push(parsed);
  }
  return {
    title: m.strMeal,
    description: [m.strCategory, m.strArea].filter(Boolean).join(' · '),
    servings: 4,
    prep_minutes: null,
    cook_minutes: null,
    difficulty: '',
    ingredients,
    steps: flattenInstructions(String(m.strInstructions || '').split(/\r?\n/).filter((s) => s.trim() && !/^step \d+$/i.test(s.trim()))),
    tags: [m.strCategory, m.strArea, ...String(m.strTags || '').split(',')].filter(Boolean).slice(0, 6),
    images: m.strMealThumb ? [m.strMealThumb] : [],
    source_url: m.strSource || `https://www.themealdb.com/meal/${m.idMeal}`,
    rating: null,
  };
}

async function mealdbSearch(query) {
  const data = await fetchJson(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
  return (data.meals || []).map((m) => ({
    source: 'mealdb',
    sourceLabel: 'TheMealDB',
    id: String(m.idMeal),
    title: m.strMeal,
    subtitle: [m.strCategory, m.strArea].filter(Boolean).join(' · '),
    image: m.strMealThumb ? `${m.strMealThumb}/preview` : null,
    minutes: null,
    rating: null,
    votes: 0,
    url: m.strSource || '',
  }));
}

async function mealdbRecipe(id) {
  const data = await fetchJson(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(id)}`);
  const meal = data.meals?.[0];
  if (!meal) throw Object.assign(new Error('Rezept nicht gefunden.'), { status: 404 });
  return mealToRecipe(meal);
}

// ---------- Öffentliche Schnittstelle ----------

/** Sucht parallel in allen Quellen; Fehler einzelner Quellen werden gesammelt, nicht geworfen. */
export async function searchRecipes(query, { offset = 0 } = {}) {
  const errors = [];
  const chefkoch = chefkochSearch(query, offset).catch(async (err) => {
    try {
      return offset ? [] : await chefkochHtmlSearch(query);
    } catch {
      errors.push(`Chefkoch: ${err.message}`);
      return [];
    }
  });
  const mealdb = offset
    ? Promise.resolve([])
    : mealdbSearch(query).catch((err) => {
        errors.push(`TheMealDB: ${err.message}`);
        return [];
      });
  const [a, b] = await Promise.all([chefkoch, mealdb]);
  return { results: [...a, ...b], errors };
}

export async function getExternalRecipe(source, id) {
  if (source === 'chefkoch') return { ...(await chefkochRecipe(id)), source };
  if (source === 'mealdb') return { ...(await mealdbRecipe(id)), source };
  throw Object.assign(new Error('Unbekannte Quelle.'), { status: 400 });
}
