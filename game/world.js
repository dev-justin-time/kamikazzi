// /game/world.js
// Orchestrator: composes scene-level objects (lights, ground, clouds, plane)
// with domain managers (buildings, powerups, explosions, ideas, multiplayer).
//
// CHANGES vs the old monolith:
//   - Uses PlaneController for movement (was inline lerp + manual rotation).
//   - Uses shared TUNING constants (no magic numbers here anymore).
//   - Uses shared texture cache + cached geometries/materials everywhere.
//   - Cancels the previous RAF before starting a new loop (no piling RAFs).
//   - Cloud color is now white (was 0xff5a5a red via magic literal).
//   - Periodic presence updates (was once at init, then never again).
//   - Single source of palette (applyIdeasConfig + applyPalette coordinate).
import * as THREE from 'https://esm.sh/three@0.128.0';

import { buildPlane, loadPlaneFromGLB } from './world/plane/factory.js';
import { PlaneController } from './world/plane/controller.js';
import { createBuildingManager } from './world/buildings.js';
import { createExplosionManager } from './world/explosion.js';
import { createPowerupManager } from './world/powerups.js';
import { applyIdeasConfig, applyPalette, SKY_BACKGROUND_URL } from './world/ideas.js';

import {
  TUNING, loadTexture, clamp, removeAndDispose, disposeScene,
} from './world/shared.js';

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

/**
 * Compose the entire world. Returns the public API + bootstraps multiplayer.
 */
