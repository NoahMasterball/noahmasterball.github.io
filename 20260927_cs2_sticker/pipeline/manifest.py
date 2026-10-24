"""Baut preview/manifest.js aus den SVG-Quellen und den gerenderten PNGs.

manifest.js statt .json, damit preview/index.html auch per Doppelklick (file://) lädt.
"""
# NEW — Manifest für die Vorschau (SPEC §5.4); es gab noch keins.
import json
import os
from datetime import datetime
from pathlib import Path

import config
from sources import Sticker
from svg_render import output_name


def _preview_url(path: Path) -> str:
    rel = Path(os.path.relpath(path, config.PREVIEW_DIR)).as_posix()
    return f"{rel}?v={path.stat().st_mtime_ns}" if path.exists() else rel  # Cache-Busting


def build(stickers: list[Sticker]) -> dict:
    items = []
    for s in stickers:
        items.append({
            "id": s.id, "set": s.set, "nr": s.nr, "version": s.version,
            "title": s.title, "cryptid": s.cryptid, "direction": s.direction,
            "finish": s.finish, "mechanic": s.mechanic, "note": s.note,
            "frames": list(s.frames),
            "palettes": [
                {"name": p, "images": [_preview_url(s.out_dir / output_name(p, f))
                                       for f in s.frames or (None,)]}
                for p in s.palettes
            ],
        })
    return {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "sizes": list(config.PREVIEW_SIZES),
        "backgrounds": config.PREVIEW_BACKGROUNDS,
        "directions": config.DIRECTIONS,
        "stickers": items,
    }


def write(stickers: list[Sticker]) -> Path:
    config.MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(build(stickers), ensure_ascii=False, indent=1)
    config.MANIFEST_FILE.write_text(f"window.{config.MANIFEST_GLOBAL} = {payload};\n", encoding="utf-8")
    return config.MANIFEST_FILE
