/* game/controls/touch.js
   Responsibility: relative touch/pointer drag input.
   At pointerdown, anchors the current finger position + state.target position.
   pointermove slides the target relative to that anchor — feels like a
   smartphone flight game, not a teleport.
*/
import { clamp } from '../world/shared.js';

export function setupTouch({ domElement, world, shared }) {
  const { state, noteInput, bumpLastInput } = shared;
  const BOUND_X = world.TUNING?.BOUND_X || 34;
  const BOUND_Y_MIN = world.TUNING?.BOUND_Y_MIN ?? -4;
  const BOUND_Y_MAX = world.TUNING?.BOUND_Y_MAX ?? 16;
  const Y_RANGE = BOUND_Y_MAX - BOUND_Y_MIN;

  let dragging = false;
  let dragAnchor = { x: 0, y: 0, targX: 0, targY: 0 };

  domElement.addEventListener('pointerdown', e => {
    if (!state.running) return;
    if (e.target && e.target.dataset && e.target.dataset.joy) return;
    noteInput('touch', '👆 Touch');
    dragging = true;
    dragAnchor = { x: e.clientX, y: e.clientY, targX: state.target.x, targY: state.target.y };
  });

  domElement.addEventListener('pointermove', e => {
    if (!state.running || !dragging || state.inputSource !== 'touch') return;
    bumpLastInput();
    const dx = e.clientX - dragAnchor.x;
    const dy = e.clientY - dragAnchor.y;
    state.target.x = dragAnchor.targX + (dx / window.innerWidth) * BOUND_X * 2.5;
    state.target.y = dragAnchor.targY - (dy / window.innerHeight) * Y_RANGE * 1.5;
    state.target.x = clamp(state.target.x, -BOUND_X - 4, BOUND_X + 4);
    state.target.y = clamp(state.target.y, BOUND_Y_MIN - 2, BOUND_Y_MAX + 2);
  });

  function endDrag() { dragging = false; }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}
