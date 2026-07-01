// /game/world/shared.js
// Cross-cutting concerns used by every domain module.
//
// CRITICAL DESIGN NOTE — skip-shared dispose
// ------------------------------------------
// Window frames/panes use GEOMETRY and MATERIAL that are *intentionally shared*
// across every building. A naive `traverse + dispose()` of one building's
// sub-tree would dispose the shared BoxGeometry (e.g. WINDOW_GEOMETRY.frame)
// that other buildings are rendering. After the first reap, all sibling
// buildings would render against a freed GPU buffer — silent corruption.
//
// To prevent this, every shared resource is registered in SHARED_DISPOSABLES
// (a WeakSet). `removeAndDispose` traverses but SKIPS those.
// Re-registration happens automatically inside getWindowPaneMaterial /
// getExplosionParticleMaterial when a new color is added to the cache.
//
// Anyone introducing a new shared resource MUST call registerShared(...).
import * as THREE from 'https://esm.sh/three@0.128.0';

// ---------- Tuning ----------
export const TUNING = {
  // World bounds
  BOUND_X: 34,
  BOUND_Y_MIN: -4,
  BOUND_Y_MAX: 16,

  // Gameplay
  SPEED_RAMP: 0.00035,            // dt-multiplied per-frame speed increase
  SCORE_GAIN: 0.6,                // dt-multiplied per-frame score
  BASE_SPEED: 0.5,
  STARTING_SPEED: 0.9,
  SPAWN_INTERVAL: 26,
  MIN_SPAWN_INTERVAL: 10,         // clamp on dynamic interval
  SPAWN_SPEED_PRESSURE: 4,        // speed term that tightens interval
  BUILD_PASS_BONUS: 5,
  BUILD_DRIFT_FACTOR: 2.2,        // multiplier on `speed` for building drift
  GENERATION_END_Z: 30,
  GENERATION_START_Z: -200,

  // Ground strips
  STRIP_COUNT: 30,
  STRIP_SPACING: 50,

  // Clouds
  CLOUD_COUNT: 14,
  CLOUD_DRIFT: 1.4,
  CLOUD_COLOR: 0xffffff,          // was 0xff5a5a (rendered angry-red clouds)

  // Palette
  GROUND_COLOR: 0x43d65a,
  STRIP_COLOR: 0x36b84a,
  SKY_COLOR: 0x87ceeb,
  NIGHT_SKY_COLOR: 0x03122b,
  NIGHT_GROUND_COLOR: 0x223322,
  NIGHT_FOG_NEAR: 40,
  NIGHT_FOG_FAR: 200,
  DAY_FOG_NEAR: 60,
  DAY_FOG_FAR: 240,

  // Initial layout
  INITIAL_BUILDINGS: 6,
  POWERUP_SHIELD_INDEX: 0,        // i % 2 === 0 spawns 'shield' (was POWERUP_EVERY_NTH)

  // dt convention (raw seconds * DT_HZ = "60Hz units") — used everywhere
  DT_HZ: 60,
  MAX_DT_RAW: 0.1,                // clamp on raw seconds before * DT_HZ

  // Networking
  PRESENCE_INTERVAL_S: 0.25,      // push presence to multiplayer at most 4×/sec
};

// ---------- Texture cache ----------
const textureCache = new Map();   // url -> Promise<Texture>
export function loadTexture(url, opts = {}) {
  if (textureCache.has(url)) return textureCache.get(url);
  const loader = new THREE.TextureLoader();
  const promise = new Promise((resolve, reject) => {
    loader.load(url, tex => {
      if (opts.sRGB !== false) tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = opts.anisotropy ?? 4;
      resolve(tex);
    }, undefined, err => reject(err));
  });
  textureCache.set(url, promise);
  return promise;
}

// ---------- Clamp ----------
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

