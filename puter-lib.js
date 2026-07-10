/* ═══════════════════════════════════════════════════════════════════════════
   puter-lib.js  –  Shared Puter.js SDK wrapper
   ═══════════════════════════════════════════════════════════════════════════
   Importable by all three apps in this monorepo:
     • kamakazii_3d_aero_comand/   (Aero Command – game)
     • kamakazii_studio3D/         (Studio 3D – editor)
     • kamasazii_vecter_omega3d/   (Vector Strike OMNI – WebGL dogfighter)

   Covers the common Puter operations: SDK resolution, auth, KV storage (with
   localStorage fallback), FS read/write, AI chat completions, and a buffered
   client error logger that flushes to Puter FS.

   Usage:
     import { puter } from '../puter-lib.js';
     await puter.auth.signIn();
     await puter.kv.set('key', value);
     const val = await puter.kv.get('key');
     await puter.fs.write('/path/to/file.bin', blob);

   The library is intentionally self-contained with zero external dependencies
   beyond the Puter SDK itself (loaded via ESM or script tag).

   Every operation is defensive — if the SDK is unavailable or the user is
   not signed in, methods return null / undefined / false without throwing.
   ═══════════════════════════════════════════════════════════════════════════ */

// ============================================================================
// 1. SDK RESOLUTION
// ============================================================================

let _puterInstance = null;
let _aiInstance = null;
let _resolved = false;
let _resolvePromise = null;

/**
 * Resolve the Puter.js SDK from the best available source.
 * Priority: ESM import → global `window.puter` → null.
 * Idempotent — subsequent calls return the cached instance.
 *
 * @returns {Promise<object|null>} The Puter SDK object or null.
 */
export async function resolvePuter() {
  if (_resolved) return _puterInstance;
  if (_resolvePromise) return _resolvePromise;

  _resolvePromise = (async () => {
    // 1) ESM named export from @heyputer/puter.js
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/@heyputer/puter.js/+esm');
      const p = mod.puter || mod.default || mod;
      if (p && typeof p === 'object') {
        _puterInstance = p;
        _aiInstance = mod.ai || null;
        _resolved = true;
        return _puterInstance;
      }
    } catch (_) { /* fall through */ }

    // 2) Global script tag (js.puter.com/v2/)
    if (typeof window !== 'undefined' && window.puter && typeof window.puter === 'object') {
      _puterInstance = window.puter;
      _aiInstance = window.puter && window.puter.ai ? window.puter.ai : null;
      _resolved = true;
      return _puterInstance;
    }

    _puterInstance = null;
    _resolved = true;
    return null;
  })();

  return _resolvePromise;
}

/**
 * Check whether the Puter SDK is available in the current environment.
 * Does not attempt to resolve — call resolvePuter() first if needed.
 *
 * @returns {boolean}
 */
export function isPuterAvailable() {
  return !!(_puterInstance || (typeof window !== 'undefined' && window.puter));
}

/**
 * Get the resolved AI module (puter.ai). Returns null if unavailable or if
 * resolvePuter() hasn't been called yet.
 *
 * @returns {object|null}
 */
export function getAiModule() {
  return _aiInstance;
}

// ============================================================================
// 1b. CIRCUIT BREAKER
// Prevents the Puter backend from being hammered with retries when it is
// unreachable. After 3 consecutive failures within a 30-second window the
// circuit opens and all fs/kv/ai calls short-circuit to a local fallback
// (no network attempt, no console noise). The circuit resets on:
//   - the next successful Puter call (auto-close after first success), OR
//   - an explicit user-initiated recheck (resetCloudCircuit() — wired to the
//     cloud-status pill click handler in editor/UIManager.js and game/ui/settings.js).
// ============================================================================

const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_WINDOW_MS = 30000;
const WARN_DEDUPE_MS = 60000;

let _cloudFailures = [];
let _cloudDisabled = false;
let _lastFsWarnAt = 0;
let _lastLoggerWarnAt = 0;
let _lastAiWarnAt = 0;

/** Return true if the cloud backend is currently disabled by the circuit breaker. */
export function isCloudDisabled() {
  return _cloudDisabled;
}

