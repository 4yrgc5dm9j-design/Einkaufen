// Betriebsart der App:
//  'server' – mit eigenem Node-Server (gemeinsame Konten, Push, Rezeptimport über den Server)
//  'local'  – reine Web-App (z. B. GitHub Pages): alle Daten auf dem Gerät, Abgleich per Datei/Code
// Der Build für GitHub Pages (scripts/build-pages.mjs) setzt hier 'local'.
export const MODE = 'server';
