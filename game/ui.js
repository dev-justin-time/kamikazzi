/* game/ui.js
   Responsibility: wire DOM elements (start, retry, score, level, crash-flow)
   to the world API.

   Crash flow on state.over:
     1. #explodeScreen shows EXPLODE_GIF_URL (preloaded in shared.js) for 3
        sequential plays (each play is the GIF's native 1.7s loop, src
        cache-busted to restart).
     2. #explodeScreen hides, #gameOver shows with CRASH_SPLASH_URL crash
        splash + Try Again button.
   3. Each play is 1800ms (1.7s native loop + 100ms buffer) — see
      CRASH_KEYFRAMES in shared.js for the canonical cadence table.

   Sequence state is reset by start()/retry() so subsequent crashes re-trigger.
*/
import { EXPLODE_GIF_URL, CRASH_KEYFRAMES, CRASH_TOTAL_PLAYS, TUNING } from './world/shared.js';

// Per-type pickup tone recipes (Web Audio API synthesis). Each entry
// drives an OscillatorNode + GainNode envelope attached to the shared
// AudioContext (see world.js#audioListener.context). Purely procedural;
// no .wav file dependency. Real assets can be dropped at the canonical
// URLs in POWERUP_SFX_URLS (shared.js) and the recipes retired in a
// one-line swap — frequency choice keeps the same "feel" today, so a
// later swap to real WAVs preserves which-type-picked-up-by-ear.
//
// Recipe fields:
//   base       start frequency in Hz
//   slope      per-recipe multiplier at recipe.duration (set this for
//              a sweep — up = boost, down = slowmo)
//   type       OscillatorNode type ('sine'|'triangle'|'sawtooth'|'square')
//   duration   total length in seconds
//   gain       peak gain (≤ 0.4 to keep layered sounds from clipping)
//   repeatN    schedule N copies at recipe.repeatGap intervals (magnet's
//              double-pulse is the only recipe currently using this)
//   repeatGap  separation between repeats in seconds
const TONE_RECIPES = {
  shield:  { base: 660, slope: 1.5,  type: 'triangle', duration: 0.18, gain: 0.32 },                 // rising two-tone (cyan / "ready")
  boost:   { base: 220, slope: 4.0,  type: 'sawtooth', duration: 0.30, gain: 0.28 },                 // rumble rising to a sharp accent (amber / "vroom")
  magnet:  { base: 440, slope: 0.0,  type: 'square',   duration: 0.10, gain: 0.30, repeatN: 2, repeatGap: 0.08 }, // double-pulse (magenta / "pull-pull")
  score2x: { base: 880, slope: 0.0,  type: 'sine',     duration: 0.32, gain: 0.30 },                 // bell-like ding (gem / "achievement")
  slowmo:  { base: 480, slope: 0.4,  type: 'triangle', duration: 0.42, gain: 0.26 },                 // descending slow-slide (indigo / "breathe")
  stamina: { base: 600, slope: 0.7,  type: 'triangle', duration: 0.32, gain: 0.28 },                 // warp-up-and-down — pairs with the "refresh" feel of the near-miss bullet-time re-trigger (lime / "rebound")
};

// Build + schedule one tone instance. Returns the duration scheduled so
// repeat-capable recipes can lay down the next copy without overshoot.
function scheduleTone(ctx, recipe, offsetSec = 0) {
  const t0 = ctx.currentTime + offsetSec;
  const dur = recipe.duration;
  const osc = ctx.createOscillator();
  osc.type = recipe.type || 'sine';
  osc.frequency.setValueAtTime(recipe.base, t0);
  if (typeof recipe.slope === 'number' && recipe.slope !== 1.0) {
    osc.frequency.linearRampToValueAtTime(recipe.base * recipe.slope, t0 + dur);
  }
  const gain = ctx.createGain();
  // Quick fade-in (10ms) avoids the click-pop of an un-ramped oscillator.
  // Exponential fade-out to silence so long tones (slowmo) don't truncate
  // harshly and the next pickup can be scheduled back-to-back cleanly.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(recipe.gain || 0.3, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);                  // 50ms tail so the exp ramp completes without a click
  return dur;
}

