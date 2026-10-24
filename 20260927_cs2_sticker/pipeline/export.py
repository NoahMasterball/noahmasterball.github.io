"""Workshop-Paket je Sticker: TGA-Texturen (Albedo + Masken je Finish), Vorschaubild, Texte.

Ausgabe nach out/<id>/workshop/ (inkl. .econitem im Format von Valves Beispielen) plus Checkliste
out/EINREICHEN.md je Set. install() kopiert die Pakete in das Addon der CS2 Workshop Tools. Welche Texturen ein
Finish braucht, steht in config.FINISH_TEXTURES; alle Zahlen ebenfalls in config.py.
Masken entstehen aus der SVG-Quelle selbst: Effekt-Rollen (config.FX_ROLES) werden weiß, der
Rest schwarz gerendert — die Quelle braucht dafür keine eigene Markierung.
"""
# NEW — Phase 5/7 (SPEC §5.2); SPEC §6.1 plante variants.py + export.py, beides lebt hier,
# weil Masken nur für den Export gebraucht werden.
import colorsys
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

import config
import svg_render
from sources import Sticker


KV3_HEADER = ("<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} "
              "format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->")
NORMAL_SIDECAR = '"settings"\n{\n\t"legacy_source1_inverted_normal"\t\t"1"\n}\n'
LOCAL_ONLY = ("workshop.txt", "preview.jpg")  # bleiben im Paket, gehören nicht ins Addon


def asset_stem(s: Sticker) -> str:
    """Dateiname im Addon: Ressourcenpfade in Source 2 ohne Bindestriche."""
    return s.id.replace("-", "_")


def style(s: Sticker) -> str:
    return config.MATERIAL[s.finish]["class"].split("_", 1)[1]


def _main_frames(s: Sticker) -> tuple[str | None, ...]:
    return s.frames or (None,)


def _render(s: Sticker, frame: str | None) -> Image.Image:
    return svg_render.render_image(s, s.palettes[0], frame)


def _gray(img: Image.Image) -> np.ndarray:
    """RGBA auf Schwarz → Helligkeit 0..1."""
    black = Image.new("RGBA", img.size, (0, 0, 0, 255))
    return np.asarray(Image.alpha_composite(black, img).convert("L"), dtype=np.float32) / 255


def _alpha(img: Image.Image) -> np.ndarray:
    return np.asarray(img.getchannel("A"), dtype=np.float32) / 255


def _to_img(*channels: np.ndarray) -> Image.Image:
    """1 Kanal → Graustufe (L), 3 Kanäle → RGB — wie Valves Beispieltexturen."""
    arr = np.stack([np.clip(c, 0, 1) * 255 for c in channels], axis=-1).round().astype(np.uint8)
    return Image.fromarray(arr[..., 0], "L") if len(channels) == 1 else Image.fromarray(arr, "RGB")


def _albedo(s: Sticker, img: Image.Image) -> Image.Image:
    """RGB ohne Alpha (Form kommt aus der Wear Mask); Ränder in Outline-Farbe gegen dunkle Säume."""
    bg = Image.new("RGBA", img.size, config.PALETTES[s.palettes[0]]["outline"])
    return Image.alpha_composite(bg, img).convert("RGB")


def _fx_mask(s: Sticker, frame: str | None) -> np.ndarray:
    colors = {r: "#ffffff" if r in config.FX_ROLES else "#000000" for r in config.PALETTE_ROLES}
    return _gray(svg_render.render_image(s, colors, frame))


def _wear(s: Sticker, frames: list[Image.Image]) -> np.ndarray:
    """Weiß = hält, Schwarz = unsichtbar. Scrape: was im letzten Frame fehlt, geht zuerst ab."""
    wear = _alpha(frames[0])
    if s.mechanic == "scrape":
        scraped = (_alpha(frames[0]) - _alpha(frames[-1])) > 0.5
        wear = np.where(scraped, config.SCRAPE_WEAR_LEVEL / 255, wear)
    return wear


def _normal(height: np.ndarray) -> Image.Image:
    h = Image.fromarray((height * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(config.NORMAL_BLUR))
    h = np.asarray(h, dtype=np.float32) / 255
    dy, dx = np.gradient(h)
    nx, ny = -dx * config.NORMAL_STRENGTH, -dy * config.NORMAL_STRENGTH
    if config.NORMAL_GREEN_UP:  # Bild-y zeigt nach unten → für Y+ umdrehen
        ny = -ny
    length = np.sqrt(nx ** 2 + ny ** 2 + 1)
    return _to_img(nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, 1 / length * 0.5 + 0.5)


def _rainbow() -> Image.Image:
    w, h = config.HOLO_SPECTRUM_SIZE
    row = np.array([colorsys.hsv_to_rgb(x / w, 0.55, 1.0) for x in range(w)], dtype=np.float32)
    shade = np.linspace(1.0, 0.8, h, dtype=np.float32)[:, None, None]  # B-Versatz = Zeile
    return _to_img(*np.moveaxis(row[None, :, :] * shade, -1, 0))


def _grid() -> tuple[np.ndarray, np.ndarray]:
    n = config.TEXTURE_SIZE
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32) / (n - 1)
    return xs, ys


