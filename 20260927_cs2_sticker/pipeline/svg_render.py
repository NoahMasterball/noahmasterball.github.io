"""SVG → PNG mit Alpha (resvg-py). Palette, Strichstärken, Schriften und Frame kommen als
Stylesheet aus config.py — die SVG-Quelle enthält nur Formen und Klassen."""
# NEW — Renderer für M2 (SPEC §6.1); es gab noch keinen.
import io

import resvg_py
from PIL import Image

import config
from sources import Sticker


Palette = str | dict[str, str]  # Name aus config.PALETTES oder Rolle → Farbe (z. B. Masken)


def stylesheet(palette: Palette, frame: str | None = None) -> str:
    colors = config.PALETTES[palette] if isinstance(palette, str) else palette
    rules = []
    for role, color in colors.items():
        rules += [f".f-{role}{{fill:{color}}}", f".s-{role}{{stroke:{color}}}",
                  f".sc-{role}{{stop-color:{color}}}"]
    rules += [f".w-{name}{{stroke-width:{px}}}" for name, px in config.STROKES.items()]
    rules += [f".{cls}{{font-family:'{family}'}}" for cls, family in config.FONTS.items()]
    if frame is not None:
        rules += ["[data-frame]{display:none}", f"[data-frame='{frame}']{{display:inline}}"]
    return "".join(rules)


def render_image(sticker: Sticker, palette: Palette, frame: str | None = None,
                 size: int = config.TEXTURE_SIZE) -> Image.Image:
    png = resvg_py.svg_to_bytes(svg_string=sticker.svg, style_sheet=stylesheet(palette, frame),
                                width=size, height=size, resources_dir=str(sticker.path.parent),
                                skip_system_fonts=True, font_dirs=[str(config.FONT_DIR)])
    return Image.open(io.BytesIO(png)).convert("RGBA")


def output_name(palette: str, frame: str | None) -> str:
    return f"{palette}-{frame}.png" if frame else f"{palette}.png"


def margin_warning(img: Image.Image, label: str) -> str | None:
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return f"{label}: Bild ist leer"
    left, top, right, bottom = bbox
    margin = min(left, top, img.width - right, img.height - bottom)
    if margin < config.SAFE_MARGIN:
        return f"{label}: Rand {margin}px < SAFE_MARGIN {config.SAFE_MARGIN}px"
    return None


def render(sticker: Sticker) -> list[str]:
    """Rendert alle Paletten × Frames nach out/<id>/ und gibt Warnungen zurück."""
    sticker.out_dir.mkdir(parents=True, exist_ok=True)
    for stale in sticker.out_dir.glob("*.png"):  # generierte Dateien, alte Paletten/Frames entfernen
        stale.unlink()
    warnings = []
    for palette in sticker.palettes:
        for frame in sticker.frames or (None,):
            img = render_image(sticker, palette, frame)
            name = output_name(palette, frame)
            img.save(sticker.out_dir / name)
            if (w := margin_warning(img, f"{sticker.id}/{name}")):
                warnings.append(w)
    return warnings
