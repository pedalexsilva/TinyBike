/**
 * Race system (P09).
 * RaceManager drives: idle → cutscene → countdown → racing → finished.
 * Routes are arc-length segments of the shared RoadSpline; checkpoint
 * gates are generated along the route; missing one soft-resets the player
 * to the last gate. The rival runs on RivalAI (P10): archetype boost
 * timing + honest rubber-banding.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { CONFIG } from '../core/config';
import { toonMat, addOutline } from '../render/toon';
import { dirFromLatLon } from '../world/zones';
import { RivalAI } from './rival-ai';
import { RaceLine } from './race-line';
import type { RivalDef } from '../entities/rivals';
import type { Planet } from '../world/planet';
import type { Player } from '../entities/player';

export type RaceState = 'idle' | 'cutscene' | 'countdown' | 'racing' | 'finished';
export type RaceResult = 'win' | 'lose';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _side = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/** Guide colour for the racing line + next-gate halo (bright, blooms). */
const GUIDE_COLOR = 0x32e0ff;

interface Gate {
  /** Unwrapped route-relative distance (meters from route start). */
  atMeters: number;
  position: THREE.Vector3;
  up: THREE.Vector3;
  group: THREE.Group;
  /** Pulsing ring shown only on the next (active) checkpoint. */
  halo: THREE.Mesh;
  passed: boolean;
  isFinish: boolean;
}

export class RaceManager {
  state: RaceState = 'idle';
  result: RaceResult | null = null;
  raceTime = 0;
  def: RivalDef | null = null;

  /** UI hooks (wired by the game). */
  onCountdownTick: ((n: number) => void) | null = null; // 3,2,1,0(GO)
  onFinished: ((result: RaceResult, time: number, def: RivalDef) => void) | null = null;
  onGateMissed: (() => void) | null = null;
  onCheckpointPassed: (() => void) | null = null;

  private readonly planet: Planet;
  private readonly raceGroup = new THREE.Group();
  private rival: RivalAI | null = null;
  private raceLine: RaceLine | null = null;
  private gates: Gate[] = [];
  private nextGate = 0;
  private startU = 0;
  private routeMeters = 0;
  private playerMeters = 0;
  private lastRel = 0;
  private countdownLeft = 0;
  private countdownInt = -1;

  constructor(planet: Planet, scene: THREE.Scene) {
    this.planet = planet;
    scene.add(this.raceGroup);
  }

  /** 0..1 progress for the HUD bar. */
  get playerProgress01(): number {
    return this.routeMeters > 0 ? Math.min(1, this.playerMeters / this.routeMeters) : 0;
  }

  get rivalProgress01(): number {
    return this.rival && this.routeMeters > 0
      ? Math.min(1, this.rival.progress / this.routeMeters)
      : 0;
  }

  get playerIsFirst(): boolean {
    return this.playerMeters >= (this.rival?.progress ?? 0);
  }

  /** World position of the rival's bike (for the celebration camera), or null. */
  get rivalCelebrationCenter(): THREE.Vector3 | null {
    return this.rival ? this.rival.model.group.position.clone() : null;
  }

  // ----------------------------------------------------------- LIFECYCLE

  start(
    def: RivalDef,
    player: Player,
    camera: THREE.PerspectiveCamera,
    opts: { skipCutscene?: boolean; difficulty?: number } = {},
  ): void {
    this.cleanup();
    this.def = def;
    this.result = null;
    this.raceTime = 0;
    this.playerMeters = 0;

    // --- Route from the rival's archetype ---
    const road = this.planet.road;
    const uOf = (lat: number, lon: number): number =>
      road.uAt(road.closestIndex(dirFromLatLon(lat, lon)));
    let endU: number;
    switch (def.raceType) {
      case 'SPRINT': {
        endU = Math.round(uOf(0, 0)); // the vila arch (u≈1 → 1.0 exactly)
        this.startU = endU - CONFIG.race.sprintMeters / road.totalLength;
        break;
      }
      case 'CLIMB': {
        this.startU = uOf(13, 223); // foothills
        endU = uOf(48, 243); // Alpe high point
        if (endU < this.startU) endU += 1;
        break;
      }
      case 'CLASSIC':
      case 'BOSS':
      default: {
        this.startU = 0; // full lap from the arch
        endU = 1;
        break;
      }
    }
    this.routeMeters = (endU - this.startU) * road.totalLength;

    // --- Gates ---
    const gateCount = Math.max(3, Math.round(this.routeMeters / CONFIG.race.gateSpacing));
    for (let g = 1; g <= gateCount; g++) {
      const frac = g / gateCount;
      const atMeters = frac * this.routeMeters;
      const u = this.startU + frac * (endU - this.startU);
      this.gates.push(this.buildGate(u, atMeters, g === gateCount));
    }
    this.nextGate = 0;

    // Guidance racing line down the route + halo on the first checkpoint.
    this.raceLine = new RaceLine(this.planet, this.startU, endU, GUIDE_COLOR);
    this.raceGroup.add(this.raceLine.mesh);
    this.highlightNextGate();

    // --- Grid: player left, rival right of road center ---
    road.pointAt(this.startU, _v);
    road.tangentAt(this.startU, _v2);
    const upDir = _v.clone().normalize();
    _side.crossVectors(_v2, upDir).normalize();
    player.resetTo(_v.clone().addScaledVector(_side, -0.9), _v2);
    this.lastRel = 0;

    this.rival = new RivalAI(def, opts.difficulty ?? 1);
    this.raceGroup.add(this.rival.model.group);
    this.rival.update(0, this.planet, this.startU, this.routeMeters, 0);

    // --- Cutscene → countdown ---
    if (opts.skipCutscene) {
      this.beginCountdown();
    } else {
      this.state = 'cutscene';
      this.flyCamera(camera, player);
    }
  }

