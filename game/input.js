/* game/input.js
   Responsibility: map keyboard + pointer input into world.state.target,
   adds mobile gyroscope steering and an on-screen joystick usable with touch
   and desktop mouse.

   Bounds come from /game/world/shared.js so input + world + PlaneController
   cannot drift apart.
*/
import { TUNING, clamp } from './world/shared.js';

export function setupInput({ domElement, world }) {
  const state = world.state;
  const BOUND_X = TUNING.BOUND_X;
  const BOUND_Y_MIN = TUNING.BOUND_Y_MIN;
  const BOUND_Y_MAX = TUNING.BOUND_Y_MAX;

  // --- keyboard handling (unchanged) ---
  const keys = {};
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  }, { passive: false });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // --- pointer steering (tap/drag across screen) ---
  function pointerSteer(clientX, clientY) {
    const nx = (clientX / window.innerWidth) * 2 - 1;
    const ny = (clientY / window.innerHeight) * 2 - 1;
    state.target.x = nx * BOUND_X;
    state.target.y = Math.min(BOUND_Y_MAX, Math.max(BOUND_Y_MIN, 2 - ny * 12));
  }

  let dragging = false;
  domElement.addEventListener('pointerdown', e => {
    if (!state.running) return;
    // if interacting with joystick, joystick handlers will take precedence
    if (e.target && e.target.dataset && e.target.dataset.joy) return;
    dragging = true;
    pointerSteer(e.clientX, e.clientY);
  });
  domElement.addEventListener('pointermove', e => {
    if (!state.running || !dragging) return;
    pointerSteer(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => { dragging = false; });

  // --- simple joystick (on-screen) ---
  // creates a lightweight joystick UI anchored bottom-left; usable via touch or mouse
  (function createJoystick() {
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

    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function onStart(e) {
      // only accept when running
      if (!state.running) return;
      active = true;
      const p = (e.touches && e.touches[0]) || e;
      startX = p.clientX;
      startY = p.clientY;
      // prevent page scroll
      e.preventDefault && e.preventDefault();
    }
    function onMove(e) {
      if (!active || !state.running) return;
      const p = (e.touches && e.touches[0]) || e;
      const dx = p.clientX - (startX || p.clientX);
      const dy = p.clientY - (startY || p.clientY);
      // normalize by joystick radius
      const maxR = (joystickSize - knobSize) / 2;
      const nx = clamp(dx / maxR, -1, 1);
      const ny = clamp(dy / maxR, -1, 1);
      // translate knob visually (invert y so up is negative dy)
      knob.style.transform = `translate(${nx * maxR}px, ${ny * maxR}px)`;
      // map to game targets: nx -> x, -ny -> y
      state.target.x = nx * BOUND_X;
      state.target.y = Math.min(BOUND_Y_MAX, Math.max(BOUND_Y_MIN, 2 - (-ny) * 12));
      e.preventDefault && e.preventDefault();
    }
    function onEnd() {
      active = false;
      knob.style.transform = 'translate(0px,0px)';
    }

    // pointer events for mouse + touch
    container.addEventListener('pointerdown', onStart, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onEnd);
    // also support touch events for older browsers
    container.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  })();

  // --- device orientation (gyroscope) for mobile ---
  // Maps device tilt (gamma: left/right, beta: forward/back) into target x,y.
  (function enableGyro() {
    if (!('DeviceOrientationEvent' in window)) return;
    let lastAlpha = null;
    let enabled = false;

    async function tryEnable() {
      // On iOS 13+ permission is required
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const res = await DeviceOrientationEvent.requestPermission();
          enabled = res === 'granted';
        } catch (e) { enabled = false; }
      } else {
        enabled = true;
      }
      if (enabled) window.addEventListener('deviceorientation', onOrient, true);
    }

    function onOrient(e) {
      if (!state.running) return;
      // e.gamma: left-to-right tilt in degrees (-90..90)
      // e.beta: front-to-back tilt in degrees (-180..180)
      const g = typeof e.gamma === 'number' ? e.gamma : 0;
      const b = typeof e.beta === 'number' ? e.beta : 0;
      // map gamma to x (-30deg -> -BOUND_X, 30deg -> BOUND_X)
      const maxTiltX = 30;
      const maxTiltY = 30;
      const nx = Math.max(-1, Math.min(1, g / maxTiltX));
      const ny = Math.max(-1, Math.min(1, (b - 10) / maxTiltY)); // offset so neutral holds device upright
      state.target.x = nx * BOUND_X;
      state.target.y = Math.min(BOUND_Y_MAX, Math.max(BOUND_Y_MIN, 2 - ny * 12));
      lastAlpha = e.alpha;
    }

    // user gesture to request permission on iOS; if user taps anywhere while not running, skip
    window.addEventListener('touchstart', function once() {
      tryEnable();
      window.removeEventListener('touchstart', once);
    }, { passive: true });
    // also try enabling immediately for platforms that don't need permission
    tryEnable();
  })();

  // --- simple tick to apply keyboard keys to target (keeps input separate from loop) ---
  function applyKeyInputs() {
    if (!state.running) return;
    if (keys['arrowleft'] || keys['a']) state.target.x -= 0.9;
    if (keys['arrowright'] || keys['d']) state.target.x += 0.9;
    if (keys['arrowup'] || keys['w']) state.target.y += 0.6;
    if (keys['arrowdown'] || keys['s']) state.target.y -= 0.6;
    // clamp
    state.target.x = clamp(state.target.x, -BOUND_X, BOUND_X);
    state.target.y = clamp(state.target.y, BOUND_Y_MIN, BOUND_Y_MAX);
    requestAnimationFrame(applyKeyInputs);
  }
  requestAnimationFrame(applyKeyInputs);
}