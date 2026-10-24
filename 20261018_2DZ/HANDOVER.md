# Handover-Prompt — Rotland (2D-Zombie-Survival, Terraria-artig)

Kopiere alles unterhalb der Linie als ersten Prompt in eine neue Session.

---

Du übernimmst das Projekt **Rotland** (Terraria-artiges 2D-Zombie-Survival im Browser, Vite + TypeScript
+ Canvas 2D, keine Runtime-Dependencies) in
`D:\OneDrive\Documents\GitHub\noahmasterball.github.io\20261018_2DZ`.

**Stand 2026-10-18:** M0 + M1 + Integrationsrunde fertig, `npm run check` grün, veröffentlicht unter
https://noahmasterball.github.io/20261018_2DZ/play/ (Commit `f94e329`). Offene Punkte:
`docs/PROJECT_STATE.md` (oberster Eintrag).

## Zuerst lesen
1. `CLAUDE.md` (Projektregeln) + Root-`../CLAUDE.md` (SSOT)
2. `docs/ARCHITECTURE.md` (Sim/Render-Grenze, Systemreihenfolge, **Modul-Eigentum §5**)
3. `docs/SPEC.md` (Spieldesign), `docs/ROADMAP.md`, `docs/PROJECT_STATE.md`
4. `src/data/schema.ts`, `src/sim/state.ts`, `src/config/sim.ts`

## Arbeitsweise (vom User ausdrücklich gewünscht)
- **Viele Subagents, parallel.** Hauptkontext klein halten. Jeder Agent bekommt einen eigenständigen
  Auftrag mit Dateigrenzen (ARCHITECTURE §5), Projektregeln, Verifikation, kurzer Rückmeldung.
  Parallele Agents nie dieselben Dateien bearbeiten lassen.
- Nur **ein** Agent gleichzeitig darf `npm run build` / `test:e2e` / `check` / `deploy` ausführen.
- npm aus dem Pfad mit großem `D:\` starten.
- Bei ~50 % Kontext: Checkpoint, `docs/PROJECT_STATE.md` + diesen `HANDOVER.md` aktualisieren.
- Antworten an den User: **Deutsch, kurz, Bullets, kein Blabla**.
- Keine Edits per Python (CRLF). Edit-Tool oder Node. OneDrive: Read-Tool kann veraltete Stände
  liefern → mit `cat` prüfen.
- **Veröffentlichen:** sobald spielbar und `npm run check` grün: `npm run deploy`, dann **nur**
  `20261018_2DZ/play/` committen und nach `main` pushen →
  https://noahmasterball.github.io/20261018_2DZ/play/. Quellen nur committen, wenn der User es will.

## Als Nächstes
1. User-Playtest-Feedback einarbeiten.
2. Offene Punkte aus PROJECT_STATE (Stadt-Beton als natural, Zombie-Limit oben/unten, Türsäulen
   bei Zombie-Abbau/Drops, Sand vs. Körper) per parallelen Fix-Agents.
3. M2 (ROADMAP): Balancing, Basisbau-Extras (Leitern, Plattformen, Fallen), Speichern/Laden,
   Horden-Nächte.
4. Nach jeder spielbaren grünen Runde: deploy + nur `play/` pushen.

## Offene User-Fragen (Defaults aktiv, Liste in PROJECT_STATE)
Name „Rotland“; Inventar-Drop beim Tod; Wasser ohne Druck; Zombie-Blockbrechen nur bei endlichem
`zombieHealth`; Spawn in der Ebene.
