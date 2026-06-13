/**
 * National monuments (design pass): low-poly toon landmarks that make each
 * sector instantly recognisable to a cycling fan.
 *
 *   FRANCE  — Eiffel Tower, Arc de Triomphe, a Ventoux-style summit observatory.
 *   ITALIA  — the Colosseum, the Leaning Tower of Pisa, a Tuscan cypress hill,
 *             Dolomite rock spires on the high mountain.
 *   PORTUGAL— Torre dos Clérigos, Torre de Belém, the Senhora da Graça chapel
 *             on its legendary climb.
 *
 * Everything is built from primitives + the shared toon material so it sits in
 * the same art style as the rest of the world. Repeated geometry (cypresses,
 * Colosseum arches) is instanced. Monuments are static — `update()` only drives
 * a couple of tiny flourishes. Each lands with a soft contact-shadow disc so it
 * reads as grounded without the cost of real-time shadow maps.
 */
import * as THREE from 'three';
import { toonMat, addOutline } from '../render/toon';
import { dirFromLatLon } from '../core/spherical';
import { surfacePose } from './tour-props';
import type { SectorId } from './planet-def';
import type { Planet } from './planet';

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

// Shared soft round shadow texture (radial gradient, dark centre → clear edge).
let shadowTex: THREE.CanvasTexture | null = null;
function getShadowTex(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(20,28,18,0.5)');
  g.addColorStop(0.6, 'rgba(20,28,18,0.28)');
  g.addColorStop(1, 'rgba(20,28,18,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

/** Flat round contact shadow placed under a monument (local +Y up). */
function contactShadow(radius: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: getShadowTex(),
      transparent: true,
      depthWrite: false,
      opacity: 1,
    }),
  );
  mesh.position.y = 0.03;
  mesh.renderOrder = -1;
  mesh.raycast = () => undefined;
  return mesh;
}

interface MonumentDef {
  id: string;
  sector: SectorId;
  latLon: readonly [number, number];
  yaw: number;
  scale: number;
  /** Extra forward lean applied after surface pose (Leaning Tower). */
  tilt?: number;
  /** Footprint radius for the contact shadow (local units, pre-scale). */
  shadow: number;
  build: () => THREE.Object3D;
}

export class Monuments {
  readonly group = new THREE.Group();
  private beacon: THREE.Object3D | null = null;

  constructor(planet: Planet) {
    for (const def of MONUMENTS) {
      const obj = def.build();
      const shadow = contactShadow(def.shadow);
      obj.add(shadow);

      let dir = dirFromLatLon(def.latLon[0], def.latLon[1]);
      // Safety net: nudge a touch away from the equator if a hand-tuned spot
      // drifted onto the road corridor.
      if (planet.isNearRoad(dir, 2.6)) {
        const lat = def.latLon[0] + (def.latLon[0] >= 0 ? 7 : -7);
        dir = dirFromLatLon(lat, def.latLon[1]);
      }
      surfacePose(obj, planet, dir, def.yaw);
      if (def.tilt) {
        const t = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), def.tilt);
        obj.quaternion.multiply(t);
      }
      obj.scale.setScalar(def.scale);
      const b = obj.getObjectByName('beacon');
      if (b) this.beacon = b;
      this.group.add(obj);
    }
  }

  update(dt: number): void {
    if (this.beacon) this.beacon.rotation.y += dt * 1.1;
  }
}

// ============================ BUILDERS ============================
// Each returns a group whose origin is the base centre, +Y up.

const IRON = 0x6f5536;
const STONE_FR = 0xe6d8b8;
const MARBLE = 0xeef0ea;
const TRAVERTINE = 0xcdbb95;
const GRANITE_PT = 0xcdbfa9;
const LIMESTONE = 0xe8dfc8;
const ROOF = 0xb24a30;

