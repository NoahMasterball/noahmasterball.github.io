// NEW — Spiel-Engine des MCF-Shooters. Reiner Simulationskern: hält den
// kompletten Laufzeitzustand eines Matches und rechnet ihn pro Frame weiter.
// Kennt weder DOM noch Canvas — Szene/HUD lesen den Zustand und rufen Aktionen.
//
// Kernmechaniken (CS-Stil):
//  • Stehen = genau, Laufen = stark streuend.
//  • Spray: erste SPRAY_LEARN_SHOTS Schüsse leichtes, IMMER GLEICHES Wackeln
//    (lernbar); danach starker Links-/Rechts-Zug.
//  • Crit: der letzte Schuss eines gehaltenen Feuerstoßes macht doppelten Schaden.
//  • Runden: wer stirbt, ist raus; letzte(s) lebende Team/Person gewinnt die Runde.
//  • Runde 1 ist Pistolenrunde; Geld pro Kill; Waffenpreise nach Stärke.

import {
  WEAPONS, WEAPON_BY_ID, DEFAULT_PISTOL_ID, SLOT_PRIMARY, SLOT_SECONDARY,
  PLAYER_RADIUS, PLAYER_MAX_HP, MOVE_SPEED, MOVING_THRESHOLD,
  SPREAD_STAND, SPREAD_MOVE_ADD,
  SPRAY_LEARN_SHOTS, SPRAY_GROW_SHOTS, SPRAY_MILD_AMP, SPRAY_STRONG_AMP,
  SPRAY_MILD_FREQ, SPRAY_STRONG_FREQ, SPRAY_RESET_MS,
  CRIT_MULTIPLIER, CRIT_WINDOW_MS,
  GRENADE_FUSE_MS, GRENADE_SPEED, GRENADE_FRICTION, GRENADE_RADIUS,
  GRENADE_MAX_DAMAGE, GRENADE_THROW_COOLDOWN_MS, GRENADE_MAX_CARRY, GRENADE_PRICE,
  START_MONEY, MONEY_MAX, REWARD_KILL, REWARD_WIN_ROUND, REWARD_LOSE_ROUND,
  MATCH_WINS, BUY_TIME_MS, ROUND_END_MS,
  BOT_AIM_ERROR, BOT_REACT_MS, BOT_BURST_MIN, BOT_BURST_MAX,
  BOT_REPATH_MS, BOT_PREFERRED_RANGE,
} from '../config/shooter.js';
import {
  generateArena, circleBlocked, rayWallDistance, lineBlocked,
} from './mapgen.js';

let nextId = 1;

// --- Match-Aufbau -----------------------------------------------------------

/**
 * Erzeugt ein frisches Match aus der Setup-Konfiguration.
 * @param {{teamSize:string, perTeam:number, modeId:string, isTeam:boolean, playerName:string}} cfg
 */
export function createMatch(cfg) {
  const arena = generateArena();
  const state = {
    config: cfg,
    arena,
    entities: [],
    player: null,
    grenades: [],
    tracers: [],
    effects: [],
    killfeed: [],
    round: 0,
    phase: 'buy',
    phaseTimer: 0,
    scoreA: 0,
    scoreB: 0,
    winnerText: '',
    lastRoundText: '',
    now: 0,
  };

  const per = cfg.perTeam;
  // Spieler-Entity (Team A / bzw. FFA-Teilnehmer 0).
  const player = makeEntity(cfg.playerName, 'A', false, 0);
  state.player = player;
  state.entities.push(player);

  if (cfg.isTeam) {
    // Team A: Spieler + (per-1) Bots; Team B: per Bots.
    for (let i = 1; i < per; i++) state.entities.push(makeEntity(botName('A', i), 'A', true, i));
    for (let i = 0; i < per; i++) state.entities.push(makeEntity(botName('B', i), 'B', true, i));
  } else {
    // Deathmatch: alle gegeneinander. Teilnehmerzahl = perTeam*2.
    const total = per * 2;
    for (let i = 1; i < total; i++) state.entities.push(makeEntity(botName('X', i), 'B', true, i));
  }

  startRound(state, /* first */ true);
  return state;
}

