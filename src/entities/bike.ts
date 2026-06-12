/**
 * Procedural low-poly bike + caricature rider (big head, tiny body).
 * Appearance is parametrized so rivals reuse the same model with their
 * own colors and caricature proportions (P08). Pure BufferGeometry —
 * replaceable by a Blender GLB later. Handles wheel spin, pedaling,
 * lean, boost wheelie and pavé cobblestone vibration.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';

export interface BikeAppearance {
  jersey: number;
  shorts: number;
  skin: number;
  frame: number;
  helmet: number;
  glasses: number;
  wheels: number;
  /** Caricature dials. */
  headScale: number;
  torsoWidth: number;
  smile: boolean;
}

const PLAYER_LOOK: BikeAppearance = {
  jersey: 0xffd23f, // Tour yellow
  shorts: 0x23263a,
  skin: 0xffc9a3,
  frame: 0xe84545,
  helmet: 0xffffff,
  glasses: 0x1c1f2e,
  wheels: 0xcccccc,
  headScale: 1,
  torsoWidth: 1,
  smile: false,
};

const DARK = 0x1c1f2e;

export class BikeModel {
  /** Root group: positioned/oriented by the controller. */
  readonly group = new THREE.Group();
  /** Exposed for NPC idle animations (head bob, drinking). */
  readonly head: THREE.Mesh;
  /** Water bottle for the idle "drink" loop — hidden by default. */
  readonly bidon: THREE.Mesh;

  private readonly leanPivot = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  private readonly crank = new THREE.Group();
  private readonly legL: THREE.Object3D;
  private readonly legR: THREE.Object3D;
  private readonly torso: THREE.Mesh;
  private wheelAngle = 0;
  private lean = 0;
  private wheelie = 0;
  private vibration = 0;
  /** Rear-wheel ground contact in world space (for trail/dust FX). */
  readonly rearContact = new THREE.Vector3();

  constructor(appearance?: Partial<BikeAppearance>) {
    const look: BikeAppearance = { ...PLAYER_LOOK, ...appearance };
    this.group.add(this.leanPivot);
    const R = CONFIG.bike.wheelRadius;

    // --- Wheels ---
    const tireGeo = new THREE.TorusGeometry(R, 0.09, 8, 20);
    const spokeGeo = new THREE.BoxGeometry(0.02, R * 1.9, 0.02);
    const tireMat = toonMat(DARK);
    const rimMat = toonMat(look.wheels);
    for (const z of [R * 1.55, -R * 1.55]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      addOutline(tire, 0.05);
      wheel.add(tire);
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.z = (s / 3) * Math.PI;
        wheel.add(spoke);
      }
      wheel.position.set(0, R, z);
      wheel.rotation.y = Math.PI / 2;
      this.wheels.push(wheel);
      this.leanPivot.add(wheel);
    }

