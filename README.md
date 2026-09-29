# Alltag 🏡

Eine moderne Web-App (installierbar als App auf dem Handy) für den gemeinsamen Haushalt:

- **🛒 Einkaufsliste** – mehrere Listen, Mengen werden erkannt („500 g Hackfleisch“), automatische Sortierung nach Supermarkt-Kategorien, Vorschläge für häufig Gekauftes, gleiche Artikel werden zusammengezählt, Live-Abgleich zwischen allen im Haushalt.
- **👩‍🍳 Rezepte** – eigene Rezepte mit mehreren Fotos, Zutaten, Schritten und Tags; Portionsrechner; Favoriten; Kochmodus (Bildschirm bleibt an); Zutaten mit einem Tipp auf die Einkaufsliste.
- **🌍 Rezepte aus dem Internet** – Suche direkt in der App (Chefkoch + TheMealDB) und Import per Link von fast jeder Rezeptseite (Chefkoch, Lecker, Eat Smarter, Foodblogs … alles mit schema.org-Rezeptdaten). Bilder werden lokal gespeichert.
- **🍽️ Essensplan** – Wochenplan (Frühstück/Mittag/Abend/Snack), „Wocheneinkauf“ setzt alle Zutaten der Woche auf die Liste.
- **📅 Gemeinsamer Kalender** – Monats-, Wochen-, Tages- und Listenansicht mit Uhrzeiten, jede Person hat ihre eigene Farbe (Termine können auch eigene Farben haben), private Termine, Serientermine (täglich, werktags, wöchentlich, 14-tägig, monatlich, jährlich), Personen-Filter, Suche, Wischen zum Blättern.
- **🎉 Feiertage** – alle gesetzlichen Feiertage je Bundesland plus besondere Tage (Muttertag, Advent, Zeitumstellung …).
- **⏰ Erinnerungen** – Aufgaben mit Datum/Uhrzeit, Priorität, Zuständigkeit und Wiederholung; Schnelleingabe versteht „Müll rausbringen morgen 19 Uhr“ oder „Oma anrufen Freitag“.
- **🔔 Push-Benachrichtigungen** – für fällige Erinnerungen und Termine (auch wenn die App geschlossen ist).
- **👥 Konten & Haushalt** – jede Person hat ein eigenes Konto. Über *Einstellungen → Person einladen* lädt man jemanden per E-Mail ein; erst wenn die Person die Einladung annimmt, teilt ihr Kalender, Listen, Rezepte, Essensplan und Erinnerungen.
- **🌗 Hell/Dunkel**, mobil optimiert (Tab-Leiste unten), Desktop mit Seitenleiste, offline startfähig (PWA).

## Schnellstart (lokal)

Voraussetzung: [Node.js](https://nodejs.org) **22.13 oder neuer**.

```bash
npm install
npm start
```

Dann <http://localhost:3000> öffnen, Konto anlegen – fertig. Die Daten liegen in `data/` (SQLite-Datenbank + hochgeladene Bilder).

Tests: `npm test`

👉 **Schritt-für-Schritt-Anleitung zum Online-Stellen und Installieren aufs Handy: [ANLEITUNG-ONLINE.md](ANLEITUNG-ONLINE.md)**

## Öffentlich betreiben

Damit ihr die App beide auf dem Handy nutzen könnt, muss sie auf einem Server mit **HTTPS** laufen (Push-Benachrichtigungen und „Zum Home-Bildschirm“ funktionieren nur mit HTTPS).

### Mit Docker

```bash
REGISTRATION_CODE=geheim123 docker compose up -d --build
```

Davor einen Reverse-Proxy mit HTTPS setzen, z. B. [Caddy](https://caddyserver.com) – die komplette `Caddyfile`:

```
alltag.deine-domain.de {
  reverse_proxy localhost:3000
}
```

Alternativ funktioniert jeder Anbieter, der Node.js oder Docker ausführen kann und ein dauerhaftes Laufwerk für `data/` bietet (z. B. Fly.io, Railway, Render, ein kleiner VPS).

### Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `PORT` | Port des Servers | `3000` |
| `DATA_DIR` | Ordner für Datenbank und Bilder | `./data` |
| `TZ` | Zeitzone für Erinnerungen | `Europe/Berlin` |
| `TRUST_PROXY` | `1`, wenn ein HTTPS-Proxy davor sitzt (sichere Cookies) | – |
| `REGISTRATION_CODE` | Wenn gesetzt, kann sich nur registrieren, wer den Code kennt – **für öffentliche Server empfohlen** | – |
| `VAPID_CONTACT` | Kontakt für Push-Dienste (`mailto:…`) | `mailto:admin@example.com` |

Die Schlüssel für Push-Benachrichtigungen werden beim ersten Start automatisch erzeugt und in der Datenbank gespeichert.

### Backup

Einfach den Ordner `data/` sichern.

## Auf dem Handy installieren

- **iPhone (Safari):** Teilen → „Zum Home-Bildschirm“. Danach in der App unter *Einstellungen* die Benachrichtigungen einschalten (ab iOS 16.4).
- **Android (Chrome):** Menü → „App installieren“.

## Technik

- Server: Node.js, Express, eingebaute SQLite-Datenbank (`node:sqlite`), keine weiteren Dienste nötig
- Oberfläche: ohne Build-Schritt, reines modernes JavaScript/CSS
- Sicherheit: Passwörter mit scrypt, HttpOnly-Session-Cookies, Rate-Limits beim Login, strikte Content-Security-Policy, Schutz vor Anfragen ins interne Netz beim Rezept-Import, Daten strikt pro Haushalt getrennt

```
server/            API, Datenbank, Push-Scheduler, Rezept-Import
public/            App (HTML, CSS, JS, Service Worker)
public/js/shared/  Logik für Browser und Server (Zutaten, Serientermine, Feiertage)
test/              Tests (npm test)
```