export async function createWorld({ scene, camera, domElement, planeModelUrl = null }) {
  // ---- sky background (photographic if available, flat colour fallback) ----
  scene.fog = new THREE.Fog(TUNING.SKY_COLOR, TUNING.DAY_FOG_NEAR, TUNING.DAY_FOG_FAR);
  scene.background = new THREE.Color(TUNING.SKY_COLOR);
  loadTexture(SKY_BACKGROUND_URL).then(tex => {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    tex.center.set(0.5, 0.5);
    if (!state._night) scene.background = tex;
  }).catch(() => { /* fall back to flat color already set */ });

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
  const groundMat = new THREE.MeshLambertMaterial({ color: TUNING.GROUND_COLOR });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 1400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -8;
  ground.position.z = -500;
  ground.receiveShadow = true;
  scene.add(ground);

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
      const listener = new THREE.AudioListener();
      camera.add(listener);
      const audio = new THREE.PositionalAudio(listener);
      obj.add(audio);                         // attach once
      obj.userData.engineAudio = audio;
      obj.userData.engineAudioReady = false;

      const loader = new THREE.AudioLoader();
      loader.load('/airplane.wav', buffer => {
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
  const placeholder = { x: 0, y: 2, z: 0 };
  let plane = null;
  try {
    if (planeModelUrl && typeof planeModelUrl === 'string') {
      plane = await loadPlaneFromGLB(planeModelUrl, { scale: 3.0, castShadow: true, receiveShadow: true });
    }
  } catch (e) {
    console.warn('GLB load failed, falling back to procedural plane', e);
  }
  if (!plane) {
    plane = buildPlane();
    plane.scale.set(3, 3, 3);
  }
  plane.position.set(placeholder.x, placeholder.y, placeholder.z);
  if (plane.rotation) plane.rotation.y += Math.PI;
  plane.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  scene.add(plane);
  attachEngineSoundTo(plane);

  // ---- domain managers ----
  const explosion = createExplosionManager(scene);
  const buildings = createBuildingManager(scene);
  const powerups  = createPowerupManager(scene);

  // ---- game state ----
  const state = {
    running: false,
    over: false,
    score: 0,
    speed: TUNING.STARTING_SPEED,
    baseSpeed: TUNING.BASE_SPEED,
    spawnTimer: 0,
    spawnInterval: TUNING.SPAWN_INTERVAL,
    target: { x: 0, y: 2 },
    best: Number(localStorage.getItem('kamikazziHiScore') || 0),
    _ideas_enablePowerups: false,
    _night: false,
  };

  // ---- multiplayer (best-effort) ----
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
    try {
      if (!room || typeof room.updatePresence !== 'function') return;
      room.updatePresence({
        x: plane.position.x, y: plane.position.y, z: plane.position.z,
        score: Math.floor(state.score), running: !!state.running,
      });
      presenceAccumulator = 0;
    } catch (e) { if (force) console.warn('pushPresence failed', e); }
  }

  async function initMultiplayer() {
    try {
      if (typeof WebsimSocket === 'undefined') return;
      room = new WebsimSocket();
      await room.initialize();
      pushPresence(true);

      room.subscribePresence(currentPresence => {
        Object.keys(currentPresence).forEach(clientId => {
          if (clientId === room.clientId) return;
          const p = currentPresence[clientId];
          if (!p) return;
          if (!peersMeshes[clientId]) {
            const m = makePeerMarker();
            const info = room.peers && room.peers[clientId];
            if (info && info.username) {
              let h = 0;
              for (let i = 0; i < info.username.length; i++) h = (h << 5) - h + info.username.charCodeAt(i);
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
  // input clamps can NEVER drift apart.
  const planeController = new PlaneController(plane, scene);

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

  // ---- loop control ----
  let raf = null;
  const clock = new THREE.Clock();

  function startLoop(rendererObj) {
    if (!rendererObj || !rendererObj.renderer) {
      console.warn('startLoop: rendererObj missing; aborting', rendererObj);
      return;
    }
    const renderer = rendererObj.renderer;

    // FIX: cancel prior RAF so retries don't accumulate render callbacks
    stopLoop();

    // Reset visuals + game
    planeController.reset();
    resetGame();

    function loop() {
      raf = requestAnimationFrame(loop);
      try {
        const dt = Math.min(clock.getDelta(), TUNING.MAX_DT_RAW) * TUNING.DT_HZ;

        explosion.update(dt);
        powerups.update(state.speed, dt, state.running ? plane.position.z : null);

        if (state.running) {
          state.speed += TUNING.SPEED_RAMP * dt;
          state.score += state.speed * dt * TUNING.SCORE_GAIN;

          // Clamp target so the steering input is bounded
          state.target.x = clamp(state.target.x, -TUNING.BOUND_X, TUNING.BOUND_X);
          state.target.y = clamp(state.target.y, TUNING.BOUND_Y_MIN, TUNING.BOUND_Y_MAX);

          // Bridge (target.x/y) -> normalized steering input -> PlaneController
          const boundYRange = TUNING.BOUND_Y_MAX - TUNING.BOUND_Y_MIN;
          const inputX = clamp((state.target.x - plane.position.x) / TUNING.BOUND_X, -1, 1);
          const inputY = clamp((state.target.y - plane.position.y) / boundYRange, -1, 1);
          planeController.update(dt, { x: inputX, y: inputY });

          // Buildings drift + per-building callbacks (passing + score, collision + endGame)
          buildings.updateForSpeed(state.speed, dt, plane.position.z, b => {
            if (!b.userData.passed && b.position.z > plane.position.z + 4) {
              b.userData.passed = true;
              state.score += TUNING.BUILD_PASS_BONUS;
            }
            if (checkCollision(b)) endGame();
          });

          // Spawn cadence
          state.spawnTimer += dt;
          const interval = Math.max(
            TUNING.MIN_SPAWN_INTERVAL,
            state.spawnInterval - state.speed * TUNING.SPAWN_SPEED_PRESSURE
          );
          if (state.spawnTimer >= interval) {
            state.spawnTimer = 0;
            buildings.spawn(TUNING.GENERATION_START_Z - Math.random() * 30);
          }

          // Ground strip scroll
          for (const s of strips) {
            s.position.z += state.speed * TUNING.BUILD_DRIFT_FACTOR * dt;
            if (s.position.z > TUNING.GENERATION_END_Z) {
              s.position.z -= TUNING.STRIP_COUNT * TUNING.STRIP_SPACING;
            }
          }
        }

        // Clouds drift regardless of running (so the start screen is alive)
        for (const c of clouds) {
          c.position.z += (state.running ? state.speed * TUNING.CLOUD_DRIFT : 0.3) * dt;
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

        renderer.render(scene, camera);

        // Periodic presence push (only every PRESENCE_INTERVAL_S)
        presenceAccumulator += dt / TUNING.DT_HZ;
        if (presenceAccumulator >= TUNING.PRESENCE_INTERVAL_S) pushPresence(false);
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

  // ---- game control ----
  function resetGame() {
    buildings.clear();
    explosion.clear();
    powerups.clear();

    const cfg = applyIdeasConfig({ state });
    state._night = cfg.night;
    applyPalette({
      scene, ground,
      skyTexture: scene.background?.isTexture ? scene.background : null,
      night: state._night,
    });

    state.running = true;
    state.over = false;
    state.score = 0;
    state.speed = state.baseSpeed;
    state.spawnTimer = 0;
    state.spawnInterval = TUNING.SPAWN_INTERVAL;
    state.target.x = 0;
    state.target.y = 2;

    plane.position.set(0, 2, 0);
    plane.rotation.set(0, 0, 0);
    plane.visible = true;

    for (let i = 0; i < TUNING.INITIAL_BUILDINGS; i++) {
      buildings.spawn(-120 - i * 40);
    }
    if (state._ideas_enablePowerups) {
      for (let i = 0; i < 3; i++) {
        const kind = i % 2 === TUNING.POWERUP_SHIELD_INDEX ? 'shield' : 'boost';
        powerups.spawn(-160 - i * 40, kind);
      }
    }

    // start the engine sound now (we may have a user gesture for it)
    tryStartEngineSound();
  }

  async function endGame() {
    state.running = false;
    state.over = true;
    plane.visible = false;
    explosion.spawn(plane.position.clone());

    const final = Math.floor(state.score);
    if (final > state.best) {
      state.best = final;
      localStorage.setItem('kamikazziHiScore', String(final));
    }

    try {
      if (room && room.collection) {
        await room.collection('score').create({
          score: final,
          x: plane.position.x, y: plane.position.y, z: plane.position.z,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { console.warn('persisting score failed', e); }

    pushPresence(true);
    stopEngineSound();
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
        skyTexture: scene.background?.isTexture ? scene.background : null,
        night: state._night,
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

  // ---- expose API ----
  return {
    scene, camera, plane,
    state,
    addIdea, sendIdeasToPuter, fetchCommentsFromPuter,
    startLoop, stopLoop,
    ensureEngineSound: tryStartEngineSound,
    dispose() {
      stopLoop();
      stopEngineSound();
      explosion.dispose();
      buildings.clear();
      powerups.clear();
      disposeScene(scene);
    },
  };
}
