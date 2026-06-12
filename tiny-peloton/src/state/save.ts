/**
 * Save system (P12) — the ONLY module allowed to touch localStorage.
 * - Versioned schema with a migration chain (future-proof).
 * - Debounced auto-save on any store change (race results, equips, settings).
 * - Corrupt saves never crash the game: they fall back to a fresh save.
 * - v2-ready: plain JSON, stable ids, no Three.js references — the same
 *   payload can later sync to Supabase.
 */
import { gameStore, type ProgressState } from './store';
import type { QualityTier } from '../core/quality';

const STORAGE_KEY = 'tiny-peloton-save-v1';
export const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 600;

export interface SaveSettings {
  quality: QualityTier | 'auto';
  reduceShake: boolean;
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface SaveData {
  version: number;
  savedAt: string; // ISO date — handy for debugging / future cloud merge
  progress: ProgressState;
  settings: SaveSettings;
}

/** version → upgrade function (applied in sequence). */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => void> = {
  // 1 → 2 example for the future:
  // 1: (raw) => { raw.progress.newField = defaultValue; },
};

function defaultSettings(): SaveSettings {
  return { quality: 'auto', reduceShake: false, musicVolume: 1, sfxVolume: 1, muted: false };
}

function isValid(data: unknown): data is SaveData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'number') return false;
  const p = d.progress as Record<string, unknown> | undefined;
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.wins === 'object' &&
    Array.isArray(p.owned)
  );
}

/** Reads + migrates the save. Corrupt or missing → null (fresh game). */
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!isValid(data)) return null;
    for (let v = data.version; v < SCHEMA_VERSION; v++) {
      MIGRATIONS[v]?.(data as unknown as Record<string, unknown>);
      data.version = v + 1;
    }
    return data;
  } catch {
    return null; // corrupt JSON / storage unavailable → fresh save
  }
}

export function buildSave(): SaveData {
  const s = gameStore.getState();
  return {
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    progress: {
      wins: s.wins,
      bestTimes: s.bestTimes,
      owned: s.owned,
      equipped: s.equipped,
    },
    settings: {
      quality: s.quality,
      reduceShake: s.reduceShake,
      musicVolume: s.musicVolume,
      sfxVolume: s.sfxVolume,
      muted: s.muted,
    },
  };
}

export function writeSave(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSave()));
  } catch {
    // Storage full / private mode — play on without persistence.
  }
}

function applySave(save: SaveData): void {
  const settings = { ...defaultSettings(), ...save.settings };
  gameStore.setState({
    wins: save.progress.wins ?? {},
    bestTimes: save.progress.bestTimes ?? {},
    owned: save.progress.owned ?? [],
    equipped: save.progress.equipped ?? {},
    quality: settings.quality,
    reduceShake: settings.reduceShake,
    musicVolume: settings.musicVolume,
    sfxVolume: settings.sfxVolume,
    muted: settings.muted,
  });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Loads the save into the store and starts debounced auto-saving.
 * Call once at boot, BEFORE the Game is constructed (quality setting
 * must be known by then).
 */
export function initSaveSystem(): void {
  const save = loadSave();
  if (save) applySave(save);

  gameStore.subscribe(() => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeSave();
    }, SAVE_DEBOUNCE_MS);
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => writeSave());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') writeSave(); // mobile tab switch
    });
  }
}

/**
 * Wipes progress (keeps settings). The caller is responsible for the
 * double-confirmation UI (settings screen, P17).
 */
export function resetProgress(): void {
  gameStore.setState({ wins: {}, bestTimes: {}, owned: [], equipped: {} });
  writeSave();
}
