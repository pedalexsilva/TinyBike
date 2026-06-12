/**
 * Global game state (Zustand vanilla store).
 * Holds settings + progression + inventory. P12's save.ts will serialize
 * the ProgressState slice — per project conventions, nothing else may
 * touch localStorage.
 */
import { createStore } from 'zustand/vanilla';
import type { QualityTier } from '../core/quality';
import type { ItemCategory } from '../race/rewards';

export interface ProgressState {
  /** Victories per rival id (drives rematch difficulty + boss unlock). */
  wins: Record<string, number>;
  /** Best race time per rival id (seconds). */
  bestTimes: Record<string, number>;
  /** Owned cosmetic item ids. */
  owned: string[];
  /** Equipped item id per category. */
  equipped: Partial<Record<ItemCategory, string>>;
}

export interface GameState extends ProgressState {
  quality: QualityTier | 'auto';
  reduceShake: boolean;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  recordWin: (rivalId: string, time: number) => void;
  addItem: (id: string) => void;
  equip: (category: ItemCategory, itemId: string | undefined) => void;
  setQuality: (q: QualityTier | 'auto') => void;
  setReduceShake: (v: boolean) => void;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setMuted: (v: boolean) => void;
}

export const gameStore = createStore<GameState>((set) => ({
  quality: 'auto',
  reduceShake: false,
  musicVolume: 1,
  sfxVolume: 1,
  muted: false,
  wins: {},
  bestTimes: {},
  owned: [],
  equipped: {},

  recordWin: (rivalId, time) =>
    set((s) => ({
      wins: { ...s.wins, [rivalId]: (s.wins[rivalId] ?? 0) + 1 },
      bestTimes: {
        ...s.bestTimes,
        [rivalId]: Math.min(s.bestTimes[rivalId] ?? Number.POSITIVE_INFINITY, time),
      },
    })),

  addItem: (id) =>
    set((s) => (s.owned.includes(id) ? s : { owned: [...s.owned, id] })),

  equip: (category, itemId) =>
    set((s) => ({ equipped: { ...s.equipped, [category]: itemId } })),

  setQuality: (quality) => set({ quality }),
  setReduceShake: (reduceShake) => set({ reduceShake }),
  setMusicVolume: (musicVolume) => set({ musicVolume }),
  setSfxVolume: (sfxVolume) => set({ sfxVolume }),
  setMuted: (muted) => set({ muted }),
}));
