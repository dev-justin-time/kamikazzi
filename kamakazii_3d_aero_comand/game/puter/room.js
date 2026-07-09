/* game/puter/room.js
   Extracted from puter-client.js — multiplayer room management:
   Puter KV-based rooms, BroadcastChannel/Websim fallback, unified
   room factory, and game state snapshots for cross-device resume.
*/

import { resolvePuter, getUser } from './auth.js';
import { save, load } from './kv.js';

import { dbg } from '../dbg.js';

const CLOUD_PREFIX = 'kamikazzi3d_';
const SNAPSHOT_KEY = 'GameSnapshot';

// ── Puter KV-based multiplayer room ────────────────────────────

/**
 * Create a multiplayer room backed by Puter KV.
 * Presence is stored in a shared KV key with per-client entries.
 * Old entries (>15s) are expired automatically.
 */
export async function createPuterRoom(roomName = 'kamikazzi-lobby') {
  const p = await resolvePuter();
  if (!p || !p.kv) {
    dbg.warn('Puter room: KV unavailable; multiplayer disabled');
    return null;
  }

  const presenceKey = CLOUD_PREFIX + 'room_' + roomName;
  const clientId = Math.random().toString(36).slice(2, 10);
  const user = await getUser();
  const username = user ? (user.username || user.name || 'Pilot') : 'Guest';

  let presenceCb = null;
  let pollTimer = null;
  let writeTimer = null;
  let lastPresence = null;
  let disposed = false;

  const TTL_MS = 15000;
  const POLL_MS = 3000;
  const WRITE_MS = 2500;

  function expireOld(state) {
    const now = Date.now();
    Object.keys(state).forEach(k => {
      if (now - (state[k].timestamp || 0) > TTL_MS) delete state[k];
    });
    return state;
  }

  async function readState() {
    try {
      const raw = await p.kv.get(presenceKey);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  async function writeState(state) {
    try { await p.kv.set(presenceKey, JSON.stringify(state)); } catch (_) {}
  }

  async function updatePresence(data) {
    if (disposed) return;
    lastPresence = { ...data, username, timestamp: Date.now(), clientId };
    const state = expireOld(await readState());
    state[clientId] = lastPresence;
    await writeState(state);
  }

  function subscribePresence(cb) {
    presenceCb = cb;
    if (pollTimer) clearInterval(pollTimer);
    readState().then(state => {
      if (presenceCb) presenceCb(expireOld(state));
    }).catch(() => {});
    pollTimer = setInterval(async () => {
      if (disposed) return;
      try {
        const state = expireOld(await readState());
        if (presenceCb) presenceCb(state);
      } catch (_) {}
    }, POLL_MS);
  }

  function startHeartbeat() {
    if (writeTimer) clearTimeout(writeTimer);
    async function tick() {
      if (disposed || !lastPresence) return;
      lastPresence.timestamp = Date.now();
      const state = expireOld(await readState());
      state[clientId] = lastPresence;
      await writeState(state);
      if (!disposed) writeTimer = setTimeout(tick, WRITE_MS);
    }
    writeTimer = setTimeout(tick, WRITE_MS);
  }

  function stopHeartbeat() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  }

  function dispose() {
    disposed = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    readState().then(state => {
      delete state[clientId];
      return writeState(state);
    }).catch(() => {});
  }

  return {
    clientId,
    username,
    updatePresence,
    subscribePresence,
    startHeartbeat,
    stopHeartbeat,
    collection: (name) => ({
      create: async (data) => {
        try {
          const key = CLOUD_PREFIX + 'coll_' + name;
          const raw = await p.kv.get(key);
          const arr = raw ? JSON.parse(raw) : [];
          arr.push({ ...data, _clientId: clientId, _ts: Date.now() });
          await p.kv.set(key, JSON.stringify(arr.slice(-100)));
        } catch (_) {}
      },
    }),
    dispose,
  };
}

// ── WebsimSocket-style room (BroadcastChannel + localStorage) ──

const WEBSIM_PREFIX = 'kamikazzi3d_ws_';
const WEBSIM_BROADCAST = 'kamikazzi3d_channel';

/**
 * Create a lightweight peer-mesh room using BroadcastChannel
 * with localStorage polling fallback. Same API surface as
 * createPuterRoom but works without Puter KV.
 */
export async function createWebsimRoom(roomName = 'kamikazzi-lobby') {
  const clientId = Math.random().toString(36).slice(2, 10);
  const username = 'Pilot-' + clientId.slice(0, 4);
  const presenceKey = WEBSIM_PREFIX + 'presence_' + roomName;
  const channelName = WEBSIM_BROADCAST + '_' + roomName;

  let presenceCb = null;
  let pollTimer = null;
  let writeTimer = null;
  let lastPresence = null;
  let disposed = false;
  let bc = null;

  const TTL_MS = 15000;
  const POLL_MS = 3000;
  const WRITE_MS = 2500;

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(channelName);
      bc.onmessage = (ev) => {
        if (disposed || !presenceCb || !ev.data) return;
        if (ev.data._clientId === clientId) return;
        if (ev.data._type === 'presence') {
          const state = readLocalState();
          state[ev.data._clientId] = ev.data.payload;
          presenceCb(expireOld(state));
        }
      };
    }
  } catch (_) { bc = null; }

  function expireOld(state) {
    const now = Date.now();
    Object.keys(state).forEach(k => {
      if (now - (state[k].timestamp || 0) > TTL_MS) delete state[k];
    });
    return state;
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(presenceKey);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function writeLocalState(state) {
    try { localStorage.setItem(presenceKey, JSON.stringify(state)); } catch (_) {}
  }

  async function updatePresence(data) {
    if (disposed) return;
    lastPresence = { ...data, username, timestamp: Date.now(), clientId };
    const state = expireOld(readLocalState());
    state[clientId] = lastPresence;
    writeLocalState(state);
    if (bc) {
      try { bc.postMessage({ _type: 'presence', _clientId: clientId, payload: lastPresence }); } catch (_) {}
    }
  }

  function subscribePresence(cb) {
    presenceCb = cb;
    const state = expireOld(readLocalState());
    if (presenceCb) presenceCb(state);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (disposed) return;
      const state = expireOld(readLocalState());
      if (presenceCb) presenceCb(state);
    }, POLL_MS);
  }

  function startHeartbeat() {
    if (writeTimer) clearTimeout(writeTimer);
    async function tick() {
      if (disposed || !lastPresence) return;
      lastPresence.timestamp = Date.now();
      const state = expireOld(readLocalState());
      state[clientId] = lastPresence;
      writeLocalState(state);
      if (bc) {
        try { bc.postMessage({ _type: 'presence', _clientId: clientId, payload: lastPresence }); } catch (_) {}
      }
      if (!disposed) writeTimer = setTimeout(tick, WRITE_MS);
    }
    writeTimer = setTimeout(tick, WRITE_MS);
  }

  function stopHeartbeat() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  }

  function dispose() {
    disposed = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (bc) { try { bc.close(); } catch (_) {} bc = null; }
    const state = readLocalState();
    delete state[clientId];
    writeLocalState(state);
  }

  return {
    clientId, username,
    updatePresence, subscribePresence,
    startHeartbeat, stopHeartbeat,
    collection: () => ({ create: async () => {} }),
    dispose,
  };
}

