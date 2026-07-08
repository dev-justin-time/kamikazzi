/* game/screen-loader.js
   ===========================================================================
   Dynamic screen loader for gui-states HTML files.

   Fetches each gui-states HTML file, extracts the <main> panel design
   and inline styles, and injects them into the corresponding inlined overlay
   div in index.html as a VISIBLE design backdrop.

   The design layer sits at z-index: 1 with the functional game content
   (buttons, input fields, etc.) floating above at z-index: 2 with a
   glass-morphism (semi-transparent) backdrop so the design shows through.

   Auto-inject via MutationObserver:
     When an overlay's "hidden" class is removed (making it visible), the
     corresponding gui-state design is auto-injected (once). This means
     all 22 panels get their designs without modifying ui.js at all.

   Usage:
     import { screenLoader } from './screen-loader.js';
     screenLoader.init();   // start MutationObserver + load styles
     screenLoader.inject('boot');  // manual inject also works

   Architecture:
     - All game overlays are inlined in index.html with their functional IDs
     - screen-loader fetches gui-states HTML, extracts <main> content
     - The <main> content is injected as a visible backdrop inside the overlay
     - Functional elements remain on top with glass-morphism styling
     - Inline styles (animations, keyframes) are injected into <head>
   ===========================================================================
*/

const GUI_STATES_DIR = './gui-states/';

/** Screen name → gui-states file path mapping */
const SCREEN_MAP = {
  'boot':              'boot.html',
  'start':             'start.html',
  'pause':             'pause.html',
  'crash':             'crash.html',
  'mission-terminated':'mission-terminated.html',
  'mission-success':   'mission-success.html',
  'final-sector':      'final-sector.html',
  'model-upgrade':     'model-upgrade.html',
  'leaderboard':       'leaderboard.html',
  'lobby':             'lobby.html',
  'profile':           'profile.html',
  'skin-lab':          'skin-lab.html',
  'marketplace':       'marketplace.html',
  'powerups':          'powerups.html',
  'replays':           'replays.html',
  'replay-detail':     'replay-detail.html',
  'history':           'history.html',
  'briefings':         'briefings.html',
  'settings':          'settings.html',
  'shortcuts':         'shortcuts.html',
  'legal':             'legal.html',
  'delete-confirm':    'delete-confirm.html',
  'terrain-editor':    'terrain-editor.html',
  'hud':               'hud.html',
  'index':             'index.html',
};

/** Injected style sets, keyed by screen name — prevents duplicate injection */
const _injectedStyles = new Set();

/**
 * Fetch a gui-states HTML file and extract its <main> content + inline styles.
 * @param {string} name - Screen name key from SCREEN_MAP
 * @returns {{mainHTML: string, styles: string[], title: string}}
 */
async function fetchScreen(name) {
  const file = SCREEN_MAP[name];
  if (!file) throw new Error(`[ScreenLoader] Unknown screen: "${name}"`);

  const resp = await fetch(GUI_STATES_DIR + file);
  if (!resp.ok) throw new Error(`[ScreenLoader] Failed to load ${file}: ${resp.status}`);
  const html = await resp.text();

  // Parse as HTML to extract <main> content
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Extract <main> content — the visual panel design
  let mainEl = doc.querySelector('main');
  let mainHTML;
  if (!mainEl) {
    // Fallback: use body content without the nav bar
    const nav = doc.querySelector('nav');
    if (nav) nav.remove();
    const bodyContent = doc.body ? doc.body.innerHTML : '';
    // Try to extract content after the nav bar
    const firstSection = doc.querySelector('main, .page-content, .game-frame, .boot-panel, .mission-panel, .success-panel, .lb-panel, .sc-panel, .mp-panel');
    mainHTML = firstSection ? firstSection.outerHTML : bodyContent;
  } else {
    mainHTML = mainEl.innerHTML;
  }

  // Extract inline <style> blocks (animations, keyframes, etc.)
  const styles = [];
  doc.querySelectorAll('style').forEach(s => {
    // Skip tailwind config scripts
    if (!s.id || !s.id.startsWith('tailwind')) {
      styles.push(s.textContent);
    }
  });

  return { mainHTML, styles, title: doc.title || name };
}

const _injected = new Set();

/** Screens that should NOT get design injection (e.g., crash overlay
 * that needs its solid black background for the explosion effect). */
const _skipScreens = new Set(['crash']);

/**
 * Inject gui-states <main> content as a visible design backdrop inside
 * the corresponding inlined overlay.
 * @param {string} name - gui-state name (e.g. 'boot', 'leaderboard')
 */

