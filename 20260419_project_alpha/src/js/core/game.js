import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Clock } from './clock.js';
import { Player } from '../entities/player.js';
import { HUD } from '../ui/hud.js';
import { World } from '../world/world.js';
import { Inventory } from '../items/inventory.js';
import { PickupManager } from '../items/pickups.js';
import { getPrototype } from '../items/item-registry.js';
import { ItemId } from '../config/enums.js';
import { HOTBAR, UI } from '../config/constants.js';

// Orchestrator. Batch 1 + 2 + 3: Renderer + Input + Clock + World + Player + HUD + Inventory + Pickups.
// Folge-Batches hängen sich hier ein: MonsterSpawner, LevelManager.

export class Game {
  constructor(canvas, opts = {}) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.clock = new Clock();

    // [Batch 2] Prozedurale Welt. Seed: reloadbar über opts.seed, sonst Date.now().
    const seed = opts.seed ?? (Date.now() >>> 0);
    this.world = new World(this.renderer.scene, seed);

    this.player = new Player(this.renderer.camera);
    this.player.position.set(
      this.world.spawnPoint.x,
      this.world.spawnPoint.y,
      this.world.spawnPoint.z,
    );

    // [Batch 3] Inventar + World-Pickups.
    this.inventory = new Inventory();
    this.pickups = new PickupManager(this.renderer.scene);
    this._pickupHudState = { target: null, progress01: 0 };
    // [Batch 4] Consume-Ring-State (zweiter Progress-Ring ums Crosshair).
    this._consumeHudState = { target: null, progress01: 0 };
    this._spawnInitialPickups();

    this.hud = new HUD();

    // Start-Screen initial sichtbar; Loading-Screen wird erst nach Start-Klick
    // eingeblendet und dauert UI.LOADING_DURATION_SEC, bevor Pointer-Lock anfordert
    // wird. Während des Loading-Zustands darf der Pointer-Lock-Hook den Start-
    // Screen nicht wieder einblenden — dafür _loading-Flag.
    this._loading = false;
    this.hud.setLoadingDurationSec(UI.LOADING_DURATION_SEC);
    this.hud.setLoadingVisible(false);
    this.hud.setStartScreenVisible(!this.input.locked);
    this.input.onLockChange((locked) => {
      if (this._loading) return;
      this.hud.setStartScreenVisible(!locked);
    });
    this.hud.onStartGame(() => {
      if (this._loading) return;
      this._loading = true;
      this.hud.setStartScreenVisible(false);
      this.hud.setLoadingVisible(true);
      setTimeout(() => {
        this.hud.setLoadingVisible(false);
        this._loading = false;
        // Pointer-Lock braucht User-Activation; nach 3s Timeout kann sie
        // abgelaufen sein. Wenn der Request scheitert, fährt der LockChange-
        // Hook nicht — der Start-Screen wird dann über das Promise-Reject
        // bzw. den pointerlockerror-Pfad wieder eingeblendet. Greift der Lock,
        // feuert onLockChange(true) und blendet den Start-Screen ohnehin aus.
        const onFail = () => this.hud.setStartScreenVisible(true);
        try {
          const p = canvas.requestPointerLock?.();
          if (p && typeof p.then === 'function') p.catch(onFail);
        } catch { onFail(); }
      }, UI.LOADING_DURATION_SEC * 1000);
    });
    // Options-Button: Platzhalter — Menü folgt in späterem Batch.
    this.hud.onOptions(() => {});

    // Hooks für Folge-Batches:
    this.monsterSpawner = null;   // [Batch 6]
    this.levelManager = null;     // [Batch 8]

