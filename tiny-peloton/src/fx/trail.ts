/**
 * Boost trail: an additive line that follows the rear wheel.
 * Preallocated buffers, no per-frame allocation.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';

export class TrailFX {
  readonly object: THREE.Line;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.LineBasicMaterial;
  private count = 0;
  private intensity = 0;

  constructor() {
    const n = CONFIG.fx.trailLength;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.object = new THREE.Line(this.geometry, this.material);
    this.object.frustumCulled = false;
  }

  update(dt: number, contact: THREE.Vector3, boosting: boolean, speedRatio: number): void {
    const n = CONFIG.fx.trailLength;
    const target = boosting ? 1 : Math.max(0, speedRatio - 0.85) * 2;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-5 * dt));

    // Shift history back by one (in-place).
    this.positions.copyWithin(3, 0, (n - 1) * 3);
    this.positions[0] = contact.x;
    this.positions[1] = contact.y;
    this.positions[2] = contact.z;
    this.count = Math.min(this.count + 1, n);

    // Fading color ramp: hot orange at the head → black at the tail.
    for (let i = 0; i < n; i++) {
      const f = (1 - i / n) * this.intensity;
      this.colors[i * 3] = f;
      this.colors[i * 3 + 1] = f * 0.55;
      this.colors[i * 3 + 2] = f * 0.15;
    }

    this.geometry.setDrawRange(0, this.count);
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.object.visible = this.intensity > 0.02;
  }
}
