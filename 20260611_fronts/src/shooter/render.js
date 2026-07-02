// NEW — Renderer des MCF-Shooters. Zeichnet die Top-View-Arena mit einer auf den
// Spieler zentrierten Kamera. Kennt keine Spielregeln — liest nur den Zustand.
// Die Figuren sind als Menschen von oben modelliert: Kopf mit Frisur und Headset,
// Schultern mit Taktikweste, Arme mit Händen an der Waffe, Lauf-Animation der
// Füße, weiche Schlagschatten sowie detaillierte Waffenmodelle pro Waffen-ID
// (AK-47 mit Holzschaft, M4/M16 mit Rail, MP5, P90-Bullpup, UMP, Deagle …).

import {
  ARENA_SIZE, PLAYER_RADIUS, PLAYER_MAX_HP, MAP_CELL, MOVING_THRESHOLD,
  MOVE_SPEED, SPREAD_STAND, SPREAD_MOVE_ADD, GRENADE_RADIUS, GRENADE_FUSE_MS,
  COL_FLOOR, COL_FLOOR_ALT, COL_WALL, COL_WALL_EDGE, COL_TEAM_A, COL_TEAM_B,
  COL_BULLET, COL_BLOOD, COL_CROSSHAIR, COL_HP_GOOD, COL_HP_LOW,
  SKIN_TONES, COL_GUN, COL_LEGS,
  SHADOW_OFFSET_X, SHADOW_OFFSET_Y, SHADOW_ALPHA, MUZZLE_FLASH_MS, WALK_CYCLE_HZ,
  HAIR_COLORS, COL_PLAYER, COL_CORPSE, COL_GUN_DARK, COL_GUN_LIGHT, COL_STEEL,
  COL_WOOD, COL_WOOD_DARK, COL_GRENADE_BODY, DEFAULT_PISTOL_ID,
} from '../config/shooter.js';
import { activeWeapon, isEnemy } from './engine.js';

const TAU = Math.PI * 2;

/**
 * Zeichnet einen Frame.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {object} state
 * @param {number} now
 */
export function renderShooter(ctx, canvas, state, now) {
  const W = canvas.width, H = canvas.height;
  const player = state.player;
  // Kamera zentriert auf den Spieler (bzw. Arenamitte, wenn er tot ist).
  const focusX = player.alive ? player.x : ARENA_SIZE / 2;
  const focusY = player.alive ? player.y : ARENA_SIZE / 2;
  const camX = focusX - W / 2;
  const camY = focusY - H / 2;
  const sx = (wx) => wx - camX;
  const sy = (wy) => wy - camY;

  // Hintergrund (außerhalb der Arena = dunkel).
  ctx.fillStyle = '#0a0c11';
  ctx.fillRect(0, 0, W, H);

  drawFloor(ctx, sx, sy, W, H);
  drawWalls(ctx, state, sx, sy);
  drawGrenades(ctx, state, sx, sy, now);
  drawEffects(ctx, state, sx, sy, now);
  drawEntities(ctx, state, sx, sy, now);
  drawTracers(ctx, state, sx, sy);
  if (player.alive && state.phase === 'live') drawCrosshair(ctx, state, W, H);
}

// Skaliert eine Hex-Farbe (#rrggbb) in der Helligkeit (f) und gibt optional
// Transparenz mit — Licht-/Schattenvarianten werden so aus GENAU einer
// Grundfarbe abgeleitet (SSOT) statt sie doppelt zu definieren.
function shade(hex, f, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.min(255, Math.round(((n >> v) & 255) * f));
  return a >= 1 ? `rgb(${c(16)},${c(8)},${c(0)})` : `rgba(${c(16)},${c(8)},${c(0)},${a})`;
}