    this._running = false;
    this._prevNow = 0;
    this._loop = this._loop.bind(this);
  }

  start() {
    this._running = true;
    this._prevNow = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this._running = false;
  }

  _loop(now) {
    if (!this._running) return;
    const dt = Math.min((now - this._prevNow) / 1000, 0.1);
    this._prevNow = now;

    this._update(dt);
    this._render();
    this.input.endFrame();

    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    // Nur ticken, wenn Pointer-Lock aktiv ist — sonst pausiert die Zeit.
    if (this.input.locked) {
      this.clock.tick(dt);
      this.world.update(dt);
      this.player.update(dt, this.input, this.world);
      // [Batch 4] Stat-Decay + Health-Regen — pausiert identisch zu Clock/World.
      this.player.tickStats(dt);
      // [Batch 3] Inventar-Inputs + Pickup-Hold. [Batch 4] Hold-to-Consume.
      this._handleInventoryInput(dt);
      this.inventory.tick(dt);
      this.pickups.update(dt);
    }
    // [Batch 6]: this.monsterSpawner?.update(dt, this.clock, this.player);
    // [Batch 8]: this.levelManager?.checkObjective(this.player, this.world);

    // Sky synchronisieren (auch bei pausierter Zeit, damit initiale Szene stimmt).
    const sky = this.clock.getSkyParams();
    this.renderer.applySky(sky);
    const sunAngle = this.clock.getSunAngle01();
    if (sunAngle >= 0) this.renderer.setSunPosition(sunAngle);

    this.hud.update(this.player, this.clock, this.inventory, this._pickupHudState, this._consumeHudState);
  }

  _render() {
    this.renderer.render();
  }

  // [Batch 3] Test-Pickups am Spawn. [Batch 4] zusätzliche Consumables für
  // Hunger/Thirst/Health-Tests. Statisch, bis Batch 2-Loot-Tables kommen.
  _spawnInitialPickups() {
    const sp = this.world.spawnPoint;
    const layout = [
      { id: ItemId.SNACK,          dx:  3, dz:  0, count: 2 },
      { id: ItemId.WATER_BOTTLE,   dx: -3, dz:  0, count: 1 },
      { id: ItemId.CANNED_SOUP,    dx:  3, dz:  1, count: 1 },
      { id: ItemId.SODA_CAN,       dx: -3, dz:  1, count: 1 },
      { id: ItemId.PAINKILLERS,    dx:  2, dz:  2, count: 1 },
      { id: ItemId.PISTOL,         dx:  0, dz:  4, count: 1 },
      { id: ItemId.AMMO_PISTOL,    dx:  1, dz:  5, count: 12 },
      { id: ItemId.MELEE_BAT,      dx: -4, dz:  3, count: 1 },
      { id: ItemId.TIRE,           dx:  4, dz:  3, count: 1 },
      { id: ItemId.MACHINE_GUN,    dx:  0, dz: -4, count: 1 },
      { id: ItemId.KEYCARD_SUBWAY, dx: -2, dz: -4, count: 1 },
    ];
    for (const e of layout) {
      this.pickups.spawn(getPrototype(e.id), { x: sp.x + e.dx, z: sp.z + e.dz }, e.count);
    }
  }

  _handleInventoryInput(dt) {
    // Slot-Keys 1..8
    for (let i = 0; i < HOTBAR.SLOT_COUNT; i++) {
      if (this.input.consumeKey(`Digit${i + 1}`)) this.inventory.setActive(i);
    }

    // Mausrad → cycle
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.inventory.cycle(wheel);

    // Drop (Q)
    if (this.input.consumeKey('KeyQ')) {
      const dropped = this.inventory.dropActive();
      if (dropped) this.pickups.dropInFrontOf(this.player, dropped);
    }

    // Pickup-Hold (E)
    const holdingE = this.input.isDown('KeyE');
    const state = this.pickups.tickHold(dt, holdingE, this.player.position, this.inventory);
    this._pickupHudState.target = state.target;
    this._pickupHudState.progress01 = state.progress01;

    // [Batch 4] Left-Click-Hold auf Consumable → tickActiveHold füllt Progress-Ring.
    const leftDown = this.input.mouseButtons.left;
    const ctx = { player: this.player, world: this.world, clock: this.clock };
    const consumeState = this.inventory.tickActiveHold(dt, leftDown, ctx);
    this._consumeHudState.target = consumeState.target;
    this._consumeHudState.progress01 = consumeState.progress01;

    // Use aktives Item (Left-Click, Rising-Edge). Consumables werden von useActive
    // übersprungen — sie laufen via tickActiveHold. Batch 5 füllt den Waffen-Pfad.
    if (this.input.consumeMouseButton('left')) {
      this.inventory.useActive(ctx);
    }
  }
}