  /** Course-preview camera flight (GSAP), then countdown. */
  private flyCamera(camera: THREE.PerspectiveCamera, player: Player): void {
    const road = this.planet.road;
    road.pointAt(this.startU + 0.5 * (this.routeMeters / road.totalLength), _v);
    const mid = _v.clone().addScaledVector(_v.clone().normalize(), 26);
    const behind = player.position
      .clone()
      .addScaledVector(player.heading, -CONFIG.camera.distance)
      .addScaledVector(player.up, CONFIG.camera.height);
    const look = { x: player.position.x, y: player.position.y, z: player.position.z };
    const lookTarget = new THREE.Vector3();

    // TODO(P17): whoosh + crowd ambience during the flyover.
    const tl = gsap.timeline({ onComplete: () => this.beginCountdown() });
    tl.to(camera.position, { x: mid.x, y: mid.y, z: mid.z, duration: 1.3, ease: 'power2.inOut' });
    tl.to(camera.position, {
      x: behind.x,
      y: behind.y,
      z: behind.z,
      duration: 1.3,
      ease: 'power2.inOut',
    });
    tl.eventCallback('onUpdate', () => {
      lookTarget.set(look.x, look.y, look.z);
      // Keep the camera "up" orthogonal to the view direction so lookAt never
      // degenerates (the apex shot looks almost straight down → a radial up
      // would be parallel to the view and flip the image upside down).
      _camFwd.copy(lookTarget).sub(camera.position).normalize();
      _camUp.copy(player.up).addScaledVector(_camFwd, -player.up.dot(_camFwd));
      if (_camUp.lengthSq() < 1e-4) _camUp.copy(player.heading); // near-vertical view
      camera.up.copy(_camUp.normalize());
      camera.lookAt(lookTarget);
    });
  }

  private beginCountdown(): void {
    this.state = 'countdown';
    this.countdownLeft = CONFIG.race.countdownSeconds;
    this.countdownInt = -1;
  }

  update(dt: number, player: Player): void {
    // Keep the guidance chevrons flowing through cutscene, countdown and race.
    if (this.raceLine) this.raceLine.update(dt);
    if (this.state === 'countdown') {
      this.countdownLeft -= dt;
      const n = Math.max(0, Math.ceil(this.countdownLeft));
      if (n !== this.countdownInt) {
        this.countdownInt = n;
        // TODO(P17): beep (n>0) / GO horn (n===0).
        if (this.onCountdownTick) this.onCountdownTick(n);
      }
      if (this.countdownLeft <= 0) this.state = 'racing';
      return;
    }
    // After the line: keep the rival's model animating so the winner can
    // celebrate (and the loser coast to a stop) while the results show.
    if (this.state === 'finished') {
      if (this.rival) {
        this.rival.speed *= Math.exp(-1.6 * dt);
        this.rival.model.update(dt, this.rival.speed, 0, false);
      }
      return;
    }
    if (this.state !== 'racing' || !this.rival || !this.def) return;

    this.raceTime += dt;
    this.rival.update(dt, this.planet, this.startU, this.routeMeters, this.playerMeters);

    // Pulse the active checkpoint halo so the immediate target reads at a glance.
    const activeHalo = this.gates[this.nextGate]?.halo;
    if (activeHalo) activeHalo.scale.setScalar(1 + Math.sin(this.raceTime * 5) * 0.13);

    // --- Player progress along the route (wrap-safe accumulation) ---
    const road = this.planet.road;
    _v.copy(player.position).normalize();
    const u = road.uAt(road.closestIndex(_v));
    let rel = (u - this.startU) % 1;
    if (rel < 0) rel += 1;
    let delta = rel - this.lastRel;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    this.lastRel = rel;
    this.playerMeters = Math.max(0, this.playerMeters + delta * road.totalLength);

    // --- Gates: pass detection (in order) + miss handling ---
    const gate = this.gates[this.nextGate];
    if (gate) {
      if (player.position.distanceToSquared(gate.position) < CONFIG.race.gateRadius ** 2) {
        gate.passed = true;
        this.tintGate(gate, 0x2ecc71);
        gate.halo.visible = false;
        this.nextGate++;
        this.highlightNextGate();
        if (this.onCheckpointPassed) this.onCheckpointPassed();
      } else if (this.playerMeters > gate.atMeters + CONFIG.race.gateMissMargin) {
        // Soft reset to the previous gate (or the start line).
        const back = this.gates[this.nextGate - 1];
        const resetU =
          back !== undefined
            ? this.startU + (back.atMeters / road.totalLength)
            : this.startU;
        road.pointAt(resetU, _v);
        road.tangentAt(resetU, _v2);
        player.resetTo(_v, _v2);
        this.playerMeters = back !== undefined ? back.atMeters : 0;
        this.lastRel = ((road.uAt(road.closestIndex(_v.clone().normalize())) - this.startU) % 1 + 1) % 1;
        if (this.onGateMissed) this.onGateMissed();
      }
    }

    // --- Finish conditions ---
    const playerDone = this.nextGate >= this.gates.length;
    const rivalDone = this.rival.progress >= this.routeMeters;
    if (playerDone || rivalDone) {
      this.state = 'finished';
      this.result = playerDone && (!rivalDone || this.playerIsFirst) ? 'win' : 'lose';
      // TODO(P17): victory fanfare / defeat trombone.
      if (this.onFinished) this.onFinished(this.result, this.raceTime, this.def);
    }
  }

