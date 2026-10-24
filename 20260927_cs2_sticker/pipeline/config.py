"""SSoT der Pipeline: Pfade, Größen, Farben, Strichstärken, Schriften, Stile (SPEC §6.3).

Andere Module und die SVG-Quellen lesen nur von hier. Das SVG-Quellformat beschreibt
docs/svg-format.md.
"""
# NEW — erste Pipeline (M2); vorher gab es im Projekt keinen Code.
import os
from pathlib import Path

# --- Pfade -------------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
STICKERS_DIR = ROOT / "stickers"
SRC_DIRNAME = "src"
PARTS_DIRNAME = "parts"   # gemeinsame Set-Teile (Rahmen, Band …), eingebunden per data-include
OUT_DIRNAME = "out"
MAX_INCLUDE_DEPTH = 4     # Schutz gegen zyklische Includes
PREVIEW_DIR = ROOT / "preview"
MANIFEST_FILE = PREVIEW_DIR / "manifest.js"
MANIFEST_GLOBAL = "MANIFEST"  # window.MANIFEST in preview/index.html

# --- IDs (SPEC §5.3: <set>-<nr>-v<version>) ----------------------------------------------
ID_PATTERN = r"^(?P<set>[a-z0-9_]+)-(?P<nr>\d{2})-v(?P<version>\d+)$"

# --- Textur (SPEC §3, research/tech-sticker-format.md Q6) --------------------------------
TEXTURE_SIZE = 1024       # px, quadratisch
SAFE_MARGIN = 16          # px Mindestrand zwischen Motiv und Texturkante

# --- Vorschau (SPEC §5.4) ----------------------------------------------------------------
PREVIEW_SIZES = (32, 64, 128, 512)  # Lesbarkeitstest; größte = Hauptbild
PREVIEW_BACKGROUNDS = {             # Name → CSS-Farbe; erster = Standard
    "dunkel": "#1b1c1e",
    "slate": "#4a4d4c",             # dunkle Budget-Skins (research/cryptids.md §4)
    "hell": "#e9e7e2",
}

# --- Finishes & Mechaniken (SPEC §3) -----------------------------------------------------
FINISHES = ("paper", "glitter", "holo", "foil", "lenticular")
MECHANICS = ("none", "lenticular", "scrape")  # Frames: lenticular = Blickwinkel, scrape = Abkratzen

# --- Set-Richtungen (research/cryptids.md §5) --------------------------------------------
DIRECTIONS = {
    "A": "Field Guide",
    "B": "Now You See It",
    "C": "Glyphen",
    "D": "Sternbilder",
    "E": "de_-Wildlife",
    "F": "Skin-Craft",   # Farbe/Stil passend zu einem Top-Skin, eigenes Motiv (SPEC §2.7)
    "G": "Smooth",       # dicke runde Verlaufslinien im Kreis-Badge, keine Schrift
    "H": "Dreamcore",    # Pastellhimmel im Bogenfenster, Wolken, Glitzer, surreale Orte, keine Schrift
}

# --- Schriften (CSS-Klasse → Familie). Nur OFL-Fonts aus FONT_DIR (Lizenzen liegen daneben);
# Systemschriften werden beim Rendern nicht geladen, damit nichts Proprietäres in Texturen landet.
FONT_DIR = ROOT / "fonts"
FONTS = {
    "t-serif": "Crimson Text",
    "t-sans": "Barlow",
    "t-mono": "IBM Plex Mono",
}

