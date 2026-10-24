import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type Material,
  type Scene,
} from 'three';
import { ABILITY_VISUALS, TEAM_STYLE } from '../../config/client.ts';
import { TICK_DT } from '../../config/sim.ts';
import { getAbility } from '../../data/content.ts';
import type { AbilityDef } from '../../data/schema.ts';
import { areaEffectOf } from '../../sim/abilities/areas.ts';
import { gadgetShape, type GadgetPose, type GadgetShape } from '../../sim/abilities/gadgets.ts';
import type { PlacementPose } from '../../sim/abilities/placement.ts';
import { lerp, type Vec3 } from '../../sim/math.ts';
import { channelProgress } from '../../sim/stats.ts';
import type { AreaEntity, CharacterEntity, EntityId, GadgetEntity, ProjectileEntity, SimEvent, SimState } from '../../sim/types.ts';

// NEW — world visuals of abilities (ADR-0012 §9): gadgets (barrier boxes from gadgetShape and
// device balls, both in the owner's team colour and greyed while disabled), projectiles, areas
// and radius rings at exactly the data radius, the channel ring, burst flashes and the placement
// ghost; looks in ABILITY_VISUALS (src/config/client.ts). The client only reads sim state: every frame sync()
// diffs the state lists by id. Meshes share geometries and materials and are pooled, so nothing
// is allocated per frame once the pools are warm. Team colours are as the local player sees
// them (TEAM_STYLE, SPEC §16).

const V = ABILITY_VISUALS;

/** What the placement ghost shows: the ability's gadget shape and radii at a pose. */
export interface PlacementGhost {
  ability: AbilityDef;
  pose: PlacementPose;
}

type Relation = 'ally' | 'enemy';

/** Render data derived from an ability's data, once per ability id. */
interface AbilityLook {
  /** The gadget's shape (meaningful for placeables). */
  shape: GadgetShape;
  /** Distinct radii (> 0) of its effects and its proximity trigger, ascending: the ghost's rings. */
  radii: readonly number[];
  /** Rings a placed gadget shows its own team: the proximity trigger radius, or an aura's effect
   *  radii (ADR-0012 §9, open question 3); none for other triggers. */
  gadgetRings: readonly number[];
  /** Largest effect radius: the channel ring at full progress, the burst flash; 0 when none. */
  reach: number;
}

const distinctAscending = (values: readonly number[]): number[] => [...new Set(values)].sort((a, b) => a - b);

// NEW — nothing derived an ability's radii for display (ghost, trigger/aura and channel rings).
const looks = new Map<string, AbilityLook>();
function lookOf(ability: AbilityDef): AbilityLook {
  let look = looks.get(ability.id);
  if (!look) {
    const effectRadii = ability.effects.flatMap((e) => ('radius' in e && e.radius > 0 ? [e.radius] : []));
    const a = ability.activation;
    const trigger = a.kind === 'placeable' && a.trigger.kind === 'proximity' ? [a.trigger.radius] : [];
    const aura = a.kind === 'placeable' && a.trigger.kind === 'aura';
    look = {
      shape: gadgetShape(ability),
      radii: distinctAscending([...effectRadii, ...trigger]),
      gadgetRings: aura ? distinctAscending(effectRadii) : trigger,
      reach: Math.max(0, ...effectRadii),
    };
    looks.set(ability.id, look);
  }
  return look;
}

/** Radius of a gadget body as drawn (a barrier's half diagonal, a device ball at its scale). */
function bodyRadius(shape: GadgetShape): number {
  if (shape.kind === 'barrier') return Math.hypot(...shape.halfExtents);
  return shape.radius * V.device.scale;
}

/** Puts a body mesh (unit box or unit sphere) where a gadget of `shape` stands at `pose`. */
function placeBody(mesh: Mesh, shape: GadgetShape, pose: Pick<GadgetPose, 'pos' | 'yaw'>): void {
  if (shape.kind === 'barrier') {
    const [hx, hy, hz] = shape.halfExtents;
    mesh.scale.set(hx * 2, hy * 2, hz * 2);
    mesh.position.set(pose.pos.x, pose.pos.y + hy, pose.pos.z); // pos = base centre (as its collider)
    mesh.rotation.set(0, pose.yaw, 0);
  } else {
    mesh.scale.setScalar(shape.radius * V.device.scale);
    mesh.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
  }
}