/** User-initiated recheck: reset the circuit breaker so Puter calls can resume. */
export function resetCloudCircuit() {
  _cloudFailures = [];
  _cloudDisabled = false;
  // Do NOT reset the warn-dedupe timestamps — the user clicking the pill
  // doesn't mean we should immediately spam the console again.
}

function _recordCloudError() {
  const now = Date.now();
  _cloudFailures.push(now);
  _cloudFailures = _cloudFailures.filter(t => now - t < CIRCUIT_WINDOW_MS);
  if (_cloudFailures.length >= CIRCUIT_THRESHOLD && !_cloudDisabled) {
    _cloudDisabled = true;
    // Trip event: only log once (when the breaker transitions to open).
    console.warn('[puter-lib] Cloud circuit opened (3+ failures in 30s); Puter calls paused');
  }
}

function _recordCloudSuccess() {
  if (!_cloudDisabled) _cloudFailures = [];
}

function _maybeWarn(scope, label, ...rest) {
  const now = Date.now();
  const stamp =
    scope === 'fs' ? _lastFsWarnAt :
    scope === 'logger' ? _lastLoggerWarnAt :
    scope === 'ai' ? _lastAiWarnAt : 0;
  if (now - stamp <= WARN_DEDUPE_MS) return;
  if (scope === 'fs') _lastFsWarnAt = now;
  else if (scope === 'logger') _lastLoggerWarnAt = now;
  else if (scope === 'ai') _lastAiWarnAt = now;
  console.warn(`[puter-lib:${scope}] ${label}`, ...rest);
}

/**
 * Determine whether a Puter SDK error represents a genuine backend
 * outage (5xx or network failure) vs a client-side issue (4xx).
 *
 * The Puter SDK wraps HTTP errors with `.status` and `.message`.
 * - 5xx status (500, 502, 503…) → server/backend error → trip breaker.
 * - No status (DNS failure, timeout, connection refused) → likely
 *   network-level outage → trip breaker.
 * - 4xx status (404, 403…) → client error (file not found, permission) →
 *   expected, do NOT trip breaker.
 */
function _isServerError(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  // No status code = network-level error (DNS, timeout) — treat as outage.
  if (status == null) return true;
  // 5xx = backend failure — trip the breaker.
  // 4xx = client error (404 not-found, 403 forbidden) — expected, don't trip.
  return status >= 500;
}

// ============================================================================
// 2. AUTH
// ============================================================================

let _cachedUser = undefined; // undefined = un-fetched, null = not authenticated

export const auth = {
  /**
   * Check if the user is currently signed in to Puter.
   *
   * @returns {Promise<boolean>}
   */
  async isSignedIn() {
    const p = await resolvePuter();
    if (!p || !p.auth) return false;
    if (typeof p.auth.isSignedIn === 'function') {
      try { return !!p.auth.isSignedIn(); } catch (_) { return false; }
    }
    // Fallback: try fetching the user
    const u = await this.getUser();
    return !!u;
  },

  /**
   * Get the current authenticated user object.
   * Returns null if not signed in or SDK unavailable.
   *
   * @returns {Promise<object|null>}
   */
  async getUser() {
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
  },

  /**
   * Get the display-friendly username of the current user.
   *
   * @returns {Promise<string|null>}
   */
  async getUsername() {
    const u = await this.getUser();
    return u ? (u.username || u.name || 'Pilot') : null;
  },

  /**
   * Get the avatar URL of the current user.
   *
   * @returns {Promise<string|null>}
   */
  async getAvatarUrl() {
    const u = await this.getUser();
    return u ? (u.avatar_url || u.avatar || null) : null;
  },

  /**
   * Trigger Puter OAuth sign-in flow.
   *
   * @returns {Promise<object|null>} The signed-in user object, or null on failure.
   */
  async signIn() {
    const p = await resolvePuter();
    if (!p || !p.auth || typeof p.auth.signIn !== 'function') return null;
    try {
      await p.auth.signIn();
      _cachedUser = undefined;
      return await this.getUser();
    } catch (_) { return null; }
  },

  /**
   * Sign out of Puter.
   *
   * @returns {Promise<boolean>}
   */
  async signOut() {
    const p = await resolvePuter();
    if (!p || !p.auth || typeof p.auth.signOut !== 'function') return false;
    try {
      await p.auth.signOut();
      _cachedUser = null;
      return true;
    } catch (_) { return false; }
  },

  /**
   * Invalidate the cached user so the next getUser() call re-fetches.
   */
  refreshUser() {
    _cachedUser = undefined;
  },
};

