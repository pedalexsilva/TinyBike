/**
 * Cel-shading helpers: shared 3-band gradient map, toon materials and
 * inverted-hull outlines.
 */
import * as THREE from 'three';

let gradientMap: THREE.DataTexture | null = null;

/**
 * Shared 5-band gradient map for MeshToonMaterial (cached). A richer ramp
 * than a hard 3-band split: the extra midtones soften the terminator and
 * lift shadows just enough to read as "premium cel" rather than flat-shaded.
 * The lowest band stays warm-dark (not black) so shadowed faces keep colour.
 */
export function getToonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([74, 128, 178, 222, 255]);
    gradientMap = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export interface ToonOptions {
  vertexColors?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export function toonMat(color: number, opts: ToonOptions = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    vertexColors: opts.vertexColors ?? false,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

const OUTLINE_COLOR = 0x1a1726; // warm ink — richer than neutral grey

/**
 * Inverted-hull outline: adds a slightly scaled back-face copy of the mesh
 * as a child. Works well on round-ish shapes (heads, wheels, helmets).
 */
export function addOutline(mesh: THREE.Mesh, thickness = 0.045): THREE.Mesh {
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }),
  );
  outline.scale.setScalar(1 + thickness);
  outline.raycast = () => undefined; // never block gameplay raycasts
  mesh.add(outline);
  return outline;
}
