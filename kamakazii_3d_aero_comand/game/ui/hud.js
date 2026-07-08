/* game/ui/hud.js
   Responsibility: tone synthesis (Web Audio), powerup chip definitions,
   active-powerup HUD chip strip, and HUD DOM bootstrapping.
   Extracted from the original monolithic game/ui.js.
*/
import { TUNING } from '../world/shared.js';
import { speak } from '../puter-client.js';

// Per-type pickup tone recipes (Web Audio API synthesis). Each entry
// drives an OscillatorNode + GainNode envelope attached to the shared
// AudioContext (see world.js#audioListener.context). Purely procedural;
// no .wav file dependency.
//
// Recipe fields:
//   base       start frequency in Hz
//   slope      per-recipe multiplier at recipe.duration
//   type       OscillatorNode type ('sine'|'triangle'|'sawtooth'|'square')
//   duration   total length in seconds
//   gain       peak gain (≤ 0.4 to keep layered sounds from clipping)
//   repeatN    schedule N copies at recipe.repeatGap intervals
//   repeatGap  separation between repeats in seconds
export const TONE_RECIPES = {
  shield:  { base: 660, slope: 1.5,  type: 'triangle', duration: 0.18, gain: 0.32 },
  boost:   { base: 220, slope: 4.0,  type: 'sawtooth', duration: 0.30, gain: 0.28 },
  magnet:  { base: 440, slope: 0.0,  type: 'square',   duration: 0.10, gain: 0.30, repeatN: 2, repeatGap: 0.08 },
  score2x: { base: 880, slope: 0.0,  type: 'sine',     duration: 0.32, gain: 0.30 },
  slowmo:  { base: 480, slope: 0.4,  type: 'triangle', duration: 0.42, gain: 0.26 },
  stamina: { base: 600, slope: 0.7,  type: 'triangle', duration: 0.32, gain: 0.28 },
};

// Build + schedule one tone instance.
export function scheduleTone(ctx, recipe, offsetSec = 0) {
  const t0 = ctx.currentTime + offsetSec;
  const dur = recipe.duration;
  const osc = ctx.createOscillator();
  osc.type = recipe.type || 'sine';
  osc.frequency.setValueAtTime(recipe.base, t0);
  if (typeof recipe.slope === 'number' && recipe.slope !== 1.0) {
    osc.frequency.linearRampToValueAtTime(recipe.base * recipe.slope, t0 + dur);
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(recipe.gain || 0.3, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  return dur;
}

// Play a preloaded AudioBuffer through the shared context.
export function playLoadedBuffer(ctx, buf, repeats = 1, gap = 0, peakGain = 0.30) {
  if (!buf) return;
  let offset = 0;
  for (let i = 0; i < repeats; i++) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const dur = buf.duration;
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

// Resolve & play a per-type pickup tone.
export function playTypeTone(ctx, type, world) {
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

// Powerup chip definitions — a HUD concern, not a gameplay one.
export const POWERUP_CHIPS = [
  { key: 'shield',  labelKey: 'powerup.shield',  durationMs: TUNING.POWERUP_SHIELD_MS,  cssVar: '#66ffff' },
  { key: 'boost',   labelKey: 'powerup.boost',    durationMs: TUNING.POWERUP_BOOST_MS,   cssVar: '#ffd54f' },
  { key: 'magnet',  labelKey: 'powerup.magnet',   durationMs: TUNING.POWERUP_MAGNET_MS,  cssVar: '#ff8ad9' },
  { key: 'score2x', labelKey: 'powerup.score2x',  durationMs: TUNING.POWERUP_SCORE2X_MS, cssVar: '#8eff9a' },
  { key: 'slowmo',  labelKey: 'powerup.slowmo',   durationMs: TUNING.POWERUP_SLOWMO_MS,  cssVar: '#a896ff' },
];

/**
 * wireHUD — creates the active-powerup chip strip and wires the
 * powerupPickup event (visual pulse + TTS + audio tone).
 * Returns a controller with { chipStrip, chipEls, ensurePulseStyle }.
 */
export function wireHUD({ world }) {
  // ---- active powerups HUD chip strip ----
  const chipStrip = document.createElement('div');
  chipStrip.id = 'activePowerups';
  chipStrip.setAttribute('role', 'status');
  chipStrip.setAttribute('aria-live', 'polite');
  chipStrip.setAttribute('aria-atomic', 'true');
  // Styles handled by game/ui/styles/hud.css via #activePowerups
  document.body.appendChild(chipStrip);
  const chipEls = new Map();

  // Inject pulse @keyframes
  let pulseStyleInjected = false;
  function ensurePulseStyle() {
    if (pulseStyleInjected) return;
    pulseStyleInjected = true;
    const s = document.createElement('style');
    s.setAttribute('aria-hidden', 'true');
    // Pulse keyframes live in game/ui/styles/hud.css — just set the style element as a fallback guard
    s.textContent = '#activePowerups > div.pulse{animation:powerupPulse 240ms ease-out;}';
    document.head.appendChild(s);
  }

  window.addEventListener('powerupPickup', e => {
    const t = e && e.detail && e.detail.type;
    if (!t) return;
    // Visual pulse
    const entry = chipEls.get(t);
    if (entry && entry.el) {
      ensurePulseStyle();
      entry.el.classList.remove('pulse');
      void entry.el.offsetWidth;
      entry.el.classList.add('pulse');
    }
    // TTS
    const TTS_PHRASES = {
      shield:  'Shield acquired.',
      boost:   'Boost activated.',
      magnet:  'Magnet pulling.',
      score2x: 'Double score.',
      slowmo:  'Slow motion.',
      stamina: 'Stamina refreshed.',
    };
    if (TTS_PHRASES[t]) speak(TTS_PHRASES[t], 'powerup.' + t);
    // Audio tone
    try {
      playTypeTone(world && world.audioContext, t, world);
    } catch (_) {}
  });

  return { chipStrip, chipEls, ensurePulseStyle };
}
