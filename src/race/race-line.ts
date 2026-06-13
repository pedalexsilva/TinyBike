/**
 * Race line: a glowing guidance ribbon laid down the centre of the road for
 * the active race route, with chevron arrows that flow toward the finish so
 * the rider always knows where the course goes (and which way). One mesh,
 * one draw call; animated by scrolling a repeating chevron texture. The bright
 * colour blooms through the post-processing stack for a pro "racing-line" look.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import type { Planet } from '../world/planet';

const _c = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _up = new THREE.Vector3();
const _side = new THREE.Vector3();
const _prev = new THREE.Vector3();

/** Repeating upward-pointing chevron on a transparent strip. */
function makeChevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // "^" pointing toward +V (the travel direction); empty lower half = gap.
  ctx.beginPath();
  ctx.moveTo(8, 40);
  ctx.lineTo(32, 12);
  ctx.lineTo(56, 40);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class RaceLine {
  readonly mesh: THREE.Mesh;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.MeshBasicMaterial;
  private scroll = 0;

  /** `endU` may exceed 1 (wrap) — pointAt handles the modulo. */
  constructor(planet: Planet, startU: number, endU: number, color = 0x32e0ff) {
    this.texture = makeChevronTexture();
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color,
      transparent: true,
      depthWrite: false,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.buildRibbon(planet, startU, endU), this.material);
    this.mesh.renderOrder = 3; // over the road + markings
    this.mesh.frustumCulled = false;
  }

  private buildRibbon(planet: Planet, startU: number, endU: number): THREE.BufferGeometry {
    const road = planet.road;
    const span = endU - startU;
    const routeLen = span * road.totalLength;
    const steps = Math.max(2, Math.min(800, Math.ceil(routeLen / 0.5)));
    const halfW = CONFIG.road.width * 0.3;
    const lift = CONFIG.road.lift + 0.02;
    const period = 4.5; // meters per chevron

    const positions = new Float32Array((steps + 1) * 2 * 3);
    const uvs = new Float32Array((steps + 1) * 2 * 2);
    const indices: number[] = [];
    let cum = 0;

    for (let i = 0; i <= steps; i++) {
      const u = startU + (i / steps) * span;
      road.pointAt(u, _c);
      road.tangentAt(u, _tan);
      _up.copy(_c).normalize();
      _side.crossVectors(_tan, _up).normalize();
      if (i > 0) cum += _c.distanceTo(_prev);
      _prev.copy(_c);
      const v = cum / period;

      for (const k of [-1, 1] as const) {
        const vert = i * 2 + (k + 1) / 2;
        positions[vert * 3] = _c.x + _side.x * halfW * k + _up.x * lift;
        positions[vert * 3 + 1] = _c.y + _side.y * halfW * k + _up.y * lift;
        positions[vert * 3 + 2] = _c.z + _side.z * halfW * k + _up.z * lift;
        uvs[vert * 2] = (k + 1) / 2; // across width
        uvs[vert * 2 + 1] = v; // along length
      }
      if (i < steps) {
        const a = i * 2;
        const b = (i + 1) * 2;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  /** Flow the chevrons toward the finish. */
  update(dt: number): void {
    this.scroll -= dt * 1.1;
    this.texture.offset.y = this.scroll;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
