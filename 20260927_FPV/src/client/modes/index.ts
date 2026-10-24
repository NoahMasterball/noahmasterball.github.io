import type { ModeId } from '../../sim/modes/mode.ts';
import { createEliminationHost } from './eliminationHost.ts';
import type { ModeHost } from './host.ts';
import { createRangeHost } from './rangeHost.ts';
import { createRelayHost } from './relayHost.ts';

// NEW — one client host per simulation mode (ADR-0011 §7); keyed by ModeId, so a new mode in
// src/sim/modes/ does not compile until it has a host.

export const MODE_HOSTS: Record<ModeId, () => ModeHost> = {
  range: createRangeHost,
  elimination: createEliminationHost,
  relay: createRelayHost,
};