# --- Workshop-Export (SPEC §3, research/tech-sticker-format.md Q6/Q7) --------------------
EXPORT_DIRNAME = "workshop"     # out/<id>/workshop/: alles, was in den Workshop Item Editor geht
CHECKLIST_FILENAME = "EINREICHEN.md"  # out/EINREICHEN.md pro Set
# Textur-Schlüssel → Parameter im .econitem (aus Valves example_*.econitem der Workshop Tools)
TEXTURE_PARAMS = {
    "albedo": "TextureColorSticker0",
    "wear": "TextureWearMaskSticker0",
    "normal": "TextureNormalSticker0",
    "glitter_mask": "TextureGlitterMaskSticker0",
    "holo_mask": "TextureHoloMaskSticker0",
    "holo_spectrum": "TextureHoloSpectrumSticker0",
}
FINISH_TEXTURES = {             # Finish → Texturen (wie Valves Beispiele; Foil-Roughness optional, weggelassen)
    "paper": ("albedo", "wear"),
    "glitter": ("albedo", "normal", "glitter_mask", "wear"),
    "holo": ("albedo", "holo_mask", "holo_spectrum", "wear"),
    "foil": ("albedo", "normal", "wear"),
    "lenticular": ("albedo", "holo_mask", "holo_spectrum", "wear"),
}
assert set(FINISH_TEXTURES) == set(FINISHES)
FX_ROLES = ("accent", "glow")  # Paletten-Rollen, auf denen Holo/Glitter wirkt
SCRAPE_WEAR_LEVEL = 60          # Wear-Mask-Grau für Scrape-Flächen (dunkel = geht zuerst ab)
NORMAL_STRENGTH = 4.0           # Höhe → Normal-Map-Neigung (Foil/Glitter)
NORMAL_BLUR = 2                 # px Weichzeichnung der Höhenkarte vor der Ableitung
NORMAL_GREEN_UP = False         # Valve-Beispiele: DirectX (Y−) + Sidecar legacy_source1_inverted_normal
HOLO_SPECTRUM_SIZE = (1024, 256)
LENTICULAR_FRAME_SIZE = 512     # px je Frame im Spectrum-Atlas (Frames nebeneinander)
LENTICULAR_MASK_GROW = 9        # px: Wechselzone um geänderte Pixel (ungerade, MaxFilter)
# Shader-Parameter je Finish, übernommen aus Valves example_<style>.econitem/.vmat (Workshop Tools).
# "tint" = Glitter/Foil-Farbe: Palettenrolle oder None (= weiß); "flag" = Shader-Schalter im .vmat.
MATERIAL = {
    "paper": {"class": "StickerKit_Paper", "wear_bias": (0.54, -0.86), "scratches": 0.6,
              "paper_backing": True, "tint": None, "flag": None, "tint_saturate": 1.0},
    "glitter": {"class": "StickerKit_Glitter", "wear_bias": (1.0, -3.78), "scratches": 1.0,
                "paper_backing": False, "tint": "accent", "flag": "g_bGlitterSticker0",
                "tint_saturate": 0.0},
    "holo": {"class": "StickerKit_Holographic", "wear_bias": (1.0, 1.0), "scratches": 1.0,
             "paper_backing": False, "tint": None, "flag": "g_bHolographicSticker0",
             "tint_saturate": 1.0},
    "foil": {"class": "StickerKit_Foil", "wear_bias": (0.54, 1.0), "scratches": 0.6,
             "paper_backing": False, "tint": None, "flag": "g_bMetallicSticker0", "tint_saturate": 1.0},
}
VMAT_FLAGS = ("g_bGlitterSticker0", "g_bHolographicSticker0", "g_bMetallicSticker0")
VMAT_DEFAULT_TEXTURES = {       # Sticker-Texturen, die ein Finish nicht setzt (aus example_paper.vmat;
    "TextureGlitterMaskSticker0": "materials/default/stickers/default_glittermask.tga",
    "TextureGlitterNormalMaskSticker0": "materials/default/stickers/squares_glitter_mask.tga",
    "TextureGlitterNormalSticker0": "materials/default/stickers/squares_glitter_normal.tga",
    "TextureHoloMaskSticker0": "materials/default/stickers/default_holomask.tga",
    "TextureHoloSpectrumSticker0": "materials/default/stickers/default_holospectrum.tga",
    "TextureNormalSticker0": "materials/default/default_normal.tga",
    "TextureRoughnessSticker0": "materials/default/stickers/default_rough.tga",
}                               # Albedo + Wear Mask setzt jedes Finish selbst, FINISH_TEXTURES)
MATERIAL["lenticular"] = MATERIAL["holo"]  # kein eigenes Template (Q7)
assert set(MATERIAL) == set(FINISHES)

