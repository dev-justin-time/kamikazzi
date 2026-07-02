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
import {
  isPuterAvailable, getUsername, getAvatarUrl, getLeaderboard,
  setCloudSyncEnabled, generateImage, getReplays, deleteReplay,
  getRunHistory, syncSettings, getSettings,
} from '../puter-client.js';

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
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  // Mission Terminated telemetry fields
  const mtScore = document.getElementById('mtScore');
  const mtBest = document.getElementById('mtBest');
  const mtSector = document.getElementById('mtSector');
  const mtDistance = document.getElementById('mtDistance');
  const mtAlt = document.getElementById('mtAlt');
  const mtThrottle = document.getElementById('mtThrottle');
  const mtReason = document.getElementById('mtReason');
  const mtElapsed = document.getElementById('mtElapsed');
  const abortBtn = document.getElementById('abortBtn');

  // Mission Success telemetry fields
  const missionSuccessScreen = document.getElementById('missionSuccess');
  const msScore = document.getElementById('msScore');
  const msBest = document.getElementById('msBest');
  const msSector = document.getElementById('msSector');
  const msDistance = document.getElementById('msDistance');
  const msAlt = document.getElementById('msAlt');
  const msThrottle = document.getElementById('msThrottle');
  const msStatus = document.getElementById('msStatus');
  const msElapsed = document.getElementById('msElapsed');
  const msGrade = document.getElementById('msGrade');
  const successRetryBtn = document.getElementById('successRetryBtn');
  const successQuitBtn = document.getElementById('successQuitBtn');

  // ---- Boot sequence (New folder integration) ----
  const bootScreen = document.getElementById('bootScreen');
  const bootStatus = document.getElementById('bootStatus');
  const bootBar = document.getElementById('bootBar');
  const bootPct = document.getElementById('bootPct');
  const BOOT_SEGMENTS = 16;
  const bootSteps = [
    'Initializing kernel...',
    'Loading nav mesh...',
    'Encrypting telemetry...',
    'Synchronizing grid...',
    'Establishing uplink...',
    'Verifying pilot ID...',
    'Systems ready.',
  ];
  if (bootBar) {
    for (let i = 0; i < BOOT_SEGMENTS; i++) {
      const seg = document.createElement('div');
      seg.className = 'boot-seg';
      bootBar.appendChild(seg);
    }
  }
  function runBootSequence() {
    if (!bootScreen) return;
    let progress = 0;
    function tick() {
      progress += Math.floor(Math.random() * 3) + 1;
      if (progress > 100) progress = 100;
      const active = Math.floor((progress / 100) * BOOT_SEGMENTS);
      const segs = bootBar ? bootBar.querySelectorAll('.boot-seg') : [];
      segs.forEach((s, i) => s.classList.toggle('on', i < active));
      if (bootPct) bootPct.textContent = progress.toString().padStart(3, '0') + '%';
      const stepIdx = Math.min(Math.floor((progress / 100) * bootSteps.length), bootSteps.length - 1);
      if (bootStatus) bootStatus.textContent = bootSteps[stepIdx];
      if (progress < 100) {
        setTimeout(tick, Math.random() * 120 + 40);
      } else {
        setTimeout(() => {
          if (bootScreen) {
            bootScreen.style.opacity = '0';
            setTimeout(() => bootScreen.classList.add('hidden'), 600);
          }
        }, 400);
      }
    }
    tick();
  }
  runBootSequence();

  // ---- Pause menu (New folder integration) ----
  const pauseScreen = document.getElementById('pauseScreen');
  const resumeBtn = document.getElementById('resumeBtn');
  const pauseRetryBtn = document.getElementById('pauseRetryBtn');
  const quitBtn = document.getElementById('quitBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const toggleOverlays = document.getElementById('toggleOverlays');
  const scanlineOverlay = document.querySelector('.scanline-overlay');
  const gridOverlay = document.querySelector('.grid-overlay');

  // ---- Puter cloud integration UI ----
  const userBadge = document.getElementById('userBadge');
  const leaderboardBtn = document.getElementById('leaderboardBtn');
  const leaderboardPanel = document.getElementById('leaderboardPanel');
  const leaderboardClose = document.getElementById('leaderboardClose');
  const leaderboardBody = document.getElementById('leaderboardBody');
  const toggleCloudSync = document.getElementById('toggleCloudSync');
  const puterAvailable = isPuterAvailable();

  // ---- Skin Lab UI ----
  const skinLabBtn = document.getElementById('skinLabBtn');
  const skinLabPanel = document.getElementById('skinLabPanel');
  const skinLabClose = document.getElementById('skinLabClose');

  // ---- Run History UI ----
  const runHistoryBtn = document.getElementById('runHistoryBtn');
  const runHistoryPanel = document.getElementById('runHistoryPanel');
  const runHistoryClose = document.getElementById('runHistoryClose');
  const runHistoryBody = document.getElementById('runHistoryBody');

  // ---- Briefings UI ----
  const briefingsBtn = document.getElementById('briefingsBtn');
  const briefingsPanel = document.getElementById('briefingsPanel');
  const briefingsClose = document.getElementById('briefingsClose');
  const briefingsBody = document.getElementById('briefingsBody');
  const briefingInput = document.getElementById('briefingInput');
  const briefingSend = document.getElementById('briefingSend');
  const briefingFetch = document.getElementById('briefingFetch');
  const skinPrompt = document.getElementById('skinPrompt');
  const generateSkinBtn = document.getElementById('generateSkinBtn');
  const skinPreview = document.getElementById('skinPreview');
  const skinStatus = document.getElementById('skinStatus');
  const portraitPrompt = document.getElementById('portraitPrompt');
  const generatePortraitBtn = document.getElementById('generatePortraitBtn');
  const portraitPreview = document.getElementById('portraitPreview');
  const portraitStatus = document.getElementById('portraitStatus');

  // ---- Replay Gallery UI ----
  const replayGalleryBtn = document.getElementById('replayGalleryBtn');
  const replayPanel = document.getElementById('replayPanel');
  const replayClose = document.getElementById('replayClose');
  const replayBody = document.getElementById('replayBody');
  const replayDetailPanel = document.getElementById('replayDetailPanel');
  const replayDetailBack = document.getElementById('replayDetailBack');
  const replayDetailDelete = document.getElementById('replayDetailDelete');
  const replayDetailTitle = document.getElementById('replayDetailTitle');
  const replayDetailImage = document.getElementById('replayDetailImage');
  const replayDetailMeta = document.getElementById('replayDetailMeta');
  let currentReplays = [];
  let selectedReplayId = null;

  // Overlay toggle persistence
  const OVERLAYS_KEY = 'kamikazzi_overlays_enabled';
  function loadOverlaySetting() {
    try {
      const saved = localStorage.getItem(OVERLAYS_KEY);
      return saved === null ? true : saved === 'true';
    } catch (_) { return true; }
  }
  function saveOverlaySetting(enabled) {
    try { localStorage.setItem(OVERLAYS_KEY, String(enabled)); } catch (_) {}
  }
  function setOverlaysVisible(visible) {
    if (scanlineOverlay) scanlineOverlay.style.display = visible ? '' : 'none';
    if (gridOverlay) gridOverlay.style.display = visible ? '' : 'none';
  }
  const overlaysEnabled = loadOverlaySetting();
  setOverlaysVisible(overlaysEnabled);
  if (toggleOverlays) toggleOverlays.checked = overlaysEnabled;

  // Cloud sync toggle persistence
  const CLOUD_SYNC_KEY = 'kamikazzi_cloud_sync_enabled';
  let cloudSyncEnabled = (() => {
    try {
      const saved = localStorage.getItem(CLOUD_SYNC_KEY);
      return saved === null ? puterAvailable : saved === 'true';
    } catch (_) { return puterAvailable; }
  })();
  if (toggleCloudSync) toggleCloudSync.checked = cloudSyncEnabled;
  if (toggleCloudSync) {
    toggleCloudSync.addEventListener('change', () => {
      cloudSyncEnabled = toggleCloudSync.checked;
      setCloudSyncEnabled(cloudSyncEnabled);
      try { localStorage.setItem(CLOUD_SYNC_KEY, String(cloudSyncEnabled)); } catch (_) {}
    });
  }

  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
      settingsBtn.textContent = settingsPanel.classList.contains('hidden') ? 'Settings' : 'Close Settings';
    });
  }
  if (toggleOverlays) {
    toggleOverlays.addEventListener('change', () => {
      const enabled = toggleOverlays.checked;
      setOverlaysVisible(enabled);
      saveOverlaySetting(enabled);
    });
  }

  // ---- User badge ----
  async function refreshUserBadge() {
    if (!userBadge) return;
    const username = await getUsername();
    if (username) {
      const avatar = await getAvatarUrl();
      userBadge.innerHTML = (avatar
        ? `<img src="${avatar}" alt="" style="width:22px;height:22px;border-radius:50%;margin-right:6px;object-fit:cover;" />`
        : `<span style="font-size:16px;margin-right:4px;">👤</span>`
      ) + `<span style="font-weight:700;">${escapeHtml(username)}</span>`;
      userBadge.classList.remove('hidden');
    } else {
      userBadge.classList.add('hidden');
    }
  }
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  refreshUserBadge();
  window.addEventListener('puterUserReady', () => refreshUserBadge());

  // ---- Leaderboard ----
  async function renderLeaderboard() {
    if (!leaderboardBody) return;
    leaderboardBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Loading...</div>';
    try {
      const board = await getLeaderboard(10);
      if (!board || !board.length) {
        leaderboardBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">No scores yet. Be the first!</div>';
        return;
      }
      let html = '';
      board.forEach((entry, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<span style="display:inline-block;width:22px;text-align:center;">${idx + 1}</span>`;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(152,203,255,0.1);font-size:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:14px;">${medal}</span>
            <span style="font-weight:600;color:#98cbff;">${escapeHtml(entry.username || 'Pilot')}</span>
          </div>
          <span style="font-weight:800;color:#00dddd;">${Number(entry.score).toLocaleString()}</span>
        </div>`;
      });
      leaderboardBody.innerHTML = html;
    } catch (_) {
      leaderboardBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Unable to load leaderboard.</div>';
    }
  }
  if (leaderboardBtn && leaderboardPanel) {
    leaderboardBtn.addEventListener('click', () => {
      leaderboardPanel.classList.remove('hidden');
      renderLeaderboard();
    });
  }
  if (leaderboardClose && leaderboardPanel) {
    leaderboardClose.addEventListener('click', () => leaderboardPanel.classList.add('hidden'));
  }

  // ---- Skin Lab wiring ----
  function openSkinLab() { if (skinLabPanel) skinLabPanel.classList.remove('hidden'); }
  function closeSkinLab() { if (skinLabPanel) skinLabPanel.classList.add('hidden'); }
  if (skinLabBtn) skinLabBtn.addEventListener('click', openSkinLab);
  if (skinLabClose) skinLabClose.addEventListener('click', closeSkinLab);

  // ---- Run History wiring ----
  async function openRunHistory() {
    if (runHistoryPanel) runHistoryPanel.classList.remove('hidden');
    if (!runHistoryBody) return;
    runHistoryBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Loading history...</div>';
    try {
      const history = await getRunHistory();
      if (!history || !history.length) {
        runHistoryBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">No runs yet. Fly a mission and your history will appear here.</div>';
        return;
      }
      let html = '';
      history.forEach((run, idx) => {
        const date = new Date(run.timestamp || Date.now()).toLocaleString();
        const wonBadge = run.won ? '<span style="color:#00dddd;font-weight:700;">✅ SUCCESS</span>' : '<span style="color:#ffb4ab;font-weight:700;">💥 CRASH</span>';
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 8px;border-bottom:1px solid rgba(152,203,255,0.1);font-size:12px;">
          <div style="text-align:left;">
            <div style="font-weight:700;color:#98cbff;">${Number(run.score).toLocaleString()} pts · Level ${run.level || 1}</div>
            <div style="font-size:10px;color:rgba(152,203,255,0.55);margin-top:2px;">${date}</div>
          </div>
          <div style="font-size:10px;">${wonBadge}</div>
        </div>`;
      });
      runHistoryBody.innerHTML = html;
    } catch (_) {
      runHistoryBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Unable to load run history.</div>';
    }
  }
  function closeRunHistory() { if (runHistoryPanel) runHistoryPanel.classList.add('hidden'); }
  if (runHistoryBtn) runHistoryBtn.addEventListener('click', openRunHistory);
  if (runHistoryClose) runHistoryClose.addEventListener('click', closeRunHistory);

  // ---- Briefings wiring ----
  function loadBriefings() {
    if (!briefingsBody) return;
    try {
      const stored = localStorage.getItem('kamikazziBriefings');
      const list = stored ? JSON.parse(stored) : [];
      if (!list.length) {
        briefingsBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">No briefings yet. Submit ideas and they appear here.</div>';
        return;
      }
      let html = '';
      list.slice().reverse().forEach(b => {
        const from = escapeHtml(b.from || 'Pilot');
        const idea = escapeHtml(b.idea || b.text || '');
        const date = b.ts ? new Date(b.ts).toLocaleString() : '';
        html += `<div style="padding:10px 12px;border:1px solid rgba(152,203,255,0.12);border-radius:3px;text-align:left;">
          <div style="font-size:10px;font-weight:700;color:#00dddd;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${from}</div>
          <div style="font-size:12px;color:#98cbff;line-height:1.45;">${idea}</div>
          <div style="font-size:10px;color:rgba(152,203,255,0.45);margin-top:4px;">${date}</div>
        </div>`;
      });
      briefingsBody.innerHTML = html;
    } catch (_) {
      briefingsBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Error loading briefings.</div>';
    }
  }
  async function sendBriefing() {
    if (!briefingInput || !world) return;
    const text = briefingInput.value.trim();
    if (!text) return;
    world.addIdea(text, 'Pilot');
    briefingInput.value = '';
    loadBriefings();
    // Also sync to Puter if available
    try {
      await world.sendIdeasToPuter();
    } catch (_) {}
  }
  async function fetchBriefings() {
    if (!world) return;
    try {
      await world.fetchCommentsFromPuter();
      loadBriefings();
    } catch (_) {}
  }
  function openBriefings() { if (briefingsPanel) { briefingsPanel.classList.remove('hidden'); loadBriefings(); } }
  function closeBriefings() { if (briefingsPanel) briefingsPanel.classList.add('hidden'); }
  if (briefingsBtn) briefingsBtn.addEventListener('click', openBriefings);
  if (briefingsClose) briefingsClose.addEventListener('click', closeBriefings);
  if (briefingSend) briefingSend.addEventListener('click', sendBriefing);
  if (briefingFetch) briefingFetch.addEventListener('click', fetchBriefings);
  if (briefingInput) {
    briefingInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBriefing(); });
  }
  window.addEventListener('ideasUpdated', () => {
    if (briefingsPanel && !briefingsPanel.classList.contains('hidden')) loadBriefings();
  });

  // ---- Settings cloud sync wiring ----
  async function saveSettingsToCloud() {
    try {
      const settings = {
        overlaysEnabled: loadOverlaySetting(),
        cloudSyncEnabled: cloudSyncEnabled,
        lastSaved: Date.now(),
      };
      await syncSettings(settings);
    } catch (_) {}
  }
  async function loadSettingsFromCloud() {
    try {
      const cloudSettings = await getSettings();
      if (cloudSettings && typeof cloudSettings === 'object') {
        if (typeof cloudSettings.overlaysEnabled === 'boolean') {
          setOverlaysVisible(cloudSettings.overlaysEnabled);
          saveOverlaySetting(cloudSettings.overlaysEnabled);
          if (toggleOverlays) toggleOverlays.checked = cloudSettings.overlaysEnabled;
        }
        if (typeof cloudSettings.cloudSyncEnabled === 'boolean') {
          cloudSyncEnabled = cloudSettings.cloudSyncEnabled;
          setCloudSyncEnabled(cloudSyncEnabled);
          if (toggleCloudSync) toggleCloudSync.checked = cloudSyncEnabled;
        }
      }
    } catch (_) {}
  }
  // Load cloud settings on boot
  loadSettingsFromCloud();
  // Save settings to cloud when toggles change
  if (toggleOverlays) {
    toggleOverlays.addEventListener('change', () => { saveSettingsToCloud(); });
  }
  if (toggleCloudSync) {
    toggleCloudSync.addEventListener('change', () => { saveSettingsToCloud(); });
  }

  // ---- Replay Gallery wiring ----
  function openReplayGallery() {
    if (replayPanel) replayPanel.classList.remove('hidden');
    renderReplays();
  }
  function closeReplayGallery() {
    if (replayPanel) replayPanel.classList.add('hidden');
    if (replayDetailPanel) replayDetailPanel.classList.add('hidden');
    selectedReplayId = null;
  }
  function openReplayDetail(replay) {
    selectedReplayId = replay.id;
    if (replayDetailPanel) replayDetailPanel.classList.remove('hidden');
    if (replayPanel) replayPanel.classList.add('hidden');
    if (replayDetailTitle) replayDetailTitle.textContent = replay.won ? '✅ Mission Success' : '💥 Mission Terminated';
    if (replayDetailImage) {
      if (replay._screenshotDataUrl) {
        replayDetailImage.style.backgroundImage = `url(${replay._screenshotDataUrl})`;
      } else {
        replayDetailImage.style.backgroundImage = 'none';
        replayDetailImage.textContent = 'No screenshot';
        replayDetailImage.style.display = 'flex';
        replayDetailImage.style.alignItems = 'center';
        replayDetailImage.style.justifyContent = 'center';
        replayDetailImage.style.color = 'rgba(152,203,255,0.4)';
      }
    }
    if (replayDetailMeta) {
      const date = new Date(replay.timestamp).toLocaleString();
      replayDetailMeta.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;">
          <div><span style="color:rgba(152,203,255,0.55)">SCORE</span> <strong style="color:#00dddd">${Number(replay.score).toLocaleString()}</strong></div>
          <div><span style="color:rgba(152,203,255,0.55)">GRADE</span> <strong style="color:#ffe08a">${replay.grade || '?'}</strong></div>
          <div><span style="color:rgba(152,203,255,0.55)">LEVEL</span> ${replay.level || 1}</div>
          <div><span style="color:rgba(152,203,255,0.55)">DIST</span> ${((replay.distance || 0) / 1000).toFixed(2)} km</div>
          <div><span style="color:rgba(152,203,255,0.55)">ALT</span> ${(replay.altitude || 0).toFixed(1)}m</div>
          <div><span style="color:rgba(152,203,255,0.55)">THROTTLE</span> ${replay.throttle || '1.0'}x</div>
        </div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(152,203,255,0.1);">
          <span style="color:rgba(152,203,255,0.55)">PILOT</span> ${escapeHtml(replay.username || 'Pilot')} ·
          <span style="color:rgba(152,203,255,0.55)">DATE</span> ${date} ·
          <span style="color:rgba(152,203,255,0.55)">SOURCE</span> ${replay._source === 'cloud' ? '☁️ Cloud' : '💾 Local'}
        </div>
      `;
    }
  }
  async function renderReplays() {
    if (!replayBody) return;
    replayBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Loading replays...</div>';
    try {
      currentReplays = await getReplays();
      if (!currentReplays.length) {
        replayBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">No replays yet. Notable runs (new best, mission success, or score ≥ 3000) are saved automatically.</div>';
        return;
      }
      let html = '';
      currentReplays.forEach(r => {
        const date = new Date(r.timestamp).toLocaleDateString();
        const badge = r.notableReason === 'new-best' ? '⭐ NEW BEST'
          : r.won ? '✅ SUCCESS'
          : r.notableReason === 'high-score' ? '🔥 HIGH SCORE'
          : '';
        const thumb = r._screenshotDataUrl
          ? `background-image:url(${r._screenshotDataUrl});`
          : 'background:rgba(0,0,0,0.3);';
        html += `<div class="replay-card" data-id="${r.id}" style="display:flex;gap:10px;align-items:center;padding:10px;border:1px solid rgba(152,203,255,0.12);border-radius:4px;cursor:pointer;transition:background 0.15s;">
          <div style="width:64px;height:40px;border-radius:3px;${thumb}background-size:cover;background-position:center;flex-shrink:0;border:1px solid rgba(152,203,255,0.15);"></div>
          <div style="flex:1;text-align:left;min-width:0;">
            <div style="font-size:13px;font-weight:700;color:#98cbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Number(r.score).toLocaleString()} pts · Grade ${r.grade || '?'}</div>
            <div style="font-size:10px;color:rgba(152,203,255,0.55);margin-top:2px;">${escapeHtml(r.username || 'Pilot')} · ${date} · Level ${r.level || 1}</div>
          </div>
          <div style="font-size:10px;font-weight:700;color:#00dddd;white-space:nowrap;">${badge}</div>
        </div>`;
      });
      replayBody.innerHTML = html;
      replayBody.querySelectorAll('.replay-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-id');
          const replay = currentReplays.find(r => r.id === id);
          if (replay) openReplayDetail(replay);
        });
      });
    } catch (_) {
      replayBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Unable to load replays.</div>';
    }
  }
  async function doDeleteReplay() {
    if (!selectedReplayId) return;
    try {
      await deleteReplay(selectedReplayId);
      selectedReplayId = null;
      if (replayDetailPanel) replayDetailPanel.classList.add('hidden');
      renderReplays();
      if (replayPanel) replayPanel.classList.remove('hidden');
    } catch (e) { console.warn('deleteReplay failed', e); }
  }
  if (replayGalleryBtn) replayGalleryBtn.addEventListener('click', openReplayGallery);
  if (replayClose) replayClose.addEventListener('click', closeReplayGallery);
  if (replayDetailBack) replayDetailBack.addEventListener('click', () => {
    if (replayDetailPanel) replayDetailPanel.classList.add('hidden');
    if (replayPanel) replayPanel.classList.remove('hidden');
    selectedReplayId = null;
  });
  if (replayDetailDelete) replayDetailDelete.addEventListener('click', doDeleteReplay);
  // Auto-refresh when a new replay is saved
  window.addEventListener('replaySaved', () => {
    if (replayPanel && !replayPanel.classList.contains('hidden')) {
      renderReplays();
    }
  });

  async function doGenerateSkin() {
    if (!puterAvailable) {
      if (skinStatus) skinStatus.textContent = 'Sign in to Puter to generate images';
      return;
    }
    if (!skinPrompt) return;
    const prompt = skinPrompt.value.trim();
    if (!prompt) { if (skinStatus) skinStatus.textContent = 'Enter a prompt'; return; }
    if (skinStatus) skinStatus.textContent = 'Generating…';
    if (generateSkinBtn) generateSkinBtn.disabled = true;
    const url = await generateImage(prompt, { size: '512x512' });
    if (generateSkinBtn) generateSkinBtn.disabled = false;
    if (!url) { if (skinStatus) skinStatus.textContent = 'Failed. Try again.'; return; }
    if (skinPreview) skinPreview.style.backgroundImage = `url(${url})`;
    if (skinStatus) skinStatus.textContent = 'Applied!';
    try { localStorage.setItem('kamikazziPlaneSkin', url); } catch (_) {}
    if (world && world.applyPlaneSkin) world.applyPlaneSkin(url);
  }

  async function doGeneratePortrait() {
    if (!puterAvailable) {
      if (portraitStatus) portraitStatus.textContent = 'Sign in to Puter to generate images';
      return;
    }
    if (!portraitPrompt) return;
    const prompt = portraitPrompt.value.trim();
    if (!prompt) { if (portraitStatus) portraitStatus.textContent = 'Enter a prompt'; return; }
    if (portraitStatus) portraitStatus.textContent = 'Generating…';
    if (generatePortraitBtn) generatePortraitBtn.disabled = true;
    const url = await generateImage(prompt, { size: '512x512' });
    if (generatePortraitBtn) generatePortraitBtn.disabled = false;
    if (!url) { if (portraitStatus) portraitStatus.textContent = 'Failed. Try again.'; return; }
    if (portraitPreview) portraitPreview.style.backgroundImage = `url(${url})`;
    if (portraitStatus) portraitStatus.textContent = 'Saved!';
    try { localStorage.setItem('kamikazziPilotPortrait', url); } catch (_) {}
  }

  if (generateSkinBtn) generateSkinBtn.addEventListener('click', doGenerateSkin);
  if (generatePortraitBtn) generatePortraitBtn.addEventListener('click', doGeneratePortrait);

  // Restore saved skin / portrait on load
  (function restoreCustomizations() {
    try {
      const savedSkin = localStorage.getItem('kamikazziPlaneSkin');
      if (savedSkin) {
        if (skinPreview) skinPreview.style.backgroundImage = `url(${savedSkin})`;
        if (world && world.applyPlaneSkin) world.applyPlaneSkin(savedSkin);
      }
      const savedPortrait = localStorage.getItem('kamikazziPilotPortrait');
      if (savedPortrait && portraitPreview) portraitPreview.style.backgroundImage = `url(${savedPortrait})`;
    } catch (_) {}
  })();

  function resetSettingsPanel() {
    if (settingsPanel) settingsPanel.classList.add('hidden');
    if (settingsBtn) settingsBtn.textContent = 'Settings';
  }
  function togglePause() {
    if (!world || !world.state) return;
    if (world.state.over) return;           // don't pause during crash / game over
    if (!world.state.running) return;        // don't pause on start screen
    world.state.paused = !world.state.paused;
    if (world.state.paused) {
      if (pauseScreen) pauseScreen.classList.remove('hidden');
    } else {
      if (pauseScreen) pauseScreen.classList.add('hidden');
      resetSettingsPanel();
    }
  }
  function resumeGame() {
    if (!world || !world.state) return;
    world.state.paused = false;
    if (pauseScreen) pauseScreen.classList.add('hidden');
    resetSettingsPanel();
  }
  function quitToMenu() {
    if (!world || !world.state) return;
    world.state.paused = false;
    if (pauseScreen) pauseScreen.classList.add('hidden');
    resetSettingsPanel();
    if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
    if (skinLabPanel) skinLabPanel.classList.add('hidden');
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    resetExplodeSequence();
    // Clear powerup chips and timestamps so stale buffs don't linger on the menu
    if (chipStrip) chipStrip.innerHTML = '';
    chipEls.clear();
    if (world.state._powerups) {
      Object.keys(world.state._powerups).forEach(k => world.state._powerups[k] = 0);
    }
    // Stop loop and return to start screen without resetting game
    if (world.stopLoop) world.stopLoop();
    if (startScreen) startScreen.classList.remove('hidden');
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    world.state.running = false;
    world.state.over = false;
    world.state.won = false;
  }
  if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
  if (pauseRetryBtn) pauseRetryBtn.addEventListener('click', () => { resumeGame(); retry(); });
  if (quitBtn) quitBtn.addEventListener('click', quitToMenu);


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
  let prevWon = false;
  let explodePlays = 0;
  let explodeDone = false;
  let explodeTimer = null;

  // Compute performance grade for Mission Success screen.
  function computeGrade(score) {
    if (score >= 10000) return 'S';
    if (score >= 7000) return 'A';
    if (score >= 5000) return 'B';
    if (score >= 3000) return 'C';
    return 'D';
  }

  // Populate shared telemetry fields for both Terminated and Success screens.
  function populateTelemetry(scoreEl, bestEl, sectorEl, distanceEl, altEl, throttleEl, elapsedEl) {
    if (scoreEl) scoreEl.textContent = Math.floor(world.state.score).toLocaleString();
    if (bestEl) bestEl.textContent = world.state.best.toLocaleString();
    if (sectorEl) sectorEl.textContent = 'SECTOR_' + String(world.state.level || 1).padStart(2, '0');
    if (distanceEl) distanceEl.textContent = ((world.state.impactDistance || 0) / 1000).toFixed(2);
    if (altEl) altEl.textContent = (world.state.impactAlt || 0).toFixed(2) + 'm';
    if (throttleEl) throttleEl.textContent = (world.state.speed / (world.state.baseSpeed || 1)).toFixed(1) + 'x';
    if (elapsedEl) {
      const ms = world.state.timeElapsedMs || 0;
      const secs = Math.floor(ms / 1000);
      const mins = Math.floor(secs / 60);
      const rem = secs % 60;
      elapsedEl.textContent = 'TIME_ELAPSED: ' + String(mins).padStart(2, '0') + ':' + String(rem).padStart(2, '0');
    }
  }

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

      const isOver = !!world.state.over;
      const isWon = !!world.state.won;

      // Update Mission Terminated telemetry when game over becomes active
      if (isOver && explodeDone) {
        populateTelemetry(mtScore, mtBest, mtSector, mtDistance, mtAlt, mtThrottle, mtElapsed);
      }

      // Update Mission Success telemetry when won becomes active
      if (isWon && !prevWon) {
        populateTelemetry(msScore, msBest, msSector, msDistance, msAlt, msThrottle, msElapsed);
        if (msGrade) msGrade.textContent = computeGrade(Math.floor(world.state.score));
      }

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

      // Detect the FALSE -> TRUE edge on state.over: kick off the X3 explosion.
      if (isOver && !prevOver) startExplodeSequence();

      if (isWon) {
        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        if (missionSuccessScreen) missionSuccessScreen.classList.remove('hidden');
      } else if (isOver) {
        // Legacy final score element removed; telemetry populated above in the
        // isOver && explodeDone block via mtScore / mtBest.
        startScreen.classList.add('hidden');
        if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
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
        if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
        // If the player retries mid-sequence, the next start() also calls
        // resetExplodeSequence() so this is a belt-and-suspenders cleanup.
        if (prevOver) resetExplodeSequence();
      }

      prevOver = isOver;
      prevWon = isWon;
    }
    requestAnimationFrame(uiLoop);
  }
  requestAnimationFrame(uiLoop);

  function start() {
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
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
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    start();
  }

  if (startBtn) startBtn.addEventListener('click', start);
  if (retryBtn) retryBtn.addEventListener('click', retry);
  if (abortBtn) abortBtn.addEventListener('click', quitToMenu);
  if (successRetryBtn) successRetryBtn.addEventListener('click', retry);
  if (successQuitBtn) successQuitBtn.addEventListener('click', quitToMenu);

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
    // Priority 0: close panels if open
    if (leaderboardPanel && !leaderboardPanel.classList.contains('hidden')) {
      leaderboardPanel.classList.add('hidden');
      e.preventDefault();
      return;
    }
    if (skinLabPanel && !skinLabPanel.classList.contains('hidden')) {
      skinLabPanel.classList.add('hidden');
      e.preventDefault();
      return;
    }
    if (replayPanel && !replayPanel.classList.contains('hidden')) {
      closeReplayGallery();
      e.preventDefault();
      return;
    }
    if (replayDetailPanel && !replayDetailPanel.classList.contains('hidden')) {
      replayDetailPanel.classList.add('hidden');
      if (replayPanel) replayPanel.classList.remove('hidden');
      selectedReplayId = null;
      e.preventDefault();
      return;
    }
    if (runHistoryPanel && !runHistoryPanel.classList.contains('hidden')) {
      closeRunHistory();
      e.preventDefault();
      return;
    }
    if (briefingsPanel && !briefingsPanel.classList.contains('hidden')) {
      closeBriefings();
      e.preventDefault();
      return;
    }
    // Priority 1: skip explosion sequence if active
    if (skipExplodeIfRunning()) { e.preventDefault(); return; }
    // Priority 2: toggle pause during gameplay
    if (world && world.state && world.state.running && !world.state.over) {
      togglePause();
      e.preventDefault();
      return;
    }
  });

  // Auto-pause when tab hidden (New folder integration)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && world && world.state && world.state.running && !world.state.over && !world.state.paused) {
      world.state.paused = true;
      if (pauseScreen) pauseScreen.classList.remove('hidden');
    }
  });

  return { start, retry };
}
