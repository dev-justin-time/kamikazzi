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

  // ---- Powerups (game/world/powerups.js) — five types ----
  // Type catalog: shield / boost / magnet / score2x / slowmo. Each gets a
  // distinct geometry + colour in powerups.js; effects are applied by
  // world.js after `powerups.checkPickup(plane)` returns a hit.
  POWERUP_PICKUP_RADIUS: 1.6,     // generous AABB around plane center so the player isn't punished for slightly missing
  POWERUP_SHIELD_MS: 3000,         // collision check is skipped while window is active
  POWERUP_BOOST_MS: 4000,
  POWERUP_BOOST_MULT: 1.5,         // applied as state.speed *= BOOST_MULT while active (reverts via the untilMs gate)
  POWERUP_MAGNET_MS: 5000,         // pulls distant powerups toward the plane on their X axis
  POWERUP_MAGNET_RADIUS: 12,       // pull range in world meters (Z-axis proximity)
  POWERUP_MAGNET_PULL: 8,          // X-axis lerp speed per second toward plane.position.x
  POWERUP_SCORE2X_MS: 6000,        // SCORE_GAIN is multiplied by this while active
  POWERUP_SCORE2X_MULT: 2,
  POWERUP_SLOWMO_MS: 3000,         // composes with near-miss via Math.min(timeScaleTarget, SLOWMO_SCALE)
  POWERUP_SLOWMO_SCALE: 0.4,       // dt multiplier during the slowmo window
  POWERUP_STAMINA_MS: 1200,        // 6th type — ONE-SHOT (no DurationKey on POWERUP_TYPES, no _powerups field, no HUD chip). Refreshes the near-miss bullet-time state machine: timeScale = NEAR_MISS_TIME_SCALE for this many ms. Defaults to NEAR_MISS_DURATION_MS but kept separate so a future "longer refresh" tweak is one place

  // dt convention (raw seconds * DT_HZ = "60Hz units") — used everywhere
  DT_HZ: 60,
  MAX_DT_RAW: 0.1,                // clamp on raw seconds before * DT_HZ

  // Networking
  PRESENCE_INTERVAL_S: 0.25,      // push presence to multiplayer at most 4×/sec

  // Near-miss / time-slow ("Matrix bullet-time"): when the plane AABB enters
  // a 0.5m shell around the +1.2m collision AABB (i.e., close-but-not-crash),
  // world dt is multiplied by NEAR_MISS_TIME_SCALE for NEAR_MISS_DURATION_MS,
  // then smoothed back to 1.0. The shell-vs-collision dimensions live in
  // game/world.js#checkNearMiss so they stay in lockstep with checkCollision.
  NEAR_MISS_TIME_SCALE: 0.4,       // dt multiplier during slow-mo (1.0 = full speed)
  NEAR_MISS_DURATION_MS: 1200,     // bullet-time window; target reverts to 1.0 after this

  // Propeller HUD lock (world.js loop() per-frame sync). The propeller is
  // detached from the plane group at world init so it doesn't inherit
  // banking/pitching; each frame it walks a ray cast from camera.position
  // along the viewport BOTTOM edge (camera fov / 2 pitched down) and lands
  // PROPELLER_DISTANCE meters along that ray. Distance is in world meters,
  // not "0 fraction of camera-look".
  //
  // User asked literally for "0 distance ahead of camera" — but objects
  // exactly at camera.position are clipped by the renderer's near plane
  // (camera near = 0.1 in game/renderer.js), so the propeller would be
  // invisible. 4.0 places it at the bottom of the viewport at ~10% of the
  // 36m camera→lookAt distance, well inside the frustum. Tune toward 0
  // (or larger if you want more separation) in TUNING.
  PROPELLER_DISTANCE: 4.0,         // meters along bottom-of-viewport ray from camera
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
// Legacy single-color palette (kept for callers that don't pass opts.palette).
export const EXPLOSION_COLORS = [0xff5722, 0xffc107, 0xff9800, 0xffeb3b];

// Per-burst palettes for the 3 staggered explosions: warm-orange (initial boom)
// → amber (mid burn) → smoke-grey (cool ash). Indexed by burst position so
// world.js endGame can pick a palette without juggling color math.
export const EXPLOSION_PALETTES = [
  [0xff5722, 0xff6a3d, 0xff4500, 0xff8c00],   // 0: warm-orange (initial "boom")
  [0xffc107, 0xffd54f, 0xff9800, 0xffeb3b],   // 1: amber       (mid "burn")
  [0x8c8c8c, 0x6b6b6b, 0x404040, 0xa8a8a8],   // 2: smoke-grey  (cool "ash")
];