# --- CS2 Workshop Tools (lokale Installation; per Umgebungsvariable CS2_DIR überschreibbar) ---
CS2_DIR = Path(os.environ.get("CS2_DIR", r"D:\Spiele\steamapps\common\Counter-Strike Global Offensive"))
WORKSHOP_ADDON_DIR = CS2_DIR / "content" / "csgo_addons" / "workshop_items"
ADDON_STICKER_PATH = "items/assets/stickers/workshop"  # relativ zum Addon; dort liegen auch Valves Beispiele
ADDON_MATERIAL_PATH = "stickers/workshop"  # .vmat; items_game nennt es "workshop/<name>" (sticker_material)
RESOURCE_COMPILER = CS2_DIR / "game" / "bin" / "win64" / "resourcecompiler.exe"  # .econitem → .econitem_c

WORKSHOP_PREVIEW_BG = PREVIEW_BACKGROUNDS["slate"]
WORKSHOP_PREVIEW_SIZE = 1024
WORKSHOP_PREVIEW_MAX_BYTES = 1_000_000  # Steam: Vorschaubilder < 1 MB (Q6)
WORKSHOP_PREVIEW_QUALITY = 90   # JPEG

# --- Strichstärken (CSS-Klasse w-<name> → px bei TEXTURE_SIZE) ---------------------------
# Bei 32 px Anzeige wird alles um Faktor 32 kleiner → "fine" nur für Details, die wegfallen dürfen.
STROKES = {
    "heavy": 140,    # Glyphen-Linie der Smooth-Serie (G)
    "outline": 36,   # heller Stanzrand um das ganze Motiv
    "bold": 22,
    "line": 12,
    "fine": 6,
}

# --- Paletten: semantische Rollen → Farbe ------------------------------------------------
# SVGs nutzen nur Klassen (f-<rolle> = fill, s-<rolle> = stroke, sc-<rolle> = stop-color).
# Skin-Werte sind Näherungen aus research/cryptids.md §4.
PALETTE_ROLES = ("paper", "ink", "ink2", "accent", "accent2", "outline", "shade", "glow")
PALETTES = {
    "fieldguide": {"paper": "#efe6d2", "ink": "#26231f", "ink2": "#6b6358", "accent": "#c8552b",
                   "accent2": "#8a7a5c", "outline": "#fbf8f1", "shade": "#d9ccb0", "glow": "#f3e9c6"},
    "printstream": {"paper": "#fefefa", "ink": "#32312e", "ink2": "#9a9892", "accent": "#4b4944",
                    "accent2": "#e9e1d0", "outline": "#fefefa", "shade": "#e9e1d0", "glow": "#ffffff"},
    "asiimov": {"paper": "#f6fbf8", "ink": "#312925", "ink2": "#757670", "accent": "#f1530e",
                "accent2": "#f38d59", "outline": "#f6fbf8", "shade": "#c4cbc2", "glow": "#f38d59"},
    "vulcan": {"paper": "#edefe8", "ink": "#21201e", "ink2": "#4b4a48", "accent": "#70bce2",
               "accent2": "#96edfc", "outline": "#f4f6f0", "shade": "#d1d2c4", "glow": "#96edfc"},
    "neonoir": {"paper": "#dce5e7", "ink": "#1d1a19", "ink2": "#484040", "accent": "#ec6792",
                "accent2": "#8cd7ed", "outline": "#f2f5f6", "shade": "#aa3b5a", "glow": "#8cd7ed"},
    "night": {"paper": "#121826", "ink": "#05070c", "ink2": "#2a3550", "accent": "#c6ff3d",
              "accent2": "#3fd0ff", "outline": "#e8eef7", "shade": "#1c2438", "glow": "#e4ff8a"},
    "starmap": {"paper": "#141b33", "ink": "#0b1022", "ink2": "#2b3a66", "accent": "#e8c66a",
                "accent2": "#f4ebd0", "outline": "#f4ebd0", "shade": "#1e2848", "glow": "#fff3c4"},
    # Dragon-Lore-Craft: Pergament, Sepia, Blattgold, Oliv (Näherung, nicht gemessen)
    "lore": {"paper": "#dcc89e", "ink": "#2b2116", "ink2": "#5e4a2e", "accent": "#c9a043",
             "accent2": "#5a663c", "outline": "#f5ecd6", "shade": "#c2a978", "glow": "#f2d98e"},
    # Smooth (G): Grau-Scheibe, Lila→Pink-Verlauf, Cyan-Glanz (Holo-tauglich)
    "candy": {"paper": "#6b6670", "ink": "#2a2730", "ink2": "#8a8590", "accent": "#9b3cff",
              "accent2": "#ff4fd8", "outline": "#f4f2f6", "shade": "#3a3640", "glow": "#5fe8ff"},
    # Dreamcore (H): Pastell-Himmel Rosa→Weiß→Babyblau, Lavendel, weiches Lila als Tinte
    "dream": {"paper": "#fff1f8", "ink": "#4b3f6b", "ink2": "#a99ad6", "accent": "#ffb3d9",
              "accent2": "#a9dcff", "outline": "#ffffff", "shade": "#e2d4ff", "glow": "#fffbe6"},
    "dust": {"paper": "#e3c79a", "ink": "#2b2118", "ink2": "#7a5a3a", "accent": "#e0662b",
             "accent2": "#3e7c8a", "outline": "#fbf3e4", "shade": "#c7a370", "glow": "#f7e3b5"},
}

