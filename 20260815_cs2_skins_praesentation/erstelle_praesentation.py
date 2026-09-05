# -*- coding: utf-8 -*-
"""Erzeugt die PowerPoint-Praesentation "CS2: Der Skin-Markt".

Aufruf:  python erstelle_praesentation.py
Ausgabe: CS2_Skin_Markt_Praesentation.pptx (gleicher Ordner)

Inhalt und Design sind bewusst an EINER Stelle definiert (SSOT):
THEME  = alle Farben/Fonts/Masse, CONTENT = alle Folieninhalte.
"""

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ---------------------------------------------------------------- THEME (SSOT)
THEME = {
    "font": "Segoe UI",
    "bg": RGBColor(0x17, 0x19, 0x1F),        # dunkles Graphit
    "panel": RGBColor(0x22, 0x25, 0x2E),     # Karten/Tabellenzellen
    "panel_alt": RGBColor(0x1C, 0x1F, 0x27),
    "accent": RGBColor(0xDE, 0x95, 0x35),    # CS2-Orange
    "text": RGBColor(0xEC, 0xEC, 0xEC),
    "muted": RGBColor(0xA8, 0xAD, 0xB8),
    "dark": RGBColor(0x1A, 0x1C, 0x22),      # Text auf Akzentflaechen
}

RARITY = {  # offizielle Drop-Farben
    "consumer": RGBColor(0xB0, 0xC3, 0xD9),
    "industrial": RGBColor(0x5E, 0x98, 0xD9),
    "milspec": RGBColor(0x4B, 0x69, 0xFF),
    "restricted": RGBColor(0x88, 0x47, 0xFF),
    "classified": RGBColor(0xD3, 0x2C, 0xE6),
    "covert": RGBColor(0xEB, 0x4B, 0x4B),
    "gold": RGBColor(0xE4, 0xAE, 0x39),
}

SLIDE_W, SLIDE_H = 13.333, 7.5
MARGIN = 0.6
CONTENT_TOP = 1.62
FOOTER = "CS2 Skin-Markt · Stand: August 2026"

# -------------------------------------------------------------- CONTENT (SSOT)
TOC = [
    "Grundlagen: Was sind Skins?",
    "Der Skin-Markt in Zahlen",
    "Was ist ein Finish?",
    "Was ist ein Float? (Abnutzungsgrade)",
    "Seltenheit, StatTrak & Besonderheiten",
    "Messer-Typen im Überblick",
    "Marktplätze: drei Grundmodelle",
    "Steam Market · CSFloat · CS.MONEY & Co.",
    "Marktplatz-Vergleich: Gebühren & Auszahlung",
    "Preisbildung: Was macht einen Skin wertvoll?",
    "Warum steigen manche Skins im Preis?",
    "Fallbeispiel: Huntsman Knife | Lore",
    "Kauf-Checkliste, Strategien & Fazit",
]

