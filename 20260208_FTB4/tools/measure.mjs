// Extracts per-piece world-space AABBs from .gltf files (node transforms applied)
// so modular kit pieces can be composed in code with known dimensions.
// Usage: node tools/measure.mjs public/assets/models/medieval [outfile]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv[2] ?? 'public/assets/models/medieval');
const out = process.argv[3] ?? join('asset_staging', `measurements_${dir.split(/[\\/]/).pop()}.json`);

function mat4Multiply(a, b) {
  const r = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return r;
}
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

const results = {};
// GLB container: 12-byte header, then a JSON chunk (length at offset 12).
function readGltfJson(path) {
  if (!path.endsWith('.glb')) return JSON.parse(readFileSync(path, 'utf8'));
  const buf = readFileSync(path);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
}

for (const file of readdirSync(dir).filter((f) => f.endsWith('.gltf') || f.endsWith('.glb'))) {
  try {
    const g = readGltfJson(join(dir, file));
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    const visit = (nodeIdx, parentMat) => {
      const node = g.nodes[nodeIdx];
      const mat = mat4Multiply(parentMat, nodeMatrix(node));
      if (node.mesh !== undefined) {
        for (const prim of g.meshes[node.mesh].primitives) {
          const acc = g.accessors[prim.attributes.POSITION];
          if (!acc?.min || !acc?.max) continue;
          for (const cx of [acc.min[0], acc.max[0]])
            for (const cy of [acc.min[1], acc.max[1]])
              for (const cz of [acc.min[2], acc.max[2]]) {
                const p = transformPoint(mat, [cx, cy, cz]);
                for (let i = 0; i < 3; i++) {
                  min[i] = Math.min(min[i], p[i]);
                  max[i] = Math.max(max[i], p[i]);
                }
              }
        }
      }
      for (const c of node.children ?? []) visit(c, mat);
    };

    const sceneNodes = g.scenes[g.scene ?? 0].nodes;
    for (const n of sceneNodes) visit(n, IDENT);

    const r3 = (v) => Math.round(v * 1000) / 1000;
    results[file.replace(/(\.gltf)?\.glb$|\.gltf$/, '')] = {
      min: min.map(r3),
      max: max.map(r3),
      size: max.map((v, i) => r3(v - min[i])),
    };
  } catch (err) {
    results[file] = { error: err.message };
  }
}

writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`Measured ${Object.keys(results).length} pieces -> ${out}`);
