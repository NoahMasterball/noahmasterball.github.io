"""Kachelbare Pattern-Texturen für Paint Kits (Style HydroGraphic): R/G/B = Masken für Color1–3.

Werte in config.MOUNTAINS; Ausgabe: PATTERNS_DIR/<name>.tga + <name>_preview.png.
"""
# NEW — erste Waffen-Textur im Projekt; Sticker-Pipeline (SVG) passt nicht zu prozeduralen Masken.
import shutil

import numpy as np
from PIL import Image

import config


def _ridge(rng: np.random.Generator, width: int, peaks: int, levels: int, rough: float) -> np.ndarray:
    """Gipfel/Täler im Wechsel + periodische Mittelpunktverschiebung → Gratlinie 0..1, nahtlos."""
    h = np.where(np.arange(2 * peaks) % 2 == 0, 0.75 + 0.25 * rng.random(2 * peaks), 0.2 * rng.random(2 * peaks))
    scale = 0.25
    for _ in range(levels):
        mid = (h + np.roll(h, -1)) / 2 + (rng.random(len(h)) - 0.5) * scale
        h = np.stack([h, mid], axis=1).ravel()
        scale *= rough
    xs = np.linspace(0, len(h), width, endpoint=False)
    i = xs.astype(int)
    t = xs - i
    line = h[i] * (1 - t) + h[(i + 1) % len(h)] * t
    return (line - line.min()) / (line.max() - line.min())


def mountains() -> dict[str, Image.Image]:
    m = config.MOUNTAINS
    n = config.PATTERN_SIZE * config.PATTERN_SUPERSAMPLE
    rows = m["rows"]
    rng = np.random.default_rng(m["seed"])
    ys = (np.arange(n // rows, dtype=np.float32) / (n // rows))[:, None]  # eine Reihe

    def range_mask(layer: dict) -> tuple[np.ndarray, np.ndarray]:
        height = _ridge(rng, n, layer["peaks"], layer["levels"], layer["rough"])
        top = layer["base"] - height * layer["amp"]
        return ys >= top[None, :], height

    far, _ = range_mask(m["far"])
    near, near_h = range_mask(m["near"])
    amp = m["near"]["amp"]
    jag = (_ridge(rng, n, 48, 2, 0.7) - 0.5) * m["snow_jag"]
    depth = np.clip(near_h - m["snow_from"], 0, None) * amp * m["snow_depth"] / (1 - m["snow_from"])
    snow_line = m["near"]["base"] - near_h * amp + depth + jag
    snow = near & (ys < snow_line[None, :]) & (depth[None, :] > 0)
    lo, hi = m["fade"]
    fade = np.clip((hi - ys) / (hi - lo), 0, 1)

    r = (near & ~snow) * fade
    g = (far & ~near) * fade
    b = snow * fade
    row = np.stack([r, g, b], axis=-1)
    shift = int(n * m["row_shift"])
    arr = (np.concatenate([np.roll(row, i * shift, axis=1) for i in range(rows)]) * 255).astype(np.uint8)
    pattern = Image.fromarray(arr, "RGB").resize((config.PATTERN_SIZE,) * 2, Image.LANCZOS)

    c = np.array(m["preview_colors"], dtype=np.float32)
    p = np.asarray(pattern, dtype=np.float32) / 255
    rest = np.clip(1 - p.sum(-1, keepdims=True), 0, 1)
    preview = rest * c[0] + p[..., :1] * c[1] + p[..., 1:2] * c[2] + p[..., 2:3] * c[3]
    preview = Image.fromarray(preview.clip(0, 255).astype(np.uint8), "RGB")
    return {"pattern": pattern, "preview": preview}


def write(name: str = "mountains") -> list:
    config.PATTERNS_DIR.mkdir(parents=True, exist_ok=True)
    imgs = mountains()
    tga = config.PATTERNS_DIR / f"{name}.tga"
    png = config.PATTERNS_DIR / f"{name}_preview.png"
    imgs["pattern"].save(tga)
    imgs["preview"].save(png)
    return [tga, png]


def install(name: str = "mountains") -> str:
    """Pattern ins Addon der Workshop Tools kopieren; gibt den Pfad für das Editor-Feld zurück."""
    dest = config.WORKSHOP_ADDON_DIR / config.ADDON_PAINTKIT_PATH
    if not dest.is_dir():
        raise FileNotFoundError(f"Workshop Tools nicht gefunden: {dest} (CS2_DIR setzen)")
    shutil.copy2(config.PATTERNS_DIR / f"{name}.tga", dest / f"{name}.tga")
    return f"{config.ADDON_PAINTKIT_PATH}/{name}.tga"
