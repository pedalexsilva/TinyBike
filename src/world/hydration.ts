/**
 * Bidons — water bottles along the road. Riding through one refills the
 * hydration meter, grants a brief "fresh legs" speed bump and extends the
 * pickup combo. Same bob/spin/pop/respawn choreography as the musettes
 * (world/collectibles.ts), interleaved along the road so the two pickups
 * don't overlap. One InstancedMesh → one draw call.
 */
import * as THREE from 'three';
import { toonMat } from '../render/toon';
import type { Planet } from './planet';

const PICKUP_RADIUS = 1.6;
const RESPAWN_SECONDS = 18;
const HOVER = 0.85;
const BOB = 0.14;

interface BidonState {
  basePos: THREE.Vector3;
  up: THREE.Vector3;
  phase: number;
  /** 0 = alive; >0 = seconds until respawn. */
  respawn: number;
  /** Pickup pop animation 1 → 0. */
  pop: number;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const Y = new THREE.Vector3(0, 1, 0);

export class Bidons {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: BidonState[] = [];
  private time = 0;

  /** Set by the game: called when a bidon is collected (FX/sound hook). */
  onCollect: ((position: THREE.Vector3, up: THREE.Vector3) => void) | null = null;

  constructor(planet: Planet, count = 12) {
    // Bottle silhouette: a squat cylinder with a narrow neck, merged via a
    // single tapered cylinder — reads fine as a bidon at gameplay distance.
    const geo = new THREE.CylinderGeometry(0.1, 0.13, 0.34, 8);
    const mat = toonMat(0x53b7e8, { emissive: 0x1f6fa8, emissiveIntensity: 0.3 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false; // they ring the whole planet

    // Spread evenly along the road, offset from the musettes (which sit at
    // i / 16) and alternating sides.
    const side = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const s = planet.road.samples[
        Math.floor(((i + 0.5) / count) * planet.road.samples.length)
      ];
      side.crossVectors(s.tangent, s.dir).normalize();
      const offset = (i % 2 === 0 ? -1 : 1) * 0.9;
      this.items.push({
        basePos: s.position
          .clone()
          .addScaledVector(side, offset)
          .addScaledVector(s.dir, HOVER),
        up: s.dir.clone(),
        phase: (i / count) * Math.PI * 2,
        respawn: 0,
        pop: 0,
      });
    }
  }

  /** Returns true if the player collected a bidon this frame. */
  update(dt: number, playerPos: THREE.Vector3): boolean {
    this.time += dt;
    let collected = false;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];

      if (it.respawn > 0) {
        it.respawn -= dt;
        const grow = it.respawn < 0.3 ? 1 - it.respawn / 0.3 : 0;
        this.compose(i, it, grow * grow);
        continue;
      }

      if (it.pop > 0) {
        it.pop = Math.max(0, it.pop - dt * 5);
        this.compose(i, it, it.pop);
        if (it.pop === 0) it.respawn = RESPAWN_SECONDS;
        continue;
      }

      this.compose(i, it, 1);
      if (playerPos.distanceToSquared(it.basePos) < PICKUP_RADIUS * PICKUP_RADIUS) {
        it.pop = 1;
        collected = true;
        if (this.onCollect) this.onCollect(it.basePos, it.up);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    return collected;
  }

  private compose(index: number, it: BidonState, scale: number): void {
    const bob = Math.sin(this.time * 1.8 + it.phase) * BOB;
    _pos.copy(it.basePos).addScaledVector(it.up, bob);
    _quat.setFromUnitVectors(Y, it.up);
    _spin.setFromAxisAngle(Y, this.time * 1.1 + it.phase);
    _quat.multiply(_spin);
    _scale.setScalar(Math.max(scale, 0.0001));
    _mat.compose(_pos, _quat, _scale);
    this.mesh.setMatrixAt(index, _mat);
  }
}