def _holo(s: Sticker, alpha: np.ndarray) -> tuple[Image.Image, Image.Image]:
    """R = Effektstärke, G = Versatz im Spectrum (diagonal → Regenbogen wandert), B = Zeile."""
    xs, ys = _grid()
    return _to_img(_fx_mask(s, None) * alpha, (xs + ys) / 2, ys), _rainbow()


def _lenticular(frames: list[Image.Image]) -> tuple[Image.Image, Image.Image]:
    """Spectrum = Frames nebeneinander; G = x innerhalb eines Frames (1/n der Atlasbreite), der
    Blickwinkel verschiebt U → anderer Frame. Formel im Workbench verifizieren (Q7/Q13)."""
    stack = np.stack([np.asarray(f, dtype=np.int16) for f in frames])
    changed = (np.abs(stack - stack[0]).max(axis=(0, 3)) > 8).astype(np.uint8) * 255
    changed = Image.fromarray(changed, "L").filter(ImageFilter.MaxFilter(config.LENTICULAR_MASK_GROW))
    xs, ys = _grid()
    mask = _to_img(np.asarray(changed, dtype=np.float32) / 255, xs / len(frames), ys)
    size = config.LENTICULAR_FRAME_SIZE
    atlas = Image.new("RGB", (size * len(frames), size))
    for i, f in enumerate(frames):
        atlas.paste(f.convert("RGB").resize((size, size), Image.LANCZOS), (i * size, 0))
    return mask, atlas


def _preview(albedo: Image.Image) -> Image.Image:
    size = config.WORKSHOP_PREVIEW_SIZE
    bg = Image.new("RGBA", albedo.size, config.WORKSHOP_PREVIEW_BG)
    return Image.alpha_composite(bg, albedo).convert("RGB").resize((size, size), Image.LANCZOS)


def _tint(s: Sticker) -> tuple[int, int, int] | None:
    """Farbton (0–255) — nur Glitter/Foil haben in Valves Beispielen einen."""
    if s.finish not in ("glitter", "foil"):
        return None
    role = config.MATERIAL[s.finish]["tint"]
    hex_ = config.PALETTES[s.palettes[0]][role] if role else "#ffffff"
    return tuple(int(hex_[i:i + 2], 16) for i in (1, 3, 5))


def _texture_paths(files: dict[str, str]) -> dict[str, str]:
    return {config.TEXTURE_PARAMS[k]: f"{config.ADDON_STICKER_PATH}/{name}" for k, name in files.items()}


def _vmat(s: Sticker, files: dict[str, str]) -> str:
    """Material wie Valves (vom Editor generierte) example_<style>.vmat."""
    m = config.MATERIAL[s.finish]
    tint = _tint(s)
    tint_vec = (f"{tint[0] / 255:.6f} {tint[1] / 255:.6f} {tint[2] / 255:.6f} 1.000000" if tint
                else "1.000000 1.000000 1.000000 0.000000")
    textures = {**config.VMAT_DEFAULT_TEXTURES, **_texture_paths(files)}
    params = {
        "g_bAutomaticPBRColorFittingSticker0": "1", "g_bClampSpectrumVSticker0": "1",
        **{flag: "1" if flag == m["flag"] else "0" for flag in config.VMAT_FLAGS},
        "g_bLegacyTintMultiplySticker0": "0",
        "g_bPaperBackingSticker0": "1" if m["paper_backing"] else "0",
        "g_bSticker0WearPreview": "0", "g_flColorBoostSticker0": "1.000",
        "g_flGlitterScaleSticker0": "1.000", "g_flSfxColorBoostSticker0": "1.000",
        "g_flSticker0Wear": "0.000", "g_flTintSaturateSticker0": f"{m['tint_saturate']:.3f}",
        "g_fWearScratchesSticker0": f"{m['scratches']:.3f}",
        "g_vColorTintSticker0": f"[{tint_vec}]",
        "g_vWearBiasSticker0": f"[{m['wear_bias'][0]:.3f} {m['wear_bias'][1]:.3f}]",
        **textures,
    }
    sticker = "\n".join(f'\t{k} "{v}"' for k, v in sorted(params.items(), key=lambda kv: kv[0].lower()))
    return f"""// THIS FILE IS AUTO-GENERATED

Layer0
{{
	shader "csgo_weapon_sticker.vfx"

	//---- Ambient Occlusion ----
	TextureAmbientOcclusion "materials/default/default_ao.tga"

	//---- Color ----
	g_vColorTint "[1.000000 1.000000 1.000000 0.000000]"
	TextureColor "materials/default/stickers/sticker_default_backing.psd"

	//---- Fog ----
	g_bFogEnabled "1"

	//---- Lighting ----
	TextureMetalness "materials/default/default_metal.tga"
	TextureRoughness "materials/default/default_rough.tga"

	//---- Normal Map ----
	TextureNormal "materials/default/default_normal.tga"

	//---- Sticker0 ----
{sticker}

	//---- Texture Address Mode ----
	g_nTextureAddressModeU "0"
	g_nTextureAddressModeV "0"


	VariableState
	{{
	}}
}}"""


