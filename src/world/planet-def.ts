/**
 * Planets as data (P14). A PlanetDef fully describes terrain, zones,
 * palette and road — creating the Vuelta should be mostly editing data.
 */
import * as THREE from 'three';
import { dirFromLatLon } from '../core/spherical';
import { CONFIG } from '../core/config';
import type { PlanetId } from '../entities/rivals';

export interface DomeDef {
  latLon: readonly [number, number];
  /** Angular radius (radians). */
  radius: number;
  height: number;
}

export interface ZoneDef {
  id: string;
  latLon: readonly [number, number];
  /** Angular radius (radians). */
  radius: number;
  /** Ground tint blended inside the zone. */
  tint: number;
  tintStrength: number;
}

export interface PlanetPalette {
  grass: number;
  grassDark: number;
  meadow: number;
  dirt: number;
  rock: number;
  snow: number;
  asphalt: number;
  cobble: number;
}

export type SectorId = 'france' | 'italia' | 'portugal';

/**
 * A national sector: a longitude arc of the loop themed after a Grand Tour.
 * Sectors are a cosmetic layer over the existing zones — they drive the
 * roadside banner, monument grouping and accent colours, nothing physical.
 */
export interface SectorDef {
  id: SectorId;
  /** Display name shown on the banner. */
  name: string;
  /** Country line shown under the name. */
  tour: string;
  flag: string;
  /** Longitude arc [start, end) in degrees, 0..360. */
  lonStart: number;
  lonEnd: number;
  /** Brand accent colour (hex). */
  accent: number;
}

export interface PlanetDef {
  id: PlanetId;
  seed: number;
  radius: number;
  snowHeight: number;
  domes: DomeDef[];
  zones: ZoneDef[];
  sectors: SectorDef[];
  /** Zone whose road segment gets the cobble tint + bike vibration. */
  paveZoneId: string | null;
  roadControlLatLon: ReadonlyArray<readonly [number, number]>;
  palette: PlanetPalette;
}

/** Sector containing a longitude (degrees). Falls back to the first sector. */
export function sectorForLon(def: PlanetDef, lonDeg: number): SectorDef {
  let lon = lonDeg % 360;
  if (lon < 0) lon += 360;
  for (const s of def.sectors) {
    if (s.lonStart <= s.lonEnd) {
      if (lon >= s.lonStart && lon < s.lonEnd) return s;
    } else {
      // wrap-around arc (e.g. 320 -> 40)
      if (lon >= s.lonStart || lon < s.lonEnd) return s;
    }
  }
  return def.sectors[0];
}

/** Sector containing a unit direction (matches dirFromLatLon's convention). */
export function sectorForDir(def: PlanetDef, dir: THREE.Vector3): SectorDef {
  const lon = (Math.atan2(dir.z, dir.x) * 180) / Math.PI;
  return sectorForLon(def, lon);
}

/** Runtime zone (precomputed center direction). */
export interface RuntimeZone {
  id: string;
  center: THREE.Vector3;
  radius: number;
  tint: THREE.Color;
  tintStrength: number;
}

export function buildRuntimeZones(def: PlanetDef): RuntimeZone[] {
  return def.zones.map((z) => ({
    id: z.id,
    center: dirFromLatLon(z.latLon[0], z.latLon[1]),
    radius: z.radius,
    tint: new THREE.Color(z.tint),
    tintStrength: z.tintStrength,
  }));
}

// ============================== TOUR ==============================
export const TOUR_DEF: PlanetDef = {
  id: 'tour',
  seed: 20260611,
  radius: CONFIG.planet.radius,
  snowHeight: 6.5,
  domes: [
    // The Alpe — the road switchbacks climb its flank.
    { latLon: [50, 242], radius: 0.85, height: 10 },
    // Rolling hills away from the road.
    { latLon: [-35, 60], radius: 0.6, height: 4 },
    { latLon: [-30, 250], radius: 0.55, height: 3.5 },
  ],
  zones: [
    { id: 'vila', latLon: [0, 0], radius: 0.3, tint: 0x6fcf55, tintStrength: 0.7 },
    { id: 'sunflowers', latLon: [13, 88], radius: 0.4, tint: 0xd8c84a, tintStrength: 0.85 },
    { id: 'pave', latLon: [-1, 172], radius: 0.4, tint: 0xc9bb7a, tintStrength: 0.75 },
    { id: 'alpe', latLon: [50, 242], radius: 0.62, tint: 0x8d9bb0, tintStrength: 0 },
  ],
  // National sectors mapped onto longitude arcs of the loop:
  //  France  — the vila finish + sunflower fields (Tour de France).
  //  Italia  — the white-gravel sector + the high mountain (Giro d'Italia).
  //  Portugal— the long valley home into the finish (Volta a Portugal).
  sectors: [
    { id: 'france', name: 'FRANCE', tour: 'Tour de France', flag: '🇫🇷', lonStart: 0, lonEnd: 115, accent: 0x2b5fbf },
    { id: 'italia', name: 'ITALIA', tour: "Giro d'Italia", flag: '🇮🇹', lonStart: 115, lonEnd: 260, accent: 0xe0407a },
    { id: 'portugal', name: 'PORTUGAL', tour: 'Volta a Portugal', flag: '🇵🇹', lonStart: 260, lonEnd: 360, accent: 0x16793f },
  ],
  paveZoneId: 'pave',
  roadControlLatLon: [
    [0, 0], // vila — finish arch
    [4, 13],
    [-11, 27], // rolling meanders out of the vila
    [10, 43],
    [-8, 57],
    [7, 71],
    [14, 88], // sunflower fields
    [7, 104],
    [-10, 119], // dip toward the equator
    [6, 134],
    [-8, 149],
    [-2, 161], // pavé sector start
    [4, 172],
    [-5, 183],
    [3, 194],
    [-2, 205], // pavé sector end
    [6, 214],
    [13, 223], // foothills
    [21, 233], // hairpin 1
    [27, 221], // hairpin 2
    [33, 236], // hairpin 3
    [38, 224], // hairpin 4
    [43, 239], // hairpin 5
    [46, 227], // hairpin 6
    [48, 243], // summit flank — Alpe high point
    [41, 257], // switchback descent
    [31, 250],
    [24, 265],
    [14, 258],
    [5, 273],
    [-10, 288], // valley meanders home
    [8, 303],
    [-12, 319],
    [7, 334],
    [-5, 348],
  ],
  palette: {
    grass: 0x478f33,
    grassDark: 0x326b23,
    meadow: 0x5cb543,
    dirt: 0xa68b4c,
    rock: 0x616e7d,
    snow: 0xfbfdff,
    asphalt: 0x333b47,
    cobble: 0x7c654e,
  },
};