// Deterministischer Pseudozufall aus einem Seed — für Effekte, die pro Frame
// identisch bleiben müssen (z.B. Blutspritzer-Positionen).
function prand(seed) {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

function drawFloor(ctx, sx, sy, W, H) {
  const cell = MAP_CELL;
  const startX = Math.floor((sx(0)) % cell) - cell;
  const startY = Math.floor((sy(0)) % cell) - cell;
  for (let gy = startY, ry = 0; gy < H + cell; gy += cell, ry++) {
    for (let gx = startX, rx = 0; gx < W + cell; gx += cell, rx++) {
      ctx.fillStyle = (rx + ry) % 2 === 0 ? COL_FLOOR : COL_FLOOR_ALT;
      ctx.fillRect(gx, gy, cell, cell);
    }
  }
}

function drawWalls(ctx, state, sx, sy) {
  // Schlagschatten aller Wände zuerst, damit die Wandflächen sie überdecken.
  ctx.fillStyle = `rgba(0,0,0,${SHADOW_ALPHA})`;
  for (const w of state.arena.walls) {
    ctx.fillRect(sx(w.x) + SHADOW_OFFSET_X, sy(w.y) + SHADOW_OFFSET_Y, w.w, w.h);
  }
  for (const w of state.arena.walls) {
    const x = sx(w.x), y = sy(w.y);
    ctx.fillStyle = COL_WALL;
    ctx.fillRect(x, y, w.w, w.h);
    // Licht von oben links: helle Ober-/Linkskante, dunkle Unter-/Rechtskante.
    ctx.fillStyle = COL_WALL_EDGE;
    ctx.fillRect(x, y, w.w, 3);
    ctx.fillRect(x, y, 3, w.h);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x, y + w.h - 3, w.w, 3);
    ctx.fillRect(x + w.w - 3, y, 3, w.h);
  }
}

