"""Pipeline-Befehle.

  python pipeline/cli.py build [--set SET]     alle Quellen prüfen + rendern, Manifest schreiben
  python pipeline/cli.py render ID [ID ...]    nur diese Sticker prüfen + rendern (kein Manifest)
  python pipeline/cli.py preview [--set SET]   build + Vorschau im Browser öffnen
  python pipeline/cli.py package [--set SET]   build + Workshop-Paket (TGA, Masken, .econitem, Texte) je Sticker
  python pipeline/cli.py install [--set SET]   package + in das Addon der CS2 Workshop Tools kopieren
  python pipeline/cli.py pattern               Waffen-Pattern (Berge) bauen + ins Addon kopieren
"""
# NEW — Einstiegspunkt der Pipeline (SPEC §6.1).
import argparse
import sys
import webbrowser

import config
import export
import manifest
import patterns
import sources
import svg_render


def _render_all(stickers: list[sources.Sticker]) -> list[str]:
    warnings = []
    for s in stickers:
        warnings += svg_render.render(s)
        print(f"ok  {s.id}  ({len(s.palettes)} Palette(n) × {max(len(s.frames), 1)} Frame(s))")
    return warnings


def _report(errors: list[str], warnings: list[str]) -> int:
    for w in warnings:
        print(f"WARNUNG  {w}")
    for e in errors:
        print(f"FEHLER   {e}")
    return 1 if errors else 0


def cmd_build(set_name: str | None) -> int:
    stickers, errors = sources.discover(set_name)
    warnings = _render_all(stickers)
    all_stickers, _ = sources.discover()  # Manifest immer über alle Sets
    print(f"Manifest: {manifest.write(all_stickers)}")
    return _report(errors, warnings)


def cmd_package(set_name: str | None) -> int:
    code = cmd_build(set_name)
    stickers, _ = sources.discover(set_name)
    warnings = []
    for s in stickers:
        warnings += export.export(s)
        print(f"pkg {s.id}  ({export.style(s)})")
    for path in export.write_checklist(stickers):
        print(f"Checkliste: {path}")
    return _report([], warnings) or code


def cmd_install(set_name: str | None) -> int:
    code = cmd_package(set_name)
    stickers, _ = sources.discover(set_name)
    for s in stickers:
        print(f"inst {export.asset_stem(s)} → {export.install(s)}")
    return code


def cmd_render(ids: list[str]) -> int:
    stickers, errors = [], []
    for sticker_id in ids:
        try:
            stickers.append(sources.load(sources.source_path(sticker_id)))
        except (sources.SourceError, FileNotFoundError) as e:
            errors.append(str(e))
    warnings = _render_all(stickers)
    for s in stickers:
        print(f"    → {s.out_dir}")
    return _report(errors, warnings)


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="CS2-Sticker-Pipeline")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build").add_argument("--set")
    sub.add_parser("render").add_argument("ids", nargs="+")
    sub.add_parser("preview").add_argument("--set")
    sub.add_parser("package").add_argument("--set")
    sub.add_parser("install").add_argument("--set")
    sub.add_parser("pattern")
    args = parser.parse_args(argv)

    if args.cmd == "render":
        return cmd_render(args.ids)
    if args.cmd == "package":
        return cmd_package(args.set)
    if args.cmd == "install":
        return cmd_install(args.set)
    if args.cmd == "pattern":
        for path in patterns.write():
            print(f"ok  {path}")
        print(f"Editor-Pfad: {patterns.install()}")
        return 0
    code = cmd_build(args.set)
    if args.cmd == "preview":
        webbrowser.open((config.PREVIEW_DIR / "index.html").as_uri())
    return code


if __name__ == "__main__":
    sys.exit(main())
