/* game/world/engine-sound.js
   Extracted from world.js — looped engine sound attached to the player plane.
   Best-effort: plays after first user gesture; silently fails if audio files
   are missing or browser blocks autoplay.
*/

/**
 * Create the engine sound manager.
 * @param {THREE.AudioListener} audioListener - shared Three.js audio listener
 * @param {THREE} THREE - the Three.js module reference
 * @returns {{ attachEngineSoundTo: Function, tryStartEngineSound: Function, stopEngineSound: Function, stopAll: Function }}
 */
export function createEngineSound(audioListener, THREE) {
  let engineAudio = null;
  let engineAudioReady = false;

  /**
   * Attach a looped engine sound to a Three.js object (the plane).
   * The audio is a PositionalAudio child of the object.
   */
  function attachEngineSoundTo(obj) {
    try {
      const audio = new THREE.PositionalAudio(audioListener);
      obj.add(audio);
      obj.userData.engineAudio = audio;
      obj.userData.engineAudioReady = false;

      const loader = new THREE.AudioLoader();
      loader.load('/assets/audio/airplane.wav', buffer => {
        audio.setBuffer(buffer);
        audio.setLoop(true);
        audio.setRefDistance(8);
        audio.setVolume(0.7);
        obj.userData.engineAudioReady = true;
        engineAudio = audio;
        engineAudioReady = true;
      }, undefined, err => console.warn('Airplane sound load failed', err));
    } catch (e) {
      console.warn('attachEngineSoundTo failed', e);
    }
  }

  /**
   * Start the engine sound (only if user gesture has been received).
   */
  function tryStartEngineSound() {
    try {
      if (engineAudio && engineAudioReady) engineAudio.play();
    } catch (_) { /* browser blocked autoplay until gesture */ }
  }

  /**
   * Stop the engine sound.
   */
  function stopEngineSound() {
    try {
      if (engineAudio && typeof engineAudio.stop === 'function') engineAudio.stop();
    } catch (_) {}
  }

  /**
   * Stop all engine sounds (also checks plane.userData for legacy attachment).
   */
  function stopAll(plane) {
    stopEngineSound();
    if (plane && plane.userData && plane.userData.engineAudio) {
      try { plane.userData.engineAudio.stop(); } catch (_) {}
    }
  }

  return { attachEngineSoundTo, tryStartEngineSound, stopEngineSound, stopAll };
}
