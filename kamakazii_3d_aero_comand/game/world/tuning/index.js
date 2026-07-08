/* game/world/tuning/index.js
   Composes the unified TUNING object from 3 domain-specific files:
     - physics.js:   world bounds, speed, spawn, dt, collision, propeller
     - powerups.js:  all POWERUP_* constants (durations, multipliers, radii)
     - visuals.js:   strips, clouds, palette, fog constants

   Consumers import TUNING from './world/shared.js', which re-exports
   this object. Keeping the index separate means anyone who wants to
   import only one domain (e.g. only powerup tuning) can import
   directly from the domain file without pulling in unrelated constants.
*/

import { PHYSICS_TUNING } from './physics.js';
import { POWERUP_TUNING } from './powerups.js';
import { VISUAL_TUNING } from './visuals.js';

export const TUNING = {
  ...PHYSICS_TUNING,
  ...POWERUP_TUNING,
  ...VISUAL_TUNING,
};
