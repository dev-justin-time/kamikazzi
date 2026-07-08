/**
 * mapStorage.js — Unified map save/load with localStorage + Puter KV cloud sync.
 *
 * Provides persistent storage for terrain maps with:
 *   • localStorage as the primary always-available store
 *   • puter.kv cloud sync when the Puter SDK is available (cross-device)
 *   • Export to JSON file download / Import from JSON file upload
 *
 * Data shape per map:
 *   { id, name, timestamp, source, version,
 *     terrainParams, heightData, manualTrees }
 *
 * Usage:
 *   import { saveMap, loadMap, listMaps, deleteMap, exportMap, importMapFromFile } from './mapStorage.js';
 */

const LS_INDEX  = 'kamikazii_map_index';
const LS_PREFIX = 'kamikazii_map_';
const CLOUD_PREFIX = 'kamikazzi3d_map_';
const MAP_VERSION = 1;
const MAX_SAVED_MAPS = 50;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _generateId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function _localGet(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

function _localSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* quota exceeded — silently ignore */ }
}

function _localRemove(key) {
  try { localStorage.removeItem(key); }
  catch { /* noop */ }
}

/** Try to resolve the Puter SDK (global or ESM). */
function _getPuter() {
  if (typeof window !== 'undefined' && window.puter && window.puter.kv) return window.puter;
  return null;
}

async function _cloudSet(key, value) {
  const p = _getPuter();
  if (!p) return false;
  try { await p.kv.set(CLOUD_PREFIX + key, JSON.stringify(value)); return true; }
  catch { return false; }
}

async function _cloudGet(key) {
  const p = _getPuter();
  if (!p) return undefined;
  try {
    const raw = await p.kv.get(CLOUD_PREFIX + key);
    if (raw === undefined || raw === null) return undefined;
    return JSON.parse(raw);
  } catch { return undefined; }
}