// ---------- Disposable registry (skip-shared dispose) ----------
const SHARED_DISPOSABLES = new WeakSet();
function registerShared(...resources) {
  for (const r of resources) {
    if (r) SHARED_DISPOSABLES.add(r);
  }
}

function disposeTraversalSkipShared(root) {
  if (!root) return;
  root.traverse(node => {
    if (node.geometry && !SHARED_DISPOSABLES.has(node.geometry)) {
      try { node.geometry.dispose(); } catch (_) {}
    }
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) {
        if (m && !SHARED_DISPOSABLES.has(m)) {
          try { m.dispose && m.dispose(); } catch (_) {}
        }
      }
    }
  });
}

/** Detach object from its parent and dispose ONLY its non-shared resources. */
export function removeAndDispose(obj) {
  if (!obj) return;
  if (obj.parent) obj.parent.remove(obj);
  disposeTraversalSkipShared(obj);
}

/** Detach every child of `scene` with skip-shared semantics. */
export function disposeScene(scene) {
  if (!scene) return;
  for (const child of scene.children.slice()) removeAndDispose(child);
}

// ---------- Cached window geometries + materials ----------
// Sized for visible reuse across the whole skyline. Exported so buildings.js
// doesn't redefine the same constants.
export const WINDOW_PANE_W = 0.9;
export const WINDOW_PANE_H = 1.1;
export const WINDOW_GAP = 0.9;
export const WINDOW_BORDER = 0.22;
const FRAME_W = WINDOW_PANE_W + WINDOW_BORDER;
const FRAME_H = WINDOW_PANE_H + WINDOW_BORDER;

export const WINDOW_GEOMETRY = {
  frame: new THREE.BoxGeometry(FRAME_W, FRAME_H, 0.08),
  pane:  new THREE.BoxGeometry(WINDOW_PANE_W, WINDOW_PANE_H, 0.06),
};
registerShared(WINDOW_GEOMETRY.frame, WINDOW_GEOMETRY.pane);

export const WINDOW_FRAME_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });
registerShared(WINDOW_FRAME_MATERIAL);

// Pane material varies by glow fill colour, cached per hex and marked shared so
// powerups/explosions garbage-collecting their own meshes never free these.
const windowPaneMaterialCache = new Map();   // hex -> MeshLambertMaterial
export function getWindowPaneMaterial(fillHex) {
  if (windowPaneMaterialCache.has(fillHex)) return windowPaneMaterialCache.get(fillHex);
  const mat = new THREE.MeshLambertMaterial({
    color: fillHex, emissive: fillHex, emissiveIntensity: 0.18,
  });
  windowPaneMaterialCache.set(fillHex, mat);
  registerShared(mat);
  return mat;
}

// ---------- Cached explosion particle geometry + materials ----------
export const EXPLOSION_PARTICLE_GEOMETRY = new THREE.BoxGeometry(0.6, 0.6, 0.6);
registerShared(EXPLOSION_PARTICLE_GEOMETRY);

const explosionMaterialCache = new Map();    // hex -> MeshBasicMaterial
export function getExplosionParticleMaterial(colorHex) {
  if (explosionMaterialCache.has(colorHex)) return explosionMaterialCache.get(colorHex);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex });
  explosionMaterialCache.set(colorHex, mat);
  registerShared(mat);
  return mat;
}

// ---------- Misc domain constants ----------
export const BUILDING_COLORS = [
  0x5c6bc0, 0x26a69a, 0xab47bc, 0xef5350, 0xffa726, 0x42a5f5, 0x55d65f,
];
export const WINDOW_FILL_COLORS = [0xfff3b0, 0xbfe3ff];
export const EXPLOSION_COLORS = [0xff5722, 0xffc107, 0xff9800, 0xffeb3b];

// ---------- Assets ----------
export const GRAFFITI_ASSETS = ['/KKKKKKK.webp', '/Clipboard0EDD2.webp'];
export const SKY_BACKGROUND_URL = '/China City (1).jpeg';