// ============================================================================
// 3. KV STORAGE  (cloud + localStorage fallback, offline-first)
// ============================================================================

/**
 * Default key prefix for KV operations. Override via setKeyPrefix().
 * Apps may set their own prefix to avoid collisions on shared Puter instances.
 *
 * @type {string}
 */
let _kvPrefix = 'puter_shared_';

/**
 * Set the KV key prefix for the current app.
 * Call once at startup, e.g. puter.kv.setKeyPrefix('kamikazzi3d_').
 *
 * @param {string} prefix
 */
export function setKvPrefix(prefix) {
  _kvPrefix = prefix || '';
}

function _localKey(key) {
  return _kvPrefix + key;
}

function _cloudKey(key) {
  return _kvPrefix + key;
}

function _localSet(key, value) {
  try { localStorage.setItem(_localKey(key), JSON.stringify(value)); } catch (_) {}
}

function _localGet(key) {
  try {
    const raw = localStorage.getItem(_localKey(key));
    return raw === null ? undefined : JSON.parse(raw);
  } catch (_) { return undefined; }
}

function _localDelete(key) {
  try { localStorage.removeItem(_localKey(key)); } catch (_) {}
}

export const kv = {
  /**
   * Set a value in KV storage. Writes to localStorage immediately and
   * attempts to sync to Puter KV asynchronously.
   *
   * @param {string} key
   * @param {*}      value — must be JSON-serializable.
   * @returns {Promise<boolean>} true if cloud write succeeded (not awaited).
   */
  async set(key, value) {
    _localSet(key, value);
    if (isCloudDisabled()) return false;
    const p = await resolvePuter();
    if (!p || !p.kv || typeof p.kv.set !== 'function') return false;
    try {
      await p.kv.set(_cloudKey(key), JSON.stringify(value));
      _recordCloudSuccess();
      return true;
    } catch (_) {
      _recordCloudError();
      return false;
    }
  },

  /**
   * Get a value from KV storage. Reads from Puter KV first (with local
   * fallback). If the cloud read succeeds, it syncs the value to localStorage
   * for future offline access.
   *
   * @param {string} key
   * @param {*}      [defaultValue] — returned if no value exists.
   * @returns {Promise<*>}
   */
  async get(key, defaultValue = undefined) {
    if (!isCloudDisabled()) {
      const p = await resolvePuter();
      if (p && p.kv && typeof p.kv.get === 'function') {
        try {
          const raw = await p.kv.get(_cloudKey(key));
          _recordCloudSuccess();
          if (raw !== undefined && raw !== null) {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            _localSet(key, parsed);
            return parsed;
          }
          // Cloud returned no value for this key → fall through to local
        } catch (_) {
          _recordCloudError();
          // Fall through to local
        }
      }
    }
    // Cloud unavailable or key not found → fall back to local
    const localVal = _localGet(key);
    return localVal !== undefined ? localVal : defaultValue;
  },

  /**
   * Delete a value from KV storage. Removes from both cloud and local.
   *
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    _localDelete(key);
    if (isCloudDisabled()) return false;
    const p = await resolvePuter();
    if (!p || !p.kv || typeof p.kv.del !== 'function') return false;
    try {
      await p.kv.del(_cloudKey(key));
      _recordCloudSuccess();
      return true;
    } catch (_) {
      _recordCloudError();
      return false;
    }
  },

  /**
   * Atomically increment a numeric KV value. Falls back to local read+write
   * if the cloud `incr` op is unavailable.
   *
   * @param {string} key
   * @param {number} [delta=1]
   * @returns {Promise<number>} The new value, or -1 on failure.
   */
  async incr(key, delta = 1) {
    if (!isCloudDisabled()) {
      const p = await resolvePuter();
      if (p && p.kv && typeof p.kv.incr === 'function') {
        try {
          const result = await p.kv.incr(_cloudKey(key), delta);
          _recordCloudSuccess();
          const val = Math.max(0, typeof result === 'number' ? result : 0);
          _localSet(key, val);
          return val;
        } catch (_) {
          _recordCloudError();
        }
      }
    }
    // Local fallback
    const current = _localGet(key);
    const next = (typeof current === 'number' ? current : 0) + delta;
    _localSet(key, next);
    return next;
  },

  /**
   * List all keys matching a prefix.
   * Note: only works for localStorage (cloud KV listing is not generally supported).
   *
   * @param {string} [prefix=''] — filter keys by this prefix.
   * @returns {string[]}
   */
  listLocalKeys(prefix = '') {
    const fullPrefix = _localKey(prefix);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keys.push(k.slice(fullPrefix.length));
      }
    }
    return keys;
  },

  /**
   * Set the key prefix for this session. All subsequent KV operations
   * will use this prefix for both cloud keys and localStorage keys.
   *
   * @param {string} prefix
   */
  setKeyPrefix(prefix) {
    setKvPrefix(prefix);
  },
};

