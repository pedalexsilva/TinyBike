/**
 * Tiny dependency-free 3D value noise + fbm.
 * Deterministic (seeded) so planets are stable between sessions.
 */

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed + x * 374761393 + y * 668265263 + z * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise in [-1, 1]. */
export function noise3(x: number, y: number, z: number, seed = 1337): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const zf = smooth(z - zi);

  let result = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w =
          (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
        result += w * hash3(xi + dx, yi + dy, zi + dz, seed);
      }
    }
  }
  return result * 2 - 1;
}

/** Fractal Brownian motion, output roughly in [-1, 1]. */
export function fbm3(
  x: number,
  y: number,
  z: number,
  octaves = 4,
  seed = 1337,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return sum / norm;
}
