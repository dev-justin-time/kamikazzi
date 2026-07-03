/* puter-client.js
   Unified Puter integration layer for Kamikazzi 3D.

   Features:
   - Auto-detects Puter.js SDK availability (global `puter` or ESM import).
   - Cloud sync: high scores, settings, and run history via puter.kv
     with seamless localStorage fallback when Puter is unavailable.
   - User identity: displays username/avatar when authenticated.
   - Leaderboard: per-user best scores + global top-10 via shared KV namespace.
   - AI: enhanced generateFromComment with retry + structured output.
   - Legacy API-key auth preserved for backward compatibility.

   All async functions are safe to call unconditionally; they resolve
   gracefully (often to localStorage fallbacks) when Puter is absent.
*/

// puter-js SDK: probe named exports first (matches existing ai import pattern),
// then fall back to default / global.
let _aiExport = null;
let _puterExport = null;
try {
  const mod = await import('https://cdn.jsdelivr.net/npm/@heyputer/puter.js/+esm');
  _puterExport = mod.puter || mod.default || mod;
  _aiExport = mod.ai || null;
} catch (_) {
  _puterExport = null;
  _aiExport = null;
}

// ---------------------------------------------------------------------------
// SDK availability probe
// ---------------------------------------------------------------------------
let _puter = null;
let _sdkReady = false;

async function resolvePuter() {
  if (_sdkReady) return _puter;
  // 1) Pre-probed ESM named export
  if (_puterExport && typeof _puterExport === 'object') {
    _puter = _puterExport;
    _sdkReady = true;
    return _puter;
  }
  // 2) Global script tag fallback
  if (typeof window !== 'undefined' && window.puter && typeof window.puter === 'object') {
    _puter = window.puter;
    _sdkReady = true;
    return _puter;
  }
  _puter = null;
  _sdkReady = true;
  return null;
}

export function isPuterAvailable() {
  return !!(_puter || (typeof window !== 'undefined' && window.puter));
}

// ---------------------------------------------------------------------------
// User identity
// ---------------------------------------------------------------------------
let _cachedUser = undefined; // undefined = not yet fetched, null = not authenticated

export async function getUser() {
  if (_cachedUser !== undefined) return _cachedUser;
  const p = await resolvePuter();
  if (!p || !p.auth || typeof p.auth.getUser !== 'function') {
    _cachedUser = null;
    return null;
  }
  try {
    _cachedUser = await p.auth.getUser();
    return _cachedUser;
  } catch (_) {
    _cachedUser = null;
    return null;
  }
}

export async function getUsername() {
  const u = await getUser();
  return u ? (u.username || u.name || 'Pilot') : null;
}

export async function getAvatarUrl() {
  const u = await getUser();
  return u ? (u.avatar_url || u.avatar || null) : null;
}

// Refresh user (e.g. after sign-in event)
export async function refreshUser() {
  _cachedUser = undefined;
  return getUser();
}

// ---------------------------------------------------------------------------
// Unified storage: puter.kv with localStorage fallback
// ---------------------------------------------------------------------------
const CLOUD_PREFIX = 'kamikazzi3d_';
const LOCAL_PREFIX = 'kamikazzi';

async function cloudSet(key, value) {
  const p = await resolvePuter();
  if (!p || !p.kv || typeof p.kv.set !== 'function') return false;
  try {
    await p.kv.set(CLOUD_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (_) { return false; }
}

async function cloudGet(key) {
  const p = await resolvePuter();
  if (!p || !p.kv || typeof p.kv.get !== 'function') return undefined;
  try {
    const raw = await p.kv.get(CLOUD_PREFIX + key);
    if (raw === undefined || raw === null) return undefined;
    return JSON.parse(raw);
  } catch (_) { return undefined; }
}

function localSet(key, value) {
  try { localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value)); } catch (_) {}
}

function localGet(key) {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch (_) { return undefined; }
}

// Cloud sync gate
let _cloudSyncEnabled = true;
export function setCloudSyncEnabled(v) { _cloudSyncEnabled = !!v; }
export function isCloudSyncEnabled() { return _cloudSyncEnabled; }

// Unified write: tries cloud first (if enabled), always writes local as fallback
export async function save(key, value) {
  localSet(key, value);
  if (_cloudSyncEnabled) await cloudSet(key, value);
}

// Unified read: prefers cloud if available, falls back to local
export async function load(key, defaultValue) {
  const cloudVal = await cloudGet(key);
  if (cloudVal !== undefined) {
    // Sync cloud value down to local so offline reads are fresh
    localSet(key, cloudVal);
    return cloudVal;
  }
  const localVal = localGet(key);
  return localVal !== undefined ? localVal : defaultValue;
}

// ---------------------------------------------------------------------------
// High score & run history
// ---------------------------------------------------------------------------
export async function syncHighScore(score) {
  const best = await load('HiScore', 0);
  if (score > best) {
    await save('HiScore', score);
    return score;
  }
  return best;
}

export async function getHighScore() {
  return load('HiScore', 0);
}

export async function recordRun(run) {
  // run = { score, level, distance, timeMs, timestamp, grade?, won? }
  const history = await load('RunHistory', []);
  history.unshift(run);
  const trimmed = history.slice(0, 50); // keep last 50 runs
  await save('RunHistory', trimmed);
  return trimmed;
}

export async function getRunHistory() {
  return load('RunHistory', []);
}

// ---------------------------------------------------------------------------
// Settings sync
// ---------------------------------------------------------------------------
export async function syncSettings(settings) {
  await save('Settings', settings);
}

export async function getSettings() {
  return load('Settings', {});
}

// ---------------------------------------------------------------------------
// Structured KV Collection (per-entry keys + index + atomic vote counters)
// ---------------------------------------------------------------------------
// Replaces monolithic array-in-a-single-key with per-entry storage.
// Each entry gets its own KV key for isolated writes. An index key stores
// entry IDs for listing without loading every entry. Vote counts use
// puter.kv.incr() for atomic increment/decrement (no race conditions).
//
// Internal key scheme (cloudSet/cloudGet add CLOUD_PREFIX automatically):
//   Entry:     coll_<name>_<id>         → kamikazzi3d_coll_<name>_<id>
//   Index:     coll_<name>_idx          → kamikazzi3d_coll_<name>_idx
//   Vote cnt:  coll_<name>_<id>_vc      → kamikazzi3d_coll_<name>_<id>_vc
//
// All methods fall back to localStorage when Puter KV is unavailable.
// ---------------------------------------------------------------------------

const COLL_PREFIX = 'coll_';
const COLL_IDX = '_idx';
const COLL_VC = '_vc';