CONTENT = [
    {"kind": "title",
     "title": "Counter-Strike 2",
     "sub": "Der Skin-Markt: Finishes, Floats, Marktplätze & Preisbildung",
     "meta": "Stand: August 2026"},

    {"kind": "toc", "title": "Inhaltsverzeichnis", "items": TOC},

    {"kind": "bullets", "title": "Grundlagen: Was sind Skins?", "items": [
        ("!", "Kosmetische Waffen-Designs — kein spielerischer Vorteil"),
        (0, "2013: Das „Arms Deal“-Update führt Skins in CS:GO ein"),
        (0, "2023: Umstieg auf Counter-Strike 2 — alle Skins wurden übernommen"),
        (0, "Woher bekommt man Skins?"),
        (1, "Wöchentliche Drops fürs Spielen"),
        (1, "Kisten (Cases) öffnen — der Schlüssel kostet ca. 2,50 €"),
        (1, "Trade-Up-Vertrag: 10 Skins einer Stufe → 1 Skin der nächsthöheren"),
        (1, "Kauf auf dem Steam Market oder bei Drittanbietern"),
        (0, "Jeder Skin ist ein handelbares Steam-Item mit realem Marktwert"),
    ]},

    {"kind": "bullets", "title": "Der Skin-Markt in Zahlen", "items": [
        ("!", "Aus einem Spiel-Feature wurde ein Milliardenmarkt"),
        (0, "Gesamtwert aller CS2-Skins: mehrere Milliarden US-Dollar"),
        (0, "CS2 ist dauerhaft das meistgespielte Spiel auf Steam (regelmäßig über 1 Mio. gleichzeitige Spieler)"),
        (0, "Steam Community Market plus Dutzende Drittanbieter-Marktplätze"),
        (0, "China (Buff163, Youpin) ist der größte Einzelmarkt und gilt als globale Preisreferenz"),
        (0, "Seltene Einzelstücke erzielen fünf- bis siebenstellige Preise (z. B. Karambit Case Hardened „Blue Gem“)"),
        (0, "Aber: unregulierter Markt — Preise schwanken stark, auch Crashes kommen vor"),
    ]},

    {"kind": "bullets", "title": "Was ist ein Finish?", "items": [
        ("!", "Das Finish ist das Design — die „Lackierung“ — eines Skins"),
        (0, "Jeder Skin = Waffe + Finish, z. B. „AK-47 | Redline“"),
        (0, "Finish-Stile (Auswahl):"),
        (1, "Solid Color / Spray Paint — einfache Lackierungen"),
        (1, "Hydrographic / Anodized — Muster bzw. eloxierte Oberflächen"),
        (1, "Case Hardened — zufälliges Blau-Gold-Muster: das Pattern entscheidet über den Wert!"),
        (1, "Gunsmith / Custom Paint Job — aufwendige, detaillierte Designs"),
        (0, "Sonderfälle mit Phasen und Prozenten:"),
        (1, "Doppler: Phase 1–4, Ruby, Sapphire, Black Pearl — gleiche Kiste, riesige Preisunterschiede"),
        (1, "Fade: Farbverlauf in Prozent — „100 % Fade“ ist die teuerste Variante"),
    ]},

    {"kind": "table", "title": "Was ist ein Float? Die Abnutzungsgrade",
     "lead": "Der Float-Wert (0,00–1,00) beschreibt die Abnutzung. Er wird beim Öffnen/Drop festgelegt und ist für immer unveränderlich.",
     "header": ["Zustand", "Kürzel", "Float-Bereich", "Preiswirkung"],
     "widths": [3.4, 1.4, 2.6, 4.7],
     "rows": [
         ["Factory New", "FN", "0,00 – 0,07", "höchster Preis"],
         ["Minimal Wear", "MW", "0,07 – 0,15", "kaum sichtbare Abnutzung, günstiger"],
         ["Field-Tested", "FT", "0,15 – 0,38", "beliebtester Preis-Leistungs-Kompromiss"],
         ["Well-Worn", "WW", "0,38 – 0,45", "deutlich abgenutzt, günstig"],
         ["Battle-Scarred", "BS", "0,45 – 1,00", "am günstigsten (Ausnahme: Sammler-Floats)"],
     ],
     "note": "Innerhalb einer Stufe gilt: je niedriger der Float, desto teurer — extreme Werte (z. B. 0,0001) haben hohe Sammler-Aufschläge. Viele Skins haben Float-Caps und können bestimmte Zustände gar nicht erreichen."},

    {"kind": "table", "title": "Seltenheit, StatTrak & Besonderheiten",
     "header": ["Seltenheit", "Chance pro Kiste", "Beispiel"],
     "widths": [4.1, 3.0, 5.0],
     "rows": [
         ["Consumer Grade", "— (nur Drops/Kollektionen)", "P250 | Sand Dune"],
         ["Industrial Grade", "— (nur Drops/Kollektionen)", "SSG 08 | Blue Spruce"],
         ["Mil-Spec", "ca. 79,9 %", "AK-47 | Elite Build"],
         ["Restricted", "ca. 16,0 %", "Glock-18 | Water Elemental"],
         ["Classified", "ca. 3,2 %", "AK-47 | Redline"],
         ["Covert", "ca. 0,64 %", "AWP | Asiimov"],
         ["★ Sonderitem", "ca. 0,26 %", "Messer & Handschuhe"],
     ],
     "row_colors": [RARITY["consumer"], RARITY["industrial"], RARITY["milspec"],
                    RARITY["restricted"], RARITY["classified"], RARITY["covert"],
                    RARITY["gold"]],
     "note": "Dazu kommen wertsteigernde Varianten: StatTrak™ (Kill-Zähler, ca. 10 % der Case-Drops), Souvenir (aus Major-Paketen) sowie Sticker und seltene Pattern."},

    {"kind": "cols", "title": "Messer: 20 Typen — riesige Preisunterschiede",
     "cols": [
         {"head": "Die Original-Fünf (2013)",
          "items": ["Karambit", "M9 Bayonet", "Bayonet", "Flip Knife", "Gut Knife"]},
         {"head": "2014 – 2016",
          "items": ["Butterfly Knife", "Huntsman Knife", "Falchion Knife",
                    "Shadow Daggers", "Bowie Knife"]},
         {"head": "2018 – 2024",
          "items": ["Talon · Ursus · Stiletto · Navaja", "Classic Knife",
                    "Nomad · Skeleton · Paracord · Survival", "Kukri Knife (2024)"]},
     ],
     "note": "Der Typ bestimmt den Preis mit: Karambit, Butterfly und M9 Bayonet sind wegen Optik und Zieh-Animationen am begehrtesten — Gut oder Navaja deutlich günstiger. Beim selben Finish liegen zwischen zwei Messertypen oft Faktor 3–5 im Preis."},

    {"kind": "cols", "title": "Marktplätze: drei Grundmodelle",
     "cols": [
         {"head": "Offiziell",
          "items": [("h", "Steam Community Market"),
                    "Direkt in Steam integriert",
                    "Maximale Sicherheit",
                    "Geld bleibt im Steam-Guthaben"]},
         {"head": "P2P-Marktplätze",
          "items": [("h", "CSFloat, Skinport, Buff163, SkinBaron"),
                    "Spieler verkauft an Spieler",
                    "Plattform dient als Treuhand",
                    "Auszahlung in echtes Geld"]},
         {"head": "Bot- / Instant-Trade",
          "items": [("h", "CS.MONEY, SkinsMonkey, Tradeit.gg"),
                    "Sofortiger Tausch gegen Bot-Inventar",
                    "Sehr bequem und schnell",
                    "Dafür spürbare Preisaufschläge"]},
     ],
     "note": "„CS Monkey“ meint übrigens meist SkinsMonkey — vom Prinzip her dasselbe Modell wie CS.MONEY."},

    {"kind": "bullets", "title": "Steam Community Market", "items": [
        ("!", "Der offizielle Marktplatz — sicher, aber teuer"),
        (0, "Pro: keine Scam-Gefahr, sofortige Abwicklung, größte Nutzerbasis und Liquidität"),
        (0, "Pro: ideal für kleine Beträge und schnelle Käufe"),
        (0, "Contra: ca. 15 % Gebühr (5 % Steam + 10 % CS2-Anteil)"),
        (0, "Contra: Erlös bleibt als Steam-Guthaben gefangen — keine Auszahlung in echtes Geld"),
        (0, "Contra: Preisobergrenze pro Listing — sehr teure Items laufen außerhalb von Steam"),
        (0, "Fazit: gute Preis-Referenz und Einsteiger-Option, zum Verkaufen aber die teuerste Wahl"),
    ]},

    {"kind": "bullets", "title": "CSFloat", "items": [
        ("!", "P2P-Marktplatz mit Fokus auf Transparenz und niedrige Gebühren"),
        (0, "Nur ca. 2 % Verkäufergebühr — aktuell die günstigste große Plattform"),
        (0, "Bekannt durch den CSFloat-Checker: exakter Float, Pattern-Index und Screenshot zu jedem Item"),
        (0, "Käufe laufen direkt von Spieler zu Spieler, die Plattform sichert als Treuhand ab"),
        (0, "Auktionen, Preisverlauf, Kauf-Angebote und Auszahlung in echtes Geld"),
        (0, "Nachteil: P2P heißt warten — der Verkäufer muss den Trade bestätigen, dazu Trade-Hold-Zeiten"),
        (0, "Für wen? Preisbewusste Käufer und alle, die auf Float/Pattern jagen („Snipes“)"),
    ]},

    {"kind": "bullets", "title": "CS.MONEY & SkinsMonkey (Bot-Trading)", "items": [
        ("!", "Tauschen statt Kaufen — Bequemlichkeit hat ihren Preis"),
        (0, "Riesiges Bot-Inventar: eigene Skins einzahlen, sofort andere mitnehmen"),
        (0, "Stärke: in wenigen Minuten vom alten zum neuen Skin, kein Warten auf Käufer"),
        (0, "Schwäche: Kommissionen und Preisaufschläge — oft 5–15 % oder mehr über Marktpreis"),
        (0, "Overpay-Logik: die eigenen Skins werden unter Marktwert angerechnet"),
        (0, "SkinsMonkey („CS Monkey“) arbeitet nach demselben Prinzip"),
        (0, "Fazit: gut für unkompliziertes Tauschen — schlecht, um den Maximalwert herauszuholen"),
    ]},

    {"kind": "bullets", "title": "Weitere Anbieter & Preisvergleichs-Tools", "items": [
        (0, "Skinport — EU-Marktplatz, ca. 6–12 % Gebühr, exzellenter Ruf (Trustpilot ~4,9), einfache Auszahlung"),
        (0, "Buff163 — größter Marktplatz der Welt (NetEase, China), ca. 2,5 % Gebühr, globale Preisreferenz — Registrierung aus dem Westen aber umständlich"),
        (0, "SkinBaron — deutscher Anbieter mit deutschem Support, PayPal und Sofortüberweisung"),
        (0, "DMarket, Waxpeer, Tradeit.gg — weitere P2P- bzw. Instant-Trade-Alternativen"),
        ("!", "Vor jedem Kauf: Preise über alle Märkte vergleichen — mit Pricempire, SteamAnalyst oder CSMarketCap"),
    ]},

    {"kind": "table", "title": "Marktplatz-Vergleich",
     "header": ["Anbieter", "Modell", "Verkäufergebühr", "Echtgeld-Auszahlung", "Geeignet für"],
     "widths": [2.7, 2.1, 2.4, 2.3, 2.6],
     "rows": [
         ["Steam Market", "offiziell", "ca. 15 %", "✗ (Steam-Guthaben)", "Einsteiger, Kleinbeträge"],
         ["CSFloat", "P2P", "ca. 2 %", "✓", "beste Preise, Float-Jagd"],
         ["Skinport", "Treuhand", "ca. 6–12 %", "✓", "bequem & seriös verkaufen"],
         ["Buff163", "P2P (China)", "ca. 2,5 %", "✓ (eingeschränkt)", "Preisreferenz, Volumen"],
         ["CS.MONEY /\nSkinsMonkey", "Bot-Trade", "Aufschlag statt Gebühr", "teils", "schnelles Tauschen"],
     ],
     "note": "Stand: August 2026 — Gebühren ändern sich regelmäßig, vor der Nutzung immer die aktuellen Konditionen prüfen."},

    {"kind": "cols", "title": "Was macht den Preis eines Skins aus?",
     "cols": [
         {"head": "Item-Faktoren",
          "items": [("h", "Zustand"),
                    "Float-Wert und Wear-Stufe",
                    "Pattern-Index (z. B. Blue Gem, Fade-Prozente)",
                    "StatTrak™ und Souvenir-Varianten",
                    "Aufgeklebte Sticker (alte Major-Sticker können den Wert vervielfachen)",
                    ("h", "Beliebtheit"),
                    "Waffe selbst: AK-47, AWP und Messer sind am gefragtesten",
                    "Design: ikonische Finishes halten den Wert"]},
         {"head": "Markt-Faktoren",
          "items": [("h", "Angebot"),
                    "Aktive Kiste (Nachschub wächst) vs. „discontinued“ (Angebot fix)",
                    "Wie viele Exemplare existieren überhaupt",
                    ("h", "Nachfrage & Umfeld"),
                    "Spielerzahlen, Valve-Updates, Operations",
                    "Pro-Player, Streamer, Trends und Memes",
                    "China-Markt (Buff-Preise) und allgemeine Marktstimmung"]},
     ]},

    {"kind": "bullets", "title": "Warum steigen manche Skins im Preis?", "items": [
        ("!", "Kern-Mechanik: Das Angebot vieler Items ist fix — oder sinkt sogar"),
        (0, "Kisten werden aus dem Drop-Pool genommen („discontinued“) → der Nachschub versiegt"),
        (0, "Skins verschwinden dauerhaft: Trade-Up-Verträge, gesperrte und inaktive Accounts"),
        (0, "Operation-Kisten gab es nur wenige Monate — ihr Angebot ist für immer begrenzt"),
        (0, "Gleichzeitig wächst die Nachfrage: CS2-Spielerzahlen auf Rekordniveau"),
        (0, "Klassiker-Effekt: alte, bekannte Finishes und Messer werden zu Sammlerstücken"),
        (0, "Aber kein Selbstläufer: neue Kisten drücken Preise ähnlicher Skins, Valve-Entscheidungen können den Markt crashen"),
    ]},

    {"kind": "bullets", "title": "Fallbeispiel: Huntsman Knife | Lore", "items": [
        ("!", "Warum gilt gerade dieses Messer als vergleichsweise wertstabil?"),
        (0, "Finish „Lore“: dunkelgrünes Design mit goldenem Ornament-Muster — beliebt und zeitlos"),
        (0, "Herkunft: ausschließlich aus der Operation Hydra Case (Mai–November 2017)"),
        (0, "Die Kiste droppte nur für Operation-Pass-Besitzer → das Angebot ist fix und sinkt langsam"),
        (0, "Preisniveau: grob 100–300 € je nach Float und Marktplatz (Stand: August 2026)"),
        (0, "„Lore“-Prestige vom teuren M9/Karambit Lore — hier zum kleineren Einstiegspreis"),
        (0, "Risiko bleibt: auch „sichere“ Messer folgen dem Gesamtmarkt nach unten wie nach oben"),
    ]},

    {"kind": "bullets", "title": "Kauf-Checkliste", "items": [
        (0, "Preise über mehrere Märkte vergleichen (Pricempire, SteamAnalyst, CSMarketCap)"),
        (0, "Float und Pattern mit dem CSFloat-Checker prüfen — nicht nur die Wear-Stufe lesen"),
        (0, "Liquidität checken: Wie oft und wie schnell verkauft sich das Item wirklich?"),
        (0, "Gebühren mitrechnen: Kaufpreis ≠ Wiederverkaufserlös"),
        (0, "Trade-Locks beachten — frisch gekaufte Items sind teils tagelang gesperrt"),
        (0, "Niemals außerhalb von Treuhand-Systemen handeln — Scam-Klassiker: Fake-Seiten, „Trade-Check“-Betrug, API-Key-Phishing"),
        ("!", "Nur Geld einsetzen, dessen Verlust verkraftbar wäre"),
    ]},

    {"kind": "cols", "title": "Was kaufen? Kategorien statt heißer Tipps",
     "cols": [
         {"head": "Eher wertstabil / Potenzial",
          "items": ["Messer und Handschuhe beliebter Typen mit gefragten Finishes (Doppler, Fade, Lore)",
                    "Skins aus discontinued Kisten und alten Operationen — z. B. Huntsman Knife | Lore",
                    "Discontinued Cases selbst als Sammlerobjekte",
                    "Ikonische Covert-Klassiker mit Dauernachfrage (AWP | Asiimov, AK-47 | Redline)"]},
         {"head": "Riskanter",
          "items": ["Skins aus aktiven Kisten — das Angebot wächst jeden Tag weiter",
                    "Hype-Items direkt nach Release",
                    "Sticker- und Pattern-Spekulation ohne eigenes Fachwissen",
                    "Alles, was man nur wegen eines YouTube-Videos kauft"]},
     ],
     "note": "Keine Anlageberatung: Der Skin-Markt ist unreguliert, hängt komplett an Valve und kann jederzeit stark fallen."},

    {"kind": "bullets", "title": "Fazit", "items": [
        ("!", "Preis = Finish + Float/Pattern + Seltenheit + Marktplatz-Wahl"),
        (0, "Steam Market: bequem und sicher, aber 15 % Gebühr und kein echtes Geld"),
        (0, "CSFloat und Skinport: beste Preise und Auszahlung — CS.MONEY/SkinsMonkey nur fürs schnelle Tauschen"),
        (0, "Wert entsteht aus knappem Angebot plus wachsender Nachfrage — discontinued schlägt aktiv"),
        (0, "Vor jedem Kauf: Preisvergleich, Float-Check, Liquidität und Gebühren prüfen"),
        (0, "Quellen: steamanalyst.com · csmarketcap.com · pricempire.com · csfloat.com · Steam Community Market"),
    ]},
]

