/ /game/world.js
// Orchestrator: composes scene-level objects (lights, ground, clouds, plane)
// with domain managers (buildings, powerups, explosions, ideas, multiplayer).


import * as THREE from 'https://esm.sh/three@0.128.0';

import { buildPlane, loadPlaneFromGLB } from './world/plane/factory.js';
import { PlaneController } from './world/plane/controller.js';
import { createBuildingManager } from './world/buildings.js';
import { createExplosionManager } from './world/explosion.js';
import { createPowerupManager } from './world/powerups.js';
import { createMagnetHalo } from './world/magnet_halo.js';
import { applyIdeasConfig, applyPalette } from './world/ideas.js';

import {
  TUNING, loadTexture, clamp, removeAndDispose, disposeScene,
  LEVEL_BACKGROUNDS, NUM_LEVELS, SCORE_PER_LEVEL, TARGET_SUCCESS_SCORE, createBackgroundScene,
  FINAL_LEVEL_TINT, FINAL_LEVEL_FOG,
  IMPACT_SOUND_URL, POWERUP_SFX_URLS, CRASH_KEYFRAMES, CRASH_TOTAL_PLAYS,
  EXPLOSION_PALETTES,
  FLOOR_ASSETS,
} from './world/shared.js';

import {
  syncHighScore, submitLeaderboard, getHighScore, getUsername,
  createMultiplayerRoom, captureScreenshot, saveReplay,
  saveGameSnapshot, loadGameSnapshot, deleteGameSnapshot,
} from './puter-client.js';

// --- internal constants (cluster/camera/sun tuning kept local; gameplay tuning lives in shared.js) ---
const PEER_LERP = 0.2;
const PEER_BASE_SCALE = 0.8;
const PEER_SCORE_DIVISOR = 200;
const SUN_POSITION_X = 40;
const SUN_POSITION_Y = 90;
const SUN_POSITION_Z = 30;
const SUN_SHADOW_NEAR = 10;
const SUN_SHADOW_FAR = 260;
const SHADOW_FRUSTUM_HALF = 120;
const CAMERA_LOOK_AHEAD = 20;
const CAMERA_LERP = 0.1;
const CAMERA_HEIGHT_OFFSET = 6;
const CAMERA_DISTANCE = 16;
const CAMERA_TRAIL_FACTOR = 0.5;

// Powerup spawn cycle — round-robin across the 6 types so each spawn in a
// run is a different visual. Ordered first→last so the first pickup the
// player sees is always shield (the most forgiving), the second is boost
// (the most dramatic), then stamina at index 2 closes the
// non-cascade "starter bundle" so the new one-shot type is reachable on
// EVERY run (was unreachable at index 5 when powerupCount=3 covered only
// indices 0..2). Cascade runs (powerupCount=6) sweep the full rotation.
// Pure data, kept at module scope so resetGame (inside createWorld) reads
// it without an extra inner-closure indirection.
const SHIELD_BOOST_CYCLE = ['shield', 'boost', 'stamina', 'magnet', 'score2x', 'slowmo'];

