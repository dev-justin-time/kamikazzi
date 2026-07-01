// /game/world/ideas.js
// Reads player-saved "briefings" ("kamikazziBriefings") from localStorage and produces a
// deterministic, *parsed* config object the world can apply.
//
// Was using `window.THREE || self.THREE` and reading `window.__skyBackgroundTexture`,
// which coupled this module to global side-effects. Now: import THREE directly and
// return a plain config — the world applies it in a single place.
import * as THREE from 'https://esm.sh/three@0.128.0';
import { SKY_BACKGROUND_URL, TUNING } from './shared.js';

const KEY = 'kamikazziBriefings';
const NIGHT_KEYWORDS = ['night', 'dark'];
const POWERUP_KEYWORDS = ['powerup', 'shield', 'speed boost'];

/**
 * @returns {{ night: boolean, enablePowerups: boolean }}
 */
export function readIdeasConfig() {
  let combined = '';
  try {
    const stored = localStorage.getItem(KEY);
    const list = stored ? JSON.parse(stored) : [];
    combined = list.map(i => (i.idea || '').toLowerCase()).join(' ');
  } catch (e) {
    combined = '';
  }
  const night = NIGHT_KEYWORDS.some(k => combined.includes(k));
  const enablePowerups = POWERUP_KEYWORDS.some(k => combined.includes(k));
  return { night, enablePowerups };
}

/** Pushed onto `state` so the world loop / resetGame can read it. */
export function applyIdeasConfig({ state }) {
  const cfg = readIdeasConfig();
  state._ideas_enablePowerups = cfg.enablePowerups;
  return cfg;
}

/**
 * Single source of truth for sky / fog / ground palette by time-of-day.
 * Caller passes the photographic sky background texture (from world.js) and a `ground`
 * mesh with a MeshLambertMaterial so we can mutate colour without coupling.
 */
export function applyPalette({ scene, ground, skyTexture, night }) {
  if (night) {
    scene.background = new THREE.Color(TUNING.NIGHT_SKY_COLOR);
    scene.fog = new THREE.Fog(TUNING.NIGHT_SKY_COLOR, TUNING.NIGHT_FOG_NEAR, TUNING.NIGHT_FOG_FAR);
    if (ground && ground.material) ground.material.color.set(TUNING.NIGHT_GROUND_COLOR);
  } else {
    scene.background = skyTexture || new THREE.Color(TUNING.SKY_COLOR);
    scene.fog = new THREE.Fog(TUNING.SKY_COLOR, TUNING.DAY_FOG_NEAR, TUNING.DAY_FOG_FAR);
    if (ground && ground.material) ground.material.color.set(TUNING.GROUND_COLOR);
  }
}

// Expose sky URL for callers that need to preload the photographic background.
export { SKY_BACKGROUND_URL };
