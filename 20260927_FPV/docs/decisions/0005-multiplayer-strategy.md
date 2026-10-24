# ADR-0005 — Offline first, authoritative server later

*Status: accepted · 2026-09-27*

## Context
GitHub Pages serves static files only. Online PvP needs a hosted process. The brief sets
milestone 1 as offline player vs. bots and defers networking.

## Decision
- M1–M5 are fully offline: the simulation runs in the browser; bots fill the teams.
- M6 adds an authoritative Node + WebSocket server running the same `src/sim/` code, with
  client-side prediction, entity interpolation and hitscan lag compensation
  ([NETWORKING.md](../NETWORKING.md)).
- A loopback net-readiness spike (simulation in a worker, artificial latency, replay
  determinism) is part of M2 to validate the architecture before any hosting decision.
- Peer-to-peer (WebRTC) is rejected: no authority for hit registration, host advantage, NAT
  issues.

## Consequences
- No networking code until M6; the boundary rules of ADR-0003 are the preparation.
- Hosting cost/provider is a user decision at M6.