function drawGrenades(ctx, state, sx, sy, now) {
  for (const g of state.grenades) {
    const x = sx(g.x), y = sy(g.y);
    // Schlagschatten unter der Granate.
    ctx.fillStyle = `rgba(0,0,0,${SHADOW_ALPHA})`;
    ctx.beginPath();
    ctx.ellipse(x + SHADOW_OFFSET_X * 0.5, y + SHADOW_OFFSET_Y * 0.5, 6, 4.5, 0, 0, TAU);
    ctx.fill();
    // Oliver Eikörper mit Kugel-Shading.
    const body = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, 8);
    body.addColorStop(0, shade(COL_GRENADE_BODY, 1.5));
    body.addColorStop(1, shade(COL_GRENADE_BODY, 0.65));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(x, y, 6.5, 5.2, 0, 0, TAU);
    ctx.fill();
    // Riffelung des Splittermantels.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
    ctx.stroke();
    // Sicherungsbügel (Spoon) aus Stahl.
    ctx.strokeStyle = COL_STEEL;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 4, y - 4, 3.5, Math.PI * 0.6, Math.PI * 1.5);
    ctx.stroke();
    // Blinkende Warnung, je näher der Zünder.
    const blink = Math.max(0, 1 - g.fuse / GRENADE_FUSE_MS);
    ctx.strokeStyle = `rgba(255,120,80,${0.3 + 0.5 * blink})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 7 + blink * 6, 0, TAU);
    ctx.stroke();
  }
}

function drawEffects(ctx, state, sx, sy, now) {
  for (const e of state.effects) {
    const age = now - e.t;
    if (e.type === 'explosion') {
      const p = Math.min(1, age / 400);
      ctx.fillStyle = `rgba(255,${Math.floor(180 - 120 * p)},60,${0.5 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y), GRENADE_RADIUS * (0.3 + 0.7 * p), 0, TAU);
      ctx.fill();
    } else if (e.type === 'blood') {
      // Hauptlache plus deterministisch verteilte Spritzer (Seed aus Position,
      // damit das Muster pro Treffer stehen bleibt statt zu flackern).
      const fade = Math.max(0, 1 - age / 1500);
      const cx = sx(e.x), cy = sy(e.y);
      ctx.fillStyle = shade(COL_BLOOD, 0.8, 0.5 * fade);
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, TAU);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = prand(e.x + i * 17.3) * TAU;
        const d = 9 + prand(e.y + i * 9.1) * 17;
        const r = 1.5 + prand(e.x + e.y + i) * 3.5;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, TAU);
        ctx.fill();
      }
    } else {
      // Treffer-Funke (crit = größer/gelb).
      const crit = e.type === 'crit';
      const p = age / 220;
      ctx.fillStyle = crit ? `rgba(255,220,90,${1 - p})` : `rgba(255,255,255,${0.8 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y), (crit ? 9 : 5) * (1 + p), 0, TAU);
      ctx.fill();
    }
  }
}

function drawTracers(ctx, state, sx, sy) {
  ctx.lineCap = 'round';
  for (const t of state.tracers) {
    ctx.strokeStyle = t.color || COL_BULLET;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(sx(t.x1), sy(t.y1));
    ctx.lineTo(sx(t.x2), sy(t.y2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawEntities(ctx, state, sx, sy, now) {
  const player = state.player;

  // Erst gefallene Figuren (bleiben die Runde über liegen).
  for (const ent of state.entities) {
    if (ent.alive) continue;
    drawCorpse(ctx, sx(ent.x), sy(ent.y), ent);
  }

  for (const ent of state.entities) {
    if (!ent.alive) continue;
    const ex = sx(ent.x), ey = sy(ent.y);
    // Team-Shirt-Farbe: Spieler & Verbündete blau, Gegner rot.
    const enemy = ent !== player && isEnemy(state, player, ent);
    const shirt = ent === player ? COL_PLAYER : (enemy ? COL_TEAM_B : COL_TEAM_A);

    drawFigure(ctx, ex, ey, ent.angle, {
      shirt,
      skin: SKIN_TONES[ent.id % SKIN_TONES.length],
      hair: HAIR_COLORS[ent.id % HAIR_COLORS.length],
      seed: ent.id,
      isPlayer: ent === player,
      weapon: activeWeapon(ent),
      now,
      speed: ent.speed,
      reloading: now < ent.reloadUntil,
      flash: Math.max(0, 1 - (now - ent.lastShotTime) / MUZZLE_FLASH_MS),
    });

    // HP-Balken über dem Kopf (im Bildschirmraum, unrotiert).
    const hpFrac = ent.hp / PLAYER_MAX_HP;
    const bw = PLAYER_RADIUS * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ex - PLAYER_RADIUS, ey - PLAYER_RADIUS - 14, bw, 4);
    ctx.fillStyle = hpFrac > 0.4 ? COL_HP_GOOD : COL_HP_LOW;
    ctx.fillRect(ex - PLAYER_RADIUS, ey - PLAYER_RADIUS - 14, bw * hpFrac, 4);

    // Name (nur Verbündete + Spieler, damit Gegner nicht „markiert" sind).
    if (!enemy) {
      ctx.fillStyle = 'rgba(230,235,245,0.85)';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ent.name, ex, ey - PLAYER_RADIUS - 18);
    }
  }
  ctx.textAlign = 'left';
}

// Gefallene Figur: Blutlache unterm Körper, ausgebreitete Arme/Beine, entsättigt.
function drawCorpse(ctx, x, y, ent) {
  const pool = ctx.createRadialGradient(x, y, 2, x, y, PLAYER_RADIUS * 1.7);
  pool.addColorStop(0, shade(COL_BLOOD, 0.65, 0.55));
  pool.addColorStop(1, shade(COL_BLOOD, 0.65, 0));
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_RADIUS * 1.7, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 0.75;
  drawFigure(ctx, x, y, ent.angle, {
    shirt: COL_CORPSE,
    skin: SKIN_TONES[ent.id % SKIN_TONES.length],
    hair: HAIR_COLORS[ent.id % HAIR_COLORS.length],
    seed: ent.id,
    dead: true,
  });
  ctx.globalAlpha = 1;
}

// Zeichnet eine von oben gesehene menschliche Figur. Blickrichtung = +x im
// lokalen (rotierten) Koordinatensystem. Aufbau von unten nach oben:
// Schlagschatten → Füße → Waffe → Arme/Hände → Torso mit Weste → Kopf →
// Mündungsfeuer. Alle Maße in Einheiten des Spielerradius R.
function drawFigure(ctx, x, y, angle, o) {
  const R = PLAYER_RADIUS;

  // Weicher Schlagschatten (Licht von oben links), im Bildschirmraum unrotiert.
  if (!o.dead) {
    const ox = x + SHADOW_OFFSET_X * 0.7, oy = y + SHADOW_OFFSET_Y * 0.7;
    const sh = ctx.createRadialGradient(ox, oy, R * 0.3, ox, oy, R * 1.3);
    sh.addColorStop(0, `rgba(0,0,0,${SHADOW_ALPHA})`);
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(ox, oy, R * 1.3, 0, TAU);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Schrittphase der Lauf-Animation (pro Figur via Seed versetzt).
  const runFrac = o.dead ? 0 : Math.min(1, (o.speed || 0) / MOVE_SPEED);
  const step = Math.sin(((o.now || 0) / 1000) * WALK_CYCLE_HZ * TAU + (o.seed || 0) * 1.7) * runFrac;

  // Reihenfolge von unten nach oben: Füße → Torso → Waffe (liegt über der
  // Schulter) → Arme/Hände (greifen über Torso und Waffe) → Kopf zuoberst.
  drawLegs(ctx, R, step, o.dead);
  drawTorso(ctx, R, o);
  const gun = o.dead ? null : drawWeaponTop(ctx, o.weapon, R);
  drawArms(ctx, R, gun, o);
  drawHead(ctx, R, o);
  if (gun && o.flash > 0) drawMuzzleFlash(ctx, gun.muzzleX * R, gun.muzzleY * R, R, o.flash);

  ctx.restore();
}

// Füße von oben: beim Laufen pendeln die Schuhe gegenläufig unter den Schultern
// hervor; im Stand stehen sie ruhig nebeneinander. Tote liegen ausgestreckt.
function drawLegs(ctx, R, step, dead) {
  ctx.fillStyle = COL_LEGS;
  if (dead) {
    ctx.strokeStyle = COL_LEGS;
    ctx.lineWidth = R * 0.3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-R * 0.4, -R * 0.3); ctx.lineTo(-R * 1.0, -R * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R * 0.4, R * 0.3); ctx.lineTo(-R * 1.15, R * 0.3); ctx.stroke();
    shoe(ctx, -R * 1.1, -R * 0.6, R);
    shoe(ctx, -R * 1.25, R * 0.3, R);
    return;
  }
  const stride = R * 0.6 * step;
  shoe(ctx, -R * 0.1 + stride, -R * 0.38, R);
  shoe(ctx, -R * 0.1 - stride, R * 0.38, R);
}

function shoe(ctx, cx, cy, R) {
  // Aufgehellt + dunkle Kante, damit die Schuhe sich vom dunklen Boden abheben.
  ctx.fillStyle = shade(COL_LEGS, 1.5);
  ctx.beginPath();
  ctx.ellipse(cx, cy, R * 0.36, R * 0.17, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Bekannte Waffenmodelle; unbekannte IDs fallen auf das Modell ihrer Klasse
// zurück, damit neue Waffen in der Config automatisch brauchbar aussehen.
const GUN_MODEL_IDS = new Set(['glock', 'p250', 'deagle', 'mp5', 'p90', 'ump', 'ak47', 'm4', 'm16']);

// Seitlicher Versatz der Waffenachse (in R): die Waffe liegt an der rechten
// Schulter statt auf der Körpermitte — wie bei einer echten Schussstellung.
const GUN_AXIS_Y = 0.28;

// Zeichnet die Waffe im lokalen Raum (Blick = +x, Ursprung = Brustmitte,
// Achse an der rechten Schulter). Jede Waffen-ID hat ihr eigenes
// Top-View-Modell aus Schaft, Gehäuse, Handschutz und Lauf. Rückgabe:
// Mündungsposition und die beiden Handpositionen [Abzugshand, Stützhand] —
// alles in Einheiten von R, bereits inklusive Schulter-Versatz.
function drawWeaponTop(ctx, weapon, R) {
  ctx.save();
  ctx.translate(0, GUN_AXIS_Y * R);
  const spec = drawGunModel(ctx, weapon, R);
  ctx.restore();
  return {
    muzzleX: spec.muzzleX,
    muzzleY: GUN_AXIS_Y,
    hands: spec.hands.map(([x, y]) => [x, y + GUN_AXIS_Y]),
  };
}

function drawGunModel(ctx, weapon, R) {
  let id = weapon ? weapon.id : DEFAULT_PISTOL_ID;
  if (!GUN_MODEL_IDS.has(id)) {
    id = weapon.class === 'rifle' ? 'm4' : weapon.class === 'smg' ? 'mp5' : 'glock';
  }
  const u = R;
  // Jedes Teil bekommt eine helle Kontur, damit die dunklen Waffen sich vom
  // dunklen Boden und den Figuren abheben.
  const outline = () => {
    ctx.strokeStyle = 'rgba(190,200,220,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  const part = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.rect(x * u, y * u, w * u, h * u);
    ctx.fill();
    outline();
  };
  const rpart = (x, y, w, h, r, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(x * u, y * u, w * u, h * u, r * u);
    ctx.fill();
    outline();
  };

  switch (id) {
    case 'deagle':
      part(0.5, -0.13, 1.0, 0.26, COL_GUN);           // Rahmen
      part(0.55, -0.05, 0.92, 0.10, COL_STEEL);        // blanker Stahlschlitten
      part(1.42, -0.05, 0.12, 0.10, COL_GUN_DARK);     // Mündung
      return { muzzleX: 1.54, hands: [[0.55, 0.07], [0.6, -0.07]] };
    case 'p250':
      part(0.5, -0.115, 0.86, 0.23, COL_GUN);          // Schlitten
      part(0.56, -0.03, 0.7, 0.06, COL_GUN_LIGHT);     // Schlittenschiene
      part(1.3, -0.045, 0.1, 0.09, COL_GUN_DARK);      // Mündung
      return { muzzleX: 1.4, hands: [[0.52, 0.07], [0.57, -0.07]] };
    case 'glock':
      part(0.5, -0.11, 0.82, 0.22, COL_GUN);           // Schlitten
      part(0.56, -0.025, 0.66, 0.05, COL_GUN_LIGHT);   // Schlittenschiene
      part(1.26, -0.045, 0.1, 0.09, COL_GUN_DARK);     // Mündung
      return { muzzleX: 1.36, hands: [[0.52, 0.07], [0.57, -0.07]] };
    case 'mp5':
      rpart(-0.15, -0.075, 0.5, 0.15, 0.05, COL_GUN_DARK); // Schulterstütze
      rpart(0.3, -0.14, 0.62, 0.28, 0.08, COL_GUN);        // Gehäuse
      rpart(0.9, -0.115, 0.46, 0.23, 0.1, COL_GUN_DARK);   // breiter Handschutz
      part(1.36, -0.04, 0.34, 0.08, COL_GUN);              // dünner Lauf
      part(1.56, -0.08, 0.05, 0.16, COL_GUN);              // Korn
      return { muzzleX: 1.7, hands: [[0.45, 0.08], [1.12, -0.05]] };
    case 'p90':
      rpart(0.15, -0.2, 1.05, 0.4, 0.16, COL_GUN);     // kompaktes Bullpup-Gehäuse
      part(0.3, -0.035, 0.75, 0.07, COL_GUN_DARK);      // Top-Rail
      part(1.2, -0.04, 0.3, 0.08, COL_GUN);             // kurzer Lauf
      return { muzzleX: 1.5, hands: [[0.5, 0.1], [0.95, -0.1]] };
    case 'ump':
      rpart(-0.2, -0.065, 0.5, 0.13, 0.05, COL_GUN_DARK); // Klappschaft
      rpart(0.3, -0.15, 0.72, 0.3, 0.08, COL_GUN);        // kantiges Polymergehäuse
      part(1.02, -0.05, 0.42, 0.1, COL_GUN);              // Lauf
      return { muzzleX: 1.44, hands: [[0.45, 0.08], [0.88, -0.06]] };
    case 'ak47':
      rpart(-0.38, -0.095, 0.63, 0.19, 0.07, COL_WOOD_DARK); // Holzschaft
      part(0.25, -0.115, 0.56, 0.23, COL_GUN);               // Systemkasten
      rpart(0.81, -0.1, 0.5, 0.2, 0.07, COL_WOOD);           // Holz-Handschutz
      part(1.31, -0.035, 0.52, 0.07, COL_GUN);               // Lauf mit Gasrohr
      part(1.7, -0.07, 0.05, 0.14, COL_GUN);                 // Korn
      return { muzzleX: 1.83, hands: [[0.42, 0.08], [1.06, -0.05]] };
    case 'm16':
    case 'm4': {
      const long = id === 'm16' ? 0.18 : 0; // M16 ist insgesamt länger
      rpart(-0.32 - long, -0.08, 0.57 + long, 0.16, 0.05, COL_GUN_DARK); // Schaft
      part(0.25, -0.125, 0.6, 0.25, COL_GUN);                            // Gehäuse
      part(0.3, -0.03, 1.05 + long, 0.06, COL_GUN_LIGHT);                // Tragegriff/Rail
      rpart(0.85, -0.105, 0.55 + long, 0.21, 0.07, COL_GUN_DARK);        // Handschutz
      part(1.4 + long, -0.035, 0.4, 0.07, COL_GUN);                      // Lauf
      part(1.76 + long, -0.05, 0.12, 0.1, COL_GUN_DARK);                 // Mündungsfeuerdämpfer
      return { muzzleX: 1.88 + long, hands: [[0.42, 0.08], [1.12 + long, -0.05]] };
    }
  }
}

// Arme: Ärmel (Shirtfarbe) vom Schultergelenk zum Ellbogen, Unterarm in
// Hautfarbe bis zur Hand. Die Hände greifen die Waffe; beim Nachladen wandert
// die Stützhand zum Magazinschacht und „arbeitet" dort sichtbar.
function drawArms(ctx, R, gun, o) {
  let hands;
  if (o.dead) {
    hands = [[0.55, 0.9], [-0.35, -0.95]]; // ausgebreitete Arme
  } else if (gun) {
    hands = [gun.hands[0].slice(), gun.hands[1].slice()];
    if (o.reloading) {
      hands[1] = [0.5, GUN_AXIS_Y + 0.2 + Math.sin((o.now || 0) / 70) * 0.05];
    }
  } else {
    hands = [[0.6, 0.35], [0.6, -0.35]];
  }
  const shoulders = [[-0.02, 0.6], [-0.02, -0.6]]; // [Abzugshand, Stützhand]

  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const [hx, hy] = hands[i];
    const [sx0, sy0] = shoulders[i];
    // Ellbogen zwischen Schulter und Hand, leicht nach außen gebogen.
    const mx = (sx0 + hx) / 2 - 0.06;
    const my = (sy0 + hy) / 2 + Math.sign(sy0) * 0.16;
    ctx.strokeStyle = shade(o.shirt, 0.8);
    ctx.lineWidth = R * 0.3;
    ctx.beginPath(); ctx.moveTo(sx0 * R, sy0 * R); ctx.lineTo(mx * R, my * R); ctx.stroke();
    ctx.strokeStyle = o.skin;
    ctx.lineWidth = R * 0.24;
    ctx.beginPath(); ctx.moveTo(mx * R, my * R); ctx.lineTo(hx * R, hy * R); ctx.stroke();
    // Hand
    ctx.fillStyle = shade(o.skin, 0.95);
    ctx.beginPath(); ctx.arc(hx * R, hy * R, R * 0.17, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Frisches Magazin in der Stützhand andeuten.
  if (o.reloading && gun) {
    ctx.fillStyle = COL_GUN_DARK;
    ctx.fillRect(hands[1][0] * R - R * 0.06, hands[1][1] * R, R * 0.12, R * 0.3);
  }
}

// Torso von oben: Kugel-Shading (Licht vorn links), Schultergurte und eine
// dunklere Rückenplatte der Taktikweste. Die eigene Figur bekommt einen
// weißen Markierungsring.
function drawTorso(ctx, R, o) {
  const g = ctx.createRadialGradient(R * 0.15, -R * 0.2, R * 0.1, 0, 0, R);
  g.addColorStop(0, shade(o.shirt, 1.35));
  g.addColorStop(0.7, o.shirt);
  g.addColorStop(1, shade(o.shirt, 0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.95, R * 0.8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (!o.dead) {
    // Schultergurte der Weste.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = R * 0.11;
    ctx.beginPath(); ctx.moveTo(-R * 0.5, -R * 0.32); ctx.lineTo(R * 0.42, -R * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-R * 0.5, R * 0.32); ctx.lineTo(R * 0.42, R * 0.28); ctx.stroke();
    // Rückenplatte.
    ctx.fillStyle = shade(o.shirt, 0.55);
    ctx.beginPath();
    ctx.ellipse(-R * 0.12, 0, R * 0.5, R * 0.48, 0, 0, TAU);
    ctx.fill();
  }

  if (o.isPlayer) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.95, R * 0.8, 0, 0, TAU);
    ctx.stroke();
  }
}

// Kopf von oben: Haut mit Kugel-Shading, Frisur (Stil + Farbe pro Figur),
// Funk-Headset quer über den Scheitel.
function drawHead(ctx, R, o) {
  const hx = R * 0.12; // Kopf leicht nach vorn (Blickrichtung)
  const g = ctx.createRadialGradient(hx + R * 0.14, -R * 0.12, R * 0.06, hx, 0, R * 0.52);
  g.addColorStop(0, shade(o.skin, 1.22));
  g.addColorStop(0.75, o.skin);
  g.addColorStop(1, shade(o.skin, 0.62));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(hx, 0, R * 0.48, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Frisur: Seed wählt den Stil — 0 voller Schopf, 1 kurz rasiert,
  // 2 Glatze (nur Glanzpunkt), 3 mit hoher Stirn und Scheitel.
  const style = (o.seed || 0) % 4;
  if (style !== 2) {
    const wedge = style === 0 ? 1.05 : style === 1 ? 1.35 : 1.2; // freier Gesichts-Keil
    ctx.fillStyle = o.hair;
    ctx.beginPath();
    ctx.arc(hx, 0, R * 0.48, wedge, TAU - wedge);
    ctx.closePath();
    ctx.fill();
    // Glanz auf dem Haarschopf (Kugel-Tiefe).
    ctx.strokeStyle = shade(o.hair, 1.9);
    ctx.lineWidth = R * 0.09;
    ctx.beginPath();
    ctx.arc(hx, 0, R * 0.3, Math.PI * 0.7, Math.PI * 1.3);
    ctx.stroke();
    if (style === 3) {
      ctx.strokeStyle = shade(o.hair, 1.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx - R * 0.45, -R * 0.05);
      ctx.lineTo(hx + R * 0.02, -R * 0.02);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(hx + R * 0.1, -R * 0.1, R * 0.12, 0, TAU);
    ctx.fill();
  }

  if (!o.dead) {
    // Headset-Bügel quer über den Kopf + Ohrmuscheln.
    ctx.strokeStyle = COL_GUN_DARK;
    ctx.lineWidth = R * 0.07;
    ctx.beginPath();
    ctx.moveTo(hx - R * 0.02, -R * 0.46);
    ctx.lineTo(hx - R * 0.02, R * 0.46);
    ctx.stroke();
    ctx.fillStyle = COL_GUN_LIGHT;
    ctx.beginPath(); ctx.arc(hx - R * 0.02, -R * 0.47, R * 0.13, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - R * 0.02, R * 0.47, R * 0.13, 0, TAU); ctx.fill();
  }
}

// Mündungsfeuer: Glut-Glow plus Flammenstern an der Laufmündung.
// p läuft von 1 (Schussmoment) auf 0 (Ende von MUZZLE_FLASH_MS).
function drawMuzzleFlash(ctx, mx, my, R, p) {
  ctx.save();
  ctx.translate(mx, my);
  const s = R * (0.45 + 0.5 * p);
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, s * 1.6);
  glow.addColorStop(0, `rgba(255,220,120,${0.85 * p})`);
  glow.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255,246,200,${0.95 * p})`;
  ctx.beginPath();
  ctx.moveTo(s * 1.7, 0);
  ctx.lineTo(s * 0.35, s * 0.28);
  ctx.lineTo(s * 0.1, s * 0.8);
  ctx.lineTo(0, s * 0.25);
  ctx.lineTo(-s * 0.2, 0);
  ctx.lineTo(0, -s * 0.25);
  ctx.lineTo(s * 0.1, -s * 0.8);
  ctx.lineTo(s * 0.35, -s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Fadenkreuz mit dynamischer Öffnung: eng im Stand, weit beim Laufen (zeigt die
// aktuelle Streuung an — dieselbe Formel wie in der Engine).
function drawCrosshair(ctx, state, W, H) {
  const ent = state.player;
  const w = activeWeapon(ent);
  let spread = SPREAD_STAND * (w ? w.spread : 1);
  if (ent.speed > MOVING_THRESHOLD) {
    const frac = Math.min(1, ent.speed / MOVE_SPEED);
    spread += SPREAD_MOVE_ADD * frac * (w ? w.spread : 1);
  }
  // Öffnung skaliert mit der Streuung (Radiant → Pixel, grob über eine Distanz).
  const gap = 6 + spread * 900;
  const len = 8;
  const cx = W / 2, cy = H / 2;
  ctx.strokeStyle = COL_CROSSHAIR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
  ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
  ctx.stroke();
}