async function _cloudRemove(key) {
  const p = _getPuter();
  if (!p) return;
  try { await p.kv.set(CLOUD_PREFIX + key, null); }
  catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// Index management
// ---------------------------------------------------------------------------

function _readIndex() {
  return _localGet(LS_INDEX) || [];
}

function _writeIndex(index) {
  _localSet(LS_INDEX, index);
  // Fire-and-forget cloud sync of the index
  _cloudSet('_index', index).catch(() => {});
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

/** Prepare a map snapshot from live app state. */
export function buildMapSnapshot(name, app) {
  const params = { ...app.terrainParams };
  // Strip non-serializable fields
  delete params.customHeightmap; // contains ImageData pixels — too large; re-import separately

  const snapshot = {
    id: _generateId(),
    name: name || ('Map ' + new Date().toLocaleString()),
    timestamp: Date.now(),
    source: 'local',
    version: MAP_VERSION,
    terrainParams: params,
    heightData: Array.from(app.terrain.heightData),
    manualTrees: (app.decorations && app.decorations.manualTrees)
      ? app.decorations.manualTrees.map(t => ({ ...t })) // preserve all tree properties
      : [],
    hasCustomHeightmap: !!app.terrainParams.customHeightmap,
  };
  if (snapshot.hasCustomHeightmap) {
    console.info('[mapStorage] Custom heightmap image is not saved — terrain will regenerate from parameters.');
  }
  return snapshot;
}

/** Restore a map snapshot back into a live App instance. */
export function applyMapSnapshot(app, snapshot) {
  if (!app || !snapshot) return false;

  // Restore params
  const params = { ...snapshot.terrainParams };
  params.seed = params.seed ?? Math.random();
  params.customHeightmap = null; // not stored
  params.customBiomes = params.customBiomes || [];

  Object.assign(app.terrainParams, params);

  // Regenerate terrain with restored params
  app.generate(false);

  // Restore height data if resolution matches
  if (app.terrain && app.terrain.heightData && snapshot.heightData) {
    const saved = new Float32Array(snapshot.heightData);
    if (saved.length === app.terrain.heightData.length) {
      app.terrain.heightData.set(saved);
      app.refreshTerrain();
    }
  }

  // Restore manually placed trees
  if (snapshot.manualTrees && snapshot.manualTrees.length > 0 && app.decorations) {
    app.decorations.manualTrees = snapshot.manualTrees;
    if (typeof app.decorations.rebuildManual === 'function') {
      app.decorations.rebuildManual();
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API: Save
// ---------------------------------------------------------------------------

/**
 * Save a map to localStorage (always) + puter.kv (when available).
 * @param {object} snapshot — output of buildMapSnapshot()
 * @returns {Promise<object>} the saved snapshot with id
 */
export async function saveMap(snapshot) {
  if (!snapshot || !snapshot.id) throw new Error('saveMap: snapshot must have an id');

  // 1. Write the map data
  _localSet(LS_PREFIX + snapshot.id, snapshot);
  await _cloudSet(snapshot.id, snapshot);

  // 2. Update the index
  const index = _readIndex();
  // Remove duplicate if overwriting
  const filtered = index.filter(e => e.id !== snapshot.id);
  filtered.unshift({ id: snapshot.id, name: snapshot.name, timestamp: snapshot.timestamp });

  // Enforce cap
  while (filtered.length > MAX_SAVED_MAPS) {
    const removed = filtered.pop();
    _localRemove(LS_PREFIX + removed.id);
    _cloudRemove(removed.id);
  }

  _writeIndex(filtered);
  return snapshot;
}

// ---------------------------------------------------------------------------
// Public API: Load
// ---------------------------------------------------------------------------

/**
 * Load a single map by id.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadMap(id) {
  if (!id) return null;

  // Try cloud first
  const cloud = await _cloudGet(id);
  if (cloud) {
    // Also cache locally
    _localSet(LS_PREFIX + id, cloud);
    return cloud;
  }

  // Fallback to local
  return _localGet(LS_PREFIX + id);
}

/**
 * List all saved maps (index entries, newest first).
 * @returns {Promise<Array<{id, name, timestamp}>>}
 */
export async function listMaps() {
  // Try to merge cloud index
  const cloudIdx = await _cloudGet('_index');
  if (Array.isArray(cloudIdx) && cloudIdx.length > 0) {
    const localIdx = _readIndex();
    const merged = _mergeIndexes(localIdx, cloudIdx);
    _writeIndex(merged);
    return merged;
  }
  return _readIndex();
}

function _mergeIndexes(local, cloud) {
  const seen = new Map();
  for (const e of [...local, ...cloud]) {
    if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

// ---------------------------------------------------------------------------
// Public API: Delete
// ---------------------------------------------------------------------------

/**
 * Delete a saved map by id.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteMap(id) {
  if (!id) return;

  _localRemove(LS_PREFIX + id);
  await _cloudRemove(id);

  const index = _readIndex().filter(e => e.id !== id);
  _writeIndex(index);
}

// ---------------------------------------------------------------------------
// Public API: Export / Import
// ---------------------------------------------------------------------------

/**
 * Export a map snapshot as a downloadable JSON file.
 * @param {object} snapshot
 */
export function exportMap(snapshot) {
  if (!snapshot) return;
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (snapshot.name || 'map').replace(/[^a-zA-Z0-9_-]/g, '_') + '.kmap.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a map from a JSON file via file input.
 * @param {File} file
 * @returns {Promise<object|null>} parsed snapshot or null
 */
export function importMapFromFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.terrainParams || !data.heightData) {
          console.warn('mapStorage: invalid map file — missing terrainParams or heightData');
          return resolve(null);
        }
        // Assign fresh id so import doesn't collide
        data.id = _generateId();
        data.timestamp = Date.now();
        data.source = 'import';
        resolve(data);
      } catch (err) {
        console.warn('mapStorage: failed to parse map file', err);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}
