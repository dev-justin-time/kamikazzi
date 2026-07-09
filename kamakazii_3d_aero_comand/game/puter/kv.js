/* game/puter/kv.js
   Extracted from puter-client.js — unified cloud/local storage,
   high scores, run history, settings, KV collections with atomic
   vote counters, leaderboard, community powerups, lobby presence,
   and briefings sync.
*/

import { resolvePuter, getUser, isPuterAvailable } from './auth.js';

import { dbg } from '../dbg.js';

const CLOUD_PREFIX = 'kamikazzi3d_';
const LOCAL_PREFIX = 'kamikazzi';

// ── Low-level cloud (Puter KV) ─────────────────────────────────
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

// ── Cloud sync gate ────────────────────────────────────────────
let _cloudSyncEnabled = true;
export function setCloudSyncEnabled(v) { _cloudSyncEnabled = !!v; }
export function isCloudSyncEnabled() { return _cloudSyncEnabled; }

// ── Unified write: cloud + local ──────────────────────────────
export async function save(key, value) {
  localSet(key, value);
  if (_cloudSyncEnabled) await cloudSet(key, value);
}

// ── Unified read: cloud preferred, local fallback ────────────
export async function load(key, defaultValue) {
  const cloudVal = await cloudGet(key);
  if (cloudVal !== undefined) {
    localSet(key, cloudVal);
    return cloudVal;
  }
  const localVal = localGet(key);
  return localVal !== undefined ? localVal : defaultValue;
}

// ── High score & run history ───────────────────────────────────
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
  const history = await load('RunHistory', []);
  history.unshift(run);
  const trimmed = history.slice(0, 50);
  await save('RunHistory', trimmed);
  return trimmed;
}

export async function getRunHistory() {
  return load('RunHistory', []);
}

// ── Settings sync ──────────────────────────────────────────────
export async function syncSettings(settings) {
  await save('Settings', settings);
}

export async function getSettings() {
  return load('Settings', {});
}

// ── Structured KV Collection ───────────────────────────────────
const COLL_PREFIX = 'coll_';
const COLL_IDX = '_idx';
const COLL_VC = '_vc';

function _collId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function createKVCollection(name) {
  const entryPre = COLL_PREFIX + name + '_';
  const idxKey  = COLL_PREFIX + name + COLL_IDX;

  async function getIdx() {
    const raw = await cloudGet(idxKey);
    return Array.isArray(raw) ? raw : [];
  }

  async function setIdx(ids) {
    await cloudSet(idxKey, ids);
    try { localStorage.setItem('kv_' + name + '_idx', JSON.stringify(ids)); } catch (_) {}
  }

  async function getEntry(id) {
    const raw = await cloudGet(entryPre + id);
    if (raw !== undefined) return raw;
    try {
      const local = localStorage.getItem('kv_' + name + '_' + id);
      return local ? JSON.parse(local) : null;
    } catch (_) { return null; }
  }

  async function setEntry(id, data) {
    await cloudSet(entryPre + id, data);
    try { localStorage.setItem('kv_' + name + '_' + id, JSON.stringify(data)); } catch (_) {}
  }

  async function delEntry(id) {
    await cloudSet(entryPre + id, null);
    try { localStorage.removeItem('kv_' + name + '_' + id); } catch (_) {}
  }

  async function getVoteCount(id) {
    const p = await resolvePuter();
    if (p && p.kv && typeof p.kv.get === 'function') {
      try {
        const raw = await p.kv.get(CLOUD_PREFIX + entryPre + id + COLL_VC);
        if (typeof raw === 'number') return Math.max(0, raw);
        if (raw !== null && raw !== undefined) return Math.max(0, Number(raw));
      } catch (_) {}
    }
    try {
      const local = localStorage.getItem('kv_' + name + '_' + id);
      if (local) {
        const entry = JSON.parse(local);
        return (entry.votes || []).length;
      }
    } catch (_) {}
    return -1;
  }

  return {
    async create(data) {
      const id = _collId();
      const entry = { ...data, id, _createdAt: Date.now() };
      await setEntry(id, entry);
      const ids = await getIdx();
      ids.unshift(id);
      await setIdx(ids);
      return entry;
    },

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
        ? entries.filter(options.filter) : entries;
      return result.slice(0, options.limit || 100);
    },

    async get(id) {
      const entry = await getEntry(id);
      if (!entry) return null;
      entry._voteCount = await getVoteCount(id);
      return entry;
    },

    async update(id, data) {
      const existing = await getEntry(id);
      if (!existing) return null;
      const updated = { ...existing, ...data, id };
      if (data.votes === undefined) updated.votes = existing.votes;
      await setEntry(id, updated);
      return updated;
    },

    async remove(id) {
      await delEntry(id);
      const ids = await getIdx();
      await setIdx(ids.filter(i => i !== id));
    },

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

    async count() {
      const ids = await getIdx();
      return ids.length;
    },
  };
}

// Pre-initialized collection instances
const leaderboardColl = createKVCollection('leaderboard');
const powerupColl = createKVCollection('powerups');

// ── Leaderboard ────────────────────────────────────────────────
export async function submitLeaderboard(score, meta = {}) {
  const user = await getUser();
  const entry = {
    score,
    username: user ? (user.username || user.name || 'Pilot') : 'Guest',
    avatar: user ? (user.avatar_url || user.avatar || null) : null,
    timestamp: Date.now(),
    ...meta,
  };
  await syncHighScore(score);
  await recordRun({
    score, level: meta.level, distance: meta.distance,
    timeMs: meta.timeMs, timestamp: entry.timestamp, won: meta.won,
  });
  try {
    if (_cloudSyncEnabled) await leaderboardColl.create(entry);
  } catch (_) {}
  return entry;
}

