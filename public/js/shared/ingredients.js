// Gemeinsam von Server und Browser genutzt: Zutaten parsen, skalieren, formatieren, kategorisieren.

const UNICODE_FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅕': 0.2, '⅛': 0.125 };

// Kanonische Einheit -> Schreibweisen (klein geschrieben)
const UNITS = {
  g: ['g', 'gr', 'gr.', 'gramm', 'grams', 'gram'],
  kg: ['kg', 'kilo', 'kilogramm'],
  mg: ['mg'],
  ml: ['ml', 'milliliter'],
  cl: ['cl'],
  dl: ['dl'],
  l: ['l', 'liter', 'ltr', 'ltr.'],
  EL: ['el', 'el.', 'essl.', 'esslöffel', 'tbsp', 'tbs', 'tablespoon', 'tablespoons'],
  TL: ['tl', 'tl.', 'teel.', 'teelöffel', 'tsp', 'teaspoon', 'teaspoons'],
  Msp: ['msp', 'msp.', 'messerspitze', 'messerspitzen'],
  Prise: ['prise', 'prisen', 'pinch'],
  Pck: ['pck', 'pck.', 'päckchen', 'packung', 'packungen', 'pkg', 'pack', 'pckg.'],
  Dose: ['dose', 'dosen', 'can', 'cans'],
  Glas: ['glas', 'gläser'],
  Becher: ['becher'],
  Bund: ['bund', 'bd.', 'bunch'],
  Stück: ['stück', 'stk', 'stk.', 'st.', 'stck'],
  Zehe: ['zehe', 'zehen', 'clove', 'cloves'],
  Scheibe: ['scheibe', 'scheiben', 'slice', 'slices'],
  Tasse: ['tasse', 'tassen', 'cup', 'cups'],
  Handvoll: ['handvoll', 'hand voll', 'handful'],
  Tropfen: ['tropfen'],
  Schuss: ['schuss', 'spritzer'],
  Zweig: ['zweig', 'zweige'],
  Blatt: ['blatt', 'blätter'],
  Würfel: ['würfel'],
  Kopf: ['kopf', 'köpfe'],
  Stange: ['stange', 'stangen'],
  Knolle: ['knolle', 'knollen'],
  Netz: ['netz'],
  Flasche: ['flasche', 'flaschen'],
  oz: ['oz', 'ounce', 'ounces'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
};

const UNIT_LOOKUP = new Map();
for (const [canon, variants] of Object.entries(UNITS)) {
  for (const v of variants) UNIT_LOOKUP.set(v, canon);
  UNIT_LOOKUP.set(canon.toLowerCase(), canon);
}

export const KNOWN_UNITS = Object.keys(UNITS);

function parseNumber(token) {
  if (!token) return null;
  let t = token.trim().replace(',', '.');
  let total = 0;
  for (const [ch, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (t.includes(ch)) {
      total += val;
      t = t.replace(ch, '').trim();
    }
  }
  if (!t) return total || null;
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return total + Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return total + Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? total + n : null;
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*[½⅓⅔¼¾⅕⅛]|\d+(?:[.,]\d+)?|[½⅓⅔¼¾⅕⅛])`;
const LEAD_RE = new RegExp(String.raw`^\s*(${NUM})(?:\s*(?:-|–|bis)\s*(${NUM}))?\s*`, 'i');

/** "200 g Mehl (Type 405)" -> { quantity: 200, unit: 'g', name: 'Mehl', note: 'Type 405' } */
export function parseIngredient(input) {
  let text = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  let quantity = null;
  let unit = '';
  let note = '';

  const lead = text.match(LEAD_RE);
  if (lead) {
    const a = parseNumber(lead[1]);
    const b = parseNumber(lead[2]);
    quantity = b != null ? b : a; // bei Spannen ("1-2") lieber die größere Menge einkaufen
    text = text.slice(lead[0].length);
  }

  // Einheit direkt am Zahlenende ("200g")
  const unitMatch = text.match(/^([A-Za-zÄÖÜäöüß.]+(?:\s+voll)?)(?=\s|$)/);
  if (unitMatch) {
    const canon = UNIT_LOOKUP.get(unitMatch[1].toLowerCase());
    if (canon && (quantity != null || !['l', 'g'].includes(canon))) {
      unit = canon;
      text = text.slice(unitMatch[0].length).trim();
    }
  }

  const paren = text.match(/\(([^)]*)\)/);
  if (paren) {
    note = paren[1].trim();
    text = text.replace(paren[0], ' ').trim();
  }
  const comma = text.indexOf(',');
  if (comma > 0) {
    note = [text.slice(comma + 1).trim(), note].filter(Boolean).join(', ');
    text = text.slice(0, comma).trim();
  }
  const name = text.replace(/\s+/g, ' ').replace(/^(von|of)\s+/i, '').trim();
  return { quantity, unit, name: name || String(input).trim(), note };
}

export function scaleQuantity(quantity, factor) {
  if (quantity == null) return null;
  return quantity * factor;
}

const NICE_FRACTIONS = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

export function formatQuantity(q) {
  if (q == null || !Number.isFinite(q)) return '';
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q);
  const rest = q - whole;
  if (rest < 0.05) return String(whole);
  for (const [val, sym] of NICE_FRACTIONS) {
    if (Math.abs(rest - val) < 0.04) return whole ? `${whole}${sym}` : sym;
  }
  return String(Math.round(q * 10) / 10).replace('.', ',');
}

const PLURAL_UNITS = {
  Zehe: 'Zehen', Stange: 'Stangen', Dose: 'Dosen', Scheibe: 'Scheiben', Tasse: 'Tassen', Knolle: 'Knollen',
  Flasche: 'Flaschen', Zweig: 'Zweige', Kopf: 'Köpfe', Prise: 'Prisen', Glas: 'Gläser', Blatt: 'Blätter',
};

export function unitLabel(unit, quantity) {
  return quantity != null && quantity > 1 && PLURAL_UNITS[unit] ? PLURAL_UNITS[unit] : unit || '';
}

export function formatIngredient(ing, factor = 1) {
  const scaled = scaleQuantity(ing.quantity, factor);
  return [formatQuantity(scaled), unitLabel(ing.unit, scaled), ing.name].filter(Boolean).join(' ') + (ing.note ? ` (${ing.note})` : '');
}

export const CATEGORIES = [
  { name: 'Obst & Gemüse', icon: '🥦' },
  { name: 'Brot & Backwaren', icon: '🥖' },
  { name: 'Milch & Eier', icon: '🧀' },
  { name: 'Fleisch & Fisch', icon: '🥩' },
  { name: 'Tiefkühl', icon: '🧊' },
  { name: 'Vorrat', icon: '🥫' },
  { name: 'Gewürze & Öle', icon: '🧂' },
  { name: 'Süßes & Snacks', icon: '🍫' },
  { name: 'Getränke', icon: '🥤' },
  { name: 'Drogerie & Haushalt', icon: '🧴' },
  { name: 'Sonstiges', icon: '🛍️' },
];

const CATEGORY_KEYWORDS = {
  'Tiefkühl': ['tiefkühl', 'tk-', 'speiseeis', 'eiscreme', 'pommes', 'fischstäbchen', 'tiefgefroren', 'frozen'],
  'Gewürze & Öle': ['salz', 'pfeffer', 'paprikapulver', 'curry', 'zimt', 'muskat', 'oregano', 'thymian', 'rosmarin', 'basilikum getrocknet', 'kreuzkümmel', 'kümmel', 'chili', 'öl', 'olivenöl', 'rapsöl', 'sonnenblumenöl', 'sesamöl', 'essig', 'balsamico', 'senf', 'ketchup', 'mayonnaise', 'sojasauce', 'sojasoße', 'brühe', 'fond', 'gewürz', 'vanille', 'lorbeer', 'kurkuma', 'ingwerpulver', 'majoran', 'honig', 'sirup', 'oil', 'salt', 'pepper', 'vinegar', 'stock', 'bouillon'],
  'Obst & Gemüse': ['apfel', 'äpfel', 'banane', 'birne', 'zitrone', 'limette', 'orange', 'mandarine', 'traube', 'beere', 'erdbeer', 'himbeer', 'heidelbeer', 'kirsch', 'pfirsich', 'mango', 'ananas', 'melone', 'kiwi', 'avocado', 'tomate', 'gurke', 'paprika', 'zwiebel', 'knoblauch', 'kartoffel', 'möhre', 'karotte', 'salat', 'spinat', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'pilz', 'champignon', 'lauch', 'porree', 'sellerie', 'kohl', 'rucola', 'petersilie', 'schnittlauch', 'basilikum', 'koriander', 'dill', 'minze', 'ingwer', 'frühlingszwiebel', 'lauchzwiebel', 'radieschen', 'rote bete', 'kürbis', 'süßkartoffel', 'mais', 'erbsen', 'bohnen', 'fenchel', 'spargel', 'schalotte', 'obst', 'gemüse', 'kräuter', 'onion', 'garlic', 'tomato', 'potato', 'carrot', 'lemon', 'lime', 'pepper', 'mushroom', 'spinach', 'parsley'],
  'Brot & Backwaren': ['brot', 'brötchen', 'toast', 'baguette', 'croissant', 'brezel', 'laugen', 'wrap', 'tortilla', 'fladenbrot', 'ciabatta', 'semmel', 'kuchen', 'blätterteig', 'pizzateig', 'bread'],
  'Milch & Eier': ['milch', 'sahne', 'schmand', 'quark', 'joghurt', 'jogurt', 'butter', 'käse', 'mozzarella', 'parmesan', 'feta', 'gouda', 'frischkäse', 'mascarpone', 'ricotta', 'crème fraîche', 'creme fraiche', 'ei', 'eier', 'margarine', 'buttermilch', 'skyr', 'milk', 'cream', 'cheese', 'egg', 'eggs'],
  'Fleisch & Fisch': ['fleisch', 'hähnchen', 'huhn', 'hühnchen', 'pute', 'rind', 'schwein', 'hack', 'speck', 'schinken', 'wurst', 'salami', 'bacon', 'lachs', 'thunfisch', 'fisch', 'garnele', 'shrimp', 'filet', 'steak', 'schnitzel', 'lamm', 'chicken', 'beef', 'pork', 'salmon', 'fish'],
  'Vorrat': ['mehl', 'zucker', 'nudel', 'pasta', 'spaghetti', 'penne', 'reis', 'couscous', 'bulgur', 'quinoa', 'linsen', 'kichererbsen', 'haferflocken', 'müsli', 'backpulver', 'hefe', 'natron', 'stärke', 'passierte', 'tomatenmark', 'dose', 'konserve', 'kokosmilch', 'nüsse', 'mandeln', 'walnüsse', 'rosinen', 'semmelbrösel', 'paniermehl', 'lasagneplatten', 'marmelade', 'nutella', 'erdnussbutter', 'flour', 'sugar', 'rice', 'noodles'],
  'Süßes & Snacks': ['schokolade', 'chips', 'kekse', 'gummibär', 'bonbon', 'süßigkeit', 'riegel', 'popcorn', 'cracker', 'salzstangen', 'chocolate'],
  'Getränke': ['wasser', 'saft', 'cola', 'limo', 'bier', 'wein', 'sekt', 'kaffee', 'tee', 'sprudel', 'mineralwasser', 'smoothie', 'juice', 'wine', 'beer'],
  'Drogerie & Haushalt': ['shampoo', 'duschgel', 'seife', 'zahnpasta', 'zahnbürste', 'deo', 'klopapier', 'toilettenpapier', 'küchenrolle', 'taschentücher', 'spülmittel', 'waschmittel', 'müllbeutel', 'schwamm', 'putzmittel', 'reiniger', 'creme', 'rasier', 'windeln', 'alufolie', 'frischhaltefolie', 'backpapier', 'batterie', 'glühbirne', 'tabs'],
};

export function guessCategory(name) {
  const n = ` ${String(name || '').toLowerCase()} `;
  // Der längste Treffer gewinnt ("Tomatenmark" -> Vorrat statt "Tomate" -> Gemüse).
  // Sehr kurze Begriffe (z.B. "ei") zählen nur als ganzes Wort.
  let best = 'Sonstiges';
  let bestLen = 0;
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const w of words) {
      if (w.length <= bestLen) continue;
      const hit = w.length <= 3 ? new RegExp(`[\\s(-]${w}[\\s),]`).test(n) : n.includes(w);
      if (hit) {
        best = category;
        bestLen = w.length;
      }
    }
  }
  return best;
}

export function categoryIcon(name) {
  return CATEGORIES.find((c) => c.name === name)?.icon || '🛍️';
}
