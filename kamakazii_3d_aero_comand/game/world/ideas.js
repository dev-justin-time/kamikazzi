// /game/world/ideas.js
// Reads player-saved "briefings" ("kamikazziBriefings") from localStorage and
// returns a deterministic, *parsed* config object the world can apply.
//
// Token classifier expansion (was night|powerup|shield|speed boost only):
//   night/dusk/dawn → resolved into a single MODE via priority
//                       (night > dusk > dawn > day). Half-word overlap is
//                       handled by `combined.includes(p)` so "dusklight" still
//                       fires dusk AND the player's wider context wins.
//   mint/rose/neon → resolved into a TINT overlay (first match wins on
//                    collision; mint > rose > neon). Tints layer on top of
//                    the mode so dusk+rose ≠ night+rose visually.
//   storm          → CASCADE flag. Powerups spawn doubled; world.js#resetGame
//                    reads state._ideas_cascade to bump the count 3 → 6.
//   AI escalation  → when ideas exist BUT every keyword bucket missed,
//                    fire-and-forget `window.generateFromComment` (puter-client.js)
//                    with a JSON-schema prompt; persist the response to
//                    localStorage['kamikazziIdeaResult']. The next start reads
//                    it in tryApplyAiCfg() and overlays AI keys onto the
//                    locally-classified cfg so the AI call isn't wasted.
//
// single-pass architecture: readIdeasConfig and applyIdeasConfig share the
// same combined + tokens via getTokensAndCombined() so callers that need
// to also fire escalation don't pay for regex work twice.
//
// Throttle: escalating after a streak of unrecognized briefings can
// burn API budget on no-op rounds. Backing it with a 60s cooldown +
// hard 3-attempt cap (both persisted in localStorage) keeps retries
// from snowballing. Each successful AI round-trip recovers ONE slot
// (count = max(0, count-1)) — we throttle the *network layer*, not the
// LLM's imagination, so a malformed-but-shape-correct cfg still counts
// as a healthy round-trip. A 5-minute sliding window resets the cap to
// 0 before the gate runs, so an extended API outage self-heals instead
// of locking the user out.
import * as THREE from 'three';
import { TUNING } from './shared.js';

const KEY = 'kamikazziBriefings';
const AI_RESULT_KEY = 'kamikazziIdeaResult';
const ESCALATION_KEY = 'kamikazziEscalationMeta';
const ESCALATION_COOLDOWN_MS = 60_000;
const ESCALATION_MAX_ATTEMPTS = 3;
// After this idle window the count is treated as 0 — recovery from a
// multi-minute API outage. 5×COOLDOWN is the standard client self-heal
// window: long enough to deter spam, short enough that a player coming
// back from lunch doesn't find escalation bricked forever.
const ESCALATION_SLIDING_RESET_MS = 5 * ESCALATION_COOLDOWN_MS;

// Module-scope in-flight flag. Cleaner than the previous window global —
// the only thing the trigger cares about is "did I already fire one
// that's still pending", which is naturally a single boolean. Reset in
// the same `.finally()` regardless of success path so a transient
// network error doesn't permanently block re-attempts.
let escalating = false;

// Each bucket is matched via `combined.includes(p)` against the lowercased
// concatenation of ALL stored ideas. Order in TOKEN_BUCKETS doesn't affect
// priority — that's resolved by resolveMode() and resolveTint() below.
const TOKEN_BUCKETS = [
  { key: 'night',   patterns: ['night', 'noir', 'dark', 'shadow', 'eclipse'] },
  { key: 'dusk',    patterns: ['dusk', 'twilight', 'evening', 'sunset'] },
  { key: 'dawn',    patterns: ['dawn', 'sunrise', 'morning', 'daybreak'] },
  { key: 'storm',   patterns: ['storm', 'showers', 'rain', 'deluge', 'torrent', 'downpour', 'flood'] },
  { key: 'powerup', patterns: ['powerup', 'shield', 'speed boost', 'boost', 'extra'] },
  { key: 'mint',    patterns: ['mint', 'jade', 'seafoam', 'teal'] },
  { key: 'neon',    patterns: ['neon', 'cyberpunk', 'electric', 'fluorescent'] },
  { key: 'rose',    patterns: ['rose', 'coral', 'pink', 'blush', 'fuchsia'] },
];

// Tint collision policy: first match wins, so "rose-tinted neon" reads as rose.
const TINT_PRIORITY = ['mint', 'rose', 'neon'];