function makeEntity(name, team, isBot, seat) {
  const ent = {
    id: nextId++, name, team, isBot, seat,
    x: 0, y: 0, angle: 0, speed: 0,
    hp: PLAYER_MAX_HP, alive: true,
    money: START_MONEY,
    kills: 0, roundWins: 0,
    slots: { [SLOT_PRIMARY]: null, [SLOT_SECONDARY]: DEFAULT_PISTOL_ID },
    activeSlot: SLOT_SECONDARY,
    ammo: {},
    grenades: 0,
    grenadeCdUntil: 0,
    // Feuer-/Recoil-Zustand
    moveX: 0, moveY: 0,
    triggerHeld: false, triggerPrev: false, semiFired: false,
    burstRemaining: 0, fireCooldownMs: 0,
    sprayCount: 0, lastShotTime: -99999,
    reloadUntil: 0, reloadWeaponId: null,
    lastShot: null,
    // Bot-Zustand
    aiTarget: null, reactUntil: 0, botBurst: 0, botPauseUntil: 0,
    repathAt: 0, strafe: 1, stuckMs: 0, detourUntil: 0, detourDir: 0,
  };
  // Startpistole ausrüsten.
  ent.ammo[DEFAULT_PISTOL_ID] = freshAmmo(DEFAULT_PISTOL_ID);
  return ent;
}

function botName(team, i) {
  const pool = ['Rex', 'Nova', 'Vex', 'Kilo', 'Ash', 'Zed', 'Fox', 'Juno', 'Riot', 'Bolt', 'Cane', 'Dash'];
  return `${pool[(i * 3 + team.charCodeAt(0)) % pool.length]}_${team}${i}`;
}

function freshAmmo(weaponId) {
  const w = WEAPON_BY_ID.get(weaponId);
  return { mag: w.mag, reserve: w.reserve };
}

// --- Runden-Steuerung -------------------------------------------------------

function startRound(state, first = false) {
  state.round = first ? 1 : state.round + 1;
  state.phase = 'buy';
  state.phaseTimer = BUY_TIME_MS;
  state.grenades = [];
  state.tracers = [];

  const spawnsA = shuffled(state.arena.spawnsA);
  const spawnsB = shuffled(state.arena.spawnsB);
  const spawnsFfa = shuffled(state.arena.spawnsFfa);
  let ai = 0, bi = 0, fi = 0;

  for (const ent of state.entities) {
    ent.alive = true;
    ent.hp = PLAYER_MAX_HP;
    ent.speed = 0;
    ent.triggerHeld = ent.triggerPrev = ent.semiFired = false;
    ent.burstRemaining = 0;
    ent.fireCooldownMs = 0;
    ent.sprayCount = 0;
    ent.lastShot = null;
    ent.reloadUntil = 0;
    ent.reactUntil = ent.botBurst = ent.botPauseUntil = 0;
    // Munition aller besessenen Waffen auffüllen.
    for (const id of Object.values(ent.slots)) {
      if (id) ent.ammo[id] = freshAmmo(id);
    }
    // Aktiven Slot auf die stärkste Waffe (Primär, sonst Pistole) legen.
    ent.activeSlot = ent.slots[SLOT_PRIMARY] ? SLOT_PRIMARY : SLOT_SECONDARY;
    // Positionieren.
    let p;
    if (state.config.isTeam) {
      p = ent.team === 'A' ? spawnsA[ai++ % spawnsA.length] : spawnsB[bi++ % spawnsB.length];
    } else {
      p = spawnsFfa[fi++ % spawnsFfa.length];
    }
    ent.x = p.x; ent.y = p.y;
    // Blickrichtung grob zur Mitte.
    ent.angle = Math.atan2(state.arena.size / 2 - ent.y, state.arena.size / 2 - ent.x);
    // Bots kaufen automatisch (nicht in der Pistolenrunde).
    if (ent.isBot) botBuy(state, ent);
  }
}

// Einfaches Auto-Buy der Bots: ab Runde 2 leisten sie sich Gewehr/SMG + Granate.
function botBuy(state, ent) {
  if (state.round === 1) return; // Pistolenrunde
  const affordable = WEAPONS.filter((w) => w.class !== 'pistol' && w.price <= ent.money);
  if (affordable.length) {
    // Bevorzugt das teuerste bezahlbare (grob = stärkste).
    const pick = affordable.sort((a, b) => b.price - a.price)[Math.floor(Math.random() * Math.min(3, affordable.length))];
    ent.money -= pick.price;
    giveWeapon(ent, pick);
  }
  if (ent.grenades < 1 && ent.money >= GRENADE_PRICE) {
    ent.money -= GRENADE_PRICE;
    ent.grenades = 1;
  }
}

