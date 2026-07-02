/* game/controls/keyboard.js
   Responsibility: keyboard input handling using velocity-style nudge.
   Each frame, moves state.target by a small step while a key is held.
*/
import { clamp } from '../world/shared.js';

export function setupKeyboard({ world, shared }) {
  const { state, noteInput } = shared;
  const BOUND_X = world.TUNING?.BOUND_X || 34;
  const BOUND_Y_MIN = world.TUNING?.BOUND_Y_MIN ?? -4;
  const BOUND_Y_MAX = world.TUNING?.BOUND_Y_MAX ?? 16;

  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  function applyKeyInputs() {
    if (!state.running) { requestAnimationFrame(applyKeyInputs); return; }
    let didPress = false;
    if (keys['arrowleft'] || keys['a'])  { state.target.x -= 0.9; didPress = true; }
    if (keys['arrowright'] || keys['d']) { state.target.x += 0.9; didPress = true; }
    if (keys['arrowup'] || keys['w'])    { state.target.y += 0.6; didPress = true; }
    if (keys['arrowdown'] || keys['s'])  { state.target.y -= 0.6; didPress = true; }
    if (didPress) noteInput('keyboard', '⌨ Keys');
    if (state.inputSource === 'keyboard') {
      state.target.x = clamp(state.target.x, -BOUND_X, BOUND_X);
      state.target.y = clamp(state.target.y, BOUND_Y_MIN, BOUND_Y_MAX);
    }
    requestAnimationFrame(applyKeyInputs);
  }
  requestAnimationFrame(applyKeyInputs);
}