// ---------- Assets ----------
// Graffiti decal textures for the building-wall art pass in buildings.js
// buildFace. Backed by /assets/graffiti/ — the entire 9 renderable files in
// that folder (the 10th is level5_bg.xcf, a GIMP source the browser can't
// decode). Spaces in filenames are percent-encoded so XHR fetches don't
// trip over them. Decals are positioned in front of the wall but behind
// the window panes (see buildings.js #decal-z), so windows always occlude
// the decal wherever they overlap — buildings are visibly 'covered' with
// art but windows stay clearly visible.
export const GRAFFITI_ASSETS = [
  '/assets/graffiti/alfabeto3.png',
  '/assets/graffiti/dark%20king.png',
  '/assets/graffiti/KING.png',
  '/assets/graffiti/level2_bg.png',
  '/assets/graffiti/level4_bg.png',
  '/assets/graffiti/levelA5_bg.png',
  '/assets/graffiti/midnight.png',
  '/assets/graffiti/scary%2011.png',
  '/assets/graffiti/sprayman.png',
];

// Ground textures for the world.js main-scene ground plane. Backed by
// /assets/floor/ — the two PNGs in that folder (FLOOR.png, map.png).
// Bound at world init via a synchronous texture-cache lookup (both files
// pre-loaded alongside the level backgrounds), then tiled across the
// 600×1400 ground plane via RepeatWrapping so each instance reads as
// ground-terrain-scale rather than a giant stretched poster.
export const FLOOR_ASSETS = [
  '/assets/floor/FLOOR.png',
  '/assets/floor/map.png',
];

// Crash splash image shown inside the #gameOver overlay when state.over is true.
// 1.webp is a small (291x230) browser-downloaded asset; CSS scales it up so it
// reads as a death splash on the modal.
export const CRASH_SPLASH_URL = '/assets/image/1.webp';

// Per-level photographic backgrounds. The 7 city images in /assets/image/.
// Order is shuffled at every game start (see resetGame in world.js) so the
// per-session progression through 7 levels varies.
export const LEVEL_BACKGROUNDS = [
  '/assets/image/CHICAGO.jpg',
  '/assets/image/China City (1).jpeg',
  '/assets/image/GLENDALE.png',
  '/assets/image/NEON.jpg',
  '/assets/image/NEW_YORK.jpg',
  '/assets/image/NUKE.jpg',
  '/assets/image/Tokyo.jpeg',
  { url: '/assets/image/china.jpg', mode: 'night', bgTint: 0x553366 },
];
export const NUM_LEVELS = LEVEL_BACKGROUNDS.length;
// Score threshold at which the active level advances (level N runs for the
// first (N-1)..N multiples of this constant). 7 levels × 500 = 3500 total.
export const SCORE_PER_LEVEL = 500;
// Target score that triggers the Mission Success screen (in addition to max level).
export const TARGET_SUCCESS_SCORE = 5000;

// Explosion GIF shown 3 sequential times during the crash sequence
// (see ui.js playExplodeStep). Path under assets/image/ so all visual
// assets live in one folder; we expose it here for canonical ownership
// AND pre-load a hidden Image() so the very first crash doesn't stall
// on the GIF's network fetch + decode. The browser dedupes this preload
// with the index.html <img id="explodeImg"> fetch (same URL), and the
// resulting warm HTTP cache + decoded image data means the cache-bust
// '?n=...' src changes done per-play have minimal wire cost.
export const EXPLODE_GIF_URL = '/assets/image/explode.gif';
// Module-level side effect: kicks off the fetch at import time so the
// decoded GIF is warm before the user's first crash.
const _explodeGifPreload = new Image();
_explodeGifPreload.src = EXPLODE_GIF_URL;

// Punchy one-shot impact SFX fired on crash. The loader in world.js tries
// this canonical URL first and falls back to /assets/audio/airplane.wav
// (played as a punchy one-shot, not a loop) if the asset isn't on disk yet.
export const IMPACT_SOUND_URL = '/assets/audio/explosion.wav';

// Per-type pickup SFX URLs (5 powerup types). Drop small WAVs at these
// canonical paths to upgrade the synthesized tones that ui.js plays by
// default. Until a real file is present, the synthesised recipes in
// ui.js#TONE_RECIPES still play — so the SFX layer is non-blocking.
// Coordinates with POWERUP_SHIELD_MS / etc. in TUNING so once dropped
// the asset's duration can replace the synthesized envelope duration.
export const POWERUP_SFX_URLS = {
  shield:  '/assets/audio/powerup-shield.wav',
  boost:   '/assets/audio/powerup-boost.wav',
  magnet:  '/assets/audio/powerup-magnet.wav',
  score2x: '/assets/audio/powerup-score2x.wav',
  slowmo:  '/assets/audio/powerup-slowmo.wav',
  stamina: '/assets/audio/powerup-stamina.wav',
};