function endRound(state, winnerTeamOrEnt) {
  state.phase = 'roundover';
  state.phaseTimer = ROUND_END_MS;

  if (state.config.isTeam) {
    const winTeam = winnerTeamOrEnt; // 'A' | 'B' | null
    if (winTeam === 'A') state.scoreA++;
    else if (winTeam === 'B') state.scoreB++;
    for (const ent of state.entities) {
      const won = ent.team === winTeam;
      ent.money = Math.min(MONEY_MAX, ent.money + (won ? REWARD_WIN_ROUND : REWARD_LOSE_ROUND));
    }
    state.lastRoundText = winTeam
      ? `Runde ${state.round}: Team ${winTeam === 'A' ? '(du)' : 'Gegner'} gewinnt`
      : `Runde ${state.round}: unentschieden`;
    if (state.scoreA >= MATCH_WINS || state.scoreB >= MATCH_WINS) {
      state.winnerText = state.scoreA > state.scoreB ? 'Du gewinnst das Match!' : 'Gegner gewinnt das Match.';
      state.phase = 'matchover';
    }
  } else {
    const winner = winnerTeamOrEnt; // Entity | null
    if (winner) {
      winner.roundWins++;
      winner.money = Math.min(MONEY_MAX, winner.money + REWARD_WIN_ROUND);
    }
    for (const ent of state.entities) {
      if (ent !== winner) ent.money = Math.min(MONEY_MAX, ent.money + REWARD_LOSE_ROUND);
    }
    state.lastRoundText = winner ? `Runde ${state.round}: ${winner.name} gewinnt` : `Runde ${state.round}: keiner überlebt`;
    if (winner && winner.roundWins >= MATCH_WINS) {
      state.winnerText = winner === state.player ? 'Du gewinnst das Match!' : `${winner.name} gewinnt das Match.`;
      state.phase = 'matchover';
    }
  }
}

function checkRoundEnd(state) {
  if (state.phase !== 'live') return;
  if (state.config.isTeam) {
    const aliveA = state.entities.some((e) => e.team === 'A' && e.alive);
    const aliveB = state.entities.some((e) => e.team === 'B' && e.alive);
    if (!aliveA || !aliveB) endRound(state, aliveA ? 'A' : (aliveB ? 'B' : null));
  } else {
    const alive = state.entities.filter((e) => e.alive);
    if (alive.length <= 1) endRound(state, alive[0] || null);
  }
}

// --- Haupt-Update -----------------------------------------------------------

/**
 * Rechnet das Match um dtMs weiter.
 * @param {object} state   Match-Zustand (createMatch).
 * @param {number} dtMs    Zeitschritt in Millisekunden.
 * @param {number} now     Monotone Zeit (ms).
 * @param {{moveX:number,moveY:number,aimAngle:number,firing:boolean}} input  Spielereingabe.
 */
export function updateMatch(state, dtMs, now, input) {
  state.now = now;
  const dt = dtMs / 1000;

  // Phasen-Timer.
  if (state.phase === 'buy' || state.phase === 'roundover') {
    state.phaseTimer -= dtMs;
    if (state.phaseTimer <= 0) {
      if (state.phase === 'buy') { state.phase = 'live'; }
      else { startRound(state); }
    }
  }

  // Spielereingabe übernehmen (nur solange der Spieler lebt).
  const player = state.player;
  if (player.alive) {
    player.moveX = input.moveX;
    player.moveY = input.moveY;
    player.angle = input.aimAngle;
    player.triggerHeld = !!input.firing && state.phase === 'live';
  } else {
    player.triggerHeld = false;
  }

  const canMove = state.phase === 'live' || state.phase === 'buy';
  const canFight = state.phase === 'live';

  for (const ent of state.entities) {
    if (!ent.alive) continue;
    finishReload(ent, now);
    if (ent.isBot && canFight) updateBot(state, ent, now, dt);
    if (ent.isBot && !canFight) { ent.moveX = 0; ent.moveY = 0; ent.triggerHeld = false; }
    if (canMove) applyMovement(state, ent, dt);
    else ent.speed = 0;
    if (!ent.isBot && canFight) processHumanFire(state, ent, now, dtMs);
    if (!ent.isBot && !canFight) { ent.triggerPrev = ent.triggerHeld = false; }
  }

  updateGrenades(state, dt, now);
  ageTemporaries(state, now);
}