// Load the impact SFX buffer once at world-init. Tries the canonical
// /assets/audio/explosion.wav first; then falls back to
// /assets/audio/airplane.wav (~0.54s, 22050Hz 8-bit) as a punchy one-shot
// burst if the canonical asset isn't on disk yet ("pending new asset").
// If both file loads fail, synthesizes a white-noise explosion burst via
// Web Audio API so the game ALWAYS has a proper impact sound.
// Returns { buffer, isFallback } | null. Buffer is shared by all crashes.
async function loadImpactBuffer() {
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
  // White noise burst with rapid exponential decay sounds like a sharp
  // impact / explosion, much better than silence.
  console.warn('Impact sound: all files failed; synthesizing explosion via Web Audio API.', lastErr);
  try {
    // Create an off-line AudioContext to render the synthesized buffer.
    // OfflineAudioContext is supported in all modern browsers and doesn't
    // require user gesture. Sample rate matches the shared listener's
    // context (typically 44100 or 48000).
    const sampleRate = 44100;
    const duration = 0.8; // 800ms explosion
    const length = Math.floor(sampleRate * duration);
    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);

    // White noise buffer source
    const noiseLen = length;
    const noiseArray = new Float32Array(noiseLen);
    for (let i = 0; i < noiseLen; i++) {
      noiseArray[i] = Math.random() * 2 - 1;
    }
    const noiseBuffer = offlineCtx.createBuffer(1, noiseLen, sampleRate);
    noiseBuffer.getChannelData(0).set(noiseArray);
    const noiseSource = offlineCtx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    // Exponential decay envelope: starts loud, decays to silence
    const gainNode = offlineCtx.createGain();
    const now = 0;
    gainNode.gain.setValueAtTime(0.9, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Low-pass filter to make it sound more like an explosion (rumble)
    // rather than pure white noise (hiss)
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

// Per-type pickup SFX preloader — mirrors the impact loader pattern.
// Iterates POWERUP_SFX_URLS (shared.js) and decodes every WAV that
// resolves into an AudioBufferMap keyed by type. Missing files are
// silently skipped — ui.js#playTypeTone falls back to synthesised
// tones (TONE_RECIPES) for any type whose key isn't in the map. This
// keeps the SFX layer non-blocking: drop a file in /assets/audio/ and
// the next boot uses it, no code changes required.
async function loadPickupSfxBuffers(audioListener) {
  const buffers = {};
  await Promise.all(Object.entries(POWERUP_SFX_URLS).map(async ([type, url]) => {
    try {
      const buf = await new Promise((resolve, reject) => {
        const loader = new THREE.AudioLoader();
        loader.load(url, resolve, undefined, reject);
      });
      buffers[type] = buf;
    } catch (_) {
      // Asset not present yet — synthesised fallback will play this
      // type. Don't warn every boot; it's expected pre-asset.
    }
  }));
  return buffers;
}

/**
 * Compose the entire world. Returns the public API + bootstraps multiplayer.
 */
export async function createWorld({ scene, camera, domElement, planeModelUrl = null }) {
  // ---- sky background: orthographic bg scene (7 level textures) ----
  // Main scene stays transparent; a separate bg scene renders the photographic
  // level sky first, then the main scene is drawn on top. The bg plane is
  // contain-fit so images never distort; letterbox/pillarbox bars show the
  // renderer's clear color.
  scene.background = null;
  scene.fog = new THREE.Fog(TUNING.SKY_COLOR, TUNING.DAY_FOG_NEAR, TUNING.DAY_FOG_FAR);

  // ---- shared AudioListener ----
  // One THEME.AudioListener for the whole world. Three.js creates a new
  // AudioContext inside each AudioListener() constructor; sharing one
  // listener across the engine loop + the impact one-shot avoids a
  // redundant context dance and keeps both audio sources in the same graph.
  const audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  const bg = createBackgroundScene();
  // Pre-load all 7 level textures, the impact SFX, the per-type pickup SFX,
  // AND the floor textures in parallel. Each is cheap but kicking them off
  // together means none of them block the user clicking Start. Any per-type
  // pickup URL that 404s is silently skipped — synthesised fallback plays
  // for that type — so missing WAV files never gate game boot.
  const bgUrls = LEVEL_BACKGROUNDS.map(entry => typeof entry === 'string' ? entry : entry.url);
  const [bgTextures, impactBufferData, floorTextures, pickupSfxBuffers] = await Promise.all([
    Promise.all(bgUrls.map(url => loadTexture(url))),
    loadImpactBuffer(),
    Promise.all(FLOOR_ASSETS.map(url => loadTexture(url))),
    loadPickupSfxBuffers(),
  ]);

  // Keep ortho frustum + contain scaling in sync with the canvas so
  // letterbox/pillarbox bars look right on initial mount AND after resize.
  const syncBgAspect = () => {
    const w = domElement.clientWidth || window.innerWidth;
    const h = domElement.clientHeight || window.innerHeight;
    const ar = w / h;
    bg.setOrthoAspect(ar > 0 ? ar : 1);
    if (bg.material.map) bg.updateCoverFit(bg.material.map);
  };
  syncBgAspect();
  window.addEventListener('resize', syncBgAspect);

  // ---- level helpers (declared early so the boot-time bg apply uses them) ----
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const applyLevelBackground = idx => {
    const entry = LEVEL_BACKGROUNDS[idx];
    const tex = bgTextures[idx];
    if (!tex) return;
    bg.setTexture(tex);
    bg.updateCoverFit(tex);

    if (entry && typeof entry === 'object' && (entry.mode || entry.tint || entry.bgTint !== undefined)) {
      applyPalette({ scene, ground, mode: entry.mode || state._ideas_mode, tint: entry.tint || state._ideas_tint, bgMaterial: bg.material });
      if (entry.bgTint !== undefined) {
        bg.material.color.setHex(entry.bgTint);
      }
    } else {
      applyPalette({ scene, ground, mode: state._ideas_mode, tint: state._ideas_tint, bgMaterial: bg.material });
    }
  };

  // ---- lights ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6fb52a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.1);
  sun.position.set(SUN_POSITION_X, SUN_POSITION_Y, SUN_POSITION_Z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = SUN_SHADOW_NEAR;
  sun.shadow.camera.far = SUN_SHADOW_FAR;
  sun.shadow.camera.left = -TUNING.BOUND_X * 4;
  sun.shadow.camera.right = TUNING.BOUND_X * 4;
  sun.shadow.camera.top = SHADOW_FRUSTUM_HALF;
  sun.shadow.camera.bottom = -SHADOW_FRUSTUM_HALF;
  scene.add(sun);

  // ---- ground + animated strips ----
  // The ground mesh has a randomly-picked texture from FLOOR_ASSETS bound at
  // mesh-creation time. Both PNGs are pre-loaded in the Promise.all above
  // (so this lookup is synchronous and the texture is decoded + GPU-uploaded
  // before any frame renders — no flash of plain-green ground on first paint).
  // We leave the per-mode color tint at GROUND_COLOR / NIGHT_GROUND_COLOR
  // (applyPalette in ideas.js) so day → green and night → dark green tint
  // multipliers on top of the texture; the texture itself is the base ground.
  const groundMat = new THREE.MeshLambertMaterial({ color: TUNING.GROUND_COLOR });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 1400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -8;
  ground.position.z = -500;
  ground.receiveShadow = true;
  scene.add(ground);

  // Random per-session pick from the pre-loaded FLOOR_ASSETS array.
  // One texture is bound for the world lifetime (no per-resetGame churn);
  // each fresh page load gets a new random pick.
  const groundTex = floorTextures[Math.floor(Math.random() * floorTextures.length)];
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  // 600×1400 plane × (6, 14) → ~100×100m per tile, reads as ground-terrain
  // scale. Tweak the repeat factors here if the textures don't tile cleanly.
  groundTex.repeat.set(6, 14);
  groundMat.map = groundTex;
  groundMat.needsUpdate = true;

  const stripMat = new THREE.MeshLambertMaterial({ color: TUNING.STRIP_COLOR });
  const strips = [];
  for (let i = 0; i < TUNING.STRIP_COUNT; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), stripMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, -7.95, -i * TUNING.STRIP_SPACING);
    s.receiveShadow = true;
    scene.add(s);
    strips.push(s);
  }

  // ---- clouds (shared white material — was 0xff5a5a red) ----
  const cloudMat = new THREE.MeshLambertMaterial({ color: TUNING.CLOUD_COLOR });
  function makeCloud() {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < puffs; i++) {
      const r = 4 + Math.random() * 5;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), cloudMat);
      puff.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10);
      g.add(puff);
    }
    return g;
  }
  const clouds = [];
  for (let i = 0; i < TUNING.CLOUD_COUNT; i++) {
    const c = makeCloud();
    c.position.set((Math.random() - 0.5) * 200, 20 + Math.random() * 40, -Math.random() * 600);
    scene.add(c);
    clouds.push(c);
  }

  // ---- engine sound (best-effort, plays after first user gesture) ----
  function attachEngineSoundTo(obj) {
    try {
      // Reuse the world-level shared listener (created above) so both engine
      // loop and impact SFX share one AudioContext / audio graph.
      const audio = new THREE.PositionalAudio(audioListener);
      obj.add(audio);                         // attach once
      obj.userData.engineAudio = audio;
      obj.userData.engineAudioReady = false;

      const loader = new THREE.AudioLoader();
      loader.load('/assets/audio/airplane.wav', buffer => {
        audio.setBuffer(buffer);
        audio.setLoop(true);
        audio.setRefDistance(8);
        audio.setVolume(0.7);
        obj.userData.engineAudioReady = true;
        // The start button click is a user gesture; resetGame() in startLoop will play it.
      }, undefined, err => console.warn('Airplane sound load failed', err));
    } catch (e) {
      console.warn('attachEngineSoundTo failed', e);
    }
  }

  // ---- plane: GLB if supplied, fallback to procedural ----
  // The factory returns `{ plane, propeller }` (was just `plane` before the
  // HUD-lock refactor) — the propeller is re-parented to `scene` below so
  // its world position is fully decoupled from plane yaw/pitch/bank.
  const placeholder = { x: 0, y: 2, z: 0 };
  let plane = null, propeller = null;
  try {
    if (planeModelUrl && typeof planeModelUrl === 'string') {
      const built = await loadPlaneFromGLB(planeModelUrl, { scale: 3.0, castShadow: true, receiveShadow: true });
      plane = built.plane;
      propeller = built.propeller;
    }
  } catch (e) {
    console.warn('GLB load failed, falling back to procedural plane', e);
  }
  if (!plane) {
    const built = buildPlane();
    plane = built.plane;
    propeller = built.propeller;
    plane.scale.set(3, 3, 3);
  }
  plane.position.set(placeholder.x, placeholder.y, placeholder.z);
  if (plane.rotation) plane.rotation.y += Math.PI;
  plane.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  scene.add(plane);
  // HUD-lock: the propeller is a sibling of the plane in the scene tree,
  // not a child. Per-frame world.js loop() syncs it to the bottom of the
  // viewport (see syncPropellerToViewport below + TUNING.PROPELLER_DISTANCE).
  scene.add(propeller);
  attachEngineSoundTo(plane);

  // ---- impact SFX (one-shot crash sound) ----
  // Reuses the shared `audioListener` so engine + impact share one AudioContext
  // (no duplicate listener-on-camera). Looping=false so the fallback airplane.wav
  // never bleeds into a continuous engine sound.
  let impactAudio = null;
  if (impactBufferData) {
    impactAudio = new THREE.Audio(audioListener);
    impactAudio.setBuffer(impactBufferData.buffer);
    // Fallback (engine loop) gets a slightly lower volume so it reads as a
    // "boom" rather than competing with the looping engine behind it.
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

  // ---- domain managers ----
  const explosion = createExplosionManager(scene);
  const buildings = createBuildingManager(scene);
  const powerups  = createPowerupManager(scene);

  // ---- game state ----
  const state = {
    running: false,
    over: false,
    won: false,
    paused: false,
    score: 0,
    speed: TUNING.SPEED_PER_LEVEL[0],
    baseSpeed: TUNING.BASE_SPEED,
    spawnTimer: 0,
    spawnInterval: TUNING.SPAWN_INTERVAL,
    target: { x: 0, y: 2 },
    best: Number(localStorage.getItem('kamikazziHiScore') || 0),
    startTimeMs: 0,
    timeElapsedMs: 0,
    impactAlt: 0,
    impactDistance: 0,
    distanceTraveled: 0,
    levelStartScore: 0,
    _ideas_enablePowerups: false,
    _night: false,
    _ideas_mode: 'day',        // day|night|dusk|dawn — resolved from briefings via game/world/ideas.js#resolveMode (priority night > dusk > dawn > day)
    _ideas_tint: null,         // null|mint|neon|rose — orthogonal to mode; first-hit priority from TOKEN_BUCKETS
    _ideas_cascade: false,     // true when a 'storm|showers|rain|deluge|torrent|downpour|flood' token matched; world.js#resetGame bumps powerup spawn count 3 → 6
    _ideas_recognized: true,   // false while awaiting AI escalation on a phrase no local keyword classified
    level: 1,                  // 1..NUM_LEVELS; bumped every SCORE_PER_LEVEL points
    levelOrder: [],            // shuffled indices into bgTextures; filled below + by resetGame()

    // Near-miss time-slow mechanic (see game/world.js loop() dt multiplier +
    // checkNearMiss helper). timeScale is the smoothed effective dt
    // multiplier; timeScaleTarget jumps to NEAR_MISS_TIME_SCALE on detection
    // and reverts to 1.0 after NEAR_MISS_DURATION_MS. lastNearMissByBuilding
    // is a per-building cooldown Map so EACH building can independently
    // trigger one bullet-time window per NEAR_MISS_DURATION_MS — skipping
    // past 5 buildings in quick succession gives 5 distinct freeze-frames,
    // and grazing along one building for >1.2s refires at most once per
    // window (no sustained slowdown from continuous grazing).
    timeScale: 1.0,
    timeScaleTarget: 1.0,
    timeScaleUntilMs: 0,
    lastNearMissByBuilding: new Map(),

    // ---- Active powerup windows (per-type) ----
    // Each entry is a wall-clock expiry timestamp; the loop reads
    // `performance.now() < entry` for the gate. Reset to zeroed in
    // resetGame() so a fresh run starts with no carryover buff from a
    // previous run. The HUD chip in ui.js reads state._powerups directly.
    _powerups: {
      shieldUntilMs:  0,
      boostUntilMs:   0,
      magnetUntilMs:  0,
      score2xUntilMs: 0,
      slowmoUntilMs:  0,
    },
  };

  // Apply the boot-time level photo so the start screen doesn't reveal a
  // blank-white bg plane before the user clicks Start. resetGame() reshuffles
  // on every life for additional variety.
  state.levelOrder = shuffle(Array.from({ length: NUM_LEVELS }, (_, i) => i));
  applyLevelBackground(state.levelOrder[0]);

  // ---- multiplayer (Puter KV-based presence) ----
  let room = null;
  const peersMeshes = {};
  let presenceAccumulator = 0;

  function makePeerMarker() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 8), mat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), mat);
    head.position.set(0, 0.2, 0.6);
    g.add(head);
    return g;
  }

  function pushPresence(force = false) {
    if (!room || typeof room.updatePresence !== 'function') return;
    room.updatePresence({
      x: plane.position.x, y: plane.position.y, z: plane.position.z,
      score: Math.floor(state.score), running: !!state.running,
    }).then(() => {
      presenceAccumulator = 0;
    }).catch(e => {
      if (force) console.warn('pushPresence failed', e);
    });
  }

  async function initMultiplayer() {
    try {
      room = await createMultiplayerRoom('kamikazzi-lobby');
      if (!room) return;
      pushPresence(true);
      room.startHeartbeat();

      room.subscribePresence(currentPresence => {
        Object.keys(currentPresence).forEach(clientId => {
          if (clientId === room.clientId) return;
          const p = currentPresence[clientId];
          if (!p) return;
          if (!peersMeshes[clientId]) {
            const m = makePeerMarker();
            const peerUsername = p.username;
            if (peerUsername) {
              let h = 0;
              for (let i = 0; i < peerUsername.length; i++) h = (h << 5) - h + peerUsername.charCodeAt(i);
              const col = 0x444444 + (Math.abs(h) % 0xdddddd);
              m.traverse(n => { if (n.isMesh) n.material.color.setHex(col); });
            }
            scene.add(m);
            peersMeshes[clientId] = m;
          }
          const marker = peersMeshes[clientId];
          marker.position.x += (p.x - marker.position.x) * PEER_LERP;
          marker.position.y += (p.y - marker.position.y) * PEER_LERP;
          marker.position.z += (p.z - marker.position.z) * PEER_LERP;
          const s = PEER_BASE_SCALE + Math.min(1.5, (p.score || 0) / PEER_SCORE_DIVISOR);
          marker.scale.setScalar(s);
        });

        Object.keys(peersMeshes).forEach(clientId => {
          if (!currentPresence[clientId]) {
            removeAndDispose(peersMeshes[clientId]);
            delete peersMeshes[clientId];
          }
        });
      });
    } catch (e) {
      console.warn('initMultiplayer failed', e);
      room = null;
    }
  }
  initMultiplayer().catch(err => console.warn('multiplayer init error', err));

  // ---- PlaneController — single steering authority ----
  // Constructor pulls bounds from TUNING, so the steering clamps and the
  // input clamps can NEVER drift apart. The propeller is passed in
  // directly (was implicitly discovered via getObjectByName before the
  // HUD-lock refactor re-parented it out of the plane group).
  const planeController = new PlaneController(plane, propeller, scene);

  // ---- Magnet halo billboard ----
  // Camera-facing sprite (parented to the plane so translation follows,
  // but bank/pitch rotation does NOT — Sprite auto-faces the camera).
  // Visibility gates off state._powerups.magnetUntilMs (existing pickup
  // window) AND state.over (crash sequence). resetGame zeroes the
  // untilMs so the halo hides at the start of every fresh run.
  const magnetHalo = createMagnetHalo();
  plane.add(magnetHalo.sprite);                    // parent for translation; Sprite ignores parent rotation

  // ---- per-frame scratch Vec3s for the propeller HUD-lock math ----
  // Allocate ONCE at world-init; the loop mutates these each frame rather
  // than allocating new Vector3s every RAF tick (avoids GC pressure that
  // would otherwise spike on long sessions).
  const _camFwd = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _bottomRay = new THREE.Vector3();

  // ---- propeller HUD lock ----
  // Each frame we project camera.fov / 2 below the look direction (the
  // viewport's BOTTOM CENTER ray) and step TUNING.PROPELLER_DISTANCE along
  // it. The propeller ends up pinned to the bottom of the viewport
  // regardless of where the plane is in world Y or Z (it stays at viewport-
  // bottom even as the plane climbs near the world bounds).
  //
  // Math derivation:
  //   forward = camera.getWorldDirection (unit vec pointing where camera looks)
  //   right   = forward x camera.up normalised
  //   bottom  = forward rotated -fov/2 around right → pitches the look ray
  //            DOWN by half the vertical viewport angle, putting it on the
  //            bottom edge of the screen.
  //   prop_pos = camera.position + bottom * PROPELLER_DISTANCE
  //
  // Identity quaternion + matching plane.visible keeps the prop world-
  // upright (no bleed from camera tilt — Three.js cameras default to no roll)
  // and hidden during the 5.4s crash sequence (state.over).
  // The function uses hoisted scratch Vec3s allocated at world-init
  // so we don't churn the GC inside the requestAnimationFrame loop.
  function syncPropellerToViewport() {
    if (!propeller || !camera) return;
    camera.getWorldDirection(_camFwd);
    _camRight.crossVectors(_camFwd, camera.up).normalize();
    _bottomRay.copy(_camFwd).applyAxisAngle(_camRight, -camera.fov * 0.5 * Math.PI / 180);
    propeller.position.copy(camera.position).addScaledVector(_bottomRay, TUNING.PROPELLER_DISTANCE);
    // World-upright + spin: PREVIOUSLY this was `propeller.quaternion.identity()`,
    // but Three.js auto-syncs Object3D.rotation ↔ Object3D.quaternion via
    // Euler._onChange → quaternion.setFromEuler (and the reverse), so writing
    // identity to the quaternion forcibly resets rotation.z BASED ON the
    // quaternion, undoing PlaneController's spin write each frame. The HUD
    // prop has been visually frozen at rotation 0 since the HUD-lock refactor.
    // Fix: drive BOTH rotation components from rotation directly — zero out
    // pitch + yaw (x + y), keep the existing spin yaw (z). Pure world-Z-axis
    // rotation is always world-upright (Z is invariant in any axis system),
    // and the auto-syncer won't clobber our write because we set rotation
    // AFTER PlaneController's spin.
    propeller.rotation.set(0, 0, propeller.rotation.z);
    propeller.visible = plane.visible;  // hide during crash
  }

  // ---- collision (AABB-ish) ----
  function checkCollision(b) {
    const px = plane.position.x, py = plane.position.y, pz = plane.position.z;
    const halfW = b.userData.w / 2 + 1.2;
    const halfD = b.userData.d / 2 + 1.2;
    const top    = b.position.y + b.userData.h / 2 + 0.8;
    const bottom = b.position.y - b.userData.h / 2 - 0.8;
    return Math.abs(px - b.position.x) < halfW
        && Math.abs(pz - b.position.z) < halfD
        && py < top && py > bottom;
  }

  // ---- near-miss (0.5m cushion outside the collision AABB) ----
  // Plane AABB dropping inside this shell but outside checkCollision is the
  // "almost crashed" zone — feeds the time-slow / bullet-time trigger in
  // the buildings.updateForSpeed callback (state.timeScaleTarget bump).
  function checkNearMiss(b) {
    const px = plane.position.x, py = plane.position.y, pz = plane.position.z;
    const halfW = b.userData.w / 2 + 1.7;
    const halfD = b.userData.d / 2 + 1.7;
    const top    = b.position.y + b.userData.h / 2 + 1.3;
    const bottom = b.position.y - b.userData.h / 2 - 1.3;
    return Math.abs(px - b.position.x) < halfW
        && Math.abs(pz - b.position.z) < halfD
        && py < top && py > bottom;
  }

  // ---- Powerup effect applier (closure over `state`) ----
  // PULLED INSIDE createWorld: the previous module-scope placement threw
  // ReferenceError on the first pickup because the function referenced
  // `state._powerups` but `state` is declared here. Only one callsite
  // (the per-RAF pickup check in loop()), so defining it next to that
  // callsite keeps the closure obvious and removes the dead-code event
  // dispatch the previous version included.
  function applyPowerupEffect(type, now) {
    const u = state._powerups;
    if (type === 'shield')      u.shieldUntilMs  = now + TUNING.POWERUP_SHIELD_MS;
    else if (type === 'boost')  u.boostUntilMs   = now + TUNING.POWERUP_BOOST_MS;
    else if (type === 'magnet') u.magnetUntilMs  = now + TUNING.POWERUP_MAGNET_MS;
    else if (type === 'score2x')u.score2xUntilMs = now + TUNING.POWERUP_SCORE2X_MS;
    else if (type === 'slowmo') u.slowmoUntilMs  = now + TUNING.POWERUP_SLOWMO_MS;
    else if (type === 'stamina') {
      // 6th type — ONE-SHOT. Refreshes the near-miss bullet-time state
      // machine so the player can re-trigger or extend the slow-mo window
      // without depending on a fresh near-miss. Three mutations:
      //   1. timeScale = NEAR_MISS_TIME_SCALE  → instant slowmo (no slow
      //      lerp-in; the player just collected something, the effect
      //      should kick in NOW rather than ramp over ~120ms).
      //   2. timeScaleTarget = NEAR_MISS_TIME_SCALE → keeps the loop's
      //      `timeScale += (target - timeScale) × …` smooth-lerp from
      //      drifting back to 1.0 during the window.
      //   3. timeScaleUntilMs = max(now, currentUntil) + POWERUP_STAMINA_MS
      //      → covers both cases:    (a) no current slow → fresh window
      //      starts at max(now, 0) + 1200. (b) currently slow → window
      //      extends by 1200ms on top of whatever's left. Reuses existing
      //      release math in `if (now >= state.timeScaleUntilMs) …` so
      //      no new per-powerup release path is needed.
      // No `u.staminaUntilMs` is set — one-shot by design. The HUD chip
      // strip won't render a stamina chip (ui.js POWERUP_CHIPS has no
      // entry for the type), which is correct because there's no
      // remaining-seconds to count down.
      state.timeScale = TUNING.NEAR_MISS_TIME_SCALE;
      state.timeScaleTarget = TUNING.NEAR_MISS_TIME_SCALE;
      state.timeScaleUntilMs = Math.max(now, state.timeScaleUntilMs) + TUNING.POWERUP_STAMINA_MS;
    }
    // Notify UI subscribers (chip pulse + future SFX hooks) without
    // coupling ui.js to gameplay state. Wrapped in try/catch so a
    // roll-back of CustomEvent on very old browsers doesn't crash the
    // pickup path.
    try {
      window.dispatchEvent(new CustomEvent('powerupPickup', { detail: { type } }));
    } catch (_) { /* CustomEvent missing on legacy browsers; state already mutated */ }
  }

  // ---- loop control ----
  let raf = null;
  let _rendererObj = null;
  const clock = new THREE.Clock();

  function startLoop(rendererObj) {
    _rendererObj = rendererObj;
    if (!rendererObj || !rendererObj.renderer) {
      console.warn('startLoop: rendererObj missing; aborting', rendererObj);
      return;
    }
    const renderer = rendererObj.renderer;

    // FIX: cancel prior RAF so retries don't accumulate render callbacks
    stopLoop();
    // We render bg + main scene each frame; toggle autoClear off so the main
    // scene's renderer.render() doesn't blow away the bg scene's color buffer.
    renderer.autoClear = false;

    // Reset visuals + game
    planeController.reset();
    resetGame();

    function loop() {
      raf = requestAnimationFrame(loop);
      try {
        // Near-miss bullet-time: smooth state.timeScale toward target while
        // the game is alive (rate 8/s reaches target in ~120ms — snappy
        // enough to feel like a snap into slow-mo, smooth enough that dt
        // doesn't pop on entry/exit). Post-crash (state.over) we FORCE
        // timeScale = 1.0 so the 3-explosion GIF sequence + 3D burst
        // stagger play at real wall-clock and don't drag out.
        const clockDelta = Math.min(clock.getDelta(), TUNING.MAX_DT_RAW);
        if (state.over) {
          state.timeScale = 1.0;
        } else if (!state.paused) {
          state.timeScale += (state.timeScaleTarget - state.timeScale) * (1 - Math.exp(-8 * clockDelta));
          if (performance.now() >= state.timeScaleUntilMs) state.timeScaleTarget = 1.0;
        }
        const dt = state.paused ? 0 : clockDelta * TUNING.DT_HZ * state.timeScale;

        if (!state.paused) {
          explosion.update(dt);
        }

        // Per-frame gates + multipliers for active powerups (composed once
        // per RAF so the dt-multiplied terms below share them). effSpeed
        // is the live world speed with the boost multiplier layered on; the
        // underlying state.speed accumulates at the normal ramp so the world
        // doesn't carry an inflated baseline after boost expires.
        const now = performance.now();
        const isShield = now < state._powerups.shieldUntilMs;
        const isBoost  = now < state._powerups.boostUntilMs;
        const isMagnet = now < state._powerups.magnetUntilMs;
        const is2x     = now < state._powerups.score2xUntilMs;
        const isSlow   = !state.over && !state.paused && now < state._powerups.slowmoUntilMs;
        const effSpeed = state.speed * (isBoost ? TUNING.POWERUP_BOOST_MULT : 1);
        const scoreMult = is2x ? TUNING.POWERUP_SCORE2X_MULT : 1;

        // Magnet halo: visible only while the magnet window is in
        // flight AND the player is alive. Hiding on state.over keeps
        // the halo off-camera during the 5.4s crash sequence — the
        // 3-explosion GIF would otherwise show a magenta disk through
        // the overlay distractingly.
        magnetHalo.setActive(isMagnet && !state.over && !state.paused, now);

        if (!state.paused) {
          // Slowmo composes with near-miss via min() — whichever demands the
          // slowest dt wins. Without this, a slowmo window would be silently
          // overwritten by a near-miss's release (timeScaleTarget=1.0) at the
          // exact end of NEAR_MISS_DURATION_MS — the bullet-time AND the
          // slowmo both want dt < 1.0.
          if (isSlow) {
            state.timeScaleTarget = Math.min(state.timeScaleTarget, TUNING.POWERUP_SLOWMO_SCALE);
          }

          powerups.update(effSpeed, dt, state.running ? plane.position.z : null, isMagnet, plane.position.x);

          // Pickup detection — cheap O(N) over the small powerup pool. On hit
          // the mesh is disposed inside powerups.checkPickup; we just translate
          // the type into a gameplay effect (state mutation + window event).
          if (state.running) {
            const picked = powerups.checkPickup(plane.position);
            if (picked) applyPowerupEffect(picked, now);
          }

          if (state.running) {
            // Gentle within-level speed ramp (no per-level multiplier — the
            // level-gate reset to SPEED_PER_LEVEL on level-up handles difficulty steps)
            state.speed += TUNING.SPEED_RAMP * dt;

            // Score is explicitly distance-based: higher point system tied to game distance
            const frameDistance = effSpeed * dt;
            state.distanceTraveled += frameDistance;
            state.score += frameDistance * TUNING.SCORE_GAIN * scoreMult;

            // Level advance: each level requires 10% more score than the previous
            if (state.level < NUM_LEVELS) {
              const needed = TUNING.SCORE_PER_LEVEL * Math.pow(TUNING.LEVEL_LENGTH_MULT, state.level - 1);
              if (state.score - state.levelStartScore >= needed) {
                state.level++;
                state.levelStartScore = state.score;
                // Level-gated speed: reset to this level's base speed so each
                // sector has a predictable difficulty floor.
                state.speed = TUNING.SPEED_PER_LEVEL[state.level - 1];
                if (state.level <= NUM_LEVELS) {
                  applyLevelBackground(state.levelOrder[state.level - 1]);
                }
                // Final sector: dramatic atmosphere + HUD announcement
                if (state.level === NUM_LEVELS) {
                  bg.material.color.setHex(FINAL_LEVEL_TINT);
                  scene.fog.color.setHex(FINAL_LEVEL_FOG);
                  try { window.dispatchEvent(new CustomEvent('finalSector')); } catch (_) {}
                }
              }
            }

            // Mission Success trigger: completed max level quota OR reached target score
            const neededForMax = TUNING.SCORE_PER_LEVEL * Math.pow(TUNING.LEVEL_LENGTH_MULT, NUM_LEVELS - 1);
            const maxLevelCompleted = state.level >= NUM_LEVELS && (state.score - state.levelStartScore) >= neededForMax;
            if (!state.won && !state.over && (maxLevelCompleted || state.score >= TARGET_SUCCESS_SCORE)) {
              winGame();
            }

            // Clamp target so the steering input is bounded
            state.target.x = clamp(state.target.x, -TUNING.BOUND_X, TUNING.BOUND_X);
            state.target.y = clamp(state.target.y, TUNING.BOUND_Y_MIN, TUNING.BOUND_Y_MAX);

            // Bridge (target.x/y) -> normalized steering input -> PlaneController
            const boundYRange = TUNING.BOUND_Y_MAX - TUNING.BOUND_Y_MIN;
            const inputX = clamp((state.target.x - plane.position.x) / TUNING.BOUND_X, -1, 1);
            const inputY = clamp((state.target.y - plane.position.y) / boundYRange, -1, 1);
            planeController.update(dt, { x: inputX, y: inputY });

            // Buildings drift + per-building callbacks (passing + score, collision + endGame)
            buildings.updateForSpeed(effSpeed, dt, plane.position.z, b => {
              if (!b.userData.passed && b.position.z > plane.position.z + 4) {
                b.userData.passed = true;
                state.score += TUNING.BUILD_PASS_BONUS;
              }
              // Shield: while active, skip collision checks so the plane
              // sails through one full building before the window expires.
              // Frame-gate is on state.running + !state.over so crashes
              // still register past the shield window (a building already
              // overlapping at the moment of pickup is one example).
              if (!isShield && !state.over && !state.won && checkCollision(b)) {
                endGame();
              } else if (state.running && !state.over && !state.won && checkNearMiss(b)) {
                // Plane is inside the 0.5m shell around the +1.2 collision
                // AABB but not inside the collision AABB itself ("almost
                // crashed"). Per-building cooldown: each building tracks its own
                // last-trigger timestamp in state.lastNearMissByBuilding, so
                // (a) skimming past N distinct buildings in quick succession
                // fires N independent bullet-time windows, and (b) grazing
                // along ONE building for >NEAR_MISS_DURATION_MS refires at
                // most once per window — no sustained slow-mo.
                const now = performance.now();
                const lastForBuilding = state.lastNearMissByBuilding.get(b) || 0;
                if (now - lastForBuilding > TUNING.NEAR_MISS_DURATION_MS) {
                  state.lastNearMissByBuilding.set(b, now);
                  state.timeScaleTarget = TUNING.NEAR_MISS_TIME_SCALE;
                  state.timeScaleUntilMs = now + TUNING.NEAR_MISS_DURATION_MS;
                }
              }
            });

            // Spawn cadence (uses effSpeed so boost compresses the spacing)
            state.spawnTimer += dt;
            const interval = Math.max(
              TUNING.MIN_SPAWN_INTERVAL,
              state.spawnInterval - effSpeed * TUNING.SPAWN_SPEED_PRESSURE
            );
            if (state.spawnTimer >= interval) {
              state.spawnTimer = 0;
              buildings.spawn(TUNING.GENERATION_START_Z - Math.random() * 30);
            }

            // Ground strip scroll (effSpeed so boost speeds visual flow)
            for (const s of strips) {
              s.position.z += effSpeed * TUNING.BUILD_DRIFT_FACTOR * dt;
              if (s.position.z > TUNING.GENERATION_END_Z) {
                s.position.z -= TUNING.STRIP_COUNT * TUNING.STRIP_SPACING;
              }
            }
          }

          // Clouds drift regardless of running (so the start screen is alive)
          for (const c of clouds) {
            c.position.z += (state.running ? effSpeed * TUNING.CLOUD_DRIFT : 0.3) * dt;
            if (c.position.z > 60) {
              c.position.z = -560 - Math.random() * 40;
              c.position.x = (Math.random() - 0.5) * 200;
              c.position.y = 20 + Math.random() * 40;
            }
          }

          // Camera follow (lerp + chase ahead)
          const camTargetX = plane.position.x * CAMERA_TRAIL_FACTOR;
          const camTargetY = plane.position.y + CAMERA_HEIGHT_OFFSET;
          camera.position.x += (camTargetX - camera.position.x) * CAMERA_LERP * dt;
          camera.position.y += (camTargetY - camera.position.y) * CAMERA_LERP * dt;
          camera.position.z = plane.position.z + CAMERA_DISTANCE;
          camera.lookAt(plane.position.x * CAMERA_TRAIL_FACTOR, plane.position.y, plane.position.z - CAMERA_LOOK_AHEAD);

          // Propeller HUD lock — runs every frame BEFORE render so the prop
          // lands at viewport-bottom reflecting THIS frame's camera state.
          // The function uses hoisted scratch Vec3s allocated at world-init
          // so we don't churn the GC inside the requestAnimationFrame loop.
          syncPropellerToViewport();

          // Periodic presence push (only every PRESENCE_INTERVAL_S)
          presenceAccumulator += dt / TUNING.DT_HZ;
          if (presenceAccumulator >= TUNING.PRESENCE_INTERVAL_S) pushPresence(false);
        }

        // bg scene first (full-screen photo), then clear depth and render the
        // main scene on top. The main scene has scene.background=null and the
        // canvas is alpha:true (see renderer.js), so bgScene shows through gaps.
        renderer.clear();
        renderer.render(bg.bgScene, bg.bgCamera);
        renderer.clearDepth();
        renderer.render(scene, camera);
      } catch (err) {
        console.error('world loop error:', err);
        if (raf) { cancelAnimationFrame(raf); raf = null; }
      }
    }

    // Kick off
    raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  // ---- crash stagger helpers ----
  // Pending setTimeout IDs from the staggered 3D-burst schedule installed by
  // endGame. Cleared on retry (resetGame), on dispose, and on ESC-skip via
  // world.cancelCrashStagger() so pending timers never fire after state.over
  // goes back to false (which would spawn 3D bursts into a fresh run).
  let crashStaggerTimers = [];
  function clearCrashStaggerTimers() {
    for (const t of crashStaggerTimers) clearTimeout(t);
    crashStaggerTimers.length = 0;
  }

  // ---- game control ----
  function resetGame() {
    clearCrashStaggerTimers();           // don't keep firing 3D bursts into the new run
    buildings.clear();
    explosion.clear();
    powerups.clear();

    // Reshuffle the 7 level images every run so the progression order varies.
    state.levelOrder = shuffle(Array.from({ length: NUM_LEVELS }, (_, i) => i));
    state.level = 1;
    applyLevelBackground(state.levelOrder[0]);

    const cfg = applyIdeasConfig({ state });
    // Forward the resolved mode (day/night/dusk/dawn) + tint (mint/rose/neon/null)
    // from the new ideas.js token classifier to applyPalette, so player
    // briefings containing 'dusk', 'dawn', 'storm', 'mint', etc. all light up.
    // Legacy `state._night` alias kept for any external consumers reading it.
    state._night = cfg.night;
    applyPalette({
      scene, ground,
      mode: cfg.mode,
      tint: cfg.tint,
      bgMaterial: bg.material,
    });

    state.running = true;
    state.over = false;
    state.won = false;
    state.score = 0;
    state.speed = TUNING.SPEED_PER_LEVEL[0];
    state.spawnTimer = 0;
    state.spawnInterval = TUNING.SPAWN_INTERVAL;
    state.target.x = 0;
    state.target.y = 2;
    state.startTimeMs = performance.now();
    state.timeElapsedMs = 0;
    state.impactAlt = 0;
    state.impactDistance = 0;
    state.distanceTraveled = 0;
    state.levelStartScore = 0;

    // Reset near-miss time-slow so the new run starts at full speed and
    // every building's per-building cooldown map is cleared (previous-run
    // building refs are gone after buildings.clear() above, so a fresh Map
    // is simpler and cheaper than pruning the old one).
    state.timeScale = 1.0;
    state.timeScaleTarget = 1.0;
    state.timeScaleUntilMs = 0;
    state.lastNearMissByBuilding = new Map();

    plane.position.set(0, 2, 0);
    // plane.rotation.y = Math.PI makes the plane face -Z (the direction of
    // motion — the camera looks in -Z, level bands drift in -Z). Without this
    // every reset zeroed rotation and the procedural plane (nose drawn at
    // local +Z) visually flew backwards while banking/pitching correctly.
    // X (pitch) and Z (bank) start at zero and are driven each frame by
    // PlaneController.update; Y is kept constant here because the controller
    // never touches it.
    plane.rotation.set(0, Math.PI, 0);
    plane.visible = true;

    for (let i = 0; i < TUNING.INITIAL_BUILDINGS; i++) {
      buildings.spawn(-120 - i * 40);
    }
    if (state._ideas_enablePowerups) {
      // Cascade mode (storm token matched) doubles the spawn count so
      // player briefings containing 'storm' / 'showers' / 'deluge' visibly
      // flood the spawn lane with 5-type powerup pickups. Same per-spawn
      // spacing pattern as before — only the count + distribution changed.
      const powerupCount = state._ideas_cascade ? 6 : 3;
      // Round-robin across the 5-type catalog so each spawn is a different
      // kind (instead of the prior binary shield/boost alternation). With
      // 3-or-6 spawns every type appears at least once per run.
      const cycle = SHIELD_BOOST_CYCLE;
      for (let i = 0; i < powerupCount; i++) {
        const kind = cycle[i % cycle.length];
        powerups.spawn(-160 - i * 40, kind);
      }
    }

    // Zero the per-type powerup windows so a fresh run starts without
    // carryover buffs from a previous run.
    state._powerups = {
      shieldUntilMs:  0,
      boostUntilMs:   0,
      magnetUntilMs:  0,
      score2xUntilMs: 0,
      slowmoUntilMs:  0,
    };

    // start the engine sound now (we may have a user gesture for it)
    tryStartEngineSound();
  }

  // Shared score finalization used by both winGame() and endGame().
  async function finalizeScore() {
    const final = Math.floor(state.score);
    const isNewBest = final > state.best;
    if (isNewBest) {
      state.best = final;
      localStorage.setItem('kamikazziHiScore', String(final));
    }
    // Cloud sync: best score + leaderboard entry + run history
    try {
      await syncHighScore(final);
      await submitLeaderboard(final, {
        level: state.level,
        distance: state.impactDistance,
        timeMs: state.timeElapsedMs,
        won: state.won,
        timestamp: Date.now(),
      });
    } catch (e) { console.warn('cloud score sync failed', e); }
    try {
      if (room && room.collection) {
        await room.collection('score').create({
          score: final,
          x: plane.position.x, y: plane.position.y, z: plane.position.z,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('persisting score failed', e); }

    // ---- Replay Save for notable runs ----
    // Notable = new personal best, mission success, or score >= 3000
    // (a non-win run that reached late-game / all 8 levels).
    const notableReason = isNewBest ? 'new-best' : state.won ? 'mission-success' : final >= 3000 ? 'high-score' : null;
    if (notableReason) {
      try {
        const grade = computeGrade(final);
        const username = await getUsername() || 'Pilot';
        const screenshotDataUrl = _rendererObj && _rendererObj.renderer
          ? await captureScreenshot(_rendererObj.renderer)
          : null;
        const replay = {
          id: undefined, // filled by saveReplay
          timestamp: Date.now(),
          score: final,
          best: state.best,
          level: state.level,
          distance: state.impactDistance,
          distanceTraveled: state.distanceTraveled,
          altitude: state.impactAlt,
          throttle: (state.speed / (state.baseSpeed || 1)).toFixed(1),
          timeElapsedMs: state.timeElapsedMs,
          won: state.won,
          grade,
          username,
          notableReason,
        };
        await saveReplay(replay, screenshotDataUrl);
        // Notify UI that a new replay was saved
        try { window.dispatchEvent(new CustomEvent('replaySaved', { detail: replay })); } catch (_) {}
      } catch (e) { console.warn('replay save failed', e); }
    }

    pushPresence(true);
    stopEngineSound();
  }

  // Compute performance grade (also used by replay save)
  //   S: ≥ 10,000  (exceptional)
  //   A: ≥  5,000  (mission success)
  //   B: ≥  3,000  (completed all 8 levels)
  //   C: ≥  1,500  (mid-game)
  //   D: <  1,500  (early crash)
  function computeGrade(score) {
    if (score >= 10000) return 'S';
    if (score >=  5000) return 'A';
    if (score >=  3000) return 'B';
    if (score >=  1500) return 'C';
    return 'D';
  }

  // Boot-time cloud sync: pull the freshest high score from Puter
  (async function bootCloudSync() {
    try {
      const cloudBest = await getHighScore();
      if (typeof cloudBest === 'number' && cloudBest > state.best) {
        state.best = cloudBest;
        localStorage.setItem('kamikazziHiScore', String(cloudBest));
      }
      const username = await getUsername();
      if (username) {
        try { window.dispatchEvent(new CustomEvent('puterUserReady', { detail: { username } })); } catch (_) {}
      }
    } catch (_) {}
  })();

  async function winGame() {
    state.running = false;
    state.won = true;
    plane.visible = false;
    state.impactAlt = plane.position.y;
    state.impactDistance = Math.max(0, -plane.position.z);
    state.timeElapsedMs = performance.now() - state.startTimeMs;
    await finalizeScore();
  }

  async function endGame() {
    state.running = false;
    state.over = true;
    plane.visible = false;
    state.impactAlt = plane.position.y;
    state.impactDistance = Math.max(0, -plane.position.z);
    state.timeElapsedMs = performance.now() - state.startTimeMs;

    // Stagger the 3D burst across the 5.4s crash sequence so the on-canvas
    // particles fire at t=0, t=1.8s, t=3.6s in lockstep with the GIF plays in
    // ui.js (both walk the same CRASH_KEYFRAMES table from shared.js, so a
    // future table edit mutates both at once). The defense-in-depth
    // `if (state.over)` check inside each setTimeout ignores already-cancelled
    // timers; clearCrashStaggerTimers() in resetGame / dispose / ESC-skip
    // handles the actual cancellation.
    const crashPos = plane.position.clone();
    clearCrashStaggerTimers();
    // Walk CRASH_KEYFRAMES with a simple running counter instead of computing
    // a slice+reduce cumulative sum at every iteration — the running counter
    // keeps the math obvious and is O(N) overall (was O(N²)). The first burst
    // fires immediately (runningMs starts at 0), then each subsequent setTimeout
    // delay is the gap from the previous burst.
    let runningMs = 0;
    for (let i = 0; i < CRASH_TOTAL_PLAYS; i++) {
      const kf = CRASH_KEYFRAMES[i];
      crashStaggerTimers.push(
        setTimeout(() => {
          if (!state.over) return;
          // Per-keyframe values (warm-orange 'boom' / amber 'burn' / smoke-grey
          // 'ash'; 1.0× → 1.3× → 1.6×) drive both the visual read AND the
          // burst magnitude, locked onto the GIF plays in ui.js.
          //
          // ±0.6m random positional jitter per burst helps the three staggered
          // stages read as spatially distinct clouds instead of one merged
          // cloud. Without jitter, the per-frame multiplicative scale decay
          // (≈0.988 per frame in explosion.js update) keeps ~73% of burst 1's
          // particles alive when burst 2 fires 1.8s later — and all three
          // bursts share crashPos — so warm-orange + amber particles overlap
          // visually and color-blend in the same 3D pocket.
          const burstPos = crashPos.clone();
          burstPos.x += (Math.random() - 0.5) * 1.2;   // ±0.6m
          burstPos.y += (Math.random() - 0.5) * 1.2;
          burstPos.z += (Math.random() - 0.5) * 1.2;
          const paletteIdx = kf.paletteIdx % EXPLOSION_PALETTES.length;
          explosion.spawn(burstPos, { paletteIdx, scale: kf.scale });
        }, runningMs)
      );
      runningMs += kf.intervalMs;
    }
    playImpact();                          // crash SFX (fires once per crash)
    await finalizeScore();
  }

  // ---- engine sound: only play after a user gesture ----
  function tryStartEngineSound() {
    try {
      const audio = plane.userData && plane.userData.engineAudio;
      if (audio && plane.userData.engineAudioReady) audio.play();
    } catch (_) { /* browser blocked autoplay until gesture */ }
  }
  function stopEngineSound() {
    try {
      const audio = plane.userData && plane.userData.engineAudio;
      if (audio && typeof audio.stop === 'function') audio.stop();
    } catch (_) {}
  }

  // ---- ideas API for UI ----
  function addIdea(text, author) {
    try {
      const stored = localStorage.getItem('kamikazziBriefings');
      const list = stored ? JSON.parse(stored) : [];
      list.push({ from: author || 'player', idea: text, ts: Date.now() });
      localStorage.setItem('kamikazziBriefings', JSON.stringify(list));
      window.dispatchEvent(new Event('ideasUpdated'));
    } catch (e) { console.warn('addIdea failed', e); }
  }

  async function sendIdeasToPuter() {
    try {
      const stored = localStorage.getItem('kamikazziBriefings');
      const ideas = stored ? JSON.parse(stored) : [];
      if (typeof window.__puterSendIdeas === 'function') {
        await window.__puterSendIdeas({ score: Math.floor(state.score), timestamp: Date.now(), ideas });
      }
    } catch (_) {}
  }
  async function fetchCommentsFromPuter() {
    if (typeof window.fetchCommentsFromPuter === 'function') return window.fetchCommentsFromPuter();
  }

  // ---- apply AI-driven config (safe parser) ----
  function applyGameChanges(aiOutput) {
    if (!aiOutput) return;
    let parsed = null;
    if (typeof aiOutput === 'string') {
      try { parsed = JSON.parse(aiOutput); }
      catch (e) {
        const m = aiOutput.match(/\{[\s\S]*\}$/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch (e2) { parsed = null; } }
      }
    } else if (typeof aiOutput === 'object') {
      parsed = aiOutput;
    }
    if (!parsed) { console.warn('applyGameChanges: parse failed', aiOutput); return; }

    if (typeof parsed.spawnInterval === 'number') {
      state.spawnInterval = Math.max(6, parsed.spawnInterval);
    }
    if (typeof parsed.baseSpeed === 'number') {
      state.baseSpeed = Math.max(0.1, parsed.baseSpeed);
      state.speed = state.baseSpeed;
    }
    if (typeof parsed.speedMultiplier === 'number') {
      state.baseSpeed = Math.max(0.1, state.baseSpeed * parsed.speedMultiplier);
      state.speed = state.baseSpeed;
    }
    if (typeof parsed.enablePowerups === 'boolean') {
      state._ideas_enablePowerups = parsed.enablePowerups;
    }
    if (parsed.night === true || parsed.night === false) {
      state._night = parsed.night;
      applyPalette({
        scene, ground,
        night: state._night,
        bgMaterial: bg.material,
      });
    }
    if (Number.isInteger(parsed.spawnBuildingCount)) {
      const n = Math.min(8, parsed.spawnBuildingCount);
      for (let i = 0; i < n; i++) {
        buildings.spawn(TUNING.GENERATION_START_Z - Math.random() * 60 - i * 24);
      }
    }
    if (parsed.persistIdeasConfig) {
      try { localStorage.setItem('kamikazziBriefingsCfg', JSON.stringify(parsed)); } catch (_) {}
    }
    console.log('applyGameChanges applied', parsed);
  }

  try { window.applyGameChanges = applyGameChanges; } catch (_) {}

  window.addEventListener('ideasUpdated', async () => {
    try {
      const ideas = JSON.parse(localStorage.getItem('kamikazziBriefings') || '[]');
      const latest = ideas[ideas.length - 1];
      if (!latest) return;
      const text = latest.idea || latest.text || (typeof latest === 'string' ? latest : '');
      if (!text) return;
      if (typeof window.generateFromComment !== 'function') {
        console.warn('ideasUpdated: generateFromComment unavailable');
        return;
      }
      const aiOutput = await window.generateFromComment(text);
      if (!aiOutput) return;
      try { applyGameChanges(aiOutput); }
      catch (err) { console.warn('ideasUpdated: applyGameChanges failed', err); }
    } catch (err) { console.warn('ideasUpdated handler error', err); }
  });

  // ---- plane skin applier ----
  // Applies a generated image texture to the plane's body and wing meshes.
  // Skips transparent materials (cockpit glass) and very-dark materials
  // (propeller / accent) so only the main fuselage and wings are skinned.
  let _currentSkinTexture = null;
  function applyPlaneSkin(imageUrl) {
    if (!imageUrl || !plane) return;
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, tex => {
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 4;
      // Dispose previous skin texture to avoid GPU memory leak
      if (_currentSkinTexture) {
        _currentSkinTexture.dispose();
      }
      _currentSkinTexture = tex;
      plane.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          // Skip transparent (cockpit) and very-dark / nearly-black (prop, accent)
          if (m.transparent) return;
          const col = m.color || new THREE.Color();
          const brightness = (col.r + col.g + col.b) / 3;
          if (brightness < 0.15) return; // skip propeller / very dark accent
          m.map = tex;
          m.needsUpdate = true;
        });
      });
    }, undefined, err => console.warn('applyPlaneSkin failed', err));
  }

  // ---- snapshot (cross-device resume) ----
  async function saveSnapshot() {
    if (!state.running || state.over || state.won) return false;
    const currentLevelBgIdx = state.levelOrder[state.level - 1];
    await saveGameSnapshot({
      score: state.score,
      level: state.level,
      levelOrder: state.levelOrder,
      levelOrderIndex: state.level - 1,
      currentLevelBgIdx,
      speed: state.speed,
      baseSpeed: state.baseSpeed,
      distanceTraveled: state.distanceTraveled,
      timeElapsedMs: performance.now() - state.startTimeMs,
      levelStartScore: state.levelStartScore,
      spawnInterval: state.spawnInterval,
      _ideas_enablePowerups: state._ideas_enablePowerups,
      _night: state._night,
      _ideas_mode: state._ideas_mode,
      _ideas_tint: state._ideas_tint,
      _ideas_cascade: state._ideas_cascade,
      _ideas_recognized: state._ideas_recognized,
    });
    return true;
  }

  async function loadSnapshot(snap) {
    if (!snap) return;
    // Restore core progression state
    state.score = snap.score || 0;
    state.level = snap.level || 1;
    // Cap restored speed to the current level's base so old snapshots from
    // before the level-gated speed refactor don't carry over runaway values.
    const _snapLevel = (snap.level || 1) - 1;
    state.speed = Math.min(snap.speed ?? TUNING.SPEED_PER_LEVEL[0], TUNING.SPEED_PER_LEVEL[_snapLevel] || TUNING.SPEED_PER_LEVEL[0]);
    state.baseSpeed = snap.baseSpeed ?? TUNING.BASE_SPEED;
    state.distanceTraveled = snap.distanceTraveled || 0;
    state.timeElapsedMs = snap.timeElapsedMs || 0;
    state.levelStartScore = snap.levelStartScore || 0;
    state.spawnInterval = snap.spawnInterval || TUNING.SPAWN_INTERVAL;
    state._ideas_enablePowerups = snap._ideas_enablePowerups ?? false;
    state._night = snap._night ?? false;
    state._ideas_mode = snap._ideas_mode || 'day';
    state._ideas_tint = snap._ideas_tint || null;
    state._ideas_cascade = snap._ideas_cascade ?? false;
    state._ideas_recognized = snap._ideas_recognized ?? true;

    // Restore level order and apply the correct background
    if (snap.levelOrder && Array.isArray(snap.levelOrder)) {
      state.levelOrder = snap.levelOrder;
    } else {
      state.levelOrder = shuffle(Array.from({ length: NUM_LEVELS }, (_, i) => i));
    }
    const bgIdx = snap.currentLevelBgIdx ?? state.levelOrder[state.level - 1];
    applyLevelBackground(bgIdx);

    // Apply palette from ideas config
    applyPalette({
      scene, ground,
      mode: state._ideas_mode,
      tint: state._ideas_tint,
      bgMaterial: bg.material,
    });

    // Delete the snapshot so it can't be re-loaded
    await deleteGameSnapshot();
  }

  // ---- expose API ----
  return {
    scene, camera, plane,
    state,
    audioContext: audioListener.context,        // shared Three.js AudioContext for engine, impact, AND any consumer (ui.js powerup SFX) that wants to schedule nodes against the same graph
    pickupSfxBuffers,                            // Map<type, AudioBuffer> — only contains entries whose canonical WAV loaded successfully. ui.js#playTypeTone reads this and falls back to TONE_RECIPES synth when a type is missing
    addIdea, sendIdeasToPuter, fetchCommentsFromPuter,
    startLoop, stopLoop,
    applyPlaneSkin,
    cancelCrashStagger: clearCrashStaggerTimers,
    ensureEngineSound: tryStartEngineSound,
    saveSnapshot,
    loadSnapshot,
    deleteGameSnapshot,
    dispose() {
      stopLoop();
      stopEngineSound();
      stopImpact();
      clearCrashStaggerTimers();
      if (room && typeof room.dispose === 'function') {
        try { room.dispose(); } catch (_) {}
      }
      Object.values(peersMeshes).forEach(m => removeAndDispose(m));
      window.removeEventListener('resize', syncBgAspect);
      bg.dispose();
      explosion.dispose();
      buildings.clear();
      powerups.clear();
      magnetHalo.dispose();
      disposeScene(scene);
    },
  };
}