function buildEiffel(): THREE.Group {
  const g = new THREE.Group();
  const mat = toonMat(IRON);
  const H = 16;

  // Four legs splaying out at the base, meeting near 0.52H. Each leg's local
  // +Y is aligned to the base->apex direction (predictable, no lookAt).
  const spread = 2.6;
  const meetY = H * 0.52;
  const apex = new THREE.Vector3(0, meetY, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const base = new THREE.Vector3(sx * spread, 0, sz * spread);
    const dirUp = apex.clone().sub(base);
    const len = dirUp.length();
    dirUp.normalize();
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, len, 0.5), mat);
    leg.position.copy(base).add(apex).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(Y, dirUp);
    g.add(leg);
    addOutline(leg, 0.02);
  }

  // First platform deck.
  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(spread * 2.1, 0.4, spread * 2.1), mat);
  deck1.position.y = meetY;
  g.add(deck1);

  // Mid shaft — a tapered lattice column.
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.7, H * 0.3, 1.7), mat);
  shaft.position.y = meetY + H * 0.15;
  g.add(shaft);
  addOutline(shaft, 0.02);
  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 2.4), mat);
  deck2.position.y = meetY + H * 0.3;
  g.add(deck2);

  // Upper tapered spire — stacked shrinking boxes.
  let y = deck2.position.y;
  let w = 1.2;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, H * 0.09, w), mat);
    y += H * 0.045;
    seg.position.y = y;
    y += H * 0.045;
    g.add(seg);
    w *= 0.62;
  }
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.18, 1.1, 6), mat);
  tip.position.y = y + 0.55;
  g.add(tip);

  // A small flag at the very top.
  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.4, 0.04),
    toonMat(0x2b5fbf, { emissive: 0x12306a, emissiveIntensity: 0.2 }),
  );
  flag.position.set(0.4, y + 1.0, 0);
  g.add(flag);
  return g;
}

function buildArc(): THREE.Group {
  const g = new THREE.Group();
  const mat = toonMat(STONE_FR);
  const W = 5.2;
  const H = 5;
  const D = 2;
  // Two legs + a top block, with a dark recessed archway between them.
  const legGeo = new THREE.BoxGeometry(1.5, H, D);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set((sx * (W - 1.5)) / 2, H / 2, 0);
    addOutline(leg, 0.02);
    g.add(leg);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, D + 0.3), mat);
  top.position.y = H + 0.8;
  addOutline(top, 0.02);
  g.add(top);
  // Archway shadow (a dark inset box).
  const arch = new THREE.Mesh(
    new THREE.BoxGeometry(W - 3, H - 0.4, D + 0.5),
    toonMat(0x2a2620),
  );
  arch.position.y = (H - 0.4) / 2;
  g.add(arch);
  // Cornice detail line.
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.3, D + 0.6), toonMat(0xcdbf9c));
  cornice.position.y = H + 0.05;
  g.add(cornice);
  return g;
}

function buildObservatory(): THREE.Group {
  const g = new THREE.Group();
  // Red/white banded tower (Mont Ventoux summit read) + a dome.
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const r = 0.9 - i * 0.06;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r + 0.05, 1, 12),
      toonMat(i % 2 === 0 ? 0xe7e7ea : 0xd83b3b),
    );
    band.position.y = 0.5 + i;
    g.add(band);
  }
  addOutline(g.children[0] as THREE.Mesh, 0.03);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    toonMat(0xb9c2cc),
  );
  dome.position.y = bands + 0.5;
  g.add(dome);
  // Slowly-sweeping beacon light on top of the dome.
  const beacon = new THREE.Group();
  beacon.name = 'beacon';
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    toonMat(0xffe9a8, { emissive: 0xffcf5e, emissiveIntensity: 0.9 }),
  );
  lamp.position.set(0.5, 0, 0);
  beacon.add(lamp);
  beacon.position.y = bands + 1.2;
  g.add(beacon);
  return g;
}

