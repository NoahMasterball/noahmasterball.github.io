// Luftmacht — Daten für Flugzeug-Bewaffnung (Loadouts) und Hardpoints. Reine
// Daten + Helfer; keine Spiellogik. SSOT für „welche Waffen gibt es und worauf
// wirken sie“. Die Flugabwehr-Strukturen (Geländegebäude) liegen in buildings.js;
// das eigentliche Luftgefecht (Flüge, Beschuss nach Range) folgt als nächster
// Schritt und liest dann diese Definitionen.

// Aufhängepunkte (Hardpoints) je Flugzeug — Standardanzahl wählbarer Waffenslots.
export const PLANE_HARDPOINTS = 6;

// Zielklassen, auf die eine Waffe wirken kann:
//   air    feindliche Flugzeuge
//   radar  Radar-/Flugabwehr-Quellen (Anti-Radar-Raketen lenken auf deren Signal)
//   ground Bodenziele (Gebäude/Stellungen)
//   armor  gepanzerte Bodentruppen (Panzer)
export const WEAPONS = [
  {
    id: 'aam', label: 'Luft-Luft-Rakete (AAM)', icon: '🚀', targets: ['air'],
    range: 4, power: 8, note: 'Bekämpft feindliche Flugzeuge.',
  },
  {
    id: 'arm', label: 'Anti-Radar-Rakete (ARM)', icon: '📡', targets: ['radar'],
    range: 6, power: 10, note: 'Lenkt auf Radar-/Flugabwehr-Signale und schaltet sie aus.',
  },
  {
    id: 'atgm', label: 'Panzerabwehrrakete (ATGM)', icon: '🎯', targets: ['armor', 'ground'],
    range: 3, power: 12, note: 'Präzise gegen Panzer und Stellungen.',
  },
  {
    id: 'gbu', label: 'Lenkbombe (GBU)', icon: '💣', targets: ['ground'], range: 1, power: 16,
    note: 'Schwerer Schlag gegen Bodenziele/Gebäude.',
  },
];

export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

// Ist diese Einheit ein Flugzeug? (Flugzeuge sind Instanzen mit eigenem Loadout,
// keine gestapelten Garnison-Einheiten.) Eine Quelle für diese Prüfung.
export function isPlaneUnit(unit) {
  return !!unit && unit.category === 'plane';
}

// Leeres Standard-Loadout (alle Hardpoints unbestückt). Index = Hardpoint-Slot.
export function emptyLoadout() {
  return new Array(PLANE_HARDPOINTS).fill(null);
}

// Kann ein Loadout (Liste von Waffen-ids) ein bestimmtes Ziel bekämpfen?
export function loadoutCanHit(loadout, targetClass) {
  for (const wid of loadout) {
    const w = WEAPON_BY_ID.get(wid);
    if (w && w.targets.includes(targetClass)) return true;
  }
  return false;
}
