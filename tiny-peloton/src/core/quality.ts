/**
 * QualityManager: picks a rendering tier from device heuristics.
 * Affects pixel ratio, prop density and FX intensity. No heavy postprocess
 * is used at all (mobile-first); the vignette is a free CSS overlay.
 */
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  maxPixelRatio: number;
  treeCount: number;
  flowerCount: number;
  rockCount: number;
  fxEnabled: boolean;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  low: { maxPixelRatio: 1, treeCount: 60, flowerCount: 120, rockCount: 20, fxEnabled: false },
  medium: { maxPixelRatio: 1.5, treeCount: 110, flowerCount: 260, rockCount: 32, fxEnabled: true },
  high: { maxPixelRatio: 2, treeCount: 160, flowerCount: 420, rockCount: 44, fxEnabled: true },
};

export function detectQuality(forced?: QualityTier): QualitySettings {
  let tier: QualityTier;
  if (forced) {
    tier = forced;
  } else {
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (!coarse && cores >= 8) tier = 'high';
    else if (cores >= 6 && mem >= 4) tier = 'medium';
    else tier = coarse ? 'low' : 'medium';
  }
  return { tier, ...PRESETS[tier] };
}