function buildColosseum(): THREE.Group {
  const g = new THREE.Group();
  const wallMat = toonMat(TRAVERTINE);
  const R = 5.4;
  // Plinth.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.7, R + 1.0, 0.6, 32), wallMat);
  plinth.position.y = 0.3;
  g.add(plinth);
  // Outer wall shell (open cylinder), partially "ruined" by a low gap mesh.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 3.4, 32, 1, true),
    new THREE.MeshToonMaterial({ color: TRAVERTINE, side: THREE.DoubleSide, gradientMap: (wallMat as THREE.MeshToonMaterial).gradientMap }),
  );
  wall.position.y = 2.3;
  g.add(wall);
  // Inner lower tier wall.
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 1.4, R - 1.4, 1.8, 28, 1, true),
    (wall.material as THREE.Material),
  );
  inner.position.y = 1.5;
  g.add(inner);

  // Two tiers of arch openings, instanced and oriented to face outward.
  const archGeo = new THREE.BoxGeometry(0.7, 1.3, 0.5);
  const archMat = toonMat(0x4a4035);
  const perTier = 26;
  const arches = new THREE.InstancedMesh(archGeo, archMat, perTier * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (const [tierY, count] of [[1.7, perTier], [3.0, perTier]] as const) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      p.set(Math.cos(a) * R, tierY, Math.sin(a) * R);
      q.setFromAxisAngle(Y, -a + Math.PI / 2);
      m.compose(p, q, s);
      arches.setMatrixAt(n++, m);
    }
  }
  arches.count = n;
  g.add(arches);
  // Broken top rim — a partial higher arc.
  const broken = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 1.1, 32, 1, true, 0, Math.PI * 1.15),
    (wall.material as THREE.Material),
  );
  broken.position.y = 4.4;
  g.add(broken);
  return g;
}

function buildPisa(): THREE.Group {
  const g = new THREE.Group();
  const mat = toonMat(MARBLE);
  const drums = 7;
  for (let i = 0; i < drums; i++) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 1.0, 16), mat);
    drum.position.y = 0.5 + i * 1.0;
    g.add(drum);
    // Colonnade ring (thin torus) for the arcade look.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 6, 18), toonMat(0xdfe2da));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = i * 1.0 + 1.0;
    g.add(ring);
  }
  addOutline(g.children[0] as THREE.Mesh, 0.025);
  // Belfry cap.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 1.0, 0.9, 16), mat);
  cap.position.y = 0.5 + drums * 1.0;
  g.add(cap);
  return g;
}

function buildDolomites(): THREE.Group {
  const g = new THREE.Group();
  const mat = toonMat(0x8a93a0);
  const rand = rng(9931);
  for (let i = 0; i < 5; i++) {
    const h = 4 + rand() * 4;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.8 + rand() * 0.5, h, 5), mat);
    spire.position.set((rand() - 0.5) * 6, h / 2, (rand() - 0.5) * 6);
    spire.rotation.y = rand() * Math.PI;
    addOutline(spire, 0.02);
    g.add(spire);
    // Snow cap.
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, h * 0.28, 5), toonMat(0xfbfdff));
    cap.position.set(spire.position.x, h * 0.86, spire.position.z);
    cap.rotation.y = spire.rotation.y;
    g.add(cap);
  }
  return g;
}

function buildCypressHill(): THREE.Group {
  const g = new THREE.Group();
  const rand = rng(424299);
  const count = 14;
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.7, 5);
  trunkGeo.translate(0, 0.35, 0);
  const crownGeo = new THREE.ConeGeometry(0.55, 4.2, 7);
  crownGeo.translate(0, 2.6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toonMat(0x6e4a2a), count);
  const crowns = new THREE.InstancedMesh(crownGeo, toonMat(0x2f5a36), count);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Loose double row along a gentle ridge.
    const row = i % 2 === 0 ? 1 : -1;
    p.set((i - count / 2) * 0.9, 0, row * (0.8 + rand() * 0.4));
    q.identity();
    const s = 0.8 + rand() * 0.5;
    sc.set(s, s, s);
    m.compose(p, q, sc);
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
  }
  g.add(trunks, crowns);
  return g;
}

function buildClerigos(): THREE.Group {
  const g = new THREE.Group();
  const mat = toonMat(GRANITE_PT);
  // Plinth + square baroque tower tapering through tiers to a cupola.
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), toonMat(0xb6a78f));
  plinth.position.y = 0.6;
  g.add(plinth);
  let y = 1.2;
  let w = 2.0;
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const hh = 2.6 - i * 0.2;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w), mat);
    seg.position.y = y + hh / 2;
    if (i === 0) addOutline(seg, 0.02);
    g.add(seg);
    // Cornice slab between tiers.
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.22, w + 0.3), toonMat(0xe3d8c2));
    slab.position.y = y + hh;
    g.add(slab);
    y += hh;
    w *= 0.8;
  }
  // Octagonal belfry + cupola + spire.
  const belfry = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.7, w * 0.7, 1.4, 8), mat);
  belfry.position.y = y + 0.7;
  g.add(belfry);
  const cupola = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 1.4, 8), toonMat(0x9aa3ad));
  cupola.position.y = y + 2.1;
  g.add(cupola);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.12, 1.0, 6), mat);
  spire.position.y = y + 3.1;
  g.add(spire);
  return g;
}

