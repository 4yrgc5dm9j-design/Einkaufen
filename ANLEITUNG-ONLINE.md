# Alltag aufs Handy holen 📱

## Kostenlos als Web-App (wie das Haushaltsbuch) – empfohlen

GitHub baut die App bei jeder Änderung automatisch und stellt sie kostenlos online (`.github/workflows/pages.yml`).
Alle Daten bleiben **auf eurem jeweiligen Handy** – es gibt keinen Server und keine Kosten.

**Einmalig einrichten (auf github.com, am Computer oder im Handy-Browser):**
1. Im Repository **Settings → Pages**: Bei „Source“ **GitHub Actions** auswählen.
2. **Actions → „Web-App veröffentlichen“ → Run workflow** klicken (oder auf die nächste Änderung warten).
   Nach ca. 2 Minuten ist die App online unter:
   **https://4yrgc5dm9j-design.github.io/Einkaufen/**

**Auf das iPhone:**
1. Die Adresse oben in **Safari** öffnen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen.
3. **„Zum Home-Bildschirm“** wählen und auf **Hinzufügen** tippen.
4. Die App über das neue Icon „Alltag“ öffnen und dein Konto anlegen.

**Android:** Adresse in Chrome öffnen → Menü (⋮) → „App installieren“.

**Zusammen mit deiner Freundin:** Jede Person installiert die App auf ihrem eigenen Handy und legt dort ihr Konto an.
Zum Abgleichen: **Einstellungen → Mit Partner abgleichen**
1. „Daten senden“ tippen und die Datei per WhatsApp/AirDrop schicken.
2. Die andere Person tippt „Daten empfangen“ und wählt die Datei.
3. Danach umgekehrt. Ab dann habt ihr denselben Stand – Einkaufsliste, Kalender, Rezepte, Essensplan und Erinnerungen.
   Private Termine bleiben beim anderen unsichtbar. Alternativ geht es auch mit „Code kopieren/einfügen“ (ohne Fotos).

**Gut zu wissen in der Web-App-Version:**
- Erinnerungen melden sich, solange die App geöffnet ist. Für zuverlässige Wecker: im Termin auf das Kalender-Symbol tippen
  (oder *Einstellungen → Alle Termine in Handy-Kalender*) – dann steht der Termin mit Erinnerung im iPhone-Kalender.
- Die Rezeptsuche im Internet läuft über öffentliche Vermittlungsdienste und kann manchmal nicht erreichbar sein.
  Eigene Rezepte und der Import per Link funktionieren dann trotzdem bzw. später wieder.
- Die „Daten senden“-Datei ist gleichzeitig eure Sicherung.

---

## Optional: mit eigenem Server (gemeinsame Daten in Echtzeit, Push-Nachrichten)

Wer Echtzeit-Abgleich ohne Datei-Austausch und Push-Benachrichtigungen auch bei geschlossener App möchte,
kann die Server-Version betreiben (kostet ca. 5–7 $ im Monat):

Damit du und deine Freundin die App auf dem Handy nutzen könnt, muss sie dauerhaft im Internet laufen.
Am einfachsten geht das mit **Render** (ca. 7 $ im Monat inkl. dauerhaftem Speicher) oder **Railway** (ab ca. 5 $ im Monat).
Beide verbinden sich direkt mit diesem GitHub-Repository – du musst nichts programmieren.

> Wichtig: Die App speichert eure Daten in einer Datenbank-Datei. Deshalb braucht sie einen **dauerhaften Speicher (Disk/Volume)** –
> kostenlose Angebote ohne Speicher würden eure Daten bei jedem Neustart löschen.

---

### Variante A: Render (empfohlen, fast alles automatisch)

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

### Variante B: Railway

1. Gehe auf **https://railway.app** und melde dich mit **GitHub** an.
2. **„New Project“ → „Deploy from GitHub repo“** → Repository **Einkaufen** wählen.
3. Im Dienst auf **„Settings“ → „Networking“ → „Generate Domain“** klicken – das ist eure Adresse.
4. Rechtsklick auf den Dienst → **„Attach Volume“**, Mount-Pfad: **`/app/data`**.
5. Unter **„Variables“** hinzufügen:
   - `TZ` = `Europe/Berlin`
   - `TRUST_PROXY` = `1`
   - `REGISTRATION_CODE` = ein Code eurer Wahl, z. B. `UnserHaushalt2026`

---

