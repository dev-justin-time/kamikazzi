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
import { t, setLocale, getAvailableLocales } from './locale.js';

import {
  isPuterAvailable, getUsername, getAvatarUrl, getLeaderboard,
  setCloudSyncEnabled, generateImage, getReplays, deleteReplay,
  getRunHistory, syncSettings, getSettings, speak,
  loadGameSnapshot, submitCommunityPowerup, getCommunityPowerups, voteCommunityPowerup,
  startLobbyPresence,
  buildSkinPrompt, getSkinStylePresets, generateBuildingPalette,
} from './puter-client.js';

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
  { key: 'shield',  labelKey: 'powerup.shield',  durationMs: TUNING.POWERUP_SHIELD_MS,  cssVar: '#66ffff' },
  { key: 'boost',   labelKey: 'powerup.boost',    durationMs: TUNING.POWERUP_BOOST_MS,   cssVar: '#ffd54f' },
  { key: 'magnet',  labelKey: 'powerup.magnet',   durationMs: TUNING.POWERUP_MAGNET_MS,  cssVar: '#ff8ad9' },
  { key: 'score2x', labelKey: 'powerup.score2x',  durationMs: TUNING.POWERUP_SCORE2X_MS, cssVar: '#8eff9a' },
  { key: 'slowmo',  labelKey: 'powerup.slowmo',   durationMs: TUNING.POWERUP_SLOWMO_MS,  cssVar: '#a896ff' },
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
  const bootStepKeys = [
    'boot.step0',
    'boot.step1',
    'boot.step2',
    'boot.step3',
    'boot.step4',
    'boot.step5',
    'boot.step6',
    'boot.step7',
    'boot.step8',
    'boot.step9',
  ];
  if (bootBar) {
    for (let i = 0; i < BOOT_SEGMENTS; i++) {
      const seg = document.createElement('div');
      seg.className = 'boot-seg';
      seg.setAttribute('aria-hidden', 'true');
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
      const stepIdx = Math.min(Math.floor((progress / 100) * bootStepKeys.length), bootStepKeys.length - 1);
      if (bootStatus) bootStatus.textContent = t(bootStepKeys[stepIdx]);
      if (progress < 100) {
        setTimeout(tick, Math.random() * 120 + 40);
      } else {
        // Animate dev splash to full color before fade-out
        if (bootScreen) bootScreen.classList.add('boot-done');
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

  // ---- Building Marketplace ----
  const marketplaceBtn = document.getElementById('marketplaceBtn');
  const marketplacePanel = document.getElementById('marketplacePanel');
  const marketplaceBody = document.getElementById('marketplaceBody');
  const marketplaceClose = document.getElementById('marketplaceClose');

  // ---- Settings (moved to start screen) ----
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsClose = document.getElementById('settingsClose');
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

  // ---- Resume Run UI ----
  const resumeRunBtn = document.getElementById('resumeRunBtn');
  let _cachedSnapshot = null;

  // Check for available snapshots on boot
  (async function checkSnapshot() {
    if (!resumeRunBtn || !world) return;
    try {
      _cachedSnapshot = await loadGameSnapshot();
      if (_cachedSnapshot) {
        resumeRunBtn.classList.remove('hidden');
        const lev = _cachedSnapshot.level || 1;
        const scr = Number(_cachedSnapshot.score || 0).toLocaleString();
        resumeRunBtn.textContent = `▶ Resume Sector ${lev} · ${scr} pts`;
        resumeRunBtn.setAttribute('aria-label', `Resume saved run at Sector ${lev} with ${scr} points`);
      }
    } catch (_) {}
  })();

  // ---- Legal & Compliance UI ----
  const legalBtn = document.getElementById('legalBtn');
  const legalPanel = document.getElementById('legalPanel');
  const legalClose = document.getElementById('legalClose');
  const legalBody = document.getElementById('legalBody');

  // ---- Legal consent state ----
  const LEGAL_CONSENT_KEY = 'kamikazzi_legal_consent';
  let _legalConsentAccepted = (() => {
    try { return localStorage.getItem(LEGAL_CONSENT_KEY) === 'true'; } catch (_) { return false; }
  })();
  let _pendingLegalAction = null; // 'start' or 'resume' — executed after user accepts consent
  const legalConsentBar = document.getElementById('legalConsentBar');
  const legalConsentCheck = document.getElementById('legalConsentCheck');
  const legalConsentText = document.getElementById('legalConsentText');
  const legalAgreeBtn = document.getElementById('legalAgreeBtn');

  // Localize consent text on boot
  if (legalConsentText) {
    legalConsentText.textContent = t('legal.consent.checkbox');
  }
  if (legalAgreeBtn) {
    legalAgreeBtn.textContent = t('legal.consent.agree');
  }

  // ---- Community Powerup Registry UI ----
  const communityPowerupBtn = document.getElementById('communityPowerupBtn');

  const communityPowerupPanel = document.getElementById('communityPowerupPanel');
  const communityPowerupClose = document.getElementById('communityPowerupClose');
  const communityPowerupBody = document.getElementById('communityPowerupBody');
  const communityPowerupSubmit = document.getElementById('communityPowerupSubmit');
  const cpName = document.getElementById('cpName');
  const cpDesc = document.getElementById('cpDesc');
  const cpShape = document.getElementById('cpShape');
  const cpEffect = document.getElementById('cpEffect');
  const cpColor = document.getElementById('cpColor');
  const cpSubmitBtn = document.getElementById('cpSubmitBtn');
  const cpSubmitStatus = document.getElementById('cpSubmitStatus');


  // ---- Player Profile UI ----
  const profileBtn = document.getElementById('profileBtn');
  const profilePanel = document.getElementById('profilePanel');
  const profileClose = document.getElementById('profileClose');
  const profileBody = document.getElementById('profileBody');

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

  // ---- Building Palette DOM refs ----
  const buildPrompt = document.getElementById('buildPrompt');
  const generateBuildBtn = document.getElementById('generateBuildBtn');
  const buildPaletteStrip = document.getElementById('buildPaletteStrip');
  const buildStatus = document.getElementById('buildStatus');
  const applyBuildPaletteBtn = document.getElementById('applyBuildPaletteBtn');
  const buildStyleChips = document.getElementById('buildStyleChips');
  const buildPromptPreview = document.getElementById('buildPromptPreview');
  // Preset persistence keys
  const PRESET_KEYS = {
    skin: 'kamikazzi_skin_preset',
    portrait: 'kamikazzi_portrait_preset',
    building: 'kamikazzi_building_preset',
  };
  function loadPreset(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
  }
  function savePreset(key, id) {
    try { localStorage.setItem(key, id); } catch (_) {}
  }
  let _buildActivePresetId = loadPreset(PRESET_KEYS.building, 'kamikaze');
  let _lastBuildPaletteData = null; // { palette, roofColor, accentColor, imageUrl }

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

  // ---- Delete confirmation state ----
  const deleteConfirmPanel = document.getElementById('deleteConfirmPanel');
  const deleteConfirmOk = document.getElementById('deleteConfirmOk');
  const deleteConfirmCancel = document.getElementById('deleteConfirmCancel');

  // ---- Keyboard shortcuts overlay ----
  const shortcutsPanel = document.getElementById('shortcutsPanel');
  const shortcutsClose = document.getElementById('shortcutsClose');

  // ---- Lobby / Matchmaking wiring ----
  const lobbyBtn = document.getElementById('lobbyBtn');
  const lobbyPanel = document.getElementById('lobbyPanel');
  const lobbyClose = document.getElementById('lobbyClose');
  const lobbyBody = document.getElementById('lobbyBody');
  const lobbyCount = document.getElementById('lobbyCount');
  const lobbyQuickMatch = document.getElementById('lobbyQuickMatch');

  let _lobbyPresence = null; // controller returned by startLobbyPresence()
  let _lobbyAllPlayers = {}; // { clientId -> playerData }
  let _lobbyOnlineCount = 0;

  async function openLobby() {
    if (!lobbyPanel) return;
    lobbyPanel.classList.remove('hidden');

    // Start lobby presence if not already running
    if (!_lobbyPresence) {
      lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Connecting to lobby...</div>';
      try {
        _lobbyPresence = await startLobbyPresence();
        if (_lobbyPresence) {
          _lobbyPresence.subscribeLobby(handleLobbyUpdate);
          // Update score from current high score
          const hs = Number(localStorage.getItem('kamikazziHiScore') || 0);
          _lobbyPresence.setScore(hs);
        } else {
          lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to connect to lobby. Puter KV unavailable.</div>';
        }
      } catch (_) {
        lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to connect to lobby.</div>';
      }
    }
  }

  function closeLobby() {
    if (lobbyPanel) lobbyPanel.classList.add('hidden');
  }

  function handleLobbyUpdate(state) {
    _lobbyAllPlayers = state || {};
    const selfId = _lobbyPresence ? _lobbyPresence.clientId : null;
    const entries = Object.values(_lobbyAllPlayers);
    _lobbyOnlineCount = entries.length;

    // Update player count
    if (lobbyCount) lobbyCount.textContent = _lobbyOnlineCount;

    if (!lobbyBody) return;
    if (!entries.length) {
      lobbyBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">No other pilots connected yet.</div>';
      return;
    }

    // Sort: self first, then by score desc
    entries.sort((a, b) => {
      if (a.clientId === selfId) return -1;
      if (b.clientId === selfId) return 1;
      return (b.score || 0) - (a.score || 0);
    });

    let html = '';
    for (const player of entries) {
      const isSelf = player.clientId === selfId;
      const avatarHtml = player.avatar
        ? `<img src="${escapeHtml(player.avatar)}" alt="${escapeHtml(player.username || 'Pilot')} avatar" />`
        : `<span style="font-size:16px;">👤</span>`;
      const statusClass = player.status === 'In Game' ? 'game' : player.status === 'Away' ? 'away' : 'lobby';
      const statusLabel = player.status === 'In Game'
        ? 'In Game'
        : player.status === 'Away'
          ? 'Away'
          : 'In Lobby';
      const selfBadge = isSelf ? `<span style="font-size:9px;color:rgba(0,221,221,0.6);font-weight:400;margin-left:4px;">(you)</span>` : '';
      const scoreStr = (player.score || 0) >= 1000
        ? (player.score / 1000).toFixed(1) + 'k'
        : String(player.score || 0);

      html += `<div class="lobby-card${isSelf ? ' lobby-self' : ''}" role="listitem" aria-label="${escapeHtml(player.username || 'Pilot')} — ${statusLabel}">
        <div class="lobby-avatar">${avatarHtml}</div>
        <div class="lobby-info">
          <div class="lobby-name">${escapeHtml(player.username || 'Pilot')}${selfBadge}</div>
          <div class="lobby-meta"><span class="lobby-status ${statusClass}">${statusLabel}</span></div>
        </div>
        <div class="lobby-score">${scoreStr} <span style="font-size:9px;font-weight:400;color:rgba(0,221,221,0.5);">pts</span></div>
      </div>`;
    }
    lobbyBody.innerHTML = html;
  }

  if (lobbyBtn) lobbyBtn.addEventListener('click', openLobby);
  if (lobbyClose) lobbyClose.addEventListener('click', closeLobby);
  if (lobbyPanel) {
    lobbyPanel.addEventListener('click', e => {
      if (e.target === lobbyPanel) closeLobby();
    });
  }

  // Quick Match button
  if (lobbyQuickMatch) {
    lobbyQuickMatch.addEventListener('click', () => {
      // Find other players in the lobby who are "In Lobby" (not in game)
      const inLobby = Object.values(_lobbyAllPlayers).filter(
        p => p.status === 'In Lobby' && p.clientId !== (_lobbyPresence ? _lobbyPresence.clientId : null)
      );
      if (inLobby.length > 0) {
        lobbyQuickMatch.textContent = inLobby.length + ' pilot' + (inLobby.length > 1 ? 's' : '') + ' ready — Start Flying!';
        lobbyQuickMatch.style.borderColor = '#ffe08a';
        lobbyQuickMatch.style.color = '#ffe08a';
        // Highlight the Start Flying button
        if (startBtn) {
          startBtn.style.boxShadow = '0 0 20px rgba(255,200,50,0.5)';
          setTimeout(() => { startBtn.style.boxShadow = ''; }, 3000);
        }
      } else {
        lobbyQuickMatch.textContent = 'No opponents found';
        setTimeout(() => {
          lobbyQuickMatch.textContent = 'Quick Match';
          lobbyQuickMatch.style.borderColor = '';
          lobbyQuickMatch.style.color = '';
        }, 2000);
      }
    });
  }

  // Stop lobby presence when the game starts (world.js will handle its own presence)
  // Also stop on window unload
  window.addEventListener('beforeunload', () => {
    if (_lobbyPresence && typeof _lobbyPresence.stop === 'function') {
      _lobbyPresence.stop();
      _lobbyPresence = null;
    }
  });

  // ---- Community Powerup Registry wiring ----
  async function openCommunityPowerups() {
    if (communityPowerupPanel) communityPowerupPanel.classList.remove('hidden');
    // Reset to Browse view
    const browseTab = communityPowerupPanel && communityPowerupPanel.querySelector('.cp-tab[data-cpview="browse"]');
    const submitTab = communityPowerupPanel && communityPowerupPanel.querySelector('.cp-tab[data-cpview="submit"]');
    if (browseTab) { browseTab.classList.add('active'); browseTab.setAttribute('aria-selected', 'true'); }
    if (submitTab) { submitTab.classList.remove('active'); submitTab.setAttribute('aria-selected', 'false'); }
    if (communityPowerupSubmit) communityPowerupSubmit.style.display = 'none';
    if (communityPowerupBody) communityPowerupBody.style.display = 'block';
    if (cpSubmitStatus) cpSubmitStatus.textContent = '';
    await renderCommunityPowerups();
  }
  function closeCommunityPowerups() {
    if (communityPowerupPanel) communityPowerupPanel.classList.add('hidden');
  }

  async function renderCommunityPowerups() {
    if (!communityPowerupBody) return;
    communityPowerupBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Loading powerups...</div>';
    try {
      const items = await getCommunityPowerups();
      if (!items || !items.length) {
        communityPowerupBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">No powerups yet. Submit the first design!</div>';
        return;
      }
      const username = await getUsername();
      let html = '';
      for (const item of items) {
        const colorHex = '#' + Number(item.color).toString(16).padStart(6, '0');
        const shapeEmoji = { box:'⬜', cylinder:'📊', torus:'⭕', octahedron:'💎', tetrahedron:'🔻', icosahedron:'⚡' }[item.shape] || '⬜';
        const effectLabel = { shield:'🛡 Shield', boost:'🔥 Boost', magnet:'🧲 Magnet', score2x:'✦ 2× Score', slowmo:'⏱ Slow-mo', stamina:'⚡ Stamina' }[item.effect] || item.effect;
        const voteCount = (item.votes && item.votes.length) || 0;
        const hasVoted = username && item.votes && item.votes.includes(username);
        const voteCls = hasVoted ? 'cp-vote-btn voted' : 'cp-vote-btn';
        const voteLabel = hasVoted ? 'Voted' : 'Vote';

        html += `<div class="cp-card" role="listitem" aria-label="${escapeHtml(item.name)}">
          <div class="cp-color-swatch" style="background:${colorHex};" aria-hidden="true"></div>
          <div class="cp-info">
            <div class="cp-name">${shapeEmoji} ${escapeHtml(item.name)}</div>
            <div class="cp-desc">${escapeHtml(item.description || effectLabel)}</div>
            <div class="cp-meta">${escapeHtml(item.author)} · ${new Date(item.timestamp).toLocaleDateString()}</div>
          </div>
          <button class="${voteCls}" data-cpid="${item.id}" aria-label="${voteLabel} for ${escapeHtml(item.name)}">
            <span class="cp-vote-count">${voteCount}</span>
            <span class="cp-vote-label">${voteLabel}</span>
          </button>
        </div>`;
      }
      communityPowerupBody.innerHTML = html;

      // Vote button handlers
      communityPowerupBody.querySelectorAll('.cp-vote-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const id = btn.getAttribute('data-cpid');
          if (!id) return;
          btn.disabled = true;
          try {
            const newCount = await voteCommunityPowerup(id);
            if (newCount >= 0) {
              btn.querySelector('.cp-vote-count').textContent = newCount;
              const isVoted = btn.classList.contains('voted');
              btn.classList.toggle('voted');
              btn.querySelector('.cp-vote-label').textContent = isVoted ? 'Vote' : 'Voted';
              btn.setAttribute('aria-label', (isVoted ? 'Vote' : 'Voted') + ' for ' + (btn.closest('.cp-card')?.getAttribute('aria-label') || ''));
            }
          } catch (_) {}
          btn.disabled = false;
        });
      });
    } catch (_) {
      communityPowerupBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to load community powerups.</div>';
    }
  }

  // Tab switching
  if (communityPowerupPanel) {
    communityPowerupPanel.addEventListener('click', e => {
      const tab = e.target.closest('.cp-tab');
      if (!tab) return;
      const view = tab.getAttribute('data-cpview');
      if (!view) return;

      communityPowerupPanel.querySelectorAll('.cp-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      if (view === 'browse') {
        if (communityPowerupSubmit) communityPowerupSubmit.style.display = 'none';
        if (communityPowerupBody) communityPowerupBody.style.display = 'block';
        renderCommunityPowerups();
      } else {
        if (communityPowerupBody) communityPowerupBody.style.display = 'none';
        if (communityPowerupSubmit) communityPowerupSubmit.style.display = 'block';
      }
    });
  }

  // Color picker
  if (communityPowerupPanel) {
    communityPowerupPanel.addEventListener('click', e => {
      const colorBtn = e.target.closest('.cp-color-btn');
      if (!colorBtn || !cpColor) return;
      communityPowerupPanel.querySelectorAll('.cp-color-btn').forEach(b => b.classList.remove('selected'));
      colorBtn.classList.add('selected');
      cpColor.value = colorBtn.getAttribute('data-color') || '10092543';
    });
  }

  // Submit handler
  async function doSubmitCommunityPowerup() {
    if (!cpName || !cpShape || !cpEffect || !cpColor || !cpSubmitStatus) return;
    const name = cpName.value.trim();
    if (!name) {
      cpSubmitStatus.textContent = 'Enter a powerup name.';
      return;
    }
    const description = cpDesc ? cpDesc.value.trim() : '';
    const shape = cpShape.value;
    const effect = cpEffect.value;
    const color = Number(cpColor.value) || 10092543;

    if (cpSubmitBtn) cpSubmitBtn.disabled = true;
    cpSubmitStatus.textContent = 'Submitting...';

    try {
      const result = await submitCommunityPowerup({ name, description, shape, effect, color });
      if (result) {
        cpSubmitStatus.textContent = 'Powerup submitted! It will appear after refresh.';
        cpName.value = '';
        if (cpDesc) cpDesc.value = '';
      } else {
        cpSubmitStatus.textContent = 'Failed to submit. Try again.';
      }
    } catch (_) {
      cpSubmitStatus.textContent = 'Failed to submit. Try again.';
    }
    if (cpSubmitBtn) cpSubmitBtn.disabled = false;
  }

  if (cpSubmitBtn) cpSubmitBtn.addEventListener('click', doSubmitCommunityPowerup);
  if (cpName) {
    cpName.addEventListener('keydown', e => {
      if (e.key === 'Enter' && cpSubmitBtn) cpSubmitBtn.click();
    });
  }
  // Select first color by default
  if (communityPowerupPanel) {
    const firstColor = communityPowerupPanel.querySelector('.cp-color-btn');
    if (firstColor) firstColor.classList.add('selected');
  }

  if (communityPowerupBtn) communityPowerupBtn.addEventListener('click', openCommunityPowerups);
  if (communityPowerupClose) communityPowerupClose.addEventListener('click', closeCommunityPowerups);
  if (communityPowerupPanel) {
    communityPowerupPanel.addEventListener('click', e => {
      if (e.target === communityPowerupPanel) closeCommunityPowerups();
    });
  }

  
  // ---- Level Fabricator wiring ----
  const lvFabBtn = document.getElementById('sg-lv-fab-btn');
  const lvFabClose = document.getElementById('sg-lv-fab-close');
  let _lfMounted = false;

  async function openLevelFabricator() {
    if (_lfMounted) return;
    _lfMounted = true;
    try {
      const { mountLevelFabricator } = await import('./level-fabricator-init.js');
      await mountLevelFabricator(world, rendererObj);
    } catch (e) {
      console.error("Failed to mount Level Fabricator:", e);
      _lfMounted = false;
    }
  }

  function closeLevelFabricator() {
    if (!_lfMounted) return;
    _lfMounted = false;
    try {
      import('./level-fabricator-init.js').then(({ destroyLevelFabricator }) => {
        destroyLevelFabricator();
      });
    } catch (e) {
      console.warn("Failed to destroy Level Fabricator:", e);
    }
  }

  if (lvFabBtn) lvFabBtn.addEventListener('click', openLevelFabricator);
  if (lvFabClose) lvFabClose.addEventListener('click', closeLevelFabricator);
