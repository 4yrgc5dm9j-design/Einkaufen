// Prüft, welche Rezeptquellen und CORS-Vermittler aus Sicht der Web-App (github.io) funktionieren.
// Aufruf: node scripts/check-sources.mjs
const ORIGIN = 'https://4yrgc5dm9j-design.github.io';

const PROXIES = {
  direct: (u) => u,
  allorigins_raw: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  allorigins_get: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  codetabs: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  corsproxy_io: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  cors_eu: (u) => `https://cors.eu.org/${u}`,
  jina_html: (u) => `https://r.jina.ai/${u}`,
  whateverorigin: (u) => `https://whateverorigin.org/get?url=${encodeURIComponent(u)}`,
};

async function probe(label, url, headers = {}) {
  const t = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { headers: { Origin: ORIGIN, ...headers }, signal: ctrl.signal });
    const text = await res.text();
    clearTimeout(timer);
    const acao = res.headers.get('access-control-allow-origin');
    const hasLd = /application\/ld\+json/.test(text);
    const hasRecipe = /"@type"\s*:\s*"?\[?"?Recipe/.test(text) || /recipeIngredient/.test(text);
    console.log(
      `${res.ok && acao ? 'OK  ' : 'FAIL'} ${label.padEnd(40)} status=${res.status} cors=${acao} len=${text.length} ld=${hasLd} recipe=${hasRecipe} ${Date.now() - t}ms  ${text.slice(0, 80).replace(/\s+/g, ' ')}`,
    );
    return { ok: res.ok && !!acao, text };
  } catch (err) {
    console.log(`ERR  ${label.padEnd(40)} ${err.name}: ${err.message} ${Date.now() - t}ms`);
    return { ok: false, text: '' };
  }
}

const targets = {
  mealdb: 'https://www.themealdb.com/api/json/v1/1/search.php?s=lasagne',
  ck_api: 'https://api.chefkoch.de/v2/recipes?query=lasagne&limit=3',
  ck_search: 'https://www.chefkoch.de/rs/s0/lasagne/Rezepte.html',
};

console.log('--- direkt & über Vermittler ---');
let ckRecipeUrl = null;
for (const [tname, turl] of Object.entries(targets)) {
  for (const [pname, make] of Object.entries(PROXIES)) {
    const headers = pname === 'jina_html' ? { 'X-Return-Format': 'html' } : {};
    const r = await probe(`${tname} via ${pname}`, make(turl), headers);
    if (!ckRecipeUrl) ckRecipeUrl = (r.text.match(/https:\/\/www\.chefkoch\.de\/rezepte\/\d+\/[^"'\s<>]+\.html/) || [])[0];
  }
}
console.log('Chefkoch-Rezept für Import-Test:', ckRecipeUrl);
const pages = [ckRecipeUrl, 'https://www.lecker.de/lasagne-klassisch-77279.html', 'https://www.allrecipes.com/recipe/23600/worlds-best-lasagna/'].filter(Boolean);
for (const page of pages) {
  for (const [pname, make] of Object.entries(PROXIES)) {
    const headers = pname === 'jina_html' ? { 'X-Return-Format': 'html' } : {};
    await probe(`${new URL(page).hostname} via ${pname}`, make(page), headers);
  }
}
