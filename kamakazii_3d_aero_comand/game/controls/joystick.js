/* game/controls/joystick.js
   Responsibility: on-screen virtual joystick (bottom-left corner).
   Dragging the knob maps to state.target for steering.
*/
import { clamp } from '../world/shared.js';

export function setupJoystick({ world, shared }) {
  const { state, noteInput, bumpLastInput } = shared;
  const BOUND_X = world.TUNING?.BOUND_X || 34;
  const BOUND_Y_MIN = world.TUNING?.BOUND_Y_MIN ?? -4;
  const BOUND_Y_MAX = world.TUNING?.BOUND_Y_MAX ?? 16;
  const Y_RANGE = BOUND_Y_MAX - BOUND_Y_MIN;

  const joystickSize = 110;
  const knobSize = 46;
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '14px';
  container.style.bottom = '18px';
  container.style.width = joystickSize + 'px';
  container.style.height = joystickSize + 'px';
  container.style.borderRadius = '999px';
  container.style.background = 'rgba(0,0,0,0.18)';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.zIndex = '30';
  container.style.touchAction = 'none';
  container.style.userSelect = 'none';
  container.style.backdropFilter = 'blur(4px)';
  container.dataset.joy = '1';

  const knob = document.createElement('div');
  knob.style.width = knobSize + 'px';
  knob.style.height = knobSize + 'px';
  knob.style.borderRadius = '999px';
  knob.style.background = 'linear-gradient(180deg,#ffffff,#d9d9d9)';
  knob.style.boxShadow = '0 6px 18px rgba(0,0,0,0.35)';
  knob.style.transform = 'translate(0px,0px)';
  knob.style.transition = 'transform 0.02s linear';
  knob.dataset.joy = '1';

  container.appendChild(knob);
  document.body.appendChild(container);

  let active = false;
  let startX = 0;
  let startY = 0;

  function onStart(e) {
    if (!state.running) return;
    noteInput('joystick', '🕹 Joystick');
    active = true;
    const p = (e.touches && e.touches[0]) || e;
    startX = p.clientX; startY = p.clientY;
    e.preventDefault && e.preventDefault();
  }

  function onMove(e) {
    if (!active || !state.running || state.inputSource !== 'joystick') return;
    bumpLastInput();
    const p = (e.touches && e.touches[0]) || e;
    const dx = p.clientX - startX;
    const dy = p.clientY - startY;
    const maxR = (joystickSize - knobSize) / 2;
    const nx = clamp(dx / maxR, -1, 1);
    const ny = clamp(dy / maxR, -1, 1);
    knob.style.transform = `translate(${nx * maxR}px, ${ny * maxR}px)`;
    state.target.x = nx * BOUND_X;
    state.target.y = clamp(2 - (-ny) * (Y_RANGE * 0.6), BOUND_Y_MIN, BOUND_Y_MAX);
    e.preventDefault && e.preventDefault();
  }

  function onEnd() {
    active = false;
    knob.style.transform = 'translate(0px,0px)';
  }

  container.addEventListener('pointerdown', onStart, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onEnd);
  container.addEventListener('touchstart', onStart, { passive: false });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd);
}
