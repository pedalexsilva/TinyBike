/**
 * Data-driven planet (P14): icosphere displaced by domes + fbm from a
 * PlanetDef, flattened along the road spline, with zone-tinted vertex
 * colors. The road ribbon hovers 6cm above the terrain; both meshes
 * carry a BVH and are listed in `colliders`.
 */
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { CONFIG } from '../core/config';
import { fbm3 } from '../core/noise';
import { angularDistance } from '../core/spherical';
import { toonMat } from '../render/toon';
import { RoadSpline, type RoadSample } from './road';
import {
  TOUR_DEF,
  buildRuntimeZones,
  type PlanetDef,
  type RuntimeZone,
} from './planet-def';

// Patch Mesh raycasting once so all raycasts against BVH geometry are fast.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class Planet {
  readonly def: PlanetDef;
  readonly mesh: THREE.Mesh;
  readonly roadMesh: THREE.Mesh;
  readonly roadMarkingsMesh: THREE.Mesh;
  /** Meshes the player snaps onto (road ribbon first, then terrain). */
  readonly colliders: THREE.Mesh[];
  readonly road: RoadSpline;
  readonly zones: RuntimeZone[];
  /** Cobble zone (vibration + road tint), or null. */
  readonly paveZone: RuntimeZone | null;
  readonly center = new THREE.Vector3(0, 0, 0);
  readonly radius: number;
  readonly snowHeight: number;
  /** Angular half-width of the road surface (radians). */
  readonly roadHalfAngle: number;

  private readonly domeDirs: THREE.Vector3[];

  constructor(def: PlanetDef = TOUR_DEF) {
    this.def = def;
    this.radius = def.radius;
    this.snowHeight = def.snowHeight;
    this.zones = buildRuntimeZones(def);
    this.paveZone = this.zones.find((z) => z.id === def.paveZoneId) ?? null;
    this.domeDirs = def.domes.map((d) => {
      const lat = (d.latLon[0] * Math.PI) / 180;
      const lon = (d.latLon[1] * Math.PI) / 180;
      return new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(lon),
      );
    });

    this.road = new RoadSpline(def.roadControlLatLon, (d) => this.baseHeight(d), this.radius);
    this.roadHalfAngle = CONFIG.road.width / 2 / this.radius;

    this.mesh = this.buildTerrain();
    this.roadMesh = this.buildRoadRibbon();
    this.roadMarkingsMesh = this.buildRoadMarkings();
    this.colliders = [this.roadMesh, this.mesh];
  }

  /** Raw terrain height (no road flattening). */
  baseHeight(dir: THREE.Vector3): number {
    const def = this.def;
    let h = 0;
    for (let i = 0; i < def.domes.length; i++) {
      const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(this.domeDirs[i]))));
      h += def.domes[i].height * smoothstep(def.domes[i].radius, 0, ang);
    }
    h += fbm3(dir.x * 3, dir.y * 3, dir.z * 3, 3, def.seed) * 1.2;
    h += fbm3(dir.x * 9, dir.y * 9, dir.z * 9, 2, def.seed + 7) * 0.3;
    return h;
  }

  /** Final terrain height: base blended toward the road profile. */
  heightAt(dir: THREE.Vector3): number {
    const i = this.road.closestIndex(dir);
    const s = this.road.samples[i];
    const ang = angularDistance(dir, s.dir);
    const w = smoothstep(this.roadHalfAngle * 3.2, this.roadHalfAngle * 0.9, ang);
    return THREE.MathUtils.lerp(this.baseHeight(dir), s.height - 0.08, w);
  }

  /** True if a unit direction lies within `factor` road half-widths. */
  isNearRoad(dir: THREE.Vector3, factor = 1): boolean {
    return this.road.angularDistanceTo(dir) < this.roadHalfAngle * factor;
  }

  zoneById(id: string): RuntimeZone | null {
    return this.zones.find((z) => z.id === id) ?? null;
  }

  private buildTerrain(): THREE.Mesh {
    const def = this.def;
    const pal = def.palette;
    const GRASS = new THREE.Color(pal.grass);
    const GRASS_DARK = new THREE.Color(pal.grassDark);
    const MEADOW = new THREE.Color(pal.meadow);
    const DIRT = new THREE.Color(pal.dirt);
    const ROCK = new THREE.Color(pal.rock);
    const SNOW = new THREE.Color(pal.snow);

    const geo = new THREE.IcosahedronGeometry(this.radius, 5);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const dir = new THREE.Vector3();
    const c = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      dir.fromBufferAttribute(pos, i).normalize();
      const h = this.heightAt(dir);
      const r = this.radius + h;
      pos.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);

      // Base grass with seeded patches.
      const patch = fbm3(dir.x * 6, dir.y * 6, dir.z * 6, 3, def.seed + 31);
      c.copy(GRASS);
      if (patch > 0.25) c.copy(MEADOW);
      else if (patch < -0.35) c.copy(GRASS_DARK);

      // Zone tints (data-driven).
      for (const z of this.zones) {
        if (z.tintStrength <= 0) continue;
        const d = angularDistance(dir, z.center);
        c.lerp(z.tint, smoothstep(z.radius, z.radius * 0.38, d) * z.tintStrength);
      }

      // Altitude overrides: dirt → rock → snow.
      if (h > 2.5) c.lerp(DIRT, smoothstep(2.5, 4.5, h) * 0.7);
      if (h > 4) c.lerp(ROCK, smoothstep(4, this.snowHeight, h));
      if (h > this.snowHeight) c.copy(SNOW);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.boundsTree = new MeshBVH(geo);

    const mesh = new THREE.Mesh(geo, toonMat(0xffffff, { vertexColors: true }));
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private buildRoadRibbon(): THREE.Mesh {
    const samples = this.road.samples;
    const n = samples.length;
    const half = CONFIG.road.width / 2;
    const lift = CONFIG.road.lift;
    const ASPHALT = new THREE.Color(this.def.palette.asphalt);
    const COBBLE = new THREE.Color(this.def.palette.cobble);

    const positions = new Float32Array(n * 2 * 3);
    const normals = new Float32Array(n * 2 * 3);
    const colors = new Float32Array(n * 2 * 3);
    const indices: number[] = [];
    const side = new THREE.Vector3();
    const v = new THREE.Vector3();
    const c = new THREE.Color();

    for (let i = 0; i < n; i++) {
      const s = samples[i];
      side.crossVectors(s.tangent, s.dir).normalize();

      const inPave =
        this.paveZone !== null &&
        angularDistance(s.dir, this.paveZone.center) < this.paveZone.radius;
      c.copy(inPave ? COBBLE : ASPHALT);
      if (i % 16 < 2) c.offsetHSL(0, 0, inPave ? -0.04 : 0.05);

      for (const k of [-1, 1]) {
        const j = (i * 2 + (k + 1) / 2) * 3;
        v.copy(s.position).addScaledVector(side, half * k).addScaledVector(s.dir, lift);
        positions[j] = v.x;
        positions[j + 1] = v.y;
        positions[j + 2] = v.z;
        normals[j] = s.dir.x;
        normals[j + 1] = s.dir.y;
        normals[j + 2] = s.dir.z;
        colors[j] = c.r;
        colors[j + 1] = c.g;
        colors[j + 2] = c.b;
      }
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.boundsTree = new MeshBVH(geo);

    const mesh = new THREE.Mesh(geo, toonMat(0xffffff, { vertexColors: true }));
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private buildRoadMarkings(): THREE.Mesh {
    const samples = this.road.samples;
    const n = samples.length;
    const half = CONFIG.road.width / 2;
    const lift = CONFIG.road.lift + 0.004;

    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    const side1 = new THREE.Vector3();
    const side2 = new THREE.Vector3();

    function addRibbonSegment(
      s1: RoadSample,
      s2: RoadSample,
      sd1: THREE.Vector3,
      sd2: THREE.Vector3,
      offset1: number,
      offset2: number
    ) {
      const v1 = new THREE.Vector3().copy(s1.position).addScaledVector(sd1, offset1).addScaledVector(s1.dir, lift);
      const v2 = new THREE.Vector3().copy(s1.position).addScaledVector(sd1, offset2).addScaledVector(s1.dir, lift);
      const v3 = new THREE.Vector3().copy(s2.position).addScaledVector(sd2, offset1).addScaledVector(s2.dir, lift);
      const v4 = new THREE.Vector3().copy(s2.position).addScaledVector(sd2, offset2).addScaledVector(s2.dir, lift);

      const baseIdx = positions.length / 3;

      positions.push(v1.x, v1.y, v1.z);
      positions.push(v2.x, v2.y, v2.z);
      positions.push(v3.x, v3.y, v3.z);
      positions.push(v4.x, v4.y, v4.z);

      normals.push(s1.dir.x, s1.dir.y, s1.dir.z);
      normals.push(s1.dir.x, s1.dir.y, s1.dir.z);
      normals.push(s2.dir.x, s2.dir.y, s2.dir.z);
      normals.push(s2.dir.x, s2.dir.y, s2.dir.z);

      indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
      indices.push(baseIdx + 2, baseIdx + 3, baseIdx + 1);
    }

    const L = this.road.totalLength;
    const period = 4.5;
    const numRepeats = Math.round(L / period);
    const actualPeriod = L / numRepeats;
    const actualDashLen = 1.6 * (actualPeriod / period);

    for (let i = 0; i < n; i++) {
      const s1 = samples[i];
      const s2 = samples[(i + 1) % n];

      side1.crossVectors(s1.tangent, s1.dir).normalize();
      side2.crossVectors(s2.tangent, s2.dir).normalize();

      const inPave1 =
        this.paveZone !== null &&
        angularDistance(s1.dir, this.paveZone.center) < this.paveZone.radius;
      const inPave2 =
        this.paveZone !== null &&
        angularDistance(s2.dir, this.paveZone.center) < this.paveZone.radius;

      if (inPave1 || inPave2) {
        continue;
      }

      // Left solid line
      const leftCenter = -(half - 0.12);
      addRibbonSegment(s1, s2, side1, side2, leftCenter - 0.03, leftCenter + 0.03);

      // Right solid line
      const rightCenter = half - 0.12;
      addRibbonSegment(s1, s2, side1, side2, rightCenter - 0.03, rightCenter + 0.03);

      // Center dashed line
      const dist = this.road.uAt(i) * L;
      if (dist % actualPeriod < actualDashLen) {
        addRibbonSegment(s1, s2, side1, side2, -0.04, 0.04);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    geo.setIndex(indices);

    const mesh = new THREE.Mesh(geo, toonMat(0xffffff));
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  dispose(): void {
    for (const m of [this.mesh, this.roadMesh, this.roadMarkingsMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