/** A flat ring in the XZ plane whose centre line lies exactly at its radius (ABILITY_VISUALS.ring
 *  width and segments). Each ring owns its geometry, rewritten in place when the radius changes
 *  (a fixed width in metres cannot come from scaling one shared ring). */
interface RingView {
  mesh: Mesh;
  positions: BufferAttribute;
  radius: number;
}

function createRing(material: Material): RingView {
  const n = V.ring.segments;
  const positions = new BufferAttribute(new Float32Array((n + 1) * 2 * 3), 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', positions);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2; // inner vertex i; a + 1 its outer twin
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(index);
  return { mesh: new Mesh(geometry, material), positions, radius: -1 };
}

function setRingRadius(ring: RingView, radius: number): void {
  if (ring.radius === radius) return;
  ring.radius = radius;
  const { widthM, segments } = V.ring;
  const inner = Math.max(0, radius - widthM / 2);
  const outer = radius + widthM / 2;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = Math.cos(t);
    const z = Math.sin(t);
    ring.positions.setXYZ(i * 2, x * inner, 0, z * inner);
    ring.positions.setXYZ(i * 2 + 1, x * outer, 0, z * outer);
  }
  ring.positions.needsUpdate = true;
  ring.mesh.geometry.computeBoundingSphere();
}

/** A gadget's rings lie flat through the surface point it is attached to (a device sits
 *  `radius` out along the normal), lifted by ABILITY_VISUALS.ring.liftM. */
function placeGadgetRing(ring: RingView, shape: GadgetShape, pose: Pick<GadgetPose, 'pos' | 'normal'>): void {
  const out = shape.kind === 'device' ? shape.radius : 0;
  ring.mesh.position.set(pose.pos.x - pose.normal.x * out, pose.pos.y - pose.normal.y * out + V.ring.liftM, pose.pos.z - pose.normal.z * out);
}

function placeOnGround(mesh: Mesh, pos: Vec3): void {
  mesh.position.set(pos.x, pos.y + V.ring.liftM, pos.z);
}

/** A barrier box's surface in `color` (ABILITY_VISUALS.barrier). */
const barrierMaterial = (color: number): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: V.barrier.roughness, transparent: V.barrier.opacity < 1, opacity: V.barrier.opacity });

