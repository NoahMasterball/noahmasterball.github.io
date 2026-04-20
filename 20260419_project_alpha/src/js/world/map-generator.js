import { WORLD, BUILDINGS } from '../config/constants.js';
import { BuildingType } from '../config/enums.js';

// Pure-Data-Generator. Keine Three.js-Abhängigkeit.
// Liefert einen WorldChunkData-Describe: Zellen-Labels, Buildings, Meadow-Tiles, Spawn-Point.
// Streets und Sidewalks werden aus diesen Daten in transitions.js abgeleitet
// (Streets = komplettes Grid-Netz, Sidewalk = Ring um jedes Gebäude).
//
// Seeding: deterministisches Mulberry32. Gleiche Seed → gleiche Map.

export function generateMap(seedInput) {
  const seed = (seedInput >>> 0) || 1;
  const rand = mulberry32(seed);

  const mapSize = WORLD.MAP_SIZE;
  const grid = WORLD.CHUNK_GRID;
  const cellSize = mapSize / grid;
  const halfMap = mapSize / 2;

  // Zellen-Labels: BUILDING oder MEADOW. Keine EMPTY — jede Zelle hat entweder Gebäude oder Wiese.
  // Zwischen den Zellen liegt immer das Straßennetz (siehe transitions.js).
  const cells = [];
  for (let i = 0; i < grid; i++) {
    const row = [];
    for (let j = 0; j < grid; j++) {
      row.push(rand() < WORLD.BUILDING_DENSITY ? 'building' : 'meadow');
    }
    cells.push(row);
  }

  // Garantie: die Zentrums-Kreuzung ist Street (Spawn). Die vier Nachbarzellen
  // zum Zentrum dürfen frei sein (Gebäude oder Wiese) — der Spieler steht auf der Kreuzung.

  // Building-Typen gewichtet vorbereiten.
  const weighted = buildWeightedTypeTable();
  const buildings = [];
  const meadows = [];

  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const centerX = (i + 0.5) * cellSize - halfMap;
      const centerZ = (j + 0.5) * cellSize - halfMap;

      if (cells[i][j] === 'building') {
        buildings.push(makeBuilding(rand, weighted, centerX, centerZ, cellSize, i, j));
      } else {
        meadows.push({
          cellI: i,
          cellJ: j,
          centerX,
          centerZ,
          size: cellSize - WORLD.STREET_WIDTH,
          scatterSeed: Math.floor(rand() * 0xffffffff),
        });
      }
    }
  }

  // Min-Spacing-Check: wenn zwei Gebäude zu nah sind (kann durch zufällige Offsets passieren),
  // das zweite auf Zellzentrum zurückziehen.
  enforceMinSpacing(buildings);

  return {
    seed,
    mapSize,
    grid,
    cellSize,
    cells,
    buildings,
    meadows,
    spawnPoint: { x: 0, y: WORLD.SPAWN_HEIGHT, z: 0 },
  };
}

function makeBuilding(rand, weighted, centerX, centerZ, cellSize, cellI, cellJ) {
  const typeKey = weighted[Math.floor(rand() * weighted.length)];
  const tpl = BUILDINGS[typeKey];

  // Verfügbare Fläche im Zellen-Inneren = cellSize minus Straße auf allen Seiten,
  // minus Sidewalk + Padding auf allen Seiten.
  const ringInset = WORLD.STREET_WIDTH + 2 * WORLD.SIDEWALK_WIDTH + 2 * WORLD.BUILDING_PAD;
  const maxFit = Math.max(tpl.minSize, cellSize - ringInset);

  const sizeX = lerp(tpl.minSize, Math.min(tpl.maxSize, maxFit), rand());
  const sizeZ = lerp(tpl.minSize, Math.min(tpl.maxSize, maxFit), rand());
  const height = lerp(tpl.minHeight, tpl.maxHeight, rand());

  // Leichter zufälliger Offset innerhalb der Zelle, aber so klein, dass der Sidewalk-Ring
  // nicht in die Straße ragt.
  const slackX = (cellSize - WORLD.STREET_WIDTH - 2 * WORLD.SIDEWALK_WIDTH - sizeX) / 2;
  const slackZ = (cellSize - WORLD.STREET_WIDTH - 2 * WORLD.SIDEWALK_WIDTH - sizeZ) / 2;
  const offsetX = slackX > 0 ? (rand() * 2 - 1) * slackX : 0;
  const offsetZ = slackZ > 0 ? (rand() * 2 - 1) * slackZ : 0;

  const rotation = Math.floor(rand() * 4) * (Math.PI / 2);
  const typeValue = BuildingType[typeKey];

  return {
    type: typeValue,
    typeKey,
    x: centerX + offsetX,
    z: centerZ + offsetZ,
    sizeX,
    sizeZ,
    height,
    rotation,
    color: tpl.color,
    roofColor: tpl.roofColor,
    hasAlarm: tpl.hasAlarm,
    cellI,
    cellJ,
  };
}

function buildWeightedTypeTable() {
  const table = [];
  for (const key of Object.keys(BUILDINGS)) {
    const w = BUILDINGS[key].weight | 0;
    for (let k = 0; k < w; k++) table.push(key);
  }
  return table;
}

function enforceMinSpacing(buildings) {
  const min = WORLD.MIN_BUILDING_SPACING;
  for (let a = 0; a < buildings.length; a++) {
    for (let b = a + 1; b < buildings.length; b++) {
      const A = buildings[a], B = buildings[b];
      // Abstand zwischen den Außenkanten (nicht Zentrumsabstand).
      const dx = Math.abs(A.x - B.x) - (A.sizeX + B.sizeX) / 2;
      const dz = Math.abs(A.z - B.z) - (A.sizeZ + B.sizeZ) / 2;
      if (dx < min && dz < min) {
        // B auf Zellenzentrum seines eigenen Cells zurückziehen.
        B.x = (B.cellI + 0.5) * (WORLD.MAP_SIZE / WORLD.CHUNK_GRID) - WORLD.MAP_SIZE / 2;
        B.z = (B.cellJ + 0.5) * (WORLD.MAP_SIZE / WORLD.CHUNK_GRID) - WORLD.MAP_SIZE / 2;
      }
    }
  }
}

export function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
