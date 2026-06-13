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
import { Monuments } from '../world/monuments';
import { Musettes } from '../world/collectibles';
import { Dressing } from '../world/dressing';
import { angularDistance } from '../world/zones';
import { sectorForDir, type SectorId } from '../world/planet-def';
import { PostFX } from '../render/post';
import { SectorBanner } from '../ui/sector-banner';
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
import { TitleScreen, Hints } from '../ui/title';
import { PauseMenu } from '../ui/pause';
import { Garage, appearanceFromEquipped } from '../ui/garage';
import { AudioManager } from '../audio/audio';

const MAX_DELTA = 0.05; // 50ms clamp — tab switches don't teleport the player
const CELEBRATION_SECONDS = 3.4; // winner orbit before the results card

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
  private bike: BikeModel;
  private readonly tourProps: TourProps;
  private readonly monuments: Monuments;
  private readonly musettes: Musettes;
  private readonly dressing: Dressing;
  private readonly rivals: RivalsSystem;
  private readonly challenge: ChallengePanel;
  private readonly raceHud: RaceHud;
  private readonly race: RaceManager;
  /** Re-armed when the player leaves the challenge radius. */
  private challengeArmed = true;
  private paused = true; // start paused for title screen
  private garageOrbit = 0;

  // Celebration camera: a slow orbit around the winner before results show.
  private celebrationActive = false;
  private celebrationTime = 0;
  private readonly celebrationCenter = new THREE.Vector3();
  private readonly celebrationUp = new THREE.Vector3();
  private pendingResults: (() => void) | null = null;
  private readonly trail = new TrailFX();
  private readonly dust = new DustFX();
  private readonly speedLines: SpeedLinesFX;
  private readonly hud: Hud;
  private readonly sectorBanner: SectorBanner;
  private currentSector: SectorId | null = null;
  private postFX: PostFX | null = null;
  private readonly blobShadow: THREE.Mesh;

  private readonly garage: Garage;
  private readonly title: TitleScreen;
  private readonly hints: Hints;
  private readonly pauseMenu: PauseMenu;
  private readonly audio = new AudioManager();

  private running = false;

  constructor(root: HTMLElement) {
    const state = gameStore.getState();
    this.quality = detectQuality(state.quality === 'auto' ? undefined : state.quality);
    this.bike = new BikeModel(appearanceFromEquipped());

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Filmic tone mapping lifts the cel palette into a richer, "graded" look.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    root.appendChild(this.renderer.domElement);

    // Atmospheric fog matched to the sky horizon — cheap, huge depth win.
    this.scene.fog = new THREE.Fog(0xcfe6ff, 120, 320);

    // --- Lights (toon-friendly: strong key + colored hemisphere fill) ---
    const sun = new THREE.DirectionalLight(0xffe8bd, 2.8);
    sun.position.copy(SUN_DIR).multiplyScalar(200);
    const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.85);
    // Cool back/rim light from behind the sun — gives the premium cel edge.
    const rim = new THREE.DirectionalLight(0x9fc6ff, 0.7);
    rim.position.copy(SUN_DIR).multiplyScalar(-180).setY(60);
    this.scene.add(sun, hemi, rim);

    // --- World ---
    this.scene.add(this.planet.mesh, this.planet.roadMesh, this.planet.roadMarkingsMesh);
    this.scene.add(this.sky.group);
    scatterProps(this.scene, this.planet, this.quality);
    this.tourProps = new TourProps(this.planet);
    this.scene.add(this.tourProps.group);
    this.monuments = new Monuments(this.planet);
    this.scene.add(this.monuments.group);
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

    this.garage = new Garage(root, this.scene);
    this.title = new TitleScreen(root);
    this.hints = new Hints(root);
    this.pauseMenu = new PauseMenu(root);
    this.sectorBanner = new SectorBanner(root);

    // Post-processing: skip entirely on low-tier (mobile) for a plain, fast
    // render path; medium/high get bloom + SMAA + ACES via the composer.
    if (this.quality.tier !== 'low' && this.quality.fxEnabled) {
      this.postFX = new PostFX(this.renderer, this.scene, this.followCam.camera, this.quality);
    }

    // Audio triggers
    this.musettes.onCollect = (pos, up) => {
      this.player.boostCharge = 1; // musette = instant full boost bar
      if (this.quality.fxEnabled) this.dust.spawn(pos, up, 10);
      this.audio.playCollect();
    };

    this.race.onCountdownTick = (n) => {
      this.raceHud.countdown(n);
      this.audio.playCountdown(n);
    };
    this.race.onGateMissed = () => {
      this.raceHud.toast('Missed a gate! Back you go.');
      this.audio.playMiss();
    };
    this.race.onCheckpointPassed = () => {
      this.audio.playCheckpoint();
    };
    this.race.onFinished = (result, time, def) => {
      const store = gameStore.getState();
      const best = store.bestTimes[def.id] ?? null;
      let reward = null;
      if (result === 'win') {
        const winNumber = (store.wins[def.id] ?? 0) + 1;
        store.recordWin(def.id, time);
        reward = rewardForWin(def.id, winNumber);
        if (reward) store.addItem(reward.id);
        this.audio.playVictory();
        this.bike.setCelebrating(true); // the player throws their arms up
      } else {
        this.audio.playDefeat();
        this.race.celebrateRival(); // the rival salutes the win
      }
      // Orbit the winner for a beat, then reveal the results card.
      this.pendingResults = () => this.raceHud.showResults(result, time, def, best, reward);
      this.beginCelebrationCam(result === 'win');
    };
    this.raceHud.onContinue = () => {
      this.race.end();
      this.bike.setCelebrating(false);
      this.raceHud.hide();
      this.audio.setState('explore');
      this.paused = false;
      this.challengeArmed = false; // don't instantly re-open the panel
    };
    this.raceHud.onRetry = () => {
      const def = this.race.def;
      this.race.end();
      this.bike.setCelebrating(false);
      if (def) this.startRace(def);
    };
    this.challenge.onRace = (def) => {
      this.challenge.close();
      this.startRace(def);
    };
    this.challenge.onClose = () => {
      this.paused = false;
    };

    // UI callbacks & Event wiring
    this.title.ready.then(() => {
      this.audio.init();
      this.audio.startMusic();
      this.paused = false;
      this.hints.showOnboarding(this.input.isTouch);
    });

    this.pauseMenu.onResume = () => {
      this.paused = false;
    };
    this.pauseMenu.onGarage = () => {
      this.paused = true;
      this.garageOrbit = 0;
      this.bike.group.visible = false;
      this.blobShadow.visible = false;
      this.garage.enter(this.player.position, this.player.up);
    };

    this.garage.onExit = () => {
      this.paused = false;
      this.scene.remove(this.bike.group);
      this.bike = new BikeModel(appearanceFromEquipped());
      this.scene.add(this.bike.group);
      this.bike.group.visible = true;
      this.blobShadow.visible = true;
      this.syncBikeTransform();
    };

    const hudGarage = document.getElementById('hud-garage-btn');
    const hudPause = document.getElementById('hud-pause-btn');

    hudGarage?.addEventListener('click', () => {
      if (!this.paused && this.race.state === 'idle' && !this.garage.isOpen) {
        this.paused = true;
        this.garageOrbit = 0;
        this.bike.group.visible = false;
        this.blobShadow.visible = false;
        this.garage.enter(this.player.position, this.player.up);
      }
    });

    hudPause?.addEventListener('click', () => {
      if (this.garage.isOpen) return;
      if (this.pauseMenu.isOpen()) {
        this.pauseMenu.close();
        this.paused = false;
      } else {
        this.pauseMenu.open();
        this.paused = true;
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.garage.isOpen) {
          this.garage.exit();
        } else if (this.pauseMenu.isOpen()) {
          this.pauseMenu.close();
          this.paused = false;
        } else if (!this.paused && this.race.state === 'idle') {
          this.pauseMenu.open();
          this.paused = true;
        }
      }
    });

    this.syncBikeTransform();
    this.followCam.snap(this.player);

    window.addEventListener('resize', () => this.onResize());
    gameStore.subscribe((s) => this.followCam.setReduceShake(s.reduceShake));
  }

  private startRace(def: RivalDef): void {
    this.paused = false;
    this.bike.setCelebrating(false);
    this.celebrationActive = false;
    this.pendingResults = null;
    this.raceHud.show();
    this.audio.setState('race');
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
    if (racing && !this.paused) {
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
    const pave = this.planet.paveZone;
    const inPave = pave !== null && angularDistance(_playerDir, pave.center) < pave.radius;
    const speedRatio = this.player.speed / CONFIG.player.maxSpeed;
    this.bike.setVibration(onRoad && inPave ? Math.min(1, speedRatio * 1.4) : 0);

    // Audio updates
    if (!this.paused && this.player.justBoosted) {
      this.audio.playBoost();
    }
    this.audio.updateWind(this.paused ? 0 : speedRatio);

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
    this.monuments.update(dt);

    // Sector banner: announce when the rider crosses into a new nation.
    if (!this.paused && !racing) {
      const sec = sectorForDir(this.planet.def, _playerDir);
      if (sec.id !== this.currentSector) {
        if (this.currentSector !== null) {
          this.sectorBanner.show(sec.name, sec.tour, sec.flag, sec.accent);
        }
        this.currentSector = sec.id;
      }
    }

    this.musettes.update(dt, this.player.position);
    this.dressing.update(dt, this.player.position);
    this.rivals.update(dt, this.player.position);
    if (!this.paused && !racing && this.rivals.inRange && this.challengeArmed && !this.challenge.isOpen()) {
      this.challengeArmed = false;
      this.paused = true;
      const s = gameStore.getState();
      const def = this.rivals.inRange.def;
      const locked = def.raceType === 'BOSS' && !bossUnlocked(s.wins, def.planet);
      this.challenge.open(def, s.bestTimes[def.id] ?? null, s.wins[def.id] ?? 0, locked);
    } else if (!this.rivals.inRange && !this.challenge.isOpen()) {
      this.challengeArmed = true;
    }
    if (this.garage.isOpen) {
      // Orbit the podium slowly; the rider rotates on it.
      this.garage.update(dt);
      this.garageOrbit += dt * 0.25;
      const up = this.garage.podiumUp;
      const e1 = new THREE.Vector3(1, 0, 0);
      if (Math.abs(up.dot(e1)) > 0.9) e1.set(0, 0, 1);
      e1.cross(up).normalize();
      const e2 = new THREE.Vector3().crossVectors(up, e1);
      this.followCam.camera.position
        .copy(this.garage.podiumCenter)
        .addScaledVector(e1, Math.cos(this.garageOrbit) * 5.2)
        .addScaledVector(e2, Math.sin(this.garageOrbit) * 5.2)
        .addScaledVector(up, 2.4);
      this.followCam.camera.up.copy(up);
      const look = this.garage.podiumCenter.clone().addScaledVector(up, 1.2);
      this.followCam.camera.lookAt(look);
    } else if (this.celebrationActive) {
      this.updateCelebrationCam(dt);
    } else if (this.race.state !== 'cutscene') this.followCam.update(dt, this.player);
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

  /** Start a cinematic orbit around the winner; results show when it ends. */
  private beginCelebrationCam(playerWon: boolean): void {
    let center: THREE.Vector3 | null;
    if (playerWon) {
      center = this.player.position.clone();
      this.celebrationUp.copy(this.player.up);
    } else {
      center = this.race.rivalCelebrationCenter;
      this.celebrationUp.copy(center ? center.clone().normalize() : this.player.up);
    }
    this.celebrationCenter.copy(center ?? this.player.position);
    this.celebrationTime = 0;
    this.celebrationActive = true;
  }

  private updateCelebrationCam(dt: number): void {
    this.celebrationTime += dt;
    const cam = this.followCam.camera;
    const up = this.celebrationUp;
    // Orbit basis orthogonal to the surface normal (same trick as the garage).
    const e1 = new THREE.Vector3(1, 0, 0);
    if (Math.abs(up.dot(e1)) > 0.9) e1.set(0, 0, 1);
    e1.cross(up).normalize();
    const e2 = new THREE.Vector3().crossVectors(up, e1);
    const ang = this.celebrationTime * 0.9;
    cam.position
      .copy(this.celebrationCenter)
      .addScaledVector(e1, Math.cos(ang) * 6.2)
      .addScaledVector(e2, Math.sin(ang) * 6.2)
      .addScaledVector(up, 2.7);
    cam.up.copy(up);
    cam.lookAt(this.celebrationCenter.clone().addScaledVector(up, 1.0));
    if (this.celebrationTime >= CELEBRATION_SECONDS) this.endCelebrationCam();
  }

  private endCelebrationCam(): void {
    this.celebrationActive = false;
    this.followCam.snap(this.player);
    if (this.pendingResults) {
      this.pendingResults();
      this.pendingResults = null;
    }
  }

  private render(): void {
    if (this.postFX) this.postFX.render();
    else this.renderer.render(this.scene, this.followCam.camera);
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.followCam.resize(window.innerWidth / window.innerHeight);
    this.postFX?.setSize(window.innerWidth, window.innerHeight);
  }
}
