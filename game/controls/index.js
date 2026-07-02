/* game/controls/index.js
   Responsibility: compose all input modules (keyboard, touch, joystick, gyro)
   into a single `setupInput()` function, re-exported for game/main.js.

   Each module is self-contained and receives { domElement, world, shared }
   so they don't need to know about each other.
*/
import { TUNING } from '../world/shared.js';
import { createInputShared } from './shared.js';
import { setupKeyboard } from './keyboard.js';
import { setupTouch } from './touch.js';
import { setupJoystick } from './joystick.js';
import { setupGyro } from './gyro.js';

/**
 * @param {{ domElement: HTMLElement, world: object }} opts
 */
export function setupInput({ domElement, world }) {
  // Attach TUNING to world so sub-modules can read bounds without re-importing
  world.TUNING = TUNING;

  // Create shared state, pill HUD, and mode-lock helpers
  const shared = createInputShared({ world });

  // Set up each input type — they all mutate world.state.target
  setupKeyboard({ world, shared });
  setupTouch({ domElement, world, shared });
  setupJoystick({ world, shared });
  setupGyro({ world, shared });

  // No return value needed — all modules talk through world.state
}