/**
 * Unified room factory: tries Puter KV first, falls back to Websim/BroadcastChannel.
 */
export async function createMultiplayerRoom(roomName = 'kamikazzi-lobby') {
  try {
    const puterRoom = await createPuterRoom(roomName);
    if (puterRoom) {
      dbg.log('[Multiplayer] Connected via Puter KV');
      return puterRoom;
    }
  } catch (e) {
    dbg.warn('[Multiplayer] Puter room failed, trying Websim', e);
  }
  try {
    const websimRoom = await createWebsimRoom(roomName);
    dbg.log('[Multiplayer] Connected via Websim (BroadcastChannel)');
    return websimRoom;
  } catch (e) {
    dbg.warn('[Multiplayer] Websim room failed', e);
    return null;
  }
}

// ── Game State Snapshot ────────────────────────────────────────

/**
 * Save the current game state as a cloud snapshot for cross-device resume.
 * @param {object} snapshot
 * @returns {Promise<boolean>}
 */
export async function saveGameSnapshot(snapshot) {
  if (!snapshot) return false;
  const data = {
    ...snapshot,
    timestamp: Date.now(),
    appVersion: '1.0',
  };
  try {
    await save(SNAPSHOT_KEY, data);
    return true;
  } catch (_) { return false; }
}

/**
 * Load the saved game snapshot, if any.
 * @returns {Promise<object|null>}
 */
export async function loadGameSnapshot() {
  try {
    const snap = await load(SNAPSHOT_KEY, null);
    return snap && typeof snap === 'object' && snap.score !== undefined ? snap : null;
  } catch (_) { return null; }
}

/**
 * Delete the saved game snapshot (call when starting a new run).
 */
export async function deleteGameSnapshot() {
  try {
    await save(SNAPSHOT_KEY, null);
  } catch (_) {}
}
