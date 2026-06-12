/**
 * Tour zone/road compat layer. The actual data lives in planet-def.ts
 * (TOUR_DEF) — these exports keep Tour-specific modules (tour-props,
 * dressing, race anchors) working unchanged.
 */
import * as THREE from 'three';
import { TOUR_DEF, buildRuntimeZones } from './planet-def';

export { dirFromLatLon, angularDistance } from '../core/spherical';

export type ZoneId = string;

export interface Zone {
  id: ZoneId;
  center: THREE.Vector3;
  /** Angular radius (radians). */
  radius: number;
}

const runtime = buildRuntimeZones(TOUR_DEF);

export const ZONES: Record<string, Zone> = Object.fromEntries(
  runtime.map((z) => [z.id, { id: z.id, center: z.center, radius: z.radius }]),
);

export const ROAD_CONTROL_LATLON = TOUR_DEF.roadControlLatLon;
