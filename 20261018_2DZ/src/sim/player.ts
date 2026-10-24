// OWNER: agent "player" (C). Player creation, movement intent, survival stats, death/respawn.
import { DT, PLAYER } from '../config/sim.ts';
import type { ItemId } from '../data/schema.ts';
import type { PlayerCommand } from './commands.ts';
import { bodyCentreX, bodyCentreY, spawnDrop } from './drops.ts';
import { addItem, createInventory, takeAll } from './inventory.ts';
import { createBody, fallDamage, moveBody } from './physics.ts';
import type { Inventory, Player, SimState } from './state.ts';

function giveStartKit(inv: Inventory): void {
  for (const [item, count] of Object.entries(PLAYER.startKit) as [ItemId, number][]) addItem(inv, item, count);
}

export function createPlayer(spawnX: number, spawnY: number): Player {
  const inventory = createInventory(PLAYER.inventorySlots);
  giveStartKit(inventory);
  return {
    body: createBody(spawnX, spawnY, PLAYER.width, PLAYER.height),
    facing: 1,
    health: PLAYER.maxHealth,
    hunger: PLAYER.maxHunger,
    thirst: PLAYER.maxThirst,
    inventory,
    hotbar: 0,
    useCooldown: 0,
    invuln: 0,
    using: null,
    openContainer: -1,
    secondaryHeld: false,
    dead: false,
    respawnTimer: 0,
    spawnX,
    spawnY,
  };
}

/** Damage that ignores invulnerability and knockback (falls, starvation, bad food). Emits 'hit'. */
export function hurtPlayer(state: SimState, amount: number): void {
  const p = state.player;
  if (p.dead || amount <= 0) return;
  p.health = Math.max(0, p.health - amount);
  state.events.push({ type: 'hit', target: 'player', id: 0, x: bodyCentreX(p.body), y: bodyCentreY(p.body), damage: amount });
}

function approach(v: number, target: number, maxDelta: number): number {
  if (v < target) return Math.min(target, v + maxDelta);
  return Math.max(target, v - maxDelta);
}

function move(state: SimState, cmd: PlayerCommand): void {
  const p = state.player;
  const b = p.body;
  const moveX = Math.max(-1, Math.min(1, cmd.moveX));
  const accel = PLAYER.accel * (b.onGround ? 1 : PLAYER.airControl) * DT;
  b.vx = approach(b.vx, moveX * PLAYER.walkSpeed, accel);
  if (cmd.jump && b.onGround) b.vy = -PLAYER.jumpSpeed;
  else if (cmd.jump && b.inLiquid) b.vy = -PLAYER.swimSpeed;
  else if (cmd.down && b.inLiquid) b.vy = Math.max(b.vy, PLAYER.sinkSpeed);
  p.facing = cmd.aimX >= bodyCentreX(b) ? 1 : -1;
  const res = moveBody(state.world, b, DT, true);
  if (res.landed) hurtPlayer(state, fallDamage(res.landingSpeed));
}

function survive(state: SimState): void {
  const p = state.player;
  p.hunger = Math.max(0, p.hunger - PLAYER.hungerRate * DT);
  p.thirst = Math.max(0, p.thirst - PLAYER.thirstRate * DT);
  if (p.hunger <= 0 || p.thirst <= 0) {
    p.health = Math.max(0, p.health - PLAYER.starveDamage * DT);
  } else if (p.hunger > PLAYER.regenThreshold && p.thirst > PLAYER.regenThreshold) {
    p.health = Math.min(PLAYER.maxHealth, p.health + PLAYER.regenRate * DT);
  }
}

function die(state: SimState): void {
  const p = state.player;
  const cx = bodyCentreX(p.body);
  const cy = bodyCentreY(p.body);
  for (const stack of takeAll(p.inventory)) spawnDrop(state, cx, cy, stack);
  p.dead = true;
  p.health = 0;
  p.respawnTimer = PLAYER.respawnSeconds;
  p.using = null;
  p.openContainer = -1;
  p.body.vx = 0;
  state.events.push({ type: 'playerDied' });
}

function respawn(p: Player): void {
  const b = p.body;
  b.x = p.spawnX;
  b.y = p.spawnY;
  b.vx = 0;
  b.vy = 0;
  b.onGround = false;
  b.fallSpeed = 0;
  p.health = PLAYER.maxHealth;
  p.hunger = PLAYER.maxHunger;
  p.thirst = PLAYER.maxThirst;
  p.useCooldown = 0;
  p.invuln = PLAYER.respawnInvuln;
  p.hotbar = 0;
  p.dead = false;
  p.respawnTimer = 0;
  giveStartKit(p.inventory);
}

export function updatePlayer(state: SimState, cmd: PlayerCommand): void {
  const p = state.player;
  p.useCooldown = Math.max(0, p.useCooldown - DT);
  p.invuln = Math.max(0, p.invuln - DT);
  if (p.dead) {
    p.respawnTimer -= DT;
    if (p.respawnTimer <= 0) respawn(p);
    return;
  }
  // Damage from last tick's later systems (zombies) is checked before regen can mask it.
  if (p.health <= 0) {
    die(state);
    return;
  }
  move(state, cmd);
  survive(state);
  if (p.health <= 0) die(state);
}
