/* game/ui/modals.js
   Responsibility: boot sequence, pause menu, start/game-over/mission-success
   screens, explosion sequence, final sector / model upgrade announcements,
   delete confirmation, start/retry/resume functions, computeGrade.
   Extracted from the original monolithic game/ui.js.
*/
import { EXPLODE_GIF_URL, CRASH_KEYFRAMES, CRASH_TOTAL_PLAYS } from '../world/shared.js';
import { t } from '../locale.js';
import { loadGameSnapshot, speak } from '../puter-client.js';

/**
 * Shared legal consent state — set externally by ui.js so that
 * modals.js and settings.js share the same flag.
 */
let _legalConsentAccepted = false;
let _pendingLegalAction = null;

/** Set by ui.js to sync legal consent from settings module */
export function setLegalConsent(accepted) { _legalConsentAccepted = accepted; }
export function getLegalConsent() { return _legalConsentAccepted; }
export function setPendingLegalAction(action) { _pendingLegalAction = action; }
export function getPendingLegalAction() { return _pendingLegalAction; }

/**
 * wireModals — wires all modal/dialog screens and game-flow functions.
 * Returns a controller object with { start, retry, doStart, doResumeRun,
 * togglePause, resumeGame, skipExplodeIfRunning, showGameOver,
 * showMissionSuccess, resetExplodeSequence, startExplodeSequence,
 * computeGrade, quitToMenuPlaceholder }.
 *
 * Note: quitToMenu is defined externally in ui.js since it orchestrates
 * across multiple modules (panels, lobby, HUD). A placeholder is
 * provided that can be set by ui.js.
 */
