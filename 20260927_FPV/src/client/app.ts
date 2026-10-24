import { Vector3 } from 'three';
import {
  ABILITY_VISUALS,
  bindingLabel,
  HUD,
  SHOT_STAGING,
  TEAM_STYLE,
  VIEWMODEL,
  type ClientAction,
  type ShotAbility,
  type ShotDef,
  type ShotLaunch,
  type ShotLook,
  type ShotSample,
  type StagedKill,
} from '../config/client.ts';
import { ABILITY_RULES, GUNPLAY, RELAY, secondsToTicks, TICK_DT } from '../config/sim.ts';
import { getAbility, getHitboxProfile, getOperator, getWeapon } from '../data/content.ts';
import type { Vec3Tuple } from '../data/schema.ts';
import { placementPose } from '../sim/abilities/placement.ts';
import { canActivate, readiness } from '../sim/abilities/resource.ts';
import { ABILITY_BUTTONS, BUTTON } from '../sim/command.ts';
import { WEAPON_SLOTS } from '../sim/entities.ts';
import { eyeHeight, partWorldCenter, zoneWorldCenter } from '../sim/hitbox.ts';
import { anglesTo, DEG2RAD, forwardFromAngles, fromTuple, lerp, lerpVec3, moveTowards, type Vec3 } from '../sim/math.ts';
import { otherTeam, roundMatchOf, sideOf } from '../sim/modes/format.ts';
import { matchAbilityAllowed, matchSetupWallsUp, operatorChoices } from '../sim/modes/index.ts';
import { relayOf } from '../sim/modes/relay.ts';
import type { ModeId } from '../sim/modes/mode.ts';
import type { Sim } from '../sim/sim.ts';
import {
  activeWeapon,
  canFire,
  channelProgress,
  currentSpread,
  gadgetCount,
  isRevealedTo,
  operatorOf,
  shieldAmount,
  swapProgress,
  topSpeed,
  weaponBlockedBy,
  weaponOf,
} from '../sim/stats.ts';
import { hasActivation, isAbilitySupported } from '../sim/systems/abilities.ts';
import type { AbilityState, CharacterEntity, DamageCause, EntityId, MatchPhase, SimEvent } from '../sim/types.ts';
import { Sfx, type AbilityCue, type SoundSource } from './audio/sfx.ts';
import { hexColor, requireElement } from './dom.ts';
import { isPointerLocked, lockPointer } from './input/pointerLock.ts';
import { PlayerInput } from './input/playerInput.ts';
import { defaultSeed, launchSearch, readLaunchOptions } from './launch.ts';
import { FixedStepper } from './loop.ts';
import { installQa, markReady, type QaHost, type QaState } from './qa.ts';
import { AbilityViews, type PlacementGhost } from './render/abilities.ts';
import { ActorViews } from './render/actors.ts';
import { ImpactMarks } from './render/effects.ts';
import { buildLevel, levelBounds, type LevelView } from './render/level.ts';
import { NavDebug } from './render/navDebug.ts';
import { Stage } from './render/stage.ts';
import { ViewModel } from './render/viewmodel.ts';
import { Session } from './session.ts';
import { DebugOverlay } from './ui/debugOverlay.ts';
import { Hud, type HudAbility, type HudAbilityState, type HudState } from './ui/hud.ts';
import { KillFeed, type KillFeedEntry, type KillFeedName } from './ui/killFeed.ts';
import { Menu } from './ui/menu.ts';
import { RevealMarkers } from './ui/revealMarkers.ts';
import { RoundHud } from './ui/roundHud.ts';
import { loadSettings, type SettingKey, type Settings } from './ui/settings.ts';
import { headPosition, projectToScreen, WorldLabels, type LabelTarget } from './ui/worldLabels.ts';
import type { HostUi } from './modes/host.ts';

// NEW — the client composition root: wires the session (simulation + bots), input, rendering, UI
// and audio, and owns the frame loop (ARCHITECTURE §3). The client only *reads* simulation state
// and talks to the simulation through Commands and ControlMessages; the mode's differences come
// from the session's ModeHost (src/client/modes/).

const EVENT_LOG_LIMIT = 500;
const SETTLE_TICKS = 3;

type HitEvent = Extract<SimEvent, { type: 'hit' }>;

class App implements QaHost {
  private readonly settings: Settings;
  private readonly stage: Stage;
  private readonly session: Session;
  private readonly level: LevelView;
  private readonly player: CharacterEntity;
  private readonly input: PlayerInput;
  private readonly stepper = new FixedStepper();
  private readonly actors: ActorViews;
  private readonly abilityViews: AbilityViews;
  private readonly viewModel: ViewModel;
  private readonly impacts: ImpactMarks;
  private readonly navDebug: NavDebug;
  private readonly hud: Hud;
  private readonly roundHud: RoundHud;
  private readonly killFeed: KillFeed;
  private readonly labels: WorldLabels;
  private readonly reveals: RevealMarkers;
  private readonly debug: DebugOverlay;
  private readonly menu: Menu;
  private readonly sfx = new Sfx();
  private eventLog: SimEvent[] = [];
  /** Last tick each ability feedback key (see continuesStreak) was seen. */
  private readonly streaks = new Map<string, number>();
  /** Per ability of the player's kit: whether it could be activated after the last tick (the
   *  "ability ready" cue sounds when it turns true). */
  private readonly abilityReady = new Map<string, boolean>();
  private tickWaiters: { tick: number; resolve: () => void }[] = [];
  private frameWaiters: { frame: number; resolve: () => void }[] = [];
  private freeCamera: Extract<ShotDef, { kind: 'free' }> | null = null;
  /** Presentation sample of the current screenshot shot; transient HUD feedback is frozen. */
  private sample: ShotSample | null = null;
  /** Sprint pose blend 0…1 (view model and crosshair). */
  private sprintPose = 0;
  /** Whether the simulation advances: a mode that waits for the player starts on the first
   *  "play" click (or the first QA action), so its round clock does not run behind the menu. */
  private running: boolean;
  private captureMode = false;
  /** The mode host shows its own screen instead of the menu while the pointer is free. */
  private menuSuppressed = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fpsValue = 0;
  private fpsAccum = { frames: 0, time: 0 };

