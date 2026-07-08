/* game/puter/replay.js
   Extracted from puter-client.js — replay saving, loading, deletion
   via Puter.fs with localStorage fallback.
   Also includes screenshot capture from the Three.js renderer.
*/

import { resolvePuter } from './auth.js';

const REPLAY_DIR = '/kamikazzi3d/replays';
const LOCAL_REPLAYS_KEY = 'kamikazzi_local_replays';
const MAX_LOCAL_REPLAYS = 10;

function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

function generateReplayId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Capture a PNG screenshot from a Three.js renderer.
 * @param {THREE.WebGLRenderer} renderer
 * @returns {Promise<string|null>} data URL or null
 */
export async function captureScreenshot(renderer) {
  if (!renderer || !renderer.domElement) return null;
  try {
    return renderer.domElement.toDataURL('image/png');
  } catch (e) {
    console.warn('captureScreenshot failed', e);
    return null;
  }
}

/**
 * Save a notable run replay to Puter.fs (with localStorage fallback).
 * @param {object} replay - replay metadata { id, score, level, grade, ... }
 * @param {string|null} screenshotDataUrl - optional PNG data URL
 * @returns {Promise<{id: string, source: string}|null>}
 */
export async function saveReplay(replay, screenshotDataUrl) {
  const id = replay.id || generateReplayId();
  replay.id = id;
  const p = await resolvePuter();
  const hasFs = p && p.fs && typeof p.fs.write === 'function';

  if (hasFs) {
    try { await p.fs.mkdir(REPLAY_DIR); } catch (_) {}
    try { await p.fs.mkdir(`${REPLAY_DIR}/${id}`); } catch (_) {}
    try {
      if (screenshotDataUrl) {
        const blob = dataUrlToBlob(screenshotDataUrl);
        await p.fs.write(`${REPLAY_DIR}/${id}/screenshot.png`, blob);
      }
      await p.fs.write(`${REPLAY_DIR}/${id}/replay.json`, JSON.stringify(replay, null, 2));
      return { id, source: 'cloud' };
    } catch (e) {
      console.warn('saveReplay cloud failed, falling back to local', e);
    }
  }

  // localStorage fallback
  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_REPLAYS_KEY) || '[]');
    local.unshift({ replay });
    while (local.length > MAX_LOCAL_REPLAYS) local.pop();
    localStorage.setItem(LOCAL_REPLAYS_KEY, JSON.stringify(local));
    return { id, source: 'local' };
  } catch (e) {
    console.warn('saveReplay local failed', e);
    return null;
  }
}

/**
 * Load all saved replays, merged from cloud + local.
 * @returns {Promise<Array>} sorted by timestamp descending
 */
export async function getReplays() {
  const p = await resolvePuter();
  const hasFs = p && p.fs && typeof p.fs.readdir === 'function';
  const replays = [];

  if (hasFs) {
    try {
      const dirs = await p.fs.readdir(REPLAY_DIR);
      for (const item of dirs) {
        if (!item.name) continue;
        try {
          const jsonRaw = await p.fs.read(`${REPLAY_DIR}/${item.name}/replay.json`);
          const replay = JSON.parse(jsonRaw);
          replay._source = 'cloud';
          replay._folder = item.name;
          replays.push(replay);
        } catch (_) { /* skip corrupt entries */ }
      }
    } catch (_) { /* directory may not exist yet */ }
  }

  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_REPLAYS_KEY) || '[]');
    for (const entry of local) {
      if (entry && entry.replay) {
        entry.replay._source = 'local';
        replays.push(entry.replay);
      }
    }
  } catch (_) {}

  replays.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return replays;
}

/**
 * Delete a replay by id from cloud and local.
 * @param {string} id
 */
export async function deleteReplay(id) {
  const p = await resolvePuter();
  const hasFs = p && p.fs && typeof p.fs.readdir === 'function';

  if (hasFs) {
    try {
      const dirs = await p.fs.readdir(REPLAY_DIR);
      const match = dirs.find(d => d.name === id);
      if (match) {
        await p.fs.write(`${REPLAY_DIR}/${id}/replay.json`, '');
        await p.fs.write(`${REPLAY_DIR}/${id}/screenshot.png`, '');
      }
    } catch (_) {}
  }

  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_REPLAYS_KEY) || '[]');
    const filtered = local.filter(entry => entry && entry.replay && entry.replay.id !== id);
    localStorage.setItem(LOCAL_REPLAYS_KEY, JSON.stringify(filtered));
  } catch (_) {}
}
