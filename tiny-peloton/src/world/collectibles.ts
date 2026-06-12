/**
 * Musettes — floating feed bags along the road. Riding through one
 * instantly fills the boost bar (per the design: collect → instant boost).
 * They bob, spin, glow, pop on pickup and respawn after a while.
 * One InstancedMesh → one draw call for all of them.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat } from '../render/toon';
import type { Planet } from './planet';

const PICKUP_RADIUS = 1.6;
const RESPAWN_SECONDS = 20;
const HOVER = 1.0;
const BOB = 0.18;

interface MusetteState {
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

export class Musettes {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: MusetteState[] = [];
  private time = 0;

  /** Set by the game: called when a musette is collected (FX/sound hook). */
  onCollect: ((position: THREE.Vector3, up: THREE.Vector3) => void) | null = null;

  constructor(planet: Planet, count = 16) {
    // Bag silhouette: flat box + a thin "strap" on top, merged cheaply by
    // building the strap into the box via a second geometry is overkill —
    // a single rounded-ish box reads fine at gameplay distance.
    const geo = new THREE.BoxGeometry(0.55, 0.6, 0.18);
    const mat = toonMat(0xfff6e8, {
      emissive: 0xffaa33,
      emissiveIntensity: 0.35,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false; // they ring the whole planet

    // Spread evenly along the road, alternating left/right of center.
    const side = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const s = planet.road.samples[
        Math.floor((i / count) * planet.road.samples.length)
      ];
      side.crossVectors(s.tangent, s.dir).normalize();
      const offset = (i % 2 === 0 ? 1 : -1) * (CONFIG.road.width * 0.22);
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

  /** Returns true if the player collected a musette this frame. */
  update(dt: number, playerPos: THREE.Vector3): boolean {
    this.time += dt;
    let collected = false;

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];

      if (it.respawn > 0) {
        it.respawn -= dt;
        // Respawn pop-in: grow from 0 in the last 0.3s.
        const grow = it.respawn < 0.3 ? 1 - it.respawn / 0.3 : 0;
        this.compose(i, it, grow * grow);
        continue;
      }

      if (it.pop > 0) {
        it.pop = Math.max(0, it.pop - dt * 5);
        this.compose(i, it, it.pop); // shrink out
        if (it.pop === 0) it.respawn = RESPAWN_SECONDS;
        continue;
      }

      // Alive: bob + spin, check pickup.
      this.compose(i, it, 1);
      if (playerPos.distanceToSquared(it.basePos) < PICKUP_RADIUS * PICKUP_RADIUS) {
        it.pop = 1;
        collected = true;
        if (this.onCollect) this.onCollect(it.basePos, it.up);
        // TODO(P17): play pickup chime here.
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    return collected;
  }

  private compose(index: number, it: MusetteState, scale: number): void {
    const bob = Math.sin(this.time * 2.2 + it.phase) * BOB;
    _pos.copy(it.basePos).addScaledVector(it.up, bob);
    _quat.setFromUnitVectors(Y, it.up);
    _spin.setFromAxisAngle(Y, this.time * 1.4 + it.phase);
    _quat.multiply(_spin);
    _scale.setScalar(Math.max(scale, 0.0001));
    _mat.compose(_pos, _quat, _scale);
    this.mesh.setMatrixAt(index, _mat);
  }
}