// --- Bewegung + Kollision (Kreis ↔ Wände, Achsen getrennt = Slide) ----------

function applyMovement(state, ent, dt) {
  let mx = ent.moveX, my = ent.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const walls = state.arena.walls;
  const step = MOVE_SPEED * dt;
  const ox = ent.x, oy = ent.y;

  let nx = ent.x + mx * step;
  if (!circleBlocked(walls, nx, ent.y, PLAYER_RADIUS)) ent.x = nx;
  let ny = ent.y + my * step;
  if (!circleBlocked(walls, ent.x, ny, PLAYER_RADIUS)) ent.y = ny;

  ent.speed = Math.hypot(ent.x - ox, ent.y - oy) / Math.max(dt, 0.0001);
}

// --- Menschliches Feuern (auto | semi | burst) ------------------------------

function processHumanFire(state, ent, now, dtMs) {
  const w = activeWeapon(ent);
  if (!w) { ent.triggerPrev = ent.triggerHeld; return; }

  if (!ent.triggerHeld) ent.semiFired = false;
  const pressed = ent.triggerHeld && !ent.triggerPrev;
  if (pressed && w.fire === 'burst') ent.burstRemaining = w.burst;

  ent.fireCooldownMs -= dtMs;
  let guard = 0;
  while (ent.fireCooldownMs <= 0 && guard++ < 8) {
    if (isReloading(ent, now)) break;
    let emit = false;
    if (w.fire === 'auto') emit = ent.triggerHeld;
    else if (w.fire === 'semi') emit = ent.triggerHeld && !ent.semiFired;
    else if (w.fire === 'burst') emit = ent.burstRemaining > 0;
    if (!emit) break;
    const am = ent.ammo[w.id];
    if (am.mag <= 0) { startReload(ent, now, w); break; }
    fireOneShot(state, ent, now, w);
    ent.fireCooldownMs += 60000 / w.rpm;
    if (w.fire === 'semi') ent.semiFired = true;
    if (w.fire === 'burst') ent.burstRemaining--;
  }
  if (ent.fireCooldownMs < 0) ent.fireCooldownMs = 0;

  // Loslassen → letzter Schuss ist ein Crit (falls er getroffen hat).
  if (!ent.triggerHeld && ent.triggerPrev) onTriggerRelease(state, ent, now);
  ent.triggerPrev = ent.triggerHeld;
}

// --- Der eine Schuss (Hitscan + Spray + Streuung) ---------------------------

function fireOneShot(state, ent, now, w) {
  // Spray-Zähler zurücksetzen, wenn lange nicht gefeuert wurde (Muster startet neu).
  if (now - ent.lastShotTime > SPRAY_RESET_MS) ent.sprayCount = 0;
  const idx = ent.sprayCount;

  // Deterministisches Recoil-Muster (lernbar) + zufällige Streuung.
  const recoilOffset = sprayOffset(w, idx);
  let spread = SPREAD_STAND * w.spread;
  if (ent.speed > MOVING_THRESHOLD) {
    const frac = Math.min(1, ent.speed / MOVE_SPEED);
    spread += SPREAD_MOVE_ADD * frac * w.spread;
  }
  let aim = ent.angle;
  if (ent.isBot) aim += (Math.random() * 2 - 1) * BOT_AIM_ERROR;
  const ang = aim + recoilOffset + (Math.random() * 2 - 1) * spread;

  const dx = Math.cos(ang), dy = Math.sin(ang);
  const ox = ent.x, oy = ent.y;
  const walls = state.arena.walls;
  const wallDist = rayWallDistance(walls, ox, oy, dx, dy, w.range);
  let best = Math.min(wallDist, w.range);
  let hit = null;
  for (const other of state.entities) {
    if (other === ent || !other.alive || !isEnemy(state, ent, other)) continue;
    const t = rayCircle(ox, oy, dx, dy, other.x, other.y, PLAYER_RADIUS);
    if (t !== null && t >= 0 && t < best) { best = t; hit = other; }
  }
  const ex = ox + dx * best, ey = oy + dy * best;
  state.tracers.push({ x1: ox, y1: oy, x2: ex, y2: ey, t: now, color: w.color });

  ent.ammo[w.id].mag--;
  ent.sprayCount++;
  ent.lastShotTime = now;

  if (hit) {
    applyDamage(state, hit, w.damage, ent, false);
    ent.lastShot = { time: now, hitId: hit.id, damage: w.damage };
  } else {
    ent.lastShot = { time: now, hitId: null, damage: w.damage };
  }
}

