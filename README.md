# Tiny Peloton 🚴

A third-person browser arcade cycling game on tiny, cozy spherical planets, styled with saturated cel-shaded visuals. Ride across beautiful landscapes, challenge parodied cycling legends, earn iconic jerseys, and customize your rider in the Garage!

Built with **Vite, TypeScript, Three.js, three-mesh-bvh, Zustand, GSAP, and native Web Audio API**.

---

## 🎮 Game Pillars & Features

1. **Wonder First**: Rich cel-shaded visual pipeline with stylized sky shaders, outlines, and saturated color palettes tailored to each planet.
2. **Arcade Physics & Controls**: Auto-pedal touch controls (mobile virtual joystick) and keyboard controls (desktop WASD/Arrows) with instant drift, wheelies, and boost sweeps.
3. **Caricatured Rivals**: Ten parodied professional cycling legends (e.g. Marc Cannondish, Jonas Windgaard, Taddy Pog) with custom looks and personality-driven AIs.
4. **Data-Driven Progression**: Unlock custom jerseys, helmets, and components in the Garage by defeating rivals. Progress is auto-saved locally.
5. **Procedural Web Audio**: Real-time sound synthesis (wind, pedaling, boosts, chimes, fanfares, and ambient exploration loops) with zero asset footprints.

---

## 🛠️ Commands

```bash
# Install dependencies
npm install

# Start local development server with HMR
npm run dev

# Start dev server exposing network IP (for testing on mobile devices)
npm run dev -- --host

# Type-check + compile production bundle
npm run build

# Preview locally Compiled production build
npm run preview
```

---

## 📐 Architecture & Math Invariants

* **Spherical Physics**: Gravity vectors point directly to the planet center. The player's vertical axis is dynamically snapped and aligned to the local surface normal using Quaternions, avoiding Euler-angle singular poles (Gimbal lock).
* **Collision Detection**: Collision checks use `three-mesh-bvh` raycasts to snap the player, NPCs, and props to the terrain, facilitating high-performance slopes and switchbacks.
* **Zero Allocation Game Loop**: To maintain a stable 60 FPS target on mid-range mobile devices, all temporary vectors, quaternions, and matrices are pooled at the module level—preventing Garbage Collection stuttering.
* **Volume Settings & Saves**: Progression state, cosmetic custom choices, and volumes are managed using Zustand and serialized cleanly to `localStorage` with migration triggers.

---

## 📁 Directory Structure

```
src/
  ├── audio/      # Web Audio API manager & sound synthesis loops
  ├── core/       # Game loop, third-person camera, input, quality settings, physics math
  ├── entities/   # Player physics, procedural bike model, NPC rivals
  ├── fx/         # Pooled particle FX (dust, tire trails, speed lines)
  ├── race/       # RaceManager state machine, AI rubber-banding, gate systems, rewards
  ├── render/     # Cel-shaded toon material, inverted-hull outlines
  ├── state/      # Zustand store, save/load migrations
  ├── ui/         # HTML overlay HUD, challenge panels, pause controls, title, garage UI
  ├── world/      # Planet icosphere generation, instanced props, sky/sol rendering
  └── main.ts     # Main application bootloader
```

---

## 🧭 How to Add New Content (Data-Driven Guide)

Tiny Peloton is designed with a highly modular, data-driven architecture. Adding new content requires zero modifications to the core physics or rendering loop.

### How to Add a New Rival
Open `src/entities/rivals.ts` and append a new `RivalDef` object to the `RIVALS` array:

```typescript
{
  id: 'parody-name',
  name: 'Parody Name',
  planet: 'tour',           // 'tour' | 'giro' | 'vuelta'
  zone: 'vila',             // Spawn zone
  bio: 'A hilarious parody description goes here.',
  taunt: 'Prepare to taste my dust!',
  defeatLine: 'Impossible! I was supposed to win...',
  raceTaunts: { pass: 'Beep beep!', passed: 'Wait, come back!' },
  raceType: 'CLIMB',        // 'SPRINT' | 'CLIMB' | 'CLASSIC' | 'BOSS'
  stats: { topSpeed: 14.0, accel: 11.5, boostUse: 0.75 },
  look: {
    jersey: 0xff00ff,
    shorts: 0x111111,
    helmet: 0xff00ff,
    skin: 0xffe0bd,
    frame: 0xff00ff,
    glasses: 0x1c1f2e,
    wheels: 0xcccccc,
    headScale: 1.1,         // Caricature head size scale
    torsoWidth: 0.9,        // Skinny/heavy body scale
    smile: true,
  },
  idleLatLon: [15, 45],     // Spawn coordinates on the sphere
}
```

### How to Add a New Planet
1. **Extend Planet Data**: Add the new planet identifier to `PlanetId` type in `src/entities/rivals.ts`.
2. **Implement Terrain & Props**: Customize terrain color bands, heights (domes), and vegetation instancing in `src/world/planet.ts` and `src/world/props.ts` when your new planet is active.
3. **Configure Rivals**: Define at least 3 standard rivals and 1 BOSS rival bound to the new planet ID.

---

## 🚀 Future Roadmap (V2)

* **Async Ghost Race (Supabase)**: Record compressed physics replays of players' personal best runs and allow racing against ghosts in real-time.
* **Global Leaderboards**: Secure, anti-cheat validated online leaderboards for each planet segment.
* **Drafting Mechanic**: Tucking behind a rival's rear wheel reduces drag and accelerates boost bar charging.
* **Real-time Multiplayer**: WebSockets-driven space lobbies, allowing players to explore planets together and emote in real-time.
* **Daily Challenges**: Segments generated dynamically from a daily random seed with 24-hour leaderboards.
