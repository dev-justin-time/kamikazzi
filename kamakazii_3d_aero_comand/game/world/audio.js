/* game/world/audio.js
   Extracted from world.js — impact SFX preloading, pickup SFX preloading,
   and the impact one-shot player.
*/

import { IMPACT_SOUND_URL, POWERUP_SFX_URLS } from './shared.js';

/**
 * Load the impact SFX buffer once at world-init.
 * Tries /assets/audio/explosion.wav first; falls back to
 * /assets/audio/airplane.wav (~0.54s, 22050Hz 8-bit) as a punchy
 * one-shot burst if the canonical asset isn't on disk yet.
 * If both file loads fail, synthesizes a white-noise explosion burst
 * via Web Audio API so the game ALWAYS has a proper impact sound.
 * Returns { buffer, isFallback } | null.
 */
export async function loadImpactBuffer(THREE) {
  const tries = [
    { url: IMPACT_SOUND_URL, isFallback: false },
    { url: '/assets/audio/airplane.wav', isFallback: true },
  ];
  let lastErr = null;
  for (const t of tries) {
    try {
      const buf = await new Promise((resolve, reject) => {
        const loader = new THREE.AudioLoader();
        loader.load(t.url, resolve, undefined, reject);
      });
      if (t.isFallback) {
        console.warn(`Impact sound: ${IMPACT_SOUND_URL} not found; using airplane.wav as one-shot burst fallback.`);
      }
      return { buffer: buf, isFallback: t.isFallback };
    } catch (e) {
      lastErr = e;
    }
  }
  // Both file loads failed — synthesize an explosion via Web Audio API.
  console.warn('Impact sound: all files failed; synthesizing explosion via Web Audio API.', lastErr);
  try {
    const sampleRate = 44100;
    const duration = 0.8;
    const length = Math.floor(sampleRate * duration);
    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);

    const noiseLen = length;
    const noiseArray = new Float32Array(noiseLen);
    for (let i = 0; i < noiseLen; i++) {
      noiseArray[i] = Math.random() * 2 - 1;
    }
    const noiseBuffer = offlineCtx.createBuffer(1, noiseLen, sampleRate);
    noiseBuffer.getChannelData(0).set(noiseArray);
    const noiseSource = offlineCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const gainNode = offlineCtx.createGain();
    const now = 0;
    gainNode.gain.setValueAtTime(0.9, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);
    filter.Q.setValueAtTime(1.0, now);

    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + duration);

    const renderedBuffer = await offlineCtx.startRendering();
    console.log('Impact sound: synthesized explosion successfully.');
    return { buffer: renderedBuffer, isFallback: true };
  } catch (synthErr) {
    console.warn('Impact sound: synthesis also failed; crash will be silent.', synthErr);
    return null;
  }
}

/**
 * Pre-load per-type pickup SFX buffers. Iterates POWERUP_SFX_URLS
 * and decodes every WAV that resolves into an AudioBuffer map keyed by type.
 * Missing files are silently skipped — UI falls back to synthesised tones.
 */
export async function loadPickupSfxBuffers(THREE) {
  const buffers = {};
  await Promise.all(Object.entries(POWERUP_SFX_URLS).map(async ([type, url]) => {
    try {
      const buf = await new Promise((resolve, reject) => {
        const loader = new THREE.AudioLoader();
        loader.load(url, resolve, undefined, reject);
      });
      buffers[type] = buf;
    } catch (_) {
      // Asset not present yet — synthesised fallback handles it
    }
  }));
  return buffers;
}

/**
 * Create the impact one-shot SFX player.
 * Reuses the shared audioListener so engine + impact share one AudioContext.
 * @param {THREE.AudioListener} audioListener - shared Three.js audio listener
 * @param {{ buffer: AudioBuffer, isFallback: boolean } | null} impactBufferData
 * @returns {{ playImpact: Function, stopImpact: Function }}
 */
export function createImpactPlayer(audioListener, impactBufferData, THREE) {
  let impactAudio = null;
  if (impactBufferData) {
    impactAudio = new THREE.Audio(audioListener);
    impactAudio.setBuffer(impactBufferData.buffer);
    impactAudio.setVolume(impactBufferData.isFallback ? 0.7 : 0.95);
    impactAudio.setLoop(false);
  }
  function playImpact() {
    if (!impactAudio) return;
    try {
      if (impactAudio.isPlaying) impactAudio.stop();
      impactAudio.setLoop(false);
      impactAudio.play();
    } catch (e) { console.warn('playImpact failed', e); }
  }
  function stopImpact() {
    try {
      if (impactAudio && impactAudio.isPlaying) impactAudio.stop();
    } catch (_) {}
  }
  return { playImpact, stopImpact };
}