// Deterministisches, lernbares Spray-Muster: leichtes Wackeln, dann starker Zug.
function sprayOffset(w, idx) {
  if (idx < SPRAY_LEARN_SHOTS) {
    return SPRAY_MILD_AMP * Math.sin(idx * SPRAY_MILD_FREQ) * w.recoil;
  }
  const over = idx - SPRAY_LEARN_SHOTS;
  const grow = Math.min(1, over / SPRAY_GROW_SHOTS);
  return SPRAY_STRONG_AMP * grow * Math.sin(over * SPRAY_STRONG_FREQ) * w.recoil;
}

// Crit-Auflösung beim Loslassen: letzter Schuss traf noch lebendes Ziel → x2.
function onTriggerRelease(state, ent, now) {
  const ls = ent.lastShot;
  ent.lastShot = null;
  if (!ls || ls.hitId == null) return;
  if (now - ls.time > CRIT_WINDOW_MS) return;
  const target = state.entities.find((e) => e.id === ls.hitId);
  if (!target || !target.alive) return;
  const bonus = ls.damage * (CRIT_MULTIPLIER - 1);
  applyDamage(state, target, bonus, ent, true);
}

// --- Schaden / Tod ----------------------------------------------------------

function applyDamage(state, target, dmg, shooter, isCrit) {
  if (!target.alive) return;
  target.hp -= dmg;
  state.effects.push({ type: isCrit ? 'crit' : 'hit', x: target.x, y: target.y, t: state.now });
  if (target.hp > 0) return;

  target.hp = 0;
  target.alive = false;
  target.triggerHeld = false;
  state.effects.push({ type: 'blood', x: target.x, y: target.y, t: state.now });
  if (shooter && shooter !== target && isEnemy(state, shooter, target)) {
    shooter.money = Math.min(MONEY_MAX, shooter.money + REWARD_KILL);
    shooter.kills++;
  }
  state.killfeed.push({ killer: shooter ? shooter.name : '—', victim: target.name, t: state.now, crit: !!isCrit });
  if (state.killfeed.length > 6) state.killfeed.shift();
  checkRoundEnd(state);
}

// --- Reload -----------------------------------------------------------------

function startReload(ent, now, w) {
  if (isReloading(ent, now)) return;
  const am = ent.ammo[w.id];
  if (am.reserve <= 0 || am.mag >= w.mag) return;
  ent.reloadUntil = now + w.reloadMs;
  ent.reloadWeaponId = w.id;
}

function finishReload(ent, now) {
  if (ent.reloadUntil <= 0 || now < ent.reloadUntil) return;
  const w = WEAPON_BY_ID.get(ent.reloadWeaponId);
  const am = ent.ammo[w.id];
  const need = w.mag - am.mag;
  const take = Math.min(need, am.reserve);
  am.mag += take;
  am.reserve -= take;
  ent.reloadUntil = 0;
  ent.sprayCount = 0;
}

function isReloading(ent, now) {
  return ent.reloadUntil > 0 && now < ent.reloadUntil;
}

// --- Bot-KI -----------------------------------------------------------------

