/**
 * Set dressing pass (P07): km posts, hay bales on sharp curves, roadside
 * flags in the vila, clapping spectators near the finish — and the three
 * hidden easter eggs (Messenger tradition):
 *
 *   EASTER EGGS — documented per the dev plan:
 *   1. GISÈLE THE GOAT — stands on the very summit of the Alpe, slowly
 *      nodding. Reward for finishing the climb (or going off-road up top).
 *   2. THE UFO — every ~2 minutes a small saucer silently crosses the sky
 *      far above the player, wobbling. Blink and you miss it.
 *   3. CAPTAIN CANARD — a rubber duck floats in the vila fountain.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';
import { ZONES, angularDistance, dirFromLatLon } from './zones';
import type { Planet } from './planet';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _side = new THREE.Vector3();
const _v = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Dressing {
  readonly group = new THREE.Group();

  // Spectators (clap animation).
  private armL!: THREE.InstancedMesh;
  private armR!: THREE.InstancedMesh;
  private readonly armBase: THREE.Matrix4[] = [];
  private readonly clapPhase: number[] = [];
  private clapTimer = 0;
  private clapUp = false;

  // Easter eggs.
  private goatHead!: THREE.Mesh;
  private ufo!: THREE.Group;
  private ufoTimer = 50; // first pass ~50s in
  private ufoT = -1; // -1 = idle, 0..1 = flying
  private ufoFrom = new THREE.Vector3();
  private ufoTo = new THREE.Vector3();
  private time = 0;

  constructor(planet: Planet) {
    this.buildKmPosts(planet);
    this.buildHayBales(planet);
    this.buildVilaFlags(planet);
    this.buildSpectators(planet);
    this.buildGoat(planet);
    this.buildUfo();
    this.buildDuck(planet);
  }

  // ------------------------------------------------------------ KM POSTS
  private buildKmPosts(planet: Planet): void {
    const road = planet.road;
    const count = 6; // one per ~100m
    const postGeo = new THREE.BoxGeometry(0.16, 0.8, 0.16);
    postGeo.translate(0, 0.4, 0);
    const capGeo = new THREE.BoxGeometry(0.2, 0.18, 0.2);
    capGeo.translate(0, 0.85, 0);
    const posts = new THREE.InstancedMesh(postGeo, toonMat(0xf5f5f0), count);
    const caps = new THREE.InstancedMesh(capGeo, toonMat(0xe84545), count);

    for (let i = 0; i < count; i++) {
      const s = road.samples[Math.floor((i / count) * road.samples.length)];
      _side.crossVectors(s.tangent, s.dir).normalize();
      _pos.copy(s.position).addScaledVector(_side, CONFIG.road.width / 2 + 0.6);
      const dir = _v.copy(_pos).normalize();
      _pos.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
      _quat.setFromUnitVectors(Y, dir);
      _scale.setScalar(1);
      _mat.compose(_pos, _quat, _scale);
      posts.setMatrixAt(i, _mat);
      caps.setMatrixAt(i, _mat);
    }
    this.group.add(posts, caps);
  }

  // ----------------------------------------------------------- HAY BALES
  private buildHayBales(planet: Planet): void {
    const road = planet.road;
    const n = road.samples.length;
    const rand = rng(909090);

    // Detect sharp curves: angle between tangents 12 samples apart.
    const spots: { index: number; turnSign: number }[] = [];
    let cooldown = 0;
    for (let i = 0; i < n; i += 4) {
      if (cooldown > 0) {
        cooldown -= 4;
        continue;
      }
      const a = road.samples[i];
      const b = road.samples[(i + 12) % n];
      const dot = a.tangent.dot(b.tangent);
      if (dot < 0.86) {
        // Turn direction: sign of (tA × tB) · up.
        _v.crossVectors(a.tangent, b.tangent);
        spots.push({ index: (i + 6) % n, turnSign: Math.sign(_v.dot(a.dir)) || 1 });
        cooldown = 40; // one cluster per curve
      }
    }

    const baleGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.75, 9);
    baleGeo.rotateZ(Math.PI / 2); // lying on its side
    baleGeo.translate(0, 0.42, 0);
    const count = Math.min(spots.length * 2, 72);
    const bales = new THREE.InstancedMesh(baleGeo, toonMat(0xe8c558), count);

    let placed = 0;
    for (const spot of spots) {
      if (placed >= count) break;
      const s = road.samples[spot.index];
      _side.crossVectors(s.tangent, s.dir).normalize();
      // Outside of the curve = opposite side of the turn direction.
      const outside = -spot.turnSign;
      for (let k = 0; k < 2 && placed < count; k++) {
        _pos
          .copy(s.position)
          .addScaledVector(_side, outside * (CONFIG.road.width / 2 + 0.55 + k * 0.85))
          .addScaledVector(s.tangent, (k - 0.5) * 1.1);
        const dir = _v.copy(_pos).normalize();
        _pos.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
        _quat.setFromUnitVectors(Y, dir);
        const yaw = new THREE.Quaternion().setFromAxisAngle(Y, rand() * Math.PI);
        _quat.multiply(yaw);
        _scale.setScalar(0.9 + rand() * 0.25);
        _mat.compose(_pos, _quat, _scale);
        bales.setMatrixAt(placed, _mat);
        placed++;
      }
    }
    bales.count = placed;
    this.group.add(bales);
  }

  // ---------------------------------------------------------- VILA FLAGS
  private buildVilaFlags(planet: Planet): void {
    const road = planet.road;
    const n = road.samples.length;
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5);
    poleGeo.translate(0, 1.2, 0);
    const flagGeo = new THREE.ConeGeometry(0.22, 0.55, 4);
    flagGeo.rotateZ(Math.PI / 2); // pennant pointing sideways
    flagGeo.translate(0.25, 2.2, 0);

    const flagColors = [0xffd23f, 0xe84545, 0xffffff, 0x53b7e8];
    const spots: number[] = [];
    for (let i = 0; i < n; i += 14) {
      if (angularDistance(road.samples[i].dir, ZONES.vila.center) < ZONES.vila.radius * 0.8) {
        spots.push(i);
      }
    }

    const poles = new THREE.InstancedMesh(poleGeo, toonMat(0x8a8f9a), spots.length * 2);
    const flags = new THREE.InstancedMesh(flagGeo, toonMat(0xffffff), spots.length * 2);
    let placed = 0;
    for (const i of spots) {
      const s = road.samples[i];
      _side.crossVectors(s.tangent, s.dir).normalize();
      for (const k of [-1, 1]) {
        _pos.copy(s.position).addScaledVector(_side, (CONFIG.road.width / 2 + 0.5) * k);
        const dir = _v.copy(_pos).normalize();
        _pos.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
        _quat.setFromUnitVectors(Y, dir);
        _scale.setScalar(1);
        _mat.compose(_pos, _quat, _scale);
        poles.setMatrixAt(placed, _mat);
        flags.setMatrixAt(placed, _mat);
        flags.setColorAt(placed, new THREE.Color(flagColors[placed % flagColors.length]));
        placed++;
      }
    }
    poles.count = flags.count = placed;
    this.group.add(poles, flags);
  }

  // ---------------------------------------------------------- SPECTATORS
  private buildSpectators(planet: Planet): void {
    const road = planet.road;
    const n = road.samples.length;
    const count = 18;
    const rand = rng(31337);

    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.5, 3, 8);
    bodyGeo.translate(0, 0.62, 0);
    const headGeo = new THREE.SphereGeometry(0.2, 10, 8);
    headGeo.translate(0, 1.18, 0);
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.34, 2, 6);

    const jerseys = [0xe84545, 0x53b7e8, 0xffd23f, 0x9b59b6, 0x2ecc71, 0xff8c42];
    const bodies = new THREE.InstancedMesh(bodyGeo, toonMat(0xffffff), count);
    const heads = new THREE.InstancedMesh(headGeo, toonMat(0xffc9a3), count);
    this.armL = new THREE.InstancedMesh(armGeo, toonMat(0xffc9a3), count);
    this.armR = new THREE.InstancedMesh(armGeo, toonMat(0xffc9a3), count);

    for (let i = 0; i < count; i++) {
      // Cluster around the finish arch (sample 0), both sides, behind bales.
      const offset = Math.floor((rand() - 0.5) * 60 + n) % n;
      const s = road.samples[offset];
      _side.crossVectors(s.tangent, s.dir).normalize();
      const k = i % 2 === 0 ? 1 : -1;
      _pos
        .copy(s.position)
        .addScaledVector(_side, (CONFIG.road.width / 2 + 1.0 + rand() * 1.6) * k);
      const dir = _v.copy(_pos).normalize();
      _pos.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
      _quat.setFromUnitVectors(Y, dir);
      // Face the road.
      const yaw = new THREE.Quaternion().setFromAxisAngle(
        Y,
        Math.atan2(-k * s.tangent.dot(_side), 1) + (k > 0 ? Math.PI / 2 : -Math.PI / 2),
      );
      _quat.multiply(yaw);
      const sc = 0.9 + rand() * 0.25;
      _scale.setScalar(sc);
      _mat.compose(_pos, _quat, _scale);

      bodies.setMatrixAt(i, _mat);
      bodies.setColorAt(i, new THREE.Color(jerseys[i % jerseys.length]));
      heads.setMatrixAt(i, _mat);
      this.armBase.push(_mat.clone());
      this.clapPhase.push(Math.floor(rand() * 2));
      this.setArmPose(i, false);
    }
    this.group.add(bodies, heads, this.armL, this.armR);
  }

  /** Two-frame clap: arms down (rest) / arms up. */
  private setArmPose(i: number, up: boolean): void {
    const base = this.armBase[i];
    for (const [mesh, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      const local = new THREE.Matrix4()
        .makeRotationZ(side * (up ? -2.4 : -0.5))
        .setPosition(side * 0.3, 0.95, 0);
      _mat.copy(base).multiply(local);
      mesh.setMatrixAt(i, _mat);
    }
  }

  // --------------------------------------------------- EASTER EGG: GOAT
  private buildGoat(planet: Planet): void {
    const goat = new THREE.Group();
    const white = toonMat(0xf2efe9);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.35), white);
    body.position.y = 0.55;
    addOutline(body, 0.05);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.24), white);
    head.position.set(0.45, 0.85, 0);
    this.goatHead = head;
    const hornGeo = new THREE.ConeGeometry(0.045, 0.22, 5);
    for (const z of [-0.07, 0.07]) {
      const horn = new THREE.Mesh(hornGeo, toonMat(0x6b5b4a));
      horn.position.set(0.42, 1.05, z);
      horn.rotation.z = -0.4;
      goat.add(horn);
    }
    const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.4, 5);
    for (const [x, z] of [
      [0.25, 0.12],
      [0.25, -0.12],
      [-0.25, 0.12],
      [-0.25, -0.12],
    ]) {
      const leg = new THREE.Mesh(legGeo, white);
      leg.position.set(x, 0.2, z);
      goat.add(leg);
    }
    goat.add(body, head);

    // The very top of the Alpe — off-road, you have to earn the view.
    const dir = ZONES.alpe.center.clone();
    goat.position.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
    goat.quaternion.setFromUnitVectors(Y, dir);
    this.group.add(goat);
  }

  // ---------------------------------------------------- EASTER EGG: UFO
  private buildUfo(): void {
    this.ufo = new THREE.Group();
    const saucer = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 14, 8),
      toonMat(0x9aa8c0, { emissive: 0x223355, emissiveIntensity: 0.4 }),
    );
    saucer.scale.set(1, 0.28, 1);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      toonMat(0x7fe7ff, { emissive: 0x33ccff, emissiveIntensity: 0.8 }),
    );
    dome.position.y = 0.3;
    this.ufo.add(saucer, dome);
    this.ufo.visible = false;
    this.group.add(this.ufo);
  }

  // --------------------------------------------------- EASTER EGG: DUCK
  private buildDuck(planet: Planet): void {
    const duck = new THREE.Group();
    const yellow = toonMat(0xffd84a);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), yellow);
    body.scale.set(1.25, 0.9, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), yellow);
    head.position.set(0.14, 0.16, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 6), toonMat(0xff8c2e));
    beak.position.set(0.26, 0.15, 0);
    beak.rotation.z = -Math.PI / 2;
    duck.add(body, head, beak);

    // Floating on the fountain water (fountain dir defined in tour-props).
    const dir = dirFromLatLon(1.5, -5);
    duck.position.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
    duck.quaternion.setFromUnitVectors(Y, dir);
    duck.translateY(0.66); // basin water level
    duck.translateX(0.5);
    this.group.add(duck);
  }

  // -------------------------------------------------------------- UPDATE
  update(dt: number, playerPos: THREE.Vector3): void {
    this.time += dt;

    // Goat: slow contemplative nod.
    this.goatHead.rotation.z = Math.sin(this.time * 0.8) * 0.12;

    // Spectators: 2-frame clap at ~3.3Hz, half of them on opposite phase.
    this.clapTimer += dt;
    if (this.clapTimer > 0.15) {
      this.clapTimer = 0;
      this.clapUp = !this.clapUp;
      for (let i = 0; i < this.armBase.length; i++) {
        const up = this.clapPhase[i] === 0 ? this.clapUp : !this.clapUp;
        this.setArmPose(i, up);
      }
      this.armL.instanceMatrix.needsUpdate = true;
      this.armR.instanceMatrix.needsUpdate = true;
    }

    // UFO flyby.
    if (this.ufoT < 0) {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) {
        // Plan a pass over the player's sky, ~40 units up.
        const up = _v.copy(playerPos).normalize();
        const any = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const across = new THREE.Vector3().crossVectors(up, any).normalize();
        const altitude = playerPos.length() + 38;
        this.ufoFrom.copy(up).multiplyScalar(altitude).addScaledVector(across, -90);
        this.ufoTo.copy(up).multiplyScalar(altitude).addScaledVector(across, 90);
        this.ufoT = 0;
        this.ufo.visible = true;
      }
    } else {
      this.ufoT += dt / 9; // 9-second pass
      this.ufo.position.lerpVectors(this.ufoFrom, this.ufoTo, this.ufoT);
      this.ufo.quaternion.setFromUnitVectors(Y, _v.copy(this.ufo.position).normalize());
      this.ufo.rotateZ(Math.sin(this.time * 6) * 0.15); // wobble
      if (this.ufoT >= 1) {
        this.ufoT = -1;
        this.ufo.visible = false;
        this.ufoTimer = 90 + Math.random() * 60;
      }
    }
  }
}
