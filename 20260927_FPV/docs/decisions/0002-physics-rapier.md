# ADR-0002 — Physics: Rapier compat, kinematic character controller, sensor hitboxes

*Status: accepted · 2026-09-27*

## Context
The brief fixes Rapier (`@dimforge/rapier3d-compat`) for collision, the kinematic character
controller (KCC) for players and bots, ray casts for hitscan, and separate hitbox colliders.

## Decision
- `@dimforge/rapier3d-compat` 0.21 — the WASM binary is inlined as base64 in the JS bundle
  (chunk size: see the build output / `vite.config.ts`), so there is no separate `.wasm`
  request and no path problem under `base: './'`. It is loaded as its own chunk.
  `build.chunkSizeWarningLimit` is a global Vite setting; it is set just above the Rapier
  chunk so any other oversized chunk still warns (comment in `vite.config.ts`).
- Every character is **one kinematic position-based rigid body** with:
  - a movement capsule (`COLLISION_GROUPS.mover`) moved by the KCC (autostep,
    snap-to-ground, max slope);
  - hitbox **sensor** colliders (`COLLISION_GROUPS.hitbox`) for head/torso/limbs, laid out
    from data per stance. Sensors produce no contacts and are excluded from KCC queries
    (`EXCLUDE_SENSORS`), but ray casts hit them.
- Collision groups are defined once in `src/sim/physics/groups.ts`: static geometry, movers,
  hitboxes, and two query memberships (movement queries, bullet queries).
- Hitscan uses `castRayAndGetNormal` with `COLLISION_GROUPS.bulletQuery` (sees static
  geometry and hitboxes) excluding the shooter's own body; a collider-handle table maps a
  hit to (entity, zone).
- Tick order: movement → `world.step()` → weapons, so ray casts see the current hitboxes.
- Crouch shrinks the capsule (`setHalfHeight`) and re-lays the hitboxes; standing up is
  refused while a standing capsule would intersect geometry.

## Consequences
- Lag compensation (M6) can rewind only hitbox sensors.
- Dead characters disable their colliders instead of being removed (stable handles).
- Rapier is not cross-platform deterministic in this build; acceptable for an authoritative
  server (NETWORKING.md §6).