export function wireModals({ world }) {
  // ---- DOM refs ----
  const scoreVal = document.getElementById('scoreVal');
  const speedVal = document.getElementById('speedVal');
  const levelVal = document.getElementById('levelVal');
  const startScreen = document.getElementById('startScreen');
  const explodeScreen = document.getElementById('explodeScreen');
  const explodeImg = document.getElementById('explodeImg');
  const gameOverScreen = document.getElementById('gameOver');
  const startBtn = document.getElementById('startBtn');
  const retryBtn = document.getElementById('retryBtn');

  // Mission Terminated telemetry
  const mtScore = document.getElementById('mtScore');
  const mtBest = document.getElementById('mtBest');
  const mtSector = document.getElementById('mtSector');
  const mtDistance = document.getElementById('mtDistance');
  const mtAlt = document.getElementById('mtAlt');
  const mtThrottle = document.getElementById('mtThrottle');
  const mtReason = document.getElementById('mtReason');
  const mtElapsed = document.getElementById('mtElapsed');
  const abortBtn = document.getElementById('abortBtn');

  // Mission Success telemetry
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

  // Boot screen
  const bootScreen = document.getElementById('bootScreen');
  const bootStatus = document.getElementById('bootStatus');
  const bootBar = document.getElementById('bootBar');
  const bootPct = document.getElementById('bootPct');
  const BOOT_SEGMENTS = 16;
  const bootStepKeys = ['boot.step0','boot.step1','boot.step2','boot.step3','boot.step4','boot.step5','boot.step6','boot.step7','boot.step8','boot.step9'];

  // Pause menu
  const pauseScreen = document.getElementById('pauseScreen');
  const resumeBtn = document.getElementById('resumeBtn');
  const pauseRetryBtn = document.getElementById('pauseRetryBtn');
  const quitBtn = document.getElementById('quitBtn');

  // Final Sector / Model Upgrade
  const finalSectorScreen = document.getElementById('finalSectorScreen');
  const modelUpgradeScreen = document.getElementById('modelUpgradeScreen');

  // Delete confirmation
  const deleteConfirmPanel = document.getElementById('deleteConfirmPanel');
  const deleteConfirmOk = document.getElementById('deleteConfirmOk');
  const deleteConfirmCancel = document.getElementById('deleteConfirmCancel');

  // Resume Run
  const resumeRunBtn = document.getElementById('resumeRunBtn');
  let _cachedSnapshot = null;

  // ---- Boot sequence ----
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
        if (bootScreen) bootScreen.classList.add('boot-done');
        setTimeout(() => {
          if (bootScreen) {
            bootScreen.classList.remove('boot-fade');
            void bootScreen.offsetWidth;
            bootScreen.classList.add('boot-fade');
            setTimeout(() => { bootScreen.classList.add('hidden'); bootScreen.classList.remove('boot-fade'); }, 600);
          }
        }, 400);
      }
    }
    tick();
  }
  runBootSequence();

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



  // ---- Final Sector announcement ----
  window.addEventListener('finalSector', () => {
    if (!finalSectorScreen) return;
    finalSectorScreen.classList.remove('hidden');
    finalSectorScreen.removeAttribute('aria-hidden');
    void finalSectorScreen.offsetWidth;
    finalSectorScreen.classList.add('active');
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

  // ---- Pause menu wiring ----
  function togglePause() {
    if (!world || !world.state) return;
    if (world.state.over) return;
    if (!world.state.running) return;
    world.state.paused = !world.state.paused;
    if (world.state.paused) {
      if (pauseScreen) pauseScreen.classList.remove('hidden');
      if (world.saveSnapshot) world.saveSnapshot().catch(() => {});
    } else {
      if (pauseScreen) pauseScreen.classList.add('hidden');
    }
  }
  function resumeGame() {
    if (!world || !world.state) return;
    world.state.paused = false;
    if (pauseScreen) pauseScreen.classList.add('hidden');
  }

  // ---- computeGrade ----
  function computeGrade(score) {
    const s = Number(score) || 0;
    if (s >= 10000) return 'S';
    if (s >= 5000) return 'A';
    if (s >= 3000) return 'B';
    if (s >= 1500) return 'C';
    return 'D';
  }

  // ---- Explosion sequence ----
  let _explodeStep = 0;
  let _explodeTimeout = null;
  let _isExploding = false;

  function resetExplodeSequence() {
    _explodeStep = 0;
    _isExploding = false;
    if (_explodeTimeout) { clearTimeout(_explodeTimeout); _explodeTimeout = null; }
    if (explodeScreen) {
      explodeScreen.classList.add('hidden');
      explodeScreen.classList.remove('active');
    }
  }

  function startExplodeSequence() {
    if (_isExploding) return;
    _isExploding = true;
    _explodeStep = 0;
    playExplodeStep();
  }

  function playExplodeStep() {
    if (_explodeStep >= CRASH_TOTAL_PLAYS) {
      // Done — show game over
      _isExploding = false;
      showGameOver();
      return;
    }
    if (!explodeScreen || !explodeImg) return;
    // Cache-bust the GIF src so each play restarts from frame 0
    const gifUrl = EXPLODE_GIF_URL + '?t=' + Date.now() + '_' + _explodeStep;
    explodeImg.src = gifUrl;
    explodeScreen.classList.remove('hidden');
    void explodeScreen.offsetWidth;
    explodeScreen.classList.add('active');
    _explodeTimeout = setTimeout(() => {
      explodeScreen.classList.remove('active');
      _explodeStep++;
      // Gap between plays
      const gap = CRASH_KEYFRAMES && CRASH_KEYFRAMES.length > _explodeStep
        ? CRASH_KEYFRAMES[_explodeStep].end
        : 1800;
      _explodeTimeout = setTimeout(playExplodeStep, gap);
    }, 1700);
  }

  function skipExplodeIfRunning() {
    if (!_isExploding) return false;
    _isExploding = false;
    if (_explodeTimeout) { clearTimeout(_explodeTimeout); _explodeTimeout = null; }
    if (explodeScreen) {
      explodeScreen.classList.remove('active');
      explodeScreen.classList.add('hidden');
    }
    // Clear any 3D burst staggers
    if (world && world.clearBurstStaggers) world.clearBurstStaggers();
    showGameOver();
    return true;
  }

  function showGameOver() {
    if (gameOverScreen) {
      gameOverScreen.classList.remove('hidden');
      // Populate telemetry
      if (mtScore && world) mtScore.textContent = Number(world.state.score).toLocaleString();
      if (mtBest) mtBest.textContent = Number(localStorage.getItem('kamikazziHiScore') || 0).toLocaleString();
      if (mtSector && world) mtSector.textContent = 'SECTOR_' + String(world.state.level || 1).padStart(2, '0');
      if (mtDistance && world) mtDistance.textContent = ((world.state.distance || 0) / 1000).toFixed(2) + ' km';
      if (mtAlt && world) mtAlt.textContent = (world.state.altitude || 0).toFixed(1) + 'm';
      if (mtThrottle && world) mtThrottle.textContent = (world.state.throttle || 1).toFixed(1) + 'x';
      if (mtReason && world) {
        const reason = world.state.terminationReason || 'Unknown';
        mtReason.textContent = reason;
      }
      if (mtElapsed && world) {
        const elapsed = world.state.elapsedMs || 0;
        mtElapsed.textContent = (elapsed / 1000).toFixed(1) + 's';
      }
    }
  }

  function showMissionSuccess() {
    if (missionSuccessScreen) {
      missionSuccessScreen.classList.remove('hidden');
      if (msScore && world) msScore.textContent = Number(world.state.score).toLocaleString();
      if (msBest) msBest.textContent = Number(localStorage.getItem('kamikazziHiScore') || 0).toLocaleString();
      if (msSector && world) msSector.textContent = 'SECTOR_' + String(world.state.level || 1).padStart(2, '0');
      if (msDistance && world) msDistance.textContent = ((world.state.distance || 0) / 1000).toFixed(2) + ' km';
      if (msAlt && world) msAlt.textContent = (world.state.altitude || 0).toFixed(1) + 'm';
      if (msThrottle && world) msThrottle.textContent = (world.state.throttle || 1).toFixed(1) + 'x';
      if (msStatus && world) msStatus.textContent = world.state.won ? '✅ SUCCESS' : '💥 CRASH';
      if (msElapsed && world) {
        const elapsed = world.state.elapsedMs || 0;
        msElapsed.textContent = (elapsed / 1000).toFixed(1) + 's';
      }
      if (msGrade && world) msGrade.textContent = computeGrade(world.state.score);
    }
  }

  // ---- Game flow functions ----
  let _quitToMenuFn = null; // set by ui.js

  function setQuitToMenu(fn) { _quitToMenuFn = fn; }

  function doStart() {
    if (!world) return;
    // Clear snapshot
    _cachedSnapshot = null;
    if (resumeRunBtn) resumeRunBtn.classList.add('hidden');
    // Hide all screens
    if (explodeScreen) { explodeScreen.classList.remove('active'); explodeScreen.classList.add('hidden'); }
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    if (finalSectorScreen) { finalSectorScreen.classList.remove('active'); finalSectorScreen.classList.add('hidden'); }
    if (modelUpgradeScreen) { modelUpgradeScreen.classList.remove('active'); modelUpgradeScreen.classList.add('hidden'); }
    resetExplodeSequence();
    if (startScreen) startScreen.classList.add('hidden');
    world.state.running = true;
    world.state.over = false;
    world.state.won = false;
    if (world.startLoop) world.startLoop();
  }

  function doResumeRun() {
    if (!world || !_cachedSnapshot) return;
    // Hide screens
    if (explodeScreen) { explodeScreen.classList.remove('active'); explodeScreen.classList.add('hidden'); }
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    if (startScreen) startScreen.classList.add('hidden');
    resetExplodeSequence();
    // Apply snapshot
    world.state.score = _cachedSnapshot.score || 0;
    world.state.level = _cachedSnapshot.level || 1;
    world.state.distance = _cachedSnapshot.distance || 0;
    // ... other snapshot fields applied by world
    world.state.running = true;
    world.state.over = false;
    world.state.won = false;
    if (world.startLoop) world.startLoop();
    if (resumeRunBtn) resumeRunBtn.classList.add('hidden');
    _cachedSnapshot = null;
  }

  function start() {
    if (!_legalConsentAccepted && _pendingLegalAction === null) {
      // Signal that we need consent before starting
      setPendingLegalAction('start');
      // Open the legal panel
      const legalPanel = document.getElementById('legalPanel');
      if (legalPanel && legalPanel.classList.contains('hidden')) {
        const legalBtn = document.getElementById('legalBtn');
        if (legalBtn) legalBtn.click();
      }
      return;
    }
    _pendingLegalAction = null;
    doStart();
  }

  function retry() {
    if (!world) return;
    world.state.over = false;
    world.state.won = false;
    resetExplodeSequence();
    // Also reset powerups
    if (world.state._powerups) {
      Object.keys(world.state._powerups).forEach(k => world.state._powerups[k] = 0);
    }
    doStart();
  }

  function resumeRun() {
    if (!_legalConsentAccepted && _pendingLegalAction === null) {
      setPendingLegalAction('resume');
      const legalPanel = document.getElementById('legalPanel');
      if (legalPanel && legalPanel.classList.contains('hidden')) {
        const legalBtn = document.getElementById('legalBtn');
        if (legalBtn) legalBtn.click();
      }
      return;
    }
    _pendingLegalAction = null;
    doResumeRun();
  }

  // ---- Delete confirmation wiring ----
  let _onDeleteConfirm = null;

  function openDeleteConfirm(onConfirm) {
    _onDeleteConfirm = onConfirm;
    if (deleteConfirmPanel) deleteConfirmPanel.classList.remove('hidden');
  }
  function closeDeleteConfirm() {
    if (deleteConfirmPanel) deleteConfirmPanel.classList.add('hidden');
    _onDeleteConfirm = null;
  }
  if (deleteConfirmOk) {
    deleteConfirmOk.addEventListener('click', () => {
      closeDeleteConfirm();
      if (typeof _onDeleteConfirm === 'function') _onDeleteConfirm();
    });
  }
  if (deleteConfirmCancel) deleteConfirmCancel.addEventListener('click', closeDeleteConfirm);
  if (deleteConfirmPanel) {
    deleteConfirmPanel.addEventListener('click', e => {
      if (e.target === deleteConfirmPanel) closeDeleteConfirm();
    });
  }

  // ---- Button wiring ----
  if (abortBtn) abortBtn.addEventListener('click', () => { if (_quitToMenuFn) _quitToMenuFn(); });
  if (successRetryBtn) successRetryBtn.addEventListener('click', retry);
  if (successQuitBtn) successQuitBtn.addEventListener('click', () => { if (_quitToMenuFn) _quitToMenuFn(); });
  if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
  if (pauseRetryBtn) pauseRetryBtn.addEventListener('click', () => { resumeGame(); retry(); });
  if (quitBtn) quitBtn.addEventListener('click', () => { if (_quitToMenuFn) _quitToMenuFn(); });
  if (startBtn) startBtn.addEventListener('click', start);
  if (retryBtn) retryBtn.addEventListener('click', retry);
  if (resumeRunBtn) resumeRunBtn.addEventListener('click', resumeRun);

  return {
    start,
    retry,
    doStart,
    doResumeRun,
    togglePause,
    resumeGame,
    computeGrade,
    resetExplodeSequence,
    startExplodeSequence,
    skipExplodeIfRunning,
    showGameOver,
    showMissionSuccess,
    openDeleteConfirm,
    closeDeleteConfirm,
    setQuitToMenu,
    get pendingLegal() { return _pendingLegalAction; },
    get cachedSnapshot() { return _cachedSnapshot; },
    get isExploding() { return _isExploding; },
    // DOM refs for HUD loop
    scoreVal, speedVal, levelVal, startScreen,
    gameOverScreen, missionSuccessScreen, explodeScreen,
    pauseScreen,
    bootScreen,
  };
}
