# Tiny Peloton 🚴

3D browser cycling game on tiny spherical planets — "Messenger"-style
(cozy + shareable), with arcade race adrenaline. **Phase 0–1 build** (P01–P05
of the dev plan): spherical physics, mobile/desktop controls, arcade bike
feel and the cel-shaded visual pipeline on the Tour test planet.

## Commands

```bash
npm install
npm run dev      # local dev server (use --host to test on your phone)
npm run build    # type-check + production build (dist/)
npm run preview  # serve the production build
```

## Controls

- **Desktop:** WASD / arrows to ride, SPACE or SHIFT to boost.
- **Mobile:** auto-pedal; drag on the left half to steer (floating joystick);
  big BOOST button on the right.

Boost fills slowly while pedaling; at 100% press boost for +60% speed,
FOV kick, speed lines, trail and a little wheelie.

## Architecture

```
src/
  core/      game loop, config (tuning panel), input, camera, spherical math, quality tiers, noise
  world/     procedural planet (icosphere + analytic height fn), sky dome, instanced props
  entities/  player controller (spherical physics), procedural bike + caricature rider
  race/      (P09+) race system
  fx/        trail, dust, speed lines — all pooled, zero alloc in the loop
  ui/        HTML HUD + touch controls
  state/     Zustand store; save.ts will own localStorage (P12)
  render/    toon material + outline helpers
```

Key invariants:

- **Spherical physics:** gravity points at the planet center; the player's
  "up" is the smoothed surface normal; orientation is quaternion-only
  (no Euler → no pole flips). Terrain snapping is a BVH raycast, so any
  relief works, not just perfect spheres.
- **Tuning:** every gameplay constant lives in `src/core/config.ts`.
- **Performance:** pooled temp vectors, instanced props, one-draw-call FX,
  quality tiers for mobile. Target: 60fps on a mid-range phone.

## Next (per PLANO-DEV-TINY-PELOTON-V1)

P06 Tour planet zones & road spline → P07 set dressing & musettes →
P08 rivals → P09–P11 races & rewards → P12–P13 save & garage →
P14–P16 Giro/Vuelta/hub → P17–P18 audio, PWA, deploy.
