/**
 * RivalAI (P10): replaces the P09 dummy.
 * - Follows the road spline with a natural drifting lateral offset.
 * - Slopes affect it like the player (climbers suffer less uphill).
 * - Boost timing by archetype: the sprinter saves it for the finale, the
 *   climber attacks on gradients, the diesel spends it steadily, the boss
 *   reads the race.
 * - Honest rubber-banding: at most -8% when ahead / +5% when behind —
 *   never enough to feel like cheating. All params in CONFIG.ai.
 * - Taunt speech bubbles on overtakes (both directions).
 */
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { BikeModel } from '../entities/bike';
import type { RivalDef } from '../entities/rivals';
import type { Planet } from '../world/planet';

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _side = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Canvas speech bubble sprite with per-rival text. */
class SpeechBubble {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: THREE.CanvasTexture;
  private ttl = 0;

  constructor(parent: THREE.Object3D) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 96;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }),
    );
    this.sprite.scale.set(3.4, 1.27, 1);
    this.sprite.position.set(0, 3.1, 0);
    this.sprite.visible = false;
    parent.add(this.sprite);
  }

  say(text: string, seconds = 2.6): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 96);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 70, 16);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(110, 72);
    ctx.lineTo(126, 92);
    ctx.lineTo(142, 72);
    ctx.fill();
    ctx.fillStyle = '#1c1f2e';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Naive two-line wrap.
    const words = text.split(' ');
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if (line2 === '' && ctx.measureText(`${line1} ${w}`).width < 230) {
        line1 = line1 ? `${line1} ${w}` : w;
      } else {
        line2 = line2 ? `${line2} ${w}` : w;
      }
    }
    if (line2) {
      ctx.fillText(line1, 128, 26);
      ctx.fillText(line2, 128, 54);
    } else {
      ctx.fillText(line1, 128, 40);
    }
    this.texture.needsUpdate = true;
    this.sprite.visible = true;
    this.ttl = seconds;
  }

  update(dt: number): void {
    if (!this.sprite.visible) return;
    this.ttl -= dt;
    if (this.ttl <= 0) this.sprite.visible = false;
  }
}

export class RivalAI {
  readonly model: BikeModel;
  /** Distance covered along the route (meters). */
  progress = 0;
  speed = 0;
  boostCharge = 0.5;
  boostTimer = 0;

  private readonly def: RivalDef;
  private readonly difficulty: number;
  private readonly lateralPhase = Math.random() * Math.PI * 2;
  private readonly bubble: SpeechBubble;
  private wasAhead: boolean | null = null;
  private smoothLean = 0;
  private lastTangent = new THREE.Vector3(1, 0, 0);

  constructor(def: RivalDef, difficulty = 1) {
    this.def = def;
    this.difficulty = difficulty;
    this.model = new BikeModel(def.look);
    this.bubble = new SpeechBubble(this.model.group);
  }

  get boosting(): boolean {
    return this.boostTimer > 0;
  }

  update(
    dt: number,
    planet: Planet,
    startU: number,
    routeMeters: number,
    playerMeters: number,
  ): void {
    const AI = CONFIG.ai;
    const road = planet.road;
    const u = startU + this.progress / road.totalLength;

    // --- Local grade from road samples ---
    const n = road.samples.length;
    const i = ((Math.floor((((u % 1) + 1) % 1) * n) % n) + n) % n;
    const a = road.samples[i];
    const b = road.samples[(i + 2) % n];
    const run = a.position.distanceTo(b.position) || 1;
    const grade = (b.height - a.height) / run;

    // --- Rubber-banding (honest: capped, gradual) ---
    const gap = this.progress - playerMeters; // >0 → rival ahead
    let rubber = 1;
    if (gap > AI.rubberStartGap) {
      rubber = 1 - Math.min(AI.rubberSlowMax, (gap - AI.rubberStartGap) / AI.rubberRange);
    } else if (gap < -AI.rubberStartGap) {
      rubber = 1 + Math.min(AI.rubberPushMax, (-gap - AI.rubberStartGap) / AI.rubberRange);
    }

    // --- Boost decision by archetype ---
    if (this.boostTimer > 0) this.boostTimer -= dt;
    else this.boostCharge = Math.min(1, this.boostCharge + AI.boostFill * dt);
    const remaining01 = 1 - this.progress / routeMeters;
    if (this.boostCharge >= 1 && this.boostTimer <= 0) {
      const wantsBoost =
        (this.def.raceType === 'SPRINT' && remaining01 < 0.25) ||
        (this.def.raceType === 'CLIMB' && grade > 0.05) ||
        (this.def.raceType === 'CLASSIC' && (Math.abs(gap) < 10 || remaining01 < 0.3)) ||
        (this.def.raceType === 'BOSS' && (gap < 0 || remaining01 < 0.4));
      // boostUse stat = probability per ready-moment (checked ~per second).
      if (wantsBoost && Math.random() < this.def.stats.boostUse * dt * 2.5) {
        this.boostTimer = CONFIG.boost.duration;
        this.boostCharge = 0;
      }
    }

    // --- Target speed: stats × difficulty × rubber × slope cap ---
    const base = this.def.stats.topSpeed * CONFIG.ai.basePace * this.difficulty * rubber;
    const climbRelief = this.def.raceType === 'CLIMB' ? 0.55 : 1;
    const gradeCap =
      grade > 0
        ? Math.max(0.25, 1 - CONFIG.player.slopeSpeedPenalty * climbRelief * grade)
        : Math.min(1.25, 1 - CONFIG.player.downhillBonus * 0.8 * grade);
    let target = base * gradeCap;
    if (this.boosting) target *= 1.5;

    const accel = this.def.stats.accel * this.difficulty;
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt);
    else this.speed = Math.max(target, this.speed - accel * 1.5 * dt);

    this.progress += this.speed * dt;

    // --- Pose on the road with drifting lateral offset ---
    const lateral =
      0.7 + Math.sin(this.progress * 0.045 + this.lateralPhase) * 0.55;
    road.pointAt(startU + this.progress / road.totalLength, _v);
    road.tangentAt(startU + this.progress / road.totalLength, _t);
    const dir = _v.clone().normalize();
    _side.crossVectors(_t, dir).normalize();
    this.model.group.position.copy(_v).addScaledVector(_side, lateral);
    _x.crossVectors(dir, _z.copy(_t).negate()).normalize();
    _z.crossVectors(_x, dir).normalize();
    _m.makeBasis(_x, dir, _z);
    this.model.group.quaternion.setFromRotationMatrix(_m);

    // Lean from curvature (tangent change rate).
    const turn = this.lastTangent.angleTo(_t) / Math.max(dt, 1e-4);
    this.lastTangent.copy(_t);
    const lean = THREE.MathUtils.clamp(turn * 0.4, 0, 1) * Math.sign(_t.dot(_side));
    this.smoothLean += (lean - this.smoothLean) * (1 - Math.exp(-6 * dt));
    this.model.update(dt, this.speed, this.smoothLean, false);

    // --- Overtake taunts ---
    const ahead = gap >= 0;
    if (this.wasAhead !== null && ahead !== this.wasAhead) {
      this.bubble.say(ahead ? this.def.raceTaunts.pass : this.def.raceTaunts.passed);
      // TODO(P17): voice blip per rival.
    }
    this.wasAhead = ahead;
    this.bubble.update(dt);
  }
}
