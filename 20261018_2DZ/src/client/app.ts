// NEW — the running game: owns the SimState instance, steps it at a fixed rate from input
// commands, routes each frame's SimEvents to effects/audio/HUD and renders.
import { APP, LOOP, PLAYER_LOOK, type ActionId } from '../config/client.ts';
import { WORLD } from '../config/sim.ts';
import { createSim, step } from '../sim/sim.ts';
import type { SimEvent, SimState } from '../sim/state.ts';
import { Audio } from './audio.ts';
import { worldToCss } from './camera.ts';
import { readTheme } from './dom.ts';
import { Input } from './input.ts';
import { FixedStepper } from './loop.ts';
import { installQa, markReady } from './qa.ts';
import { Renderer } from './render/renderer.ts';
import { Hud } from './ui/hud.ts';
import { InventoryScreen } from './ui/inventory.ts';
import { DebugOverlay, PauseMenu } from './ui/menu.ts';

/** Events kept for the QA hook. */
const QA_EVENT_HISTORY = 2000;

/** Pure: seed from the page query (?seed=…), else WORLD.defaultSeed. */
export function seedFromQuery(search: string): number {
  const raw = new URLSearchParams(search).get(APP.seedParam);
  if (raw === null || raw.trim() === '') return WORLD.defaultSeed;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) >>> 0 : WORLD.defaultSeed;
}

export function startApp(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  const state: SimState = createSim(seedFromQuery(location.search));
  const theme = readTheme();
  const renderer = new Renderer(canvas, theme);
  const audio = new Audio();
  const stepper = new FixedStepper();
  let paused = false;
  let wasDead = state.player.dead;
  const qaEvents: SimEvent[] = [];

  const hud = new Hud(ui, (c) => input.send(c));
  const inventory = new InventoryScreen(ui, (c) => input.send(c));
  const debug = new DebugOverlay(ui);
  const setPaused = (p: boolean): void => {
    paused = p;
    if (p) input.releaseAll();
    stepper.reset();
    menu.show(p, audio.muted);
  };
  const menu = new PauseMenu(
    ui,
    () => setPaused(false),
    () => {
      audio.toggleMute();
      menu.show(paused, audio.muted);
    },
  );

  const onAction = (a: ActionId): void => {
    switch (a) {
      case 'menu':
        if (inventory.open) inventory.setOpen(false);
        else setPaused(!paused);
        break;
      case 'inventory':
        if (!paused && !state.player.dead) inventory.setOpen(!inventory.open);
        break;
      case 'debug':
        debug.toggle();
        break;
      case 'mute':
        audio.toggleMute();
        menu.show(paused, audio.muted);
        break;
      case 'drop':
        if (paused || state.player.dead) break;
        if (!inventory.dropHovered()) input.send({ type: 'dropStack', from: { where: 'player', slot: state.player.hotbar }, count: 1 });
        break;
      default:
        break;
    }
  };
  const input = new Input(canvas, onAction);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });

  const handleEvent = (e: SimEvent): void => {
    renderer.effects.handle(e);
    audio.handle(e);
    hud.handle(e);
    switch (e.type) {
      case 'hit':
        renderer.entities.flash(e.target === 'player' ? 'p' : `z${e.id}`, PLAYER_LOOK.flashSeconds);
        break;
      case 'melee':
      case 'shot':
      case 'tileHit':
      case 'tileBroken':
      case 'wallBroken':
      case 'tilePlaced':
        renderer.entities.swing = PLAYER_LOOK.swingSeconds;
        break;
      default:
        break;
    }
  };

  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  installQa({
    state: () => state,
    paused: () => paused,
    fps: () => fps,
    events: () => qaEvents,
    send: (c) => {
      input.send(c);
      // A teleport must not pan the camera across the world (the cut applies on the next render,
      // after the step that teleports).
      if (c.type === 'qaTeleport') renderer.camera.cut();
    },
    worldToCss: (x, y) => worldToCss(renderer.view, x, y),
  });

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(LOOP.maxFrameSeconds, Math.max(0, (now - last) / 1000));
    last = now;
    fpsFrames += 1;
    fpsTime += dt;
    if (fpsTime >= LOOP.fpsWindowSeconds) {
      fps = fpsFrames / fpsTime;
      fpsFrames = 0;
      fpsTime = 0;
    }
    input.worldBlocked = paused || state.player.dead;
    const frameEvents: SimEvent[] = [];
    let alpha = 1;
    if (!paused) {
      alpha = stepper.advance(dt, () => {
        renderer.entities.snapshot(state);
        step(state, input.buildCommand(renderer.view, state.player.hotbar));
        for (const e of state.events) frameEvents.push(e);
      });
    }
    audio.beginFrame();
    for (const e of frameEvents) handleEvent(e);
    if (frameEvents.length > 0) {
      qaEvents.push(...frameEvents);
      if (qaEvents.length > QA_EVENT_HISTORY) qaEvents.splice(0, qaEvents.length - QA_EVENT_HISTORY);
    }
    if (!paused) audio.ambient(state, dt);

    const p = state.player;
    if (p.openContainer >= 0 && !inventory.open) inventory.setOpen(true);
    if (p.dead && inventory.open) inventory.setOpen(false);
    if (wasDead && !p.dead) renderer.camera.cut();
    wasDead = p.dead;

    renderer.render(state, alpha, paused ? 0 : dt, input.cursor(), !paused && !p.dead);
    hud.update(state);
    hud.setHotbarVisible(!inventory.open);
    inventory.update(state);
    debug.update(state, { fps, chunksCached: renderer.chunks.cachedCount, chunksBuilt: renderer.chunks.builtLastFrame });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
    markReady();
  });
}