    // --- Frame (stylized) ---
    const frameMat = toonMat(look.frame);
    const tube = (from: THREE.Vector3, to: THREE.Vector3, r = 0.06): THREE.Mesh => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), frameMat);
      mesh.position.copy(from).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.leanPivot.add(mesh);
      return mesh;
    };

    const rearHub = new THREE.Vector3(0, R, -R * 1.55);
    const frontHub = new THREE.Vector3(0, R, R * 1.55);
    const bb = new THREE.Vector3(0, R * 0.78, 0); // bottom bracket
    const seatTop = new THREE.Vector3(0, R * 2.5, -R * 0.7);
    const headTop = new THREE.Vector3(0, R * 2.45, R * 1.15);

    tube(rearHub, bb);
    tube(bb, seatTop, 0.07);
    tube(bb, headTop, 0.07);
    tube(seatTop, headTop, 0.06);
    tube(rearHub, seatTop, 0.05);
    tube(frontHub, headTop, 0.06);

    // Handlebar
    const barMat = toonMat(DARK);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), barMat);
    bar.position.copy(headTop);
    bar.rotation.z = Math.PI / 2;
    this.leanPivot.add(bar);

    // Saddle
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.5), barMat);
    saddle.position.copy(seatTop).add(new THREE.Vector3(0, 0.06, 0));
    this.leanPivot.add(saddle);

    // --- Crank + pedals ---
    this.crank.position.copy(bb);
    const crankMat = toonMat(0x888888);
    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), crankMat);
      arm.position.set(side * 0.14, side * 0.105, 0);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.22), barMat);
      pedal.position.set(side * 0.17, side * 0.21, 0);
      this.crank.add(arm, pedal);
    }
    this.leanPivot.add(this.crank);

    // --- Rider (caricature: big head, compact body) ---
    const riderRoot = new THREE.Group();
    riderRoot.position.copy(seatTop);
    this.leanPivot.add(riderRoot);

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), toonMat(look.jersey));
    this.torso.position.set(0, 0.42, 0.22);
    this.torso.rotation.x = 0.85;
    this.torso.scale.set(look.torsoWidth, 1, look.torsoWidth);
    addOutline(this.torso, 0.05);
    riderRoot.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 14), toonMat(look.skin));
    this.head.position.set(0, 0.92, 0.62);
    this.head.scale.setScalar(look.headScale);
    addOutline(this.head, 0.05);
    riderRoot.add(this.head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      toonMat(look.helmet),
    );
    helmet.position.set(0, 0.06 / look.headScale + 0.0, -0.04 / look.headScale);
    helmet.rotation.x = -0.35;
    addOutline(helmet, 0.05);
    this.head.add(helmet); // scales with the head

    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.13, 0.1), toonMat(look.glasses));
    glasses.position.set(0, 0.04, 0.36);
    this.head.add(glasses);

    if (look.smile) {
      // The enormous grin: a white crescent on the lower face.
      const grin = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.05, 6, 10, Math.PI),
        toonMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.15 }),
      );
      grin.position.set(0, -0.14, 0.36);
      grin.rotation.x = Math.PI; // smile up
      this.head.add(grin);
    }

    // Bidon (for NPC idle "drink" animation).
    this.bidon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.2, 7),
      toonMat(0x53b7e8),
    );
    this.bidon.position.set(0.2, -0.1, 0.42);
    this.bidon.visible = false;
    this.head.add(this.bidon);

    const armMat = toonMat(look.jersey);
    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.62, 3, 8), armMat);
      arm.position.set(side * 0.3 * look.torsoWidth, 0.55, 0.62);
      arm.rotation.x = 1.15;
      arm.rotation.z = side * -0.18;
      riderRoot.add(arm);
    }

    const legGeo = new THREE.CapsuleGeometry(0.11, 0.5, 3, 8);
    const legMat = toonMat(look.shorts);
    this.legL = new THREE.Object3D();
    this.legR = new THREE.Object3D();
    for (const [pivot, side] of [
      [this.legL, 1],
      [this.legR, -1],
    ] as const) {
      pivot.position.set(side * 0.17, 0.1, 0.1);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(0, -0.33, 0.08);
      leg.rotation.x = -0.35;
      pivot.add(leg);
      riderRoot.add(pivot);
    }
  }

  /** Cobblestone shake intensity 0..1 (set by the game per frame). */
  setVibration(v: number): void {
    this.vibration = v;
  }

  update(dt: number, speed: number, smoothSteer: number, justBoosted: boolean): void {
    const B = CONFIG.bike;

    // Wheel spin + pedaling cadence.
    const angVel = speed / B.wheelRadius;
    this.wheelAngle += angVel * dt;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelAngle;
    this.crank.rotation.x = this.wheelAngle * B.cadenceFactor;
    const pedalPhase = this.crank.rotation.x;
    this.legL.rotation.x = Math.sin(pedalPhase) * 0.45;
    this.legR.rotation.x = Math.sin(pedalPhase + Math.PI) * 0.45;

    // Lean into curves (roll proportional to steer * speed).
    const speedRatio = speed / CONFIG.player.maxSpeed;
    const targetLean = -smoothSteer * B.leanAngle * speedRatio;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-8 * dt));

    // Wheelie kick on boost start, decaying.
    if (justBoosted) this.wheelie = B.wheelieAngle;
    this.wheelie *= Math.exp(-3.2 * dt);

    // Pavé vibration: high-frequency positional/roll jitter.
    const vib = this.vibration * B.paveShake;
    const jitterY = vib > 0 ? (Math.random() - 0.5) * vib : 0;
    const jitterR = vib > 0 ? (Math.random() - 0.5) * vib * 0.8 : 0;

    this.leanPivot.position.y = jitterY;
    this.leanPivot.rotation.set(-this.wheelie + jitterR, 0, this.lean + jitterR * 0.6);

    // Subtle squash & stretch with speed (juice).
    const squash = 1 + Math.sin(this.wheelAngle * 2) * 0.008 * speedRatio;
    this.leanPivot.scale.set(1, squash, 1);

    // Rear contact point in world space for FX.
    this.rearContact.set(0, 0, -B.wheelRadius * 1.55);
    this.group.localToWorld(this.rearContact);
  }
}
