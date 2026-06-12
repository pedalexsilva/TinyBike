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
 * Builds a quaternion whose local +Y is `normal` and local -Z is `forward`
 * (three.js "looks down -Z" convention). Forward is re-orthogonalized
 * against the normal, so a slightly drifting heading is fine.
 */
export function orientToSurface(
  target: THREE.Quaternion,
  normal: THREE.Vector3,
  forward: THREE.Vector3,
): THREE.Quaternion {
  _y.copy(normal);
  _z.copy(forward).negate();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  return target.setFromRotationMatrix(_m);
}
