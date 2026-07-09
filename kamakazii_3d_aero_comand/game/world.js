/* /game/world.js — Refactored Orchestrator
   Originally 1,200+ lines (Dec 2024). Now split into 5 domain modules
   under game/world/:

     - collision.js:    checkCollision, checkNearMiss (pure AABB functions)
     - audio.js:        loadImpactBuffer, loadPickupSfxBuffers, createImpactPlayer
     - engine-sound.js: createEngineSound (looped engine audio)
     - multiplayer.js:  createMultiplayerManager (Puter KV-based presence)
     - loop.js:         createGameLoop (RAF loop, propeller HUD-lock)

   This file remains the single public entry point (exports createWorld).
   It wires the modules together and handles:
     - Scene composition (lights, ground, clouds, strips)
     - State management (state object, resetGame, winGame, endGame)
     - Domain managers (plane, buildings, powerups, explosions)
     - Ideas / AI integration
     - Cloud sync and replay saving
     - Public API assembly
*/

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

// ── Extracted module imports ───────────────────────────────────
import { checkCollision, checkNearMiss } from './world/collision.js';
import { loadImpactBuffer, loadPickupSfxBuffers, createImpactPlayer } from './world/audio.js';
import { createEngineSound } from './world/engine-sound.js';
import { createMultiplayerManager } from './world/multiplayer.js';
import { createGameLoop } from './world/loop.js';
import { dbg } from './dbg.js';

// ── Internal constants ─────────────────────────────────────────
const SUN_POSITION_X = 40;
const SUN_POSITION_Y = 90;
const SUN_POSITION_Z = 30;
const SUN_SHADOW_NEAR = 10;
const SUN_SHADOW_FAR = 260;
const SHADOW_FRUSTUM_HALF = 120;

const PLANE_SPAWN_X = 0;
const PLANE_SPAWN_Y = 2;
const PLANE_SPAWN_Z = 0;

// Powerup spawn cycle — round-robin across the 6 types
const SHIELD_BOOST_CYCLE = ['shield', 'boost', 'stamina', 'magnet', 'score2x', 'slowmo'];

// Model-specific scale factors
const MODEL_SCALES = {
  '/assets/model/rain_1/scene.gltf': 0.5,
  '/assets/model/BOEING/scene.gltf': 0.0035,
};
function getModelScale(url) {
  if (!url) return 3.0;
  return MODEL_SCALES[url] ?? 3.0;
}

