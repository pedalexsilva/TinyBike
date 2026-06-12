/**
 * Game: renderer + scene composition + fixed entry point of the loop.
 * requestAnimationFrame with delta clamped to 50ms; update and render
 * are separate phases.
 */
import * as THREE from 'three';
import { CONFIG } from './config';
import { Input } from './input';
import { FollowCamera } from './camera';
import { detectQuality, type QualitySettings } from './quality';
import { Planet } from '../world/planet';
import { Sky, SUN_DIR } from '../world/sky';
import { scatterProps } from '../world/props';
import { TourProps } from '../world/tour-props';
import { Musettes } from '../world/collectibles';
import { Dressing } from '../world/dressing';
import { ZONES, angularDistance } from '../world/zones';
import { Player } from '../entities/player';
import { BikeModel } from '../entities/bike';
import { RivalsSystem } from '../entities/rival-npc';
import { TrailFX } from '../fx/trail';
import { DustFX } from '../fx/dust';
import { SpeedLinesFX } from '../fx/speedlines';
import { Hud } from '../ui/hud';
import { ChallengePanel } from '../ui/challenge';
import { RaceHud } from '../ui/race-hud';
import { RaceManager } from '../race/race';
import type { RivalDef } from '../entities/rivals';
import { gameStore } from '../state/store';
import { rewardForWin, bossUnlocked } from '../race/rewards';

const MAX_DELTA = 0.05; // 50ms clamp — tab switches don't teleport the player

