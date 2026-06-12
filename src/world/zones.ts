/**
 * Tour planet zone layout (data-driven — Giro/Vuelta will reuse the shapes).
 * Zones are angular regions on the unit sphere; the road control points
 * link all four in a closed loop with a hairpin climb up the Alpe.
 */
import * as THREE from 'three';

export function dirFromLatLon(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon),
  );
}

export type ZoneId = 'vila' | 'sunflowers' | 'pave' | 'alpe';

export interface Zone {
  id: ZoneId;
  center: THREE.Vector3;
  /** Angular radius (radians). */
  radius: number;
}

export const ZONES: Record<ZoneId, Zone> = {
  vila: { id: 'vila', center: dirFromLatLon(0, 0), radius: 0.3 },
  sunflowers: { id: 'sunflowers', center: dirFromLatLon(13, 88), radius: 0.4 },
  pave: { id: 'pave', center: dirFromLatLon(-1, 172), radius: 0.4 },
  alpe: { id: 'alpe', center: dirFromLatLon(50, 242), radius: 0.62 },
};

export function angularDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
}

/**
 * Closed road loop as (lat, lon) control points, starting at the Vila
 * finish arch (t = 0). Meanders between zones; switchbacks on the Alpe.
 */
export const ROAD_CONTROL_LATLON: ReadonlyArray<readonly [number, number]> = [
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
];
