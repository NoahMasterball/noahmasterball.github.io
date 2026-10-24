import { GUNPLAY, isTimeUp } from '../../config/sim.ts';
import type { HitZone, WeaponDef } from '../../data/schema.ts';
import { damageGadget } from '../abilities/gadgets.ts';
import { canHarm } from '../abilities/targeting.ts';
import { BUTTON, isHeld, wasPressed, type Command } from '../command.ts';
import { falloffDamage, pelletDamage, shotInterval } from '../combat/damage.ts';
import { recoilKick } from '../combat/recoil.ts';
import { sampleConeDirection } from '../combat/spread.ts';
import { characterById, type SimContext } from '../context.ts';
import { createWeaponState, WEAPON_SLOTS } from '../entities.ts';
import { eyeHeight } from '../hitbox.ts';
import { DEG2RAD, forwardFromAngles, lerp, moveTowards, rightFromYaw, type Vec3 } from '../math.ts';
import { nextRandom } from '../rng.ts';
import {
  activeWeapon,
  canFire,
  currentSpread,
  damageTakenMultiplier,
  modifierProduct,
  operatorOf,
  weaponBlockedBy,
  weaponOf,
} from '../stats.ts';
import type { CharacterEntity, DamageCause, GadgetEntity, WeaponState } from '../types.ts';
import { applyDamage } from './health.ts';

// NEW — weapon system (SPEC §6): weapon swap, ADS, reload, fire cadence, spread, recoil, hitscan
// pellets against characters and gadgets. Runs after the physics step so rays see this tick's
// hitboxes and gadgets (ADR-0002, ADR-0012 §4.3). A channel or a placement blocks the weapon
// (weaponBlockedBy).

const ZONE_PRIORITY: Record<HitZone, number> = { head: 3, torso: 2, limb: 1 };

/** Eye position and aim direction including the recoil aim offset (ADR-0009): the crosshair.
 *  `look` replaces the character's look (ability activations in step 4 aim with the command's
 *  look, which movement adopts only later in the tick). */
export function aimOf(e: Readonly<CharacterEntity>, look?: { yaw: number; pitch: number }): { origin: Vec3; yaw: number; pitch: number } {
  return {
    origin: { x: e.pos.x, y: e.pos.y + eyeHeight(e.stance), z: e.pos.z },
    yaw: (look?.yaw ?? e.yaw) + e.weapon.recoilYaw,
    pitch: (look?.pitch ?? e.pitch) + e.weapon.recoilPitch,
  };
}

// ── Weapon swap ─────────────────────────────────────────────────────────────

/** Slot this command asks for, or null. A direct slot button wins over swapWeapon (next slot). */
function requestedSlot(e: CharacterEntity, pressed: (bit: number) => boolean): number | null {
  const direct = WEAPON_SLOTS.findIndex((slot) => pressed(BUTTON[slot.button]));
  if (direct >= 0) return direct;
  return pressed(BUTTON.swapWeapon) ? (e.activeSlot + 1) % e.weapons.length : null;
}

/** Starts a swap to `slot`. The handling state is reset, so nothing of the old weapon leaks into
 *  the new one (a running reload is cancelled). Recoil offset and ADS are what the camera shows:
 *  they are kept and return to rest during the swap instead of snapping. A swap requested
 *  mid-swap reverses the elapsed part, so the hands never jump. */
function startSwap(ctx: SimContext, e: CharacterEntity, slot: number): void {
  const ws = e.weapon;
  const { recoilPitch, recoilYaw, prevRecoilPitch, prevRecoilYaw, ads, prevAds } = ws;
  const remaining = GUNPLAY.weaponSwapSeconds - ws.swapRemaining;
  Object.assign(ws, createWeaponState(), {
    recoilPitch,
    recoilYaw,
    prevRecoilPitch,
    prevRecoilYaw,
    ads,
    prevAds,
    swapRemaining: remaining,
    prevSwapRemaining: remaining,
  });
  e.activeSlot = slot;
  ctx.emit({ type: 'weaponSwap', entityId: e.id, slot, weaponId: activeWeapon(e).weaponId });
}

function advanceSwap(ws: WeaponState, dt: number): void {
  if (ws.swapRemaining <= 0) return;
  const ends = isTimeUp(ws.swapRemaining - dt);
  // The recoil aim offset reaches rest exactly when the swap ends: the camera stays continuous
  // and the new weapon starts from zero.
  const k = ends ? 1 : dt / ws.swapRemaining;
  ws.recoilPitch -= ws.recoilPitch * k;
  ws.recoilYaw -= ws.recoilYaw * k;
  ws.swapRemaining = ends ? 0 : ws.swapRemaining - dt;
}

