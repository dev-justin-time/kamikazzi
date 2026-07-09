/**
 * shared/dbg.js
 *
 * Debug helper — gates all console output behind window.DEBUG.
 * Shared by all 3 apps:
 *   - KAMAKAZII STUDIO 3D
 *   - VECTOR STRIKE: OMNI (kamasazii_vecter_omega3d)
 *   - AERO COMMAND // KAMIKAZZI 3D (kamakazii_3d_aero_comand)
 *
 * Usage:
 *   import { dbg } from '../../shared/dbg.js';
 *   dbg.warn('Something happened', err);
 *   dbg.log('Info');
 *   dbg.error('Fatal');
 *   dbg.info('Notice');
 *   dbg.debug('Trace');
 *
 * Set `window.DEBUG = true` in DevTools to re-enable logging. The check
 * runs at every call (O(1) — same cost as a captured constant), so
 * toggling window.DEBUG after page load takes effect immediately.
 *
 * History: extracted from each project's local dbg.js during the
 * cross-project dedup pass. studio3D's version had 5 methods (warn/error/
 * log/info/debug); aero and vecter-omega had 3 (warn/error/log). This
 * canonical version is the superset — projects that don't need
 * info/debug simply ignore them.
 */

// Re-read window.DEBUG on every call so toggling it from DevTools at
// runtime (after the page is loaded) takes effect immediately. This is
// the single highest-leverage prod-hardening touch in the entire dedup.
const isDebug = () => typeof window !== 'undefined' && window.DEBUG === true;

export const dbg = {
  warn:  (...args) => { if (isDebug()) console.warn(...args); },
  error: (...args) => { if (isDebug()) console.error(...args); },
  log:   (...args) => { if (isDebug()) console.log(...args); },
  info:  (...args) => { if (isDebug()) console.info(...args); },
  debug: (...args) => { if (isDebug()) console.debug(...args); },
};