// ============================================================================
// 4. FS OPERATIONS  (Puter File System)
// ============================================================================

export const fs = {
  /**
   * Write data to a file on the Puter virtual drive.
   *
   * @param {string}        path — absolute path (e.g. '/MyApp/logs/errors.jsonl').
   * @param {Blob|string}   data — file content as Blob or string.
   * @returns {Promise<boolean>}
   */
  async write(path, data) {
    if (isCloudDisabled()) return false;
    const p = await resolvePuter();
    if (!p || !p.fs || typeof p.fs.write !== 'function') return false;
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain' });
      await p.fs.write(path, blob);
      _recordCloudSuccess();
      return true;
    } catch (e) {
      _recordCloudError();
      _maybeWarn('fs', 'write failed:', path, e);
      return false;
    }
  },

  /**
   * Read a file from the Puter virtual drive.
   *
   * @param {string} path — absolute path.
   * @returns {Promise<{text: Function, blob: Function}|null>}
   *   Returns null if the file doesn't exist or the read fails.
   */
  async read(path) {
    if (isCloudDisabled()) return null;
    const p = await resolvePuter();
    if (!p || !p.fs || typeof p.fs.read !== 'function') return null;
    try {
      const file = await p.fs.read(path);
      _recordCloudSuccess();
      return file || null;
    } catch (e) {
      // Only trip the circuit breaker for genuine server/network errors
      // (5xx or no status). 4xx errors (404 not-found, 403 forbidden)
      // are expected client-side conditions and should not count toward
      // the 3-failure threshold.
      if (_isServerError(e)) _recordCloudError();
      return null;
    }
  },

  /**
   * Create a directory on the Puter virtual drive.
   * Safe to call even if the directory already exists.
   *
   * @param {string} path — absolute path (e.g. '/CloudAssets/myapp').
   * @returns {Promise<boolean>}
   */
  async mkdir(path) {
    if (isCloudDisabled()) return false;
    const p = await resolvePuter();
    if (!p || !p.fs || typeof p.fs.mkdir !== 'function') return false;
    try {
      await p.fs.mkdir(path);
      _recordCloudSuccess();
      return true;
    } catch (_) {
      // Directory may already exist — expected, not a backend outage.
      return false;
    }
  },

  /**
   * List files in a directory on the Puter virtual drive.
   * Returns an array of file objects ({name, fullPath, isDir, size, created})
   * or null if the directory doesn't exist or can't be read.
   *
   * @param {string} path — absolute path (e.g. '/CloudAssets').
   * @returns {Promise<Array|null>}
   */
  async readdir(path) {
    if (isCloudDisabled()) return null;
    const p = await resolvePuter();
    if (!p || !p.fs || typeof p.fs.readdir !== 'function') return null;
    try {
      const entries = await p.fs.readdir(path);
      _recordCloudSuccess();
      return Array.isArray(entries) ? entries : null;
    } catch (_) {
      // Directory not found or unreadable — expected, not a backend outage.
      return null;
    }
  },

  /**
   * Read a text file from the Puter virtual drive.
   * Convenience wrapper that calls .text() on the returned file.
   *
   * @param {string} path
   * @returns {Promise<string|null>}
   */
  async readText(path) {
    const file = await this.read(path);
    if (!file) return null;
    try {
      return typeof file.text === 'function' ? await file.text() : String(file);
    } catch (_) { return null; }
  },

  /**
   * Delete a file from the Puter virtual drive.
   *
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  async delete(path) {
    if (isCloudDisabled()) return false;
    const p = await resolvePuter();
    if (!p || !p.fs || typeof p.fs.delete !== 'function') return false;
    try {
      await p.fs.delete(path);
      _recordCloudSuccess();
      return true;
    } catch (e) {
      // Only trip the circuit breaker for genuine server/network errors.
      // 4xx (not-found, forbidden) are expected and should not count.
      if (_isServerError(e)) _recordCloudError();
      return false;
    }
  },
};

// ============================================================================
// 5. AI  (Chat completions, image generation, TTS)
// ============================================================================

export const ai = {
  /**
   * Send a chat completion request to Puter AI.
   *
   * @param {string|Array<{role:string,content:string}>} messages
   *   A string prompt, or an array of message objects.
   * @param {object} [options]
   * @param {string} [options.model]
   * @param {number} [options.temperature]
   * @param {number} [options.maxTokens]
   * @returns {Promise<string|null>} The response text content, or null.
   */
  async chat(messages, options = {}) {
    if (isCloudDisabled()) return null;
    const p = await resolvePuter();
    if (!p || !p.ai || typeof p.ai.chat !== 'function') return null;
    try {
      const prompt = typeof messages === 'string' ? messages : messages;
      const response = await p.ai.chat(prompt, {
        model: options.model || undefined,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens || 1024,
      });
      _recordCloudSuccess();
      return typeof response === 'string' ? response : (response && response.message) || null;
    } catch (e) {
      _recordCloudError();
      _maybeWarn('ai', 'chat failed:', e);
      return null;
    }
  },

  /**
   * Generate an image via Puter AI text-to-image.
   *
   * @param {string} prompt
   * @param {object} [options]
   * @param {string} [options.size='512x512']
   * @param {string} [options.negative_prompt]
   * @returns {Promise<string|null>} The image URL, or null.
   */
  async generateImage(prompt, options = {}) {
    if (isCloudDisabled()) return null;
    const p = await resolvePuter();
    if (!p || !p.ai || typeof p.ai.txt2img !== 'function') return null;
    try {
      const result = await p.ai.txt2img(prompt, {
        size: options.size || '512x512',
        negative_prompt: options.negative_prompt || undefined,
      });
      _recordCloudSuccess();
      return (result && result.url) || result || null;
    } catch (e) {
      _recordCloudError();
      _maybeWarn('ai', 'generateImage failed:', e);
      return null;
    }
  },

  /**
   * Convert text to speech via Puter AI.
   *
   * @param {string} text
   * @returns {Promise<string|null>} The audio URL or data URI, or null.
   */
  async textToSpeech(text) {
    if (isCloudDisabled()) return null;
    const p = await resolvePuter();
    if (!p || !p.ai || typeof p.ai.txt2speech !== 'function') return null;
    try {
      const result = await p.ai.txt2speech(text);
      _recordCloudSuccess();
      return result || null;
    } catch (e) {
      _recordCloudError();
      _maybeWarn('ai', 'textToSpeech failed:', e);
      return null;
    }
  },
};