// ---------- Palette table ----------
// Single source of truth: 4 modes × TINT_KEYS rows. Replace the legacy
// if/else ladder in applyPalette() so each combination resolves to one
// entry — easy to diff visually, no branch ordering traps.
//
// TINT_KEYS is derived from TINT_PRIORITY so adding a new tint (e.g.
// 'amber') to TINT_PRIORITY + TOKEN_BUCKETS is enough — the override
// map for the new tint is the only place a per-tint colour row needs
// to be added. Nothing else needs touching.
const TINT_KEYS = [null, ...TINT_PRIORITY];
const _DAY_FOG = { near: TUNING.DAY_FOG_NEAR, far: TUNING.DAY_FOG_FAR };
const _NIGHT_FOG = { near: TUNING.NIGHT_FOG_NEAR, far: TUNING.NIGHT_FOG_FAR };
const _TINT_DAY_OVERRIDES = {
  null: {},
  mint: { groundTone: 0x66cc99, bgTint: 0xa6e7d8 },
  rose: { groundTone: 0xd77b8e, bgTint: 0xffb6c1 },
  neon: { groundTone: 0x6a4099, bgTint: 0xbc6cff },
};
const _TINT_NIGHT_OVERRIDES = {
  null: { bgTint: 0x556680 },                                  // night base
  mint: { bgTint: 0x88c0b0 },                                 // night sky keeps dark ground
  rose: { bgTint: 0xb56d7e },
  neon: { groundTone: 0x331955, bgTint: 0xbc6cff },
};
const PALETTE_TABLE = {};
function _registerMode(name, sky, groundTone, bgTint, fog) {
  for (const tint of TINT_KEYS) {
    const overridesMap = name === 'night' ? _TINT_NIGHT_OVERRIDES : _TINT_DAY_OVERRIDES;
    // Dev-ergonomics: a tint registered in TINT_PRIORITY but missing from
    // the per-mode override map silently degrades to no-override. Warn at
    // module load so a future "amber" addition is loud, not silent — the
    // tint still applies via the tier-2 lookup in applyPalette, but its
    // per-mode colour row is needed for visual distinctness.
    if (!(tint in overridesMap)) {
      console.warn(`[ideas] palette override missing: mode='${name}', tint=${tint}. ` +
        `Tints registered in TINT_PRIORITY must have a row in both ` +
        `_TINT_DAY_OVERRIDES and _TINT_NIGHT_OVERRIDES.`);
    }
    const overrides = overridesMap[tint] || {};
    PALETTE_TABLE[`${name}:${tint || 'null'}`] = {
      sky,
      fogNear: fog.near,
      fogFar: fog.far,
      groundTone: overrides.groundTone ?? groundTone,
      bgTint: overrides.bgTint ?? bgTint,
    };
  }
}
_registerMode('day',   TUNING.SKY_COLOR,         TUNING.GROUND_COLOR,         0xffffff, _DAY_FOG);
_registerMode('night', TUNING.NIGHT_SKY_COLOR,   TUNING.NIGHT_GROUND_COLOR,   0x556680, _NIGHT_FOG);
_registerMode('dusk',  0xff7b54,                  0xa76a3d,                    0xffb088, _DAY_FOG);
_registerMode('dawn',  0xfbafa1,                  0x9a8266,                    0xfdc8b4, _DAY_FOG);

// Single-pass workhorse: read & tokenize ONCE. Both readIdeasConfig() and
// applyIdeasConfig() feed off this so they share the computed values
// without re-running the substring searches.
function getTokensAndCombined() {
  let combined = '';
  try {
    const stored = localStorage.getItem(KEY);
    const list = stored ? JSON.parse(stored) : [];
    combined = list.map(i => (i.idea || '').toLowerCase()).join(' ');
  } catch (_) {
    combined = '';
  }
  const tokens = {};
  for (const bucket of TOKEN_BUCKETS) {
    tokens[bucket.key] = bucket.patterns.some(p => combined.includes(p));
  }
  return { combined, tokens };
}

function resolveMode(tokens) {
  if (tokens.night) return 'night';
  if (tokens.dusk)  return 'dusk';
  if (tokens.dawn)  return 'dawn';
  return 'day';
}

function resolveTint(tokens) {
  for (const candidate of TINT_PRIORITY) {
    if (tokens[candidate]) return candidate;
  }
  return null;
}

// Read the AI cfg persisted from a previous run's escalation. Returns null
// if absent OR the persisted JSON is malformed/stale. We keep it simple —
// any stored cfg is considered current; older UI could expire by timestamp.
function readPersistedAiCfg() {
  try {
    const stored = localStorage.getItem(AI_RESULT_KEY);
    if (!stored) return null;
    const data = JSON.parse(stored);
    return (data && data.cfg) || null;
  } catch (_) {
    return null;
  }
}

