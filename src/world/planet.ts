/**
 * Tour planet: icosphere displaced by an analytic height function
 * (Alpe dome + hills + fbm), flattened along the road spline, with
 * zone-based vertex colors (vila / sunflowers / pavé / alpe).
 * The road itself is a ribbon mesh hovering 6cm above the terrain;
 * both meshes carry a BVH and are part of `colliders`.
 */
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { CONFIG } from '../core/config';
import { fbm3 } from '../core/noise';
import { toonMat } from '../render/toon';
import { RoadSpline } from './road';
import { ZONES, ROAD_CONTROL_LATLON, angularDistance, dirFromLatLon } from './zones';

// Patch Mesh raycasting once so all raycasts against BVH geometry are fast.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const SEED = 20260611;

interface Dome {
  dir: THREE.Vector3;
  radius: number;
  height: number;
}

const DOMES: Dome[] = [
  // The Alpe — road switchbacks climb its flank (see zones.ts).
  { dir: ZONES.alpe.center.clone(), radius: 0.85, height: 10 },
  // Rolling hills away from the road.
  { dir: dirFromLatLon(-35, 60), radius: 0.6, height: 4 },
  { dir: dirFromLatLon(-30, 250), radius: 0.55, height: 3.5 },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Raw terrain height (no road flattening). */
export function baseHeight(dir: THREE.Vector3): number {
  let h = 0;
  for (const dome of DOMES) {
    const ang = Math.acos(Math.max(-1, Math.min(1, dir.dot(dome.dir))));
    h += dome.height * smoothstep(dome.radius, 0, ang);
  }
  h += fbm3(dir.x * 3, dir.y * 3, dir.z * 3, 3, SEED) * 1.2;
  h += fbm3(dir.x * 9, dir.y * 9, dir.z * 9, 2, SEED + 7) * 0.3;
  return h;
}

export const SNOW_HEIGHT = 6.5;

const GRASS = new THREE.Color('#5fbf4a');
const GRASS_DARK = new THREE.Color('#4aa53c');
const MEADOW = new THREE.Color('#8ed05e');
const VILA_GREEN = new THREE.Color('#6fcf55');
const SUNFLOWER_FIELD = new THREE.Color('#d8c84a');
const WHEAT = new THREE.Color('#c9bb7a');
const ROCK = new THREE.Color('#8d9bb0');
const SNOW = new THREE.Color('#f5f9ff');
const DIRT = new THREE.Color('#c9b06a');
const ASPHALT = new THREE.Color('#aab4c4');
const COBBLE = new THREE.Color('#9a8268');

export class Planet {
  readonly mesh: THREE.Mesh;
  readonly roadMesh: THREE.Mesh;
  /** Meshes the player snaps onto (terrain + road ribbon). */
  readonly colliders: THREE.Mesh[];
  readonly road: RoadSpline;
  readonly center = new THREE.Vector3(0, 0, 0);
  readonly radius = CONFIG.planet.radius;
  /** Angular half-width of the road surface (radians). */
  readonly roadHalfAngle: number;

  constructor() {
    this.road = new RoadSpline(ROAD_CONTROL_LATLON, baseHeight, this.radius);
    this.roadHalfAngle = CONFIG.road.width / 2 / this.radius;

    this.mesh = this.buildTerrain();
    this.roadMesh = this.buildRoadRibbon();
    this.colliders = [this.roadMesh, this.mesh];
  }

  /** Final terrain height: base blended toward the road profile. */
  heightAt(dir: THREE.Vector3): number {
    const i = this.road.closestIndex(dir);
    const s = this.road.samples[i];
    const ang = angularDistance(dir, s.dir);
    const w = smoothstep(this.roadHalfAngle * 3.2, this.roadHalfAngle * 0.9, ang);
    return THREE.MathUtils.lerp(baseHeight(dir), s.height - 0.08, w);
  }

  /** True if a unit direction lies within `factor` road half-widths. */
  isNearRoad(dir: THREE.Vector3, factor = 1): boolean {
    return this.road.angularDistanceTo(dir) < this.roadHalfAngle * factor;
  }

  private buildTerrain(): THREE.Mesh {
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

      // --- Zone-aware coloring ---
      const patch = fbm3(dir.x * 6, dir.y * 6, dir.z * 6, 3, SEED + 31);
      c.copy(GRASS);
      if (patch > 0.25) c.copy(MEADOW);
      else if (patch < -0.35) c.copy(GRASS_DARK);

      const dVila = angularDistance(dir, ZONES.vila.center);
      const dSun = angularDistance(dir, ZONES.sunflowers.center);
      const dPave = angularDistance(dir, ZONES.pave.center);
      c.lerp(VILA_GREEN, smoothstep(ZONES.vila.radius, ZONES.vila.radius * 0.4, dVila) * 0.7);
      c.lerp(
        SUNFLOWER_FIELD,
        smoothstep(ZONES.sunflowers.radius, ZONES.sunflowers.radius * 0.35, dSun) * 0.85,
      );
      c.lerp(WHEAT, smoothstep(ZONES.pave.radius, ZONES.pave.radius * 0.35, dPave) * 0.75);

      // Altitude overrides (Alpe look): dirt → rock → snow.
      if (h > 2.5) c.lerp(DIRT, smoothstep(2.5, 4.5, h) * 0.7);
      if (h > 4) c.lerp(ROCK, smoothstep(4, SNOW_HEIGHT, h));
      if (h > SNOW_HEIGHT) c.copy(SNOW);

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

      // Cobblestone tint inside the pavé zone, asphalt elsewhere.
      const inPave = angularDistance(s.dir, ZONES.pave.center) < ZONES.pave.radius;
      c.copy(inPave ? COBBLE : ASPHALT);
      // Subtle banding so the surface reads as a road from afar.
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

  dispose(): void {
    for (const m of [this.mesh, this.roadMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
