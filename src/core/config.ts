/**
 * Central gameplay tuning panel.
 * Every gameplay-feel constant lives here so iteration is one-file-only.
 * NOTE: keep this a plain object (no `as const`) — fields are reassigned
 * by debug tooling and literal types would break the Player.
 */
export const CONFIG = {
  planet: {
    radius: 60,
  },

  road: {
    width: 3.4, // meters
    lift: 0.06, // ribbon height above terrain
    samples: 1024,
  },

  player: {
    maxSpeed: 13.5, // m/s (display is scaled — see hud.ts)
    accel: 11,
    brakeDecel: 30,
    friction: 5, // proportional drag applied at max speed
    slopeSpeedPenalty: 2.6, // top-speed loss per unit uphill grade (arcade climb)
    downhillBonus: 0.9, // extra top speed per unit downhill grade
    slopeAccel: 9, // gravity along the surface gradient
    steerRate: 2.3, // rad/s at full steer
    steerHighSpeedFactor: 0.6, // steering authority kept at top speed
    snapHeight: 4, // raycast start height above estimated surface
    normalSmoothing: 12, // how fast "up" adapts to terrain (1/s)
  },

  boost: {
    multiplier: 1.6, // +60% top speed
    duration: 1.5, // seconds
    fillPerSecond: 0.1, // bar fill rate while pedaling (0..1)
    startCharge: 0.6, // first-session friendliness
    fovKick: 11, // extra FOV degrees while boosting
    shake: 0.3, // screen shake magnitude on activation
  },

  bike: {
    wheelRadius: 0.55,
    leanAngle: 0.55, // max roll in curves (rad)
    wheelieAngle: 0.38, // pitch-up on boost start (rad)
    cadenceFactor: 0.55, // pedal speed relative to wheel speed
    paveShake: 0.07, // cobblestone vibration amplitude
  },

  camera: {
    distance: 9.5,
    height: 4.6,
    lookAhead: 2.2,
    lookUp: 1.5,
    damping: 5.5, // positional smoothing (1/s)
    upDamping: 6.0,
    fovBase: 62,
    fovSpeedGain: 13, // extra FOV at max speed
  },

  ai: {
    basePace: 0.86, // rival cruise fraction of their topSpeed
    rubberSlowMax: 0.08, // max slowdown when ahead (honest cap)
    rubberPushMax: 0.05, // max push when behind
    rubberStartGap: 8, // meters of gap before rubber-banding engages
    rubberRange: 100, // meters over which the effect ramps to its cap
    boostFill: 0.14, // AI boost bar fill per second
    rematchStatStep: 0.12, // difficulty step per rematch level
    firstRaceEase: 0.92, // first race vs each rival is beginner-friendly
  },

  race: {
    gateSpacing: 70, // meters between checkpoint gates
    gateRadius: 4.5, // pass detection radius
    gateMissMargin: 28, // meters past a gate before soft reset
    sprintMeters: 130, // SPRINT route length ending at the arch
    countdownSeconds: 3,
  },

  fx: {
    trailLength: 36,
    dustMax: 64,
    speedLineCount: 26,
  },
};

export type Config = typeof CONFIG;
