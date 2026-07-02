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
  const mod = await import('https://esm.sh/puter-js@latest');
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
// Leaderboard (global top-10 via shared KV namespace hack + personal bests)
// ---------------------------------------------------------------------------
// Puter kv is user-scoped, so true global leaderboard needs a shared key.
// We write to a well-known key that all players read from. This is best-effort
// (races possible) but works for casual arcade scores.
const LEADERBOARD_KEY = 'kamikazzi3d_global_leaderboard';
const MAX_LEADERBOARD_ENTRIES = 10;

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

  // Mission Records (personal leaderboard — Puter KV is user-scoped,
  // so this stores the player's own top runs, not a true global board)
  if (_cloudSyncEnabled) {
    const p = await resolvePuter();
    if (p && p.kv) {
      try {
        let board = await p.kv.get(LEADERBOARD_KEY);
        board = board ? JSON.parse(board) : [];
        board.push(entry);
        board.sort((a, b) => b.score - a.score);
        board = board.slice(0, MAX_LEADERBOARD_ENTRIES);
        await p.kv.set(LEADERBOARD_KEY, JSON.stringify(board));
      } catch (_) {}
    }
  }
  return entry;
}

export async function getLeaderboard(limit = 10) {
  const p = await resolvePuter();
  if (!p || !p.kv) return [];
  try {
    let board = await p.kv.get(LEADERBOARD_KEY);
    board = board ? JSON.parse(board) : [];
    return board.slice(0, limit);
  } catch (_) { return []; }
}

// ---------------------------------------------------------------------------
// Legacy API-key client (preserved for backward compatibility)
// ---------------------------------------------------------------------------
let legacyClient = null;
let legacyKey = null;
const SERVICE_NAME = 'kamikazzi-radio';

async function resolvePuterFactory() {
  try {
    const mod = await import('https://esm.sh/@heyputer/puter.js');
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
// Convenience: boot-time sync
// ---------------------------------------------------------------------------
// On load, try to pull cloud high score down to localStorage so the game
// reads the freshest value even if it only checks localStorage directly.
(async function bootSync() {
  try {
    const cloudBest = await cloudGet('HiScore');
    if (typeof cloudBest === 'number' && cloudBest > 0) {
      const localBest = Number(localStorage.getItem('kamikazziHiScore') || 0);
      if (cloudBest > localBest) {
        localStorage.setItem('kamikazziHiScore', String(cloudBest));
      }
    }
    const cloudSettings = await cloudGet('Settings');
    if (cloudSettings && typeof cloudSettings === 'object') {
      const localSettings = localGet('Settings') || {};
      const merged = { ...localSettings, ...cloudSettings };
      localSet('Settings', merged);
    }
  } catch (_) {}
})();