// ── createWorld ────────────────────────────────────────────────
export async function createWorld({ scene, camera, domElement, planeModelUrl = null }) {
  // ── Sky background ──
  scene.background = null;
  scene.fog = new THREE.Fog(TUNING.SKY_COLOR, TUNING.DAY_FOG_NEAR, TUNING.DAY_FOG_FAR);

  // ── Shared AudioListener ──
  const audioListener = new THREE.AudioListener();
  camera.add(audioListener);

  const bg = createBackgroundScene();

  // ── Preload all assets in parallel with per-promise timeouts ──
  const bgUrls = LEVEL_BACKGROUNDS.map(entry => typeof entry === 'string' ? entry : entry.url);
  const [bgTextures, impactBufferData, floorTextures, pickupSfxBuffers] = await Promise.all([
    Promise.all(bgUrls.map(url => loadTexture(url).catch(e => { dbg.warn('bg texture load failed', url, e); return null; }))),
    loadImpactBuffer(THREE).catch(e => { dbg.warn('impact buffer load failed', e); return null; }),
    Promise.all(FLOOR_ASSETS.map(url => loadTexture(url).catch(e => { dbg.warn('floor texture load failed', url, e); return null; }))),
    loadPickupSfxBuffers(THREE).catch(e => { dbg.warn('pickup sfx load failed', e); return {}; }),
  ]);
  // Filter out failed loads so downstream code gets clean arrays
  const bgTexturesFiltered = bgTextures.filter(t => t !== null);

  // ── Background aspect sync ──
  const syncBgAspect = () => {
    const w = domElement.clientWidth || window.innerWidth;
    const h = domElement.clientHeight || window.innerHeight;
    const ar = w / h;
    bg.setOrthoAspect(ar > 0 ? ar : 1);
    if (bg.material.map) bg.updateCoverFit(bg.material.map);
  };
  syncBgAspect();
  window.addEventListener('resize', syncBgAspect);

  // ── Level helpers ──
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const applyLevelBackground = idx => {
    const entry = LEVEL_BACKGROUNDS[idx];
    const tex = bgTexturesFiltered[idx % bgTexturesFiltered.length];
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

  // ── Lights ──
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

  // ── Ground + strips ──
  const groundMat = new THREE.MeshLambertMaterial({ color: TUNING.GROUND_COLOR });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 1400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -8;
  ground.position.z = -500;
  ground.receiveShadow = true;
  scene.add(ground);

  const validFloorTex = floorTextures.filter(t => t !== null);
  const groundTex = validFloorTex.length > 0
    ? validFloorTex[Math.floor(Math.random() * validFloorTex.length)]
    : null;
  if (groundTex) {
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(6, 14);
    groundMat.map = groundTex;
    groundMat.needsUpdate = true;
  }

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

  // ── Clouds ──
  const clouds = [];
  let cloudSourceModel = null;

  async function initClouds() {
    try {
      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load('/assets/model/rain_1/scene.gltf', resolve, undefined, reject);
      });
      cloudSourceModel = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!cloudSourceModel) { dbg.warn('initClouds: no scene in GLTF'); return; }

      cloudSourceModel.traverse(node => {
        if (node.isMesh && node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of mats) {
            if (m.color) m.color.setHex(TUNING.CLOUD_COLOR);
            if (m.emissive) m.emissive.setHex(0x444444);
            m.emissiveIntensity = 0.15;
            m.transparent = true;
            m.opacity = 0.78;
            m.depthWrite = true;
          }
        }
      });

      for (let i = 0; i < TUNING.CLOUD_COUNT; i++) {
        const clone = cloudSourceModel.clone(true);
        const s = 0.03 + Math.random() * 0.08;
        clone.scale.set(s, s * (0.6 + Math.random() * 0.8), s);
        clone.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );
        clone.position.set(
          (Math.random() - 0.5) * 200,
          20 + Math.random() * 40,
          -Math.random() * 600
        );
        clone.castShadow = false;
        clone.receiveShadow = false;
        scene.add(clone);
        clouds.push(clone);
      }
    } catch (e) {
      dbg.warn('initClouds: GLTF load failed, using procedural fallback', e);
      initProceduralClouds();
    }
  }

  function initProceduralClouds() {
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
    for (let i = 0; i < TUNING.CLOUD_COUNT; i++) {
      const c = makeCloud();
      c.position.set((Math.random() - 0.5) * 200, 20 + Math.random() * 40, -Math.random() * 600);
      scene.add(c);
      clouds.push(c);
    }
  }

  initClouds();

  // ── Plane ──
  let _currentModelUrl = planeModelUrl;
  const boeingSwapped = { value: false };
  let plane = null, propeller = null;
  try {
    if (planeModelUrl && typeof planeModelUrl === 'string') {
      const built = await loadPlaneFromGLB(planeModelUrl, { scale: getModelScale(planeModelUrl), castShadow: true, receiveShadow: true });
      plane = built.plane;
      propeller = built.propeller;
    }
  } catch (e) {
    dbg.warn('GLB load failed, falling back to procedural plane', e);
  }
  if (!plane) {
    const built = buildPlane();
    plane = built.plane;
    propeller = built.propeller;
    plane.scale.set(3, 3, 3);
  }
  plane.position.set(PLANE_SPAWN_X, PLANE_SPAWN_Y, PLANE_SPAWN_Z);
  if (plane.rotation) plane.rotation.y += Math.PI;
  plane.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  scene.add(plane);
  scene.add(propeller);

  // ── Engine sound (extracted module) ──
  const engineSound = createEngineSound(audioListener, THREE);
  engineSound.attachEngineSoundTo(plane);

  // ── Impact SFX (extracted module) ──
  const impactPlayer = createImpactPlayer(audioListener, impactBufferData, THREE);

  // ── Domain managers ──
  const explosion = createExplosionManager(scene);
  const buildings = createBuildingManager(scene);
  const powerups  = createPowerupManager(scene);

  // ── Game state ──
  const state = {
    running: false, over: false, won: false, paused: false,
    score: 0,
    speed: TUNING.SPEED_PER_LEVEL[0],
    baseSpeed: TUNING.BASE_SPEED,
    spawnTimer: 0,
    spawnInterval: TUNING.SPAWN_INTERVAL,
    target: { x: PLANE_SPAWN_X, y: PLANE_SPAWN_Y },
    best: Number(localStorage.getItem('kamikazziHiScore') || 0),
    startTimeMs: 0, timeElapsedMs: 0,
    impactAlt: 0, impactDistance: 0, distanceTraveled: 0,
    levelStartScore: 0,
    _ideas_enablePowerups: false, _night: false,
    _ideas_mode: 'day', _ideas_tint: null,
    _ideas_cascade: false, _ideas_recognized: true,
    level: 1, levelOrder: [],
    timeScale: 1.0, timeScaleTarget: 1.0, timeScaleUntilMs: 0,
    lastNearMissByBuilding: new Map(),
    _powerups: {
      shieldUntilMs: 0, boostUntilMs: 0, magnetUntilMs: 0,
      score2xUntilMs: 0, slowmoUntilMs: 0,
    },
  };

  // Apply boot-time level background
  state.levelOrder = shuffle(Array.from({ length: NUM_LEVELS }, (_, i) => i));
  applyLevelBackground(state.levelOrder[0]);

  // ── Multiplayer (extracted module) ──
  const multiplayerMgr = createMultiplayerManager({
    scene, state, plane, createMultiplayerRoom, THREE,
  });
  multiplayerMgr.initMultiplayer().catch(err => dbg.warn('multiplayer init error', err));

  // ── PlaneController + Magnet Halo ──
  const planeController = new PlaneController(plane, propeller, scene);
  const magnetHalo = createMagnetHalo();
  plane.add(magnetHalo.sprite);

  // ── Powerup effect applier ──
  function applyPowerupEffect(type, now) {
    const u = state._powerups;
    if (type === 'shield')      u.shieldUntilMs  = now + TUNING.POWERUP_SHIELD_MS;
    else if (type === 'boost')  u.boostUntilMs   = now + TUNING.POWERUP_BOOST_MS;
    else if (type === 'magnet') u.magnetUntilMs  = now + TUNING.POWERUP_MAGNET_MS;
    else if (type === 'score2x')u.score2xUntilMs = now + TUNING.POWERUP_SCORE2X_MS;
    else if (type === 'slowmo') u.slowmoUntilMs  = now + TUNING.POWERUP_SLOWMO_MS;
    else if (type === 'stamina') {
      state.timeScale = TUNING.NEAR_MISS_TIME_SCALE;
      state.timeScaleTarget = TUNING.NEAR_MISS_TIME_SCALE;
      state.timeScaleUntilMs = Math.max(now, state.timeScaleUntilMs) + TUNING.POWERUP_STAMINA_MS;
    }
    try {
      window.dispatchEvent(new CustomEvent('powerupPickup', { detail: { type } }));
    } catch (_) {}
  }

  // ── Plane model swap ──
  async function swapPlaneModel(newModelUrl) {
    if (!newModelUrl || newModelUrl === _currentModelUrl) return;
    dbg.log('swapPlaneModel: upgrading from', _currentModelUrl, 'to', newModelUrl);
    try {
      const built = await loadPlaneFromGLB(newModelUrl, {
        scale: getModelScale(newModelUrl), castShadow: true, receiveShadow: true,
      });
      const newPlane = built.plane;
      const newPropeller = built.propeller;

      const oldPos = plane.position.clone();
      const oldVisible = plane.visible;
      engineSound.stopAll(plane);
      scene.remove(plane);
      scene.remove(propeller);

      newPlane.position.copy(oldPos);
      newPlane.rotation.set(0, Math.PI, 0);
      newPlane.visible = oldVisible;
      newPlane.traverse(n => {
        if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; }
      });
      scene.add(newPlane);
      scene.add(newPropeller);

      plane = newPlane;
      propeller = newPropeller;
      _currentModelUrl = newModelUrl;

      planeController.plane = newPlane;
      planeController.propeller = newPropeller;
      planeController.propellers.length = 0;
      planeController.propellers.push(newPropeller);

      plane.add(magnetHalo.sprite);
      engineSound.attachEngineSoundTo(newPlane);
      engineSound.tryStartEngineSound();

      dbg.log('swapPlaneModel: upgrade complete');
    } catch (err) {
      dbg.warn('swapPlaneModel failed:', err);
    }
  }

  // ── Crash stagger timers ──
  const crashStaggerTimers = [];

  function clearCrashStaggerTimers() {
    for (const t of crashStaggerTimers) clearTimeout(t);
    crashStaggerTimers.length = 0;
  }

  // ── Game control ──
  function resetGame() {
    clearCrashStaggerTimers();
    buildings.clear();
    explosion.clear();
    powerups.clear();

    state.levelOrder = shuffle(Array.from({ length: NUM_LEVELS }, (_, i) => i));
    state.level = 1;
    applyLevelBackground(state.levelOrder[0]);

    const cfg = applyIdeasConfig({ state });
    state._night = cfg.night;
    applyPalette({
      scene, ground, mode: cfg.mode, tint: cfg.tint, bgMaterial: bg.material,
    });

    state.running = true;
    state.over = false;
    state.won = false;
    state.score = 0;
    boeingSwapped.value = false;
    state.speed = TUNING.SPEED_PER_LEVEL[0];
    state.spawnTimer = 0;
    state.spawnInterval = TUNING.SPAWN_INTERVAL;
    state.target.x = PLANE_SPAWN_X;
    state.target.y = PLANE_SPAWN_Y;
    state.startTimeMs = performance.now();
    state.timeElapsedMs = 0;
    state.impactAlt = 0;
    state.impactDistance = 0;
    state.distanceTraveled = 0;
    state.levelStartScore = 0;

    state.timeScale = 1.0;
    state.timeScaleTarget = 1.0;
    state.timeScaleUntilMs = 0;
    state.lastNearMissByBuilding = new Map();

    plane.position.set(PLANE_SPAWN_X, PLANE_SPAWN_Y, PLANE_SPAWN_Z);
    plane.rotation.set(0, Math.PI, 0);
    plane.visible = true;

    for (let i = 0; i < TUNING.INITIAL_BUILDINGS; i++) {
      buildings.spawn(-120 - i * 40);
    }
    if (state._ideas_enablePowerups) {
      const powerupCount = state._ideas_cascade ? 6 : 3;
      const cycle = SHIELD_BOOST_CYCLE;
      for (let i = 0; i < powerupCount; i++) {
        const kind = cycle[i % cycle.length];
        powerups.spawn(-160 - i * 40, kind);
      }
    }

    state._powerups = {
      shieldUntilMs: 0, boostUntilMs: 0, magnetUntilMs: 0,
      score2xUntilMs: 0, slowmoUntilMs: 0,
    };

    engineSound.tryStartEngineSound();
  }

  // ── Score finalization ──
  async function finalizeScore() {
    const final = Math.floor(state.score);
    const isNewBest = final > state.best;
    if (isNewBest) {
      state.best = final;
      localStorage.setItem('kamikazziHiScore', String(final));
    }
    try {
      await syncHighScore(final);
      await submitLeaderboard(final, {
        level: state.level, distance: state.impactDistance,
        timeMs: state.timeElapsedMs, won: state.won, timestamp: Date.now(),
      });
    } catch (e) { dbg.warn('cloud score sync failed', e); }
    try {
      if (multiplayerMgr.room && multiplayerMgr.room.collection) {
        await multiplayerMgr.room.collection('score').create({
          score: final,
          x: plane.position.x, y: plane.position.y, z: plane.position.z,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) { dbg.warn('persisting score failed', e); }

    const notableReason = isNewBest ? 'new-best' : state.won ? 'mission-success' : final >= 3000 ? 'high-score' : null;
    if (notableReason) {
      try {
        const grade = computeGrade(final);
        const username = await getUsername() || 'Pilot';
        const screenshotDataUrl = _rendererObj && _rendererObj.renderer
          ? await captureScreenshot(_rendererObj.renderer) : null;
        const replay = {
          id: undefined, timestamp: Date.now(),
          score: final, best: state.best,
          level: state.level, distance: state.impactDistance,
          distanceTraveled: state.distanceTraveled,
          altitude: state.impactAlt,
          throttle: (state.speed / (state.baseSpeed || 1)).toFixed(1),
          timeElapsedMs: state.timeElapsedMs, won: state.won,
          grade, username, notableReason,
        };
        await saveReplay(replay, screenshotDataUrl);
        try { window.dispatchEvent(new CustomEvent('replaySaved', { detail: replay })); } catch (_) {}
      } catch (e) { dbg.warn('replay save failed', e); }
    }

    multiplayerMgr.pushPresence(true);
    engineSound.stopEngineSound();
  }

  function computeGrade(score) {
    if (score >= 10000) return 'S';
    if (score >=  5000) return 'A';
    if (score >=  3000) return 'B';
    if (score >=  1500) return 'C';
    return 'D';
  }

  // Boot cloud sync
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

  let _rendererObj = null;

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

    const crashPos = plane.position.clone();
    clearCrashStaggerTimers();
    let runningMs = 0;
    for (let i = 0; i < CRASH_TOTAL_PLAYS; i++) {
      const kf = CRASH_KEYFRAMES[i];
      crashStaggerTimers.push(
        setTimeout(() => {
          if (!state.over) return;
          const burstPos = crashPos.clone();
          burstPos.x += (Math.random() - 0.5) * 1.2;
          burstPos.y += (Math.random() - 0.5) * 1.2;
          burstPos.z += (Math.random() - 0.5) * 1.2;
          const paletteIdx = kf.paletteIdx % EXPLOSION_PALETTES.length;
          explosion.spawn(burstPos, { paletteIdx, scale: kf.scale });
        }, runningMs)
      );
      runningMs += kf.intervalMs;
    }
    impactPlayer.playImpact();
    await finalizeScore();
  }

  // ── Ideas / AI ──
  function addIdea(text, author) {
    try {
      const stored = localStorage.getItem('kamikazziBriefings');
      const list = stored ? JSON.parse(stored) : [];
      list.push({ from: author || 'player', idea: text, ts: Date.now() });
      localStorage.setItem('kamikazziBriefings', JSON.stringify(list));
      window.dispatchEvent(new Event('ideasUpdated'));
    } catch (e) { dbg.warn('addIdea failed', e); }
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
    if (!parsed) { dbg.warn('applyGameChanges: parse failed', aiOutput); return; }

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
      applyPalette({ scene, ground, night: state._night, bgMaterial: bg.material });
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
    dbg.log('applyGameChanges applied', parsed);
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
        dbg.warn('ideasUpdated: generateFromComment unavailable');
        return;
      }
      const aiOutput = await window.generateFromComment(text);
      if (!aiOutput) return;
      try { applyGameChanges(aiOutput); } catch (err) { dbg.warn('ideasUpdated: applyGameChanges failed', err); }
    } catch (err) { dbg.warn('ideasUpdated handler error', err); }
  });

  // ── Plane skin ──
  let _currentSkinTexture = null;
  function applyPlaneSkin(imageUrl) {
    if (!imageUrl || !plane) return;
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, tex => {
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 4;
      if (_currentSkinTexture) _currentSkinTexture.dispose();
      _currentSkinTexture = tex;
      plane.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          if (m.transparent) return;
          const col = m.color || new THREE.Color();
          const brightness = (col.r + col.g + col.b) / 3;
          if (brightness < 0.15) return;
          m.map = tex;
          m.needsUpdate = true;
        });
      });
    }, undefined, err => dbg.warn('applyPlaneSkin failed', err));
  }

  // ── Snapshot ──
  async function saveSnapshot() {
    if (!state.running || state.over || state.won) return false;
    const currentLevelBgIdx = state.levelOrder[state.level - 1];
    await saveGameSnapshot({
      score: state.score, level: state.level,
      levelOrder: state.levelOrder, levelOrderIndex: state.level - 1,
      currentLevelBgIdx,
      speed: state.speed, baseSpeed: state.baseSpeed,
      distanceTraveled: state.distanceTraveled,
      timeElapsedMs: performance.now() - state.startTimeMs,
      levelStartScore: state.levelStartScore,
      spawnInterval: state.spawnInterval,
      _ideas_enablePowerups: state._ideas_enablePowerups,
      _night: state._night, _ideas_mode: state._ideas_mode,
      _ideas_tint: state._ideas_tint, _ideas_cascade: state._ideas_cascade,
      _ideas_recognized: state._ideas_recognized,
    });
    return true;
  }

  async function loadSnapshot(snap) {
    if (!snap) return;
    state.score = snap.score || 0;
    state.level = snap.level || 1;
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
    if (snap.levelOrder && Array.isArray(snap.levelOrder)) {
      state.levelOrder = snap.levelOrder;
    } else {
      state.levelOrder = shuffle(Array.from({ length: NUM_LEVELS }, (_, i) => i));
    }
    const bgIdx = snap.currentLevelBgIdx ?? state.levelOrder[state.level - 1];
    applyLevelBackground(bgIdx);
    applyPalette({ scene, ground, mode: state._ideas_mode, tint: state._ideas_tint, bgMaterial: bg.material });
    await deleteGameSnapshot();
  }

  // ── Game loop (extracted module) ──
  const gameLoop = createGameLoop({
    scene, camera, bg, state, plane, propeller,
    clouds, strips,
    explosion, buildings, powerups,
    magnetHalo, planeController,
    boeingSwapped,
    resetGame,
    applyLevelBackground,
    winGame, endGame,
    applyPowerupEffect,
    swapPlaneModel,
    multiplayer: multiplayerMgr,
    checkCollision, checkNearMiss,
  });

  // Capture _rendererObj reference via wrapper so finalizeScore can use it
  const originalStartLoop = gameLoop.startLoop;
  gameLoop.startLoop = (rendererObj) => {
    _rendererObj = rendererObj;
    originalStartLoop(rendererObj);
  };

  // ── Return API ──
  return {
    scene, camera, plane,
    state,
    audioContext: audioListener.context,
    pickupSfxBuffers,
    addIdea, sendIdeasToPuter, fetchCommentsFromPuter,
    startLoop: gameLoop.startLoop,
    stopLoop: gameLoop.stopLoop,
    applyPlaneSkin,
    cancelCrashStagger: clearCrashStaggerTimers,
    ensureEngineSound: engineSound.tryStartEngineSound,
    saveSnapshot,
    loadSnapshot,
    deleteGameSnapshot,
    dispose() {
      gameLoop.stopLoop();
      engineSound.stopAll(plane);
      impactPlayer.stopImpact();
      clearCrashStaggerTimers();
      multiplayerMgr.dispose();
      clouds.length = 0;
      cloudSourceModel = null;
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
