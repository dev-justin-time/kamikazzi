/* game/controls/shared.js
   Responsibility: shared state, HUD pill, mode-lock, and helpers
   used by all input modules (keyboard, touch, joystick, gyro).
*/
import { TUNING } from '../world/shared.js';

/**
 * Creates the shared input state and HUD pill.
 * Returns an object with { state (mutated onto world.state), pill, setMode,
 * noteInput, bumpLastInput, pollRunningTimer }.
 * @param {object} world
 */
export function createInputShared({ world }) {
  const state = world.state;

  // ---- mode-lock state ----
  state.inputSource = 'none';
  state.lastInputAt = 0;
  const IDLE_RELEASE_MS = 2500;

  // ---- HUD pill ----
  const pill = document.createElement('div');
  pill.id = 'inputPill';
  pill.style.position = 'fixed';
  pill.style.top = '80px';
  pill.style.right = '18px';
  pill.style.padding = '6px 14px';
  pill.style.background = 'rgba(0,0,0,0.55)';
  pill.style.color = '#fff';
  pill.style.borderRadius = '999px';
  pill.style.fontFamily = "'Stick No Bills', sans-serif";
  pill.style.fontSize = '12px';
  pill.style.fontWeight = '700';
  pill.style.letterSpacing = '1.5px';
  pill.style.textTransform = 'uppercase';
  pill.style.zIndex = '30';
  pill.style.pointerEvents = 'none';
  pill.style.opacity = '0';
  pill.style.transition = 'opacity 0.2s ease';
  pill.style.backdropFilter = 'blur(4px)';
  pill.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  document.body.appendChild(pill);

  // Narrow-screen nudge
  let mq = null;
  function applyPillScreenStyle() {
    if (!mq) mq = window.matchMedia('(max-width: 480px)');
    if (mq.matches) {
      pill.style.top = 'auto';
      pill.style.right = 'auto';
      pill.style.left = '50%';
      pill.style.bottom = '150px';
      pill.style.transform = 'translateX(-50%)';
      pill.style.fontSize = '11px';
    } else {
      pill.style.top = '80px';
      pill.style.right = '18px';
      pill.style.left = '';
      pill.style.bottom = '';
      pill.style.transform = '';
      pill.style.fontSize = '12px';
    }
  }
  applyPillScreenStyle();
  window.addEventListener('resize', applyPillScreenStyle);

  function setMode(mode, label) {
    if (state.inputSource === mode) return;
    state.inputSource = mode;
    if (mode === 'none') {
      pill.style.opacity = '0';
    } else {
      pill.textContent = label;
      pill.style.opacity = '1';
    }
  }

  function noteInput(source, label) {
    state.lastInputAt = performance.now();
    setMode(source, label);
  }

  function bumpLastInput() {
    state.lastInputAt = performance.now();
  }

  // Expose to gyro module for idle-release checks
  const shared = { state, pill, IDLE_RELEASE_MS, setMode, noteInput, bumpLastInput };

  // ---- per-run reset poller ----
  let wasRunning = false;
  // onRunStart callback is set by the gyro module later
  let _onRunStart = null;
  shared.onRunStart = function (fn) { _onRunStart = fn; };

  function pollRunningTimer() {
    if (state.running && !wasRunning) {
      setMode('none', '');
      if (_onRunStart) _onRunStart();
    }
    wasRunning = state.running;
    requestAnimationFrame(pollRunningTimer);
  }
  requestAnimationFrame(pollRunningTimer);

  return shared;
}
