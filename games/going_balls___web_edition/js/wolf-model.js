import * as THREE from 'three';

const WOLF_MODEL_PATH = 'assets/model/jack_the_wolf/scene.gltf';
const WOLF_SCALE = 0.85;
const WOLF_LEFT_OFFSET = 0;
const WOLF_Y_OFFSET = 0.5;
const WOLF_Z_OFFSET = 0.5;  // behind the ball — Jack chases it like soccer
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

  // Soccer ball: visible sphere in front of Jack (doubles as fallback until model loads)
  const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);
  game._soccerBall = new THREE.Mesh(sphereGeo, game.getBallMaterial());
  game._soccerBall.castShadow = true;
  game.ballMesh.add(game._soccerBall);

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
      wolfModel.position.set(WOLF_LEFT_OFFSET, WOLF_Y_OFFSET, WOLF_Z_OFFSET);
      // PI offset cancels parent ballMesh.rotation.y (PI when moving forward -Z)
      // so the wolf faces -Z (forward on track) instead of backwards
      wolfModel.rotation.y = Math.PI;
      wolfModel.castShadow = true;
      game.ballMesh.add(wolfModel);
      game._wolfModel = wolfModel;
      console.log('[Jack] Model loaded — scale:', WOLF_SCALE, 'position:', wolfModel.position.toString());

      // Keep the sphere as the soccer ball — Jack chases it from behind
      // (no longer remove the fallback)

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
 * Reset wolf animation state on respawn.
 * Keeps the model, mixer, and actions intact — just fades back to idle.
 */
export function resetWolfModel(game) {
  // Reset animation blend to idle (no removal needed — model persists across deaths)
  game._wolfAnimTarget = 0;
  game._wolfAnimCurrent = 0;
  if (game._wolfIdleAction) game._wolfIdleAction.setEffectiveWeight(1);
  if (game._wolfRunAction) {
    game._wolfRunAction.setEffectiveWeight(0);
    game._wolfRunAction.timeScale = 1;
  }
  game._lastWolfFrame = null;
}
