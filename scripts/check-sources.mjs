// Prüft, welche Rezeptquellen und CORS-Vermittler aus Sicht der Web-App (github.io) funktionieren.
// Aufruf: node scripts/check-sources.mjs
const ORIGIN = 'https://4yrgc5dm9j-design.github.io';

async function show(label, res, text) {
  console.log(`${label.padEnd(44)} status=${res.status} acao=${res.headers.get('access-control-allow-origin')} acah=${res.headers.get('access-control-allow-headers')} acam=${res.headers.get('access-control-allow-methods')} len=${text.length} ld=${/ld\+json/.test(text)} recipe=${/recipeIngredient/.test(text)} :: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
}

async function get(label, url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN, ...headers }, signal: AbortSignal.timeout(20000) });
    await show(label, res, await res.text());
  } catch (err) {
    console.log(`${label.padEnd(44)} ERR ${err.message}`);
  }
}

async function preflight(label, url, reqHeaders) {
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': reqHeaders },
      signal: AbortSignal.timeout(20000),
    });
    await show(`PREFLIGHT ${label}`, res, await res.text());
  } catch (err) {
    console.log(`PREFLIGHT ${label} ERR ${err.message}`);
  }
}

const J = 'https://r.jina.ai/';
const api = 'https://api.chefkoch.de/v2/recipes?query=lasagne&limit=3';
const recipe = 'https://www.chefkoch.de/rezepte/745721177147257/Lasagne.html';
await preflight('jina x-return-format', J + recipe, 'x-return-format');
await preflight('jina x-return-format,x-no-cache', J + recipe, 'x-return-format,x-no-cache');
await get('jina api html', J + api, { 'X-Return-Format': 'html' });
await get('jina api text', J + api, { 'X-Return-Format': 'text' });
await get('jina api default', J + api);
await get('jina recipe default (markdown)', J + recipe);
await get('jina search chefkoch html', J + 'https://www.chefkoch.de/rs/s0/nudelauflauf/Rezepte.html', { 'X-Return-Format': 'html' });
for (let i = 0; i < 3; i++) await get(`allorigins raw api #${i}`, `https://api.allorigins.win/raw?url=${encodeURIComponent(api)}`);
for (let i = 0; i < 3; i++) await get(`jina recipe html #${i}`, J + recipe, { 'X-Return-Format': 'html' });
await get('jina api detail', J + 'https://api.chefkoch.de/v2/recipes/745721177147257', { 'X-Return-Format': 'html' });