// Crash-sequence keyframes. Single source of truth for WHAT happens at each
// stage of the ~2.7s crash — the UI gif plays (ui.js playExplodeStep) and the
// 3D-particle stagger (world.js endGame) walk this same table in lockstep.
//
// Each entry is one play / one 3D burst:
//   - intervalMs: ms AFTER the previous play before this one fires
//                  (first play's intervalMs is the gap from the crash trigger
//                  to its first frame; use ~0 if you want it to start instantly)
//   - paletteIdx: index into EXPLOSION_PALETTES so each burst reads as visually
//                  distinct (warm-orange / amber / smoke-grey etc.)
//   - scale: per-burst scale multiplier for the 3D particles (1.0 = baseline)
//
// Future tweaks are one-line edits: e.g. "5 plays at 750ms each" means
// drop in five new entries each with intervalMs=750 and the desired
// palette/scale ramp. The number of plays is just `.length`.
export const CRASH_KEYFRAMES = [
  { intervalMs: 900, paletteIdx: 0, scale: 1.0 },   // play 1 — warm-orange "boom"
  { intervalMs: 900, paletteIdx: 1, scale: 1.3 },   // play 2 — amber       "burn"
  { intervalMs: 900, paletteIdx: 2, scale: 1.6 },   // play 3 — smoke-grey  "ash"
];
// 1.7s native GIF loop runs concurrently; 900ms gap means plays overlap
// slightly for a denser crash feel. Intentionally uniform so a future
// tweak that wants even pacing only edits the intervalMs field.

// Derived convenience export so callers that just want the play count don't
// touch the table. Recomputed per-import so it stays synchronized with
// CRASH_KEYFRAMES automatically. (Per-play timing + cumulative-sum lookups
// happen in the consumers; keeping that math near the call site avoids
// over-abstraction on a 3-element array.)
export const CRASH_TOTAL_PLAYS = CRASH_KEYFRAMES.length;

// ---------- Background scene (orthographic full-screen quad, contain-fit) ----------
// Renders a single image at correct aspect ratio via a 1×1 plane whose scale
// matches (1) image aspect, (2) screen aspect via ortho frustum aspect.
// The plane is fully contained inside the ortho frustum; the renderer clear
// color fills letterbox/pillarbox bars so night-mode palette can tint them.
// Returns a small API the world loop ticks each frame.
export function createBackgroundScene() {
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,                  // bgMesh uses ortho cam; main scene fog still applies to objects
    color: 0xffffff,             // tint multiplier; 0xffffff = daylight, 0x445577 = night
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  bgScene.add(mesh);

  function setOrthoAspect(screenAspect) {
    if (!Number.isFinite(screenAspect) || screenAspect <= 0) screenAspect = 1;
    if (screenAspect > 1) {
      bgCamera.left = -screenAspect;
      bgCamera.right = screenAspect;
      bgCamera.top = 1;
      bgCamera.bottom = -1;
    } else {
      bgCamera.left = -1;
      bgCamera.right = 1;
      bgCamera.top = 1 / screenAspect;
      bgCamera.bottom = -1 / screenAspect;
    }
    bgCamera.updateProjectionMatrix();
  }

  function setTexture(texture) {
    material.map = texture || null;
    material.needsUpdate = true;
    if (texture) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
    }
  }

  function updateContain(texture) {
    if (!texture || !texture.image || !texture.image.width) {
      // No texture: fall back to a square that fills the ortho frustum so the
      // tints show through uniformly.
      mesh.scale.set(bgCamera.right - bgCamera.left, bgCamera.top - bgCamera.bottom, 1);
      return;
    }
    const IR = texture.image.width / texture.image.height;
    const AR = (bgCamera.right - bgCamera.left) / (bgCamera.top - bgCamera.bottom);
    let sx, sy;
    if (IR > AR) {
      // Image wider than ortho: fill horizontally, bar vertically
      sx = bgCamera.right - bgCamera.left;
      sy = sx / IR;
    } else {
      // Image taller than ortho: fill vertically, bar horizontally
      sy = bgCamera.top - bgCamera.bottom;
      sx = sy * IR;
    }
    mesh.scale.set(sx, sy, 1);
  }

  function setTint(hex) {
    material.color.setHex(hex);
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { bgScene, bgCamera, mesh, material, setTexture, updateContain, setOrthoAspect, setTint, dispose };
}
