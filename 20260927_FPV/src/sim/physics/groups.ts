// NEW — Rapier collision groups (ADR-0002). Encoding: upper 16 bits = membership, lower 16 bits
// = filter. Two colliders (or a query and a collider) interact only if each one's membership
// is in the other's filter.

const LAYER = {
  static: 1 << 0,
  mover: 1 << 1,
  hitbox: 1 << 2,
  moveQuery: 1 << 3,
  bulletQuery: 1 << 4,
  sightQuery: 1 << 5,
  // ADR-0012 §4.1: placed gadgets and the level-only probes.
  barrier: 1 << 6,
  device: 1 << 7,
  levelQuery: 1 << 8,
  // ADR-0013 §4: Relay setup walls (movement only).
  setupWall: 1 << 9,
} as const;

const groups = (membership: number, filter: number): number => ((membership << 16) | filter) >>> 0;

export const COLLISION_GROUPS = {
  /** Level geometry: interacts with everything. */
  static: groups(LAYER.static, 0xffff),
  /** Movement capsules: block each other and are seen by movement queries, never by bullets. */
  mover: groups(LAYER.mover, LAYER.static | LAYER.mover | LAYER.moveQuery),
  /** Hitbox sensors: only bullet queries see them. */
  hitbox: groups(LAYER.hitbox, LAYER.bulletQuery),
  /** Barrier gadgets (solid, fixed cuboids): block movement, bullets, projectiles and sight. */
  barrier: groups(LAYER.barrier, LAYER.moveQuery | LAYER.bulletQuery | LAYER.sightQuery),
  /** Device gadgets (sensor balls): only bullet queries see them (walk and see through). */
  device: groups(LAYER.device, LAYER.bulletQuery),
  /** Relay setup walls (fixed cuboids, enabled only while ModeRules.setupWallsUp): block every
   *  character's movement; bullets, projectiles and sight pass. */
  setupWall: groups(LAYER.setupWall, LAYER.moveQuery),
  /** Character-controller, head-room and free-box queries: level, capsules, barriers, setup walls. */
  moveQuery: groups(LAYER.moveQuery, LAYER.static | LAYER.mover | LAYER.barrier | LAYER.setupWall),
  /** Hitscan rays and projectile sweeps: stopped by level geometry and gadgets, register on
   *  hitboxes. */
  bulletQuery: groups(LAYER.bulletQuery, LAYER.static | LAYER.hitbox | LAYER.barrier | LAYER.device),
  /** Sight (SimQuery.lineOfSight: bots, area line of sight): level geometry and barriers;
   *  characters never block. */
  sightQuery: groups(LAYER.sightQuery, LAYER.static | LAYER.barrier),
  /** Level-only probes (ground below, placement surfaces): static geometry, never gadgets. */
  levelQuery: groups(LAYER.levelQuery, LAYER.static),
} as const;
