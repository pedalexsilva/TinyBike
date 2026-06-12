/**
 * Data-driven rewards (P11).
 * Beating a rival grants a cosmetic piece in their palette; the rematch
 * grants a second, better one. Beating all normal rivals of a planet
 * unlocks the BOSS; beating the boss grants the planet JERSEY — the
 * ultimate wearable trophy (yellow for Tour).
 */
import { RIVALS } from '../entities/rivals';

export type ItemCategory = 'jersey' | 'helmet' | 'glasses' | 'frame' | 'wheels';
export type Rarity = 'common' | 'rare' | 'legendary';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  /** Primary color used by the garage preview / model swap (P13). */
  color: number;
  /** Rival the item comes from (garage shows "Beat <name>"). */
  source: string;
}

export const ITEMS: ItemDef[] = [
  // Marc Cannondish (SPRINT)
  {
    id: 'helmet-sprint-green',
    name: 'Sprint Green Helmet',
    category: 'helmet',
    rarity: 'rare',
    color: 0x2ecc71,
    source: 'cannondish',
  },
  {
    id: 'jersey-green',
    name: 'Green Points Jersey',
    category: 'jersey',
    rarity: 'rare',
    color: 0x2ecc71,
    source: 'cannondish',
  },
  // Jonas Windgaard (CLIMB)
  {
    id: 'frame-glacier',
    name: 'Glacier Frame',
    category: 'frame',
    rarity: 'rare',
    color: 0xe8f4ff,
    source: 'windgaard',
  },
  {
    id: 'helmet-polka',
    name: 'Polka Dot Helmet',
    category: 'helmet',
    rarity: 'rare',
    color: 0xff5d5d,
    source: 'windgaard',
  },
  // Wout van Art (CLASSIC)
  {
    id: 'glasses-cobble',
    name: 'Cobble Crusher Shades',
    category: 'glasses',
    rarity: 'rare',
    color: 0xe84545,
    source: 'vanart',
  },
  {
    id: 'frame-rouge',
    name: 'Rouge Diesel Frame',
    category: 'frame',
    rarity: 'rare',
    color: 0xe84545,
    source: 'vanart',
  },
  // Taddy Pog (BOSS) — the trophy.
  {
    id: 'jersey-yellow',
    name: 'Yellow Jersey',
    category: 'jersey',
    rarity: 'legendary',
    color: 0xffd23f,
    source: 'taddypog',
  },
];

/** winNumber is 1-based: 1 = first victory, 2 = first rematch, ... */
const REWARD_TABLE: Record<string, string[]> = {
  cannondish: ['helmet-sprint-green', 'jersey-green'],
  windgaard: ['frame-glacier', 'helmet-polka'],
  vanart: ['glasses-cobble', 'frame-rouge'],
  taddypog: ['jersey-yellow'],
};

export function itemById(id: string): ItemDef | null {
  return ITEMS.find((i) => i.id === id) ?? null;
}

export function rewardForWin(rivalId: string, winNumber: number): ItemDef | null {
  const list = REWARD_TABLE[rivalId];
  if (!list) return null;
  const id = list[winNumber - 1];
  return id ? itemById(id) : null;
}

/** The boss opens once every normal rival of the planet has been beaten. */
export function bossUnlocked(
  wins: Record<string, number>,
  planet: 'tour' | 'giro' | 'vuelta' = 'tour',
): boolean {
  return RIVALS.filter((r) => r.planet === planet && r.raceType !== 'BOSS').every(
    (r) => (wins[r.id] ?? 0) > 0,
  );
}
