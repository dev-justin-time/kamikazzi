import * as THREE from 'three';

const WOLF_MODEL_PATH = 'assets/model/jack_the_wolf/scene.gltf';
const WOLF_SCALE = 0.8;
const WOLF_LEFT_OFFSET = 0;
const WOLF_Y_OFFSET = 0;
const WOLF_RUN_INDEX = 8;   // wolf__default__run
const WOLF_IDLE_INDEX = 28; // wolf__default__idle
const CROSSFADE_SPEED = 4;  // crossfade blend speed
let _splashDismissed = false;
let _splashFill = null;
let _splashStatus = null;

/**
 * Dismiss the loading splash screen with a fade-out transition.
 */
function dismissSplash() {
  if (_splashDismissed) return;
  _splashDismissed = true;
  const el = document.getElementById('loading-screen');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(() => { el.classList.add('hidden'); }, 600);
}

/**
 * Load the Jack the Wolf GLTF model as the ball mesh child.
 * Creates a Group-based ballMesh with a fallback sphere until the model loads.
 */
export function initWolfModel(game) {
  // Jack the Wolf model as ball mesh (loaded async, fallback sphere until ready)
  game.ballMesh = new THREE.Group();
  game.ballMesh.castShadow = true;
  game.scene.add(game.ballMesh);

  // Fallback sphere shown until wolf model loads
  const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);
  game._fallbackMesh = new THREE.Mesh(sphereGeo, game.getBallMaterial());
  game._fallbackMesh.castShadow = true;
  game.ballMesh.add(game._fallbackMesh);

  // Animation state: 0 = idle, 1 = running
  game._wolfAnimTarget = 0;
  game._wolfAnimCurrent = 0;

  // Safety: warn if model hasn't loaded after 15s
  setTimeout(() => {
    if (!game._wolfModel) {
      console.warn('[Jack] Model still not loaded after 15s — check network/server');
    }
  }, 15000);

  game.gltfLoader.load(
    WOLF_MODEL_PATH,
    (gltf) => {
      const wolfModel = gltf.scene;
      wolfModel.scale.setScalar(WOLF_SCALE);
      wolfModel.position.set(WOLF_LEFT_OFFSET, WOLF_Y_OFFSET, 0);
      // PI offset cancels parent ballMesh.rotation.y (PI when moving forward -Z)
      // so the wolf faces -Z (forward on track) instead of backwards
      wolfModel.rotation.y = Math.PI;
      wolfModel.castShadow = true;
      game.ballMesh.add(wolfModel);
      game._wolfModel = wolfModel;
      console.log('[Jack] Model loaded — scale:', WOLF_SCALE, 'position:', wolfModel.position.toString());

      if (game._fallbackMesh) {
        game.ballMesh.remove(game._fallbackMesh);
        game._fallbackMesh.geometry.dispose();
        game._fallbackMesh.material.dispose();
        game._fallbackMesh = null;
      }

      // Dismiss the splash screen now that the model is ready
      dismissSplash();

      if (gltf.animations && gltf.animations.length > Math.max(WOLF_RUN_INDEX, WOLF_IDLE_INDEX)) {
        game._wolfMixer = new THREE.AnimationMixer(wolfModel);

        // Idle action — plays by default, fades out when running
        const idleClip = gltf.animations[WOLF_IDLE_INDEX];
        game._wolfIdleAction = game._wolfMixer.clipAction(idleClip);
        game._wolfIdleAction.setEffectiveWeight(1);
        game._wolfIdleAction.play();

        // Run action — starts stopped, fades in when moving
        const runClip = gltf.animations[WOLF_RUN_INDEX];
        game._wolfRunAction = game._wolfMixer.clipAction(runClip);
        game._wolfRunAction.setEffectiveWeight(0);
        game._wolfRunAction.play();
      }
    },
    (progress) => {
      if (progress.total > 0) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        // Cache DOM elements once, then update directly
        if (!_splashFill) _splashFill = document.getElementById('loading-bar-fill');
        if (!_splashStatus) _splashStatus = document.getElementById('loading-status');
        if (_splashFill) _splashFill.style.width = pct + '%';
        if (_splashStatus) _splashStatus.textContent = 'Loading Jack… ' + pct + '%';
        if (pct % 25 === 0) console.log('[Jack] Loading:', pct + '%', '(' + Math.round(progress.loaded / 1048576) + 'MB/' + Math.round(progress.total / 1048576) + 'MB)');
      }
    },
    (err) => {
      console.error('[Jack] Model FAILED to load:', WOLF_MODEL_PATH, err);
      // Dismiss splash even on error so the game is still playable
      dismissSplash();
    }
  );
}

/**
 * Set whether the wolf is running (true) or idle (false).
 * Triggers a smooth crossfade between run and idle clips.
 */
export function setWolfRunning(game, running) {
  game._wolfAnimTarget = running ? 1 : 0;
}

/**
 * Advance the wolf model animation mixer and blend between idle/run.
 * @param {number} delta — seconds since last frame
 * @param {number} speed — current movement speed (for run animation playback rate)
 */
export function updateWolfAnimation(game, delta, speed) {
  if (!game._wolfMixer) return;

  // Smoothly blend toward target weight
  const target = game._wolfAnimTarget;
  game._wolfAnimCurrent += (target - game._wolfAnimCurrent) * Math.min(1, CROSSFADE_SPEED * delta);

  const runWeight = game._wolfAnimCurrent;
  const idleWeight = 1 - runWeight;

  if (game._wolfRunAction) {
    game._wolfRunAction.setEffectiveWeight(runWeight);
    // Scale run animation speed with movement (clamped 0.5–1.5)
    game._wolfRunAction.timeScale = Math.max(0.5, Math.min(1.5, (speed || 5) / 8));
  }
  if (game._wolfIdleAction) {
    game._wolfIdleAction.setEffectiveWeight(idleWeight);
  }

  game._wolfMixer.update(delta);
}

/**
 * Clean up the wolf model on reset.
 */
export function resetWolfModel(game) {
  if (game._wolfMixer) { game._wolfMixer.stopAllAction(); game._wolfMixer = null; }
  if (game._wolfModel && game.ballMesh) {
    game.ballMesh.remove(game._wolfModel);
    game._wolfModel = null;
  }
  game._wolfIdleAction = null;
  game._wolfRunAction = null;
  game._wolfAnimTarget = 0;
  game._wolfAnimCurrent = 0;
  game._lastWolfFrame = null;
}
