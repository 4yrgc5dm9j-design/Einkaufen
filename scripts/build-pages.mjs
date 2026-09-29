// Baut die reine Web-App für GitHub Pages: alle Daten im Browser, kein Server nötig.
// Aufruf: node scripts/build-pages.mjs  → Ergebnis in dist/
import { cpSync, rmSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });

writeFileSync(
  'dist/js/config.js',
  "// Automatisch erzeugt von scripts/build-pages.mjs\nexport const MODE = 'local';\n",
);

// Neuer Cache-Name je Build, damit Handys Updates sofort bekommen
const sw = readFileSync('dist/sw.js', 'utf8').replace(/const CACHE = '[^']+';/, `const CACHE = 'alltag-${Date.now()}';`);
writeFileSync('dist/sw.js', sw);

// Unbekannte Pfade auf GitHub Pages landen ebenfalls in der App
copyFileSync('dist/index.html', 'dist/404.html');
writeFileSync('dist/.nojekyll', '');
console.log('Web-App fertig in dist/');
