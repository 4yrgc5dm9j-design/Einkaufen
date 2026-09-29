import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonLdBlocks, recipeFromJsonLd, parseDuration } from '../server/lib/recipeSources.js';

const HTML = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
{"@type":"Recipe","name":"Omas Apfelkuchen &amp; Streusel","description":"<p>Saftig</p>","recipeYield":"12 Stücke",
"prepTime":"PT30M","cookTime":"PT1H","image":[{"@type":"ImageObject","url":"https://example.com/kuchen.jpg"}],
"recipeIngredient":["250 g Mehl","125 g Butter","3 Äpfel","1 Prise Salz"],
"recipeInstructions":[{"@type":"HowToSection","name":"Teig","itemListElement":[{"@type":"HowToStep","text":"Mehl und Butter verkneten."}]},{"@type":"HowToStep","text":"Äpfel schälen."}],
"recipeCategory":"Kuchen","keywords":"Backen, Herbst","aggregateRating":{"ratingValue":"4.6"}}]}</script>
</head><body></body></html>`;

test('schema.org-Rezept wird aus HTML gelesen', () => {
  const blocks = extractJsonLdBlocks(HTML);
  const node = blocks[0]['@graph'][1];
  const r = recipeFromJsonLd(node, 'https://example.com/kuchen');
  assert.equal(r.title, 'Omas Apfelkuchen & Streusel');
  assert.equal(r.description, 'Saftig');
  assert.equal(r.servings, 12);
  assert.equal(r.prep_minutes, 30);
  assert.equal(r.cook_minutes, 60);
  assert.deepEqual(r.images, ['https://example.com/kuchen.jpg']);
  assert.equal(r.ingredients.length, 4);
  assert.deepEqual(r.ingredients[1], { quantity: 125, unit: 'g', name: 'Butter', note: '' });
  assert.deepEqual(r.steps, ['Mehl und Butter verkneten.', 'Äpfel schälen.']);
  assert.deepEqual(r.tags, ['Kuchen', 'Backen', 'Herbst']);
  assert.equal(r.rating, 4.6);
});

test('ISO-Dauern', () => {
  assert.equal(parseDuration('PT1H30M'), 90);
  assert.equal(parseDuration('P0DT0H45M'), 45);
  assert.equal(parseDuration(20), 20);
  assert.equal(parseDuration(null), null);
});