// Mutates a freshly-built cfg in-place by overlaying any persisted AI keys.
// Loop behavior:
//  - Local classifier is authoritative for tokens IT matched (e.g. "dark
//    night" still resolves to night even if the AI also said night, no-op).
//  - AI wins on keys the local classifier MISSED (e.g. AI says tint='rose'
//    for an unrecognized phrase; local has no tint so we layer it on).
// After overlay, `unrecognized` goes to false because AI has resolved it.
function tryApplyAiCfg(cfg) {
  const ai = readPersistedAiCfg();
  if (!ai) return;
  // Mode resolution — AI is more authoritative for the wide phrase, but
  // match local priority first (night > dusk > dawn) so a "night + neon"
  // briefing doesn't accidentally collapse to dusk because the AI happened
  // to mention twilight in its summary.
  if (typeof ai.night === 'boolean' && ai.night) cfg.mode = 'night';
  else if (typeof ai.dusk === 'boolean' && ai.dusk) cfg.mode = 'dusk';
  else if (typeof ai.dawn === 'boolean' && ai.dawn) cfg.mode = 'dawn';
  if (ai.tint === 'mint' || ai.tint === 'rose' || ai.tint === 'neon') cfg.tint = ai.tint;
  if (typeof ai.enablePowerups === 'boolean') cfg.enablePowerups = ai.enablePowerups;
  if (typeof ai.cascade === 'boolean') cfg.cascade = ai.cascade;
  cfg.night = cfg.mode === 'night';
  cfg.unrecognized = false;  // AI filled in what the local classifier couldn't
}

// Build cfg from already-computed inputs. Caller supplies combined+tokens
// via getTokensAndCombined(); no work is duplicated.
function buildCfgFromTokens({ tokens, combined }) {
  const mode = resolveMode(tokens);
  const tint = resolveTint(tokens);
  const powerups = !!tokens.powerup || !!tokens.storm;  // storm also enables
  const cascade = !!tokens.storm;
  const unrecognized = !!combined.trim() && Object.values(tokens).every(v => !v);
  const cfg = {
    mode, tint, powerups, cascade,
    night: mode === 'night',
    enablePowerups: powerups,
    unrecognized,
  };
  // Overlay persisted AI result (per tryApplyAiCfg comment).
  tryApplyAiCfg(cfg);
  return cfg;
}

// ---------- Escalation throttle ----------
// Persisted counters back the cooldown + cap so retaiload-during-quick-retry
// can't re-fire the prompt on every resetGame. Both checks gate; if either
// trips, no prompt is sent on this attempt.
function readEscalationMeta() {
  try {
    const raw = localStorage.getItem(ESCALATION_KEY);
    if (!raw) return { lastTs: 0, count: 0 };
    const parsed = JSON.parse(raw);
    return {
      lastTs: Number(parsed.lastTs) || 0,
      count: Number(parsed.count) || 0,
    };
  } catch (_) {
    return { lastTs: 0, count: 0 };
  }
}
function writeEscalationMeta(meta) {
  try { localStorage.setItem(ESCALATION_KEY, JSON.stringify(meta)); } catch (_) {}
}

// Fire-and-forget AI escalation. Returns nothing — the JSON answer
// (puter-client.js#window.generateFromComment) lands asynchronously and is
// persisted to localStorage under AI_RESULT_KEY. The next start picks it up
// via tryApplyAiCfg().
function maybeEscalateToAi(combined, tokens, alreadyHaveAiCfg) {
  if (alreadyHaveAiCfg) return;  // don't re-prompt if we already have one
  if (!combined || !combined.trim()) return;
  const anyHit = Object.values(tokens).some(Boolean);
  if (anyHit) return;                              // local classifier handled it
  if (escalating) return;                          // module-scope in-flight dedupe
  if (typeof window.generateFromComment !== 'function') return;

  // Throttle gates — localStorage-backed so they survive page reload.
  // Sliding window: if last attempt was > 5 min ago, treat the count as
  // 0 so a multi-minute API outage doesn't permanently brick escalation.
  const meta = readEscalationMeta();
  const effectiveCount = (Date.now() - meta.lastTs) > ESCALATION_SLIDING_RESET_MS
    ? 0
    : meta.count;
  if (effectiveCount >= ESCALATION_MAX_ATTEMPTS) return;
  if (effectiveCount > 0 && (Date.now() - meta.lastTs) < ESCALATION_COOLDOWN_MS) return;

  escalating = true;
  writeEscalationMeta({ lastTs: Date.now(), count: effectiveCount + 1 });
  try {
    window.generateFromComment(
      'Map this kamikazzi player briefing to a JSON config with EXACTLY these keys: ' +
      '"night" (bool), "dusk" (bool), "dawn" (bool), "enablePowerups" (bool), ' +
      '"cascade" (bool), "tint" ("mint"|"rose"|"neon"|null). ' +
      'Reply with ONLY the JSON object, no prose.\n\n' +
      'Briefing: "' + combined + '"'
    ).then(json => {
      if (!json) return;
      let aiCfg;
      try { aiCfg = JSON.parse(json); } catch (_) { return; }
      try {
        localStorage.setItem(AI_RESULT_KEY, JSON.stringify({
          ts: Date.now(), raw: combined, cfg: aiCfg,
        }));
        // Successful round-trip ⇒ recover ONE slot, not the whole quota.
        // Throttling the *network/API* layer, not the LLM's imagination —
        // a parsed JSON object means the API is healthy regardless of
        // whether the keys help the gameplay.
        const cur = readEscalationMeta();
        writeEscalationMeta({ lastTs: Date.now(), count: Math.max(0, cur.count - 1) });
      } catch (_) { /* localStorage might be disabled */ }
    }).catch(e => {
      console.warn('AI escalation HTTP/JSON failed', e);
    }).finally(() => {
      escalating = false;
    });
  } catch (_) {
    // fire-and-forget; do not propagate
    escalating = false;
  }
}