// ============================================================================
// 6. CLIENT ERROR LOGGER  (buffered, flushes to Puter FS)
// ============================================================================

const LOGGER_MAX_BUFFER = 50;
const LOGGER_FLUSH_BATCH = 20;
const LOGGER_DEDUP_MS = 5000;
const LOGGER_FLUSH_DEBOUNCE_MS = 2000;

const _logSeen = new Map();
const _logBuffer = [];
let _logFlushTimer = null;
let _logFlushing = false;
let _logBasePath = '/PuterLib_Logs';

/**
 * Set the base directory for error log files.
 * Default: '/PuterLib_Logs'
 *
 * @param {string} path
 */
export function setLogBasePath(path) {
  _logBasePath = path;
}

function _logDedup(kind, message) {
  const key = kind + '|' + String(message || '').slice(0, 200);
  const now = Date.now();
  if (_logSeen.size > 200) {
    for (const [k, t] of _logSeen) {
      if (now - t > 20000) _logSeen.delete(k);
    }
  }
  if (_logSeen.has(key) && (now - _logSeen.get(key)) < LOGGER_DEDUP_MS) {
    _logSeen.set(key, now);
    return true;
  }
  _logSeen.set(key, now);
  return false;
}

function _logScheduleFlush() {
  if (_logFlushTimer || _logFlushing) return;
  if (_logBuffer.length >= LOGGER_FLUSH_BATCH) { _logFlush().catch(() => {}); return; }
  _logFlushTimer = setTimeout(() => { _logFlush().catch(() => {}); }, LOGGER_FLUSH_DEBOUNCE_MS);
}

