/**
 * Team support car: a small van that loops the road carrying spare bikes
 * on a roof rack. Hitting it triggers a crash; tucking in behind it within
 * the slipstream radius grants a temporary speed draft (see game.ts).
 * Pure procedural toon geometry, same language as BikeModel/tour-props.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';
import type { Planet } from '../world/planet';

const _side = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();

function buildMiniBike(frameColor: number): THREE.Group {
  const bike = new THREE.Group();
  const wheelGeo = new THREE.TorusGeometry(0.16, 0.025, 6, 14);
  const wheelMat = toonMat(0x1c1f2e);
  for (const z of [0.22, -0.22]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(0, 0.16, z);
    bike.add(wheel);
  }
  const frameMat = toonMat(frameColor);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.46), frameMat);
  frame.position.set(0, 0.2, 0);
  bike.add(frame);
  const seatTube = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.03), frameMat);
  seatTube.position.set(0, 0.28, -0.18);
  bike.add(seatTube);
  return bike;
}

export class SupportCar {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly tangent = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  private u: number;

  constructor(startU: number) {
    this.u = startU;

    // --- Body ---
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 3.6), toonMat(0xf5f5f0));
    body.position.y = 0.4 + 0.65;
    addOutline(body, 0.04);
    this.group.add(body);

    // Windshield stripe + sponsor band.
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 3.62), toonMat(0x2b5fbf));
    band.position.y = 0.4 + 1.0;
    this.group.add(band);

    // --- Wheels ---
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.22, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = toonMat(0x1c1f2e);
    for (const x of [-0.85, 0.85]) {
      for (const z of [1.1, -1.1]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(x, 0.4, z);
        this.group.add(wheel);
      }
    }

    // --- Roof rack with spare bikes ---
    const rack = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.4), toonMat(0x888888));
    rack.position.y = 0.4 + 1.3 + 0.04;
    this.group.add(rack);

    const bikeColors = [0xe84545, 0xffd23f, 0x53b7e8];
    for (let i = 0; i < 3; i++) {
      const mini = buildMiniBike(bikeColors[i % bikeColors.length]);
      mini.position.set(-0.5 + i * 0.5, 0.4 + 1.3 + 0.08, 0);
      mini.rotation.y = Math.PI / 2; // wheels face along the car's length
      this.group.add(mini);
    }
  }

  update(dt: number, planet: Planet): void {
    this.u = (this.u + (CONFIG.supportCar.speed * dt) / planet.road.totalLength) % 1;
    planet.road.pointAt(this.u, this.position);
    planet.road.tangentAt(this.u, this.tangent);
    this.up.copy(this.position).normalize();

    _side.crossVectors(this.tangent, this.up).normalize();
    _zAxis.crossVectors(_side, this.up).normalize();
    _mat4.makeBasis(_side, this.up, _zAxis);
    this.group.quaternion.setFromRotationMatrix(_mat4);
    this.group.position.copy(this.position).addScaledVector(this.up, CONFIG.road.lift);
  }
}