function _collId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function createKVCollection(name) {
  const entryPre = COLL_PREFIX + name + '_';
  const idxKey  = COLL_PREFIX + name + COLL_IDX;
  const localPre = 'kv_' + name + '_';
  const localIdx = 'kv_' + name + '_idx';

  async function getIdx() {
    const raw = await cloudGet(idxKey);
    return Array.isArray(raw) ? raw : [];
  }

  async function setIdx(ids) {
    await cloudSet(idxKey, ids);
    try { localStorage.setItem(localIdx, JSON.stringify(ids)); } catch (_) {}
  }

  async function getEntry(id) {
    const raw = await cloudGet(entryPre + id);
    if (raw !== undefined) return raw;
    try {
      const local = localStorage.getItem(localPre + id);
      return local ? JSON.parse(local) : null;
    } catch (_) { return null; }
  }

  async function setEntry(id, data) {
    await cloudSet(entryPre + id, data);
    try { localStorage.setItem(localPre + id, JSON.stringify(data)); } catch (_) {}
  }

  async function delEntry(id) {
    await cloudSet(entryPre + id, null);
    try { localStorage.removeItem(localPre + id); } catch (_) {}
  }

  async function getVoteCount(id) {
    // Read vote counter directly from KV (puter.kv.incr stores raw numbers,
    // not JSON strings — so cloudGet with JSON.parse would fail).
    const p = await resolvePuter();
    if (p && p.kv && typeof p.kv.get === 'function') {
      try {
        const raw = await p.kv.get(CLOUD_PREFIX + entryPre + id + COLL_VC);
        if (typeof raw === 'number') return Math.max(0, raw);
        if (raw !== null && raw !== undefined) return Math.max(0, Number(raw));
      } catch (_) {}
    }
    // Fallback: count from entry's votes array in localStorage
    try {
      const local = localStorage.getItem(localPre + id);
      if (local) {
        const entry = JSON.parse(local);
        return (entry.votes || []).length;
      }
    } catch (_) {}
    return -1;
  }

  return {
    /** Create a new entry, add to index. Returns the entry with id. */
    async create(data) {
      const id = _collId();
      const entry = { ...data, id, _createdAt: Date.now() };
      await setEntry(id, entry);
      const ids = await getIdx();
      ids.unshift(id);
      await setIdx(ids);
      return entry;
    },

    /** List entries, newest first. Supports limit, filter fn, optional sort. */
    async list(options = {}) {
      const ids = await getIdx();
      const entries = [];
      for (const id of ids) {
        const entry = await getEntry(id);
        if (entry) {
          entry._voteCount = await getVoteCount(id);
          entries.push(entry);
        }
      }
      let result = typeof options.filter === 'function'
        ? entries.filter(options.filter)
        : entries;
      return result.slice(0, options.limit || 100);
    },

    /** Get a single entry by id. */
    async get(id) {
      const entry = await getEntry(id);
      if (!entry) return null;
      entry._voteCount = await getVoteCount(id);
      return entry;
    },

    /** Update an entry (merges with existing). */
    async update(id, data) {
      const existing = await getEntry(id);
      if (!existing) return null;
      const updated = { ...existing, ...data, id };
      if (data.votes === undefined) updated.votes = existing.votes;
      await setEntry(id, updated);
      return updated;
    },

    /** Remove an entry from both store and index. */
    async remove(id) {
      await delEntry(id);
      const ids = await getIdx();
      await setIdx(ids.filter(i => i !== id));
    },

    /**
     * Atomically increment or decrement the vote counter for an entry.
     * Uses puter.kv.incr() when available; safe from race conditions.
     * Returns the new count, or -1 on failure.
     */
    async incr(id, delta = 1) {
      const p = await resolvePuter();
      if (p && p.kv && typeof p.kv.incr === 'function') {
        try {
          const fullKey = CLOUD_PREFIX + entryPre + id + COLL_VC;
          const result = await p.kv.incr(fullKey, delta);
          return Math.max(0, typeof result === 'number' ? result : 0);
        } catch (_) {}
      }
      return -1;
    },

    /** Count total entries. */
    async count() {
      const ids = await getIdx();
      return ids.length;
    },
  };
}

// Pre-initialized collection instances
const leaderboardColl = createKVCollection('leaderboard');
const powerupColl = createKVCollection('powerups');

// ---------------------------------------------------------------------------
// Leaderboard (per-entry KV with proper queryable index)
// ---------------------------------------------------------------------------

export async function submitLeaderboard(score, meta = {}) {
  const user = await getUser();
  const entry = {
    score,
    username: user ? (user.username || user.name || 'Pilot') : 'Guest',
    avatar: user ? (user.avatar_url || user.avatar || null) : null,
    timestamp: Date.now(),
    ...meta,
  };

  // Personal best sync
  await syncHighScore(score);
  await recordRun({ score, level: meta.level, distance: meta.distance, timeMs: meta.timeMs, timestamp: entry.timestamp, won: meta.won });

  // Store as a structured collection entry
  try {
    if (_cloudSyncEnabled) {
      await leaderboardColl.create(entry);
    }
  } catch (_) {}

  return entry;
}

export async function getLeaderboard(limit = 10, period = 'all') {
  // Build an efficient filter — only load matching entries
  const now = Date.now();
  let cutoff = 0;
  if (period === 'week') cutoff = now - 7 * 24 * 60 * 60 * 1000;
  else if (period === 'month') cutoff = now - 30 * 24 * 60 * 60 * 1000;

  const entries = await leaderboardColl.list({
    limit: 100,
    filter: cutoff > 0 ? e => (e.timestamp || 0) >= cutoff : undefined,
  });

  // Sort by score descending
  entries.sort((a, b) => (b.score || 0) - (a.score || 0));
  return entries.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Legacy API-key client (preserved for backward compatibility)
// ---------------------------------------------------------------------------
let legacyClient = null;
let legacyKey = null;
const SERVICE_NAME = 'kamikazzi-radio';

async function resolvePuterFactory() {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@heyputer/puter.js/+esm');
    if (typeof mod === 'function') return mod;
    if (mod && typeof mod.default === 'function') return mod.default;
    if (mod && typeof mod.puter === 'function') return mod.puter;
    if (mod && typeof mod.default === 'object' && typeof mod.default.puter === 'function') return mod.default.puter;
    if (mod && typeof mod.defaultPuter === 'function') return mod.defaultPuter;
    if (mod && typeof mod.create === 'function') return mod.create;
    return null;
  } catch (_) { return null; }
}

async function createLegacyClient(key) {
  if (!key) return null;
  const factory = await resolvePuterFactory();
  if (!factory) return null;
  try {
    const maybe = factory({ apiKey: key, service: SERVICE_NAME });
    return maybe && typeof maybe.then === 'function' ? await maybe : maybe;
  } catch (_) { return null; }
}

(async function initLegacy() {
  try {
    legacyKey = localStorage.getItem('puterApiKey') || null;
    if (legacyKey) legacyClient = await createLegacyClient(legacyKey);
  } catch (_) { legacyKey = null; legacyClient = null; }
})();

window.setPuterApiKey = async function(key) {
  try {
    if (!key) {
      localStorage.removeItem('puterApiKey');
      legacyClient = null; legacyKey = null;
      return;
    }
    localStorage.setItem('puterApiKey', key);
    legacyKey = key;
    legacyClient = await createLegacyClient(key);
  } catch (_) {}
};

