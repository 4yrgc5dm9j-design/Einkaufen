// Prüft die Rezeptfunktionen der Web-App (public/js/local/web.js) gegen das echte Internet.
// Aufruf: node scripts/check-web-app.mjs   (Beendet sich mit Fehlercode, wenn etwas nicht klappt.)
import { searchRecipes, getExternalRecipe, importFromUrl } from '../public/js/local/web.js';

let failed = false;
const check = async (label, fn) => {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`OK   ${label} (${Date.now() - t} ms): ${out}`);
  } catch (err) {
    failed = true;
    console.log(`FAIL ${label} (${Date.now() - t} ms): ${err.message}`);
  }
};

let first;
for (const q of ['Lasagne', 'Nudelauflauf', 'Linsencurry']) {
  await check(`Suche „${q}“`, async () => {
    const { results, errors } = await searchRecipes(q);
    const ck = results.filter((r) => r.source === 'chefkoch');
    if (!ck.length) throw new Error(`keine Chefkoch-Treffer (${errors.join('; ')})`);
    first ??= ck[0];
    return `${ck.length} Chefkoch + ${results.length - ck.length} TheMealDB, z. B. „${ck[0].title}“ Bild=${!!ck[0].image}`;
  });
}
await check('Chefkoch-Rezept öffnen', async () => {
  const r = await getExternalRecipe('chefkoch', first.id);
  if (r.ingredients.length < 2 || !r.steps.length) throw new Error('Zutaten/Schritte fehlen');
  return `„${r.title}“ ${r.ingredients.length} Zutaten, ${r.steps.length} Schritte, z. B. ${JSON.stringify(r.ingredients[0])}`;
});
await check('TheMealDB-Rezept öffnen', async () => {
  const r = await getExternalRecipe('mealdb', '52844');
  return `„${r.title}“ ${r.ingredients.length} Zutaten`;
});
for (const url of [
  'https://www.chefkoch.de/rezepte/745721177147257/Lasagne.html',
  'https://www.lecker.de/lasagne-klassisch-77279.html',
  'https://www.eatsmarter.de/rezepte/spaghetti-bolognese',
]) {
  await check(`Import ${new URL(url).hostname}`, async () => {
    const r = await importFromUrl(url);
    if (r.ingredients.length < 2) throw new Error('keine Zutaten erkannt');
    return `„${r.title}“ ${r.ingredients.length} Zutaten, ${r.steps.length} Schritte, Bild=${!!r.images[0]}`;
  });
}
process.exit(failed ? 1 : 0);
