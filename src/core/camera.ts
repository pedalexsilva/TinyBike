/**
 * Third-person follow camera for spherical worlds.
 * Sits behind/above the player aligned with the local surface "up",
 * with positional lag, speed-scaled FOV and boost screen shake.
 * The curved horizon of the mini-planet stays in frame — the marketing shot.
 */
import * as THREE from 'three';
import { CONFIG } from './config';
import type { Player } from '../entities/player';

const _desired = new THREE.Vector3();
const _look = new THREE.Vector3();
const _shake = new THREE.Vector3();

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private shakeMag = 0;
  private boostFov = 0;
  private reduceShake = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fovBase, aspect, 0.1, 2000);
  }

  setReduceShake(value: boolean): void {
    this.reduceShake = value;
  }

  /** Snap instantly behind the player (call once at startup). */
  snap(player: Player): void {
    this.computeDesired(player, _desired);
    this.camera.position.copy(_desired);
    this.camera.up.copy(player.up);
    this.computeLook(player, _look);
    this.camera.lookAt(_look);
  }

  private computeDesired(player: Player, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(player.position)
      .addScaledVector(player.heading, -CONFIG.camera.distance)
      .addScaledVector(player.up, CONFIG.camera.height);
  }

  private computeLook(player: Player, target: THREE.Vector3): THREE.Vector3 {
    return target
      .copy(player.position)
      .addScaledVector(player.heading, CONFIG.camera.lookAhead)
      .addScaledVector(player.up, CONFIG.camera.lookUp);
  }

  update(dt: number, player: Player): void {
    const C = CONFIG.camera;

    // Damped position follow.
    this.computeDesired(player, _desired);
    const t = 1 - Math.exp(-C.damping * dt);
    this.camera.position.lerp(_desired, t);

    // Damped up vector (keeps the horizon stable across the sphere).
    // If the inherited up is pointing the wrong way (e.g. left over from a
    // cutscene/orbit transition), snap instead of lerping through the zero
    // vector — that midpoint would briefly flip the image upside down.
    if (this.camera.up.dot(player.up) < 0) {
      this.camera.up.copy(player.up);
    } else {
      const upT = 1 - Math.exp(-C.upDamping * dt);
      this.camera.up.lerp(player.up, upT).normalize();
    }

    // FOV: speed sensation + boost kick.
    const speedRatio = player.speed / CONFIG.player.maxSpeed;
    const targetBoostFov = player.boosting ? CONFIG.boost.fovKick : 0;
    this.boostFov += (targetBoostFov - this.boostFov) * (1 - Math.exp(-6 * dt));
    const fov = C.fovBase + C.fovSpeedGain * speedRatio + this.boostFov;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Screen shake on boost activation or a crash, exponentially decaying.
    if (player.justBoosted && !this.reduceShake) this.shakeMag = CONFIG.boost.shake;
    if (player.justCrashed && !this.reduceShake) this.shakeMag = CONFIG.crash.shake;
    if (this.shakeMag > 0.001) {
      _shake
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .multiplyScalar(this.shakeMag);
      this.camera.position.add(_shake);
      this.shakeMag *= Math.exp(-7 * dt);
    }

    this.computeLook(player, _look);
    this.camera.lookAt(_look);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