// ---------------------------------------------------------------------------
// Legacy send ideas (kept for compatibility)
// ---------------------------------------------------------------------------
window.__puterSendIdeas = async function(payload) {
  if (!legacyClient || typeof legacyClient.create !== 'function') return;
  try {
    await legacyClient.create({
      type: 'run_feedback',
      data: { score: payload.score, ts: payload.timestamp, ideas: payload.ideas }
    });
  } catch (_) {}
};

window.addSkyIdea = function(text, author) {
  try {
    const key = 'kamikazziBriefings';
    const stored = localStorage.getItem(key);
    const list = stored ? JSON.parse(stored) : [];
    list.push({ from: author || 'player', idea: text, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(list));
    try { window.dispatchEvent(new Event('ideasUpdated')); } catch (_) {}
  } catch (_) {}
};

window.fetchCommentsFromPuter = async function() {
  if (!legacyClient) return;
  try {
    let items = [];
    if (typeof legacyClient.list === 'function') {
      items = await legacyClient.list({ limit: 50 });
      if (Array.isArray(items) && items.length && items[0].data) {
        items = items.map(i => ({ from: i.id || 'remote', idea: (i.data && (i.data.idea || i.data.text || i.data.ideas)) || JSON.stringify(i.data), ts: i.created_at || Date.now() }));
      }
    } else if (typeof legacyClient.query === 'function') {
      const res = await legacyClient.query({ type: 'run_feedback', limit: 50 });
      items = Array.isArray(res) ? res : (res && res.items) || [];
    }
    if (Array.isArray(items) && items.length) {
      const normalized = items.map(it => {
        if (typeof it === 'string') return { from: 'remote', idea: it, ts: Date.now() };
        if (it && it.idea) return it;
        if (it && it.data && typeof it.data === 'string') return { from: it.id || 'remote', idea: it.data, ts: it.created_at || Date.now() };
        if (it && it.data && it.data.ideas) return { from: it.id || 'remote', idea: Array.isArray(it.data.ideas) ? it.data.ideas.join(' | ') : String(it.data.ideas), ts: it.created_at || Date.now() };
        return { from: it.id || 'remote', idea: JSON.stringify(it), ts: Date.now() };
      });
      const key = 'kamikazziBriefings';
      const local = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = new Set(local.map(i => (i.idea || '').trim()));
      normalized.forEach(n => { if (!existing.has((n.idea || '').trim())) local.push(n); });
      localStorage.setItem(key, JSON.stringify(local));
      try { window.dispatchEvent(new Event('ideasUpdated')); } catch (_) {}
    }
  } catch (_) {}
};

// ---------------------------------------------------------------------------
// AI: generateFromComment with structured output + retry
// ---------------------------------------------------------------------------
export async function generateFromComment(text) {
  if (!text) return null;
  const p = await resolvePuter();
  const aiInstance = (p && p.ai) || _aiExport || (typeof ai !== 'undefined' ? ai : null);
  if (!aiInstance || !aiInstance.chat || !aiInstance.chat.completions) return null;
  return _doAiChat(aiInstance, text);
}

async function _doAiChat(aiInstance, text) {
  const systemPrompt = `You are a game-config generator for Kamikazzi 3D. Respond ONLY with valid JSON. No markdown, no explanations.

Available fields (all optional):
- spawnInterval: number (seconds between building spawns)
- baseSpeed: number (plane base speed)
- speedMultiplier: number (multiply current baseSpeed)
- enablePowerups: boolean
- night: boolean
- spawnBuildingCount: integer (extra buildings to spawn now)
- persistIdeasConfig: boolean (save this config to localStorage)

Example response:
{"enablePowerups":true,"night":false,"spawnInterval":20}`;

  try {
    const response = await aiInstance.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      max_tokens: 256,
    });
    let content = null;
    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      content = response.choices[0].message.content;
    } else if (response && response.choices && response.choices[0] && response.choices[0].text) {
      content = response.choices[0].text;
    } else if (response && response.content) {
      content = response.content;
    }
    if (!content) return null;
    // Try to extract JSON if wrapped in markdown
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/```\s*([\s\S]*?)```/);
    if (jsonMatch) content = jsonMatch[1].trim();
    // Validate it's parseable
    JSON.parse(content);
    return content;
  } catch (_) {
    return null;
  }
}

// Backward-compat global
window.generateFromComment = generateFromComment;

// ---------------------------------------------------------------------------
// Real-time room presence (replaces WebsimSocket)
// ---------------------------------------------------------------------------
// Uses a shared KV key for presence state. Each client periodically does a
// read-modify-write on the key, and polls for peer updates. Old entries
// (>15s) are expired automatically. This is simple, invite-code-free, and
// works with Puter's proven KV APIs without requiring WebRTC or channels.
//
// NOTE: Multiple clients concurrently RMW the same key, so transient
// overwrites are possible. The heartbeat refreshes every 2.5s, so any
// lost write is repaired quickly. Acceptable for casual arcade presence.
//
// Architecture:
//   - Shared key: kamikazzi3d_room_<roomName>
//   - Value: { [clientId]: { x, y, z, score, running, username, timestamp } }
//   - Write interval: 2.5s (while running)
//   - Poll interval: 3s
//   - Entry TTL: 15s
//
// Race conditions on the shared key are acceptable for casual presence:
// the next write within 2.5s will repair any transient loss.
// ---------------------------------------------------------------------------

