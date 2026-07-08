/* game/world/tuning/powerups.js
   Extracted from shared.js TUNING — all powerup-related constants.
   Five standard types (shield, boost, magnet, score2x, slowmo) plus
   one-shot stamina.
*/

export const POWERUP_TUNING = {
  POWERUP_SHIELD_INDEX: 0,

  // Pickup detection
  POWERUP_PICKUP_RADIUS: 1.6,

  // Duration windows (ms)
  POWERUP_SHIELD_MS: 3000,
  POWERUP_BOOST_MS: 4000,
  POWERUP_MAGNET_MS: 5000,
  POWERUP_SCORE2X_MS: 6000,
  POWERUP_SLOWMO_MS: 3000,
  POWERUP_STAMINA_MS: 1200,

  // Effect multipliers
  POWERUP_BOOST_MULT: 1.5,
  POWERUP_SCORE2X_MULT: 2,
  POWERUP_SLOWMO_SCALE: 0.4,

  // Magnet pull
  POWERUP_MAGNET_RADIUS: 12,
  POWERUP_MAGNET_PULL: 8,
};
