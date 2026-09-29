# Alltag online stellen und aufs Handy holen 📱

Damit du und deine Freundin die App auf dem Handy nutzen könnt, muss sie dauerhaft im Internet laufen.
Am einfachsten geht das mit **Render** (ca. 7 $ im Monat inkl. dauerhaftem Speicher) oder **Railway** (ab ca. 5 $ im Monat).
Beide verbinden sich direkt mit diesem GitHub-Repository – du musst nichts programmieren.

> Wichtig: Die App speichert eure Daten in einer Datenbank-Datei. Deshalb braucht sie einen **dauerhaften Speicher (Disk/Volume)** –
> kostenlose Angebote ohne Speicher würden eure Daten bei jedem Neustart löschen.

---

## Variante A: Render (empfohlen, fast alles automatisch)

1. Stelle sicher, dass der Code auf dem Haupt-Branch (`main`) liegt (den Pull Request mergen).
2. Gehe auf **https://render.com** und melde dich mit deinem **GitHub-Konto** an.
3. Klicke oben auf **„New +“ → „Blueprint“**.
4. Wähle das Repository **Einkaufen** aus. Render erkennt die Datei `render.yaml` automatisch.
5. Klicke auf **„Apply“**. Render baut die App (dauert ein paar Minuten) und legt den Speicher an.
6. Danach bekommst du eine Adresse wie **`https://alltag-xxxx.onrender.com`** – das ist eure App! 🎉

**Registrierungscode:** Damit sich keine Fremden anmelden, wurde automatisch ein Code erzeugt.
Du findest ihn bei Render unter deinem Dienst → **„Environment“** → `REGISTRATION_CODE`.
Diesen Code gibst du beim Registrieren ein (du und deine Freundin). Du kannst ihn dort auch in etwas Merkbares ändern.

---

## Variante B: Railway

1. Gehe auf **https://railway.app** und melde dich mit **GitHub** an.
2. **„New Project“ → „Deploy from GitHub repo“** → Repository **Einkaufen** wählen.
3. Im Dienst auf **„Settings“ → „Networking“ → „Generate Domain“** klicken – das ist eure Adresse.
4. Rechtsklick auf den Dienst → **„Attach Volume“**, Mount-Pfad: **`/app/data`**.
5. Unter **„Variables“** hinzufügen:
   - `TZ` = `Europe/Berlin`
   - `TRUST_PROXY` = `1`
   - `REGISTRATION_CODE` = ein Code eurer Wahl, z. B. `UnserHaushalt2026`

---

## Auf den Home-Bildschirm holen

**iPhone (Safari – muss Safari sein):**
1. Eure App-Adresse in Safari öffnen.
2. Unten auf das **Teilen-Symbol** (Quadrat mit Pfeil nach oben) tippen.
3. **„Zum Home-Bildschirm“** wählen → „Hinzufügen“.
4. Die App vom Home-Bildschirm aus öffnen, anmelden und unter **Einstellungen → Benachrichtigungen** einschalten.

**Android (Chrome):**
1. Adresse in Chrome öffnen.
2. Menü (⋮) → **„App installieren“** bzw. „Zum Startbildschirm hinzufügen“.

Die App öffnet sich dann wie eine normale App – ohne Browser-Leiste, mit eigenem Symbol.

---

## Zusammen nutzen

1. Beide registrieren sich (jeweils eigenes Konto, mit dem Registrierungscode).
2. Einer geht auf **Einstellungen → Person einladen** und gibt die E-Mail des anderen ein.
3. Der andere öffnet **Einstellungen** und tippt auf **„Beitreten“** – fertig, ab jetzt teilt ihr Kalender, Einkaufslisten, Rezepte und Erinnerungen.