// ---- Legal & Compliance wiring ----
  function buildLegalHtml() {
    const sections = [
      {
        id: 'age',
        title: 'legal.section.age.title',
        icon: '🔞',
        content: `<p><span class="legal-highlight age">${t('legal.section.age.required')}</span></p>
          <p>${t('legal.section.age.body')}</p>`
      },
      {
        id: 'privacy',
        title: 'legal.section.privacy.title',
        icon: '🔒',
        content: `<p>${t('legal.section.privacy.intro')}</p>
          <p><strong>${t('legal.section.privacy.collect')}</strong></p>
          <p>${t('legal.section.privacy.collect.body')}</p>
          <p><strong>${t('legal.section.privacy.use')}</strong></p>
          <p>${t('legal.section.privacy.use.body')}</p>
          <p><strong>${t('legal.section.privacy.retention')}</strong></p>
          <p>${t('legal.section.privacy.retention.body')}</p>
          <p><strong>${t('legal.section.privacy.rights')}</strong></p>
          <p>${t('legal.section.privacy.rights.body')}</p>`
      },
      {
        id: 'terms',
        title: 'legal.section.terms.title',
        icon: '📜',
        content: `<p><strong>${t('legal.section.terms.license')}</strong></p>
          <p>${t('legal.section.terms.license.body')}</p>
          <p><strong>${t('legal.section.terms.conduct')}</strong></p>
          <p>${t('legal.section.terms.conduct.body')}</p>
          <p><strong>${t('legal.section.terms.liability')}</strong></p>
          <p>${t('legal.section.terms.liability.body')}</p>
          <p><strong>${t('legal.section.terms.termination')}</strong></p>
          <p>${t('legal.section.terms.termination.body')}</p>
          <p><strong>${t('legal.section.terms.governing')}</strong></p>
          <p>${t('legal.section.terms.governing.body')}</p>`
      },
      {
        id: 'compliance',
        title: 'legal.section.compliance.title',
        icon: '🛡️',
        content: `<p><span class="legal-highlight compliance">CCPA</span> <span class="legal-highlight compliance" style="margin-left:4px;">GDPR</span> <span class="legal-highlight compliance" style="margin-left:4px;">COPPA</span></p>
          <p><strong>${t('legal.section.compliance.ccpa')}</strong></p>
          <p>${t('legal.section.compliance.ccpa.body')}</p>
          <p><strong>${t('legal.section.compliance.gdpr')}</strong></p>
          <p>${t('legal.section.compliance.gdpr.body')}</p>
          <p><strong>${t('legal.section.compliance.coppa')}</strong></p>
          <p>${t('legal.section.compliance.coppa.body')}</p>`
      },
      {
        id: 'licensing',
        title: 'legal.section.licensing.title',
        icon: '©️',
        content: `<p><span class="legal-highlight copyright">${t('legal.section.licensing.copyright').slice(0, 4)}</span></p>
          <p><strong>${t('legal.section.licensing.puter')}</strong></p>
          <p>${t('legal.section.licensing.puter.body')}</p>
          <p><strong>${t('legal.section.licensing.copyright')}</strong></p>
          <p>${t('legal.section.licensing.copyright.body')}</p>
          <p><strong>${t('legal.section.licensing.thirdparty')}</strong></p>
          <p>${t('legal.section.licensing.thirdparty.body')}</p>`
      },
    ];

    let html = '';
    for (const sec of sections) {
      html += `<div class="legal-section" data-legal-section="${sec.id}">
        <div class="legal-section-title" role="button" tabindex="0" aria-expanded="false" aria-label="${sec.title}">
          <span>${sec.icon} ${sec.title}</span>
          <span class="legal-arrow">▶</span>
        </div>
        <div class="legal-section-content" role="region" aria-label="${sec.title} content">
          ${sec.content}
        </div>
      </div>`;
    }

    html += `<div class="legal-footer">${t('legal.consent')}</div>`;
    return html;
  }

  function openLegal() {
    if (!legalPanel) return;
    legalPanel.classList.remove('hidden');
    if (!legalBody) return;
    // Build content on first open
    if (!legalBody.getAttribute('data-built')) {
      legalBody.setAttribute('data-built', 'true');
      legalBody.innerHTML = buildLegalHtml();

      // Accordion click handlers
      legalBody.addEventListener('click', e => {
        const title = e.target.closest('.legal-section-title');
        if (!title) return;
        const section = title.closest('.legal-section');
        if (!section) return;
        const content = section.querySelector('.legal-section-content');
        if (!content) return;
        const isOpen = content.classList.contains('open');
        content.classList.toggle('open');
        title.classList.toggle('open');
        title.setAttribute('aria-expanded', String(!isOpen));
      });

      // Keyboard support for accordion (Enter/Space on title)
      legalBody.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          const title = e.target.closest('.legal-section-title');
          if (title) {
            e.preventDefault();
            title.click();
          }
        }
      });
    }

    // Show/hide consent bar based on whether user has accepted
    if (legalConsentBar) {
      if (!_legalConsentAccepted) {
        legalConsentBar.classList.remove('hidden');
        // Re-check checkbox state (resets each open)
        if (legalConsentCheck) legalConsentCheck.checked = false;
        if (legalAgreeBtn) legalAgreeBtn.disabled = true;
      } else {
        legalConsentBar.classList.add('hidden');
      }
    }
  }
  function closeLegal() {
    if (legalPanel) legalPanel.classList.add('hidden');
    // If there's a pending action and the user closed without accepting, clear it
    if (_pendingLegalAction && !_legalConsentAccepted) {
      _pendingLegalAction = null;
    }
  }

  // ---- Legal consent wiring ----
  // Enable agree button only when checkbox is checked
  if (legalConsentCheck && legalAgreeBtn) {
    legalConsentCheck.addEventListener('change', () => {
      legalAgreeBtn.disabled = !legalConsentCheck.checked;
    });
  }

  // Handle agree button click
  if (legalAgreeBtn) {
    legalAgreeBtn.addEventListener('click', () => {
      if (legalConsentCheck && !legalConsentCheck.checked) {
        return; // safety check — button should be disabled
      }
      // Save consent to localStorage
      try { localStorage.setItem(LEGAL_CONSENT_KEY, 'true'); } catch (_) {}
      _legalConsentAccepted = true;

      // Hide consent bar
      if (legalConsentBar) legalConsentBar.classList.add('hidden');

      // Execute any pending action (start / resume)
      const action = _pendingLegalAction;
      _pendingLegalAction = null;

      if (action === 'start') {
        closeLegal();
        // Call the actual start logic
        doStart();
      } else if (action === 'resume') {
        closeLegal();
        doResumeRun();
      } else {
        // User just opened legal from the ⚖️ button and agreed — just close
        closeLegal();
      }
    });
  }

  if (legalBtn) legalBtn.addEventListener('click', openLegal);
  if (legalClose) legalClose.addEventListener('click', closeLegal);
  if (legalPanel) {
    legalPanel.addEventListener('click', e => {
      if (e.target === legalPanel) closeLegal();
    });
  }

  function toggleShortcuts() {
    if (!shortcutsPanel) return;
    const isOpen = !shortcutsPanel.classList.contains('hidden');
    if (isOpen) {
      shortcutsPanel.classList.add('hidden');
    } else {
      // Close any other open panels first
      if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
      if (skinLabPanel) skinLabPanel.classList.add('hidden');
      if (marketplacePanel) marketplacePanel.classList.add('hidden');
      if (settingsPanel) settingsPanel.classList.add('hidden');
      if (replayPanel) replayPanel.classList.add('hidden');
      if (replayDetailPanel) replayDetailPanel.classList.add('hidden');
      if (runHistoryPanel) runHistoryPanel.classList.add('hidden');
      if (profilePanel) profilePanel.classList.add('hidden');
      if (briefingsPanel) briefingsPanel.classList.add('hidden');
      if (communityPowerupPanel) communityPowerupPanel.classList.add('hidden');
      if (legalPanel) closeLegal();
      if (lobbyPanel) lobbyPanel.classList.add('hidden');
      shortcutsPanel.classList.remove('hidden');
    }
  }

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
  if (toggleOverlays) {
    toggleOverlays.checked = overlaysEnabled;
    toggleOverlays.setAttribute('aria-checked', String(overlaysEnabled));
  }

  // Cloud sync toggle persistence
  const CLOUD_SYNC_KEY = 'kamikazzi_cloud_sync_enabled';
  let cloudSyncEnabled = (() => {
    try {
      const saved = localStorage.getItem(CLOUD_SYNC_KEY);
      return saved === null ? puterAvailable : saved === 'true';
    } catch (_) { return puterAvailable; }
  })();
  if (toggleCloudSync) {
    toggleCloudSync.checked = cloudSyncEnabled;
    toggleCloudSync.setAttribute('aria-checked', String(cloudSyncEnabled));
    toggleCloudSync.addEventListener('change', () => {
      cloudSyncEnabled = toggleCloudSync.checked;
      toggleCloudSync.setAttribute('aria-checked', String(cloudSyncEnabled));
      setCloudSyncEnabled(cloudSyncEnabled);
      try { localStorage.setItem(CLOUD_SYNC_KEY, String(cloudSyncEnabled)); } catch (_) {}
    });
  }

  function openSettings() { if (settingsPanel) settingsPanel.classList.remove('hidden'); }
  function closeSettings() { if (settingsPanel) settingsPanel.classList.add('hidden'); }
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsPanel) {
    settingsPanel.addEventListener('click', e => {
      if (e.target === settingsPanel) closeSettings();
    });
  }
  if (toggleOverlays) {
    toggleOverlays.addEventListener('change', () => {
      const enabled = toggleOverlays.checked;
      toggleOverlays.setAttribute('aria-checked', String(enabled));
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
        ? `<img src="${avatar}" alt="${escapeHtml(username)} avatar" style="width:22px;height:22px;border-radius:50%;margin-right:6px;object-fit:cover;" />`
        : `<span style="font-size:16px;margin-right:4px;" aria-hidden="true">👤</span>`
      ) + `<span style="font-weight:700;">${escapeHtml(username)}</span>`;
      userBadge.setAttribute('aria-label', 'Logged in as ' + username);
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
  // Leaderboard period state
  let _leaderboardPeriod = 'week';

  async function renderLeaderboard(period) {
    if (!leaderboardBody) return;
    const p = period || _leaderboardPeriod;
    _leaderboardPeriod = p;

    // Update tab active states
    if (leaderboardPanel) {
      leaderboardPanel.querySelectorAll('.lb-tab').forEach(tab => {
        const isActive = tab.getAttribute('data-period') === p;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
      });
    }

    leaderboardBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Loading...</div>';
    try {
      const board = await getLeaderboard(10, p);
      if (!board || !board.length) {
        const emptyMsg = p !== 'all'
          ? 'No scores for this period.'
          : 'No scores yet. Be the first!';
        leaderboardBody.innerHTML = `<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">${emptyMsg}</div>`;
        return;
      }
      let html = '';
      board.forEach((entry, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<span style="display:inline-block;width:22px;text-align:center;">${idx + 1}</span>`;
        html += `<div role="listitem" style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;border-bottom:1px solid rgba(152,203,255,0.1);font-size:12px;font-family:'JetBrains Mono','Space Mono',monospace;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:14px;" aria-hidden="true">${medal}</span>
            <span style="font-weight:600;color:#98cbff;">${escapeHtml(entry.username || 'Pilot')}</span>
          </div>
          <span style="font-weight:800;color:#00dddd;">${Number(entry.score).toLocaleString()} pts</span>
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
  // Tab click handlers
  if (leaderboardPanel) {
    leaderboardPanel.addEventListener('click', e => {
      const tab = e.target.closest('.lb-tab');
      if (tab) {
        const period = tab.getAttribute('data-period');
        if (period) renderLeaderboard(period);
      }
    });
  }

  // ---- Skin Lab wiring ----
  // Style preset state (restored from localStorage)
  const _skinPresets = getSkinStylePresets();
  let _skinActivePresetId = loadPreset(PRESET_KEYS.skin, 'kamikaze');
  let _portraitActivePresetId = loadPreset(PRESET_KEYS.portrait, 'kamikaze');

  const skinStyleChips = document.getElementById('skinStyleChips');
  const portraitStyleChips = document.getElementById('portraitStyleChips');
  const skinPromptPreview = document.getElementById('skinPromptPreview');
  const portraitPromptPreview = document.getElementById('portraitPromptPreview');

  // Build style preset chips for both skin and portrait sections
  function renderStyleChips(container, activePresetId, onChange) {
    if (!container) return;
    container.innerHTML = '';
    for (const preset of _skinPresets) {
      const chip = document.createElement('button');
      chip.className = 'skin-style-chip' + (preset.id === activePresetId ? ' active' : '');
      chip.setAttribute('data-preset-id', preset.id);
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(preset.id === activePresetId));
      chip.setAttribute('aria-label', preset.name + ': ' + preset.desc);
      chip.innerHTML = `<span class="chip-emoji">${escapeHtml(preset.emoji)}</span> ${escapeHtml(preset.name)}`;
      chip.addEventListener('click', () => {
        container.querySelectorAll('.skin-style-chip').forEach(c => {
          c.classList.remove('active');
          c.setAttribute('aria-checked', 'false');
        });
        chip.classList.add('active');
        chip.setAttribute('aria-checked', 'true');
        onChange(preset.id);
      });
      container.appendChild(chip);
    }
  }

  // Update prompt preview for a given input + preset + preview element
  function updatePromptPreview(inputEl, presetId, previewEl) {
    if (!previewEl) return;
    const text = inputEl ? inputEl.value.trim() : '';
    const result = buildSkinPrompt(text, presetId);
    previewEl.textContent = result.prompt;
    previewEl.title = 'Negative: ' + result.negative;
  }

  // When either input changes, update the preview
  if (skinPrompt) {
    skinPrompt.addEventListener('input', () => {
      updatePromptPreview(skinPrompt, _skinActivePresetId, skinPromptPreview);
    });
  }
  if (portraitPrompt) {
    portraitPrompt.addEventListener('input', () => {
      updatePromptPreview(portraitPrompt, _portraitActivePresetId, portraitPromptPreview);
    });
  }

  // Init skin style chips
  renderStyleChips(skinStyleChips, _skinActivePresetId, (presetId) => {
    _skinActivePresetId = presetId;
    savePreset(PRESET_KEYS.skin, presetId);
    updatePromptPreview(skinPrompt, presetId, skinPromptPreview);
  });
  // Init portrait style chips
  renderStyleChips(portraitStyleChips, _portraitActivePresetId, (presetId) => {
    _portraitActivePresetId = presetId;
    savePreset(PRESET_KEYS.portrait, presetId);
    updatePromptPreview(portraitPrompt, presetId, portraitPromptPreview);
  });
  // Init building palette style chips
  renderStyleChips(buildStyleChips, _buildActivePresetId, (presetId) => {
    _buildActivePresetId = presetId;
    savePreset(PRESET_KEYS.building, presetId);
    updateBuildPromptPreview();
  });
  // Initial prompt previews
  updatePromptPreview(skinPrompt, _skinActivePresetId, skinPromptPreview);
  updatePromptPreview(portraitPrompt, _portraitActivePresetId, portraitPromptPreview);
  updateBuildPromptPreview();

  // ---- Building Palette generation wiring ----
  function updateBuildPromptPreview() {
    if (!buildPromptPreview) return;
    const text = buildPrompt ? buildPrompt.value.trim() : '';
    buildPromptPreview.textContent = text
      ? 'Building palette: ' + escapeHtml(text) + ' · Style: ' + escapeHtml(_buildActivePresetId)
      : 'Building palette prompt will be expanded with the selected style preset';
    buildPromptPreview.title = 'Style preset: ' + _buildActivePresetId;
  }

  if (buildPrompt) {
    buildPrompt.addEventListener('input', updateBuildPromptPreview);
  }

  async function doGenerateBuildPalette() {
    if (!puterAvailable) {
      if (buildStatus) buildStatus.textContent = 'Sign in to Puter to generate images';
      return;
    }
    if (!buildPrompt) return;
    const raw = buildPrompt.value.trim();
    if (!raw) { if (buildStatus) buildStatus.textContent = 'Enter a prompt'; return; }

    if (buildStatus) buildStatus.textContent = 'Generating palette...';
    if (generateBuildBtn) generateBuildBtn.disabled = true;
    if (applyBuildPaletteBtn) applyBuildPaletteBtn.style.display = 'none';

    try {
      const result = await generateBuildingPalette(raw, _buildActivePresetId);
      if (!result) {
        if (buildStatus) buildStatus.textContent = 'Failed. Try again.';
        if (generateBuildBtn) generateBuildBtn.disabled = false;
        return;
      }

      _lastBuildPaletteData = result;

      // Render palette strip
      if (buildPaletteStrip) {
        buildPaletteStrip.innerHTML = '';
        for (const hex of result.palette) {
          const swatch = document.createElement('div');
          swatch.style.cssText = `flex:1;background:#${hex.toString(16).padStart(6, '0')};`;
          swatch.title = '#' + hex.toString(16).padStart(6, '0');
          buildPaletteStrip.appendChild(swatch);
        }
      }

      if (buildStatus) buildStatus.textContent = 'Palette generated! Apply it as a building skin.';
      if (applyBuildPaletteBtn) applyBuildPaletteBtn.style.display = 'inline-block';
    } catch (e) {
      console.warn('doGenerateBuildPalette failed', e);
      if (buildStatus) buildStatus.textContent = 'Failed. Try again.';
    }

    if (generateBuildBtn) generateBuildBtn.disabled = false;
  }

  function doApplyBuildPalette() {
    if (!_lastBuildPaletteData) return;
    try {
      // Save as a custom building skin in localStorage
      const customSkin = {
        id: 'custom_generated',
        name: 'Custom Generated',
        palette: _lastBuildPaletteData.palette,
        desc: 'AI-generated color palette from custom prompt',
        unlockScore: 0,
        decalOverlay: null,
        roofColor: _lastBuildPaletteData.roofColor,
        accentColor: _lastBuildPaletteData.accentColor,
      };
      try { localStorage.setItem('kamikazzi_building_custom_skin', JSON.stringify(customSkin)); } catch (_) {}
      // Set it as active
      try { localStorage.setItem('kamikazzi_building_skin', 'custom_generated'); } catch (_) {}

      if (buildStatus) buildStatus.textContent = 'Palette applied! Start a new run to see it. Open the Skins panel to select it.';
      if (applyBuildPaletteBtn) applyBuildPaletteBtn.style.display = 'none';
    } catch (e) {
      console.warn('doApplyBuildPalette failed', e);
      if (buildStatus) buildStatus.textContent = 'Failed to apply. Try again.';
    }
  }

  if (generateBuildBtn) generateBuildBtn.addEventListener('click', doGenerateBuildPalette);
  if (applyBuildPaletteBtn) applyBuildPaletteBtn.addEventListener('click', doApplyBuildPalette);

  function openSkinLab() { if (skinLabPanel) skinLabPanel.classList.remove('hidden'); }
  function closeSkinLab() { if (skinLabPanel) skinLabPanel.classList.add('hidden'); }
  if (skinLabBtn) skinLabBtn.addEventListener('click', openSkinLab);
  if (skinLabClose) skinLabClose.addEventListener('click', closeSkinLab);

  // ---- Player Profile wiring ----
  // Format milliseconds to a human string like "2 min 34 s"
  function formatDuration(ms) {
    if (!ms || ms <= 0) return '—';
    const totalSec = ms / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    if (mins > 0) return mins + ' min ' + secs + ' s';
    return secs + ' s';
  }

  // Build the profile analytics HTML from run history
  function buildProfileHtml(history, username, avatarUrl) {
    const totalRuns = history.length;
    if (!totalRuns) {
      return '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">No runs yet. Fly a mission to build your pilot profile.</div>';
    }

    // Aggregate stats
    let bestScore = 0;
    let sumScore = 0;
    let totalDistance = 0;
    let wins = 0;
    let totalTimeMs = 0;
    let longestRunMs = 0;
    let longestRunScore = 0;
    const gradeCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    const levelReached = {};  // level -> count
    const recentScores = [];
    let streak = 0;
    let maxStreak = 0;

    // Walk chronologically (oldest first) for streak detection
    const chronological = [...history].reverse();

    for (const run of chronological) {
      const score = Number(run.score) || 0;
      if (score > bestScore) bestScore = score;
      sumScore += score;
      totalDistance += Number(run.distance) || 0;
      totalTimeMs += Number(run.timeMs) || 0;
      const runTime = Number(run.timeMs) || 0;
      if (runTime > longestRunMs) {
        longestRunMs = runTime;
        longestRunScore = score;
      }
      if (run.won) wins++;

      const grade = run.grade || computeGrade(score);
      if (grade in gradeCounts) gradeCounts[grade]++;

      const level = run.level || 1;
      levelReached[level] = (levelReached[level] || 0) + 1;

      // Streak: consecutive wins
      if (run.won) {
        streak++;
        if (streak > maxStreak) maxStreak = streak;
      } else {
        streak = 0;
      }
    }

    // Recent scores (last 10, newest first)
    for (let i = 0; i < Math.min(10, totalRuns); i++) {
      recentScores.push({
        score: Number(history[i].score) || 0,
        won: history[i].won,
        isBest: (Number(history[i].score) || 0) >= bestScore && i === 0,
      });
    }
    const maxRecent = Math.max(...recentScores.map(s => s.score), 1);

    // Average score
    const avgScore = Math.round(sumScore / totalRuns);

    // Win rate
    const winRate = ((wins / totalRuns) * 100).toFixed(1);

    // Most common sector
    const sortedLevels = Object.entries(levelReached).sort((a, b) => b[1] - a[1]);
    const mostCommonLevel = sortedLevels.length ? sortedLevels[0][0] : 1;

    // Average grade
    const gradeOrder = ['S', 'A', 'B', 'C', 'D'];
    let avgGradeIndex = 0;
    let totalGradeWeight = 0;
    gradeOrder.forEach((g, i) => {
      totalGradeWeight += (gradeCounts[g] || 0) * (i + 1);
    });
    if (totalRuns > 0) {
      const avgIdx = Math.round(totalGradeWeight / totalRuns);
      avgGradeIndex = Math.min(avgIdx - 1, gradeOrder.length - 1);
    }
    const avgGrade = gradeOrder[Math.max(0, avgGradeIndex)] || '-';

    // Total distance in km
    const totalDistKm = (totalDistance / 1000).toFixed(2);

    // Build HTML
    let html = '';

    // --- Pilot header ---
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${escapeHtml(username)}" />`
      : `<span>👤</span>`;
    const displayName = username || 'Guest Pilot';
    const firstRunTime = history[history.length - 1]?.timestamp;
    const joinDate = firstRunTime ? new Date(firstRunTime).toLocaleDateString() : '—';
    html += `<div class="profile-header">
      <div class="profile-avatar">${avatarHtml}</div>
      <div>
        <div class="profile-name">${escapeHtml(displayName)}</div>
        <div class="profile-meta">PILOT  ·  ${totalRuns} runs  ·  since ${joinDate}</div>
      </div>
    </div>`;

    // --- Performance Stats ---
    html += `<div class="profile-section">
      <div class="profile-section-title">Performance</div>
      <div class="profile-stat-row"><span class="profile-stat-label">Total Missions</span><span class="profile-stat-value gold">${totalRuns}</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Best Score</span><span class="profile-stat-value gold">${bestScore.toLocaleString()} pts</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Avg Score</span><span class="profile-stat-value">${avgScore.toLocaleString()} pts</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Total Distance</span><span class="profile-stat-value">${totalDistKm} km</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Win Rate</span><span class="profile-stat-value highlight">${winRate}%</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Total Flight Time</span><span class="profile-stat-value">${formatDuration(totalTimeMs)}</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Longest Run</span><span class="profile-stat-value">${formatDuration(longestRunMs)} · ${longestRunScore.toLocaleString()} pts</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Avg Grade</span><span class="profile-stat-value highlight">${avgGrade}</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Perfect Streak</span><span class="profile-stat-value">${maxStreak} win${maxStreak !== 1 ? 's' : ''}</span></div>
      <div class="profile-stat-row"><span class="profile-stat-label">Most Common Sector</span><span class="profile-stat-value">SECTOR_${String(mostCommonLevel).padStart(2, '0')}</span></div>
    </div>`;

    // --- Grade Distribution ---
    html += `<div class="profile-section">
      <div class="profile-section-title">Grade Distribution</div>
      <div class="profile-grades">
        ${gradeOrder.map(g => `
          <div class="profile-grade-pill profile-grade-${g}">
            <span class="profile-grade-count">${gradeCounts[g] || 0}</span>
            <span style="letter-spacing:0.06em;">${g}</span>
          </div>
        `).join('')}
      </div>
    </div>`;

    // --- Score Trend (bar chart, last 10 runs) ---
    if (recentScores.length > 0) {
      html += `<div class="profile-section">
        <div class="profile-section-title">Score Trend (Last ${recentScores.length})</div>
        <div class="profile-chart">
          ${recentScores.map((s, i) => {
            const pct = Math.max(3, (s.score / maxRecent) * 100);
            const cls = s.isBest ? 'profile-bar new-best' : s.won ? 'profile-bar win' : 'profile-bar';
            return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
              <div class="${cls}" style="height:${pct}%;" title="${s.score.toLocaleString()} pts${s.won ? ' · SUCCESS' : ''}"></div>
              <div class="profile-bar-label">#${recentScores.length - i}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    // --- Level Breakdown (mini bar chart) ---
    const levelEntries = sortedLevels.slice(0, 7); // top 7 levels
    const maxLevelCount = Math.max(...levelEntries.map(([_, c]) => c), 1);
    html += `<div class="profile-section">
      <div class="profile-section-title">Level Reached</div>
      <div class="profile-level-bars">
        ${levelEntries.map(([lv, count]) => {
          const pct = Math.max(3, (count / maxLevelCount) * 100);
          return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;">
            <div class="profile-level-bar" style="height:${pct}%;" title="Level ${lv}: ${count}×"></div>
            <div class="profile-level-bar-label">Lv${lv}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

    return html;
  }

  async function openProfile() {
    if (profilePanel) profilePanel.classList.remove('hidden');
    if (!profileBody) return;
    profileBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Loading profile...</div>';
    try {
      const [history, username, avatarUrl] = await Promise.all([
        getRunHistory(),
        getUsername(),
        getAvatarUrl(),
      ]);
      profileBody.innerHTML = buildProfileHtml(history || [], username || 'Guest Pilot', avatarUrl);
    } catch (_) {
      profileBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to load profile.</div>';
    }
  }
  function closeProfile() { if (profilePanel) profilePanel.classList.add('hidden'); }
  if (profileBtn) profileBtn.addEventListener('click', openProfile);
  if (profileClose) profileClose.addEventListener('click', closeProfile);
  if (profilePanel) {
    profilePanel.addEventListener('click', e => {
      if (e.target === profilePanel) closeProfile();
    });
  }

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
        html += `<div role="listitem" style="display:flex;justify-content:space-between;align-items:center;padding:10px 8px;border-bottom:1px solid rgba(152,203,255,0.1);font-size:12px;font-family:'JetBrains Mono','Space Mono',monospace;">
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
        html += `<div role="article" aria-label="Briefing by ${from}" style="padding:10px 12px;border:1px solid rgba(152,203,255,0.12);border-radius:3px;text-align:left;font-family:'JetBrains Mono','Space Mono',monospace;">
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

  // ---- Building Marketplace wiring ----
  function openMarketplace() {
    if (marketplacePanel) marketplacePanel.classList.remove('hidden');
    renderMarketplace();
  }
  function closeMarketplace() {
    if (marketplacePanel) marketplacePanel.classList.add('hidden');
  }

  function renderMarketplace() {
    if (!marketplaceBody) return;
    // Dynamically import the BUILDING_SKINS and related functions from shared.js
    // (they're module exports, not available at DOM-level, so we read via world)
    // Instead, we inline the skin definitions via the shared module approach.
    import('./world/shared.js').then(({
      BUILDING_SKINS, getActiveBuildingSkin, setActiveBuildingSkin, isSkinUnlocked
    }) => {
      const active = getActiveBuildingSkin();
      // Check for custom generated skin
      let customSkin = null;
      try {
        const raw = localStorage.getItem('kamikazzi_building_custom_skin');
        if (raw) customSkin = JSON.parse(raw);
      } catch (_) {}
      const allSkins = customSkin ? [...BUILDING_SKINS, customSkin] : BUILDING_SKINS;
      let html = '';
      allSkins.forEach(skin => {
        const isActive = active && active.id === skin.id;
        const unlocked = isSkinUnlocked(skin.id);
        const statusText = isActive ? '✓ Active'
          : unlocked ? 'Select' : `🔒 ${skin.unlockScore} pts`;
        const statusClass = isActive ? 'active-label'
          : unlocked ? 'unlocked' : 'locked';
        const cardClass = isActive ? 'skin-card active' : unlocked ? 'skin-card' : 'skin-card locked';
        const interactive = unlocked && !isActive ? 'role="button" tabindex="0"' : '';
        const activeAttr = isActive ? 'aria-current="true"' : '';
        // Build a mini palette preview
        const swatchHtml = '<span aria-hidden="true">🎨</span>';
        html += `<div class="${cardClass}" data-skin-id="${skin.id}" ${interactive} ${activeAttr} aria-label="${skin.name}: ${skin.desc}">
          <div class="skin-swatch" style="background:linear-gradient(135deg,${skin.palette.slice(0,4).map(h => '#' + h.toString(16).padStart(6,'0')).join(',')});">${swatchHtml}</div>
          <div class="skin-info">
            <div class="skin-name">${skin.name}</div>
            <div class="skin-desc">${skin.desc}</div>
          </div>
          <div class="skin-status ${statusClass}">${statusText}</div>
        </div>`;
      });
      marketplaceBody.innerHTML = html;
      // Click handlers
      marketplaceBody.querySelectorAll('.skin-card:not(.locked)').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-skin-id');
          if (id) {
            setActiveBuildingSkin(id);
            renderMarketplace();
          }
        });
      });
    }).catch(() => {
      marketplaceBody.innerHTML = '<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">Error loading skins.</div>';
    });
  }

  if (marketplaceBtn) marketplaceBtn.addEventListener('click', openMarketplace);
  if (marketplaceClose) marketplaceClose.addEventListener('click', closeMarketplace);
  if (marketplacePanel) {
    marketplacePanel.addEventListener('click', e => {
      if (e.target === marketplacePanel) closeMarketplace();
    });
  }

  // ---- Language picker wiring ----
  const langSelect = document.getElementById('langSelect');
  if (langSelect) {
    import('./locale.js').then(mod => {
      const locales = mod.getAvailableLocales();
      langSelect.innerHTML = locales.map(l =>
        `<option value="${l.code}">${l.flag} ${l.nativeName}</option>`
      ).join('');
      langSelect.value = mod.getLocale();
      langSelect.addEventListener('change', () => mod.setLocale(langSelect.value));
    });
  }
  window.addEventListener('localeChanged', () => {
    import('./locale.js').then(mod => {
      if (langSelect) langSelect.value = mod.getLocale();
    });
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
          if (toggleOverlays) {
            toggleOverlays.checked = cloudSettings.overlaysEnabled;
            toggleOverlays.setAttribute('aria-checked', String(cloudSettings.overlaysEnabled));
          }
        }
        if (typeof cloudSettings.cloudSyncEnabled === 'boolean') {
          cloudSyncEnabled = cloudSettings.cloudSyncEnabled;
          setCloudSyncEnabled(cloudSyncEnabled);
          if (toggleCloudSync) {
            toggleCloudSync.checked = cloudSyncEnabled;
            toggleCloudSync.setAttribute('aria-checked', String(cloudSyncEnabled));
          }
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;" role="list" aria-label="Replay statistics">
          <div role="listitem"><span style="color:rgba(152,203,255,0.55)">SCORE</span> <strong style="color:#00dddd">${Number(replay.score).toLocaleString()}</strong></div>
          <div role="listitem"><span style="color:rgba(152,203,255,0.55)">GRADE</span> <strong style="color:#ffe08a">${replay.grade || '?'}</strong></div>
          <div role="listitem"><span style="color:rgba(152,203,255,0.55)">LEVEL</span> ${replay.level || 1}</div>
          <div role="listitem"><span style="color:rgba(152,203,255,0.55)">DIST</span> ${((replay.distance || 0) / 1000).toFixed(2)} km</div>
          <div role="listitem"><span style="color:rgba(152,203,255,0.55)">ALT</span> ${(replay.altitude || 0).toFixed(1)}m</div>
          <div role="listitem"><span style="color:rgba(152,203,255,0.55)">THROTTLE</span> ${replay.throttle || '1.0'}x</div>
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
        html += `<div class="replay-card" data-id="${r.id}" role="button" tabindex="0" aria-label="Replay: ${Number(r.score).toLocaleString()} pts, Grade ${r.grade || '?'}" style="display:flex;gap:10px;align-items:center;padding:10px;border:1px solid rgba(152,203,255,0.12);border-radius:4px;cursor:pointer;transition:background 0.15s;font-family:'JetBrains Mono','Space Mono',monospace;">
          <div style="width:64px;height:40px;border-radius:3px;${thumb}background-size:cover;background-position:center;flex-shrink:0;border:1px solid rgba(152,203,255,0.15);" aria-hidden="true"></div>
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
  // ---- Delete confirmation wiring ----
  function openDeleteConfirm() {
    if (deleteConfirmPanel) deleteConfirmPanel.classList.remove('hidden');
  }
  function closeDeleteConfirm() {
    if (deleteConfirmPanel) deleteConfirmPanel.classList.add('hidden');
  }
  async function confirmDeleteReplay() {
    closeDeleteConfirm();
    await doDeleteReplay();
  }
  if (replayDetailDelete) replayDetailDelete.addEventListener('click', openDeleteConfirm);
  if (deleteConfirmOk) deleteConfirmOk.addEventListener('click', confirmDeleteReplay);
  if (deleteConfirmCancel) deleteConfirmCancel.addEventListener('click', closeDeleteConfirm);
  // Close the delete confirm panel if the user clicks outside the dialog
  if (deleteConfirmPanel) {
    deleteConfirmPanel.addEventListener('click', e => {
      if (e.target === deleteConfirmPanel) closeDeleteConfirm();
    });
  }

  // ---- Keyboard shortcuts wiring ----
  if (shortcutsClose) shortcutsClose.addEventListener('click', () => {
    if (shortcutsPanel) shortcutsPanel.classList.add('hidden');
  });
  if (shortcutsPanel) {
    shortcutsPanel.addEventListener('click', e => {
      if (e.target === shortcutsPanel) shortcutsPanel.classList.add('hidden');
    });
  }
  // Auto-refresh when a new replay is saved
  window.addEventListener('replaySaved', () => {
    if (replayPanel && !replayPanel.classList.contains('hidden')) {
      renderReplays();
    }
  });

  // ---- Final Sector announcement ----
  // Flashes a dramatic "FINAL SECTOR" HUD message when the player enters
  // the last level. Triggered by the 'finalSector' CustomEvent dispatched
  // from world.js when state.level reaches NUM_LEVELS.
  const finalSectorScreen = document.getElementById('finalSectorScreen');
  window.addEventListener('finalSector', () => {
    if (!finalSectorScreen) return;
    finalSectorScreen.classList.remove('hidden');
    finalSectorScreen.removeAttribute('aria-hidden');
    // Force reflow so the CSS transition plays
    void finalSectorScreen.offsetWidth;
    finalSectorScreen.classList.add('active');
    // TTS announcement — queued so it doesn't overlap with other speech
    speak('Final Sector. Boss approaching.', 'announce.finalSector');
    setTimeout(() => {
      finalSectorScreen.classList.remove('active');
      setTimeout(() => {
        finalSectorScreen.classList.add('hidden');
        finalSectorScreen.setAttribute('aria-hidden', 'true');
      }, 800);
    }, 2800);
  });

  // ---- Model Upgrade announcement ----
  // Brief HUD flash when the plane auto-swaps to the BOEING at 15,000 points.
  // Triggered by the 'modelUpgrade' CustomEvent from world.js.
  const modelUpgradeScreen = document.getElementById('modelUpgradeScreen');
  window.addEventListener('modelUpgrade', () => {
    if (!modelUpgradeScreen) return;
    modelUpgradeScreen.classList.remove('hidden');
    modelUpgradeScreen.removeAttribute('aria-hidden');
    void modelUpgradeScreen.offsetWidth;
    modelUpgradeScreen.classList.add('active');
    speak('Aircraft upgraded. Boeing 747 long range bomber.', 'announce.modelUpgrade');
    setTimeout(() => {
      modelUpgradeScreen.classList.remove('active');
      setTimeout(() => {
        modelUpgradeScreen.classList.add('hidden');
        modelUpgradeScreen.setAttribute('aria-hidden', 'true');
      }, 500);
    }, 2000);
  });

  async function doGenerateSkin() {
    if (!puterAvailable) {
      if (skinStatus) skinStatus.textContent = 'Sign in to Puter to generate images';
      return;
    }
    if (!skinPrompt) return;
    const raw = skinPrompt.value.trim();
    if (!raw) { if (skinStatus) skinStatus.textContent = 'Enter a prompt'; return; }
    const { prompt, negative } = buildSkinPrompt(raw, _skinActivePresetId);
    if (skinStatus) skinStatus.textContent = 'Generating…';
    if (generateSkinBtn) generateSkinBtn.disabled = true;
    const url = await generateImage(prompt, { size: '512x512', negative_prompt: negative });
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
    const raw = portraitPrompt.value.trim();
    if (!raw) { if (portraitStatus) portraitStatus.textContent = 'Enter a prompt'; return; }
    // Portraits use character-focused prompt templates (isPortrait: true)
    const { prompt, negative } = buildSkinPrompt(raw, _portraitActivePresetId, { isPortrait: true });
    if (portraitStatus) portraitStatus.textContent = 'Generating…';
    if (generatePortraitBtn) generatePortraitBtn.disabled = true;
    const url = await generateImage(prompt, { size: '512x512', negative_prompt: negative });
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
  }
  function togglePause() {
    if (!world || !world.state) return;
    if (world.state.over) return;           // don't pause during crash / game over
    if (!world.state.running) return;        // don't pause on start screen
    world.state.paused = !world.state.paused;
    if (world.state.paused) {
      if (pauseScreen) pauseScreen.classList.remove('hidden');
      // Auto-save snapshot on pause for cross-device resume
      if (world.saveSnapshot) {
        world.saveSnapshot().catch(() => {});
      }
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
    // Auto-save snapshot before quitting so the player can resume later
    if (world.state.running && !world.state.over && !world.state.won && world.saveSnapshot) {
      world.saveSnapshot().catch(() => {});
    }
    world.state.paused = false;
    if (pauseScreen) pauseScreen.classList.add('hidden');
    resetSettingsPanel();
    if (marketplacePanel) marketplacePanel.classList.add('hidden');
    if (settingsPanel) settingsPanel.classList.add('hidden');
    if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
    if (skinLabPanel) skinLabPanel.classList.add('hidden');
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    if (finalSectorScreen) { finalSectorScreen.classList.remove('active'); finalSectorScreen.classList.add('hidden'); finalSectorScreen.setAttribute('aria-hidden', 'true'); }
    if (typeof modelUpgradeScreen !== 'undefined' && modelUpgradeScreen) { modelUpgradeScreen.classList.remove('active'); modelUpgradeScreen.classList.add('hidden'); modelUpgradeScreen.setAttribute('aria-hidden', 'true'); }
    resetExplodeSequence();
    // Clear powerup chips and timestamps so stale buffs don't linger on the menu
    if (chipStrip) chipStrip.innerHTML = '';
    chipEls.clear();
    if (world.state._powerups) {
      Object.keys(world.state._powerups).forEach(k => world.state._powerups[k] = 0);
    }
    // Update lobby status back to In Lobby
    if (_lobbyPresence && typeof _lobbyPresence.setStatus === 'function') {
      _lobbyPresence.setStatus('In Lobby');
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
  // The strip is marked as a live region so assistive technology announces
  // powerup pickups as they happen. Each chip gets the notification role.
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
  chipStrip.setAttribute('role', 'status');
  chipStrip.setAttribute('aria-live', 'polite');
  chipStrip.setAttribute('aria-atomic', 'true');
  chipStrip.style.cssText =
    // top:72px gives 28px clearance from the #score pill (which sits at
    // top:16px with ~40px of content height = bottom at ~56px). 4px is
    // tight on devices where the pill grows taller (long localized
    // strings wrap to two lines), so 72px is the safe minimum.
    'position:fixed;top:72px;left:0;right:0;z-index:11;pointer-events:none;' +
    'display:flex;gap:8px;flex-wrap:wrap;justify-content:center;' +
    'font-family:"Stick No Bills","Anton",sans-serif;';
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
    s.setAttribute('aria-hidden', 'true');
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
    // 2) TTS: speak the powerup name using Puter.ai txt2speech.
    //    Uses a short cache key so repeated pickups of the same type don't
    //    re-synthesise. Queued internally so overlapping pickups sequence
    //    rather than clash.
    const TTS_PHRASES = {
      shield:  'Shield acquired.',
      boost:   'Boost activated.',
      magnet:  'Magnet pulling.',
      score2x: 'Double score.',
      slowmo:  'Slow motion.',
      stamina: 'Stamina refreshed.',
    };
    if (TTS_PHRASES[t]) speak(TTS_PHRASES[t], 'powerup.' + t);

    // 3) audio: synthesize the per-type tone against the shared AudioContext.
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
    if (score >=  5000) return 'A';
    if (score >=  3000) return 'B';
    if (score >=  1500) return 'C';
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
              const chipLabel = t(def.labelKey);
              chip.setAttribute('role', 'listitem');
              chip.setAttribute('aria-label', 'Active powerup: ' + chipLabel);
              chip.style.cssText = 'background:rgba(0,0,0,0.45);color:#fff;padding:4px 12px;' +
                'border-radius:999px;font-size:13px;font-weight:600;letter-spacing:1px;' +
                'border:1px solid ' + def.cssVar + ';box-shadow:0 0 10px ' + def.cssVar + '66;' +
                'backdrop-filter:blur(4px);font-family:"Stick No Bills","Anton",sans-serif;' +
                'white-space:nowrap;';
              const span = document.createElement('span');
              span.style.cssText = 'opacity:0.85;margin-left:6px;font-weight:400;';
              chip.appendChild(document.createTextNode(chipLabel));
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

  // ---- Legal consent gate for gameplay actions ----
  // Both start() and resumeRun() check if the user has accepted legal terms.
  // If not, they set a pending action and open the legal panel instead.

  function requireLegalConsent(action) {
    if (_legalConsentAccepted) return true;
    _pendingLegalAction = action;
    openLegal();
    return false;
  }

  async function doResumeRun() {
    if (!world || !_cachedSnapshot) return;
    // Start the game loop (calls resetGame internally), then restore progression
    world.startLoop(rendererObj);
    await world.loadSnapshot(_cachedSnapshot);
    _cachedSnapshot = null;
    if (resumeRunBtn) resumeRunBtn.classList.add('hidden');
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    resetExplodeSequence();
  }

  function resumeRun() {
    if (!requireLegalConsent('resume')) return;
    doResumeRun();
  }

  function doStart() {
    // Clear any existing snapshot when starting fresh
    if (world && world.deleteGameSnapshot) {
      try { world.deleteGameSnapshot(); } catch (_) {}
    }
    _cachedSnapshot = null;
    if (resumeRunBtn) resumeRunBtn.classList.add('hidden');
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
    if (marketplacePanel) marketplacePanel.classList.add('hidden');
    if (settingsPanel) settingsPanel.classList.add('hidden');
    resetExplodeSequence();
    // Update lobby status to In Game
    if (_lobbyPresence && typeof _lobbyPresence.setStatus === 'function') {
      _lobbyPresence.setStatus('In Game');
    }
    if (world && world.startLoop && rendererObj) {
      try {
        world.startLoop(rendererObj);
      } catch (e) {
        console.warn('UI start failed to call world.startLoop', e);
      }
    }
  }

  function start() {
    doStart();
  }

  function retry() {
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    start();
  }

  if (startBtn) startBtn.addEventListener('click', start);
  if (resumeRunBtn) resumeRunBtn.addEventListener('click', resumeRun);
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
  // ---- ? key toggles keyboard shortcuts overlay ----
  window.addEventListener('keydown', e => {
    if (e.key === '?' || (e.key === 'Slash' && !e.shiftKey && !e.ctrlKey && !e.metaKey)) {
      // '?' key — toggle shortcuts (both direct ? and Shift+/ produce '?')
      if (!e.shiftKey && e.key === 'Slash') return; // plain / without shift
      toggleShortcuts();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') return;
    // Priority 0: close panels if open
    if (deleteConfirmPanel && !deleteConfirmPanel.classList.contains('hidden')) {
      closeDeleteConfirm();
      e.preventDefault();
      return;
    }
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
    if (communityPowerupPanel && !communityPowerupPanel.classList.contains('hidden')) {
      closeCommunityPowerups();
      e.preventDefault();
      return;
    }
    if (profilePanel && !profilePanel.classList.contains('hidden')) {
      closeProfile();
      e.preventDefault();
      return;
    }
    if (runHistoryPanel && !runHistoryPanel.classList.contains('hidden')) {
      closeRunHistory();
      e.preventDefault();
      return;
    }
    if (finalSectorScreen && !finalSectorScreen.classList.contains('hidden')) {
      finalSectorScreen.classList.remove('active');
      finalSectorScreen.classList.add('hidden');
      finalSectorScreen.setAttribute('aria-hidden', 'true');
      e.preventDefault();
      return;
    }
    if (marketplacePanel && !marketplacePanel.classList.contains('hidden')) {
      closeMarketplace();
      e.preventDefault();
      return;
    }
    if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
      closeSettings();
      e.preventDefault();
      return;
    }
    if (shortcutsPanel && !shortcutsPanel.classList.contains('hidden')) {
      shortcutsPanel.classList.add('hidden');
      e.preventDefault();
      return;
    }
    if (legalPanel && !legalPanel.classList.contains('hidden')) {
      closeLegal();
      e.preventDefault();
      return;
    }
    if (briefingsPanel && !briefingsPanel.classList.contains('hidden')) {
      closeBriefings();
      e.preventDefault();
      return;
    }
    if (lobbyPanel && !lobbyPanel.classList.contains('hidden')) {
      closeLobby();
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
