// Moves unused assets out of public/ (into asset_staging/pruned/, reversible)
// so the production build and repo stay lean. Keep rules:
// - medieval/nature pieces referenced by name anywhere in src/ (except the
//   retired vignette_realistic scene) + all shared texture PNGs
// - characters actually used by scenes
// - the one HDRI + two ambientCG texture sets in use
// - benched packs (kaykit, polyhaven) are pruned wholesale (bake-off only)
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public', 'assets');
const graveyard = join(root, 'asset_staging', 'pruned');

// Collect all source text (piece names appear as string literals).
let srcText = '';
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts') && e.name !== 'vignette_realistic.ts') srcText += readFileSync(p, 'utf8');
  }
};
walk(join(root, 'src'));

const KEEP_CHARACTERS = new Set([
  'Superhero_Male.glb',
  'Superhero_Female.glb',
  'Male_Peasant.glb',
  'Female_Peasant.glb',
  'Hair_SimpleParted.glb',
  'Hair_Buns.glb',
  'UAL1.glb',
]);
const KEEP_HDRI = new Set(['spruit_sunrise_2k.hdr']);
const KEEP_TEXTURE_SETS = new Set(['Grass001', 'Ground030']);

let moved = 0;
let movedBytes = 0;
let kept = 0;

function prune(absPath) {
  const rel = relative(pub, absPath);
  const dest = join(graveyard, rel);
  mkdirSync(dirname(dest), { recursive: true });
  movedBytes += statSync(absPath).size;
  renameSync(absPath, dest);
  moved++;
}

// medieval + nature: keep referenced .gltf/.bin pairs and every .png
for (const kit of ['medieval', 'nature']) {
  const dir = join(pub, 'models', kit);
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) continue;
    if (f === 'desktop.ini') {
      prune(full);
      continue;
    }
    if (f.endsWith('.png')) {
      kept++;
      continue;
    }
    const base = f.replace(/\.(gltf|bin)$/, '');
    if (srcText.includes(`'${base}'`)) kept++;
    else prune(full);
  }
}

// characters
for (const f of readdirSync(join(pub, 'models', 'characters'))) {
  if (KEEP_CHARACTERS.has(f)) kept++;
  else prune(join(pub, 'models', 'characters', f));
}

// benched packs
for (const packDir of ['kaykit', 'polyhaven']) {
  const dir = join(pub, 'models', packDir);
  if (!existsSync(dir)) continue;
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) rec(p);
      else prune(p);
    }
  };
  rec(dir);
}

// hdri + texture sets
for (const f of readdirSync(join(pub, 'hdri'))) {
  if (KEEP_HDRI.has(f)) kept++;
  else prune(join(pub, 'hdri', f));
}
for (const setDir of readdirSync(join(pub, 'textures'))) {
  if (KEEP_TEXTURE_SETS.has(setDir)) {
    kept++;
    continue;
  }
  const dir = join(pub, 'textures', setDir);
  for (const f of readdirSync(dir)) prune(join(dir, f));
}

console.log(`Pruned ${moved} files (${(movedBytes / 1024 / 1024).toFixed(1)} MB) -> ${graveyard}`);
console.log(`Kept ${kept} entries in public/assets.`);
