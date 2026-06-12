/**
 * Player controller on a spherical world.
 * - Gravity points at the planet center; "up" is the (smoothed) surface normal.
 * - Position is snapped to the terrain/road via BVH raycasts.
 * - Heading is a tangent vector rotated around "up" — quaternion math only,
 *   so full laps in any direction never flip orientation.
 * - Slope physics: climbing bleeds speed, descending grants some back.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { surfaceNormal, projectOnTangentPlane, orientToSurface } from '../core/spherical';
import type { InputFrame } from '../core/input';
import type { Planet } from '../world/planet';

const _ray = new THREE.Raycaster();
_ray.firstHitOnly = true;
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _surfNormal = new THREE.Vector3();
const _slope = new THREE.Vector3();

export class Player {
  readonly position = new THREE.Vector3();
  readonly heading = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();

  speed = 0;
  boostCharge = CONFIG.boost.startCharge;
  boostTimer = 0;
  /** True only on the frame a boost was activated (for FX/camera kicks). */
  justBoosted = false;
  /** Smoothed steer value, useful for lean/FX. */
  smoothSteer = 0;

  private readonly planet: Planet;

  constructor(planet: Planet) {
    this.planet = planet;
    // Start on the road at the Vila finish arch, heading along the route.
    const start = planet.road.samples[2];
    this.up.copy(start.dir);
    this.position.copy(start.position).addScaledVector(start.dir, 0.5);
    this.heading.copy(start.tangent);
    projectOnTangentPlane(this.heading, this.up, this.heading).normalize();
    orientToSurface(this.quaternion, this.up, this.heading);
  }

  /** Teleport to a position facing `forward` (race grid / gate reset). */
  resetTo(position: THREE.Vector3, forward: THREE.Vector3): void {
    this.position.copy(position);
    this.up.copy(position).normalize();
    this.heading.copy(forward);
    projectOnTangentPlane(this.heading, this.up, this.heading).normalize();
    orientToSurface(this.quaternion, this.up, this.heading);
    this.speed = 0;
    this.boostTimer = 0;
    this.smoothSteer = 0;
  }

  get boosting(): boolean {
    return this.boostTimer > 0;
  }

  get maxSpeed(): number {
    return CONFIG.player.maxSpeed * (this.boosting ? CONFIG.boost.multiplier : 1);
  }

  update(dt: number, input: InputFrame): void {
    const C = CONFIG.player;
    const B = CONFIG.boost;

    // --- Boost state ---
    this.justBoosted = false;
    if (input.boostPressed && this.boostCharge >= 1 && !this.boosting) {
      this.boostTimer = B.duration;
      this.boostCharge = 0;
      this.justBoosted = true;
    }
    if (this.boostTimer > 0) this.boostTimer = Math.max(0, this.boostTimer - dt);
    else if (input.throttle > 0) {
      this.boostCharge = Math.min(1, this.boostCharge + B.fillPerSecond * input.throttle * dt);
    }

    // --- Longitudinal speed ---
    if (input.throttle > 0) this.speed += C.accel * input.throttle * dt;
    if (this.boosting) this.speed += C.accel * 2.5 * dt; // boost surge
    if (input.brake > 0) this.speed -= C.brakeDecel * input.brake * dt;
    this.speed -= C.friction * (this.speed / C.maxSpeed) * dt;

    // Slope (arcade model): grade = sin of surface pitch along heading.
    // Uphill lowers the speed cap (the Alpe demands boost management);
    // downhill raises it. A small accel term adds roll-down feel.
    surfaceNormal(this.position, this.planet.center, _radial);
    projectOnTangentPlane(_radial, this.up, _slope);
    const grade = this.heading.dot(_slope);
    this.speed -= C.slopeAccel * grade * dt;

    const gradeCap =
      grade > 0
        ? Math.max(0.22, 1 - C.slopeSpeedPenalty * grade)
        : Math.min(1.3, 1 - C.downhillBonus * grade);
    this.speed = THREE.MathUtils.clamp(this.speed, 0, this.maxSpeed * gradeCap);

    // --- Steering (rotate heading around local up) ---
    const speedRatio = this.speed / C.maxSpeed;
    const authority =
      THREE.MathUtils.clamp(this.speed / 4, 0, 1) *
      THREE.MathUtils.lerp(
        1,
        C.steerHighSpeedFactor,
        THREE.MathUtils.clamp((speedRatio - 0.55) / 0.45, 0, 1),
      );
    this.heading.applyAxisAngle(this.up, -input.steer * C.steerRate * authority * dt);

    const steerT = 1 - Math.exp(-10 * dt);
    this.smoothSteer += (input.steer * authority - this.smoothSteer) * steerT;

    // --- Move along the tangent plane ---
    this.position.addScaledVector(this.heading, this.speed * dt);

    // --- Snap to the surface (road ribbon first, then terrain) ---
    surfaceNormal(this.position, this.planet.center, _radial);
    _origin.copy(this.position).addScaledVector(_radial, C.snapHeight);
    _dir.copy(_radial).negate();
    _ray.set(_origin, _dir);
    _ray.far = C.snapHeight * 4;
    const hits = _ray.intersectObjects(this.planet.colliders, false);

    if (hits.length > 0) {
      const hit = hits[0];
      this.position.copy(hit.point);
      if (hit.face) {
        _surfNormal.copy(hit.face.normal).lerp(_radial, 0.35).normalize();
      } else {
        _surfNormal.copy(_radial);
      }
    } else {
      // Safety fallback: analytic snap to the height field.
      const h = this.planet.heightAt(_radial);
      this.position.copy(_radial).multiplyScalar(this.planet.radius + h);
      _surfNormal.copy(_radial);
    }

    // Smoothly adapt "up" so bumps don't jolt the rider.
    const upT = 1 - Math.exp(-C.normalSmoothing * dt);
    this.up.lerp(_surfNormal, upT).normalize();

    // Keep heading tangent and update orientation (no Euler, no flips).
    projectOnTangentPlane(this.heading, this.up, this.heading).normalize();
    orientToSurface(this.quaternion, this.up, this.heading);
  }
}
