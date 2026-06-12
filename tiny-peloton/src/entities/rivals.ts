/**
 * Rival roster — pure data, no Three.js objects (serializable, save-friendly).
 * Names are parodies; appearances are caricatures, no real likeness.
 * Stats are consumed by RaceManager (P09) and RivalAI (P10).
 */
import type { ZoneId } from '../world/zones';

export type RaceType = 'SPRINT' | 'CLIMB' | 'CLASSIC' | 'BOSS';
export type PlanetId = 'tour' | 'giro' | 'vuelta';

export interface RivalStats {
  /** m/s — compare with CONFIG.player.maxSpeed (13.5). */
  topSpeed: number;
  accel: number;
  /** 0..1 — how aggressively the AI spends boost (archetype timing in P10). */
  boostUse: number;
}

export interface RivalAppearance {
  jersey: number;
  shorts: number;
  helmet: number;
  skin: number;
  frame: number;
  /** Caricature dials. */
  headScale: number;
  torsoWidth: number;
  smile: boolean;
}

export interface RivalDef {
  id: string;
  name: string;
  planet: PlanetId;
  zone: ZoneId;
  /** One-line personality bio (challenge panel). */
  bio: string;
  /** Spoken when challenging / during the race. */
  taunt: string;
  /** Spoken when the player beats them. */
  defeatLine: string;
  /** Short in-race bubbles: when they pass you / when you pass them. */
  raceTaunts: { pass: string; passed: string };
  raceType: RaceType;
  stats: RivalStats;
  look: RivalAppearance;
  /** Idle spot (lat, lon) — nudged off-road at spawn time. */
  idleLatLon: [number, number];
}

export const RIVALS: RivalDef[] = [
  {
    id: 'cannondish',
    name: 'Marc Cannondish',
    planet: 'tour',
    zone: 'vila',
    bio: 'Pure sprinter. Has won this village sign sprint 34 times. Counts them.',
    taunt: 'Last 200 meters are MINE. The first ones too, probably.',
    defeatLine: 'Photo finish? No... that was clean. Respect.',
    raceTaunts: { pass: 'Number 35, coming up!', passed: 'Too early. TOO EARLY!' },
    raceType: 'SPRINT',
    stats: { topSpeed: 14.6, accel: 13, boostUse: 0.9 },
    look: {
      jersey: 0x2ecc71,
      shorts: 0x1c1f2e,
      helmet: 0x2ecc71,
      skin: 0xf0b58a,
      frame: 0x1c1f2e,
      headScale: 1.05,
      torsoWidth: 1.2,
      smile: false,
    },
    idleLatLon: [8, 4],
  },
  {
    id: 'windgaard',
    name: 'Jonas Windgaard',
    planet: 'tour',
    zone: 'alpe',
    bio: 'Glacial climber. Smiles once per season, usually at an 18% gradient.',
    taunt: 'The mountain decides. The mountain... likes me.',
    defeatLine: 'Hm. The mountain has chosen you. Today.',
    raceTaunts: { pass: 'The gradient... it calls me.', passed: 'Interesting. Very interesting.' },
    raceType: 'CLIMB',
    stats: { topSpeed: 12.9, accel: 10, boostUse: 0.6 },
    look: {
      jersey: 0xf5d547,
      shorts: 0x23263a,
      helmet: 0xffffff,
      skin: 0xffe4d6, // pale
      frame: 0xe8e8e8,
      headScale: 0.95,
      torsoWidth: 0.72, // skinny
      smile: false,
    },
    idleLatLon: [20, 215],
  },
  {
    id: 'vanart',
    name: 'Wout van Art',
    planet: 'tour',
    zone: 'pave',
    bio: 'Diesel engine. Rumor says he trains by towing tractors over cobbles.',
    taunt: 'Cobbles? I call this my massage sector.',
    defeatLine: 'Strong ride. Want a job pulling me around?',
    raceTaunts: { pass: 'Beep beep. Tractor coming.', passed: 'Nice. Now hold it for 600m.' },
    raceType: 'CLASSIC',
    stats: { topSpeed: 13.5, accel: 11.5, boostUse: 0.5 },
    look: {
      jersey: 0xe84545,
      shorts: 0x1c1f2e,
      helmet: 0xe84545,
      skin: 0xf0b58a,
      frame: 0x2b2f44,
      headScale: 1.0,
      torsoWidth: 1.35, // tank
      smile: false,
    },
    idleLatLon: [1.5, 176],
  },
  {
    id: 'taddypog',
    name: 'Taddy Pog',
    planet: 'tour',
    zone: 'sunflowers',
    bio: 'Good at everything. Annoyingly cheerful about it. The boss.',
    taunt: 'Race? Fun! I love fun. I also love winning. Mostly winning.',
    defeatLine: 'WOW! Okay okay okay. Rematch. Tomorrow. Same planet?',
    raceTaunts: { pass: 'Wheee! This is FUN!', passed: 'Ooooh you are GOOD!' },
    raceType: 'BOSS',
    stats: { topSpeed: 14.3, accel: 12.5, boostUse: 0.8 },
    look: {
      jersey: 0xffffff,
      shorts: 0x23263a,
      helmet: 0xffd23f,
      skin: 0xf5c89e,
      frame: 0xffd23f,
      headScale: 1.18, // big happy head
      torsoWidth: 1.0,
      smile: true, // the enormous grin
    },
    idleLatLon: [16, 93],
  },
];

export const TOUR_RIVALS = RIVALS.filter((r) => r.planet === 'tour');