async function _logFlush() {
  _logFlushTimer = null;
  if (_logFlushing || _logBuffer.length === 0) return;
  if (isCloudDisabled()) return;
  _logFlushing = true;
  const toFlush = _logBuffer.splice(0, _logBuffer.length);
  try {
    const date = new Date().toISOString().slice(0, 10);
    const logPath = _logBasePath + '/errors-' + date + '.jsonl';
    const newContent = toFlush.map(e => JSON.stringify(e)).join('\n') + '\n';

    // Route through the fs wrappers so circuit breaker tracking,
    // deduped warnings, and future instrumentation apply uniformly.
    const file = await fs.read(logPath);
    const existing = (file && typeof file.text === 'function')
      ? await file.text() : '';

    const blob = new Blob([existing + newContent], { type: 'text/plain' });
    const ok = await fs.write(logPath, blob);
    if (!ok) {
      // fs.write returns false on failure (it records the error via the
      // circuit breaker and issues its own deduped warn under 'fs' scope).
      // Issue a logger-scoped warn as well and re-push entries so they
      // survive the failed flush and are retried later.
      _logBuffer.unshift(...toFlush);
      _maybeWarn('logger', 'FS write failed:', logPath);
    }
  } catch (e) {
    // Unexpected error — should be rare since the fs wrappers are
    // non-throwing. Re-push entries so no data is lost.
    _logBuffer.unshift(...toFlush);
    _maybeWarn('logger', 'FS write failed:', e);
  } finally {
    _logFlushing = false;
    if (_logBuffer.length > 0) _logScheduleFlush();
  }
}

export const ClientLogger = {
  /**
   * Install global error handlers (window.onerror + unhandledrejection).
   * Call once during app startup.
   */
  install() {
    if (window.__puterLibLoggerInstalled) return;
    window.__puterLibLoggerInstalled = true;

    window.addEventListener('error', (e) => {
      if (e && e.target && e.target !== window) {
        const t = e.target;
        const tag = (t.tagName || 'resource').toLowerCase();
        const src = t.src || t.href || null;
        this.report('resource', `Failed to load ${tag}${src ? ': ' + src : ''}`);
        return;
      }
      this.report('error', (e && (e.error || e.message)) || e,
        e && e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null);
    }, true);

    window.addEventListener('unhandledrejection', (e) => {
      this.report('rejection', e && e.reason, 'promise');
    });
  },

  /**
   * Report a client error. Buffered and flushed asynchronously to Puter FS.
   *
   * @param {string} kind     — 'error', 'rejection', 'resource', etc.
   * @param {*}      err      — the error object, message, or reason.
   * @param {string} [source] — optional source label.
   */
  report(kind, err, source) {
    let message = 'unknown';
    let stack = null;
    if (err) {
      if (typeof err === 'string') message = err;
      else if (err.message) message = err.message;
      else if (err.reason) message = String(err.reason);
      else message = String(err);
      stack = err.stack || null;
    }
    if (_logDedup(kind, message)) return;

    const entry = {
      ts: new Date().toISOString(),
      kind,
      message: String(message).slice(0, 1000),
      source: source || null,
      stack: stack ? String(stack).slice(0, 4000) : null,
      url: location.href,
      userAgent: navigator.userAgent,
    };
    _logBuffer.push(entry);
    if (_logBuffer.length > LOGGER_MAX_BUFFER) _logBuffer.shift();
    _logScheduleFlush();
  },

  /**
   * Force an immediate flush of the buffer.
   * @returns {Promise<void>}
   */
  async flush() {
    await _logFlush();
  },
};

// ============================================================================
// 7. DEFAULT EXPORT — convenience namespace
// ============================================================================

const puter = {
  resolvePuter,
  isPuterAvailable,
  isCloudDisabled,
  resetCloudCircuit,
  getAiModule,
  auth,
  kv,
  fs,
  ai,
  ClientLogger,
  setKvPrefix,
  setLogBasePath,
};

export default puter;
