import * as THREE from 'three';
import { WEAPONS, WEAPON_VFX, MELEE } from '../config/constants.js';
import { ItemId } from '../config/enums.js';
import { hitScan } from '../core/hit-scan.js';
import { consumeFromReserve, getReserve } from './ammo.js';

// Waffen-Factory. Analog zu items/food.js:makeConsumeUse — liest die Waffen-Daten
// aus constants.js:WEAPONS und baut onUse / onAutoFire Handler für das
// item-registry.
//
// Laufzeit-State pro Inventar-Instanz liegt in item.runtime:
//   { magAmmo, reloadTimer, fireCooldown }
// - magAmmo:      aktuelle Ladung des Magazins (0..magSize). Melee: 0.
// - reloadTimer:  > 0 während Reload läuft; blockiert Feuern.
// - fireCooldown: Sekunden bis zum nächsten Shot (Rate-Limit über fireRate).
//
// Dispatch:
//   useActive()  → onUse feuert Single-Shot (Pistole/Shotgun/Melee). MG (fullAuto) no-op.
//   tickActiveFire() → onAutoFire feuert dauerhaft, solange holding + magAmmo > 0.
//   startReload() + tickReload() werden von Inventory getrieben.

const _origin = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tracerStart = new THREE.Vector3();
const _muzzlePos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _sideAxis = new THREE.Vector3();
const _quat = new THREE.Quaternion();

const WEAPON_KEY_BY_ID = Object.freeze({
  [ItemId.MELEE_BAT]:   'MELEE_BAT',
  [ItemId.PISTOL]:      'PISTOL',
  [ItemId.SHOTGUN]:     'SHOTGUN',
  [ItemId.MACHINE_GUN]: 'MACHINE_GUN',
});

export function isWeaponId(itemId) {
  return itemId in WEAPON_KEY_BY_ID;
}

export function getWeaponConfig(itemId) {
  const key = WEAPON_KEY_BY_ID[itemId];
  return key ? WEAPONS[key] : null;
}

// Lazy-init des Waffen-Laufzeit-States. addItem bzw. dropInFrontOf duplizieren
// den Prototyp über createItem — runtime bleibt zuerst null, wir füllen sie
// beim ersten Zugriff. magSize aus constants.js = volles Magazin beim Spawn
// (Pickup bringt geladene Waffe mit, Reserve kommt separat als Ammo-Item).
export function ensureWeaponRuntime(item) {
  if (item.runtime) return item.runtime;
  const cfg = getWeaponConfig(item.id);
  item.runtime = {
    magAmmo: cfg?.magSize ?? 0,
    reloadTimer: 0,
    fireCooldown: 0,
  };
  return item.runtime;
}

export function makeWeaponUse(itemId) {
  const cfg = getWeaponConfig(itemId);
  if (!cfg) throw new Error(`Kein WEAPONS-Eintrag für ItemId "${itemId}"`);
  const isMelee = !cfg.ammoType;
  const isAuto = !!cfg.fullAuto;

  return function onUseWeapon(ctx, item) {
    // Full-Auto läuft ausschließlich über tickActiveFire — der Rising-Edge-
    // Klick darf hier nicht zusätzlich feuern, sonst doppelter Schuss.
    if (isAuto) return { consumed: false };

    const rt = ensureWeaponRuntime(item);
    if (rt.reloadTimer > 0 || rt.fireCooldown > 0) return { consumed: false };

    if (isMelee) {
      fireMelee(ctx, cfg);
    } else {
      if (rt.magAmmo <= 0) return { consumed: false };
      fireHitscan(ctx, cfg);
      rt.magAmmo -= 1;
    }
    rt.fireCooldown = 1 / cfg.fireRate;
    return { consumed: false };
  };
}

export function makeWeaponAutoFire(itemId) {
  const cfg = getWeaponConfig(itemId);
  if (!cfg || !cfg.fullAuto) return null;

  return function onAutoFire(dt, holding, ctx, item) {
    const rt = ensureWeaponRuntime(item);
    if (rt.fireCooldown > 0) rt.fireCooldown = Math.max(0, rt.fireCooldown - dt);
    if (rt.reloadTimer > 0) return false;
    if (!holding) return false;
    if (rt.fireCooldown > 0) return false;
    if (rt.magAmmo <= 0) return false;
    fireHitscan(ctx, cfg);
    rt.magAmmo -= 1;
    rt.fireCooldown = 1 / cfg.fireRate;
    return true;
  };
}

// Ticket in den Reload-Zustand, falls passend. Gibt true zurück, wenn ein
// Reload gestartet wurde — HUD kann daraus Feedback ableiten.
export function startReload(item, inventory) {
  const cfg = getWeaponConfig(item.id);
  if (!cfg || !cfg.ammoType) return false;
  const rt = ensureWeaponRuntime(item);
  if (rt.reloadTimer > 0) return false;
  if (rt.magAmmo >= cfg.magSize) return false;
  if (getReserve(inventory, cfg.ammoType) <= 0) return false;
  rt.reloadTimer = cfg.reloadSec;
  return true;
}

