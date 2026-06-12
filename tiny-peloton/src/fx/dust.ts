/**
 * Dust particles for hard cornering and boost starts.
 * Fixed-size pooled Points system — zero allocation in the loop.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';

const _vel = new THREE.Vector3();

export class DustFX {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private cursor = 0;

  constructor() {
    const n = CONFIG.fx.dustMax;
    this.positions = new Float32Array(n * 3);
    this.velocities = new Float32Array(n * 3);
    this.life = new Float32Array(n); // 0 = dead
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xd8c9a3,
      size: 0.32,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.object = new THREE.Points(this.geometry, material);
    this.object.frustumCulled = false;
    // Park dead particles far away instead of allocating/removing.
    this.positions.fill(99999);
  }

  /** Spawn `count` particles at `origin`, biased along `up`. */
  spawn(origin: THREE.Vector3, up: THREE.Vector3, count: number): void {
    const n = CONFIG.fx.dustMax;
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % n;
      this.positions[i * 3] = origin.x;
      this.positions[i * 3 + 1] = origin.y;
      this.positions[i * 3 + 2] = origin.z;
      _vel
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(2.2)
        .addScaledVector(up, 1.6 + Math.random());
      this.velocities[i * 3] = _vel.x;
      this.velocities[i * 3 + 1] = _vel.y;
      this.velocities[i * 3 + 2] = _vel.z;
      this.life[i] = 0.55 + Math.random() * 0.3;
    }
  }

  update(dt: number): void {
    const n = CONFIG.fx.dustMax;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3] = 99999;
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      // Slow down over life.
      this.velocities[i * 3] *= 0.95;
      this.velocities[i * 3 + 1] *= 0.95;
      this.velocities[i * 3 + 2] *= 0.95;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