# ------------------------------------------------------------------- Renderer
FONT = THEME["font"]


def _fill(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def _set_run(run, text, size, color, bold=False, italic=False):
    run.text = text
    f = run.font
    f.name = FONT
    f.size = Pt(size)
    f.color.rgb = color
    f.bold = bold
    f.italic = italic


def _hang(p, mar_l, indent):
    """Haengender Einzug, damit umgebrochene Bullet-Zeilen buendig stehen."""
    pPr = p._p.get_or_add_pPr()
    pPr.set("marL", str(mar_l))
    pPr.set("indent", str(indent))


def _para(tf, first_used):
    if first_used[0]:
        p = tf.add_paragraph()
    else:
        p = tf.paragraphs[0]
        first_used[0] = True
    return p


def new_slide(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = THEME["bg"]
    return slide


def add_textbox(slide, left, top, width, height):
    tb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tb.text_frame.word_wrap = True
    return tb


def add_header(slide, title, page_no):
    tb = add_textbox(slide, MARGIN, 0.42, SLIDE_W - 2 * MARGIN, 0.85)
    _set_run(tb.text_frame.paragraphs[0].add_run(), title, 30, THEME["text"], bold=True)
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(MARGIN), Inches(1.32),
                                 Inches(1.6), Inches(0.055))
    _fill(bar, THEME["accent"])
    ftb = add_textbox(slide, MARGIN, SLIDE_H - 0.42, 6.0, 0.3)
    _set_run(ftb.text_frame.paragraphs[0].add_run(), FOOTER, 10, THEME["muted"])
    ntb = add_textbox(slide, SLIDE_W - MARGIN - 1.0, SLIDE_H - 0.42, 1.0, 0.3)
    p = ntb.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    _set_run(p.add_run(), "%02d" % page_no, 10, THEME["muted"])


def add_note(slide, text, top):
    tb = add_textbox(slide, MARGIN, top, SLIDE_W - 2 * MARGIN, 0.9)
    _set_run(tb.text_frame.paragraphs[0].add_run(), text, 13, THEME["muted"], italic=True)


def render_title(prs, spec):
    slide = new_slide(prs)
    tb = add_textbox(slide, 1.2, 2.35, SLIDE_W - 2.4, 1.4)
    p = tb.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    _set_run(p.add_run(), spec["title"], 54, THEME["text"], bold=True)
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(SLIDE_W / 2 - 1.1),
                                 Inches(3.62), Inches(2.2), Inches(0.06))
    _fill(bar, THEME["accent"])
    tb = add_textbox(slide, 1.2, 3.85, SLIDE_W - 2.4, 0.7)
    p = tb.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    _set_run(p.add_run(), spec["sub"], 22, THEME["accent"])
    tb = add_textbox(slide, 1.2, 4.6, SLIDE_W - 2.4, 0.5)
    p = tb.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    _set_run(p.add_run(), spec["meta"], 14, THEME["muted"])


