/**
 * Spherical-world math utilities.
 * All functions write into caller-provided targets — zero allocation.
 * Orientation is quaternion-only (no Euler) to avoid pole singularities.
 */
import * as THREE from 'three';

/** Outward surface normal of a sphere centered at `center`, at `pos`. */
export function surfaceNormal(
  pos: THREE.Vector3,
  center: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.subVectors(pos, center).normalize();
}

/** Removes the component of `vec` along `normal` (writes into `target`). */
export function projectOnTangentPlane(
  vec: THREE.Vector3,
  normal: THREE.Vector3,
  target: THREE.Vector3,
): THREE.Vector3 {
  if (target !== vec) target.copy(vec);
  return target.addScaledVector(normal, -vec.dot(normal));
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

/**
 * Builds a quaternion whose local +Y is `normal` and local +Z is `forward`.
 * NOTE: our procedural models face +Z (front wheel/handlebar at +Z), so
 * +Z = heading is the project-wide convention. Forward is
 * re-orthogonalized against the normal, so a drifting heading is fine.
 */
export function orientToSurface(
  target: THREE.Quaternion,
  normal: THREE.Vector3,
  forward: THREE.Vector3,
): THREE.Quaternion {
  _y.copy(normal);
  _z.copy(forward);
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  return target.setFromRotationMatrix(_m);
}

/** Unit direction from latitude/longitude in degrees (Y = polar axis). */
export function dirFromLatLon(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  );
}

/** Angle between two unit vectors (radians). */
export function angularDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
}
