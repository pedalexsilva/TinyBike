/**
 * RoadSpline: closed Catmull-Rom loop on the sphere surface.
 * Heights along the road are smoothed so gradients stay rideable; the
 * terrain is blended toward this profile (see planet.ts).
 *
 * This spline is the single source of truth reused by races (P09) and
 * rival AI (P10): pointAt(u) / tangentAt(u) are arc-length parametrized.
 */
import * as THREE from 'three';
import { dirFromLatLon } from './zones';

export interface RoadSample {
  /** Unit direction from planet center. */
  dir: THREE.Vector3;
  /** Terrain-smoothed height above base radius. */
  height: number;
  /** World position on the road surface. */
  position: THREE.Vector3;
  /** Unit tangent along the road. */
  tangent: THREE.Vector3;
}

export class RoadSpline {
  readonly samples: RoadSample[] = [];
  readonly totalLength: number;
  private readonly cumLength: number[] = [];

  constructor(
    controlLatLon: ReadonlyArray<readonly [number, number]>,
    baseHeight: (dir: THREE.Vector3) => number,
    radius: number,
    sampleCount = 1024,
  ) {
    const controls = controlLatLon.map(([lat, lon]) => dirFromLatLon(lat, lon));
    const curve = new THREE.CatmullRomCurve3(controls, true, 'centripetal');

    // 1) Sample directions on the unit sphere.
    const dirs: THREE.Vector3[] = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < sampleCount; i++) {
      curve.getPoint(i / sampleCount, p);
      dirs.push(p.clone().normalize());
    }

    // 2) Heights along the road: terrain sampled, then circular moving
    //    average (3 passes) so climbs are steady and descents flow.
    let heights = dirs.map((d) => baseHeight(d));
    const window = 22;
    for (let pass = 0; pass < 3; pass++) {
      const out = new Array<number>(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        let sum = 0;
        for (let k = -window; k <= window; k++) {
          sum += heights[(i + k + sampleCount) % sampleCount];
        }
        out[i] = sum / (window * 2 + 1);
      }
      heights = out;
    }

    // 3) Positions, tangents, cumulative arc length.
    for (let i = 0; i < sampleCount; i++) {
      this.samples.push({
        dir: dirs[i],
        height: heights[i],
        position: dirs[i].clone().multiplyScalar(radius + heights[i]),
        tangent: new THREE.Vector3(),
      });
    }
    let length = 0;
    for (let i = 0; i < sampleCount; i++) {
      const prev = this.samples[(i - 1 + sampleCount) % sampleCount];
      const next = this.samples[(i + 1) % sampleCount];
      this.samples[i].tangent.subVectors(next.position, prev.position).normalize();
      this.cumLength.push(length);
      length += this.samples[i].position.distanceTo(next.position);
    }
    this.totalLength = length;
  }

  /** Normalized arc-length parameter u ∈ [0,1) of a sample index. */
  uAt(index: number): number {
    return this.cumLength[index] / this.totalLength;
  }

  /** Index of the road sample closest to a unit direction (linear scan). */
  closestIndex(dir: THREE.Vector3): number {
    let best = 0;
    let bestDot = -2;
    for (let i = 0; i < this.samples.length; i++) {
      const d = this.samples[i].dir.dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    return best;
  }

  /** Angular distance (radians) from a unit direction to the road center. */
  angularDistanceTo(dir: THREE.Vector3): number {
    const s = this.samples[this.closestIndex(dir)];
    return Math.acos(Math.max(-1, Math.min(1, s.dir.dot(dir))));
  }

  /** Position at normalized arc length u ∈ [0, 1) (for races/AI). */
  pointAt(u: number, target: THREE.Vector3): THREE.Vector3 {
    const s = ((u % 1) + 1) % 1;
    const distance = s * this.totalLength;
    // Binary search over cumulative lengths.
    let lo = 0;
    let hi = this.cumLength.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumLength[mid] <= distance) lo = mid;
      else hi = mid - 1;
    }
    const a = this.samples[lo];
    const b = this.samples[(lo + 1) % this.samples.length];
    const segLen = a.position.distanceTo(b.position) || 1;
    const t = (distance - this.cumLength[lo]) / segLen;
    return target.copy(a.position).lerp(b.position, t);
  }

  /** Tangent at normalized arc length u ∈ [0, 1). */
  tangentAt(u: number, target: THREE.Vector3): THREE.Vector3 {
    const i = this.closestIndexAtU(u);
    return target.copy(this.samples[i].tangent);
  }

  private closestIndexAtU(u: number): number {
    const s = ((u % 1) + 1) % 1;
    const distance = s * this.totalLength;
    let lo = 0;
    let hi = this.cumLength.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cumLength[mid] <= distance) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}