def render_toc(prs, spec, page_no):
    slide = new_slide(prs)
    add_header(slide, spec["title"], page_no)
    items = spec["items"]
    half = (len(items) + 1) // 2
    columns = [items[:half], items[half:]]
    col_w = (SLIDE_W - 2 * MARGIN - 0.6) / 2
    for ci, col in enumerate(columns):
        tb = add_textbox(slide, MARGIN + ci * (col_w + 0.6), CONTENT_TOP + 0.15, col_w, 5.2)
        tf = tb.text_frame
        first = [False]
        for ii, item in enumerate(col):
            p = _para(tf, first)
            p.space_after = Pt(14)
            _set_run(p.add_run(), "%02d  " % (ci * half + ii + 1), 17, THEME["accent"], bold=True)
            _set_run(p.add_run(), item, 17, THEME["text"])


def render_bullets(prs, spec, page_no):
    slide = new_slide(prs)
    add_header(slide, spec["title"], page_no)
    items = spec["items"]
    size = 16 if len(items) <= 8 else 15
    tb = add_textbox(slide, MARGIN, CONTENT_TOP, SLIDE_W - 2 * MARGIN, SLIDE_H - CONTENT_TOP - 0.6)
    tf = tb.text_frame
    first = [False]
    for lvl, text in items:
        p = _para(tf, first)
        if lvl == "!":
            p.space_after = Pt(12)
            _set_run(p.add_run(), text, size + 2, THEME["accent"], bold=True)
        elif lvl == 0:
            p.space_after = Pt(9)
            _hang(p, 228600, -228600)
            _set_run(p.add_run(), "•  ", size, THEME["accent"], bold=True)
            _set_run(p.add_run(), text, size, THEME["text"])
        else:
            p.space_after = Pt(7)
            _hang(p, 685800, -228600)
            _set_run(p.add_run(), "–  ", size - 1, THEME["muted"])
            _set_run(p.add_run(), text, size - 1, THEME["text"])


