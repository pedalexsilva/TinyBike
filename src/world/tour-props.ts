/**
 * Tour-specific set dressing: vila houses + fountain + finish arch,
 * sunflower fields + windmill, poplar rows along the pavé sector.
 * Everything low-poly toon; sunflowers/poplars instanced.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';
import { ZONES, angularDistance, dirFromLatLon } from './zones';
import type { Planet } from './planet';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
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

/** Place an object on the surface at `dir` with optional yaw. */
function surfacePose(obj: THREE.Object3D, planet: Planet, dir: THREE.Vector3, yaw = 0): void {
  obj.position.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
  obj.quaternion.setFromUnitVectors(Y, dir);
  if (yaw !== 0) {
    _yaw.setFromAxisAngle(Y, yaw);
    obj.quaternion.multiply(_yaw);
  }
}

export class TourProps {
  readonly group = new THREE.Group();
  private readonly blades: THREE.Group;

  constructor(planet: Planet) {
    this.buildVila(planet);
    this.blades = this.buildWindmill(planet);
    this.buildSunflowers(planet);
    this.buildPavePoplars(planet);
    this.buildFinishArch(planet);
  }

  update(dt: number): void {
    this.blades.rotation.z += dt * 0.9;
  }

  // ---------------------------------------------------------------- VILA
  private buildVila(planet: Planet): void {
    const rand = rng(777);
    const bodyGeo = new THREE.BoxGeometry(2.4, 2, 2);
    const roofGeo = new THREE.CylinderGeometry(1.55, 1.55, 2.7, 3);
    roofGeo.rotateX(Math.PI / 2);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.translate(0, 2.55, 0);
    const bodyColors = [0xfff2dc, 0xffe3c2, 0xf6d7b0, 0xfff7ea];
    const roofMat = toonMat(0xc75b39); // terracotta

    // Houses ring the vila center, off the road.
    const offsets: ReadonlyArray<readonly [number, number, number]> = [
      [3.5, 8, 0.4],
      [-4.5, 10, 1.2],
      [5, -9, 2.2],
      [-6, -7, 0.9],
      [8.5, 2, 2.8],
      [-9, 1.5, 1.7],
    ];
    for (const [latOff, lonOff, yaw] of offsets) {
      const dir = dirFromLatLon(latOff, lonOff);
      if (planet.isNearRoad(dir, 2.2)) continue;
      const house = new THREE.Group();
      const body = new THREE.Mesh(
        bodyGeo,
        toonMat(bodyColors[Math.floor(rand() * bodyColors.length)]),
      );
      body.position.y = 1;
      addOutline(body, 0.03);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      house.add(body, roof);
      const s = 0.85 + rand() * 0.4;
      house.scale.setScalar(s);
      surfacePose(house, planet, dir, yaw);
      this.group.add(house);
    }

    // Fountain at the vila center (off-road).
    const fountainDir = dirFromLatLon(1.5, -5);
    const fountain = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.6, 10), toonMat(0xd9dde5));
    basin.position.y = 0.3;
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(1.32, 1.32, 0.08, 10),
      toonMat(0x53b7e8, { emissive: 0x2266aa, emissiveIntensity: 0.3 }),
    );
    water.position.y = 0.62;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.5, 8), toonMat(0xd9dde5));
    column.position.y = 1.05;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), toonMat(0x53b7e8));
    top.position.y = 1.9;
    fountain.add(basin, water, column, top);
    surfacePose(fountain, planet, fountainDir);
    this.group.add(fountain);
  }

  // ------------------------------------------------------------ WINDMILL
  private buildWindmill(planet: Planet): THREE.Group {
    const mill = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 5, 6), toonMat(0xfff2dc));
    tower.position.y = 2.5;
    addOutline(tower, 0.04);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.3, 6), toonMat(0xc75b39));
    cap.position.y = 5.6;

    const blades = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(0.5, 3.2, 0.08);
    bladeGeo.translate(0, 1.9, 0);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(bladeGeo, toonMat(0xf0e6d2));
      blade.rotation.z = (i / 4) * Math.PI * 2;
      blades.add(blade);
    }
    blades.position.set(0, 5.1, 1.45);
    mill.add(tower, cap, blades);

    // On a small rise at the edge of the sunflower zone, away from the road.
    const dir = dirFromLatLon(20, 80);
    surfacePose(mill, planet, dir, Math.PI * 0.15);
    this.group.add(mill);
    return blades;
  }

  // ---------------------------------------------------------- SUNFLOWERS
  private buildSunflowers(planet: Planet): void {
    const rand = rng(20240707);
    const count = 380;

    const stemGeo = new THREE.CylinderGeometry(0.045, 0.06, 1, 5);
    stemGeo.translate(0, 0.5, 0);
    const headGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 9);
    headGeo.rotateX(Math.PI / 2.4); // tilt the face up/forward
    headGeo.translate(0, 1.05, 0.08);

    const stems = new THREE.InstancedMesh(stemGeo, toonMat(0x3f8f3a), count);
    const heads = new THREE.InstancedMesh(headGeo, toonMat(0xffce26), count);

    const zone = ZONES.sunflowers;
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < count * 30) {
      // Random direction inside the zone cone.
      const u = rand();
      const ang = Math.sqrt(u) * zone.radius * 0.92;
      const rot = rand() * Math.PI * 2;
      const dir = zone.center
        .clone()
        .applyAxisAngle(orthogonal(zone.center), ang)
        .applyAxisAngle(zone.center, rot)
        .normalize();
      if (planet.isNearRoad(dir, 1.8)) continue;
      const h = planet.heightAt(dir);
      if (h > 3.5) continue;

      _pos.copy(dir).multiplyScalar(planet.radius + h);
      _quat.setFromUnitVectors(Y, dir);
      _yaw.setFromAxisAngle(Y, rand() * Math.PI * 2);
      _quat.multiply(_yaw);
      _scale.setScalar(0.85 + rand() * 0.5);
      _mat.compose(_pos, _quat, _scale);
      stems.setMatrixAt(placed, _mat);
      heads.setMatrixAt(placed, _mat);
      placed++;
    }
    stems.count = placed;
    heads.count = placed;
    this.group.add(stems, heads);
  }

  // ------------------------------------------------------- PAVÉ POPLARS
  private buildPavePoplars(planet: Planet): void {
    const samples = planet.road.samples;
    const zone = ZONES.pave;
    const offsets: number[] = [];
    for (let i = 0; i < samples.length; i += 9) {
      if (angularDistance(samples[i].dir, zone.center) < zone.radius * 0.85) offsets.push(i);
    }

    const count = offsets.length * 2;
    const trunkGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.6, 5);
    trunkGeo.translate(0, 0.8, 0);
    const crownGeo = new THREE.ConeGeometry(0.62, 3.4, 6);
    crownGeo.translate(0, 3.1, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMat(0x6e4a2a), count);
    const crowns = new THREE.InstancedMesh(crownGeo, toonMat(0x355f33), count);

    const side = new THREE.Vector3();
    const rand = rng(515151);
    let placed = 0;
    const sideDist = CONFIG.road.width / 2 + 1.7;
    for (const i of offsets) {
      const s = samples[i];
      side.crossVectors(s.tangent, s.dir).normalize();
      for (const k of [-1, 1]) {
        const dir = _pos
          .copy(s.position)
          .addScaledVector(side, sideDist * k)
          .normalize()
          .clone();
        _pos.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
        _quat.setFromUnitVectors(Y, dir);
        _scale.setScalar(0.9 + rand() * 0.35);
        _mat.compose(_pos, _quat, _scale);
        trunks.setMatrixAt(placed, _mat);
        crowns.setMatrixAt(placed, _mat);
        placed++;
      }
    }
    trunks.count = placed;
    crowns.count = placed;
    this.group.add(trunks, crowns);
  }

  // -------------------------------------------------------- FINISH ARCH
  private buildFinishArch(planet: Planet): void {
    const s = planet.road.samples[0];
    const side = new THREE.Vector3().crossVectors(s.tangent, s.dir).normalize();
    const half = CONFIG.road.width / 2 + 0.5;

    const arch = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.35, 3.6, 0.35);
    pillarGeo.translate(0, 1.8, 0);
    const pillarMat = toonMat(0x1c1f2e);
    for (const k of [-1, 1]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.copy(side).multiplyScalar(half * k);
      arch.add(pillar);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(half * 2 + 0.7, 0.7, 0.5),
      toonMat(0xffd23f, { emissive: 0x553300, emissiveIntensity: 0.2 }),
    );
    beam.position.y = 3.55;
    // Align the beam with the road's side direction.
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), side);
    addOutline(beam, 0.04);
    arch.add(beam);

    arch.position.copy(s.position);
    arch.quaternion.setFromUnitVectors(Y, s.dir);
    // surfacePose can't be used here: the arch must align to the road's
    // local frame (dir as up), pillars offset in world space via `side`.
    arch.position.addScaledVector(s.dir, CONFIG.road.lift);
    // Undo the quaternion's effect on children offsets: place pillars/beam
    // in the arch's local frame instead.
    const invQ = arch.quaternion.clone().invert();
    for (const child of arch.children) {
      child.position.applyQuaternion(invQ);
    }
    beam.quaternion.premultiply(invQ);

    this.group.add(arch);
  }
}

/** Any unit vector orthogonal to v. */
function orthogonal(v: THREE.Vector3): THREE.Vector3 {
  const o = Math.abs(v.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  return o.cross(v).normalize();
}
