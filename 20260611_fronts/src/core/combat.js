// Kampf & Truppenbewegung — Truppen liegen auf Hexfeldern (Garnisonen), nicht
// abstrakt pro Land. Eroberung läuft Feld für Feld: ein Marschbefehl schickt den
// Trupp eines Feldes einen Weg entlang; pro Feld vergeht Reisezeit, und an jedem
// gegnerischen Feld wird einzeln gekämpft/erobert. Operiert auf dem übergebenen
// Zustand. SSOT für die Kampf- und Bewegungsregeln.

import { hexKey, hexNeighbors } from './hexgrid.js';
import { UNIT_BY_ID } from '../data/military.js';
import {
  HOME_DEFENSE_BONUS, BATTLE_LOSS_SCALE, BATTLE_RANDOMNESS,
  TROOP_MOVE_MS, TROOP_PATH_MAX_NODES,
} from '../config/constants.js';

// --- Garnisonen (Truppen je Feld) -------------------------------------------
// Die Garnison eines Feldes (Map unitId -> Anzahl); legt sie bei Bedarf an.
export function garrisonAt(state, key) {
  let g = state.garrisons.get(key);
  if (!g) { g = new Map(); state.garrisons.set(key, g); }
  return g;
}

// Fügt n Einheiten eines Typs der Garnison eines Feldes hinzu.
export function addUnits(state, key, unitId, n = 1) {
  const g = garrisonAt(state, key);
  g.set(unitId, (g.get(unitId) || 0) + n);
}

// Verschiebt einen ganzen Einheiten-Stack (Map) in die Garnison eines Feldes.
function depositStack(state, key, units) {
  const g = garrisonAt(state, key);
  for (const [unitId, n] of units) {
    if (n > 0) g.set(unitId, (g.get(unitId) || 0) + n);
  }
}

// Gesamtzahl Einheiten in einem Stack/einer Garnison.
export function stackSize(units) {
  if (!units) return 0;
  let n = 0;
  for (const c of units.values()) n += c;
  return n;
}

// Stärke eines Stacks in einer Dimension ('atk' | 'def').
export function stackPower(units, kind) {
  if (!units) return 0;
  let sum = 0;
  for (const [unitId, count] of units) {
    const u = UNIT_BY_ID.get(unitId);
    if (u) sum += u[kind] * count;
  }
  return sum;
}

// Reduziert jede Einheitenzahl eines Stacks um den Anteil frac (0..1).
function applyStackLosses(units, frac) {
  for (const [unitId, count] of units) {
    const left = Math.floor(count * (1 - frac));
    if (left > 0) units.set(unitId, left);
    else units.delete(unitId);
  }
}

// --- Aggregate je Land (für UI) ---------------------------------------------
// Gesamtstärke aller Garnisonen eines Landes in einer Dimension.
export function countryPower(state, key, kind) {
  let sum = 0;
  for (const [hk, units] of state.garrisons) {
    if (state.owners.get(hk) === key) sum += stackPower(units, kind);
  }
  return sum;
}

// Anzahl einer Einheit über alle Garnisonen eines Landes (für die Armee-Liste).
export function countryUnitCount(state, key, unitId) {
  let n = 0;
  for (const [hk, units] of state.garrisons) {
    if (state.owners.get(hk) === key) n += units.get(unitId) || 0;
  }
  return n;
}

// --- Feld-Eroberung ---------------------------------------------------------
// Schreibt ein Feld einem neuen Land zu und pflegt hexCount/Eliminierung. Eine
// Quelle für „Feld wechselt den Besitzer“.
function captureField(state, key, newOwner) {
  const prev = state.owners.get(key);
  if (prev === newOwner) return;
  state.owners.set(key, newOwner);
  const pc = prev && state.countries.get(prev);
  const nc = state.countries.get(newOwner);
  if (pc) {
    pc.hexCount = Math.max(0, pc.hexCount - 1);
    if (pc.hexCount === 0) {
      pc.eliminated = true;
      if (prev === state.playerCountry) state.playerDefeated = true;
    }
  }
  if (nc) nc.hexCount++;
  state.dirtyHexes.add(key); // dieses Feld auf der politischen Karte neu malen
  state.mapDirty = true;     // Kartenbild + Adjazenz veraltet
}

// --- Wegfindung (nur über Landfelder) ---------------------------------------
// BFS-Kürzester Weg von fromKey nach toKey über benachbarte Landfelder (Felder
// mit Besitzer). Liefert die Schlüsselliste inkl. Start und Ziel oder null.
export function planPath(state, fromKey, toKey) {
  if (fromKey === toKey) return [fromKey];
  const prev = new Map([[fromKey, null]]);
  const queue = [fromKey];
  let head = 0;
  let visited = 0;
  while (head < queue.length && visited < TROOP_PATH_MAX_NODES) {
    const cur = queue[head++];
    visited++;
    const [q, r] = cur.split(',').map(Number);
    for (const nb of hexNeighbors(q, r)) {
      const nk = hexKey(nb.q, nb.r);
      if (prev.has(nk)) continue;
      if (!state.owners.has(nk)) continue; // nur Landfelder begehbar
      prev.set(nk, cur);
      if (nk === toKey) return reconstruct(prev, toKey);
      queue.push(nk);
    }
  }
  return null;
}

