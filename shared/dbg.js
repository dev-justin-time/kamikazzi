/**
 * shared/dbg.js
 *
 * Debug helper — gates all console output behind window.DEBUG.
 * Shared by all 3 apps:
 *   - KAMAKAZII STUDIO 3D
 *   - VECTOR STRIKE: OMNI (kamasazii_vecter_omega3d)
 *   - AERO COMMAND // KAMIKAZZI 3D (kamakazii_3d_aero_comand)
 *
 * Production-debug toggle (new): support sessions can enable logging
 * in production via any of:
 *
 *   (a) `localStorage.getItem('kamikazzi_debug') === '1'`
 *   (b) URL `?debug=1`  (or `?debug=true`)  — auto-persists to localStorage
 *                    so a refresh keeps it on. Pass `?debug=0` to clear.
 *   (c) In-app status-bar click-to-toggle (see shared/dbg-toggle.js)
 *
 * For the explicit dev override, set `window.DEBUG = true` in DevTools
 * before modules load (highest precedence; not persisted).
 *
 * Usage:
 *   import { dbg, isDebugEnabled, setDebug } from '../../shared/dbg.js';
 *   dbg.warn('Something happened', err);
 *   dbg.log('Info');
 *   dbg.error('Fatal');
 *   dbg.info('Notice');
 *   dbg.debug('Trace');
 *
 *   // Programmatic toggle (e.g. from a click handler):
 *   setDebug(!isDebugEnabled());
 *
 * Single source of truth: `window.DEBUG`. URL parsing runs once on module
 * load and again on `pageshow` (handles browser back/forward). The
 * `kamikazzi:debug-changed` CustomEvent fires whenever the state flips
 * via setDebug, so UI elements can sync.
 *
 * History: extracted from each project's local dbg.js during the
 * cross-project dedup pass. studio3D's version had 5 methods (warn/error/
 * log/info/debug); aero and vecter-omega had 3 (warn/error/log). This
 * canonical version is the superset.
 */

const LS_KEY = 'kamikazzi_debug';
const DEBUG_EVENT = 'kamikazzi:debug-changed';

// Run-once state cache. We avoid parsing the URL or reading localStorage
// on every `dbg.log()` call; instead, `window.DEBUG` is the master lever.
let _initialized = false;

function initDebug() {
  if (typeof window === 'undefined') return;
  // If the dev has already pinned `window.DEBUG = true` (e.g. via a
  // bookmarklet or DevTools), respect it and skip URL/LS logic.
  if (typeof window.DEBUG === 'boolean') {
    _initialized = true;
    return;
  }

  let isOn = false;
  let urlHasFlag = false;

  // 1. URL flag (highest precedence if present)
  if (typeof URLSearchParams !== 'undefined' && window.location) {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('debug')) {
        urlHasFlag = true;
        const val = params.get('debug');
        isOn = (val === '1' || val === 'true');
      }
    } catch (_) { /* URL parsing failed — fall through */ }
  }

  // 2. localStorage (persistent fallback, only consulted if URL has no flag)
  if (!urlHasFlag) {
    try {
      isOn = window.localStorage.getItem(LS_KEY) === '1';
    } catch (_) { /* private/incognito mode or quota exceeded */ }
  }

  // 3. Persist URL flags to localStorage so a refresh keeps the state
  if (urlHasFlag) {
    try {
      if (isOn) window.localStorage.setItem(LS_KEY, '1');
      else      window.localStorage.removeItem(LS_KEY);
    } catch (_) { /* swallow */ }
  }

  window.DEBUG = isOn;
  _initialized = true;
}

/** Public read accessor — O(1), no URL/LS work. */
export function isDebugEnabled() {
  if (typeof window === 'undefined') return false;
  if (!_initialized) initDebug();
  return window.DEBUG === true;
}

/**
 * Public write accessor — flips debug on/off, persists to localStorage,
 * updates `window.DEBUG`, and fires `kamikazzi:debug-changed` so any
 * subscribed UI (e.g. status-bar toggle) can re-sync.
 *
 * @param {boolean} on
 */
export function setDebug(on) {
  if (typeof window === 'undefined') return;
  const isOn = !!on;

  window.DEBUG = isOn;

  try {
    if (isOn) window.localStorage.setItem(LS_KEY, '1');
    else      window.localStorage.removeItem(LS_KEY);
  } catch (_) { /* private/incognito mode or quota exceeded */ }

  // Notify listeners (status-bar toggle UI, telemetry bridges, etc.)
  try {
    window.dispatchEvent(new CustomEvent(DEBUG_EVENT, { detail: { isDebug: isOn } }));
  } catch (_) { /* CustomEvent unavailable in very old browsers */ }
}

const isDebug = isDebugEnabled;

export const dbg = {
  warn:  (...args) => { if (isDebug()) console.warn(...args); },
  error: (...args) => { if (isDebug()) console.error(...args); },
  log:   (...args) => { if (isDebug()) console.log(...args); },
  info:  (...args) => { if (isDebug()) console.info(...args); },
  debug: (...args) => { if (isDebug()) console.debug(...args); },
};

// One-time initialization: parse URL + localStorage at module load.
// Also re-run on `pageshow` to handle browser back/forward navigation
// where the URL might have changed.
if (typeof window !== 'undefined') {
  initDebug();
  window.addEventListener('pageshow', () => initDebug());
}
