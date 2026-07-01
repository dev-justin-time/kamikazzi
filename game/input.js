/* game/input.js
   Responsibility: map keyboard + pointer + touch + joystick + gyroscope input
   into world.state.target.

   NEW for this revision (touch + gyro "tilt" steering):
   - Touch drag is RELATIVE: at pointerdown we anchor at the current
     state.target + the finger's screen position; pointermove produces a
     delta from that anchor and slides the target from there. The plane no
     longer teleports to wherever the user touched — drag feels like a
     smartphone flight game.
   - Gyroscope input gets (a) a 2° dead-zone around the calibrated neutral
     pose, (b) 5-sample median auto-calibration on each new run so the user
     doesn't have to hold the phone at a hardcoded 10° forward angle, and
     (c) exponential smoothing so orientation-event jitter doesn't make the
     plane yoyo.
   - First-writer-wins mode-lock WITH idle-release: state.inputSource
     tracks which input claimed the run ('none' | 'touch' | 'joystick' |
     'gyro' | 'keyboard'). A small HUD pill shows the active mode. After
     IDLE_RELEASE_MS (2500ms) of no other-input events, gyro reclaims —
     so a player who accidentally touched the canvas mid-run can tilt
     again without crashing.
   - iOS motion permission is requested on the false→true edge of
     state.running (START/RETRY), NOT on page load — so the user doesn't
     get a permission modal the moment they land on the page before
     seeing the start screen.

   Bounds come from /game/world/shared.js so input + world + PlaneController
   cannot drift apart.
*/
import { TUNING, clamp } from './world/shared.js';