  constructor(stage: Stage, session: Session, settings: Settings) {
    this.stage = stage;
    this.session = session;
    this.settings = settings;
    this.player = session.player;
    this.running = !session.host.waitsForPlayer;
    const level = session.sim.level;
    this.level = buildLevel(level, stage.scene, stage.renderer.capabilities.getMaxAnisotropy());
    this.navDebug = new NavDebug(stage.scene, level.nav);

    // Team colours have one source (TEAM_STYLE): the 3D bands read it directly, the CSS here.
    const root = document.documentElement.style;
    root.setProperty('--ally', hexColor(TEAM_STYLE.colors.ally));
    root.setProperty('--enemy', hexColor(TEAM_STYLE.colors.enemy));
    // Shields: the HUD's shield bar and hit marker in the colour of the 3D shield shell.
    root.setProperty('--shield', hexColor(ABILITY_VISUALS.shield.color));

    this.input = new PlayerInput((action) => this.onClientAction(action));
    this.actors = new ActorViews(stage.scene, this.player.team);
    this.abilityViews = new AbilityViews(stage.scene, this.player.team);
    this.viewModel = new ViewModel(stage.viewModelScene);
    this.impacts = new ImpactMarks(stage.scene);

    const hudRoot = requireElement('hud');
    this.labels = new WorldLabels(hudRoot);
    this.reveals = new RevealMarkers(hudRoot);
    this.hud = new Hud(hudRoot, session.host.hint());
    this.roundHud = new RoundHud(hudRoot);
    this.killFeed = new KillFeed(hudRoot);
    this.debug = new DebugOverlay(hudRoot);
    this.menu = new Menu(
      document.body,
      settings,
      { mode: session.launch.mode, levelId: level.id },
      {
        onPlay: () => this.requestPlay(),
        onSettingChange: (key) => this.onSettingChange(key),
        onLaunch: (mode, levelId) => this.relaunch(mode, levelId),
      },
    );
    this.applySettings();
    session.host.attach(this.hostUi(hudRoot));
    // Setup events (the spawns; elimination: round 1's `phase`, emitted by Sim.create) go through
    // the same handler as every tick's, so the log and the round HUD see round 1 and the player's
    // spawn sets the look.
    this.handleEvents(session.takeSetupEvents());

    document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
    installQa(this);
  }

  private get sim(): Sim {
    return this.session.sim;
  }

  get renderer(): Stage['renderer'] {
    return this.stage.renderer;
  }

  get launch(): ShotLaunch {
    const l = this.session.launch;
    return { mode: l.mode, levelId: l.level.id, seed: l.seed };
  }

  start(): void {
    requestAnimationFrame(this.frame);
  }

  // ── Input and menu ──────────────────────────────────────────────────────

  private requestPlay(): void {
    this.running = true;
    this.sfx.unlock();
    lockPointer(this.stage.renderer.domElement, this.settings.rawInput).catch((err: unknown) => {
      // Browsers refuse re-locking right after Esc; tell the player instead of failing silently.
      console.warn('Pointer lock request failed.', err);
      this.menu.setMessage('Could not capture the mouse — click again in a moment.');
    });
  }

  private onPointerLockChange(): void {
    const locked = isPointerLocked(this.stage.renderer.domElement);
    this.input.active = locked;
    if (!locked) this.input.releaseAll();
    this.menu.setMessage('');
    this.menu.setVisible(!locked && !this.captureMode && !this.menuSuppressed);
  }

  /** What the mode host may use of the App (ADR-0013 §8). */
  private hostUi(root: HTMLElement): HostUi {
    return {
      root,
      project: (p) => {
        const s = projectToScreen(this.stage.camera, p, window.innerWidth, window.innerHeight);
        return s.visible ? { x: s.x, y: s.y } : null;
      },
      capturePointer: () => this.requestPlay(),
      openMenu: () => this.menu.setVisible(true),
      setMenuSuppressed: (suppressed) => {
        this.menuSuppressed = suppressed;
        this.onPointerLockChange();
      },
    };
  }

  private applySettings(): void {
    this.sfx.setVolume(this.settings.volume);
  }

  private onSettingChange(key: SettingKey): void {
    this.applySettings();
    // The difficulty is fixed when the bots are created: a change starts a new match with it.
    if (key === 'difficulty' && this.session.host.usesTier) this.relaunch(this.session.launch.mode, this.sim.level.id);
  }

  /** A new match: reloads the page with the mode and level (no teardown code, ADR-0011 §7). The
   *  difficulty comes from the saved setting and the seed is fresh, so neither is in the URL. */
  private relaunch(mode: ModeId, levelId: string): void {
    location.search = launchSearch({ mode, levelId });
  }

  private onClientAction(action: ClientAction): void {
    if (action === 'toggleDebug') this.setDebug(!this.debug.visible);
    if (action === 'switchOperator') {
      const next = this.nextOperator();
      if (next) this.sim.control({ type: 'selectOperator', entityId: this.player.id, operatorId: next });
    }
  }

  /** The operator after the player's own among the match's choices (operatorChoices, wrapping)
   *  that the simulation would accept now (Sim.accepts: the select window, Relay's pick limit). */
  private nextOperator(): string | null {
    const ids = operatorChoices(this.sim.state.match);
    const at = ids.indexOf(this.player.operatorId);
    for (let k = 1; k <= ids.length; k++) {
      const operatorId = ids[(at + k) % ids.length];
      if (operatorId === undefined || operatorId === this.player.operatorId) continue;
      if (this.sim.accepts({ type: 'selectOperator', entityId: this.player.id, operatorId })) return operatorId;
    }
    return null;
  }