/**
 * @returns {{
 *   mode: 'day'|'night'|'dusk'|'dawn',
 *   tint: 'mint'|'rose'|'neon'|null,
 *   powerups: boolean,
 *   cascade: boolean,
 *   night: boolean,        // legacy alias preserved for world.js consumers
 *   enablePowerups: boolean, // legacy alias preserved
 *   unrecognized: boolean,  // true when ideas exist but no local keyword fired
 * }}
 */
export function readIdeasConfig() {
  return buildCfgFromTokens(getTokensAndCombined());
}

/** Pushed onto `state` so the world loop / resetGame can read it. Trigger
 * AI escalation at fire-forget cadence if NO token matched AND no AI cfg is
 * yet persisted. The current run never waits on the AI call. */
export function applyIdeasConfig({ state }) {
  // Single pass: compute combined + tokens ONCE, build cfg from them, then
  // fire AI escalation if needed. Avoids re-running substring searches.
  const inputs = getTokensAndCombined();
  const cfg = buildCfgFromTokens(inputs);
  state._ideas_enablePowerups = cfg.enablePowerups;
  state._ideas_mode = cfg.mode;
  state._ideas_tint = cfg.tint;
  state._ideas_cascade = cfg.cascade;
  state._ideas_recognized = !cfg.unrecognized;
  // Fire AI escalation only when local didn't catch it AND we don't already
  // have a persisted AI cfg from before (avoids re-prompting).
  if (cfg.unrecognized && !readPersistedAiCfg()) {
    maybeEscalateToAi(inputs.combined, inputs.tokens, false);
  }
  return cfg;
}

/**
 * Single source of truth for fog / ground palette by mode+tint.
 * Looked up from PALETTE_TABLE in O(1) — replaces a 5-branch if/else ladder
 * that was order-sensitive and easy to break with new tokens.
 *
 * @param args
 * @param {THREE.Scene}     args.scene         — main scene (fog only)
 * @param {THREE.Mesh}      args.ground        — ground quad with material.color
 * @param {'day'|'night'|'dusk'|'dawn'} [args.mode]
 * @param {'mint'|'rose'|'neon'|null}        [args.tint]
 * @param {boolean}         [args.night]       — LEGACY: mode === 'night' if true
 * @param {boolean}         [args.dusk]        — LEGACY
 * @param {boolean}         [args.dawn]        — LEGACY
 * @param {THREE.Material}  args.bgMaterial    — bgMesh material tinted by mode+tint
 *
 * Mode + tint are orthogonal: dusk+rose uses dusk fog/ground + rose bg tint.
 * Backward compat: if mode not provided, translate {night, dusk, dawn} flags.
 */
export function applyPalette({ scene, ground, mode, tint, night, dusk, dawn, bgMaterial }) {
  // Backward-compat: if mode omitted, derive from (night, dusk, dawn) flags.
  if (!mode) {
    if (night) mode = 'night';
    else if (dusk) mode = 'dusk';
    else if (dawn) mode = 'dawn';
    else mode = 'day';
  }
  // Lookup chain: try the requested slot, then drop the tint (unknown
  // future token → no-tint), then drop the mode (unknown future mode
  // → grace day fallback). Matches the legacy ladder's "no `if` matched
  // → all defaults apply" behavior so a bug in the mode resolver can't
  // crash the renderer.
  const entry = PALETTE_TABLE[`${mode}:${tint || 'null'}`]
              || PALETTE_TABLE[`${mode}:null`]
              || PALETTE_TABLE['day:null'];
  scene.fog = new THREE.Fog(entry.sky, entry.fogNear, entry.fogFar);
  if (ground && ground.material) ground.material.color.set(entry.groundTone);
  if (bgMaterial) bgMaterial.color.setHex(entry.bgTint);
}