  /** Back to free roam; removes gates and the rival from the scene. */
  end(): void {
    this.cleanup();
    this.state = 'idle';
  }

  /** Make the rival perform the victory salute (called when the rival wins). */
  celebrateRival(): void {
    this.rival?.model.setCelebrating(true);
  }

  // ------------------------------------------------------------ INTERNAL

  private buildGate(u: number, atMeters: number, isFinish: boolean): Gate {
    const road = this.planet.road;
    road.pointAt(u, _v);
    road.tangentAt(u, _v2);
    const up = _v.clone().normalize();
    _side.crossVectors(_v2, up).normalize();

    const group = new THREE.Group();
    const half = CONFIG.road.width / 2 + 0.35;
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6);
    poleGeo.translate(0, 1.3, 0);
    const poleMat = toonMat(isFinish ? 0x1c1f2e : 0xffffff);
    for (const k of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.copy(_side).multiplyScalar(half * k);
      group.add(pole);
      // Pennant on top.
      const flag = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.4, 4),
        toonMat(isFinish ? 0xffd23f : 0xe84545),
      );
      flag.position.copy(pole.position).add(new THREE.Vector3(0, 2.75, 0));
      group.add(flag);
    }
    if (isFinish) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.5, 0.45, 0.4), toonMat(0xffd23f));
      beam.position.y = 2.7;
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _side);
      addOutline(beam, 0.05);
      group.add(beam);
    }

    group.position.copy(_v);
    group.quaternion.setFromUnitVectors(Y, up);
    // Children were positioned with world-space side offsets — convert.
    const invQ = group.quaternion.clone().invert();
    for (const child of group.children) child.position.applyQuaternion(invQ);
    const beamChild = group.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.BoxGeometry);
    if (beamChild) beamChild.quaternion.premultiply(invQ);

    // Active-checkpoint halo: a flat ring on the road (added after the invQ
    // conversion so it sits in the group's local up-frame). Hidden by default.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(CONFIG.road.width * 0.62, 0.1, 6, 24),
      new THREE.MeshBasicMaterial({
        color: GUIDE_COLOR,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.08;
    halo.renderOrder = 3;
    halo.visible = false;
    group.add(halo);

    this.raceGroup.add(group);
    return { atMeters, position: _v.clone(), up, group, halo, passed: false, isFinish };
  }

  /** Show the pulsing halo only on the next (active) checkpoint. */
  private highlightNextGate(): void {
    for (let i = 0; i < this.gates.length; i++) {
      this.gates[i].halo.visible = i === this.nextGate;
    }
  }

  private tintGate(gate: Gate, color: number): void {
    gate.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material instanceof THREE.MeshToonMaterial) {
        const cloned = mesh.material.clone();
        cloned.color.setHex(color);
        mesh.material = cloned;
      }
    });
  }

  private cleanup(): void {
    for (const gate of this.gates) this.raceGroup.remove(gate.group);
    this.gates = [];
    if (this.raceLine) {
      this.raceGroup.remove(this.raceLine.mesh);
      this.raceLine.dispose();
      this.raceLine = null;
    }
    if (this.rival) {
      this.raceGroup.remove(this.rival.model.group);
      this.rival = null;
    }
  }
}