def _econitem(s: Sticker, files: dict[str, str]) -> str:
    m = config.MATERIAL[s.finish]
    keys = {k: f'"{v}"' for k, v in _texture_paths(files).items()}
    if (tint := _tint(s)) is not None:
        keys["g_vColorTintSticker0"] = "[ " + ", ".join(map(str, tint)) + " ]"
    keys["g_bAutomaticPBRColorFittingSticker0"] = "true"
    keys["g_vWearBiasSticker0.0"], keys["g_vWearBiasSticker0.1"] = (str(v) for v in m["wear_bias"])
    keys["g_fWearScratchesSticker0"] = str(m["scratches"])
    keys["g_bPaperBackingSticker0"] = "true" if m["paper_backing"] else "false"
    body = "\n".join(f'\t\t\t"exposed_param.{k}" = {v}' for k, v in keys.items())
    return (f'{KV3_HEADER}\n{{\n\tcs2_item_type = "CCS2EconNode_StickerKit"\n'
            f'\tCCS2EconNode_StickerKit = \n\t{{\n'
            f'\t\titem_name = "#CSGO_Workshop"\n'
            f'\t\tdescription_string = "#CSGO_Workshop_EmptyString"\n'
            f'\t\titem_rarity = "common"\n'
            f'\t\tsticker_material_class = "{m["class"]}"\n'
            f'\t\tsticker_material_keys = \n\t\t{{\n{body}\n\t\t}}\n'
            f'\t\tassociate_assets = \n\t\t[\n'
            f'\t\t\tresource_name:"{config.ADDON_MATERIAL_PATH}/{asset_stem(s)}.vmat",\n\t\t]\n\t}}\n}}\n')


def _texts(s: Sticker, files: dict[str, str]) -> str:
    rows = "\n".join(f"  {config.TEXTURE_PARAMS[k]:<28} ← {name}" for k, name in files.items())
    return (f"ID:          {s.id}  (im Editor: Sticker Kit → {asset_stem(s)})\n"
            f"Title:       {s.title}\n"
            f"Style:       {style(s)}\n"
            f"Call to Arms: Enlist for {s.set.capitalize()}\n"
            f"Preview:     preview.jpg\n"
            f"Texturen:\n{rows}\n\n"
            f"Description:\n{s.description}\n")


def export(s: Sticker) -> list[str]:
    """Schreibt das Workshop-Paket eines Stickers und gibt Warnungen zurück."""
    out = s.out_dir / config.EXPORT_DIRNAME
    out.mkdir(parents=True, exist_ok=True)
    for stale in out.iterdir():  # generiert → komplett neu
        stale.unlink()
    warnings = [] if s.description else [f"{s.id}: data-description fehlt (Publish-Text)"]

    frames = [_render(s, f) for f in _main_frames(s)]
    albedo = frames[0]
    alpha = _alpha(albedo)
    textures: dict[str, Image.Image] = {"albedo": _albedo(s, albedo), "wear": _to_img(_wear(s, frames))}
    wanted = config.FINISH_TEXTURES[s.finish]
    if "normal" in wanted:  # Foil: Motiv geprägt; Glitter: Effektflächen erhaben
        height = _fx_mask(s, None) if s.finish == "glitter" else _gray(albedo)
        textures["normal"] = _normal(height * alpha)
    if "glitter_mask" in wanted:
        textures["glitter_mask"] = _to_img(*[_fx_mask(s, None) * alpha] * 3)  # RGB wie Valve
    if "holo_mask" in wanted:
        lenticular = s.mechanic == "lenticular"
        textures["holo_mask"], textures["holo_spectrum"] = (
            _lenticular(frames) if lenticular else _holo(s, alpha))

    files = {}
    for key in wanted:
        name = f"{asset_stem(s)}_{key}.tga"
        textures[key].save(out / name)
        files[key] = name
        if key == "normal" and not config.NORMAL_GREEN_UP:
            (out / f"{asset_stem(s)}_{key}.txt").write_text(NORMAL_SIDECAR, encoding="utf-8")
    (out / f"{asset_stem(s)}.econitem").write_text(_econitem(s, files), encoding="utf-8")
    (out / f"{asset_stem(s)}.vmat").write_text(_vmat(s, files), encoding="utf-8")
    preview = out / "preview.jpg"
    _preview(albedo).save(preview, quality=config.WORKSHOP_PREVIEW_QUALITY)
    if preview.stat().st_size > config.WORKSHOP_PREVIEW_MAX_BYTES:
        warnings.append(f"{s.id}: preview.jpg > {config.WORKSHOP_PREVIEW_MAX_BYTES} Bytes")
    (out / "workshop.txt").write_text(_texts(s, files), encoding="utf-8")
    return warnings