export function setupInput({ domElement, world }) {
  const state = world.state;
  const BOUND_X = TUNING.BOUND_X;
  const BOUND_Y_MIN = TUNING.BOUND_Y_MIN;
  const BOUND_Y_MAX = TUNING.BOUND_Y_MAX;
  const Y_RANGE = BOUND_Y_MAX - BOUND_Y_MIN;

  // ---- mode-lock state ----
  // inputSource is the input that claimed the current run. Reset to 'none'
  // every time state.running flips false → true (the start()/retry() edge),
  // so the player picks afresh each run after a crash or retry. After
  // IDLE_RELEASE_MS of no other-input events, gyro can reclaim without
  // requiring a retry.
  state.inputSource = 'none';
  state.lastInputAt = 0;        // performance.now() ms of last keyboard/touch/joystick event
  const IDLE_RELEASE_MS = 2500; // window where another input's writes still pin inputSource

  // ---- HUD pill: shows the active input mode ----
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

  // Narrow-screen nudge: on phones <480px wide the burger + pill can crowd
  // the score row, so shift the pill just above the joystick at the
  // bottom-right and shrink slightly. Reviewer call-out from third pass.
  let mq = null;
  function applyPillScreenStyle() {
    if (!mq) mq = window.matchMedia('(max-width: 480px)');
    if (mq.matches) {
      pill.style.top = 'auto';
      pill.style.right = 'auto';
      pill.style.left = '50%';
      pill.style.bottom = '150px';   // clear of the 110px joystick height + 18px bottom margin
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

  // noteInput: USE THIS from any handler that emits a discrete input event.
  // It both sets the mode-lock AND stamps state.lastInputAt so the gyro's
  // idle-release gate in onOrient() can re-claim the run later.
  function noteInput(source, label) {
    state.lastInputAt = performance.now();
    setMode(source, label);
  }

  // bumpLastInput: stamp lastInputAt WITHOUT changing mode. Used by the
  // continuous handlers (pointermove, joystick onMove) so an actively-dragging
  // user keeps the idle-release gate from claiming gyro mid-drag.
  function bumpLastInput() {
    state.lastInputAt = performance.now();
  }

  // ---- gyro state lifted out of the original IIFE ----
  // pollRunningTimer needs to call into the gyro module (to request iOS
  // permission on the run-start edge), so the IIFE pattern that hid
  // everything inside was replaced with module-local variables the
  // gyroscope handler can mutate directly.
  let gyroSamples = [];
  let gyroNeutral = { gamma: 0, beta: 0 };
  let gyroEnabled = false;
  let gyroListenerAttached = false;
  const GYRO_DEAD_ZONE_DEG = 2;
  const GYRO_MAX_TILT_DEG = 28;
  const GYRO_SMOOTH = 0.18;
  const GYRO_TRIGGER_DEG = 4;
  const GYRO_CALIB_SAMPLES = 10;   // 10 samples @ ~60Hz ≈ 167ms settle window before gyro enables.
                                 // Larger window (vs prior 5) absorbs the post-Start
                                 // phone-settle motion so the median isn't biased
                                 // by tilt from the previous crash screen.

  function median(arr, key) {
    const sorted = arr.map(s => s[key]).slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  async function requestGyroPermission() {
    if (!('DeviceOrientationEvent' in window)) {
      // No motion API at all — surface to the player once on the run-start edge.
      if (state.running && state.inputSource === 'none') {
        pill.textContent = '🛰 No Motion';
        pill.style.opacity = '1';
      }
      return;
    }
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        gyroEnabled = res === 'granted';
        if (!gyroEnabled && state.running) {
          pill.textContent = '🛰 Motion denied';
          pill.style.opacity = '1';
        }
      } catch (e) { gyroEnabled = false; }
    } else {
      gyroEnabled = true;
    }
    if (gyroEnabled && !gyroListenerAttached) {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
      gyroListenerAttached = true;
    }
  }

  function onOrient(e) {
    if (!state.running || !gyroEnabled) return;
    const g = typeof e.gamma === 'number' ? e.gamma : 0;
    const b = typeof e.beta === 'number' ? e.beta : 0;

    // Auto-calibration: median of first GYRO_CALIB_SAMPLES events after
    // each fresh run. We DON'T write target during this window so a noisy
    // start pose doesn't yank the plane mid-calibration.
    if (gyroSamples.length < GYRO_CALIB_SAMPLES) {
      gyroSamples.push({ gamma: g, beta: b });
      if (gyroSamples.length === GYRO_CALIB_SAMPLES) {
        gyroNeutral = { gamma: median(gyroSamples, 'gamma'), beta: median(gyroSamples, 'beta') };
      }
      return;
    }

    // Don't fight an active other-input — unless it's been idle long enough
    // (IDLE_RELEASE_MS). This is the idle-release escape hatch: a player
    // who incidentally touched the canvas can wait 2.5s and then resume
    // tilt steering without crashing.
    if (state.inputSource !== 'none' && state.inputSource !== 'gyro') {
      const idle = performance.now() - (state.lastInputAt || 0);
      if (idle < IDLE_RELEASE_MS) return;
      // Fall through: gyro gets a chance to claim.
    }

    const dg = g - gyroNeutral.gamma;
    const db = b - gyroNeutral.beta;

    // Engagement: small jitter shouldn't switch mode away from 'none'; require
    // > GYRO_TRIGGER_DEG of net tilt to claim.
    if (state.inputSource === 'none') {
      if (Math.abs(dg) < GYRO_TRIGGER_DEG && Math.abs(db) < GYRO_TRIGGER_DEG) return;
      setMode('gyro', '📱 Tilt');
    }

    // Dead-zone around calibrated neutral
    let adg = Math.abs(dg) < GYRO_DEAD_ZONE_DEG ? 0 : (dg - Math.sign(dg) * GYRO_DEAD_ZONE_DEG);
    let adb = Math.abs(db) < GYRO_DEAD_ZONE_DEG ? 0 : (db - Math.sign(db) * GYRO_DEAD_ZONE_DEG);

    const usableMax = GYRO_MAX_TILT_DEG - GYRO_DEAD_ZONE_DEG;
    const nx = clamp(adg / usableMax, -1, 1);
    const ny = clamp(adb / usableMax, -1, 1);

    const rawTargetX = nx * BOUND_X;
    const rawTargetY = clamp(2 - ny * (Y_RANGE * 0.6), BOUND_Y_MIN, BOUND_Y_MAX);

    // Exponential smoothing — crush jitter without adding visible lag.
    state.target.x += (rawTargetX - state.target.x) * GYRO_SMOOTH;
    state.target.y += (rawTargetY - state.target.y) * GYRO_SMOOTH;
  }

  // ---- per-run reset (mode + gyro calibration + DEFER iOS permission) ----
  // iOS permission used to fire on page load (an early reviewer's call-out
  // confirmed this is bad UX — the system permission modal would appear
  // before the user even saw the start screen). Now the prompt only
  // appears when state.running edges false → true (Start Flying pressed).
  // The touchstart fallback below is the only pre-run trigger, and it
  // ignores touches that occur when the player is just tapping the
  // start/retry button (state.running is still false).
  let wasRunning = false;
  function pollRunningTimer() {
    if (state.running && !wasRunning) {
      // Fresh run begins — clear mode-lock, reset gyro calibration,
      // request motion permission now (NOT on page load).
      setMode('none', '');
      gyroSamples = [];
      gyroNeutral = { gamma: 0, beta: 0 };
      requestGyroPermission();
    }
    wasRunning = state.running;
    requestAnimationFrame(pollRunningTimer);
  }
  requestAnimationFrame(pollRunningTimer);

  // iOS sometimes delivers the user gesture (button click) BEFORE this
  // module's requestAnimationFrame boots. touchstart fires for the initial
  // "Start Flying" tap on iOS, so we hook it once for the rare edge case.
  function touchStartPermissionKick() {
    if (!gyroEnabled) requestGyroPermission();
    window.removeEventListener('touchstart', touchStartPermissionKick);
  }
  window.addEventListener('touchstart', touchStartPermissionKick, { passive: true });

  // -------- keyboard handling --------
  // Relative: each frame, nudge state.target by a small velocity-style
  // step while the key is held; clamp outside the lock so other modes'
  // writes aren't clobbered.
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
    // Clamp only when WE own the input — don't fight the player's touch drag.
    if (state.inputSource === 'keyboard') {
      state.target.x = clamp(state.target.x, -BOUND_X, BOUND_X);
      state.target.y = clamp(state.target.y, BOUND_Y_MIN, BOUND_Y_MAX);
    }
    requestAnimationFrame(applyKeyInputs);
  }
  requestAnimationFrame(applyKeyInputs);

  // -------- relative touch drag --------
  // Anchor at pointerdown: capture the FINGER position AND the current
  // state.target as the "null position". pointermove computes a delta
  // from those anchors and slides the target — feels like a real joystick.
  let dragging = false;
  let dragAnchor = { x: 0, y: 0, targX: 0, targY: 0 };

  domElement.addEventListener('pointerdown', e => {
    if (!state.running) return;
    // joystick takes precedence inside its own DOM subtree
    if (e.target && e.target.dataset && e.target.dataset.joy) return;
    noteInput('touch', '👆 Touch');
    dragging = true;
    dragAnchor = { x: e.clientX, y: e.clientY, targX: state.target.x, targY: state.target.y };
  });

  domElement.addEventListener('pointermove', e => {
    if (!state.running || !dragging || state.inputSource !== 'touch') return;
    // Refresh the idle gate so a >2.5s slow drag doesn't get hijacked by
    // gyro's idle-release after the initial pointerdown's stamp expires.
    bumpLastInput();
    const dx = e.clientX - dragAnchor.x;
    const dy = e.clientY - dragAnchor.y;
    // Full-width drag = full bound range (x scaled by 2.5 so the player has
    // to actually move, not just nudge). Y uses the absolute Y_RANGE.
    state.target.x = dragAnchor.targX + (dx / window.innerWidth) * BOUND_X * 2.5;
    state.target.y = dragAnchor.targY - (dy / window.innerHeight) * Y_RANGE * 1.5;
    // Slight over-drag so the plane can leave the safe hull and still max
    // out at the bound (PlaneController lerp pulls it back).
    state.target.x = clamp(state.target.x, -BOUND_X - 4, BOUND_X + 4);
    state.target.y = clamp(state.target.y, BOUND_Y_MIN - 2, BOUND_Y_MAX + 2);
  });

  // Release on pointerup OR pointercancel (e.g. system intercepts the touch).
  function endDrag() { dragging = false; }
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // -------- on-screen joystick (bottom-left) --------
  // Same priority semantics as touch drag (claims mode before gyro).
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
      // Mirror the touch-drag freshness bump — holding the joystick knob for
      // >2.5s would otherwise let gyro's idle-release hijack the run.
      bumpLastInput();
      const p = (e.touches && e.touches[0]) || e;
      const dx = p.clientX - startX;
      const dy = p.clientY - startY;
      const maxR = (joystickSize - knobSize) / 2;
      const nx = clamp(dx / maxR, -1, 1);
      const ny = clamp(dy / maxR, -1, 1);
      knob.style.transform = `translate(${nx * maxR}px, ${ny * maxR}px)`;
      // Direct knob-to-target mapping: drag to bound edge × 1.0, padded
      // for consistent feel with the relative touch drag branch above.
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
  })();
}