function buildBelem(): THREE.Group {
  const g = new THREE.Group();
  const mat = toonMat(LIMESTONE);
  // Lower rampart bastion.
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 3.4), mat);
  base.position.y = 0.7;
  addOutline(base, 0.02);
  g.add(base);
  // Main square keep.
  const keep = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4, 2.6), mat);
  keep.position.set(-0.7, 3.4, 0);
  addOutline(keep, 0.02);
  g.add(keep);
  // Battlement merlons on top of the keep.
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 1]) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
      merlon.position.set(-0.7 + sx * 0.85, 5.55, sz * 0.85);
      g.add(merlon);
    }
  }
  // Corner bartizan turrets with conical caps.
  for (const [sx, sz] of [[1, 1], [1, -1]] as const) {
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 1.6, 8), mat);
    turret.position.set(-0.7 + sx * 1.5, 4.1, sz * 1.5);
    g.add(turret);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.8, 8), toonMat(0xbfa98a));
    cap.position.set(turret.position.x, 5.1, turret.position.z);
    g.add(cap);
  }
  return g;
}

function buildGracaChapel(): THREE.Group {
  const g = new THREE.Group();
  const wall = toonMat(0xf4f1ea);
  // Whitewashed nave.
  const nave = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 3.4), wall);
  nave.position.y = 0.9;
  addOutline(nave, 0.02);
  g.add(nave);
  // Gable roof.
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.5, 3), toonMat(ROOF));
  roof.rotation.x = Math.PI / 2;
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 2.2;
  g.add(roof);
  // Bell tower.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.8, 1.0), wall);
  tower.position.set(0, 1.4, 1.5);
  g.add(tower);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.9, 4), toonMat(ROOF));
  towerRoof.position.set(0, 3.15, 1.5);
  towerRoof.rotation.y = Math.PI / 4;
  g.add(towerRoof);
  // Cross.
  const cv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), toonMat(0x3a3026));
  cv.position.set(0, 3.9, 1.5);
  g.add(cv);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), toonMat(0x3a3026));
  ch.position.set(0, 3.95, 1.5);
  g.add(ch);
  return g;
}

// ============================ REGISTRY ============================
const MONUMENTS: MonumentDef[] = [
  // ----- FRANCE -----
  { id: 'eiffel', sector: 'france', latLon: [-13, 6], yaw: 0.3, scale: 1.0, shadow: 4, build: buildEiffel },
  { id: 'arc', sector: 'france', latLon: [10, 33], yaw: -0.6, scale: 1.0, shadow: 3.4, build: buildArc },
  { id: 'observatory', sector: 'france', latLon: [28, 100], yaw: 0, scale: 1.1, shadow: 1.4, build: buildObservatory },
  // ----- ITALIA -----
  { id: 'colosseum', sector: 'italia', latLon: [-15, 146], yaw: 0.4, scale: 1.0, shadow: 6.6, build: buildColosseum },
  { id: 'pisa', sector: 'italia', latLon: [13, 168], yaw: 0, scale: 1.0, tilt: 0.085, shadow: 1.5, build: buildPisa },
  { id: 'cypress', sector: 'italia', latLon: [19, 196], yaw: 0.5, scale: 1.0, shadow: 0.1, build: buildCypressHill },
  { id: 'dolomites', sector: 'italia', latLon: [44, 250], yaw: 0, scale: 1.0, shadow: 0.1, build: buildDolomites },
  // ----- PORTUGAL -----
  { id: 'clerigos', sector: 'portugal', latLon: [-12, 290], yaw: 0.2, scale: 1.0, shadow: 2.2, build: buildClerigos },
  { id: 'belem', sector: 'portugal', latLon: [-15, 330], yaw: -0.4, scale: 1.0, shadow: 3.2, build: buildBelem },
  { id: 'graca', sector: 'portugal', latLon: [23, 300], yaw: 0.8, scale: 1.0, shadow: 2.2, build: buildGracaChapel },
];