def install(s: Sticker) -> Path:
    """Kopiert das Paket (ohne LOCAL_ONLY) in das Addon der Workshop Tools."""
    if not config.WORKSHOP_ADDON_DIR.is_dir():
        raise FileNotFoundError(f"Workshop Tools nicht gefunden: {config.WORKSHOP_ADDON_DIR} (CS2_DIR setzen)")
    dest = config.WORKSHOP_ADDON_DIR / config.ADDON_STICKER_PATH
    mat_dest = config.WORKSHOP_ADDON_DIR / config.ADDON_MATERIAL_PATH
    dest.mkdir(parents=True, exist_ok=True)
    mat_dest.mkdir(parents=True, exist_ok=True)
    for f in (s.out_dir / config.EXPORT_DIRNAME).iterdir():
        if f.name not in LOCAL_ONLY:
            shutil.copy2(f, (mat_dest if f.suffix == ".vmat" else dest) / f.name)
    # Material (zieht die Texturen mit) und Kit kompilieren — sonst fehlt der Sticker im Inspect
    for path in (mat_dest / f"{asset_stem(s)}.vmat", dest / f"{asset_stem(s)}.econitem"):
        result = subprocess.run([str(config.RESOURCE_COMPILER), "-i", str(path)],
                                cwd=config.RESOURCE_COMPILER.parent, capture_output=True, text=True)
        if result.returncode != 0 or " 0 failed" not in result.stdout:
            raise RuntimeError(f"{path.name}: resourcecompiler fehlgeschlagen\n{result.stdout[-2000:]}")
    return dest


def write_checklist(stickers: list[Sticker]) -> list:
    """out/EINREICHEN.md je Set: Ablauf + eine Zeile pro Sticker."""
    paths = []
    for set_name in sorted({s.set for s in stickers}):
        items = [s for s in stickers if s.set == set_name]
        rows = "\n".join(
            f"| [ ] | {asset_stem(s)} | {s.title} | {style(s)} | "
            f"`{s.id}/{config.EXPORT_DIRNAME}/` |" for s in items)
        text = f"""# Einreichen: {set_name} ({len(items)} Sticker)

Generiert von `python pipeline/cli.py package` — nicht von Hand bearbeiten.

## Einmalig
1. `python pipeline/cli.py install` — legt alle Sticker Kits im Addon der Workshop Tools an.
2. Workshop Tools → **Launch Workshop Item Tools** → Outliner → **Sticker Kit**.
3. Workshop Legal Agreement + **Supplemental Terms** akzeptieren (Pflicht für Call to Arms).

## Pro Sticker (Werte in `<id>/{config.EXPORT_DIRNAME}/workshop.txt`)
1. Im Outliner unter **Sticker Kit** den Eintrag (Spalte „Kit“) öffnen, **Save**.
2. **Inspect/Preview**: auf einer Waffe ansehen, Wear-Regler durchziehen.
3. **Publish**: Title + Description aus `workshop.txt`, Preview Image = `preview.jpg`,
   Visibility **Public**, Call to Arms → **Enlist for {set_name.capitalize()}**.
4. Haken in der Tabelle setzen.

## Erst prüfen (unverifiziert, research/tech-sticker-format.md Q7/Q13)
- Normal Map: Konvention {"OpenGL (Y+)" if config.NORMAL_GREEN_UP else "DirectX (Y−) wie Valves Beispiele"} — wirkt die Prägung
  im Preview eingedrückt statt erhaben → `NORMAL_GREEN_UP` in config.py umstellen, neu installieren.
- Lenticular: Style „Holographic“ angenommen, Frames nebeneinander im Spectrum — im Preview kippen.
- Erst **einen** Sticker jeder Art (Paper, Holo, Foil, Glitter, Lenticular) durchspielen, dann den Rest.

| ✓ | Kit | Titel | Style | Ordner |
| --- | --- | --- | --- | --- |
{rows}
"""
        path = config.STICKERS_DIR / set_name / config.OUT_DIRNAME / config.CHECKLIST_FILENAME
        path.write_text(text, encoding="utf-8")
        paths.append(path)
    return paths
