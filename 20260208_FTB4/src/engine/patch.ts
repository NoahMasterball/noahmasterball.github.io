import {
  CanvasTexture,
  CircleGeometry,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Texture,
} from 'three';

let radialAlpha: CanvasTexture | null = null;

/** Shared radial falloff alpha map (opaque centre, transparent rim). */
function getRadialAlpha(): CanvasTexture {
  if (radialAlpha) return radialAlpha;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#e8e8e8');
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  radialAlpha = new CanvasTexture(canvas);
  return radialAlpha;
}

/**
 * Soft-edged dirt/ground patch that visually seats buildings and props into
 * the terrain (fades out radially, no hard texture seam).
 */
export function createGroundPatch(map: Texture, radiusX: number, radiusZ: number): Mesh {
  map.colorSpace = SRGBColorSpace;
  const mat = new MeshStandardMaterial({
    map,
    color: 0xb0906c, // warm dirt tint over the photo texture
    alphaMap: getRadialAlpha(),
    transparent: true,
    depthWrite: false,
    roughness: 1,
  });
  const mesh = new Mesh(new CircleGeometry(1, 40), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(radiusX, radiusZ, 1);
  mesh.position.y = 0.015;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
