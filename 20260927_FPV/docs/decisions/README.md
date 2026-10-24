# Architecture Decision Records

Short records of significant decisions: context, decision, consequences. A decision is changed
by adding a new ADR that supersedes the old one (never by silently editing it).

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-stack.md) | Stack: Vite + TypeScript 6 (strict) + Three.js | accepted |
| [0002](0002-physics-rapier.md) | Physics: Rapier compat, kinematic character controller, sensor hitboxes | accepted |
| [0003](0003-sim-render-split.md) | Fixed-tick simulation separated from rendering, lint-enforced | accepted |
| [0004](0004-entity-architecture.md) | Entities as plain component records, systems in fixed order | accepted |
| [0005](0005-multiplayer-strategy.md) | Offline first, authoritative server later | accepted |
| [0006](0006-events-as-data.md) | Per-tick event lists instead of a global event bus | accepted |
| [0007](0007-ui-dom.md) | UI in plain DOM + CSS, no framework | accepted |
| [0008](0008-content-as-typed-modules.md) | Content as typed TS modules; tools run via Node type stripping | accepted |
| [0009](0009-recoil-aim-offset.md) | Absolute look angles in commands, recoil as sim-owned aim offset | accepted |
| [0010](0010-generated-docs.md) | Balance/roster tables and README controls are generated | accepted |
| [0011](0011-bots-and-elimination.md) | Bot architecture and 5v5 elimination rounds | accepted |
| [0012](0012-ability-framework.md) | Ability framework: activations, gadgets, projectiles, areas, reveal | accepted |
| [0013](0013-relay-mode.md) | Relay mode: phases, operator select, uplink, bots on the objective | accepted |
| [0014](0014-net-readiness-spike.md) | Net-readiness spike: determinism, snapshots, worker loopback, prediction | proposed |