async function inject(name) {
  if (_injected.has(name) || _skipScreens.has(name)) return;

  // Find the overlay by data-gui-state attribute
  const target = document.querySelector(`[data-gui-state="${name}"]`);
  if (!target) {
    console.warn(`[ScreenLoader] No overlay with data-gui-state="${name}" found`);
    return;
  }

  try {
    const { mainHTML, styles } = await fetchScreen(name);

    // Mark the overlay as wired so CSS can adjust backgrounds
    target.classList.add('gui-state-wired');

    // Inject the gui-states design as a visible backdrop layer
    const designDiv = document.createElement('div');
    designDiv.className = 'gui-state-design';
    // The design is a visible backdrop — pointer-events:none so clicks pass through
    designDiv.innerHTML = mainHTML;
    target.insertBefore(designDiv, target.firstChild);

    // Inject inline styles (once per screen)
    for (const css of styles) {
      const key = `gui-state-style-${name}`;
      if (!_injectedStyles.has(key)) {
        _injectedStyles.add(key);
        const styleTag = document.createElement('style');
        styleTag.id = key;
        styleTag.textContent = css;
        document.head.appendChild(styleTag);
      }
    }

    _injected.add(name);
    if (window.__screenLoaderDebug) {
      console.log(`[ScreenLoader] Injected design for "${name}"`);
    }
  } catch (e) {
    console.warn(`[ScreenLoader] Failed to inject screen "${name}":`, e);
  }
}

/**
 * Inject design into an overlay element by its ID or a direct reference.
 * Useful for programmatic calls where we know the element.
 * @param {string|Element} target - Element ID string, or DOM element
 */
async function injectElement(target) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  const state = el.getAttribute('data-gui-state');
  if (state) {
    await inject(state);
  }
}

/**
 * Load gui-states/styles.css dynamically.
 * Also injects CSS that makes the design layer visible.
 */
let _cssLoaded = false;
async function loadStyles() {
  if (_cssLoaded) return;

  // 1) Inject gui-state visibility CSS
  const visibilityCss = document.createElement('style');
  visibilityCss.id = 'gui-state-visibility';
  visibilityCss.textContent = `
    /* gui-state-wired overlays: remove their own background so design shows through */
    .gui-state-wired {
      background: transparent !important;
      background-color: transparent !important;
      backdrop-filter: none !important;
    }

    /* The gui-state design layer: visible backdrop with z-index: 1 */
    .gui-state-design {
      position: absolute;
      inset: 0;
      z-index: 1;
      overflow: hidden;
      pointer-events: none;
      opacity: 0.85;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Direct functional children of a wired overlay float above the design
       with glass-morphism transparency so the design shows through */
    .gui-state-wired > :not(.gui-state-design) {
      position: relative;
      z-index: 2;
    }

    /* Panels with explicit backgrounds should become semi-transparent */
    .gui-state-wired .lb-panel,
    .gui-state-wired .sc-panel,
    .gui-state-wired .mp-panel,
    .gui-state-wired .mission-panel,
    .gui-state-wired .success-panel,
    .gui-state-wired .pause-panel,
    .gui-state-wired .boot-panel,
    .gui-state-wired .legal-section {
      background: rgba(0, 11, 26, 0.55) !important;
      backdrop-filter: blur(4px) !important;
    }

    /* Buttons, inputs, and interactive elements on top of the design */
    .gui-state-wired button,
    .gui-state-wired input,
    .gui-state-wired select {
      position: relative;
      z-index: 3;
    }
  `;
  document.head.appendChild(visibilityCss);

  // 2) Load gui-states/styles.css if available
  if (!document.querySelector('link[href*="gui-states/styles.css"]')) {
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = GUI_STATES_DIR + 'styles.css';
      document.head.appendChild(link);
    } catch (e) {
      console.warn('[ScreenLoader] Failed to load gui-states/styles.css:', e);
    }
  }

  _cssLoaded = true;
}

/**
 * MutationObserver that auto-injects gui-states designs when overlays
 * are made visible (hidden class is removed).
 */
let _observer = null;

function startObserver() {
  if (_observer) return;

  _observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          mutation.target.hasAttribute('data-gui-state')) {
        const el = mutation.target;
        const nowHidden = el.classList.contains('hidden');
        if (!nowHidden) {
          // Overlay was just made visible — inject its design
          const state = el.getAttribute('data-gui-state');
          if (state && !_injected.has(state)) {
            inject(state).catch(() => {});
          }
        }
      }
    }
  });

  // Watch the entire document for class changes on elements with data-gui-state
  _observer.observe(document.body || document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // Also scan existing visible overlays (e.g., bootScreen which starts visible)
  document.querySelectorAll('[data-gui-state]:not(.hidden)').forEach(el => {
    const state = el.getAttribute('data-gui-state');
    if (state && !_injected.has(state)) {
      inject(state).catch(() => {});
    }
  });
}

/**
 * Initialize screen-loader: load styles + start auto-injection observer.
 * Call this once from main.js during boot.
 */
async function init() {
  await loadStyles();
  startObserver();
  if (window.__screenLoaderDebug) {
    console.log('[ScreenLoader] Initialized — watching for overlay visibility changes');
  }
}

/** Get the gui-states <main> HTML for a screen without injecting (for debugging). */
async function fetchHTML(name) {
  const { mainHTML } = await fetchScreen(name);
  return mainHTML;
}

/** Check if a screen has been injected. */
function isInjected(name) {
  return _injected.has(name);
}

/** Reset injection state (for cleanup/testing). */
function reset() {
  _injected.clear();
  _injectedStyles.clear();
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
}

export const screenLoader = {
  init,
  inject,
  injectElement,
  loadStyles,
  startObserver,
  fetchHTML,
  isInjected,
  reset,
  get SCREEN_MAP() { return SCREEN_MAP; },
};