def render_cols(prs, spec, page_no):
    slide = new_slide(prs)
    add_header(slide, spec["title"], page_no)
    cols = spec["cols"]
    gap = 0.35
    usable = SLIDE_W - 2 * MARGIN - gap * (len(cols) - 1)
    col_w = usable / len(cols)
    body_h = 4.3 if spec.get("note") else 5.0
    for ci, col in enumerate(cols):
        left = MARGIN + ci * (col_w + gap)
        panel = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left),
                                       Inches(CONTENT_TOP), Inches(col_w), Inches(body_h))
        _fill(panel, THEME["panel"])
        tb = add_textbox(slide, left + 0.22, CONTENT_TOP + 0.18, col_w - 0.44, body_h - 0.36)
        tf = tb.text_frame
        first = [False]
        p = _para(tf, first)
        p.space_after = Pt(10)
        _set_run(p.add_run(), col["head"], 16, THEME["accent"], bold=True)
        for item in col["items"]:
            p = _para(tf, first)
            if isinstance(item, tuple) and item[0] == "h":
                p.space_before = Pt(6)
                p.space_after = Pt(6)
                _set_run(p.add_run(), item[1], 14, THEME["accent"], bold=True)
            else:
                p.space_after = Pt(7)
                _hang(p, 182880, -182880)
                _set_run(p.add_run(), "•  ", 13.5, THEME["accent"])
                _set_run(p.add_run(), item, 13.5, THEME["text"])
    if spec.get("note"):
        add_note(slide, spec["note"], CONTENT_TOP + body_h + 0.18)


