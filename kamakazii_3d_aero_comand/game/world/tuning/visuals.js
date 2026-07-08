/* game/world/tuning/visuals.js
   Extracted from shared.js TUNING — visual, sky, ground, cloud,
   and strip constants.
*/

export const VISUAL_TUNING = {
  // Ground strips
  STRIP_COUNT: 30,
  STRIP_SPACING: 50,

  // Clouds
  CLOUD_COUNT: 14,
  CLOUD_DRIFT: 1.4,
  CLOUD_COLOR: 0xffffff,

  // Palette
  GROUND_COLOR: 0x43d65a,
  STRIP_COLOR: 0x36b84a,
  SKY_COLOR: 0x87ceeb,
  NIGHT_SKY_COLOR: 0x03122b,
  NIGHT_GROUND_COLOR: 0x223322,

  // Fog
  NIGHT_FOG_NEAR: 40,
  NIGHT_FOG_FAR: 200,
  DAY_FOG_NEAR: 60,
  DAY_FOG_FAR: 240,
};