// Pro Frame für das aktive Item. Läuft Reload-Timer ab, füllt beim Abschluss
// aus der Reserve auf. fireCooldown ticken wir hier ebenfalls runter, damit
// Single-Shot-Waffen zwischen Klicks den Rate-Limit korrekt abkühlen.
export function tickWeapon(dt, item, inventory) {
  const cfg = getWeaponConfig(item.id);
  if (!cfg) return;
  const rt = ensureWeaponRuntime(item);

  if (rt.fireCooldown > 0 && !cfg.fullAuto) {
    rt.fireCooldown = Math.max(0, rt.fireCooldown - dt);
  }

  if (rt.reloadTimer > 0) {
    rt.reloadTimer = Math.max(0, rt.reloadTimer - dt);
    if (rt.reloadTimer <= 0) {
      const needed = (cfg.magSize ?? 0) - rt.magAmmo;
      if (needed > 0) {
        const got = consumeFromReserve(inventory, cfg.ammoType, needed);
        rt.magAmmo += got;
      }
    }
  }
}

// --- Fire-Pfade ---

function fireHitscan(ctx, cfg) {
  sampleCameraRay(ctx, _origin, _forward);
  spawnMuzzleFlash(ctx, _origin, _forward);

  const pellets = cfg.pellets ?? 1;
  for (let i = 0; i < pellets; i++) {
    applyConeSpread(_forward, cfg.spread ?? 0, _tmpDir);
    performRayShot(ctx, _origin, _tmpDir, cfg);
  }
}

function fireMelee(ctx, cfg) {
  sampleCameraRay(ctx, _origin, _forward);
  const rays = Math.max(1, MELEE.ARC_RAYS | 0);
  const arcRad = MELEE.ARC_DEG * Math.PI / 180;
  for (let i = 0; i < rays; i++) {
    const t = rays > 1 ? (i / (rays - 1)) - 0.5 : 0;   // -0.5 .. 0.5
    const angle = t * arcRad;
    _quat.setFromAxisAngle(_up, angle);
    _tmpDir.copy(_forward).applyQuaternion(_quat).normalize();
    performRayShot(ctx, _origin, _tmpDir, cfg);
  }
}

function performRayShot(ctx, origin, direction, cfg) {
  const targets = ctx.targets ?? [];
  const hit = hitScan({ origin, direction, range: cfg.range, targets });
  const endPoint = hit
    ? hit.point
    : _tmpEnd().copy(origin).addScaledVector(direction, cfg.range);

  if (ctx.tracers) {
    _tracerStart.copy(origin)
      .addScaledVector(direction, WEAPON_VFX.TRACER_ORIGIN_FORWARD);
    _tracerStart.y -= WEAPON_VFX.TRACER_ORIGIN_DROP;
    ctx.tracers.addTracer(_tracerStart, endPoint);
  }

  if (hit && hit.hpOwner && typeof hit.hpOwner.takeDamage === 'function') {
    hit.hpOwner.takeDamage(cfg.damage);
  }
}

function spawnMuzzleFlash(ctx, origin, direction) {
  if (!ctx.tracers) return;
  _muzzlePos.copy(origin).addScaledVector(direction, WEAPON_VFX.TRACER_ORIGIN_FORWARD);
  _muzzlePos.y -= WEAPON_VFX.TRACER_ORIGIN_DROP;
  ctx.tracers.addMuzzleFlash(_muzzlePos);
}

// Kopf-Richtung + Augenposition aus dem Player-Camera. Spiegelt die gleiche
// Konvention wie player.js (yaw=0 → blickt -Z), die Camera-Matrix ist bereits
// im Renderer gepflegt, also nutzen wir direkt getWorldPosition/-Direction.
function sampleCameraRay(ctx, outOrigin, outDirection) {
  const cam = ctx.player.camera;
  cam.getWorldPosition(outOrigin);
  cam.getWorldDirection(outDirection);
  outDirection.normalize();
}

// Setzt `out` auf einen leicht um den Vektor `forward` gestreuten Richtungsvektor.
// `spread` ist der Halb-Winkel in Radiant (~0.02 = ca. 1.1°). Gleichverteilung
// in XY um die Forward-Achse — Monte-Carlo reicht für Shotgun-Fan + Pistolen-
// Mikro-Spread.
function applyConeSpread(forward, spread, out) {
  out.copy(forward);
  if (spread <= 0) return;
  _sideAxis.set(-forward.z, 0, forward.x);
  if (_sideAxis.lengthSq() < 1e-6) _sideAxis.set(1, 0, 0);
  _sideAxis.normalize();
  const angleX = (Math.random() * 2 - 1) * spread;
  const angleY = (Math.random() * 2 - 1) * spread;
  _quat.setFromAxisAngle(_up, angleX);
  out.applyQuaternion(_quat);
  _quat.setFromAxisAngle(_sideAxis, angleY);
  out.applyQuaternion(_quat);
  out.normalize();
}

// Scratch-Vector für Shot-Endpunkte — wiederverwendet, damit wir pro Shot keine
// Allokationen haben. Lazy, weil Three.js beim Import-Zeitpunkt schon geladen ist.
let _endScratch = null;
function _tmpEnd() {
  if (!_endScratch) _endScratch = new THREE.Vector3();
  return _endScratch;
}
