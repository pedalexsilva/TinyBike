/**
 * The finish straight: the last stretch of road into the vila arch (u≈0)
 * is dressed as a barrier-lined corridor capped by a sponsor pórtico.
 * Barriers narrow the rideable width for the sprint finish — clipping one
 * at speed triggers a crash (see RaceManager / game.ts). Static dressing,
 * built once alongside the rest of TourProps.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';
import type { Planet } from './planet';

/** Orthonormal basis for an object riding the road: X=side, Y=up, Z=tangent. */
function roadBasis(
  tangent: THREE.Vector3,
  up: THREE.Vector3,
  outQuat: THREE.Quaternion,
  outSide: THREE.Vector3,
): void {
  outSide.crossVectors(tangent, up).normalize();
  const zAxis = new THREE.Vector3().crossVectors(outSide, up).normalize();
  const mat4 = new THREE.Matrix4().makeBasis(outSide, up.clone().normalize(), zAxis);
  outQuat.setFromRotationMatrix(mat4);
}

export function buildFinishStraight(planet: Planet): THREE.Group {
  const group = new THREE.Group();
  const road = planet.road;
  const samples = road.samples;
  const n = samples.length;
  const metersPerSample = road.totalLength / n;
  const straightSamples = Math.max(2, Math.round(CONFIG.race.finishStraightMeters / metersPerSample));
  const spacingSamples = Math.max(1, Math.round(CONFIG.race.barrierSpacing / metersPerSample));

  // --- Barriers: low panels lining both sides of the finish straight ---
  const panelGeo = new THREE.BoxGeometry(CONFIG.race.barrierSpacing * 0.8, 0.9, 0.08);
  panelGeo.translate(0, 0.45, 0);
  const matWhite = toonMat(0xffffff);
  const matRed = toonMat(0xe84545);

  const positions: number[] = [];
  for (let offset = straightSamples; offset >= 0; offset -= spacingSamples) {
    positions.push((n - offset) % n);
  }

  const panelsWhite = new THREE.InstancedMesh(panelGeo, matWhite, positions.length * 2);
  const panelsRed = new THREE.InstancedMesh(panelGeo, matRed, positions.length * 2);
  panelsWhite.frustumCulled = false;
  panelsRed.frustumCulled = false;

  const quat = new THREE.Quaternion();
  const side = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const mat4 = new THREE.Matrix4();
  let whiteIdx = 0;
  let redIdx = 0;

  for (let p = 0; p < positions.length; p++) {
    const s = samples[positions[p]];
    roadBasis(s.tangent, s.dir, quat, side);
    for (const k of [-1, 1]) {
      pos.copy(s.position).addScaledVector(side, CONFIG.race.barrierOffset * k).addScaledVector(s.dir, 0.02);
      mat4.compose(pos, quat, scale);
      if ((p + (k === 1 ? 1 : 0)) % 2 === 0) {
        panelsWhite.setMatrixAt(whiteIdx++, mat4);
      } else {
        panelsRed.setMatrixAt(redIdx++, mat4);
      }
    }
  }
  panelsWhite.count = whiteIdx;
  panelsRed.count = redIdx;
  group.add(panelsWhite, panelsRed);

  // --- Pórtico: a taller sponsor arch at the start of the finish straight ---
  const archSample = samples[(n - straightSamples) % n];
  group.add(buildPortico(archSample.position, archSample.tangent, archSample.dir));

  return group;
}

function buildPortico(
  position: THREE.Vector3,
  tangent: THREE.Vector3,
  up: THREE.Vector3,
): THREE.Group {
  const arch = new THREE.Group();
  const half = CONFIG.road.width / 2 + 1.0;

  const pillarGeo = new THREE.BoxGeometry(0.5, 5.4, 0.5);
  pillarGeo.translate(0, 2.7, 0);
  const pillarMat = toonMat(0x2b5fbf); // sponsor blue
  for (const k of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.x = half * k;
    addOutline(pillar, 0.04);
    arch.add(pillar);
  }

  // Banner spanning the top — bright accent so it reads from a distance.
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(half * 2 + 0.8, 1.3, 0.16),
    toonMat(0xffd23f, { emissive: 0x553300, emissiveIntensity: 0.2 }),
  );
  banner.position.y = 5.0;
  addOutline(banner, 0.04);
  arch.add(banner);

  // Stripe accent under the banner.
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(half * 2 + 0.8, 0.3, 0.18),
    toonMat(0xe84545),
  );
  stripe.position.y = 4.15;
  arch.add(stripe);

  // Orient so local X = side (lateral, where children are offset), local
  // Y = up, local Z = tangent (along the road).
  const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
  const zAxis = new THREE.Vector3().crossVectors(side, up).normalize();
  const mat4 = new THREE.Matrix4().makeBasis(side, up.clone().normalize(), zAxis);
  arch.quaternion.setFromRotationMatrix(mat4);
  arch.position.copy(position).addScaledVector(up, CONFIG.road.lift);

  // Children were positioned in world-space "side" units (local X already
  // matches `side`), so no further conversion is needed beyond the group
  // quaternion above — unlike buildGate/buildFinishArch which build with Y-up.
  return arch;
}
