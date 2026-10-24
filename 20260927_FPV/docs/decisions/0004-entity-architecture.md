# ADR-0004 — Entities as plain component records, systems in fixed order

*Status: accepted · 2026-09-27*

## Context
Options: a data-oriented ECS (e.g. bitECS, typed arrays), an object-oriented actor hierarchy,
or plain component records processed by systems. Scale: 10 operators, some dozens of gadgets
and projectiles — not thousands of entities.

## Decision
- An entity is a plain, serialisable record: `id`, `kind`, and component fields
  (kinematics, health, weapon state, ability states, modifiers, …). No classes with behaviour
  in state.
- Systems are functions over the simulation in a fixed order (see ARCHITECTURE §3).
- Non-serialisable engine handles (Rapier bodies/colliders) live in side tables keyed by
  entity id inside `src/sim/physics/`.
- Derived values (effective speed, spread, damage taken) are computed on demand in
  `src/sim/stats.ts`, never stored twice.

## Consequences
- Snapshots/serialisation for netcode and replays are straightforward.
- No archetype queries; iteration is over small arrays. If entity counts ever grow by orders
  of magnitude (e.g. particles in the sim), revisit with a typed-array ECS for that part only.
