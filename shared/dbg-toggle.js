/**
 * shared/dbg-toggle.js
 *
 * In-app status-bar click-to-toggle for the production-debug gate
 * (see shared/dbg.js).
 *
 * Usage:
 *   import { createDbgToggle } from '../../shared/dbg-toggle.js';
 *   const btn = document.getElementById('dbgToggle');
 *   const cleanup = createDbgToggle(btn);
 *   // ...later, on teardown:
 *   cleanup();
 *
 * The element gets these classes (configurable via opts):
 *   - `dbg-toggle`        (always)
 *   - `dbg-toggle-on`      (when debug is enabled)
 *   - `dbg-toggle-off`     (when debug is disabled)
 *
 * And these attributes are kept in sync:
 *   - `aria-pressed="true|false"`
 *   - `aria-label`         (descriptive for screen readers)
 *   - `title`              (tooltip)
 *   - `textContent`        ("DBG" when off, "🐞 DEBUG ON" when on)
 *
 * Visual styling is intentionally minimal (no CSS file ships with this
 * helper) — projects that want polished styling should provide their own
 * CSS targeting `.dbg-toggle-on` / `.dbg-toggle-off`.
 */

import { isDebugEnabled, setDebug } from './dbg.js';
const DEBUG_EVENT = 'kamikazzi:debug-changed';

/**
 * Wire a click-to-toggle debug button to the given DOM element.
 *
 * @param {HTMLElement} element
 * @param {object} [opts]
 * @param {string} [opts.baseClass='dbg-toggle']
 * @param {string} [opts.onClass='dbg-toggle-on']
 * @param {string} [opts.offClass='dbg-toggle-off']
 * @param {string} [opts.textOn='🐞 DEBUG ON']
 * @param {string} [opts.textOff='DBG']
 * @param {string} [opts.onTitle='Debug mode is ON. Click to disable.']
 * @param {string} [opts.offTitle='Debug mode is OFF. Click to enable. Click again to silence console output in production.']
 * @param {string} [opts.ariaLabel='Toggle debug logging']
 * @returns {Function} cleanup function (call on teardown to remove listeners)
 */
export function createDbgToggle(element, opts = {}) {
  if (!element) return () => {};

  const clsBase  = opts.baseClass  || 'dbg-toggle';
  const clsOn    = opts.onClass    || 'dbg-toggle-on';
  const clsOff   = opts.offClass   || 'dbg-toggle-off';
  const textOn   = opts.textOn     || '🐞 DEBUG ON';
  const textOff  = opts.textOff    || 'DBG';
  const onTitle  = opts.onTitle    || 'Debug mode is ON. Click to disable.';
  const offTitle = opts.offTitle   || 'Debug mode is OFF. Click to enable. Useful for support sessions.';
  const ariaLabel= opts.ariaLabel  || 'Toggle debug logging';

  element.classList.add(clsBase);
  element.setAttribute('aria-label', ariaLabel);
  if (!element.hasAttribute('type')) {
    // <button> defaults to submit inside <form>; force plain button.
    if (element.tagName === 'BUTTON') element.setAttribute('type', 'button');
  }

  const updateUI = () => {
    const on = isDebugEnabled();
    element.classList.toggle(clsOn, on);
    element.classList.toggle(clsOff, !on);
    element.textContent = on ? textOn : textOff;
    element.setAttribute('aria-pressed', String(on));
    element.title = on ? onTitle : offTitle;
  };

  const onClick = () => setDebug(!isDebugEnabled());
  const onEvent = () => updateUI();

  element.addEventListener('click', onClick);
  window.addEventListener(DEBUG_EVENT, onEvent);

  // Sync UI to current state immediately.
  updateUI();

  // Cleanup
  return () => {
    element.removeEventListener('click', onClick);
    window.removeEventListener(DEBUG_EVENT, onEvent);
  };
}
