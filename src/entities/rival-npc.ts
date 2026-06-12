/**
 * Rivals as world NPCs (P08): each idles in their zone near the road,
 * shows a "!" balloon when the player approaches, and triggers the
 * challenge panel inside the challenge radius. Racing starts in P09.
 */
import * as THREE from 'three';
import { BikeModel } from './bike';
import { RIVALS, type RivalDef } from './rivals';
import { dirFromLatLon } from '../world/zones';
import type { Planet } from '../world/planet';

const NOTICE_RADIUS = 20; // "!" balloon appears
const CHALLENGE_RADIUS = 7.5; // panel opens (reachable from the road edge)
const Y = new THREE.Vector3(0, 1, 0);

const _v = new THREE.Vector3();

/** Shared "!" balloon texture (drawn once). */
let balloonTexture: THREE.CanvasTexture | null = null;
function getBalloonTexture(): THREE.CanvasTexture {
  if (!balloonTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    // Rounded speech bubble.
    ctx.roundRect(8, 4, 48, 44, 12);
    ctx.fill();
    ctx.beginPath(); // tail
    ctx.moveTo(26, 44);
    ctx.lineTo(32, 60);
    ctx.lineTo(38, 44);
    ctx.fill();
    ctx.fillStyle = '#1c1f2e';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 32, 27);
    balloonTexture = new THREE.CanvasTexture(canvas);
  }
  return balloonTexture;
}

export class RivalNPC {
  readonly def: RivalDef;
  readonly model: BikeModel;
  readonly position = new THREE.Vector3();
  private readonly balloon: THREE.Sprite;
  private time: number;
  private drinkTimer: number;

  constructor(def: RivalDef, planet: Planet) {
    this.def = def;
    this.model = new BikeModel(def.look);
    this.time = Math.random() * 10;
    this.drinkTimer = 4 + Math.random() * 5;

    // Spawn at a FIXED distance (~4.5m) beside the road so the player can
    // always trigger the challenge while riding past — critical on mobile.
    const roadSide = 4.5; // meters from road center
    const idleDir = dirFromLatLon(def.idleLatLon[0], def.idleLatLon[1]);
    const s = planet.road.samples[planet.road.closestIndex(idleDir)];
    // Perpendicular direction from the road toward the idle spot (or an
    // arbitrary side if the spot sits exactly on the road).
    const away = idleDir.clone().addScaledVector(s.dir, -idleDir.dot(s.dir));
    if (away.lengthSq() < 1e-6) away.crossVectors(s.tangent, s.dir);
    away.normalize();
    const ang = roadSide / planet.radius;
    const dir = s.dir
      .clone()
      .multiplyScalar(Math.cos(ang))
      .addScaledVector(away, Math.sin(ang))
      .normalize();
    this.position.copy(dir).multiplyScalar(planet.radius + planet.heightAt(dir));
    this.model.group.position.copy(this.position);
    this.model.group.quaternion.setFromUnitVectors(Y, dir);

    // Face the nearest road point (they're watching for challengers).
    const roadSample = planet.road.samples[planet.road.closestIndex(dir)];
    _v.copy(roadSample.position).sub(this.position);
    const yawAngle = Math.atan2(
      _v.dot(new THREE.Vector3(1, 0, 0).applyQuaternion(this.model.group.quaternion)),
      _v.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.group.quaternion)),
    );
    this.model.group.rotateY(yawAngle);

    // "!" balloon above the head.
    this.balloon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getBalloonTexture(), depthTest: false }),
    );
    this.balloon.scale.setScalar(1.1);
    this.balloon.position.set(0, 2.9, 0);
    this.balloon.visible = false;
    this.model.group.add(this.balloon);
  }

  /** Returns the distance to the player (world units). */
  update(dt: number, playerPos: THREE.Vector3): number {
    this.time += dt;
    const dist = this.position.distanceTo(playerPos);

    // Idle: gentle sway + head bob, occasional drink from the bidon.
    const sway = Math.sin(this.time * 1.1) * 0.04;
    this.model.update(dt * 0.25, 0.4, sway * 6, false); // slow ghost pedaling
    this.drinkTimer -= dt;
    if (this.drinkTimer < 0) {
      // Drink for 1.4s: head back, bidon visible.
      const t = -this.drinkTimer;
      this.model.bidon.visible = true;
      this.model.head.rotation.x = -Math.min(t / 0.4, 1) * 0.5;
      if (t > 1.4) {
        this.model.bidon.visible = false;
        this.model.head.rotation.x = 0;
        this.drinkTimer = 6 + Math.random() * 6;
      }
    } else {
      this.model.head.rotation.x = Math.sin(this.time * 1.6) * 0.06;
    }

    // Balloon: visible on approach, gone when very close (panel takes over).
    this.balloon.visible = dist < NOTICE_RADIUS && dist > CHALLENGE_RADIUS;
    if (this.balloon.visible) {
      this.balloon.position.y = 2.9 + Math.sin(this.time * 3) * 0.12;
    }

    return dist;
  }
}

export class RivalsSystem {
  readonly group = new THREE.Group();
  readonly npcs: RivalNPC[] = [];
  /** Rival currently in challenge range (or null). */
  inRange: RivalNPC | null = null;

  constructor(planet: Planet, planetId: 'tour' | 'giro' | 'vuelta') {
    for (const def of RIVALS.filter((r) => r.planet === planetId)) {
      const npc = new RivalNPC(def, planet);
      this.npcs.push(npc);
      this.group.add(npc.model.group);
    }
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    this.inRange = null;
    let best = CHALLENGE_RADIUS;
    for (const npc of this.npcs) {
      const dist = npc.update(dt, playerPos);
      if (dist < best) {
        best = dist;
        this.inRange = npc;
      }
    }
  }
}
