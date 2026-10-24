import type { SimState } from './types.ts';

// NEW — ADR-0014 §2/§4: the one canonical digest of simulation data (the determinism tests built
// ad-hoc JSON strings, which map −0 to 0 and Infinity/NaN to null) and the state half of
// Sim.restore (physics is rebuilt by the Sim). Moved from tests/unit/replay.test.ts (ADR-0012 R).

// ── Digest ──────────────────────────────────────────────────────────────────

const FLOAT64 = new DataView(new ArrayBuffer(8));

/** A number by its IEEE-754 bits: −0, ±Infinity and NaN stay distinct and exact. */
function float64Hex(n: number): string {
  FLOAT64.setFloat64(0, n);
  return FLOAT64.getUint32(0).toString(16).padStart(8, '0') + FLOAT64.getUint32(4).toString(16).padStart(8, '0');
}

/** Appends the canonical encoding of `value` to `out`: typed tokens, arrays in order, object keys
 *  sorted, lengths prefixed. Only plain data (what SimState and events hold); anything else throws. */
function canonical(value: unknown, out: string[]): void {
  if (value === null) {
    out.push('N');
    return;
  }
  switch (typeof value) {
    case 'undefined':
      out.push('U');
      return;
    case 'boolean':
      out.push(value ? 'T' : 'F');
      return;
    case 'number':
      out.push('n', float64Hex(value));
      return;
    case 'string':
      out.push('s', String(value.length), ':', value);
      return;
    case 'object':
      break;
    default:
      throw new Error(`digest: cannot encode a ${typeof value}`);
  }
  if (Array.isArray(value)) {
    out.push('[', String(value.length));
    for (const item of value) canonical(item, out);
    out.push(']');
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new Error('digest: only plain objects and arrays');
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
  out.push('{', String(entries.length));
  for (const [key, item] of entries) {
    out.push('s', String(key.length), ':', key);
    canonical(item, out);
  }
  out.push('}');
}

/** 64-bit FNV-1a over UTF-16 code units, as 16 hex characters (two 32-bit halves: the prime
 *  2^40 + 0x1b3 multiplies the low half by 0x1b3 into both halves and shifts it 8 into the high). */
function fnv1a64(text: string): string {
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    lo = (lo ^ text.charCodeAt(i)) >>> 0;
    const product = lo * 0x1b3; // < 2^41: exact in a double
    hi = (Math.imul(hi, 0x1b3) + Math.floor(product / 0x1_0000_0000) + (lo << 8)) >>> 0;
    lo = product >>> 0;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/** Canonical digest of plain data (ADR-0014 §2): equal for equal data whatever the key order;
 *  separates −0/0, Infinity/null, NaN/null, '1'/1, undefined/missing. A same-build artefact: never
 *  compared across engines (NETWORKING §6). */
export function digest(value: unknown): string {
  const out: string[] = [];
  canonical(value, out);
  return fnv1a64(out.join(''));
}

// ── Restore (state half) ────────────────────────────────────────────────────

/** Makes `target` a deep copy of `snapshot` (ADR-0014 §4): the `target` object itself and every
 *  character whose id is in both keep their identity (the Sim context holds the state, the client
 *  holds its player); every other nested object is replaced; characters missing from the snapshot
 *  are dropped. */
export function assignState(target: SimState, snapshot: Readonly<SimState>): void {
  const copy: SimState = structuredClone(snapshot);
  const kept = new Map(target.entities.map((e) => [e.id, e]));
  copy.entities = copy.entities.map((e) => {
    const same = kept.get(e.id);
    return same ? Object.assign(same, e) : e;
  });
  Object.assign(target, copy);
}