// Play a preloaded AudioBuffer through the shared context. Mirrors the
// scheduleTone envelope (10ms fade-in + linear fade-out at buffer end)
// so back-to-back pickups don't click-pop. Loop body uses an explicit
// `offset` rather than accumulating into a shared `cum` variable,
// because for repeatN=3 or more the offset for iteration [i] should be
// (sum of dur + gap of iterations [0..i-1]) not (last schedule start
// + repeatGap) — the latter bunches items close together.
function playLoadedBuffer(ctx, buf, repeats = 1, gap = 0, peakGain = 0.30) {
  if (!buf) return;
  let offset = 0;
  for (let i = 0; i < repeats; i++) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const dur = buf.duration;
    // Peak gain reads from recipe.gain so a future drop of a hot sample
    // can match the synth neighbours' calibration (recipe gain range
    // 0.26..0.32) — not hardcoded to 0.32 like the first pass did.
    const target = peakGain;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
    g.gain.linearRampToValueAtTime(target, ctx.currentTime + offset + 0.01);
    g.gain.setValueAtTime(target, ctx.currentTime + offset + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + offset + dur);
    src.connect(g).connect(ctx.destination);
    src.start(ctx.currentTime + offset);
    src.stop(ctx.currentTime + offset + dur + 0.05);
    offset += dur + (i < repeats - 1 ? gap : 0);
  }
}

// Resolve & play a per-type pickup tone. Order of preference:
//   1. ctx.state === 'running' (otherwise we're in autoplay-gated mode
//      and queued nodes would stack opaquely — silent skip is safer).
//   2. world.pickupSfxBuffers[type] → playLoadedBuffer (richer WAV).
//   3. TONE_RECIPES[type]            → scheduleTone (synthesised fallback).
function playTypeTone(ctx, type, world) {
  if (!ctx || ctx.state !== 'running') return;
  const buf = world && world.pickupSfxBuffers && world.pickupSfxBuffers[type];
  if (buf) {
    const recipe = TONE_RECIPES[type];
    playLoadedBuffer(ctx, buf,
      recipe ? (recipe.repeatN || 1) : 1,
      recipe ? (recipe.repeatGap || 0) : 0,
      recipe ? recipe.gain : 0.30);
    return;
  }
  const recipe = TONE_RECIPES[type];
  if (!recipe) return;
  const repeats = recipe.repeatN || 1;
  let offset = 0;
  for (let i = 0; i < repeats; i++) {
    scheduleTone(ctx, recipe, offset);
    offset += recipe.duration + (i < repeats - 1 ? (recipe.repeatGap || 0) : 0);
  }
}

// Powerup chip definitions — kept local to ui.js since they're a HUD
// concern, not a gameplay one. world.js pushes expiry timestamps onto
// state._powerups and the chip just reads them + label/duration keys.
// Pure-data; no DOM coupling — the chip DOM is appended dynamically in
// setupUI() so index.html doesn't have to know about it ahead of time.
const POWERUP_CHIPS = [
  { key: 'shield',  label: '🛡 Shield',   durationMs: TUNING.POWERUP_SHIELD_MS,  cssVar: '#66ffff' },
  { key: 'boost',   label: '🔥 Boost',    durationMs: TUNING.POWERUP_BOOST_MS,   cssVar: '#ffd54f' },
  { key: 'magnet',  label: '🧲 Magnet',   durationMs: TUNING.POWERUP_MAGNET_MS,  cssVar: '#ff8ad9' },
  { key: 'score2x', label: '✦ 2× Score',  durationMs: TUNING.POWERUP_SCORE2X_MS, cssVar: '#8eff9a' },
  { key: 'slowmo',  label: '⏱ Slow-mo',   durationMs: TUNING.POWERUP_SLOWMO_MS,  cssVar: '#a896ff' },
];