export async function createPuterRoom(roomName = 'kamikazzi-lobby') {
  const p = await resolvePuter();
  if (!p || !p.kv) {
    console.warn('Puter room: KV unavailable; multiplayer disabled');
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
    try {
      await p.kv.set(presenceKey, JSON.stringify(state));
    } catch (_) {}
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
    // Immediate first poll
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

  // Heartbeat: even when the player isn't moving, refresh our timestamp
  // so we don't get expired by other clients' cleanup.
  // Uses recursive setTimeout instead of setInterval to prevent overlapping
  // executions when KV read-modify-write takes longer than WRITE_MS.
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
    if (writeTimer) { clearInterval(writeTimer); writeTimer = null; }
    // Best-effort self-removal from shared state
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
    // Compatibility shim for world.js finalizeScore() which calls room.collection('score').create()
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

// ---------------------------------------------------------------------------
// AI Image Generation
// ---------------------------------------------------------------------------
export async function generateImage(prompt, options = {}) {
  if (!prompt) return null;
  const p = await resolvePuter();
  if (!p || !p.ai || typeof p.ai.txt2img !== 'function') {
    console.warn('Puter image generation unavailable');
    return null;
  }
  try {
    const result = await p.ai.txt2img(prompt, {
      size: options.size || '512x512',
      ...options,
    });
    // Result may be a File, HTMLImageElement, or object with src
    if (result instanceof File) {
      // Convert File to a persistent data URL so it survives localStorage
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(result);
      });
    }
    if (result instanceof HTMLImageElement) {
      return result.src;
    }
    if (result && typeof result.src === 'string') {
      return result.src;
    }
    if (result && typeof result.url === 'string') {
      return result.url;
    }
    return null;
  } catch (e) {
    console.warn('generateImage failed', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Replay Save (screenshot + telemetry JSON via puter.fs)
// ---------------------------------------------------------------------------
// Saves notable runs to /kamikazzi3d/replays/<id>/screenshot.png + replay.json.
// Falls back to localStorage when Puter.fs is unavailable.

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

export async function captureScreenshot(renderer) {
  if (!renderer || !renderer.domElement) return null;
  try {
    return renderer.domElement.toDataURL('image/png');
  } catch (e) {
    console.warn('captureScreenshot failed', e);
    return null;
  }
}

export async function saveReplay(replay, screenshotDataUrl) {
  const id = replay.id || generateReplayId();
  replay.id = id;
  const p = await resolvePuter();
  const hasFs = p && p.fs && typeof p.fs.write === 'function';

  if (hasFs) {
    try {
      await p.fs.mkdir(REPLAY_DIR);
    } catch (_) { /* dir may already exist */ }
    try {
      await p.fs.mkdir(`${REPLAY_DIR}/${id}`);
    } catch (_) { /* dir may already exist */ }
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

  // localStorage fallback — skip the screenshot to stay within the ~5MB
  // quota (base64 PNGs are ~200KB-1MB each; 10 would blow the limit).
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

  // Also merge localStorage fallback replays
  try {
    const local = JSON.parse(localStorage.getItem(LOCAL_REPLAYS_KEY) || '[]');
    for (const entry of local) {
      if (entry && entry.replay) {
        entry.replay._source = 'local';
        entry.replay._screenshotDataUrl = entry.screenshotDataUrl;
        replays.push(entry.replay);
      }
    }
  } catch (_) {}

  replays.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return replays;
}

export async function deleteReplay(id) {
  const p = await resolvePuter();
  const hasFs = p && p.fs && typeof p.fs.readdir === 'function';

  if (hasFs) {
    try {
      const dirs = await p.fs.readdir(REPLAY_DIR);
      const match = dirs.find(d => d.name === id);
      if (match) {
        // Puter.fs doesn't have rm/rmdir in all versions; try best-effort
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

// ---------------------------------------------------------------------------
// WebsimSocket-style multiplayer room (serverless, BroadcastChannel + localStorage fallback)
// ---------------------------------------------------------------------------
// Provides the same API surface as createPuterRoom so world.js can use
// either transparently. Uses BroadcastChannel for same-origin cross-tab
// real-time, falling back to localStorage polling for older browsers.
// This "restores" the legacy WebsimSocket behaviour as a lightweight
// peer-mesh when Puter KV is unavailable.
// ---------------------------------------------------------------------------

const WEBSIM_PREFIX = 'kamikazzi3d_ws_';
const WEBSIM_BROADCAST = 'kamikazzi3d_channel';

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

  // BroadcastChannel for real-time cross-tab sync
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
    // Immediate first callback
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
    clientId,
    username,
    updatePresence,
    subscribePresence,
    startHeartbeat,
    stopHeartbeat,
    collection: () => ({ create: async () => {} }),
    dispose,
  };
}

// Unified room factory: tries Puter first, falls back to Websim
export async function createMultiplayerRoom(roomName = 'kamikazzi-lobby') {
  try {
    const puterRoom = await createPuterRoom(roomName);
    if (puterRoom) {
      console.log('[Multiplayer] Connected via Puter KV');
      return puterRoom;
    }
  } catch (e) {
    console.warn('[Multiplayer] Puter room failed, trying Websim', e);
  }
  try {
    const websimRoom = await createWebsimRoom(roomName);
    console.log('[Multiplayer] Connected via Websim (BroadcastChannel)');
    return websimRoom;
  } catch (e) {
    console.warn('[Multiplayer] Websim room failed', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Text-to-Speech (Puter.ai txt2speech with queue & caching)
// ---------------------------------------------------------------------------
// Synthesises speech for in-game announcements (powerup pickups, sector
// alerts) via puter.ai.txt2speech(). Falls back silently when Puter is
// unavailable — the game plays tones regardless, so TTS is a bonus layer.
//
// A simple queue prevents overlapping speech: each call appends to a
// FIFO list, and the queue processor plays one at a time. If a new
// announcement arrives while one is speaking, it queues behind the
// current one — so a fast double-pickup says both phrases in sequence.
//
// Short phrases are cached (Map<string, Audio>) so repeating pickups
// of the same type don't re-synthesise every time, which saves credits
// and latency (the cache persists for the page lifetime).

const _ttsCache = new Map();
const _ttsQueue = [];
let _ttsPlaying = false;
const _ttsMaxCache = 20;

// Capped-size FIFO eviction for the TTS cache so it doesn't grow unbounded
// over a long play session.
function _ttsCacheSet(key, audio) {
  if (_ttsCache.size >= _ttsMaxCache) {
    const firstKey = _ttsCache.keys().next().value;
    if (firstKey !== undefined) _ttsCache.delete(firstKey);
  }
  _ttsCache.set(key, audio);
}

async function _ttsProcessQueue() {
  if (_ttsPlaying || _ttsQueue.length === 0) return;
  _ttsPlaying = true;
  const { text, cacheKey } = _ttsQueue.shift();
  try {
    // Check cache first
    let audio = _ttsCache.get(cacheKey);
    if (!audio) {
      const p = await resolvePuter();
      if (!p || !p.ai || typeof p.ai.txt2speech !== 'function') {
        _ttsPlaying = false;
        _ttsProcessQueue(); // process next item
        return;
      }
      audio = await p.ai.txt2speech(text, {
        provider: 'aws-polly',
        // Neutral, clear voice suitable for in-game HUD announcements
        voice: 'Matthew',
      });
      if (audio) _ttsCacheSet(cacheKey, audio);
    }
    if (audio && typeof audio.play === 'function') {
      // Lower volume so TTS doesn't overpower the engine roar
      audio.volume = 0.55;
      audio.addEventListener('ended', () => {
        _ttsPlaying = false;
        _ttsProcessQueue();
      }, { once: true });
      audio.play().catch(() => {
        // Browser may block autoplay — silently skip
        _ttsPlaying = false;
        _ttsProcessQueue();
      });
    } else {
      _ttsPlaying = false;
      _ttsProcessQueue();
    }
  } catch (_) {
    _ttsPlaying = false;
    _ttsProcessQueue();
  }
}

/**
 * Speak a phrase via Puter TTS. Queued so announcements don't overlap.
 * @param {string} text - Text to synthesize (<3000 chars per Puter limit)
 * @param {string} [cacheKey] - Optional cache key (defaults to text).
 *        Use a short key like 'powerup.shield' to group variations.
 */
export function speak(text, cacheKey) {
  if (!text) return;
  _ttsQueue.push({ text, cacheKey: cacheKey || text });
  if (!_ttsPlaying) _ttsProcessQueue();
}

// ---------------------------------------------------------------------------
// Game State Snapshot (cross-device resume)
// ---------------------------------------------------------------------------
// Saves a compact snapshot of the current in-game session (score, level,
// progression, config) to Puter KV so the player can resume across devices.
// The snapshot is stored under a well-known key scoped per-user and is
// automatically cleaned up when a new run starts.

const SNAPSHOT_KEY = 'GameSnapshot';

/**
 * Save the current game state as a cloud snapshot for cross-device resume.
 * @param {object} snapshot - { score, level, levelOrder, speed, baseSpeed,
 *        distanceTraveled, levelStartScore, timeElapsedMs, ideas, powerups,
 *        _night, _ideas_mode, _ideas_tint, _ideas_cascade, _ideas_enablePowerups,
 *        timestamp, levelOrderIndex }
 * @returns {Promise<boolean>} true if snapshot was saved to cloud
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
 * @returns {Promise<object|null>} snapshot object or null
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

// ---------------------------------------------------------------------------
// Community Powerup Registry (per-entry KV collection + atomic vote counters)
// ---------------------------------------------------------------------------
// Each powerup design is stored as its own KV entry. Vote counts use
// puter.kv.incr() for atomic increments — no more monolithic read-modify-
// write race conditions when multiple players vote simultaneously.
// The votes array (storing usernames who voted) is kept in the entry for
// the "has this user voted?" check, while the atomic counter is the
// source of truth for the displayed tally.
//
// Data structure per entry:
//   { id, name, color, shape, effect, description, author, votes[],
//     timestamp, _voteCount (from atomic counter) }

const MAX_COMMUNITY_ITEMS = 100;

/**
 * Submit a new community powerup design.
 * @param {object} design - { name, color, shape, effect, description? }
 * @returns {Promise<object|null>} the saved design entry, or null
 */
export async function submitCommunityPowerup(design) {
  if (!design || !design.name || !design.color || !design.shape || !design.effect) {
    console.warn('submitCommunityPowerup: missing required fields');
    return null;
  }
  const user = await getUser();
  const entry = {
    name: design.name.trim(),
    color: Number(design.color) || 0x66ffff,
    shape: design.shape,
    effect: design.effect,
    description: (design.description || '').trim(),
    author: user ? (user.username || user.name || 'Pilot') : 'Guest',
    votes: [],
    timestamp: Date.now(),
  };

  try {
    const saved = await powerupColl.create(entry);
    // Enforce max items
    const count = await powerupColl.count();
    if (count > MAX_COMMUNITY_ITEMS) {
      const all = await powerupColl.list({ limit: count });
      // Remove oldest entries beyond the cap
      const toRemove = all.slice(MAX_COMMUNITY_ITEMS);
      for (const old of toRemove) {
        await powerupColl.remove(old.id);
      }
    }
    return saved;
  } catch (e) {
    console.warn('submitCommunityPowerup failed', e);
    return null;
  }
}

/**
 * Get all community powerup designs, newest first.
 * @returns {Promise<Array>} array of design entries
 */
export async function getCommunityPowerups() {
  try {
    return await powerupColl.list({ limit: MAX_COMMUNITY_ITEMS });
  } catch (_) { return []; }
}

/**
 * Toggle a vote on a community powerup. Uses atomic incr/decr for the
 * displayed count, and updates the votes array for the "did I vote?" check.
 * @param {string} itemId - the item's id field
 * @returns {Promise<number>} new vote count, or -1 on failure
 */
export async function voteCommunityPowerup(itemId) {
  if (!itemId) return -1;
  const user = await getUser();
  const username = user ? (user.username || user.name || 'Pilot') : null;
  if (!username) return -1;

  try {
    const entry = await powerupColl.get(itemId);
    if (!entry) return -1;

    const votes = entry.votes || [];
    const idx = votes.indexOf(username);
    let newCount;

    if (idx >= 0) {
      // Un-vote: remove from array + atomically decr
      votes.splice(idx, 1);
      await powerupColl.update(itemId, { votes });
      newCount = await powerupColl.incr(itemId, -1);
    } else {
      // Vote: add to array + atomically incr
      votes.push(username);
      await powerupColl.update(itemId, { votes });
      newCount = await powerupColl.incr(itemId, 1);
    }

    return newCount >= 0 ? newCount : votes.length;
  } catch (e) {
    console.warn('voteCommunityPowerup failed', e);
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Lobby Presence (standalone — works independently of the game world)
// ---------------------------------------------------------------------------
// A lightweight presence system for the start-screen lobby. Uses a separate
// KV key (kamikazzi3d_lobby) from the in-game room (kamikazzi3d_room_*).
// Each connected client writes its own entry with username, status, score,
// and timestamp. Old entries (>15s) are expired automatically.
//
// Data structure (JSON under a single KV key):
//   {
//     "clientId1": { username, status, score, avatar, timestamp, clientId },
//     "clientId2": { username, status, score, avatar, timestamp, clientId },
//   }
//
// Status values: 'In Lobby' | 'In Game' | 'Away'
// ---------------------------------------------------------------------------

const LOBBY_KEY = CLOUD_PREFIX + 'lobby';
const LOBBY_TTL_MS = 15000;
const LOBBY_WRITE_MS = 2500;
const LOBBY_POLL_MS = 3000;

function _lobbyExpireOld(state) {
  const now = Date.now();
  Object.keys(state).forEach(k => {
    if (now - (state[k].timestamp || 0) > LOBBY_TTL_MS) delete state[k];
  });
  return state;
}

async function _lobbyReadState(puter) {
  try {
    const raw = await puter.kv.get(LOBBY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

async function _lobbyWriteState(puter, state) {
  try {
    await puter.kv.set(LOBBY_KEY, JSON.stringify(state));
  } catch (_) {}
}

/**
 * Start broadcasting the current player's presence to the lobby.
 * Runs a heartbeat every 2.5s while active. Returns a controller
 * with { stop(), setStatus(newStatus), setScore(newScore) }.
 */
export async function startLobbyPresence() {
  const p = await resolvePuter();
  if (!p || !p.kv) return null;

  const clientId = Math.random().toString(36).slice(2, 10);
  const user = await getUser();
  const username = user ? (user.username || user.name || 'Pilot') : 'Guest';
  const avatar = user ? (user.avatar_url || user.avatar || null) : null;

  let currentStatus = 'In Lobby';
  let currentScore = 0;
  let writeTimer = null;
  let pollCb = null;
  let pollTimer = null;
  let disposed = false;

  async function writePresence() {
    if (disposed) return;
    const state = _lobbyExpireOld(await _lobbyReadState(p));
    state[clientId] = {
      username,
      status: currentStatus,
      score: currentScore,
      avatar,
      clientId,
      timestamp: Date.now(),
    };
    await _lobbyWriteState(p, state);
  }

  // Immediate first write
  try { await writePresence(); } catch (_) {}

  // Heartbeat every 2.5s
  function startWriteLoop() {
    if (writeTimer) clearTimeout(writeTimer);
    async function tick() {
      if (disposed) return;
      await writePresence();
      if (!disposed) writeTimer = setTimeout(tick, LOBBY_WRITE_MS);
    }
    writeTimer = setTimeout(tick, LOBBY_WRITE_MS);
  }
  startWriteLoop();

  // Poll for other players
  function startPoll(callback) {
    pollCb = callback;
    if (pollTimer) clearInterval(pollTimer);
    _lobbyReadState(p).then(state => {
      if (pollCb) pollCb(_lobbyExpireOld(state));
    }).catch(() => {});
    pollTimer = setInterval(async () => {
      if (disposed) return;
      const state = _lobbyExpireOld(await _lobbyReadState(p));
      if (pollCb) pollCb(state);
    }, LOBBY_POLL_MS);
  }

  function stop() {
    disposed = true;
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    // Remove self from lobby
    _lobbyReadState(p).then(state => {
      delete state[clientId];
      return _lobbyWriteState(p, state);
    }).catch(() => {});
  }

  return {
    clientId,
    username,
    stop,
    setStatus: (s) => { currentStatus = s; },
    setScore: (s) => { currentScore = typeof s === 'number' ? s : 0; },
    subscribeLobby: startPoll,
  };
}

// ---------------------------------------------------------------------------
// Stable Diffusion prompt templates & style presets for AI skin generation
// ---------------------------------------------------------------------------
// Each preset contains a structured prompt template with placeholders for
// the user's free-form description. The template wraps user input with
// Stable Diffusion quality-enhancing terms, style-specific aesthetic
// modifiers, and negative-prompt-like constraints to reduce artifacts.
// Templates use {prompt} as the placeholder for user text.
//
// The `negative` field is a comma-separated string of terms to avoid.
// Not all txt2img backends support negative prompts, but Puter's SD
// pipeline does — passing it as an options field when available.

const SKIN_STYLE_PRESETS = [
  {
    id: 'kamikaze',
    name: 'Kamikaze Red',
    emoji: '🇯🇵',
    desc: 'Rising sun livery — red disk, white fuselage, bold calligraphy accents',
    template: "WW1 biplane warplane fuselage texture, {prompt}, rising sun livery, red and white, bold kanji calligraphy, distressed paint, weathering, rivet details, metal panel lines, highly detailed texture atlas, seamless, 4k, pbr, unreal engine 5, octane render, cinematic lighting, dramatic clouds background",
    negative: 'blurry, low quality, cartoon, anime, flat, toy, lego, plastic, cgi, render artifacts, watermark, signature, text',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    emoji: '🌃',
    desc: 'Neon-drenched city fighter — magenta teal contrast, holographic accents',
    template: "WW1 biplane warplane fuselage texture, {prompt}, cyberpunk, neon noir, magenta and cyan, holographic decals, carbon fiber panels, glowing trim, rain-slicked metal, gritty urban, blade runner aesthetic, highly detailed texture atlas, seamless, 4k, pbr, octane render, volumetric fog",
    negative: 'daylight, sunny, cartoon, toy, lego, flat, pastel, blurry, low quality, watermark, signature',
  },
  {
    id: 'wasteland',
    name: 'Wasteland Desolation',
    emoji: '🏜️',
    desc: 'Rusted, sand-blasted war survivor with scavenged patchwork plates',
    template: "WW1 biplane warplane fuselage texture, {prompt}, post-apocalyptic, rusted metal, corroded panels, sand-blasted, weathered steel, war-torn, patchwork repairs, dented armor, desert worn, mad max inspired, highly detailed texture atlas, seamless, 4k, pbr, gritty realistic",
    negative: 'clean, pristine, polished, new, shiny, cartoon, anime, toy, lego, blurry, low quality, watermark',
  },
  {
    id: 'arctic',
    name: 'Arctic Ghost',
    emoji: '❄️',
    desc: 'Frozen tundra stealth — white/grey digital camo with frost rime',
    template: "WW1 biplane warplane fuselage texture, {prompt}, arctic white and grey, digital camouflage, frost rime, ice crystals, snow-dusted, cold steel, matte finish, stealth coatings, frozen tundra, highly detailed texture atlas, seamless, 4k, pbr, ambient occlusion, rim lighting",
    negative: 'warm colors, gold, red, orange, cartoon, anime, toy, blurry, low quality, watermark, signature, bright, sunny',
  },
  {
    id: 'woodgrain',
    name: 'Vintage Woodgrain',
    emoji: '🪵',
    desc: 'Classic wooden warbird — varnished mahogany, brass fittings, canvas wings',
    template: "WW1 biplane warplane fuselage texture, {prompt}, varnished mahogany wood, dark stained oak, brass rivets, canvas fabric, vintage aviation, 1910s warbird, art deco accents, shellac finish, warm amber tones, highly detailed wood grain, seamless texture, 4k, pbr, photorealistic",
    negative: 'plastic, modern, neon, cyberpunk, sci-fi, cartoon, anime, toy, lego, blurry, low quality, watermark',
  },
  {
    id: 'stealth',
    name: 'Stealth Matte',
    emoji: '⚫',
    desc: 'Modern stealth fighter aesthetic — matte black, flat grey, minimal reflections',
    template: "WW1 biplane warplane fuselage texture, {prompt}, stealth fighter matte finish, flat black and charcoal grey, radar-absorbent panels, minimal reflections, tactical, military grade, non-reflective coating, sharp geometric shapes, highly detailed texture atlas, seamless, 4k, pbr, ultra realistic",
    negative: 'glossy, shiny, polished, chrome, neon, bright colors, decals, cartoon, anime, toy, lego, blurry, low quality, watermark',
  },
  {
    id: 'flame',
    name: 'Flame Streak',
    emoji: '🔥',
    desc: 'Hot rod flames licking the fuselage — orange-red gradients on dark base',
    template: "WW1 biplane warplane fuselage texture, {prompt}, hot rod flame job, orange and red flames, dark grey base, airbrushed gradients, custom paint job, kustom kulture, pinstripe details, gloss clear coat, highly detailed texture atlas, seamless, 4k, pbr, showroom shine",
    negative: 'rust, damaged, worn, cartoon, anime, toy, lego, flat, matte, blurry, low quality, watermark, signature, text',
  },
  {
    id: 'digital',
    name: 'Digital Rez',
    emoji: '💎',
    desc: 'Low-poly voxel aesthetic — faceted gem-like panels, retro arcade vibes',
    template: "WW1 biplane warplane fuselage texture, {prompt}, low-poly voxel style, faceted geometric panels, retro arcade aesthetic, pixel-art inspired, sharp angular planes, synthetic materials, glowing edges, tron legacy vibe, highly detailed texture atlas, seamless, 4k, pbr, neon accents",
    negative: 'organic, smooth, round, realistic paint, wood, fabric, blurry, low quality, watermark, signature, photorealistic',
  },
  {
    id: 'camo',
    name: 'Jungle Camo',
    emoji: '🌿',
    desc: 'Dense jungle camouflage — olive, khaki, brown organic patterns',
    template: "WW1 biplane warplane fuselage texture, {prompt}, military camouflage, jungle pattern, olive green and khaki brown, organic shapes, matte tactical finish, field-worn, foliage netting details, humid environment weathering, highly detailed texture atlas, seamless, 4k, pbr, realistic military paint",
    negative: 'shiny, bright colors, neon, cartoon, anime, toy, lego, clean, pristine, blurry, low quality, watermark',
  },
  {
    id: 'chrome',
    name: 'Chrome Beast',
    emoji: '🪞',
    desc: 'Mirror-polished chrome — high-gloss reflective surfaces, silver bullet',
    template: "WW1 biplane warplane fuselage texture, {prompt}, mirror polished chrome, high-gloss reflective metal, silver, liquid metal, show chrome, environment reflection, flawless surface, automotive grade, highly detailed texture atlas, seamless, 4k, pbr, raytraced reflections, ultra realistic",
    negative: 'matte, flat, rust, worn, damaged, cartoon, anime, toy, lego, blurry, low quality, watermark, signature, text, paint',
  },
  {
    id: 'steampunk',
    name: 'Steampunk Brass',
    emoji: '⚙️',
    desc: 'Victorian engineering — polished brass, copper pipes, gears, rivets, steam vents',
    template: "WW1 biplane warplane fuselage texture, {prompt}, steampunk, polished brass and copper, Victorian era engineering, intricate gears, clockwork mechanisms, steam pipes, riveted plates, leather straps, brass fittings, sepia bronze patina, hot air balloon canvas, highly detailed texture atlas, seamless, 4k, pbr, octane render, dramatic workshop lighting",
    negative: 'modern, plastic, neon, cyberpunk, shiny chrome, cartoon, anime, toy, lego, blurry, low quality, watermark, signature',
  },
  {
    id: 'bioluminescent',
    name: 'Bioluminescent',
    emoji: '🧬',
    desc: 'Alien biology — living metal with glowing organic veins, pulsating patterns',
    template: "WW1 biplane warplane fuselage texture, {prompt}, bioluminescent alien organic, living metal, glowing neon veins, pulsating patterns, deep purple and cyan, iridescent chitin, translucent membranes, alien biology, sci-fi organism, phosphorescent glow, dark background, highly detailed texture atlas, seamless, 4k, pbr, unreal engine 5, volumetric glow",
    negative: 'rust, worn, dirty, cartoon, anime, toy, lego, flat, matte, blurry, low quality, watermark, signature, wood, metal',
  },
  {
    id: 'pixelart',
    name: 'Pixel Art',
    emoji: '🕹️',
    desc: '8-bit retro game — chunky pixels, NES palette, scanline nostalgia',
    template: "WW1 biplane warplane fuselage texture, {prompt}, 8-bit pixel art, retro NES game texture, chunky square pixels, limited color palette, blocky sprites, scanline overlay, retro gaming aesthetic, pixel-perfect, chiptune vibes, classic arcade, highly detailed pixel art texture atlas, seamless, 4k, crisp pixel rendering",
    negative: 'smooth, realistic, photorealistic, 3d render, pbr, painted, oil, watercolor, blurry, low quality, watermark, signature, anti-aliased',
  },
  {
    id: 'origami',
    name: 'Origami Paper',
    emoji: '🦢',
    desc: 'Folded paper craft — washi texture, crisp geometric creases, light and shadow',
    template: "WW1 biplane warplane fuselage texture, {prompt}, origami folded paper, washi paper texture, crisp geometric creases, papercraft, folded plane, white textured paper, subtle fiber grain, sharp angular folds, lighting and shadow across creases, paper seams, highly detailed texture atlas, seamless, 4k, pbr, macro photography of paper",
    negative: 'metal, plastic, wood, paint, rust, shiny, glossy, wet, cartoon, anime, toy, lego, blurry, low quality, watermark, signature, rough',
  },
];

/**
 * Portrait-focused prompt templates keyed by preset id.
 * Each template starts with a character-portrait framing instead of
 * the plane-texture framing used by SKIN_STYLE_PRESETS.
 */
const PORTRAIT_TEMPLATES = {
  kamikaze:  "pilot portrait photograph, {prompt}, WW1 aviator, rising sun backdrop, dramatic lighting, cinematic portrait, detailed face, weathered military gear, leather flight jacket, vintage goggles, heroic expression, photorealistic, 8k, canon 85mm, professional color grading",
  cyberpunk: "pilot portrait photograph, {prompt}, cyberpunk, neon city lights bokeh, holographic visor, techwear jacket, face illuminated by neon signs, blade runner aesthetic, detailed cybernetic implants, gritty, cinematic, 8k, professional portrait photography",
  wasteland: "pilot portrait photograph, {prompt}, post-apocalyptic wasteland warrior, dusty face, scavenged gear, welding goggles, weathered leather, sand and grime, fierce determined expression, mad max style, cinematic lighting, 8k, professional portrait",
  arctic:    "pilot portrait photograph, {prompt}, arctic explorer, fur-lined hood, frost on eyelashes, cold breath, pale winter light, snow-covered background, intense blue eyes, survival gear, cinematic portrait, 8k, professional photography",
  woodgrain: "pilot portrait photograph, {prompt}, 1910s vintage aviator, sepia tones, leather flying helmet, brass goggles, canvas flight suit, old photograph style, warm film grain, classic aviation, historical portrait, 8k, professional",
  stealth:   "pilot portrait photograph, {prompt}, modern military pilot, tactical headset, matte black helmet, subdued lighting, serious expression, night operation, tactical gear, steely eyes, professional portrait, 8k, cinematic, photorealistic",
  flame:     "pilot portrait photograph, {prompt}, hot rod culture pilot, flame tattoo on face, leather jacket with flame decals, rebel sunglasses, confident smirk, dramatic backlit, orange glow, cinematic portrait, 8k, professional",
  digital:   "pilot portrait photograph, {prompt}, low-poly voxel portrait, geometric face, digital art, pixel-perfect, retro arcade aesthetic, faceted features, synthetic being, neon wireframe lines, tron style, digital painting, 8k",
  camo:      "pilot portrait photograph, {prompt}, jungle warfare pilot, face paint camouflage, dense foliage background, humid atmosphere, combat gear, focused expression, military portrait, natural lighting, 8k, professional photography",
  chrome:    "pilot portrait photograph, {prompt}, mirror chrome finish, liquid metal face, reflective surfaces, sci-fi pilot, polished steel, futuristic helmet, gleaming armor, high contrast lighting, cinematic portrait, 8k, photorealistic",
  steampunk: "pilot portrait photograph, {prompt}, steampunk aviator, brass goggles, leather top hat, copper earphone, Victorian suit, steam machine background, sepia tones, intricate gear jewelry, dramatic workshop lighting, cinematic portrait, 8k, professional photography",
  bioluminescent: "pilot portrait photograph, {prompt}, bioluminescent alien, glowing skin patterns, neon veins on face, otherworldly eyes, dark atmosphere, floating particles, ethereal glow, cyan and purple lighting, sci-fi portrait, cinematic, 8k, professional photography",
  pixelart:  "pilot portrait photograph, {prompt}, 8-bit pixel art portrait, retro NES style, chunky pixels, limited color palette, blocky facial features, retro gaming aesthetic, nostalgic, scanline overlay, pixel-perfect, 8k pixel art, professional portrait",
  origami:   "pilot portrait photograph, {prompt}, origami paper portrait, folded paper face, geometric creases, washi texture, papercraft sculpture, subtle shadows across folds, white textured paper, angular features, macro photography, 8k, professional portrait",
};

/**
 * Build an optimized Stable Diffusion prompt from user input and selected preset.
 * @param {string} userPrompt - The user's free-form description
 * @param {string} presetId - The id of the style preset to use
 * @param {object} [options]
 * @param {boolean} [options.isPortrait] - If true, use character-portrait templates
 * @returns {{ prompt: string, negative: string, preset: object }} structured prompt
 */
export function buildSkinPrompt(userPrompt, presetId, options = {}) {
  const preset = SKIN_STYLE_PRESETS.find(p => p.id === presetId) || SKIN_STYLE_PRESETS[0];
  const cleanInput = (userPrompt || '').trim();
  const promptTemplate = options.isPortrait
    ? (PORTRAIT_TEMPLATES[presetId] || PORTRAIT_TEMPLATES.kamikaze)
    : preset.template;
  const prompt = promptTemplate.replace('{prompt}', cleanInput ? cleanInput + ', ' : '');
  return { prompt, negative: preset.negative, preset };
}

/**
 * Get all available skin style presets.
 * @returns {Array} array of preset objects { id, name, emoji, desc }
 */
export function getSkinStylePresets() {
  return SKIN_STYLE_PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    desc: p.desc,
  }));
}

// ---------------------------------------------------------------------------
// Building color palette prompt templates
// ---------------------------------------------------------------------------
// Like SKIN_STYLE_PRESETS but for building color palettes. The templates
// instruct the model to produce a flat color swatch strip that we can
// sample for dominant colors to create a new BUILDING_SKINS entry.

const BUILDING_STYLE_TEMPLATES = {
  kamikaze:  "flat vector color swatches, {prompt} japanese city palette, warm red and white, indigo rooftops, sakura pink accents, zen garden stone, bamboo green, bold rising sun palette, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  cyberpunk: "flat vector color swatches, {prompt} neon cyberpunk city palette, magenta cyan electric blue, dark purple, hot pink, toxic green, holographic white, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  wasteland: "flat vector color swatches, {prompt} post-apocalyptic wasteland palette, rusted orange, sand tan, corroded green, weathered grey, faded brown, dust yellow, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  arctic:    "flat vector color swatches, {prompt} frozen arctic city palette, ice blue, frost white, silver grey, pale cyan, snow shadow, cold steel, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  woodgrain: "flat vector color swatches, {prompt} vintage city palette, warm mahogany, brass gold, cream beige, dark oak, olive green, terracotta, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  stealth:   "flat vector color swatches, {prompt} tactical military city palette, matte black, charcoal grey, olive drab, slate, dark navy, gunmetal, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  flame:     "flat vector color swatches, {prompt} hot rod city palette, flame red, burnt orange, yellow gold, dark grey, white stripe, deep black, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  digital:   "flat vector color swatches, {prompt} retro digital city palette, neon green, electric blue, hot pink, cyan, purple, bright white, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  camo:      "flat vector color swatches, {prompt} jungle camouflage city palette, olive green, khaki tan, dark brown, mud grey, foliage green, sand, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  chrome:    "flat vector color swatches, {prompt} chrome reflective city palette, mirror silver, gunmetal grey, polished steel, white chrome, dark reflector, brushed aluminum, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  steampunk: "flat vector color swatches, {prompt} steampunk city palette, polished brass, copper patina, dark iron, leather brown, cream parchment, emerald glass, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  bioluminescent: "flat vector color swatches, {prompt} bioluminescent alien city palette, glowing cyan, neon purple, phosphorescent green, deep indigo, iridescent pink, alien teal, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  pixelart:  "flat vector color swatches, {prompt} 8-bit retro city palette, nes classic, blocky primary colors, bright red, sky blue, grass green, chocolate brown, pale yellow, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
  origami:   "flat vector color swatches, {prompt} origami paper city palette, washi white, subtle cream, soft grey, pale celadon, warm beige, ink black, 5 swatches side by side, flat colors, no gradients, vector art, crisp edged",
};

/**
 * Extract dominant colors from an image URL by sampling pixel data
 * from a hidden canvas. Returns an array of up to 7 hex color values.
 */
function extractPaletteFromImage(imageUrl, count = 7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for remote URLs (data URLs are same-origin)
    if (imageUrl && !imageUrl.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Scale down to a width of `count` pixels so we get one sample per palette slot
        const w = count;
        const h = 1;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const colors = [];
        for (let i = 0; i < w; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const a = data[i * 4 + 3];
          if (a < 128) continue; // skip transparent pixels
          // Quantize to reduce noise: round each channel to nearest 8
          const qr = Math.round(r / 8) * 8;
          const qg = Math.round(g / 8) * 8;
          const qb = Math.round(b / 8) * 8;
          const hex = (qr << 16) | (qg << 8) | qb;
          // Avoid near-duplicates
          const isDup = colors.some(c => Math.abs(c - hex) < 0x101010);
          if (!isDup) colors.push(hex);
        }
        // Pad with the last color if we didn't get enough
        while (colors.length < count) colors.push(colors.length ? colors[colors.length - 1] : 0x888888);
        resolve(colors.slice(0, count));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

/**
 * Generate a building color palette from a user prompt and style preset.
 * @param {string} userPrompt - User's free-form description
 * @param {string} presetId - Style preset id
 * @returns {Promise<{ palette: number[], roofColor: number, accentColor: number, imageUrl: string }|null>}
 */
export async function generateBuildingPalette(userPrompt, presetId) {
  if (!userPrompt) return null;
  const template = BUILDING_STYLE_TEMPLATES[presetId] || BUILDING_STYLE_TEMPLATES.kamikaze;
  const cleanInput = userPrompt.trim();
  const prompt = template.replace('{prompt}', cleanInput ? cleanInput + ', ' : '');

  const imageUrl = await generateImage(prompt, { size: '512x512' });
  if (!imageUrl) return null;

  try {
    const palette = await extractPaletteFromImage(imageUrl, 7);
    // Pick roof color as the darkest palette color, accent as the lightest
    const sorted = [...palette].sort((a, b) => {
      const lumA = (a >> 16 & 255) * 0.299 + (a >> 8 & 255) * 0.587 + (a & 255) * 0.114;
      const lumB = (b >> 16 & 255) * 0.299 + (b >> 8 & 255) * 0.587 + (b & 255) * 0.114;
      return lumA - lumB;
    });
    const roofColor = sorted[0]; // darkest
    const accentColor = sorted[sorted.length - 1]; // lightest

    return { palette, roofColor, accentColor, imageUrl };
  } catch (e) {
    console.warn('generateBuildingPalette color extraction failed', e);
    // Return a fallback palette from the preset name (simple hash)
    const fallback = [
      0x5c6bc0, 0x26a69a, 0xab47bc, 0xef5350,
      0xffa726, 0x42a5f5, 0x55d65f,
    ];
    return { palette: fallback, roofColor: 0x4a4a6a, accentColor: 0x2a2f3a, imageUrl };
  }
}