// ── Reload and fire ─────────────────────────────────────────────────────────

/** Starts a reload if one makes sense; never while an ability blocks the weapon. */
function startReload(ctx: SimContext, e: CharacterEntity, w: WeaponDef): void {
  const carried = activeWeapon(e);
  if (e.weapon.reloadRemaining > 0 || carried.ammo >= w.magazine || carried.reserve <= 0 || weaponBlockedBy(e)) return;
  e.weapon.reloadRemaining = w.reloadTime;
  ctx.emit({ type: 'reloadStart', entityId: e.id, duration: w.reloadTime });
}

function finishReload(ctx: SimContext, e: CharacterEntity, w: WeaponDef): void {
  const carried = activeWeapon(e);
  const moved = Math.min(w.magazine - carried.ammo, carried.reserve);
  carried.ammo += moved;
  carried.reserve -= moved;
  e.weapon.reloadRemaining = 0;
  ctx.emit({ type: 'reloadEnd', entityId: e.id });
}

interface PendingHit {
  victim: CharacterEntity;
  damage: number;
  zone: HitZone;
  point: Vec3;
  distance: number;
}

/** A gadget's share of one shot: its pellets' falloff damage (no zone, armour or modifiers). */
interface PendingGadgetHit {
  gadget: GadgetEntity;
  damage: number;
  point: Vec3;
}

function fireShot(ctx: SimContext, e: CharacterEntity, w: WeaponDef): void {
  const ws = e.weapon;
  const aim = aimOf(e);
  const forward = forwardFromAngles(aim.yaw, aim.pitch);
  const right = rightFromYaw(aim.yaw);
  const up = forwardFromAngles(aim.yaw, aim.pitch + Math.PI / 2);
  const cone = currentSpread(e, w);
  const hits = new Map<number, PendingHit>();
  const gadgetHits = new Map<number, PendingGadgetHit>();
  let firstDir: Vec3 | null = null;

  for (let p = 0; p < w.pellets; p++) {
    // The shooter's own stream (ADR-0014 §2): a client predicts its spread whoever else fires.
    const dir = sampleConeDirection(forward, right, up, cone, nextRandom(e.rng), nextRandom(e.rng));
    firstDir ??= dir;
    const hit = ctx.physics.castBullet(aim.origin, dir, w.maxRange, e.id);
    if (!hit) continue;
    const target = hit.target;
    if (target?.kind === 'gadget') {
      // The pellet stops at a gadget. One removed earlier this tick counts as level geometry; an
      // own-team one without friendly fire takes nothing; both mark like a wall.
      const gadget = ctx.state.gadgets.find((g) => g.id === target.entityId);
      if (!gadget || !canHarm(e.team, gadget.team)) {
        ctx.emit({ type: 'impact', attackerId: e.id, point: hit.point, normal: hit.normal });
        continue;
      }
      const damage = falloffDamage(w, hit.distance);
      const pendingGadget = gadgetHits.get(gadget.id);
      if (pendingGadget) pendingGadget.damage += damage;
      else gadgetHits.set(gadget.id, { gadget, damage, point: hit.point });
      continue;
    }
    if (!target) {
      ctx.emit({ type: 'impact', attackerId: e.id, point: hit.point, normal: hit.normal });
      continue;
    }
    const victim = characterById(ctx.state, target.entityId);
    if (!victim || !victim.alive) continue;
    if (!canHarm(e.team, victim.team)) continue;
    const damage = pelletDamage(w, target.zone, hit.distance, operatorOf(victim).armour, damageTakenMultiplier(victim));
    const pending = hits.get(victim.id);
    if (!pending) {
      hits.set(victim.id, { victim, damage, zone: target.zone, point: hit.point, distance: hit.distance });
    } else {
      pending.damage += damage;
      if (ZONE_PRIORITY[target.zone] > ZONE_PRIORITY[pending.zone]) pending.zone = target.zone;
    }
  }

  ctx.emit({ type: 'shot', entityId: e.id, weaponId: w.id, origin: aim.origin, dir: firstDir ?? forward });

  // Recoil and bloom after the shot (the first shot of a burst is unaffected by its own kick).
  const [kickPitch, kickYaw] = recoilKick(w.recoil, ws.shotIndex);
  const kickScale = lerp(1, w.recoil.adsMultiplier, ws.ads) * modifierProduct(e, 'recoil');
  ws.recoilPitch += kickPitch * kickScale * DEG2RAD;
  ws.recoilYaw -= kickYaw * kickScale * DEG2RAD; // positive pattern yaw = kick to the right
  ws.bloom = Math.min(ws.bloom + w.spreadPerShot, w.maxSpread);
  ws.shotIndex += 1;
  ws.sinceLastShot = 0;
  activeWeapon(e).ammo -= 1;

  const cause: DamageCause = { kind: 'weapon', weaponId: w.id };
  for (const h of hits.values()) {
    applyDamage(ctx, e, h.victim, {
      amount: h.damage,
      zone: h.zone,
      point: h.point,
      distance: h.distance,
      cause,
      sourcePos: aim.origin,
    });
  }
  for (const g of gadgetHits.values()) damageGadget(ctx, g.gadget, g.damage, e.id, cause, g.point);
}

