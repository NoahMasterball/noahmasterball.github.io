# Handover-Prompt — Counterweight (M2: Abilities + Relay gebaut → veröffentlichen, R4, Net-Spike)

Kopiere alles unterhalb der Linie als ersten Prompt in eine neue Session.

---

Du übernimmst das Projekt **Counterweight** (originaler operator-basierter Taktik-FPS, Browser,
Vite + TS + Three.js + Rapier) in
`D:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260927_FPV`.
**Stand 2026-09-30:** M1 gebaut (Playtest durch den User offen). M2: Ability-Framework komplett
(ADR-0012, accepted), Relay-Modus R1–R3 gebaut (ADR-0013 §12–§14), Net-Spike entworfen
(ADR-0014, proposed). Web-Version veröffentlicht (Commit `f5da71b`, nur `play/`):
https://noahmasterball.github.io/20260927_FPV/play/

## Arbeitsweise (vom User ausdrücklich gewünscht)

- **Viele Subagents, parallel.** Hauptkontext klein halten; Subagents bekommen einen
  eigenständigen Auftrag (Dateigrenzen, Projektregeln, Verifikation, kurze Rückmeldung). Parallele
  Agents nie dieselben Dateien bearbeiten lassen.
- Nur **ein** Agent gleichzeitig darf `npm run build` / `test:e2e` / `check` / `shots` / `deploy`
  laufen lassen.
- npm aus dem Pfad mit großem `D:\` starten.
- Bei ~50 % Kontext: Checkpoint + neuer `HANDOVER.md`.
- Antworten an den User: **Deutsch, kurz, Bullets, kein Blabla**.
- Keine Edits per Python (CRLF). Edit-Tool oder Node. OneDrive: Read-Tool kann veraltete Stände
  liefern → mit `cat` prüfen.
- **Veröffentlichen (User, 2026-09-30):** sobald das Spiel spielbar und `check` grün ist:
  `npm run deploy` (check + Build nach `play/`), dann **nur** `20260927_FPV/play/` committen und
  nach `main` pushen → https://noahmasterball.github.io/20260927_FPV/play/. Sonst nichts
  committen (keine Quellen, keine fremden Dateien wie die Geburtstags-.docx), außer der User
  verlangt es.
- Zuerst lesen: `CLAUDE.md`, `docs/PROJECT_STATE.md` (oberster Eintrag), ADR-0012 §16–§17,
  ADR-0013 §12–§14, ADR-0014.

## Hinweis

Einmal konnte die Maschine für einige Minuten keine Prozesse starten (Bash/PowerShell/ripgrep
Exit 107/66 ohne Ausgabe, auch `echo`); es erholte sich von selbst. Falls es wieder passiert:
Stand in Dateien sichern, kurz warten, erneut versuchen.

## Als Nächstes

- **R4 (Koordinator):** Relay als Standardmodus (User-Default: ja, sobald DoD erfüllt),
  `smoke.spec.ts` anpassen, SPEC §4.1 verlinkt `RELAY`, ARCHITECTURE/ROADMAP für Relay, ADR-0013
  → accepted, Doku-Nachträge.
- **Net-Spike (ADR-0014):** N1 (Determinismus + Snapshots; Spread-RNG pro Charakter ändert
  Seed-Ergebnisse — Bot-Messungen danach neu erheben) → N2 → N3 → N4 → N5.
- Follow-ups: `graph.nearest` kann Bots an Knoten hinter Wänden schnappen (oberer Korridor
  West); Uplink-Uhr entscheidet selten (2/81 Plants); visuelle Punkte (dünner Sonar-Ring,
  Wand-Node-Ringe, Feuerzone nicht als Feuer erkennbar, Dummy-Lebensbalken durch Wände).

## Offene User-Fragen (Defaults aktiv, Liste in PROJECT_STATE)

Range mit allen 14 Operatoren; `maxActive` → ablehnen; Gadget-Sichtbarkeit; Werfen per
Tastendruck; Pick-Limit 2/Team; nach Plant müssen Verteidiger entschärfen; Relay wird Standard;
Plant 4 s / Disrupt 6 s; Net-Spike-Defaults; M1-Defaults (Mutual Wipe → Verteidiger usw.).

## Session-Ende

`npm run docs:gen` → `npm run check` → `npm run balance` → bei sichtbaren Änderungen
`npm run shots` und PNGs ansehen → `npm run deploy` + nur `play/` pushen → datierter Eintrag in
`docs/PROJECT_STATE.md` → neuer `HANDOVER.md`. Kurzer Bericht an den User (Deutsch, Bullets).