  /** The debug overlay, and with it the nav overlay unless told otherwise. */
  private setDebug(overlay: boolean, nav = overlay): void {
    this.debug.setVisible(overlay);
    this.navDebug.setVisible(nav);
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  private stepSimulation(): void {
    const tick = this.sim.state.tick + 1;
    const events = this.session.step(this.input.sampleCommand(tick));
    this.handleEvents(events);
    this.cueReadyAbilities(events.some((e) => e.type === 'spawn' && e.entityId === this.player.id));
    const now = this.sim.state.tick;
    this.tickWaiters = this.tickWaiters.filter((w) => (now >= w.tick ? (w.resolve(), false) : true));
  }

  private handleEvents(events: readonly SimEvent[]): void {
    const me = this.player.id;
    this.session.host.onEvents(events, this.sim, this.player);
    this.abilityViews.onEvents(events);
    let fired = false;
    /** Attackers whose impact was heard this tick: shotgun pellets do not stack into one blast. */
    const impactHeard = new Set<EntityId>();
    const hearImpact = (attackerId: EntityId, point: Vec3): void => {
      if (impactHeard.has(attackerId)) return;
      impactHeard.add(attackerId);
      this.sfx.impact(point);
    };
    /** One reveal cue per tick: the player was revealed, or the player's team revealed someone. */
    let revealCue = false;
    for (const ev of events) {
      switch (ev.type) {
        case 'spawn':
          if (ev.entityId === me) {
            this.hud.clearTransients();
            // Command look angles are absolute: take over the facing the spawn set, or the next
            // command would turn the player back to where they looked before the respawn or
            // round reset (this also ends the death camera).
            this.input.setLook(ev.yaw, ev.pitch);
          }
          break;
        case 'footstep': {
          // The sim owns cadence and loudness; the walker's weight class picks the timbre.
          const walker = this.sim.getCharacter(ev.entityId);
          if (walker) this.sfx.footstep(operatorOf(walker).presentation.weightClass, ev.loudness, ev.entityId === me ? 'local' : ev.pos);
          break;
        }
        case 'shot':
          if (ev.entityId === me) fired = true;
          this.sfx.shot(getWeapon(ev.weaponId).class, ev.entityId === me ? 'local' : ev.origin);
          break;
        case 'hit': {
          // Damage over time (an area) hits every tick: sound and number only when a streak starts.
          const repeated = this.continuesStreak(ev);
          if (ev.attackerId === me) {
            this.hud.onHit(ev.zone, ev.killed, ev.absorbed > 0);
            if (!repeated || ev.killed) this.sfx.hit(ev.zone, ev.killed);
            if (this.settings.damageNumbers && !repeated && Math.round(ev.damage) > 0) this.labels.spawnDamage(ev.point, ev.damage, ev.zone === 'head');
          }
          if (ev.victimId === me && ev.attackerId !== me) {
            // Where the damage came from at that time (the shooter's eye, a burst point), not
            // where the attacker stands now.
            this.hud.onDamage(ev.attackerId, ev.sourcePos);
            if (!repeated) this.sfx.hurt();
          }
          break;
        }
        case 'kill':
          this.killFeed.add(this.killEntry(ev.attackerId, ev.victimId, ev.cause, ev.headshot));
          break;
        case 'impact':
          this.impacts.add(ev.point, ev.normal);
          hearImpact(ev.attackerId, ev.point);
          break;
        case 'gadgetHit':
          if (ev.attackerId === me) {
            this.hud.onHit(null, false);
            this.sfx.hit(null, false);
            if (this.settings.damageNumbers) this.labels.spawnDamage(ev.point, ev.amount, false);
          }
          if (ev.cause.kind === 'weapon') hearImpact(ev.attackerId, ev.point);
          break;
        case 'gadgetDestroyed':
          if (ev.attackerId === me) {
            this.hud.onHit(null, true);
            this.sfx.hit(null, true);
          }
          this.sfx.abilityCue('gadgetDestroyed', ev.pos);
          break;
        case 'gadgetPlaced':
          this.sfx.abilityCue('gadgetPlaced', ev.pos);
          break;
        case 'burst':
          this.sfx.abilityCue('burst', ev.pos);
          break;
        case 'revealed':
          if (ev.entityId === me || ev.team === this.player.team) revealCue = true;
          break;
        case 'healed':
          if (ev.entityId === me) this.hud.onHealed(ev.amount);
          if (!this.continues(`healed ${ev.entityId} ${ev.abilityId}`, ev.tick)) this.playAt('healed', ev.entityId);
          break;
        case 'shieldGained':
          if (!this.continues(`shield ${ev.entityId} ${ev.abilityId}`, ev.tick)) this.playAt('shieldGained', ev.entityId);
          break;
        case 'shieldBroken':
          this.playAt('shieldBroken', ev.entityId);
          break;
        case 'abilityEnd':
          this.playAt('abilityEnd', ev.entityId);
          break;
        case 'abilityFailed':
          if (ev.entityId === me) {
            const slot = this.player.abilities.findIndex((a) => a.abilityId === ev.abilityId);
            if (slot >= 0) this.hud.onAbilityFailed(slot, ev.reason);
            this.sfx.ui('dry');
          }
          break;
        case 'phase':
          if (ev.phase === 'live') this.sfx.ui('roundStart');
          if (ev.phase === 'setup') this.sfx.ui('setupStart');
          break;
        case 'uplink':
          this.sfx.uplink(ev.action, ev.stage, ev.entityId === me ? 'local' : ev.pos);
          break;
        case 'roundEnd':
          this.sfx.ui(ev.winner === this.player.team ? 'roundWon' : 'roundLost');
          break;
        case 'reloadStart':
          if (ev.entityId === me) this.sfx.ui('reload');
          break;
        case 'dryFire':
          if (ev.entityId === me) this.sfx.ui('dry');
          break;
        case 'ability':
          // Every ability's own signature, for both teams (SPEC §15).
          this.sfx.abilitySignature(ev.abilityId, ev.entityId === me ? 'local' : ev.pos);
          break;
        case 'weaponSwap':
          if (ev.entityId === me) this.sfx.ui('swap');
          break;
        default:
          break;
      }
    }
    if (revealCue) this.sfx.abilityCue('revealed', 'local');
    if (fired) {
      // The camera kick this tick's shot applied: prev* are stored at the start of the tick and
      // recoil does not recover in a tick that fired, so the difference is exactly the kick.
      const ws = this.player.weapon;
      this.viewModel.onShot(Math.hypot(ws.recoilPitch - ws.prevRecoilPitch, ws.recoilYaw - ws.prevRecoilYaw) / DEG2RAD);
    }
    this.eventLog.push(...events);
    if (this.eventLog.length > EVENT_LOG_LIMIT) this.eventLog = this.eventLog.slice(-EVENT_LOG_LIMIT);
  }

  private killEntry(attackerId: EntityId, victimId: EntityId, cause: DamageCause, headshot: boolean): KillFeedEntry {
    const name = (id: EntityId): KillFeedName => {
      const e = this.sim.getCharacter(id);
      // Characters are never removed from the simulation, so a kill always names two of them.
      if (!e) throw new Error(`Kill event names unknown entity ${id}`);
      if (e.id === this.player.id) return { text: 'You', relation: 'self' };
      return { text: operatorOf(e).name, relation: e.team === this.player.team ? 'ally' : 'enemy' };
    };
    // Ability kills name the ability.
    const weapon = cause.kind === 'weapon' ? getWeapon(cause.weaponId).name : getAbility(cause.abilityId).name;
    return { killer: name(attackerId), victim: name(victimId), weapon, ability: cause.kind === 'ability', headshot };
  }

  /** Whether `key` was already seen on the tick before `tick` (or on this one): a repeat of
   *  something the simulation re-applies every tick. Records `tick`. */
  private continues(key: string, tick: number): boolean {
    const last = this.streaks.get(key);
    this.streaks.set(key, tick);
    return last !== undefined && last >= tick - 1;
  }

  /** A hit that continues an ability's damage over time on the same victim (areas damage every
   *  tick); weapon hits never do. */
  private continuesStreak(ev: HitEvent): boolean {
    return ev.cause.kind === 'ability' && this.continues(`hit ${ev.attackerId} ${ev.victimId} ${ev.cause.abilityId}`, ev.tick);
  }

  /** Where a character's sound comes from: the player's own is local, anyone else's where they stand. */
  private soundAt(entityId: EntityId): SoundSource | null {
    if (entityId === this.player.id) return 'local';
    return this.sim.getCharacter(entityId)?.pos ?? null;
  }

  /** An ability cue at a character (heal, shield, channel or toggle end). */
  private playAt(cue: AbilityCue, entityId: EntityId): void {
    const source = this.soundAt(entityId);
    if (source) this.sfx.abilityCue(cue, source);
  }

  /** The "ability ready" UI cue (SPEC §15) when one of the player's abilities becomes usable
   *  again; not for a fresh kit or a (re)spawn, where everything is ready at once. */
  private cueReadyAbilities(spawned: boolean): void {
    const p = this.player;
    for (const slot of p.abilities) {
      const a = getAbility(slot.abilityId);
      if (a.activation.kind === 'passive') continue;
      const ready = canActivate(a.resource, slot.resource);
      if (ready && this.abilityReady.get(a.id) === false && p.alive && !spawned) this.sfx.ui('ability');
      this.abilityReady.set(a.id, ready);
    }
  }

  // ── Frame ───────────────────────────────────────────────────────────────

  private readonly frame = (now: number): void => {
    const dt = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 0;
    this.lastFrameTime = now;
    const p = this.player;
    const w = weaponOf(p);
    this.input.lookScale = this.settings.sensitivity * lerp(1, this.settings.adsSensitivity * w.adsFovMultiplier, p.weapon.ads);

    const alpha = this.running ? this.stepper.advance(dt, () => this.stepSimulation()) : 0;
    this.render(alpha, dt);

    this.frameCount += 1;
    this.fpsAccum.frames += 1;
    this.fpsAccum.time += dt;
    if (this.fpsAccum.time >= 0.5) {
      this.fpsValue = this.fpsAccum.frames / this.fpsAccum.time;
      this.fpsAccum = { frames: 0, time: 0 };
    }
    this.frameWaiters = this.frameWaiters.filter((f) => (this.frameCount >= f.frame ? (f.resolve(), false) : true));
    if (this.frameCount === 1) markReady();
    requestAnimationFrame(this.frame);
  };

  private render(alpha: number, dt: number): void {
    const p = this.player;
    const weapon = weaponOf(p);
    const camera = this.stage.camera;
    const ads = lerp(p.weapon.prevAds, p.weapon.ads, alpha);
    const lookDelta = this.input.consumeFrameLookDelta();
    /** First person with weapon and HUD; otherwise a free (shot) camera or the death camera. */
    const firstPerson = !this.freeCamera && p.alive;

    if (this.freeCamera) {
      camera.position.set(...this.freeCamera.position);
      camera.lookAt(new Vector3(...this.freeCamera.lookAt));
      this.stage.setFov(this.settings.fov, 1);
    } else {
      // A dead character keeps its last position, so the eye there is the death camera (M1,
      // SPEC §4.3): fixed where the player died, looking around with the mouse, until the next
      // spawn event puts the player back into first person.
      const pos = lerpVec3(p.prevPos, p.pos, alpha);
      const stance = lerp(p.prevStance, p.stance, alpha);
      camera.position.set(pos.x, pos.y + eyeHeight(stance), pos.z);
      if (p.alive) {
        const recoilPitch = lerp(p.weapon.prevRecoilPitch, p.weapon.recoilPitch, alpha);
        const recoilYaw = lerp(p.weapon.prevRecoilYaw, p.weapon.recoilYaw, alpha);
        camera.rotation.set(this.input.pitch + recoilPitch, this.input.yaw + recoilYaw, 0);
        this.stage.setFov(this.settings.fov, lerp(1, weapon.adsFovMultiplier, ads));
      } else {
        camera.rotation.set(this.input.pitch, this.input.yaw, 0);
        this.stage.setFov(this.settings.fov, 1);
      }
    }
    this.sfx.setListener(camera);
    this.sfx.areaLoops(this.sim.state.areas);

    // Sprint pose: in over VIEWMODEL.sprint.inSeconds, out over the sprint-out time, so the weapon
    // is up exactly when the simulation lets it fire again.
    const sprintRate = p.sprinting ? 1 / VIEWMODEL.sprint.inSeconds : 1 / GUNPLAY.sprintOutTime;
    this.sprintPose = moveTowards(this.sprintPose, p.sprinting ? 1 : 0, sprintRate * dt);
    const sprint = this.sample?.sprintPose ?? this.sprintPose;
    const op = operatorOf(p);

    this.level.setSetupWalls(matchSetupWallsUp(this.sim.state.match));
    this.actors.sync(this.sim.state.entities, alpha, this.freeCamera ? null : p.id);
    this.abilityViews.sync(this.sim.state, alpha);
    const ghost = this.placementGhost();
    this.abilityViews.setGhost(ghost);
    this.viewModel.setWeapon(weapon, swapProgress(lerp(p.weapon.prevSwapRemaining, p.weapon.swapRemaining, alpha)));
    this.viewModel.update(dt, {
      ads,
      sprint,
      speed: Math.hypot(p.vel.x, p.vel.z),
      walkSpeed: op.moveSpeed,
      grounded: p.grounded,
      verticalSpeed: p.vel.y,
      weightClass: op.presentation.weightClass,
      lookDelta,
      lowered: weaponBlockedBy(p) === null ? 0 : 1,
    });

    this.hud.setVisible(firstPerson);
    // A screenshot sample freezes transient feedback (headless captures run at ~5 fps).
    const feedbackDt = this.sample ? 0 : dt;
    this.hud.update(feedbackDt, this.hudState(ads, sprint, ghost));
    this.roundHud.update(this.freeCamera ? null : this.session.host.roundHud(this.sim, p));
    this.session.host.frame(this.sim, p, !this.freeCamera);
    this.killFeed.setVisible(!this.freeCamera);
    this.killFeed.update(feedbackDt);
    this.labels.update(dt, camera, this.labelTargets(alpha));
    this.reveals.update(camera, this.sim.state.entities, p.team, alpha);
    this.debug.update(dt, () => this.debugText(alpha));
    this.stage.render(firstPerson);
  }

  /** The player's placement in progress: its ability and where the ghost stands now — the sim's
   *  own rule (placementPose) along the input look, i.e. what a fire press would confirm. */
  private placementGhost(): PlacementGhost | null {
    const p = this.player;
    if (!p.alive || this.freeCamera) return null;
    const slot = p.abilities.find((s) => s.active?.kind === 'placing');
    if (!slot) return null;
    const ability = getAbility(slot.abilityId);
    if (!hasActivation(ability, 'placeable')) throw new Error(`Ability '${ability.id}' is placing but is not placeable`);
    return { ability, pose: placementPose(this.sim.query, p, ability, { yaw: this.input.yaw, pitch: this.input.pitch }) };
  }

  private abilityHud(slot: AbilityState, index: number): HudAbility {
    const p = this.player;
    const a = getAbility(slot.abilityId);
    const activation = a.activation;
    const r = slot.resource;
    const supported = isAbilitySupported(a);
    let detail: string;
    switch (a.resource.kind) {
      case 'charges':
        detail = `${r.charges}/${a.resource.maxCharges} charges`;
        break;
      case 'cooldown':
        detail = r.timer > 0 ? `${r.timer.toFixed(1)} s` : 'ready';
        break;
      case 'uses':
        detail = `${r.usesLeft} left this round`;
        break;
      case 'none':
        detail = 'passive';
        break;
    }
    // The mode's ability gate (e.g. Relay setup); passives are never gated.
    let blocked = activation.kind !== 'passive' && !matchAbilityAllowed(this.sim.state.match, p, a);
    if (activation.kind === 'placeable') {
      const placed = gadgetCount(this.sim.state, p.id, a.id);
      detail = `${detail} · ${HUD.abilities.text.placed(placed, activation.maxActive)}`;
      blocked ||= placed >= activation.maxActive;
    }
    const active = slot.active;
    let progress: number | null = null;
    if (active?.kind === 'channel') {
      progress = channelProgress(slot);
      detail = 'channelling';
    } else if (active?.kind === 'on') {
      // The spent resource waits for the switch-off: say "on" rather than a frozen cooldown.
      if (activation.kind === 'toggle' && activation.maxDuration !== null) progress = Math.min(1, active.elapsed / activation.maxDuration);
      detail = 'on';
    }
    const state: HudAbilityState =
      activation.kind === 'passive'
        ? 'passive'
        : active?.kind === 'placing'
          ? 'placing'
          : active
            ? 'active'
            : canActivate(a.resource, r)
              ? 'ready'
              : a.resource.kind === 'uses'
                ? 'empty'
                : 'recharging';
    return {
      key: bindingLabel(`ability${index + 1}`),
      name: a.name,
      state,
      readiness: supported ? readiness(a.resource, r) : 0,
      progress,
      detail: supported ? detail : HUD.abilities.text.failure.unsupported,
      supported,
      blocked,
    };
  }

  private hudState(ads: number, sprint: number, ghost: PlacementGhost | null): HudState {
    const p = this.player;
    const op = operatorOf(p);
    const w = weaponOf(p);
    const ws = p.weapon;
    return {
      operatorName: op.name,
      color: op.presentation.color,
      health: p.health,
      maxHealth: op.maxHealth,
      shield: shieldAmount(p),
      armour: op.armour,
      // A sustained modifier (toggle, channel, area) lasts only while re-applied: no countdown.
      modifiers: p.modifiers
        .filter((m) => Number.isFinite(m.remaining))
        .map((m) => {
          const name = getAbility(m.sourceId).name;
          return m.remaining > ABILITY_RULES.sustainSeconds ? `${name} ${m.remaining.toFixed(1)} s` : name;
        })
        .join(', '),
      weaponName: w.name,
      fireMode: w.fireMode,
      ammo: activeWeapon(p).ammo,
      reserve: activeWeapon(p).reserve,
      reload: ws.reloadRemaining > 0 ? 1 - ws.reloadRemaining / w.reloadTime : null,
      swap: swapProgress(ws.swapRemaining),
      holstered: WEAPON_SLOTS.flatMap((slot, i) => {
        const carried = p.weapons[i];
        if (!carried || i === p.activeSlot) return [];
        return [{ key: bindingLabel(slot.button), name: getWeapon(carried.weaponId).name, ammo: carried.ammo, reserve: carried.reserve }];
      }),
      spreadPx: this.stage.angleToPixels(currentSpread(p) * DEG2RAD),
      ads,
      sprint,
      fireBlocked: !canFire(p),
      eye: this.stage.camera.position,
      viewYaw: this.input.yaw,
      abilities: p.abilities.map((slot, i) => this.abilityHud(slot, i)),
      channel: p.abilities.reduce<number | null>((found, slot) => found ?? channelProgress(slot), null),
      placing: ghost ? { failure: ghost.pose.failure } : null,
      revealed: p.alive && isRevealedTo(p, otherTeam(p.team)),
    };
  }

  private labelTargets(alpha: number): LabelTarget[] {
    const host = this.session.host;
    return this.sim.state.entities
      .filter((e) => e.id !== this.player.id && host.labelled(e))
      .map((e) => {
        const head = headPosition(e, alpha);
        return {
          id: e.id,
          alive: e.alive,
          health: e.health,
          maxHealth: getOperator(e.operatorId).maxHealth,
          anchor: { x: head.x, y: head.y + HUD.healthBarOffset, z: head.z },
        };
      });
  }

  private matchLine(): string {
    const l = this.session.launch;
    const m = this.sim.state.match;
    const base = `MATCH  ${l.mode} on ${l.level.id}   seed ${l.seed}   bots ${this.session.host.usesTier ? l.tier : '—'}${this.running ? '' : '   (waiting for play)'}`;
    const round = roundMatchOf(m);
    if (!round) return base;
    const ends = round.phaseEndTick === null ? '' : ` (${((round.phaseEndTick - this.sim.state.tick) * TICK_DT).toFixed(1)} s)`;
    const relay = relayOf(m);
    const channel = relay?.channel ? `${relay.channel.action} by ${relay.channel.entityId} at ${relay.channel.siteId}` : '—';
    const uplink = relay ? `\n       channel ${channel}   uplink ${relay.uplink?.siteId ?? '—'}` : '';
    return `${base}\n       round ${round.round} ${round.phase}${ends}   score ${round.score.join('–')}   attackers: team ${round.attackingTeam} (${round.attackZoneId})   you: team ${this.player.team}${uplink}`;
  }

  private debugText(alpha: number): string {
    const p = this.player;
    const op = operatorOf(p);
    const w = weaponOf(p);
    const ws = p.weapon;
    const info = this.stage.renderer.info.render;
    const f = (v: number, d = 2): string => v.toFixed(d);
    return [
      `FPS ${f(this.fpsValue, 0)}   frame ${f(this.fpsValue ? 1000 / this.fpsValue : 0, 1)} ms   draw calls ${info.calls}   tris ${info.triangles}`,
      `Tick rate ${Math.round(1 / TICK_DT)} Hz (measured ${f(this.stepper.measuredTickRate, 1)}/s)   tick #${this.sim.state.tick}   α ${f(alpha)}`,
      this.matchLine(),
      '',
      `PLAYER  pos (${f(p.pos.x)}, ${f(p.pos.y)}, ${f(p.pos.z)})   speed ${f(Math.hypot(p.vel.x, p.vel.z))} / top ${f(topSpeed(p))} m/s`,
      `        grounded ${p.grounded ? 'yes' : 'no'}   stance ${f(p.stance)}   sprint ${p.sprinting ? 'yes' : 'no'}   dash ${p.dash ? 'yes' : 'no'}`,
      `        abilities ${p.abilities.map((a) => `${a.abilityId} ${a.active?.kind ?? 'idle'}`).join(', ') || '—'}   shield ${f(shieldAmount(p), 0)}`,
      `WORLD   gadgets ${this.sim.state.gadgets.length}   projectiles ${this.sim.state.projectiles.length}   areas ${this.sim.state.areas.length}`,
      '',
      `OPERATOR  ${op.name} (${op.archetype})   HP ${f(p.health, 0)}/${op.maxHealth}   armour ${Math.round(op.armour * 100)} %   hitbox ${op.hitboxProfile}`,
      `          speed ${op.moveSpeed}   sprint ×${op.sprintMultiplier}   accel ${op.acceleration}   crouch ${op.crouchSpeed}   jump ${op.jumpHeight} m   ADS move ×${op.adsMovePenalty}`,
      '',
      `WEAPON  ${w.name} (${w.class}, ${w.fireMode})   dmg ${w.damage}×${w.pellets} (${w.falloff.start}→${w.falloff.end} m ≥${w.falloff.minDamage})   ${w.rpm} rpm`,
      `        slot ${p.activeSlot + 1}/${p.weapons.length}   swap ${f(ws.swapRemaining)} s   ammo ${activeWeapon(p).ammo}/${w.magazine} +${activeWeapon(p).reserve}   reload ${w.reloadTime} s   ADS ${f(ws.ads)}   head ×${w.headshotMultiplier}`,
      `        spread ${f(currentSpread(p))}° (hip ${w.hipSpread}°, ADS ${w.adsSpread}°)   bloom ${f(ws.bloom)}°   recoil ${f(ws.recoilPitch / DEG2RAD)}° / ${f(ws.recoilYaw / DEG2RAD)}°`,
    ].join('\n');
  }

  // ── QA host ─────────────────────────────────────────────────────────────

  fps(): number {
    return this.fpsValue;
  }

  currentTick(): number {
    return this.sim.state.tick;
  }

  state(): QaState {
    const s = this.sim.state;
    return {
      tick: s.tick,
      playerId: this.player.id,
      match: structuredClone(s.match),
      gadgets: structuredClone(s.gadgets),
      projectiles: structuredClone(s.projectiles),
      areas: structuredClone(s.areas),
      characters: s.entities.map((e) => ({
        id: e.id,
        operatorId: e.operatorId,
        controller: e.controller,
        team: e.team,
        alive: e.alive,
        health: e.health,
        pos: { ...e.pos },
        stance: e.stance,
        ads: e.weapon.ads,
        activeSlot: e.activeSlot,
        weaponId: activeWeapon(e).weaponId,
        swapping: e.weapon.swapRemaining > 0,
        shield: shieldAmount(e),
        reveals: structuredClone(e.reveals),
        abilities: structuredClone(e.abilities),
      })),
    };
  }

  events(): readonly SimEvent[] {
    return this.eventLog;
  }

  clearEvents(): void {
    this.eventLog = [];
  }

  /** Resolves after `n` more ticks. QA drives the game: a match waiting for "play" starts. */
  waitTicks(n: number): Promise<void> {
    this.running = true;
    return new Promise((resolve) => this.tickWaiters.push({ tick: this.sim.state.tick + n, resolve }));
  }

  /** Steps `n` ticks now with the current input (the QA buttons included); every tick's events
   *  are handled as usual, nothing is rendered in between. QA drives the game: the match runs. */
  advanceTicks(n: number): number {
    this.running = true;
    for (let i = 0; i < n; i++) this.stepSimulation();
    return this.sim.state.tick;
  }

  setBotsIdle(idle: boolean): void {
    this.session.botsIdle = idle;
  }

  waitFrames(n: number): Promise<void> {
    return new Promise((resolve) => this.frameWaiters.push({ frame: this.frameCount + n, resolve }));
  }

  setQaButtons(buttons: number): void {
    this.input.setQaButtons(buttons);
  }

  /** Look angles from `shooter`'s eye to a point of `target`. */
  private aimAngles(shooter: CharacterEntity, target: Vec3): { yaw: number; pitch: number } {
    const eye: Vec3 = { x: shooter.pos.x, y: shooter.pos.y + eyeHeight(shooter.stance), z: shooter.pos.z };
    return anglesTo(eye, target);
  }

  aimAt(entityId: number, part: string): boolean {
    const target = this.sim.getCharacter(entityId);
    if (!target) return false;
    const profile = getHitboxProfile(getOperator(target.operatorId).hitboxProfile);
    const a = this.aimAngles(this.player, partWorldCenter(profile, target.stance, target.pos, target.yaw, part));
    this.input.setLook(a.yaw, a.pitch);
    return true;
  }

  /** Teleports a character (a ControlMessage); the player's look follows. */
  private place(e: CharacterEntity, position: Vec3, yaw: number, pitch = 0): void {
    this.sim.control({ type: 'teleport', entityId: e.id, position, yaw, pitch });
    if (e.id === this.player.id) this.input.setLook(yaw, pitch);
  }

  async teleport(x: number, y: number, z: number, yawDeg: number, pitchDeg: number): Promise<void> {
    this.place(this.player, { x, y, z }, yawDeg * DEG2RAD, pitchDeg * DEG2RAD);
    await this.waitTicks(SETTLE_TICKS);
  }

  async selectOperator(operatorId: string): Promise<void> {
    if (this.player.operatorId === operatorId) return;
    this.sim.control({ type: 'selectOperator', entityId: this.player.id, operatorId });
    await this.waitTicks(SETTLE_TICKS);
  }

  /** Taps the slot's select button for one command (like a key press) and waits out the swap. */
  private async selectWeaponSlot(slot: number): Promise<void> {
    const def = WEAPON_SLOTS[slot];
    if (!def || this.player.activeSlot === slot) return;
    this.input.setQaButtons(BUTTON[def.button]);
    await this.waitTicks(1);
    this.input.setQaButtons(0);
    await this.waitTicks(secondsToTicks(GUNPLAY.weaponSwapSeconds));
  }

  /** Taps `bits` for one command (a key press), then releases them for one. */
  private async tap(bits: number): Promise<void> {
    this.input.setQaButtons(bits);
    await this.waitTicks(1);
    this.input.setQaButtons(0);
    await this.waitTicks(1);
  }

  /** Whether an event of the log after tick `since` matches. */
  private loggedSince(since: number, match: (e: SimEvent) => boolean): boolean {
    return this.eventLog.some((e) => e.tick > since && match(e));
  }

  /** A shot's ability staging (ShotAbility), through Commands only, at the shot's `look`; then
   *  the simulation pauses so the capture shows exactly this moment (the next shot resumes it).
   *  False if the simulation did not do what the staging asked. */
  private async stageAbility(staging: ShotAbility, look: ShotLook): Promise<boolean> {
    const me = this.player.id;
    const key = ABILITY_BUTTONS[staging.slot];
    if (key === undefined || !this.player.abilities[staging.slot]) return false;
    const slotActivity = (): AbilityState['active'] | undefined => this.player.abilities[staging.slot]?.active;
    const aim = (l: ShotLook): void => this.input.setLook(l.yawDeg * DEG2RAD, l.pitchDeg * DEG2RAD);
    const since = this.sim.state.tick;
    let staged = false;
    switch (staging.kind) {
      case 'placing':
        if (slotActivity()?.kind !== 'placing') await this.tap(key);
        staged = slotActivity()?.kind === 'placing';
        break;
      case 'place':
        staged = true;
        for (const l of staging.looks ?? [look]) {
          aim(l);
          const mark = this.sim.state.tick;
          if (slotActivity()?.kind !== 'placing') await this.tap(key);
          await this.tap(BUTTON.fire);
          staged &&= this.loggedSince(mark, (e) => e.type === 'gadgetPlaced' && e.ownerId === me);
        }
        aim(look);
        await this.waitTicks(SETTLE_TICKS);
        break;
      case 'hold':
        this.input.setQaButtons(key);
        await this.waitTicks(secondsToTicks(staging.seconds));
        staged = slotActivity()?.kind === 'channel';
        break;
      case 'press':
        await this.tap(key);
        staged = this.loggedSince(since, (e) => e.type === 'ability' && e.entityId === me && e.slot === staging.slot);
        await this.waitTicks(secondsToTicks(staging.seconds));
        break;
    }
    this.running = false;
    return staged;
  }

  /** Shows a shot's presentation sample: damage arcs at view-relative bearings, a hit marker, a
   *  sprint pose. Only HUD and view model state — the simulation is not touched. */
  private showSample(sample: ShotSample): void {
    const eye = this.stage.camera.position;
    sample.damageFromDeg?.forEach((deg, i) => {
      const dir = forwardFromAngles(this.input.yaw - deg * DEG2RAD, 0);
      // Negative ids never collide with entity ids (they start at 1).
      this.hud.onDamage(-(i + 1), { x: eye.x + dir.x, y: eye.y, z: eye.z + dir.z });
    });
    if (sample.hit) this.hud.onHit(sample.hit.zone, sample.hit.killed);
    this.sample = sample;
  }

  // ── Match staging for screenshot shots (Commands and ControlMessages only) ──

  private matchPhase(): MatchPhase | null {
    return roundMatchOf(this.sim.state.match)?.phase ?? null;
  }

  /** Fast-forwards (advanceTicks, nothing rendered) until the match is in `phase`; false if it
   *  does not come within SHOT_STAGING.phaseTimeoutSeconds of sim time. */
  private waitForPhase(phase: MatchPhase): boolean {
    if (this.matchPhase() === null) return false;
    const deadline = this.sim.state.tick + secondsToTicks(SHOT_STAGING.phaseTimeoutSeconds);
    while (this.matchPhase() !== phase) {
      if (this.sim.state.tick >= deadline) return false;
      this.advanceTicks(1);
    }
    return true;
  }

  /** Relay shot staging: the player (an attacker) onto the floor of the nearest site in the live
   *  phase, then interact held until the plant completes (at most RELAY.plantSeconds +
   *  SHOT_STAGING.plantSlackSeconds). False if the player's team defends or the plant fails. */
  private stagePlant(): boolean {
    const m = relayOf(this.sim.state.match);
    const p = this.player;
    if (!m || !this.waitForPhase('live') || sideOf(m, p.team) !== 'attack') return false;
    const flat = (c: Vec3Tuple): number => Math.hypot(c[0] - p.pos.x, c[2] - p.pos.z);
    const site = [...(this.sim.level.sites ?? [])].sort((a, b) => flat(a.center) - flat(b.center))[0];
    if (!site) return false;
    this.place(p, { x: site.center[0], y: site.center[1] - site.size[1] / 2, z: site.center[2] }, this.input.yaw);
    this.advanceTicks(SETTLE_TICKS);
    this.input.setQaButtons(BUTTON.interact);
    const deadline = this.sim.state.tick + secondsToTicks(RELAY.plantSeconds + SHOT_STAGING.plantSlackSeconds);
    while (m.phase !== 'uplink' && this.sim.state.tick < deadline) this.advanceTicks(1);
    this.input.setQaButtons(0);
    return m.phase === 'uplink';
  }

  /** The living character a staged kill names: the player, or of the player's enemies / other
   *  teammates the one with the lowest entity id. */
  private stagedCharacter(role: StagedKill['killer'] | StagedKill['victim']): CharacterEntity | null {
    const me = this.player;
    if (role === 'player') return me.alive ? me : null;
    const ally = role === 'ally';
    return this.sim.state.entities.find((e) => e.alive && e.id !== me.id && (e.team === me.team) === ally) ?? null;
  }

  /** Aims the shooter at the target's torso (recoil climbs into the head, not over it) with these
   *  buttons held: the player through its input, a bot through a QA command replacing its own. */
  private drive(shooter: CharacterEntity, target: CharacterEntity, buttons: number): void {
    const a = this.aimAngles(shooter, zoneWorldCenter(target, 'torso'));
    if (shooter.id === this.player.id) {
      this.input.setLook(a.yaw, a.pitch);
      this.input.setQaButtons(buttons);
    } else {
      this.session.setQaCommand(shooter.id, { moveX: 0, moveZ: 0, yaw: a.yaw, pitch: a.pitch, buttons });
    }
  }

  /** One staged kill (SHOT_STAGING): both to the kill spot, facing each other, then aimed bursts
   *  until the victim is dead. False if nobody fits the roles or the victim survives. */
  private async stageKill(kill: StagedKill, spot: { killer: Vec3Tuple; victim: Vec3Tuple }): Promise<boolean> {
    const killer = this.stagedCharacter(kill.killer);
    const victim = this.stagedCharacter(kill.victim);
    if (!killer || !victim || killer === victim) return false;
    const at = { killer: fromTuple(spot.killer), victim: fromTuple(spot.victim) };
    this.place(killer, at.killer, anglesTo(at.killer, at.victim).yaw);
    this.place(victim, at.victim, anglesTo(at.victim, at.killer).yaw);
    await this.waitTicks(SETTLE_TICKS);
    const deadline = this.sim.state.tick + secondsToTicks(SHOT_STAGING.timeoutSeconds);
    while (victim.alive && this.sim.state.tick < deadline) {
      this.drive(killer, victim, BUTTON.ads | BUTTON.fire);
      await this.waitTicks(SHOT_STAGING.fireTicks);
      this.drive(killer, victim, BUTTON.ads);
      await this.waitTicks(SHOT_STAGING.pauseTicks);
    }
    if (killer.id === this.player.id) this.input.setQaButtons(0);
    else this.session.setQaCommand(killer.id, null);
    return !victim.alive;
  }

  /** A match shot: staged kills (in the live phase), then the phase the capture shows. */
  private async stageMatch(shot: Extract<ShotDef, { kind: 'match' }>): Promise<boolean> {
    const kills = shot.kills ?? [];
    if (kills.length && !(shot.killSpot && this.waitForPhase('live'))) return false;
    for (const kill of kills) {
      for (let i = 0; i < (kill.count ?? 1); i++) {
        if (!shot.killSpot || !(await this.stageKill(kill, shot.killSpot))) return false;
      }
    }
    if (shot.plant && !this.stagePlant()) return false;
    return this.waitForPhase(shot.phase);
  }

  async applyShot(shot: ShotDef): Promise<boolean> {
    this.running = true;
    this.captureMode = true;
    this.menu.setVisible(false);
    this.input.setQaButtons(0);
    this.sample = null;
    this.hud.clearTransients();
    this.session.botsIdle = shot.kind === 'match';
    switch (shot.kind) {
      case 'free':
        this.freeCamera = shot;
        this.setDebug(false, shot.navDebug ?? false);
        if (shot.phase && !this.waitForPhase(shot.phase)) return false;
        break;
      case 'player':
        this.freeCamera = null;
        await this.selectOperator(shot.operatorId);
        // The mode may refuse the switch (elimination: pre-round only): the shot would lie.
        if (this.player.operatorId !== shot.operatorId) return false;
        await this.teleport(...shot.position, shot.yawDeg, shot.pitchDeg);
        this.setDebug(shot.debug ?? false);
        await this.selectWeaponSlot(shot.weaponSlot ?? 0);
        if (shot.ads) this.input.setQaButtons(BUTTON.ads);
        await this.waitTicks(secondsToTicks(shot.ads ? weaponOf(this.player).adsTime + 0.3 : 0.3));
        if (shot.ability && !(await this.stageAbility(shot.ability, shot))) return false;
        if (shot.sample) this.showSample(shot.sample);
        break;
      case 'match':
        this.freeCamera = null;
        this.setDebug(false);
        if (!(await this.stageMatch(shot))) return false;
        break;
    }
    await this.waitFrames(2);
    return true;
  }
}

export async function startApp(onProgress: (fraction: number) => void): Promise<void> {
  const settings = loadSettings();
  const launch = readLaunchOptions(location.search, { tier: settings.difficulty, seed: defaultSeed() });
  const stage = new Stage(requireElement('app'), levelBounds(launch.level));
  onProgress(0.35);
  const session = await Session.create(launch);
  onProgress(0.8);
  const app = new App(stage, session, settings);
  onProgress(1);
  app.start();
}
