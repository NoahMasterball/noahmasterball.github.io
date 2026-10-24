# CS2-Sticker-Workflow

KI-gestützter Workflow, der CS2-Sticker für den Steam Workshop entwirft, verfeinert und
einreichfertig macht (Ziel: Annahme durch Valve, z. B. über „Call to Arms-ory“).

- **Status:** Spec v0.3, erstes Ziel Cryptids. M1-Recherche fertig (`research/`),
  Pipeline SVG → PNG + Vorschau steht (M2). Konzept-Sticker: 2 je Richtung A–E, dazu je 4
  weitere für D und E (teils ohne Schrift) — alle 18 werden eingereicht (2026-10-15), Paket steht. Dazu 19/20 = Richtung F „Skin-Craft“
  (Farbe/Stil passend zu Dragon Lore bzw. Asiimov, eigenes Motiv).
- **Vorschau:** `python pipeline/cli.py preview` (öffnet `preview/index.html`).
- **Einreichen:** `python pipeline/cli.py install` (= package + Kopie als Sticker Kits ins Addon
  `workshop_items` der CS2 Workshop Tools; Pfad `CS2_DIR` in config.py). `package` allein → `stickers/<set>/out/EINREICHEN.md` (Checkliste)
  + pro Sticker `out/<id>/workshop/` (TGA-Texturen, preview.jpg, workshop.txt).
- **SVG-Format:** [`docs/svg-format.md`](docs/svg-format.md).
- **Alles Wichtige steht in [`docs/SPEC.md`](docs/SPEC.md)** — Recherche, Workflow,
  Architektur, offene Fragen, Quellen. Dort zuerst lesen.