export function setupUI({ world, rendererObj }) {
  const scoreVal = document.getElementById('scoreVal');
  const speedVal = document.getElementById('speedVal');
  const levelVal = document.getElementById('levelVal');
  const startScreen = document.getElementById('startScreen');
  const explodeScreen = document.getElementById('explodeScreen');
  const explodeImg = document.getElementById('explodeImg');
  const gameOverScreen = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  // ---- active powerups HUD chip strip ----
  // position:fixed (NOT a flex sibling of #score) so a row of chips never
  // pushes the centered score pill off-row on narrow viewports. Stacks
  // directly under the score pill instead; z-index above the canvas but
  // below the overlays so the start/game-over screens still cover the
  // chip strip when active. Each chip is one row: label + remaining-
  // seconds counter. A chip is created on demand when its window opens
  // and removed when the window closes — the chip DOM is recycled
  // across repeated picks of the same type via the chipEls Map cache.
  const chipStrip = document.createElement('div');
  chipStrip.id = 'activePowerups';
  chipStrip.style.cssText =
    // top:72px gives 28px clearance from the #score pill (which sits at
    // top:16px with ~40px of content height = bottom at ~56px). 4px is
    // tight on devices where the pill grows taller (long localized
    // strings wrap to two lines), so 72px is the safe minimum.
    'position:fixed;top:72px;left:0;right:0;z-index:11;pointer-events:none;' +
    'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;' +
    'font-family:"Stick No Bills",sans-serif;';
  document.body.appendChild(chipStrip);
  const chipEls = new Map();

  // Inject a one-shot pulse @keyframes for the chip-on-pickup feedback.
  // Without this the chip just appears flat — adding a 1.0→1.2× bloom
  // over 240ms reads as "just collected". The class is added on
  // window 'powerupPickup' dispatched by world.js#applyPowerupEffect,
  // force-reflowed, then auto-removed on animationend so the same chip
  // can pulse again on the next collection without re-creating the
  // element.
  let pulseStyleInjected = false;
  function ensurePulseStyle() {
    if (pulseStyleInjected) return;
    pulseStyleInjected = true;
    const s = document.createElement('style');
    s.textContent = '@keyframes powerupPulse{0%{transform:scale(1);}40%{transform:scale(1.22);}100%{transform:scale(1);}}' +
      // Scoped to `.pulse` so the animation ONLY fires on the explicit
      // add('pulse') in the pickup-event listener — not on initial chip
      // creation (which would auto-pulse every chip the moment it mounts).
      '#activePowerups > div.pulse{animation:powerupPulse 240ms ease-out;}';
    document.head.appendChild(s);
  }
  window.addEventListener('powerupPickup', e => {
    const t = e && e.detail && e.detail.type;
    if (!t) return;
    // 1) visual: pulse the matching chip (existing path)
    const entry = chipEls.get(t);
    if (entry && entry.el) {
      ensurePulseStyle();
      entry.el.classList.remove('pulse');
      void entry.el.offsetWidth;            // force reflow so animation re-runs
      entry.el.classList.add('pulse');
    }
    // 2) audio: synthesize the per-type tone against the shared AudioContext.
    //    Silently no-ops if AudioContext is suspended/closed (e.g. browser
    //    blocked until user gesture) OR if the listener hasn't wired the
    //    world yet. Chip pulse still reads as feedback in those cases.
    try {
      // playTypeTone handles WORLD ownership + suspended-state gating
      // internally; just pass the world object and let it decide
      // between cached WAV and synthesised fallback.
      playTypeTone(world && world.audioContext, t, world);
    } catch (_) { /* Web Audio failed; chip pulse still works */ }
  });

  // ---- explosion sequence state ----
  // 3 sequential plays of EXPLODE_GIF_URL (GIF native loop = 1700ms = 17 frames
  // @ 100ms; CRASH_KEYFRAMES sets the inter-play gap at 1800ms = 1.7s + 100ms buffer).
  // Cadence table imported from shared.js so the GIF plays and the world.js
  // 3D-burst stagger stay locked on the same anchors.
  let prevOver = false;
  let explodePlays = 0;
  let explodeDone = false;
  let explodeTimer = null;

  function resetExplodeSequence() {
    if (explodeTimer) { clearTimeout(explodeTimer); explodeTimer = null; }
    explodePlays = 0;
    explodeDone = false;
    prevOver = false;        // force uiLoop to re-trigger on next crash
    clearOverlayPunch();
  }

  function playExplodeStep() {
    if (explodePlays >= CRASH_TOTAL_PLAYS) {
      clearOverlayPunch();                  // hide overlay + strip any leftover punch state
      explodeDone = true;
      if (gameOverScreen) gameOverScreen.classList.remove('hidden');
      explodeTimer = null;
      return;
    }
    // Re-set src with cache-bust query so the GIF restarts from frame 0 each play.
    // We re-use the canonical EXPLODE_GIF_URL export (same src as the index.html
    // <img id="explodeImg"> + the shared.js preload), so the first crash is
    // already warm in the browser's HTTP cache + decoded image tree.
    if (explodeImg) {
      explodeImg.src = EXPLODE_GIF_URL + '?n=' + Date.now() + '_' + explodePlays;
    }
    triggerOverlayPunch();                  // CSS shake + flash on #explodeScreen
    explodePlays++;
    // Single source of truth for both the GIF cadence AND the on-canvas 3D
    // burst stagger — see CRASH_KEYFRAMES in shared.js for the canonical table.
    explodeTimer = setTimeout(playExplodeStep, CRASH_KEYFRAMES[explodePlays - 1].intervalMs);
  }

  // Restart-friendly overlay punch: removes the class, forces a reflow so
  // the CSS animation engine drops the prior tick, then re-adds the class so
  // each @keyframes run starts at t=0. Fires 3× (once per GIF play) so the
  // impact registers even when the GIF is showing a frozen-frame card.
  function triggerOverlayPunch() {
    if (!explodeScreen) return;
    explodeScreen.classList.remove('crash-shake', 'crash-flash');
    void explodeScreen.offsetWidth;
    explodeScreen.classList.add('crash-shake', 'crash-flash');
  }

  // Strips the .crash-shake / .crash-flash classes AND adds .hidden. Without
  // this cleanup, when .hidden toggles display:none on/off, the leftover CSS
  // animation state can resume mid-frame on the next crash (showing the flash
  // at peak alpha rather than starting fresh). Called from resetExplodeSequence
  // (retry) and skipExplodeIfRunning (ESC fast-forward).
  function clearOverlayPunch() {
    if (!explodeScreen) return;
    explodeScreen.classList.remove('crash-shake', 'crash-flash');
    explodeScreen.classList.add('hidden');
  }

  function startExplodeSequence() {
    if (explodeTimer) { clearTimeout(explodeTimer); explodeTimer = null; }
    explodePlays = 0;
    explodeDone = false;
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    if (explodeScreen) explodeScreen.classList.remove('hidden');
    playExplodeStep();
  }

  // UI update loop
  function uiLoop() {
    if (world && world.state) {
      scoreVal.textContent = Math.floor(world.state.score);
      speedVal.textContent = (world.state.speed / world.state.baseSpeed).toFixed(1) + 'x';
      if (levelVal && Number.isInteger(world.state.level)) levelVal.textContent = world.state.level;
      bestScoreEl.textContent = world.state.best;

      // ---- powerup chip refresh ----
      // Walk the chip catalog; for each entry, check whether its
      // `untilMs` window on state._powerups is still in the future.
      //   - Active + no DOM yet → create the chip + append to strip.
      //   - Active + DOM present → update remaining-seconds text.
      //   - Expired + DOM present → remove chip + drop from cache.
      // Cheap O(5) per frame; matches the type-count cap.
      const nowMs = performance.now();
      const pu = world.state._powerups || {};
      if (chipStrip) {
        for (const def of POWERUP_CHIPS) {
          const untilKey = def.key + 'UntilMs';
          const until = pu[untilKey] || 0;
          const remaining = until - nowMs;
          if (remaining > 0) {
            let entry = chipEls.get(def.key);
            if (!entry) {
              entry = { el: null, span: null };
              chipEls.set(def.key, entry);
            }
            if (!entry.el) {
              const chip = document.createElement('div');
              chip.style.cssText = 'background:rgba(0,0,0,0.45);color:#fff;padding:4px 12px;' +
                'border-radius:999px;font-size:13px;font-weight:600;letter-spacing:1px;' +
                'border:1px solid ' + def.cssVar + ';box-shadow:0 0 10px ' + def.cssVar + '66;' +
                'backdrop-filter:blur(4px);font-family:"Stick No Bills",sans-serif;' +
                'white-space:nowrap;';
              const span = document.createElement('span');
              span.style.cssText = 'opacity:0.85;margin-left:6px;font-weight:400;';
              chip.appendChild(document.createTextNode(def.label));
              chip.appendChild(span);
              chipStrip.appendChild(chip);
              entry.el = chip;
              entry.span = span;
            }
            entry.span.textContent = (remaining / 1000).toFixed(1) + 's';
          } else if (chipEls.has(def.key)) {
            const old = chipEls.get(def.key);
            if (old.el && old.el.parentNode) old.el.parentNode.removeChild(old.el);
            chipEls.delete(def.key);
          }
        }
      }

      const isOver = !!world.state.over;

      // Detect the FALSE -> TRUE edge on state.over: kick off the X3 explosion.
      if (isOver && !prevOver) startExplodeSequence();

      if (isOver) {
        finalScoreEl.textContent = Math.floor(world.state.score);
        startScreen.classList.add('hidden');
        // Only reveal the splash + Try Again after the 3-play sequence.
        if (explodeDone) {
          gameOverScreen.classList.remove('hidden');
        } else {
          gameOverScreen.classList.add('hidden');
        }
      } else {
        if (!world.state.running) {
          startScreen.classList.remove('hidden');
        } else {
          startScreen.classList.add('hidden');
        }
        gameOverScreen.classList.add('hidden');
        // If the player retries mid-sequence, the next start() also calls
        // resetExplodeSequence() so this is a belt-and-suspenders cleanup.
        if (prevOver) resetExplodeSequence();
      }

      prevOver = isOver;
    }
    requestAnimationFrame(uiLoop);
  }
  requestAnimationFrame(uiLoop);

  function start() {
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    resetExplodeSequence();
    if (world && world.startLoop && rendererObj) {
      try {
        world.startLoop(rendererObj);
      } catch (e) {
        console.warn('UI start failed to call world.startLoop', e);
      }
    }
  }

  function retry() {
    start();
  }

  if (startBtn) startBtn.addEventListener('click', start);
  if (retryBtn) retryBtn.addEventListener('click', retry);

  // ---- ESC: fast-forward the 3-play explode sequence ----
  // While the explosion GIF is actively playing (sequence in progress), press
  // ESC to skip straight to the #gameOver splash. Idempotent: multiple presses
  // are harmless. Out-of-sequence ESC (during gameplay / on the start screen /
  // after the sequence has already finished) is a no-op AND doesn't call
  // preventDefault so the browser can still use ESC for things like exiting
  // fullscreen.
  function skipExplodeIfRunning() {
    if (!world?.state?.over || explodeDone || explodePlays <= 0) return false;
    if (explodeTimer) { clearTimeout(explodeTimer); explodeTimer = null; }
    // Also cancel any pending 3D-burst stagger in world.js so the on-canvas
    // particles stop firing in sync with the screen-wide GIF skipping.
    world?.cancelCrashStagger?.();
    clearOverlayPunch();                       // strip .hidden + any leftover punch state
    if (gameOverScreen) gameOverScreen.classList.remove('hidden');
    explodeDone = true;
    return true;
  }
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // preventDefault only when we actually skip, so ESC during gameplay
    // (or before/after the sequence) leaves browser-default ESC behavior
    // (e.g., exit fullscreen) intact.
    if (skipExplodeIfRunning()) e.preventDefault();
  });

  return { start, retry };
}