/** Unlit (exact colour in sun and shade, as the team bands), double-sided flat marks. */
const markMaterial = (color: number, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, toneMapped: false, side: DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

/** Meshes of one kind, recycled: a removed entity hands its item back (hidden) instead of
 *  disposing; geometries and materials are shared, so nothing leaks and nothing is rebuilt. */
class Pool<T extends { mesh: Mesh }> {
  private readonly free: T[] = [];
  private readonly parent: Group;
  private readonly create: () => T;

  constructor(parent: Group, create: () => T) {
    this.parent = parent;
    this.create = create;
  }

  take(): T {
    let item = this.free.pop();
    if (!item) {
      item = this.create();
      this.parent.add(item.mesh);
    }
    item.mesh.visible = true;
    return item;
  }

  give(item: T): void {
    item.mesh.visible = false;
    this.free.push(item);
  }
}

interface Body {
  mesh: Mesh;
}
interface Seen {
  /** Frame number of the last sync that found the entity. */
  seen: number;
}
interface GadgetView extends Seen {
  body: Body;
  barrier: boolean;
  relation: Relation;
  rings: RingView[];
  /** Disabled look applied (null: none yet). */
  disabled: boolean | null;
}
interface ProjectileView extends Seen {
  body: Body;
}
interface AreaView extends Seen {
  disc: Body;
  ring: RingView;
}
interface ChannelView extends Seen {
  ring: RingView;
}
interface Flash {
  mesh: Mesh;
  material: MeshBasicMaterial;
  /** Sim time (s) the flash starts. */
  start: number;
  radius: number;
}

export class AbilityViews {
  /** Everything these views draw hangs below this group. */
  private readonly root = new Group();
  /** The local player's team: trigger and aura rings are drawn for its gadgets only. */
  readonly localTeam: number;

  private readonly geometry = {
    box: new BoxGeometry(1, 1, 1),
    sphere: new SphereGeometry(1, V.sphereSegments.width, V.sphereSegments.height),
    disc: new CircleGeometry(1, V.ring.segments).rotateX(-Math.PI / 2),
  };
  private readonly materials = {
    barrier: { ally: barrierMaterial(TEAM_STYLE.colors.ally), enemy: barrierMaterial(TEAM_STYLE.colors.enemy) },
    barrierDisabled: barrierMaterial(V.barrier.disabledColor),
    device: {
      ally: new MeshStandardMaterial({ color: TEAM_STYLE.colors.ally, emissive: TEAM_STYLE.colors.ally, emissiveIntensity: V.device.emissive }),
      enemy: new MeshStandardMaterial({ color: TEAM_STYLE.colors.enemy, emissive: TEAM_STYLE.colors.enemy, emissiveIntensity: V.device.emissive }),
    },
    deviceDisabled: new MeshStandardMaterial({ color: V.device.disabledColor }),
    projectile: {
      ally: new MeshBasicMaterial({ color: TEAM_STYLE.colors.ally, toneMapped: false }),
      enemy: new MeshBasicMaterial({ color: TEAM_STYLE.colors.enemy, toneMapped: false }),
    },
    ring: { ally: markMaterial(TEAM_STYLE.colors.ally, 1), enemy: markMaterial(TEAM_STYLE.colors.enemy, 1) },
    ringDisabled: markMaterial(V.device.disabledColor, 1),
    disc: {
      ally: markMaterial(TEAM_STYLE.colors.ally, V.ring.fillOpacity),
      enemy: markMaterial(TEAM_STYLE.colors.enemy, V.ring.fillOpacity),
    },
    ghost: new MeshBasicMaterial({ color: V.ghost.valid, transparent: true, opacity: V.ghost.opacity, depthWrite: false, toneMapped: false }),
    ghostRing: markMaterial(V.ghost.valid, 1),
  };

  private readonly barriers: Pool<Body>;
  private readonly devices: Pool<Body>;
  private readonly projectileBodies: Pool<Body>;
  private readonly discs: Pool<Body>;
  private readonly rings: Pool<RingView>;
  private readonly flashes: Pool<Flash>;

  private readonly gadgets = new Map<EntityId, GadgetView>();
  private readonly projectiles = new Map<EntityId, ProjectileView>();
  private readonly areas = new Map<EntityId, AreaView>();
  /** Channel rings by channelling character. */
  private readonly channels = new Map<EntityId, ChannelView>();
  private readonly activeFlashes: Flash[] = [];

  private readonly ghostBarrier: Mesh;
  private readonly ghostDevice: Mesh;
  private readonly ghostRings: RingView[] = [];

  private frame = 0;
  /** Sim time (s) of the rendered moment: the last tick's time minus the part not yet reached. */
  private now = 0;

  constructor(scene: Scene, localTeam: number) {
    scene.add(this.root);
    this.localTeam = localTeam;
    const { box, sphere, disc } = this.geometry;
    const m = this.materials;
    this.barriers = new Pool(this.root, () => {
      const mesh = new Mesh(box, m.barrier.ally);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return { mesh };
    });
    this.devices = new Pool(this.root, () => {
      const mesh = new Mesh(sphere, m.device.ally);
      mesh.castShadow = true;
      return { mesh };
    });
    this.projectileBodies = new Pool(this.root, () => {
      const mesh = new Mesh(sphere, m.projectile.ally);
      mesh.scale.setScalar(V.projectile.radiusM);
      return { mesh };
    });
    this.discs = new Pool(this.root, () => ({ mesh: new Mesh(disc, m.disc.ally) }));
    this.rings = new Pool(this.root, () => createRing(m.ring.ally));
    this.flashes = new Pool(this.root, () => {
      const material = new MeshBasicMaterial({
        color: V.burst.color,
        transparent: true,
        blending: AdditiveBlending,
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      return { mesh: new Mesh(sphere, material), material, start: 0, radius: 0 };
    });

    this.ghostBarrier = new Mesh(box, m.ghost);
    this.ghostDevice = new Mesh(sphere, m.ghost);
    this.ghostBarrier.visible = false;
    this.ghostDevice.visible = false;
    this.root.add(this.ghostBarrier, this.ghostDevice);
  }

  private relation(team: number): Relation {
    return team === this.localTeam ? 'ally' : 'enemy';
  }

  /** Diffs gadgets, projectiles and areas by id every frame (projectiles interpolated
   *  prevPos → pos with `alpha`); channel rings of channelling characters; burst flashes. */
  sync(state: Readonly<SimState>, alpha: number): void {
    const frame = ++this.frame;
    this.now = state.time - (1 - alpha) * TICK_DT;
    for (const g of state.gadgets) this.syncGadget(g, frame);
    for (const p of state.projectiles) this.syncProjectile(p, alpha, frame);
    for (const a of state.areas) this.syncArea(a, frame);
    for (const e of state.entities) this.syncChannel(e, alpha, frame);
    for (const [id, view] of this.gadgets) if (view.seen !== frame) this.releaseGadget(id, view);
    for (const [id, view] of this.projectiles) if (view.seen !== frame) this.releaseProjectile(id, view);
    for (const [id, view] of this.areas) if (view.seen !== frame) this.releaseArea(id, view);
    for (const [id, view] of this.channels) if (view.seen !== frame) this.releaseChannel(id, view);
    this.updateFlashes();
  }

  /** Shows the placement ghost (null hides it): the gadget shape at the pose, in the valid or
   *  invalid colour, plus every radius of the ability's effects and trigger. */
  setGhost(ghost: PlacementGhost | null): void {
    this.ghostBarrier.visible = false;
    this.ghostDevice.visible = false;
    for (const ring of this.ghostRings) ring.mesh.visible = false;
    if (!ghost) return;

    const look = lookOf(ghost.ability);
    const color = ghost.pose.valid ? V.ghost.valid : V.ghost.invalid;
    this.materials.ghost.color.setHex(color);
    this.materials.ghostRing.color.setHex(color);
    const body = look.shape.kind === 'barrier' ? this.ghostBarrier : this.ghostDevice;
    placeBody(body, look.shape, ghost.pose);
    body.visible = true;
    for (let i = 0; i < look.radii.length; i++) {
      const radius = look.radii[i];
      if (radius === undefined) continue;
      let ring = this.ghostRings[i];
      if (!ring) {
        ring = createRing(this.materials.ghostRing);
        this.ghostRings.push(ring);
        this.root.add(ring.mesh);
      }
      setRingRadius(ring, radius);
      placeGadgetRing(ring, look.shape, ghost.pose);
      ring.mesh.visible = true;
    }
  }

  /** One tick's events: burst flashes (at the burst's reach) and gadget destruction. */
  onEvents(events: readonly SimEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'burst') {
        const reach = lookOf(getAbility(ev.abilityId)).reach;
        if (reach > 0) this.addFlash(ev.pos, 0, reach, ev.tick);
      } else if (ev.type === 'gadgetDestroyed') {
        const shape = lookOf(getAbility(ev.abilityId)).shape;
        const lift = shape.kind === 'barrier' ? shape.halfExtents[1] : 0; // a barrier's pos is its base
        this.addFlash(ev.pos, lift, bodyRadius(shape), ev.tick);
      }
    }
  }

  private syncGadget(g: GadgetEntity, frame: number): void {
    let view = this.gadgets.get(g.id);
    if (!view) {
      const look = lookOf(getAbility(g.abilityId));
      const barrier = look.shape.kind === 'barrier';
      const body = (barrier ? this.barriers : this.devices).take();
      placeBody(body.mesh, look.shape, g);
      // Trigger and aura radii are the owner's team's knowledge (ADR-0012 §15, question 3).
      const ringRadii = g.team === this.localTeam ? look.gadgetRings : [];
      const rings = ringRadii.map((radius) => {
        const ring = this.rings.take();
        setRingRadius(ring, radius);
        placeGadgetRing(ring, look.shape, g);
        return ring;
      });
      view = { seen: frame, body, barrier, relation: this.relation(g.team), rings, disabled: null };
      this.gadgets.set(g.id, view);
    }
    view.seen = frame;
    const disabled = g.disabled > 0;
    if (view.disabled === disabled) return;
    view.disabled = disabled;
    const m = this.materials;
    if (view.barrier) view.body.mesh.material = disabled ? m.barrierDisabled : m.barrier[view.relation];
    else view.body.mesh.material = disabled ? m.deviceDisabled : m.device[view.relation];
    for (const ring of view.rings) ring.mesh.material = disabled ? m.ringDisabled : m.ring[view.relation];
  }

  private syncProjectile(p: ProjectileEntity, alpha: number, frame: number): void {
    let view = this.projectiles.get(p.id);
    if (!view) {
      const body = this.projectileBodies.take();
      body.mesh.material = this.materials.projectile[this.relation(p.team)];
      view = { seen: frame, body };
      this.projectiles.set(p.id, view);
    }
    view.seen = frame;
    view.body.mesh.position.set(lerp(p.prevPos.x, p.pos.x, alpha), lerp(p.prevPos.y, p.pos.y, alpha), lerp(p.prevPos.z, p.pos.z, alpha));
  }

  private syncArea(a: AreaEntity, frame: number): void {
    let view = this.areas.get(a.id);
    if (!view) {
      const radius = areaEffectOf(a).radius;
      const relation = this.relation(a.team);
      const disc = this.discs.take();
      disc.mesh.material = this.materials.disc[relation];
      disc.mesh.scale.set(radius, 1, radius);
      placeOnGround(disc.mesh, a.pos);
      const ring = this.rings.take();
      ring.mesh.material = this.materials.ring[relation];
      setRingRadius(ring, radius);
      placeOnGround(ring.mesh, a.pos);
      view = { seen: frame, disc, ring };
      this.areas.set(a.id, view);
    }
    view.seen = frame;
  }

  /** A channelling character's ring: channelProgress × the ability's reach around its feet. */
  private syncChannel(e: CharacterEntity, alpha: number, frame: number): void {
    if (!e.alive) return;
    for (const slot of e.abilities) {
      const progress = channelProgress(slot);
      if (progress === null) continue;
      const reach = lookOf(getAbility(slot.abilityId)).reach;
      if (reach <= 0) continue;
      let view = this.channels.get(e.id);
      if (!view) {
        const ring = this.rings.take();
        view = { seen: frame, ring };
        this.channels.set(e.id, view);
      }
      view.seen = frame;
      view.ring.mesh.material = this.materials.ring[this.relation(e.team)];
      setRingRadius(view.ring, progress * reach);
      view.ring.mesh.position.set(
        lerp(e.prevPos.x, e.pos.x, alpha),
        lerp(e.prevPos.y, e.pos.y, alpha) + V.ring.liftM,
        lerp(e.prevPos.z, e.pos.z, alpha),
      );
      return; // one channel at a time (another slot's press interrupts it)
    }
  }

  private releaseGadget(id: EntityId, view: GadgetView): void {
    (view.barrier ? this.barriers : this.devices).give(view.body);
    for (const ring of view.rings) this.rings.give(ring);
    this.gadgets.delete(id);
  }

  private releaseProjectile(id: EntityId, view: ProjectileView): void {
    this.projectileBodies.give(view.body);
    this.projectiles.delete(id);
  }

  private releaseArea(id: EntityId, view: AreaView): void {
    this.discs.give(view.disc);
    this.rings.give(view.ring);
    this.areas.delete(id);
  }

  private releaseChannel(id: EntityId, view: ChannelView): void {
    this.rings.give(view.ring);
    this.channels.delete(id);
  }

  /** A flash sphere at `pos` + `lift` up that grows to `radius` while it fades. */
  private addFlash(pos: Vec3, lift: number, radius: number, tick: number): void {
    const flash = this.flashes.take();
    flash.mesh.position.set(pos.x, pos.y + lift, pos.z);
    // It happened during `tick`, between the two states the next frames interpolate.
    flash.start = (tick - 1) * TICK_DT;
    flash.radius = radius;
    flash.mesh.visible = false; // shown by updateFlashes once its time has come
    this.activeFlashes.push(flash);
  }

  /** Burst flashes over ABILITY_VISUALS.burst.seconds: an ease-out growth to the burst radius,
   *  fading linearly; a finished one goes back to the pool. */
  private updateFlashes(): void {
    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i];
      if (!flash) continue;
      const t = (this.now - flash.start) / V.burst.seconds;
      if (t >= 1) {
        this.flashes.give(flash);
        const last = this.activeFlashes.pop();
        if (last && last !== flash) this.activeFlashes[i] = last;
        continue;
      }
      flash.mesh.visible = t > 0;
      if (t <= 0) continue;
      flash.mesh.scale.setScalar(flash.radius * (1 - (1 - t) ** 2));
      flash.material.opacity = 1 - t;
    }
  }
}