function reconstruct(prev, toKey) {
  const path = [];
  let k = toKey;
  while (k != null) { path.push(k); k = prev.get(k); }
  path.reverse();
  return path;
}

// --- Marschbefehle ----------------------------------------------------------
/**
 * Startet eine Truppenbewegung: zieht die GANZE Garnison von fromKey ab und
 * schickt sie den Weg zu toKey entlang. Reisezeit pro Feld = TROOP_MOVE_MS.
 * @returns {{ ok:boolean, reason?:string, legs?:number }}
 */
export function startMovement(state, owner, fromKey, toKey, now) {
  if (state.owners.get(fromKey) !== owner)
    return { ok: false, reason: 'Startfeld gehört dir nicht.' };
  const g = state.garrisons.get(fromKey);
  if (!g || stackSize(g) === 0)
    return { ok: false, reason: 'Keine Truppen auf dem Feld.' };
  if (!state.owners.has(toKey))
    return { ok: false, reason: 'Ziel ist kein Landfeld.' };
  if (fromKey === toKey)
    return { ok: false, reason: 'Truppen stehen schon dort.' };
  const path = planPath(state, fromKey, toKey);
  if (!path || path.length < 2)
    return { ok: false, reason: 'Kein Landweg zum Ziel.' };
  state.garrisons.delete(fromKey); // Truppen ziehen ab
  state.movements.push({ owner, units: g, path, legIndex: 0, legStart: now });
  return { ok: true, legs: path.length - 1 };
}

function jitter(rng) {
  return 1 + (rng() * 2 - 1) * BATTLE_RANDOMNESS;
}

// Löst die Ankunft eines marschierenden Stacks auf dem Feld arriveKey auf.
// Liefert 'continue' (Stack zieht weiter), 'stop' (Bewegung endet) oder
// 'wiped' (Stack vernichtet).
function resolveArrival(state, m, arriveKey, prevKey, rng) {
  const owner = m.owner;
  // Eigenes/bereits erobertes Feld: einfach durchziehen.
  if (state.owners.get(arriveKey) === owner) return 'continue';

  const defUnits = state.garrisons.get(arriveKey);
  const dPow = stackPower(defUnits, 'def') * HOME_DEFENSE_BONUS;
  // Unverteidigtes Feindfeld: ohne Kampf erobern.
  if (dPow <= 0) { captureField(state, arriveKey, owner); return 'continue'; }

  // Kampf: beide Seiten erleiden Verluste anteilig zur Gegenstärke.
  const aPow = stackPower(m.units, 'atk') * jitter(rng);
  const dRoll = dPow * jitter(rng);
  const total = aPow + dRoll || 1;
  applyStackLosses(m.units, (dRoll / total) * BATTLE_LOSS_SCALE);
  applyStackLosses(defUnits, (aPow / total) * BATTLE_LOSS_SCALE);

  const defLeft = stackPower(defUnits, 'def');
  if (defLeft <= 0.5 && stackSize(m.units) > 0) {
    // Verteidiger gebrochen: Reste entfernen, Feld erobern, weiterziehen.
    state.garrisons.delete(arriveKey);
    logWar(state, `${nameOf(state, owner)} erobert ein Feld von ${nameOf(state, state.owners.get(arriveKey))}`,
      'capture', owner, state.owners.get(arriveKey));
    captureField(state, arriveKey, owner);
    return 'continue';
  }
  // Angriff abgewehrt: Überlebende ziehen sich aufs Vorfeld zurück.
  if (stackSize(m.units) > 0) depositStack(state, prevKey, m.units);
  return 'wiped';
}

/**
 * Rückt alle laufenden Bewegungen bis zum Zeitpunkt `now` vor. Schließt fällige
 * Wegabschnitte ab (Kampf/Eroberung) und setzt Truppen am Ziel ab.
 */
export function advanceMovements(state, now) {
  const moves = state.movements;
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i];
    let safety = 0;
    while (safety++ < 128) {
      // Ziel bereits erreicht? Truppen absetzen.
      if (m.legIndex >= m.path.length - 1) {
        depositStack(state, m.path[m.legIndex], m.units);
        moves.splice(i, 1);
        break;
      }
      if (now - m.legStart < TROOP_MOVE_MS) break; // Abschnitt noch unterwegs
      const prevKey = m.path[m.legIndex];
      const arriveKey = m.path[m.legIndex + 1];
      const status = resolveArrival(state, m, arriveKey, prevKey, Math.random);
      m.legStart += TROOP_MOVE_MS;
      if (status === 'wiped' || stackSize(m.units) === 0) { moves.splice(i, 1); break; }
      m.legIndex++; // Stack steht jetzt auf arriveKey
    }
  }
}

function nameOf(state, key) {
  return state.countries.get(key)?.name || '—';
}

// Schreibt ein Ereignis ins Kriegslog (jüngstes zuerst, begrenzt).
export function logWar(state, message, kind, aKey, dKey) {
  state.warLog.unshift({ message, kind, aKey, dKey });
  if (state.warLog.length > 30) state.warLog.length = 30;
}