export async function getLeaderboard(limit = 10, period = 'all') {
  const now = Date.now();
  let cutoff = 0;
  if (period === 'week') cutoff = now - 7 * 24 * 60 * 60 * 1000;
  else if (period === 'month') cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const entries = await leaderboardColl.list({
    limit: 100,
    filter: cutoff > 0 ? e => (e.timestamp || 0) >= cutoff : undefined,
  });
  entries.sort((a, b) => (b.score || 0) - (a.score || 0));
  return entries.slice(0, limit);
}

// ── Community Powerup Registry ─────────────────────────────────
const MAX_COMMUNITY_ITEMS = 100;

export async function submitCommunityPowerup(design) {
  if (!design || !design.name || !design.color || !design.shape || !design.effect) {
    dbg.warn('submitCommunityPowerup: missing required fields');
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
    const count = await powerupColl.count();
    if (count > MAX_COMMUNITY_ITEMS) {
      const all = await powerupColl.list({ limit: count });
      const toRemove = all.slice(MAX_COMMUNITY_ITEMS);
      for (const old of toRemove) await powerupColl.remove(old.id);
    }
    return saved;
  } catch (e) {
    dbg.warn('submitCommunityPowerup failed', e);
    return null;
  }
}

export async function getCommunityPowerups() {
  try {
    return await powerupColl.list({ limit: MAX_COMMUNITY_ITEMS });
  } catch (_) { return []; }
}

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
      votes.splice(idx, 1);
      await powerupColl.update(itemId, { votes });
      newCount = await powerupColl.incr(itemId, -1);
    } else {
      votes.push(username);
      await powerupColl.update(itemId, { votes });
      newCount = await powerupColl.incr(itemId, 1);
    }
    return newCount >= 0 ? newCount : votes.length;
  } catch (e) {
    dbg.warn('voteCommunityPowerup failed', e);
    return -1;
  }
}

// ── Lobby Presence ─────────────────────────────────────────────
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
  try { await puter.kv.set(LOBBY_KEY, JSON.stringify(state)); } catch (_) {}
}

/**
 * Start broadcasting the current player's presence to the lobby.
 * Returns a controller with { stop(), setStatus(s), setScore(s), subscribeLobby(cb) }.
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
    state[clientId] = { username, status: currentStatus, score: currentScore, avatar, clientId, timestamp: Date.now() };
    await _lobbyWriteState(p, state);
  }

  try { await writePresence(); } catch (_) {}

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
    _lobbyReadState(p).then(state => {
      delete state[clientId];
      return _lobbyWriteState(p, state);
    }).catch(() => {});
  }

  return {
    clientId, username, stop,
    setStatus: (s) => { currentStatus = s; },
    setScore: (s) => { currentScore = typeof s === 'number' ? s : 0; },
    subscribeLobby: startPoll,
  };
}

// ── Briefings sync ────────────────────────────────────────────

/**
 * Send ideas/briefings via modern KV storage.
 * Called by world.js sendIdeasToPuter().
 */
window.__puterSendIdeas = async function(payload) {
  try {
    if (!payload) return;
    const ideaList = await load('Briefings', []);
    const user = await getUser();
    const author = payload.author || (user ? (user.username || user.name) : null) || 'Pilot';
    const ideas = Array.isArray(payload.ideas) ? payload.ideas : [payload.ideas || payload.text || ''];
    for (const idea of ideas) {
      if (idea && idea.trim()) {
        ideaList.push({
          from: author, idea: idea.trim(),
          ts: payload.timestamp || Date.now(), score: payload.score || 0,
        });
      }
    }
    const trimmed = ideaList.slice(-200);
    await save('Briefings', trimmed);
    try {
      const key = 'kamikazziBriefings';
      const local = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = new Set(local.map(i => (i.idea || '').trim()));
      trimmed.forEach(n => { if (!existing.has((n.idea || '').trim())) local.push(n); });
      localStorage.setItem(key, JSON.stringify(local.slice(-200)));
    } catch (_) {}
    try { window.dispatchEvent(new Event('ideasUpdated')); } catch (_) {}
  } catch (_) {}
};

/**
 * Add a sky idea locally with cloud sync.
 */
window.addSkyIdea = function(text, author) {
  try {
    if (!text) return;
    const key = 'kamikazziBriefings';
    const stored = localStorage.getItem(key);
    const list = stored ? JSON.parse(stored) : [];
    list.push({ from: author || 'Pilot', idea: text, ts: Date.now() });
    localStorage.setItem(key, JSON.stringify(list));
    save('Briefings', list).catch(() => {});
    try { window.dispatchEvent(new Event('ideasUpdated')); } catch (_) {}
  } catch (_) {}
};

/**
 * Fetch briefings from cloud KV and merge locally.
 */
window.fetchCommentsFromPuter = async function() {
  try {
    const cloud = await load('Briefings', []);
    if (cloud.length > 0) {
      const key = 'kamikazziBriefings';
      const local = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = new Set(local.map(i => (i.idea || '').trim()));
      let changed = false;
      cloud.forEach(n => {
        if (!existing.has((n.idea || '').trim())) { local.push(n); changed = true; }
      });
      if (changed) {
        local.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        localStorage.setItem(key, JSON.stringify(local.slice(-200)));
        try { window.dispatchEvent(new Event('ideasUpdated')); } catch (_) {}
      }
    }
  } catch (_) {}
};