const _playerDir = new THREE.Vector3();

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();
  private readonly quality: QualitySettings;

  private readonly input = new Input();
  private readonly followCam: FollowCamera;
  private readonly planet = new Planet();
  private readonly sky = new Sky();
  private readonly player: Player;
  private readonly bike = new BikeModel();
  private readonly tourProps: TourProps;
  private readonly musettes: Musettes;
  private readonly dressing: Dressing;
  private readonly rivals: RivalsSystem;
  private readonly challenge: ChallengePanel;
  private readonly raceHud: RaceHud;
  private readonly race: RaceManager;
  /** Re-armed when the player leaves the challenge radius. */
  private challengeArmed = true;
  private paused = false;
  private readonly trail = new TrailFX();
  private readonly dust = new DustFX();
  private readonly speedLines: SpeedLinesFX;
  private readonly hud: Hud;
  private readonly blobShadow: THREE.Mesh;

  private running = false;

  constructor(root: HTMLElement) {
    const state = gameStore.getState();
    this.quality = detectQuality(state.quality === 'auto' ? undefined : state.quality);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    root.appendChild(this.renderer.domElement);

    // --- Lights (toon-friendly: strong key + colored hemisphere fill) ---
    const sun = new THREE.DirectionalLight(0xfff4d6, 2.2);
    sun.position.copy(SUN_DIR).multiplyScalar(200);
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.85);
    this.scene.add(sun, hemi);

    // --- World ---
    this.scene.add(this.planet.mesh, this.planet.roadMesh);
    this.scene.add(this.sky.group);
    scatterProps(this.scene, this.planet, this.quality);
    this.tourProps = new TourProps(this.planet);
    this.scene.add(this.tourProps.group);
    this.musettes = new Musettes(this.planet);
    this.scene.add(this.musettes.mesh);
    this.dressing = new Dressing(this.planet);
    this.scene.add(this.dressing.group);
    this.rivals = new RivalsSystem(this.planet, 'tour');
    this.scene.add(this.rivals.group);
    this.musettes.onCollect = (pos, up) => {
      this.player.boostCharge = 1; // musette = instant full boost bar
      if (this.quality.fxEnabled) this.dust.spawn(pos, up, 10);
    };

    // --- Player + bike ---
    this.player = new Player(this.planet);
    this.scene.add(this.bike.group);

    // Cheap stylized blob shadow under the bike.
    this.blobShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 20),
      new THREE.MeshBasicMaterial({
        color: 0x1a2a1a,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.scene.add(this.blobShadow);

    // --- Camera + FX ---
    this.followCam = new FollowCamera(window.innerWidth / window.innerHeight);
    this.followCam.setReduceShake(state.reduceShake);
    this.scene.add(this.followCam.camera); // needed: speed lines are a camera child
    this.speedLines = new SpeedLinesFX(this.followCam.camera);
    if (this.quality.fxEnabled) {
      this.scene.add(this.trail.object, this.dust.object);
    }

    // --- HUD ---
    this.hud = new Hud(root, this.input);
    this.challenge = new ChallengePanel(root);
    this.raceHud = new RaceHud(root);
    this.race = new RaceManager(this.planet, this.scene);
    this.race.onCountdownTick = (n) => this.raceHud.countdown(n);
    this.race.onGateMissed = () => this.raceHud.toast('Missed a gate! Back you go.');
    this.race.onFinished = (result, time, def) => {
      const store = gameStore.getState();
      const best = store.bestTimes[def.id] ?? null;
      let reward = null;
      if (result === 'win') {
        const winNumber = (store.wins[def.id] ?? 0) + 1;
        store.recordWin(def.id, time);
        reward = rewardForWin(def.id, winNumber);
        if (reward) store.addItem(reward.id);
      }
      this.raceHud.showResults(result, time, def, best, reward);
    };
    this.raceHud.onContinue = () => {
      this.race.end();
      this.raceHud.hide();
      this.paused = false;
      this.challengeArmed = false; // don't instantly re-open the panel
    };
    this.raceHud.onRetry = () => {
      const def = this.race.def;
      this.race.end();
      if (def) this.startRace(def);
    };
    this.challenge.onRace = (def) => {
      this.challenge.close();
      this.startRace(def);
    };
    this.challenge.onClose = () => {
      this.paused = false;
    };

    this.syncBikeTransform();
    this.followCam.snap(this.player);

    window.addEventListener('resize', () => this.onResize());
    gameStore.subscribe((s) => this.followCam.setReduceShake(s.reduceShake));
  }

  private startRace(def: RivalDef): void {
    this.paused = false;
    this.raceHud.show();
    const level = Math.min(gameStore.getState().wins[def.id] ?? 0, 3);
    this.race.start(def, this.player, this.followCam.camera, {
      difficulty: CONFIG.ai.firstRaceEase + level * CONFIG.ai.rematchStatStep,
    });
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    const dt = Math.min(this.clock.getDelta(), MAX_DELTA);
    this.update(dt);
    this.render();
  }

  private update(dt: number): void {
    const frame = this.input.sample();
    const racing = this.race.state !== 'idle';
    // Input is locked during pause, cutscene, countdown and results.
    const canRide = !this.paused && this.race.state !== 'cutscene' &&
      this.race.state !== 'countdown' && this.race.state !== 'finished';
    if (canRide) this.player.update(dt, frame);
    if (racing) {
      this.race.update(dt, this.player);
      if (this.race.state === 'racing' || this.race.state === 'countdown') {
        this.raceHud.update(
          this.race.playerProgress01,
          this.race.rivalProgress01,
          this.race.raceTime,
          this.race.playerIsFirst,
        );
      }
    }

    // Pavé cobblestone vibration: on the road, inside the pavé zone.
    _playerDir.copy(this.player.position).normalize();
    const onRoad = this.planet.isNearRoad(_playerDir, 1.15);
    const inPave = angularDistance(_playerDir, ZONES.pave.center) < ZONES.pave.radius;
    const speedRatio = this.player.speed / CONFIG.player.maxSpeed;
    this.bike.setVibration(onRoad && inPave ? Math.min(1, speedRatio * 1.4) : 0);

    // Bike visuals + FX.
    this.bike.update(dt, this.player.speed, this.player.smoothSteer, this.player.justBoosted);
    this.syncBikeTransform();

    if (this.quality.fxEnabled) {
      this.trail.update(dt, this.bike.rearContact, this.player.boosting, speedRatio);
      const cornering = Math.abs(this.player.smoothSteer) * speedRatio;
      if (this.player.justBoosted) {
        this.dust.spawn(this.bike.rearContact, this.player.up, 14);
      } else if (cornering > 0.45 && Math.random() < cornering * 0.5) {
        this.dust.spawn(this.bike.rearContact, this.player.up, 2);
      }
      this.dust.update(dt);
    }
    this.speedLines.update(dt, this.player.boosting);

    this.tourProps.update(dt);
    this.musettes.update(dt, this.player.position);
    this.dressing.update(dt, this.player.position);
    this.rivals.update(dt, this.player.position);
    if (!racing && this.rivals.inRange && this.challengeArmed && !this.challenge.isOpen()) {
      this.challengeArmed = false;
      this.paused = true;
      const s = gameStore.getState();
      const def = this.rivals.inRange.def;
      const locked = def.raceType === 'BOSS' && !bossUnlocked(s.wins, def.planet);
      this.challenge.open(def, s.bestTimes[def.id] ?? null, s.wins[def.id] ?? 0, locked);
    } else if (!this.rivals.inRange && !this.challenge.isOpen()) {
      this.challengeArmed = true;
    }
    if (this.race.state !== 'cutscene') this.followCam.update(dt, this.player);
    this.sky.update(dt, this.followCam.camera.position);

    this.hud.update(dt, this.player.speed, this.player.boostCharge, this.player.boosting);
  }

  private syncBikeTransform(): void {
    this.bike.group.position.copy(this.player.position);
    this.bike.group.quaternion.copy(this.player.quaternion);
    this.bike.group.updateMatrixWorld();

    // Blob shadow hugs the surface.
    this.blobShadow.position.copy(this.player.position).addScaledVector(this.player.up, 0.05);
    this.blobShadow.quaternion.copy(this.player.quaternion);
    this.blobShadow.rotateX(-Math.PI / 2);
  }

  private render(): void {
    this.renderer.render(this.scene, this.followCam.camera);
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.followCam.resize(window.innerWidth / window.innerHeight);
  }
}
