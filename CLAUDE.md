# Claude Code Anweisungen

## SSOT-Prinzip (Single Source of Truth)

Jede Information, Konfiguration, Konstante oder Logik darf nur **an genau einer Stelle** definiert sein. Alle anderen Stellen verweisen auf diese eine Quelle.

### Regeln

1. **Keine Duplikation von Werten**: Konstanten, Konfigurationswerte und Magic Numbers werden einmal zentral definiert und von dort referenziert. Niemals denselben Wert an mehreren Stellen hardcoden.

2. **Keine Duplikation von Logik**: Wenn eine Berechnung oder ein Algorithmus an mehr als einer Stelle gebraucht wird, muss sie in eine gemeinsame Funktion/Modul extrahiert werden.

3. **Daten haben genau einen Eigentümer**: Jeder Datenwert (z.B. Spielerposition, Score, Konfiguration) wird von genau einer Stelle verwaltet. Andere Komponenten lesen diesen Wert, kopieren ihn aber nicht dauerhaft.

4. **Keine Synchronisationsprobleme**: Wenn derselbe Wert an zwei Stellen existiert, entstehen Inkonsistenzen. Daher: eine Quelle, viele Leser.

5. **Beim Refactoring prüfen**: Vor jeder Änderung prüfen, ob der betroffene Wert oder die Logik bereits an anderer Stelle existiert. Falls ja, die bestehende Quelle nutzen statt eine neue zu erstellen.

### Umsetzung in der Praxis

- **Konstanten**: In einer zentralen Datei (z.B. `config.js`, `constants.js`) definieren.
- **Styles**: Gemeinsame Werte (Farben, Abstände) als CSS-Variablen oder in einer zentralen Style-Datei.
- **Spiellogik**: Gemeinsame Berechnungen in Utility-Funktionen auslagern.
- **HTML-Strukturen**: Wiederverwendbare Komponenten statt Copy-Paste von Markup.

### SSoT-Implementierungsregel

Bevor neuer Code geschrieben wird:
1. **Grep nach dem Konzept** — mindestens 3 Namensvarianten probieren (camelCase, snake_case, UPPER_CASE, englischer Begriff, Abkürzungen).
2. **Gefunden?** Die bestehende Definition erweitern (Parameter hinzufügen, exportieren etc.). KEINE zweite Kopie erstellen.
3. **Nicht gefunden?** `// NEW — [Begründung]` über die Definition schreiben, warum es das noch nicht gibt.

### Bei Code-Reviews und Änderungen

- Bevor neuer Code geschrieben wird: Prüfen, ob die Funktionalität schon existiert.
- Wenn ein Wert geändert werden muss, darf er nur an **einer** Stelle geändert werden müssen.
- Wird eine Verletzung des SSOT-Prinzips entdeckt, sofort refactoren.

---

## Coding-Regeln

### MUSS
- **Lesen vor Bearbeiten** — bestehenden Code verstehen, bevor er geändert wird
- **Konstanten an einem Ort** — alle Magic Numbers, Limits, Timeouts in die zentrale Konstantendatei
- **Secrets nur in sicherem Storage** — niemals in Code, Config-Dateien oder Versionskontrolle

### DARF NICHT
- Konstanten über Dateien hinweg duplizieren (Imports verwenden)
- `// eslint-disable` / `@ts-ignore` / ähnliche Warnungs-Unterdrückungen nutzen — stattdessen die Ursache beheben
- Neue UI-Varianten (Button-Styles, Farb-Klassen etc.) erstellen, ohne vorher zu prüfen, ob eine bestehende passt

### Anti-Patterns vermeiden
- **Copy-Paste-Konstanten**: Wenn ein Wert an zwei Stellen gebraucht wird, importieren oder ableiten — niemals kopieren.
- **Hardcodierte Listen**: Dropdowns, Selects, Radio-Gruppen aus Daten generieren, nicht `<option>`-Tags hardcoden.
- **Inline-Defaults in UI**: Default-Werte müssen aus der Config/Settings-Schicht kommen, nicht im HTML/JSX hardcodiert sein.
- **Stilles Fehler-Schlucken**: Kein leeres `.catch(() => {})` ohne expliziten Kommentar, warum das absichtlich ist.

---

## Pattern-Konsistenz

Bevor ein Pattern implementiert wird: **Ein bestehendes Beispiel im Codebase finden und exakt übernehmen.**
Keinen neuen Ansatz erfinden für etwas, das bereits ein etabliertes Muster hat.