for _name, _pal in PALETTES.items():  # Fail fast: jede Palette definiert jede Rolle
    assert set(_pal) == set(PALETTE_ROLES), f"Palette {_name}: Rollen {set(PALETTE_ROLES) ^ set(_pal)}"

# --- Waffen-Patterns (Paint Kit, Style HydroGraphic) ------------------------------------
# Pattern-TGA: R/G/B = Masken für Color1/2/3 über Color0 (wie Valves example_hydrographic.tga),
# kachelbar. Ausgabe nach PATTERNS_DIR, Installation ins Addon unter ADDON_PAINTKIT_PATH.
PATTERNS_DIR = ROOT / "paintkits" / "out"
ADDON_PAINTKIT_PATH = "items/assets/paintkits/workshop"
PATTERN_SIZE = 1024
PATTERN_SUPERSAMPLE = 2           # Kantenglättung: so viel größer rechnen, dann verkleinern
# Bergketten als Reihen übereinander (y-Werte als Anteil der Reihenhöhe; 0 = oben). HydroGraphic
# legt das Pattern auf die UV-Inseln der Waffe → ein einzelnes Band trifft kaum etwas, daher flächig.
MOUNTAINS = {
    "seed": 7,
    "rows": 3,                    # Reihen je Kachel, jede seitlich versetzt
    "row_shift": 0.37,            # seitlicher Versatz je Reihe (Anteil der Breite)
    # peaks = Gipfel je Kachelbreite (abwechselnd Gipfel/Tal), levels = Unterteilungen (Unregelmäßigkeit)
    "far": {"base": 0.55, "amp": 0.45, "peaks": 5, "levels": 3, "rough": 0.45},   # Kanal G, höher, hinten
    "near": {"base": 0.78, "amp": 0.40, "peaks": 7, "levels": 3, "rough": 0.45},  # Kanal R, vorne
    "snow_from": 0.55,            # Schnee nur, wo der Grat höher als dieser Anteil von amp liegt (Kanal B)
    "snow_depth": 0.35,           # Kappentiefe relativ zur Höhe über snow_from
    "snow_jag": 0.01,             # Zacken der Kappen-Unterkante
    "fade": (1.0, 1.001),         # unten ausblenden (Anteil Reihenhöhe); 1.0 = Kette läuft bis zur nächsten Reihe
    "preview_colors": ((26, 20, 44), (176, 40, 52), (96, 70, 130), (240, 236, 245)),  # Color0–3
}
