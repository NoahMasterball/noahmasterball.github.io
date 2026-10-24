"""SVG-Quellen finden, Metadaten lesen und gegen das Quellformat prüfen (docs/svg-format.md)."""
# NEW — Format-Parser/Validator; svg_render.py und manifest.py lesen Quellen nur hierüber.
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

import config

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
INCLUDE_ATTR = "data-include"
_ID_RE = re.compile(config.ID_PATTERN)
# Feste Farben verboten — Farben kommen nur aus config.PALETTES (Masken: white/black erlaubt).
_LITERAL_COLOR_RE = re.compile(
    r"(?:fill|stroke|stop-color|flood-color|lighting-color)\s*(?:=\s*[\"']|:)\s*(?:#[0-9a-fA-F]{3,8}|rgba?\()"
)
_REQUIRED_ATTRS = ("data-title", "data-cryptid", "data-direction", "data-finish", "data-palettes")


class SourceError(ValueError):
    """SVG-Quelle verletzt das Quellformat."""


@dataclass(frozen=True)
class Sticker:
    id: str
    set: str
    nr: int
    version: int
    path: Path
    title: str
    cryptid: str
    direction: str
    finish: str
    mechanic: str
    palettes: tuple[str, ...]
    frames: tuple[str, ...]  # leer = ein Bild pro Palette
    note: str
    description: str  # englischer Workshop-Text (Publish-Dialog); leer = noch nicht einreichbar
    svg: str = field(repr=False)  # Quelle mit aufgelösten Includes — das rendert svg_render.py

    @property
    def out_dir(self) -> Path:
        return config.STICKERS_DIR / self.set / config.OUT_DIRNAME / self.id


def source_path(sticker_id: str) -> Path:
    m = _ID_RE.match(sticker_id)
    if not m:
        raise SourceError(f"{sticker_id}: ID passt nicht zu {config.ID_PATTERN}")
    return config.STICKERS_DIR / m["set"] / config.SRC_DIRNAME / f"{sticker_id}.svg"


def _parse(path: Path) -> ET.Element:
    try:
        return ET.parse(path).getroot()
    except (ET.ParseError, OSError) as e:
        raise SourceError(f"{path.name}: nicht lesbar/kein gültiges XML ({e})") from e


def _expand_includes(root: ET.Element, parts_dir: Path, depth: int = 0) -> None:
    """Ersetzt data-include="<teil>" durch die Kinder von parts/<teil>.svg (vor eigenen Kindern)."""
    for el in [e for e in root.iter() if e.get(INCLUDE_ATTR)]:
        name = el.attrib.pop(INCLUDE_ATTR)
        if depth >= config.MAX_INCLUDE_DEPTH:
            raise SourceError(f"Include '{name}': mehr als {config.MAX_INCLUDE_DEPTH} Ebenen (Zyklus?)")
        part_path = parts_dir / f"{name}.svg"
        if not part_path.is_file():
            raise SourceError(f"Include '{name}': {part_path} fehlt")
        part = _parse(part_path)
        _expand_includes(part, parts_dir, depth + 1)
        el[0:0] = list(part)


def load(path: Path) -> Sticker:
    errors = []
    m = _ID_RE.match(path.stem)
    if not m:
        raise SourceError(f"{path.name}: Dateiname passt nicht zu {config.ID_PATTERN}")
    if path.parent.parent.name != m["set"]:
        errors.append(f"liegt nicht im Set-Ordner '{m['set']}'")

    root = _parse(path)
    try:
        _expand_includes(root, path.parent.parent / config.PARTS_DIRNAME)
    except SourceError as e:
        raise SourceError(f"{path.name}: {e}") from e
    text = ET.tostring(root, encoding="unicode")
    if _LITERAL_COLOR_RE.search(text):
        errors.append("feste Farbe gefunden (auch in Includes) – nur Paletten-Klassen f-/s-/sc-<rolle>")
    if root.tag != f"{{{SVG_NS}}}svg":
        errors.append("Wurzel ist kein <svg> im SVG-Namespace")
    size = config.TEXTURE_SIZE
    if (root.get("viewBox") or "").split() != ["0", "0", str(size), str(size)]:
        errors.append(f'viewBox muss "0 0 {size} {size}" sein')

    attr = root.get
    errors += [f"Attribut {a} fehlt" for a in _REQUIRED_ATTRS if not attr(a)]
    direction = attr("data-direction", "")
    finish = attr("data-finish", "")
    mechanic = attr("data-mechanic", "none")
    palettes = tuple(attr("data-palettes", "").split())
    frames = tuple(attr("data-frames", "").split())
    if direction and direction not in config.DIRECTIONS:
        errors.append(f"data-direction '{direction}' nicht in {list(config.DIRECTIONS)}")
    if finish and finish not in config.FINISHES:
        errors.append(f"data-finish '{finish}' nicht in {config.FINISHES}")
    if mechanic not in config.MECHANICS:
        errors.append(f"data-mechanic '{mechanic}' nicht in {config.MECHANICS}")
    errors += [f"Palette '{p}' nicht in config.PALETTES" for p in palettes if p not in config.PALETTES]

    used_frames = {el.get("data-frame") for el in root.iter() if el.get("data-frame")}
    if used_frames != set(frames):
        errors.append(f"data-frames {sorted(frames)} ≠ genutzte data-frame {sorted(used_frames)}")
    if (mechanic == "none") != (not frames):
        errors.append("Frames nur zusammen mit data-mechanic lenticular/scrape (und dann mind. 2)")
    if frames and len(frames) < 2:
        errors.append("mind. 2 Frames nötig")

    if errors:
        raise SourceError(f"{path.name}: " + "; ".join(errors))
    return Sticker(
        id=path.stem, set=m["set"], nr=int(m["nr"]), version=int(m["version"]), path=path,
        title=attr("data-title"), cryptid=attr("data-cryptid"), direction=direction,
        finish=finish, mechanic=mechanic, palettes=palettes, frames=frames,
        note=attr("data-note", ""), description=attr("data-description", ""), svg=text,
    )


def discover(set_name: str | None = None) -> tuple[list[Sticker], list[str]]:
    """Alle Quellen (optional nur ein Set) → (gültige Sticker, Fehlermeldungen)."""
    stickers, errors = [], []
    for path in config.STICKERS_DIR.glob(f"{set_name or '*'}/{config.SRC_DIRNAME}/*.svg"):
        try:
            stickers.append(load(path))
        except SourceError as e:
            errors.append(str(e))
    stickers.sort(key=lambda s: (s.set, s.nr, s.version))
    return stickers, errors
