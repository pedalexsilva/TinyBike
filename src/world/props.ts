/**
 * Instanced generic props (trees, flowers, rocks) scattered with a fixed
 * seed, excluding the road corridor and snow line. Zone set dressing
 * (sunflowers, poplars, vila) lives in tour-props.ts.
 */
import * as THREE from 'three';
import type { Planet } from './planet';
import { toonMat } from '../render/toon';
import type { QualitySettings } from '../core/quality';

// Simple seeded PRNG (mulberry32).
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

const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _yaw = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

function randomSurfacePlacement(
  rand: () => number,
  planet: Planet,
  maxHeight: number,
): boolean {
  _dir.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
  if (planet.isNearRoad(_dir, 2.2)) return false; // keep the road clear
  const h = planet.heightAt(_dir);
  if (h > maxHeight) return false;
  _pos.copy(_dir).multiplyScalar(planet.radius + h);
  _quat.setFromUnitVectors(Y, _dir);
  _yaw.setFromAxisAngle(Y, rand() * Math.PI * 2);
  _quat.multiply(_yaw);
  return true;
}

export function scatterProps(
  scene: THREE.Scene,
  planet: Planet,
  quality: QualitySettings,
): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const rand = rng(424242);

  // --- Trees ---
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.1, 5);
  trunkGeo.translate(0, 0.55, 0);
  const canopyGeo = new THREE.ConeGeometry(0.9, 1.6, 6);
  canopyGeo.translate(0, 1.8, 0);
  const canopy2Geo = new THREE.ConeGeometry(0.65, 1.2, 6);
  canopy2Geo.translate(0, 2.6, 0);

  const trunks = new THREE.InstancedMesh(trunkGeo, toonMat(0x7a5230), quality.treeCount);
  const canopies = new THREE.InstancedMesh(canopyGeo, toonMat(0xffffff), quality.treeCount);
  const canopies2 = new THREE.InstancedMesh(canopy2Geo, toonMat(0xffffff), quality.treeCount);

  const treePalette = [
    new THREE.Color('#1e4620'), // forest green
    new THREE.Color('#2e7d32'), // rich emerald
    new THREE.Color('#4caf50'), // light green
    new THREE.Color('#d4a373'), // warm terracotta/gold
    new THREE.Color('#e07a5f'), // soft coral/red
    new THREE.Color('#f4a261'), // autumn orange
  ];

  let placed = 0;
  let guard = 0;
  while (placed < quality.treeCount && guard++ < quality.treeCount * 40) {
    if (!randomSurfacePlacement(rand, planet, planet.snowHeight - 1.5)) continue;
    const s = 0.8 + rand() * 0.9;
    _scale.set(s, s * (0.9 + rand() * 0.3), s);
    _mat.compose(_pos, _quat, _scale);
    trunks.setMatrixAt(placed, _mat);
    canopies.setMatrixAt(placed, _mat);
    canopies2.setMatrixAt(placed, _mat);

    const col1 = treePalette[Math.floor(rand() * treePalette.length)];
    const col2 = col1.clone().offsetHSL(0.01, -0.05, 0.08);
    canopies.setColorAt(placed, col1);
    canopies2.setColorAt(placed, col2);

    placed++;
  }
  trunks.count = canopies.count = canopies2.count = placed;
  scene.add(trunks, canopies, canopies2);
  objects.push(trunks, canopies, canopies2);

  // --- Flowers ---
  const flowerGeo = new THREE.IcosahedronGeometry(0.09, 0);
  flowerGeo.translate(0, 0.12, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, toonMat(0xffffff), quality.flowerCount);
  const palette = [
    new THREE.Color('#ffd23f'),
    new THREE.Color('#ffffff'),
    new THREE.Color('#ff6b6b'),
    new THREE.Color('#ff9ff3'),
  ];
  placed = 0;
  guard = 0;
  while (placed < quality.flowerCount && guard++ < quality.flowerCount * 40) {
    if (!randomSurfacePlacement(rand, planet, 3)) continue;
    _scale.setScalar(0.8 + rand() * 1.2);
    _mat.compose(_pos, _quat, _scale);
    flowers.setMatrixAt(placed, _mat);
    flowers.setColorAt(placed, palette[Math.floor(rand() * palette.length)]);
    placed++;
  }
  flowers.count = placed;
  scene.add(flowers);
  objects.push(flowers);

  // --- Rocks ---
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, toonMat(0x97a3b5), quality.rockCount);
  placed = 0;
  guard = 0;
  while (placed < quality.rockCount && guard++ < quality.rockCount * 40) {
    if (!randomSurfacePlacement(rand, planet, planet.snowHeight + 3)) continue;
    const s = 0.5 + rand() * 1.4;
    _scale.set(s, s * (0.6 + rand() * 0.5), s);
    _mat.compose(_pos, _quat, _scale);
    rocks.setMatrixAt(placed, _mat);
    placed++;
  }
  rocks.count = placed;
  scene.add(rocks);
  objects.push(rocks);

  return objects;
}
