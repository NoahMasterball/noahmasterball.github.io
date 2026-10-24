# ADR-0009 — Absolute look angles in commands, recoil as sim-owned aim offset

*Status: accepted · 2026-09-27*

## Context
Commands must be robust for netcode, which favours absolute look angles over deltas (a lost
delta corrupts the view). But recoil must move the aim, and the simulation — not the client —
owns recoil.

## Decision
- `Command.yaw/pitch` are absolute look angles owned by the input layer.
- Recoil accumulates in a simulation-owned **aim offset** (`recoilPitch`, `recoilYaw`) from the
  weapon's deterministic pattern. Shot direction = look + offset; the camera shows the same.
- The offset recovers toward zero at `recoil.recovery` after firing stops; the pattern index
  resets after `recoil.resetTime`.

## Consequences
- Players compensate by pulling against the pattern; after release the view settles back
  (familiar from established competitive shooters, but tuned per weapon in data).
- A future "recoil moves the view permanently" variant would need look deltas in commands —
  deliberately not chosen.
