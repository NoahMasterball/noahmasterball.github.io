// NEW — Zufalls-Arena für den MCF-Shooter. Erzeugt eine quadratische Indoor-
// Arena: äußere Wände + zufällig gestreute Deckungsblöcke. Liefert außerdem
// Spawn-Punkte je Team (bzw. verstreut für Deathmatch).
//
// Alle Wände sind achsparallele Rechtecke {x,y,w,h} — das hält die Kollision
// (Kreis↔Rechteck, Strahl↔Rechteck) einfach und schnell.

import {
  ARENA_SIZE, MAP_CELL, WALL_THICKNESS, COVER_DENSITY, PLAYER_RADIUS,
} from '../config/shooter.js';

// Abstand, den ein Spawn von jeder Wand mindestens frei haben muss.
const SPAWN_CLEARANCE = PLAYER_RADIUS * 2.5;

/**
 * Erzeugt eine neue Zufallsarena.
 * @returns {{size:number, walls:Array, spawnsA:Array, spawnsB:Array, spawnsFfa:Array}}
 */
export function generateArena() {
  const size = ARENA_SIZE;
  const walls = [];

  // Äußere Begrenzung (vier Balken).
  const t = WALL_THICKNESS;
  walls.push({ x: 0, y: 0, w: size, h: t });
  walls.push({ x: 0, y: size - t, w: size, h: t });
  walls.push({ x: 0, y: 0, w: t, h: size });
  walls.push({ x: size - t, y: 0, w: t, h: size });

  // Innere Deckungsblöcke: über ein Zellenraster verteilt, die Ränder (Spawn-
  // zonen oben/unten) bleiben frei. Blöcke sind 1–2 Zellen groß.
  const cells = Math.floor(size / MAP_CELL);
  const margin = 2; // Randzellen für Spawns freihalten
  for (let cy = margin; cy < cells - margin; cy++) {
    for (let cx = 1; cx < cells - 1; cx++) {
      if (Math.random() > COVER_DENSITY) continue;
      const bw = (1 + (Math.random() < 0.4 ? 1 : 0)) * MAP_CELL - 8;
      const bh = (1 + (Math.random() < 0.4 ? 1 : 0)) * MAP_CELL - 8;
      walls.push({ x: cx * MAP_CELL + 4, y: cy * MAP_CELL + 4, w: bw, h: bh });
    }
  }

  // Zwei zentrale Längs-Deckungen für Struktur (etwas Symmetrie im Chaos).
  const midX = size / 2;
  walls.push({ x: midX - MAP_CELL * 1.5, y: size * 0.42, w: MAP_CELL * 3, h: t });
  walls.push({ x: midX - t / 2, y: size * 0.28, w: t, h: size * 0.44 });

  // Spawns: Team A unten, Team B oben. Verstreut für Deathmatch überall.
  const spawnsA = pickSpawns(walls, size, size - MAP_CELL * 2, MAP_CELL * 2, 8);
  const spawnsB = pickSpawns(walls, size, MAP_CELL * 2, MAP_CELL * 2, 8);
  const spawnsFfa = pickSpawns(walls, size, size / 2, size * 0.44, 12);

  return { size, walls, spawnsA, spawnsB, spawnsFfa };
}

// Sucht bis zu `count` freie Punkte um eine Zielhöhe (centerY ± spreadY),
// die keine Wand berühren. Fällt zurück auf best-effort, falls voll.
function pickSpawns(walls, size, centerY, spreadY, count) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    const x = SPAWN_CLEARANCE + Math.random() * (size - SPAWN_CLEARANCE * 2);
    const y = centerY - spreadY / 2 + Math.random() * spreadY;
    if (y < SPAWN_CLEARANCE || y > size - SPAWN_CLEARANCE) continue;
    if (circleBlocked(walls, x, y, SPAWN_CLEARANCE)) continue;
    out.push({ x, y });
  }
  // Notnagel, falls die Arena sehr voll gewürfelt wurde.
  if (out.length === 0) out.push({ x: size / 2, y: centerY });
  return out;
}

// --- Kollision (Kreis ↔ Rechtecke) ------------------------------------------
// True, wenn ein Kreis (cx,cy,r) irgendeine Wand überlappt.
export function circleBlocked(walls, cx, cy, r) {
  for (const w of walls) {
    const nx = Math.max(w.x, Math.min(cx, w.x + w.w));
    const ny = Math.max(w.y, Math.min(cy, w.y + w.h));
    const dx = cx - nx;
    const dy = cy - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

// --- Strahl ↔ Wände (für Hitscan-Sichtlinie) --------------------------------
// Liefert die Distanz t∈[0,maxDist] zum ersten Wandtreffer entlang (ox,oy)+d·(dx,dy)
// oder Infinity, wenn keine Wand getroffen wird. dx,dy müssen normiert sein.
export function rayWallDistance(walls, ox, oy, dx, dy, maxDist) {
  let best = maxDist;
  for (const w of walls) {
    const t = raySlab(ox, oy, dx, dy, w, best);
    if (t < best) best = t;
  }
  return best === maxDist ? Infinity : best;
}

// True, wenn zwischen zwei Punkten eine Wand steht (Sichtlinie blockiert).
export function lineBlocked(walls, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const t = rayWallDistance(walls, ax, ay, dx / dist, dy / dist, dist);
  return t < dist - 0.5;
}

// Strahl-gegen-Rechteck (Slab-Methode). Gibt kleinste Eintritts-Distanz ≥0 oder
// Infinity zurück.
function raySlab(ox, oy, dx, dy, rect, maxDist) {
  const invx = dx !== 0 ? 1 / dx : Infinity;
  const invy = dy !== 0 ? 1 / dy : Infinity;
  let tmin = 0;
  let tmax = maxDist;
  const t1x = (rect.x - ox) * invx;
  const t2x = (rect.x + rect.w - ox) * invx;
  tmin = Math.max(tmin, Math.min(t1x, t2x));
  tmax = Math.min(tmax, Math.max(t1x, t2x));
  const t1y = (rect.y - oy) * invy;
  const t2y = (rect.y + rect.h - oy) * invy;
  tmin = Math.max(tmin, Math.min(t1y, t2y));
  tmax = Math.min(tmax, Math.max(t1y, t2y));
  if (tmax < tmin) return Infinity;
  return tmin;
}
