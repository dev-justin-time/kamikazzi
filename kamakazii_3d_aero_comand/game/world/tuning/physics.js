/* game/world/tuning/physics.js
   Extracted from shared.js TUNING — physics, world bounds, movement,
   spawn cadence, dt convention, collision/near-miss, and propeller.
*/

export const PHYSICS_TUNING = {
  // World bounds
  BOUND_X: 34,
  BOUND_Y_MIN: -4,
  BOUND_Y_MAX: 16,

  // Speed & movement
  SPEED_PER_LEVEL: [0.30, 0.45, 0.65, 0.85, 1.05, 1.25, 1.45, 1.60],
  SPEED_RAMP: 0.00010,
  BASE_SPEED: 0.30,

  // Spawn cadence
  SPAWN_INTERVAL: 26,
  MIN_SPAWN_INTERVAL: 10,
  SPAWN_SPEED_PRESSURE: 4,
  INITIAL_BUILDINGS: 6,

  // Score & level progression
  SCORE_GAIN: 1.0,
  LEVEL_LENGTH_MULT: 1.12,
  BUILD_PASS_BONUS: 5,
  BUILD_DRIFT_FACTOR: 2.2,
  GENERATION_END_Z: 30,
  GENERATION_START_Z: -200,

  // dt convention
  DT_HZ: 60,
  MAX_DT_RAW: 0.1,

  // Near-miss / bullet-time
  NEAR_MISS_TIME_SCALE: 0.4,
  NEAR_MISS_DURATION_MS: 1200,

  // Networking
  PRESENCE_INTERVAL_S: 0.25,

  // Propeller HUD lock
  PROPELLER_DISTANCE: 4.0,
};