def render_table(prs, spec, page_no):
    slide = new_slide(prs)
    add_header(slide, spec["title"], page_no)
    top = CONTENT_TOP
    if spec.get("lead"):
        tb = add_textbox(slide, MARGIN, top, SLIDE_W - 2 * MARGIN, 0.55)
        _set_run(tb.text_frame.paragraphs[0].add_run(), spec["lead"], 15, THEME["accent"], bold=True)
        top += 0.62
    rows, header = spec["rows"], spec["header"]
    n_rows, n_cols = len(rows) + 1, len(header)
    total_w = sum(spec["widths"])
    shape = slide.shapes.add_table(n_rows, n_cols, Inches(MARGIN), Inches(top),
                                   Inches(total_w), Inches(0.44 * n_rows))
    table = shape.table
    table.first_row = False
    table.horz_banding = False
    for ci, w in enumerate(spec["widths"]):
        table.columns[ci].width = Inches(w)
    for ci, text in enumerate(header):
        cell = table.cell(0, ci)
        cell.fill.solid()
        cell.fill.fore_color.rgb = THEME["accent"]
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        _set_run(cell.text_frame.paragraphs[0].add_run(), text, 13, THEME["dark"], bold=True)
    row_colors = spec.get("row_colors")
    for ri, row in enumerate(rows):
        for ci, text in enumerate(row):
            cell = table.cell(ri + 1, ci)
            cell.fill.solid()
            cell.fill.fore_color.rgb = THEME["panel"] if ri % 2 == 0 else THEME["panel_alt"]
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            first = [False]
            for li, line in enumerate(text.split("\n")):
                p = _para(tf, first)
                color = THEME["text"]
                bold = False
                if ci == 0:
                    bold = True
                    if row_colors:
                        color = row_colors[ri]
                _set_run(p.add_run(), line, 12.5, color, bold=bold)
    if spec.get("note"):
        add_note(slide, spec["note"], top + 0.5 * n_rows + 0.25)


def main():
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W)
    prs.slide_height = Inches(SLIDE_H)
    renderers = {"title": render_title, "toc": render_toc, "bullets": render_bullets,
                 "cols": render_cols, "table": render_table}
    for idx, spec in enumerate(CONTENT):
        if spec["kind"] == "title":
            render_title(prs, spec)
        else:
            renderers[spec["kind"]](prs, spec, idx + 1)
    out = "CS2_Skin_Markt_Praesentation.pptx"
    prs.save(out)
    print("OK: %s (%d Folien)" % (out, len(prs.slides._sldIdLst)))


if __name__ == "__main__":
    main()
