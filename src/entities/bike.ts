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
  glassesColor: number;
  rimColor: number;
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
  glassesColor: 0x1c1f2e,
  rimColor: 0xcccccc,
  headScale: 1,
  torsoWidth: 1,
  smile: false,
};

const DARK = 0x1c1f2e;

// Arm pivot poses (radians). Rest = hands on the bars; Cel = victory salute.
const REST_ARM_X = -0.7;
const REST_ARM_Z = -0.1;
const CEL_ARM_X = -2.7;
const CEL_ARM_Z = 0.5;

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
  private readonly armL: THREE.Object3D;
  private readonly armR: THREE.Object3D;
  private readonly torso: THREE.Mesh;
  private wheelAngle = 0;
  private lean = 0;
  private wheelie = 0;
  private vibration = 0;
  /** Victory celebration: 0..1 blend toward the arms-up salute. */
  private celebrating = false;
  private cel = 0;
  private celTime = 0;
  /** Crash tumble: true while the rider is down. */
  private crashing = false;
  private crashTime = 0;
  private crashSide = 1;
  /** Rear-wheel ground contact in world space (for trail/dust FX). */
  readonly rearContact = new THREE.Vector3();

  constructor(appearance?: Partial<BikeAppearance>) {
    const look: BikeAppearance = { ...PLAYER_LOOK, ...appearance };
    this.group.add(this.leanPivot);
    const R = CONFIG.bike.wheelRadius;

    // --- Wheels ---
    const tireGeo = new THREE.TorusGeometry(R, 0.048, 8, 24);
    const spokeGeo = new THREE.BoxGeometry(0.018, R * 1.9, 0.018);
    const tireMat = toonMat(DARK);
    const rimMat = toonMat(look.rimColor);
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
    const tube = (from: THREE.Vector3, to: THREE.Vector3, r = 0.05): THREE.Mesh => {
      const dir = new THREE.Vector3().subVectors(to, from);
      const len = dir.length();
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, len, 6), frameMat);
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

    tube(rearHub, bb, 0.045);
    tube(bb, seatTop, 0.06);
    tube(bb, headTop, 0.06);
    tube(seatTop, headTop, 0.05);
    tube(rearHub, seatTop, 0.04);
    tube(frontHub, headTop, 0.05);

    // Handlebar (Drop bar)
    const barMat = toonMat(DARK);
    const barWidth = 0.52;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, barWidth, 6), barMat);
    bar.position.copy(headTop);
    bar.rotation.z = Math.PI / 2;
    this.leanPivot.add(bar);

    // Drop curves on both sides
    const dropRadius = 0.12;
    const dropTube = 0.026;
    const dropGeo = new THREE.TorusGeometry(dropRadius, dropTube, 6, 8, Math.PI * 0.85);
    for (const side of [1, -1]) {
      const drop = new THREE.Mesh(dropGeo, barMat);
      drop.position.set(side * (barWidth / 2), headTop.y - dropRadius * 0.5, headTop.z + dropRadius * 0.4);
      drop.rotation.x = Math.PI * 0.35;
      drop.rotation.y = side * Math.PI / 2;
      drop.rotation.z = 0;
      this.leanPivot.add(drop);
    }

    // Saddle
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.45), barMat);
    saddle.position.copy(seatTop).add(new THREE.Vector3(0, 0.05, 0));
    this.leanPivot.add(saddle);

    // --- Crank + pedals ---
    this.crank.position.copy(bb);
    const crankMat = toonMat(0x888888);
    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), crankMat);
      arm.position.set(side * 0.14, side * 0.105, 0);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.18), barMat);
      pedal.position.set(side * 0.17, side * 0.21, 0);
      this.crank.add(arm, pedal);
    }
    this.leanPivot.add(this.crank);

    // --- Rider (caricature: big head, compact body) ---
    const riderRoot = new THREE.Group();
    riderRoot.position.copy(seatTop);
    this.leanPivot.add(riderRoot);

    // Leaning forward aerodynamically for the road bike
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.48, 4, 10), toonMat(look.jersey));
    this.torso.position.set(0, 0.38, 0.26);
    this.torso.rotation.x = 1.05;
    this.torso.scale.set(look.torsoWidth, 1, look.torsoWidth);
    addOutline(this.torso, 0.05);
    riderRoot.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.40, 16, 14), toonMat(look.skin));
    this.head.position.set(0, 0.84, 0.68);
    this.head.scale.setScalar(look.headScale);
    addOutline(this.head, 0.05);
    riderRoot.add(this.head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      toonMat(look.helmet),
    );
    helmet.position.set(0, 0.06 / look.headScale + 0.0, -0.04 / look.headScale);
    helmet.rotation.x = -0.35;
    addOutline(helmet, 0.05);
    this.head.add(helmet); // scales with the head

    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.13, 0.1), toonMat(look.glassesColor));
    glasses.position.set(0, 0.04, 0.34);
    this.head.add(glasses);

    if (look.smile) {
      // The enormous grin: a white crescent on the lower face.
      const grin = new THREE.Mesh(
        new THREE.TorusGeometry(0.15, 0.05, 6, 10, Math.PI),
        toonMat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.15 }),
      );
      grin.position.set(0, -0.14, 0.34);
      grin.rotation.x = Math.PI; // smile up
      this.head.add(grin);
    }

    // Bidon (for NPC idle "drink" animation).
    this.bidon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.2, 7),
      toonMat(0x53b7e8),
    );
    this.bidon.position.set(0.2, -0.1, 0.40);
    this.bidon.visible = false;
    this.head.add(this.bidon);

    // Arms hang from shoulder pivots so they can swing from the bars up into
    // the victory salute (see update()).
    const armMat = toonMat(look.jersey);
    this.armL = new THREE.Object3D();
    this.armR = new THREE.Object3D();
    for (const [pivot, side] of [
      [this.armL, 1],
      [this.armR, -1],
    ] as const) {
      pivot.position.set(side * 0.26 * look.torsoWidth, 0.6, 0.34); // shoulder
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.60, 3, 8), armMat);
      arm.position.set(0, -0.3, 0); // extends down from the shoulder pivot
      pivot.add(arm);
      pivot.rotation.set(REST_ARM_X, 0, side * REST_ARM_Z);
      riderRoot.add(pivot);
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

  /** Trigger (or clear) the arms-up victory salute — used by the race winner. */
  setCelebrating(on: boolean): void {
    this.celebrating = on;
    if (!on) this.celTime = 0;
  }

  /** Trigger (or clear) the crash tumble — bike+rider topple to one side. */
  setCrashed(on: boolean): void {
    this.crashing = on;
    if (on) {
      this.crashTime = 0;
      this.crashSide = Math.random() < 0.5 ? -1 : 1;
    } else {
      this.leanPivot.position.set(0, 0, 0);
      this.leanPivot.rotation.set(0, 0, 0);
      this.leanPivot.scale.set(1, 1, 1);
    }
  }

  update(dt: number, speed: number, smoothSteer: number, justBoosted: boolean): void {
    const B = CONFIG.bike;

    // Crash tumble: topple onto one side and stay down until cleared.
    if (this.crashing) {
      this.crashTime += dt;
      const fall = Math.min(1, this.crashTime / 0.3);
      const settle = Math.sin(this.crashTime * 12) * 0.05 * (1 - fall);
      this.leanPivot.rotation.set(0, 0, (Math.PI / 2) * fall * this.crashSide + settle);
      this.leanPivot.position.set(0, -0.32 * fall, 0);
      this.leanPivot.scale.set(1, 1, 1);
      return;
    }

    // Victory celebration blend (0 = riding, 1 = arms-up salute).
    this.cel += ((this.celebrating ? 1 : 0) - this.cel) * (1 - Math.exp(-5 * dt));
    if (this.cel > 0.001) this.celTime += dt;
    const cel = this.cel;

    // Wheel spin + pedaling cadence.
    const angVel = speed / B.wheelRadius;
    this.wheelAngle += angVel * dt;
    for (const wheel of this.wheels) wheel.rotation.x = this.wheelAngle;
    this.crank.rotation.x = this.wheelAngle * B.cadenceFactor;
    const pedalPhase = this.crank.rotation.x;
    // Legs ease to a coast while celebrating.
    this.legL.rotation.x = Math.sin(pedalPhase) * 0.45 * (1 - cel);
    this.legR.rotation.x = Math.sin(pedalPhase + Math.PI) * 0.45 * (1 - cel);

    // Lean into curves (roll proportional to steer * speed); damped while celebrating.
    const speedRatio = speed / CONFIG.player.maxSpeed;
    const targetLean = smoothSteer * B.leanAngle * speedRatio * (1 - cel * 0.85);
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-8 * dt));

    // Wheelie kick on boost start, decaying.
    if (justBoosted) this.wheelie = B.wheelieAngle;
    this.wheelie *= Math.exp(-3.2 * dt);

    // Pavé vibration: high-frequency positional/roll jitter.
    const vib = this.vibration * B.paveShake;
    const jitterY = vib > 0 ? (Math.random() - 0.5) * vib : 0;
    const jitterR = vib > 0 ? (Math.random() - 0.5) * vib * 0.8 : 0;

    this.leanPivot.position.y = jitterY;
    // Sit back a touch and sway side-to-side during the celebration.
    const celSway = Math.sin(this.celTime * 3) * 0.09 * cel;
    this.leanPivot.rotation.set(
      -this.wheelie - cel * 0.12 + jitterR,
      0,
      this.lean + jitterR * 0.6 + celSway,
    );

    // Victory salute: straighten up, look up, both arms raised in a pumping V.
    this.torso.rotation.x = THREE.MathUtils.lerp(1.05, 0.2, cel);
    this.head.rotation.x = THREE.MathUtils.lerp(0, -0.32, cel);
    const pump = Math.sin(this.celTime * 7) * 0.22 * cel;
    this.armL.rotation.set(
      THREE.MathUtils.lerp(REST_ARM_X, CEL_ARM_X + pump, cel), 0,
      THREE.MathUtils.lerp(REST_ARM_Z, CEL_ARM_Z, cel),
    );
    this.armR.rotation.set(
      THREE.MathUtils.lerp(REST_ARM_X, CEL_ARM_X + pump, cel), 0,
      THREE.MathUtils.lerp(-REST_ARM_Z, -CEL_ARM_Z, cel),
    );

    // Subtle squash & stretch with speed (juice).
    const squash = 1 + Math.sin(this.wheelAngle * 2) * 0.008 * speedRatio;
    this.leanPivot.scale.set(1, squash, 1);

    // Rear contact point in world space for FX.
    this.rearContact.set(0, 0, -B.wheelRadius * 1.55);
    this.group.localToWorld(this.rearContact);
  }
}