export function weaponSystem(ctx: SimContext, e: CharacterEntity, cmd: Command, dt: number): void {
  const pressed = (bit: number): boolean => wasPressed(cmd.buttons, e.lastButtons, bit);
  // An ability that blocks the weapon (channel, placement) holds it down: no swap (a swap press
  // already cancelled a placement in the ability step), no ADS, no reload (a running one is
  // cancelled), no shot (canFire; a trigger press waits in the buffer as during a swap).
  const blocked = weaponBlockedBy(e) !== null;
  const slot = blocked ? null : requestedSlot(e, pressed);
  if (slot !== null && slot !== e.activeSlot) startSwap(ctx, e, slot);

  const w = weaponOf(e);
  const ws = e.weapon;
  ws.sinceLastShot += dt;
  advanceSwap(ws, dt);
  const swapping = ws.swapRemaining > 0;

  if (blocked) ws.reloadRemaining = 0;
  if (ws.reloadRemaining > 0) {
    ws.reloadRemaining -= dt;
    if (isTimeUp(ws.reloadRemaining)) finishReload(ctx, e, w);
  }

  const wantsAds = isHeld(cmd.buttons, BUTTON.ads) && !e.sprinting && ws.reloadRemaining <= 0 && !swapping && !blocked;
  ws.ads = moveTowards(ws.ads, wantsAds ? 1 : 0, dt / w.adsTime);

  if (!swapping && pressed(BUTTON.reload)) startReload(ctx, e, w);

  // Trigger buffer (GUNPLAY.triggerBufferSeconds): a press the weapon cannot answer yet (swap,
  // sprint-out, reload) waits for it instead of being lost. Held auto fire needs no buffer.
  const held = isHeld(cmd.buttons, BUTTON.fire);
  if (pressed(BUTTON.fire)) ws.triggerBuffer = GUNPLAY.triggerBufferSeconds;
  else if (!held) ws.triggerBuffer = isTimeUp(ws.triggerBuffer - dt) ? 0 : ws.triggerBuffer - dt;
  const pull = ws.triggerBuffer > 0;
  // Fire cadence: a running cooldown counts down from the tick after its shot, and the next shot
  // may fire once its time is up (isTimeUp), so a shot interval lasts secondsToTicks(interval)
  // ticks. Sustained fire carries the rest (±½ tick) into the next interval: the average rate is
  // exact. A weapon that waited out its cooldown starts the next interval from zero.
  if (ws.fireCooldown > 0) ws.fireCooldown -= dt;
  let fired = false;
  if ((pull || (w.fireMode === 'auto' && held)) && canFire(e)) {
    // A pull is answered once: by a shot, a dry fire, or (cadence cooldown still running) by
    // nothing — a press never fires later than the first tick the weapon is up.
    ws.triggerBuffer = 0;
    const carried = activeWeapon(e);
    if (carried.ammo <= 0) {
      if (pull) ctx.emit({ type: 'dryFire', entityId: e.id });
      startReload(ctx, e, w);
    } else {
      while (isTimeUp(ws.fireCooldown) && carried.ammo > 0) {
        fireShot(ctx, e, w);
        ws.fireCooldown += shotInterval(w);
        fired = true;
        if (w.fireMode === 'semi') break;
      }
      // Empty magazine: the reload starts immediately (the TTK model assumes the same).
      if (carried.ammo <= 0) startReload(ctx, e, w);
    }
  }
  if (!fired) ws.fireCooldown = Math.max(ws.fireCooldown, 0);

  // Recovery only once the weapon is idle for longer than one shot interval, so a sustained
  // spray keeps its full pattern while taps between shots recover.
  if (ws.sinceLastShot > shotInterval(w)) {
    ws.bloom = Math.max(0, ws.bloom - w.spreadRecovery * dt);
    const step = w.recoil.recovery * DEG2RAD * dt;
    ws.recoilPitch = moveTowards(ws.recoilPitch, 0, step);
    ws.recoilYaw = moveTowards(ws.recoilYaw, 0, step);
  }
  if (ws.sinceLastShot >= w.recoil.resetTime) ws.shotIndex = 0;
}