function updateBot(state, ent, now, dt) {
  const target = nearestEnemy(state, ent);
  ent.aiTarget = target;
  if (!target) { ent.moveX = ent.moveY = 0; ent.triggerHeld = false; return; }

  const dx = target.x - ent.x, dy = target.y - ent.y;
  const dist = Math.hypot(dx, dy) || 1;
  ent.angle = Math.atan2(dy, dx);
  const nx = dx / dist, ny = dy / dist;

  if (now > ent.repathAt) { ent.repathAt = now + BOT_REPATH_MS; ent.strafe = Math.random() < 0.5 ? 1 : -1; }
  let mx = 0, my = 0;
  if (dist > BOT_PREFERRED_RANGE + 40) { mx += nx; my += ny; }
  else if (dist < BOT_PREFERRED_RANGE - 40) { mx -= nx; my -= ny; }
  mx += -ny * ent.strafe * 0.7; my += nx * ent.strafe * 0.7;

  // Anti-Stuck (Ersatz für fehlendes Pathfinding): kommt der Bot trotz Laufwunsch
  // nicht vom Fleck (Wand im Weg), weicht er kurz in eine Zufallsrichtung aus.
  const wantsMove = Math.abs(mx) + Math.abs(my) > 0.1;
  if (wantsMove && ent.speed < 20) ent.stuckMs += dt * 1000; else ent.stuckMs = 0;
  if (ent.stuckMs > 250 && now > ent.detourUntil) {
    ent.detourUntil = now + 600;
    ent.detourDir = Math.random() * Math.PI * 2;
  }
  if (now < ent.detourUntil) { mx = Math.cos(ent.detourDir); my = Math.sin(ent.detourDir); }
  ent.moveX = mx; ent.moveY = my;

  const w = activeWeapon(ent);
  if (!w) return;
  if (isReloading(ent, now)) return;
  if (ent.ammo[w.id].mag <= 0) { startReload(ent, now, w); return; }

  const canSee = dist <= w.range && !lineBlocked(state.arena.walls, ent.x, ent.y, target.x, target.y);
  if (!canSee) {
    ent.reactUntil = 0;
    if (ent.botBurst > 0) { ent.botBurst = 0; ent.botPauseUntil = now + 250; }
    return;
  }
  // Bei Sicht stehenbleiben und zielen (CS-Mechanik: nur im Stand trifft man).
  // Nur ganz leichtes Wackeln, damit sie kein statisches Ziel sind.
  ent.moveX *= 0.12; ent.moveY *= 0.12;
  if (ent.reactUntil === 0) ent.reactUntil = now + BOT_REACT_MS;
  if (now < ent.reactUntil) return;

  if (ent.botBurst <= 0 && now > ent.botPauseUntil) {
    ent.botBurst = BOT_BURST_MIN + Math.floor(Math.random() * (BOT_BURST_MAX - BOT_BURST_MIN + 1));
    ent.fireCooldownMs = 0;
  }
  if (ent.botBurst > 0) {
    ent.fireCooldownMs -= dt * 1000;
    if (ent.fireCooldownMs <= 0) {
      fireOneShot(state, ent, now, w);
      ent.fireCooldownMs += 60000 / w.rpm;
      ent.botBurst--;
      if (ent.botBurst <= 0) {
        onTriggerRelease(state, ent, now); // letzter Schuss der Salve → Crit-Chance
        ent.botPauseUntil = now + 300 + Math.random() * 500;
        ent.reactUntil = 0;
      }
    }
  }
}

function nearestEnemy(state, ent) {
  let best = null, bd = Infinity;
  for (const other of state.entities) {
    if (other === ent || !other.alive || !isEnemy(state, ent, other)) continue;
    const d = (other.x - ent.x) ** 2 + (other.y - ent.y) ** 2;
    if (d < bd) { bd = d; best = other; }
  }
  return best;
}

// --- Granaten ---------------------------------------------------------------

function updateGrenades(state, dt, now) {
  const walls = state.arena.walls;
  const remaining = [];
  for (const g of state.grenades) {
    g.fuse -= dt * 1000;
    const fr = Math.max(0, 1 - GRENADE_FRICTION * dt);
    g.vx *= fr; g.vy *= fr;
    let nx = g.x + g.vx * dt;
    let ny = g.y + g.vy * dt;
    if (circleBlocked(walls, nx, g.y, 6)) { g.vx *= -0.4; nx = g.x; }
    if (circleBlocked(walls, g.x, ny, 6)) { g.vy *= -0.4; ny = g.y; }
    g.x = nx; g.y = ny;
    if (g.fuse <= 0) { explodeGrenade(state, g, now); continue; }
    remaining.push(g);
  }
  state.grenades = remaining;
}

function explodeGrenade(state, g, now) {
  state.effects.push({ type: 'explosion', x: g.x, y: g.y, t: now });
  const owner = state.entities.find((e) => e.id === g.ownerId) || null;
  for (const ent of state.entities) {
    if (!ent.alive) continue;
    const dist = Math.hypot(ent.x - g.x, ent.y - g.y);
    if (dist > GRENADE_RADIUS) continue;
    if (lineBlocked(state.arena.walls, g.x, g.y, ent.x, ent.y)) continue; // Wand schützt
    const dmg = GRENADE_MAX_DAMAGE * (1 - dist / GRENADE_RADIUS);
    applyDamage(state, ent, dmg, owner, false);
  }
}

