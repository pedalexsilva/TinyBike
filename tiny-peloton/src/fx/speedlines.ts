/**
 * Radial speed lines attached to the camera (anime-style boost feedback).
 * Cheap: one LineSegments draw call, opacity-driven.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';

export class SpeedLinesFX {
  readonly object: THREE.LineSegments;
  private readonly material: THREE.LineBasicMaterial;
  private intensity = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const n = CONFIG.fx.speedLineCount;
    const positions = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const r0 = 0.55 + Math.random() * 0.25;
      const r1 = r0 + 0.25 + Math.random() * 0.3;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions[i * 6] = ca * r0;
      positions[i * 6 + 1] = sa * r0;
      positions[i * 6 + 2] = 0;
      positions[i * 6 + 3] = ca * r1;
      positions[i * 6 + 4] = sa * r1;
      positions[i * 6 + 5] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.object = new THREE.LineSegments(geo, this.material);
    this.object.position.set(0, 0, -1.2);
    this.object.scale.set(1.6, 1.1, 1);
    this.object.renderOrder = 999;
    this.object.frustumCulled = false;
    camera.add(this.object);
  }

  update(dt: number, boosting: boolean): void {
    const target = boosting ? 0.5 : 0;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-8 * dt));
    this.material.opacity = this.intensity;
    this.object.visible = this.intensity > 0.02;
    if (this.object.visible) this.object.rotation.z += dt * 2.5;
  }
}
