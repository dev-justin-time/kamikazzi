/* game/controls/gyro.js
   Responsibility: gyroscope / device orientation input.
   Features:
   - 2° dead-zone around calibrated neutral
   - Auto-calibration via median of first N samples
   - Exponential smoothing to crush jitter
   - Idle-release: gyro reclaims control after IDLE_RELEASE_MS of no other input
   - iOS motion permission requested on run-start edge (not page load)
*/
import { clamp } from '../world/shared.js';

export function setupGyro({ world, shared }) {
  const { state, pill, IDLE_RELEASE_MS, setMode, onRunStart } = shared;

  let gyroSamples = [];
  let gyroNeutral = { gamma: 0, beta: 0 };
  let gyroEnabled = false;
  let gyroListenerAttached = false;
  const GYRO_DEAD_ZONE_DEG = 2;
  const GYRO_MAX_TILT_DEG = 28;
  const GYRO_SMOOTH = 0.18;
  const GYRO_TRIGGER_DEG = 4;
  const GYRO_CALIB_SAMPLES = 10;
  const BOUND_X = world.TUNING?.BOUND_X || 34;
  const BOUND_Y_MIN = world.TUNING?.BOUND_Y_MIN ?? -4;
  const BOUND_Y_MAX = world.TUNING?.BOUND_Y_MAX ?? 16;
  const Y_RANGE = BOUND_Y_MAX - BOUND_Y_MIN;

  function median(arr, key) {
    const sorted = arr.map(s => s[key]).slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  async function requestGyroPermission() {
    if (!('DeviceOrientationEvent' in window)) {
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

    if (gyroSamples.length < GYRO_CALIB_SAMPLES) {
      gyroSamples.push({ gamma: g, beta: b });
      if (gyroSamples.length === GYRO_CALIB_SAMPLES) {
        gyroNeutral = { gamma: median(gyroSamples, 'gamma'), beta: median(gyroSamples, 'beta') };
      }
      return;
    }

    if (state.inputSource !== 'none' && state.inputSource !== 'gyro') {
      const idle = performance.now() - (state.lastInputAt || 0);
      if (idle < IDLE_RELEASE_MS) return;
    }

    const dg = g - gyroNeutral.gamma;
    const db = b - gyroNeutral.beta;

    if (state.inputSource === 'none') {
      if (Math.abs(dg) < GYRO_TRIGGER_DEG && Math.abs(db) < GYRO_TRIGGER_DEG) return;
      setMode('gyro', '📱 Tilt');
    }

    let adg = Math.abs(dg) < GYRO_DEAD_ZONE_DEG ? 0 : (dg - Math.sign(dg) * GYRO_DEAD_ZONE_DEG);
    let adb = Math.abs(db) < GYRO_DEAD_ZONE_DEG ? 0 : (db - Math.sign(db) * GYRO_DEAD_ZONE_DEG);

    const usableMax = GYRO_MAX_TILT_DEG - GYRO_DEAD_ZONE_DEG;
    const nx = clamp(adg / usableMax, -1, 1);
    const ny = clamp(adb / usableMax, -1, 1);

    const rawTargetX = nx * BOUND_X;
    const rawTargetY = clamp(2 - ny * (Y_RANGE * 0.6), BOUND_Y_MIN, BOUND_Y_MAX);

    state.target.x += (rawTargetX - state.target.x) * GYRO_SMOOTH;
    state.target.y += (rawTargetY - state.target.y) * GYRO_SMOOTH;
  }

  // Register the run-start callback with the shared poller
  onRunStart(function onGyroRunStart() {
    gyroSamples = [];
    gyroNeutral = { gamma: 0, beta: 0 };
    requestGyroPermission();
  });

  // iOS touchstart permission kick
  function touchStartPermissionKick() {
    if (!gyroEnabled) requestGyroPermission();
    window.removeEventListener('touchstart', touchStartPermissionKick);
  }
  window.addEventListener('touchstart', touchStartPermissionKick, { passive: true });
}
