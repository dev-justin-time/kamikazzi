/* game/puter/auth.js
   Extracted from puter-client.js — Puter.js SDK availability detection,
   user identity (getUser, getUsername, getAvatarUrl), and legacy
   API-key client for backward compatibility.
*/

// ── SDK resolution ─────────────────────────────────────────────
let _puterExport = null;
let _aiExport = null;
try {
  const mod = await import('https://cdn.jsdelivr.net/npm/@heyputer/puter.js/+esm');
  _puterExport = mod.puter || mod.default || mod;
  _aiExport = mod.ai || null;
} catch (_) {
  _puterExport = null;
  _aiExport = null;
}

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

// ── User identity ──────────────────────────────────────────────
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

// ── Legacy API-key client ──────────────────────────────────────
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

/**
 * Wire into Puter login flow.
 * - If key is provided (non-empty string): use legacy API-key auth.
 * - If key is null/undefined/empty: trigger Puter OAuth sign-in via puter.auth.signIn().
 * - If Puter auth is unavailable, silently return null.
 */
window.setPuterApiKey = async function(key) {
  try {
    if (key && typeof key === 'string' && key.length > 0) {
      localStorage.setItem('puterApiKey', key);
      const client = await createLegacyClient(key);
      return client ? { source: 'legacy', key } : null;
    }
    localStorage.removeItem('puterApiKey');
    const p = await resolvePuter();
    if (p && p.auth && typeof p.auth.signIn === 'function') {
      await p.auth.signIn();
      await refreshUser();
      return await getUser();
    }
    const user = await getUser();
    return user || null;
  } catch (_) {
    return null;
  }
};