// --- Vergängliche Effekte altern lassen -------------------------------------

function ageTemporaries(state, now) {
  state.tracers = state.tracers.filter((t) => now - t.t < 70);
  state.effects = state.effects.filter((e) => {
    const life = e.type === 'explosion' ? 400 : (e.type === 'blood' ? 1500 : 220);
    return now - e.t < life;
  });
}

// --- Öffentliche Aktionen (von Szene/HUD aufgerufen) ------------------------

export function reloadWeapon(state) {
  const ent = state.player;
  if (!ent.alive || state.phase !== 'live') return;
  const w = activeWeapon(ent);
  if (w) startReload(ent, state.now, w);
}

export function switchSlot(state, slot) {
  const ent = state.player;
  if (!ent.alive) return;
  if (!ent.slots[slot]) return;
  ent.activeSlot = slot;
  ent.sprayCount = 0;
  ent.burstRemaining = 0;
}

export function throwGrenade(state) {
  const ent = state.player;
  if (!ent.alive || state.phase !== 'live') return { ok: false };
  if (ent.grenades <= 0) return { ok: false, reason: 'Keine Granate.' };
  if (state.now < ent.grenadeCdUntil) return { ok: false };
  ent.grenades--;
  ent.grenadeCdUntil = state.now + GRENADE_THROW_COOLDOWN_MS;
  state.grenades.push({
    x: ent.x, y: ent.y,
    vx: Math.cos(ent.angle) * GRENADE_SPEED,
    vy: Math.sin(ent.angle) * GRENADE_SPEED,
    fuse: GRENADE_FUSE_MS,
    ownerId: ent.id,
  });
  return { ok: true };
}

export function buyWeapon(state, weaponId) {
  const ent = state.player;
  if (state.phase !== 'buy') return { ok: false, reason: 'Kaufen nur in der Kaufphase.' };
  const w = WEAPON_BY_ID.get(weaponId);
  if (!w) return { ok: false, reason: 'Unbekannte Waffe.' };
  if (state.round === 1 && w.class !== 'pistol') return { ok: false, reason: 'Runde 1 ist Pistolenrunde.' };
  if (ent.money < w.price) return { ok: false, reason: 'Nicht genug Geld.' };
  ent.money -= w.price;
  giveWeapon(ent, w);
  return { ok: true };
}

export function buyGrenade(state) {
  const ent = state.player;
  if (state.phase !== 'buy') return { ok: false, reason: 'Kaufen nur in der Kaufphase.' };
  if (ent.grenades >= GRENADE_MAX_CARRY) return { ok: false, reason: 'Maximum an Granaten.' };
  if (ent.money < GRENADE_PRICE) return { ok: false, reason: 'Nicht genug Geld.' };
  ent.money -= GRENADE_PRICE;
  ent.grenades++;
  return { ok: true };
}

function giveWeapon(ent, w) {
  const slot = w.class === 'pistol' ? SLOT_SECONDARY : SLOT_PRIMARY;
  ent.slots[slot] = w.id;
  ent.ammo[w.id] = freshAmmo(w.id);
  ent.activeSlot = slot;
  ent.sprayCount = 0;
}

// --- Kleine Helfer + Getter (für Render/HUD) --------------------------------

export function activeWeapon(ent) {
  const id = ent.slots[ent.activeSlot];
  return id ? WEAPON_BY_ID.get(id) : null;
}

export function isEnemy(state, a, b) {
  return state.config.isTeam ? a.team !== b.team : a.id !== b.id;
}

// Munitionsstand der aktiven Waffe (für HUD).
export function activeAmmo(ent) {
  const id = ent.slots[ent.activeSlot];
  return id ? ent.ammo[id] : { mag: 0, reserve: 0 };
}

export function isPlayerReloading(state) {
  return isReloading(state.player, state.now);
}

// --- Interne Mathematik -----------------------------------------------------

// Strahl (normiert) gegen Kreis: kleinste Distanz ≥0 zum Eintritt oder null.
function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx, fy = oy - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / 2;
  if (t1 >= 0) return t1;
  const t2 = (-b + s) / 2;
  return t2 >= 0 ? t2 : null;
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
