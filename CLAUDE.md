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

### Bei Code-Reviews und Änderungen

- Bevor neuer Code geschrieben wird: Prüfen, ob die Funktionalität schon existiert.
- Wenn ein Wert geändert werden muss, darf er nur an **einer** Stelle geändert werden müssen.
- Wird eine Verletzung des SSOT-Prinzips entdeckt, sofort refactoren.
