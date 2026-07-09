/**
 * shared/error-logger.js
 *
 * ClientErrorLogger — shared by all 3 apps:
 *   - KAMAKAZII STUDIO 3D
 *   - VECTOR STRIKE: OMNI
 *   - AERO COMMAND // KAMIKAZZI 3D
 *
 * Catches window.onerror + unhandledrejection, deduplicates within a 5s
 * window, buffers up to 50 entries, and flushes to Puter FS
 * (date-bucketed JSONL at <logDir>/errors-YYYY-MM-DD.jsonl) plus an
 * optional analytics endpoint.
 *
 * Per-project configuration is passed to `install()`:
 *   ClientErrorLogger.install({
 *     logDir: '/KamikazziStudio3D_Logs',  // required
 *     getAnalyticsConfig: () => CONFIG.analytics,  // optional
 *     isPuterReady: () => state.puterReady,         // optional
 *   });
 *
 * Flush is debounced (2s after the last new error, or when the buffer
 * hits 20 entries) and re-tries on Puter-not-ready. Logging itself
 * never throws — the app must not die because telemetry failed.
 *
 * History: extracted from each project's local error-logger.js during
 * the cross-project dedup pass. The 3 originals were near-identical
 * (~140 lines each) — they differed only in (1) log dir name, (2)
 * where the analytics config came from, and (3) whether to gate on a
 * `state.puterReady` flag. Vecter-Omega's `let toFlush = []` hoist fix
 * is preserved.
 *
 * Production chokepoint: this is the single place to add cross-cutting
 * logging features that should apply across all 3 apps. Likely future
 * additions: Sentry hook (call `Sentry.captureException` from `report()`),
 * anonymous-id tagging (inject a stable id into every entry), dedup-map
 * quota tuning, dev-mode redaction of PII from `message`/`stack`.
 */

const MAX_BUFFER = 50;
const FLUSH_BATCH = 20;
const DEDUP_WINDOW_MS = 5000;
const FLUSH_DEBOUNCE_MS = 2000;

// Per-project configuration (set by install())
let logDir = '/Logs';
let getAnalyticsConfig = () => ({ enabled: false, endpoint: null });
let isPuterReady = () => true;

// Internal state
const seen = new Map();   // key -> ts (for dedup)
const buffer = [];
let flushTimer = null;
let flushing = false;     // re-entrancy guard

function makeKey(kind, message) {
  return kind + '|' + String(message || '').slice(0, 200);
}

function isDuplicate(kind, message) {
  const key = makeKey(kind, message);
  const last = seen.get(key);
  const now = Date.now();
  if (seen.size > 200) {
    for (const [k, t] of seen) {
      if (now - t > DEDUP_WINDOW_MS * 4) seen.delete(k);
    }
  }
  if (last && (now - last) < DEDUP_WINDOW_MS) {
    seen.set(key, now);
    return true;
  }
  seen.set(key, now);
  return false;
}

function report(kind, err, source) {
  let message = 'unknown';
  let stack = null;
  if (err) {
    if (typeof err === 'string') message = err;
    else if (err.message) message = err.message;
    else if (err.reason) message = String(err.reason);
    else message = String(err);
    stack = err.stack || null;
  }
  if (isDuplicate(kind, message)) return;
  const entry = {
    ts: new Date().toISOString(),
    kind,
    message: String(message).slice(0, 1000),
    source: source || null,
    stack: stack ? String(stack).slice(0, 4000) : null,
    url: location.href,
    userAgent: navigator.userAgent,
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  // The global error logger must always reach stdout (even when
  // window.DEBUG is false) so error reporting is never silenced.
  // eslint-disable-next-line no-restricted-imports
  console.error('[CLIENT-ERROR]', kind, entry.message, source || '');

  const analyticsCfg = getAnalyticsConfig();
  if (analyticsCfg && analyticsCfg.enabled && analyticsCfg.endpoint) {
    try {
      fetch(analyticsCfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer || flushing) return;
  if (buffer.length >= FLUSH_BATCH) { flush(); return; }
  flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
}

async function flush() {
  flushTimer = null;
  if (flushing) return;
  if (buffer.length === 0) return;
  if (typeof puter === 'undefined' || !puter || !puter.fs) return;
  if (!isPuterReady()) { scheduleFlush(); return; }
  flushing = true;
  // Hoisted to prevent ReferenceError crash when an exception fires
  // before the first assignment inside the try block.
  let toFlush = [];
  try {
    toFlush = buffer.splice(0, buffer.length);
    const date = new Date().toISOString().slice(0, 10);
    const logPath = logDir + '/errors-' + date + '.jsonl';
    const newContent = toFlush.map(e => JSON.stringify(e)).join('\n') + '\n';
    let existing = '';
    try {
      const file = await puter.fs.read(logPath);
      if (file && typeof file.text === 'function') existing = await file.text();
    } catch (_) { /* file doesn't exist yet — fine */ }
    const blob = new Blob([existing + newContent], { type: 'text/plain' });
    await puter.fs.write(logPath, blob);
  } catch (e) {
    if (toFlush.length) buffer.unshift(...toFlush);
    // eslint-disable-next-line no-restricted-imports
    console.warn('[CLIENT-ERROR] Puter FS write failed:', e);
  } finally {
    flushing = false;
    if (buffer.length > 0) scheduleFlush();
  }
}

/**
 * Configure and attach global error handlers.
 *
 * @param {object}  opts
 * @param {string}  opts.logDir             - Required. Puter FS dir where date-bucketed logs are written.
 * @param {Function} [opts.getAnalyticsConfig] - Returns { enabled, endpoint } or null/undefined.
 * @param {Function} [opts.isPuterReady]    - Predicate checked before each flush (default always true).
 */
function install(opts = {}) {
  if (opts.logDir) logDir = opts.logDir;
  if (typeof opts.getAnalyticsConfig === 'function') getAnalyticsConfig = opts.getAnalyticsConfig;
  if (typeof opts.isPuterReady === 'function') isPuterReady = opts.isPuterReady;

  if (window.__clientErrorLogger_installed) return;
  window.__clientErrorLogger_installed = true;

  // Capture phase = true so resource-load failures bubble to us.
  window.addEventListener('error', (e) => {
    if (e && e.target && e.target !== window) {
      const t = e.target;
      const tag = (t.tagName || 'resource').toLowerCase();
      const src = t.src || t.href || null;
      report('resource', new Error('Failed to load ' + tag + (src ? ': ' + src : '')),
        tag + (src ? ' (' + src + ')' : null));
      return;
    }
    report('error', (e && (e.error || e.message)) || e,
      e && e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : null);
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    report('rejection', e && e.reason, 'promise');
  });
}

export const ClientErrorLogger = { install, report, flush };
