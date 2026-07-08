/* game/ui.js — Refactored orchestrator
   Originally a 2,581-line monolithic file (Dec 2024). Now split into
   6 domain modules under game/ui/:
     - hud.js:     Tone synthesis, powerup chip strip
     - modals.js:  Boot, pause, game-over, explosion sequence, start/retry
     - panels.js:  Leaderboard, marketplace, community powerups, briefings, etc.
     - lobby.js:   Lobby / matchmaking, presence
     - skin-lab.js: Skin/portrait/palette generation, style chips
     - settings.js: Settings panel, overlays, cloud sync, legal, language, shortcuts

   This file remains the single public entry point (exports setupUI).
   It wires the modules together and handles cross-cutting concerns:
   the game loop (uiLoop), global keyboard handler, visibility handler,
   and quitToMenu / toggleShortcuts orchestration.
*/
import { TUNING } from './world/shared.js';
import { t } from './locale.js';

import { wireHUD } from './ui/hud.js';
import { wireModals } from './ui/modals.js';
import { wirePanels } from './ui/panels.js';
import { wireLobby } from './ui/lobby.js';
import { wireSkinLab } from './ui/skin-lab.js';
import { wireSettings } from './ui/settings.js';

export function setupUI({ world, rendererObj }) {
  const hud = wireHUD({ world });
  const modals = wireModals({ world });
  const { chipStrip, chipEls } = hud;
  const {
    start, retry, doStart, doResumeRun,
    togglePause, resumeGame, computeGrade,
    resetExplodeSequence, startExplodeSequence, skipExplodeIfRunning,
    showGameOver, showMissionSuccess,
    scoreVal, speedVal, levelVal, startScreen,
    gameOverScreen, missionSuccessScreen, explodeScreen,
    pauseScreen, bootScreen,
  } = modals;
  const panels = wirePanels({ world, rendererObj, computeGrade });
  const lobby = wireLobby({ world });
  wireSkinLab({ world });
  const settings = wireSettings({ world });

  function quitToMenu() {
    if (!world || !world.state) return;
    if (world.state.running && !world.state.over && !world.state.won && world.saveSnapshot) {
      world.saveSnapshot().catch(() => {});
    }
    world.state.paused = false;
    if (pauseScreen) pauseScreen.classList.add('hidden');
    panels.closeMarketplace();
    settings.closeSettings();
    panels.closeLeaderboard();
    const skinLabEl = document.getElementById('skinLabPanel');
    if (skinLabEl) skinLabEl.classList.add('hidden');
    panels.closeAll.forEach(fn => fn());
    if (gameOverScreen) gameOverScreen.classList.add('hidden');
    if (missionSuccessScreen) missionSuccessScreen.classList.add('hidden');
    const fss = document.getElementById('finalSectorScreen');
    const mus = document.getElementById('modelUpgradeScreen');
    if (fss) { fss.classList.remove('active'); fss.classList.add('hidden'); fss.setAttribute('aria-hidden','true'); }
    if (mus) { mus.classList.remove('active'); mus.classList.add('hidden'); mus.setAttribute('aria-hidden','true'); }
    resetExplodeSequence();
    if (chipStrip) chipStrip.innerHTML = '';
    chipEls.clear();
    if (world.state._powerups) {
      Object.keys(world.state._powerups).forEach(k => world.state._powerups[k] = 0);
    }
    lobby.setLobbyStatus('In Lobby');
    if (world.stopLoop) world.stopLoop();
    if (startScreen) startScreen.classList.remove('hidden');
    if (bootScreen) { bootScreen.classList.add('hidden'); bootScreen.style.opacity = ''; }
    world.state.running = false;
    world.state.over = false;
    world.state.won = false;
  }
  modals.setQuitToMenu(quitToMenu);

  panels.onDeleteReplay = () => {
    modals.openDeleteConfirm(() => { panels.closeAll.forEach(fn => fn()); });
  };

  let _chipLoopId = null;
  let _prevOver = false;
  let _prevWon = false;
  let _successScreenShown = false;
  let _explosionStarted = false;

  function uiLoop() {
    _chipLoopId = requestAnimationFrame(uiLoop);
    if (!world || !world.state) return;
    if (scoreVal) scoreVal.textContent = Math.floor(world.state.score || 0).toLocaleString();
    if (speedVal && world.state.speed) speedVal.textContent = Math.floor(world.state.speed) + ' km/h';
    if (levelVal) levelVal.textContent = 'SECTOR_' + String(world.state.level || 1).padStart(2, '0');
    if (world.state.over && !_prevOver && !_explosionStarted) {
      _explosionStarted = true; _prevOver = true; startExplodeSequence();
    }
    if (!world.state.over) _prevOver = false;
    if (world.state.won && !_prevWon && !_successScreenShown) {
      _successScreenShown = true; _prevWon = true; showMissionSuccess();
    }
    if (!world.state.won) _prevWon = false;
    updatePowerupChips();
  }

  function updatePowerupChips() {
    if (!world || !world.state || !world.state._powerups) return;
    const now = Date.now();
    const defs = [
      { key:'shield',labelKey:'powerup.shield',cssVar:'#66ffff' },
      { key:'boost',labelKey:'powerup.boost',cssVar:'#ffd54f' },
      { key:'magnet',labelKey:'powerup.magnet',cssVar:'#ff8ad9' },
      { key:'score2x',labelKey:'powerup.score2x',cssVar:'#8eff9a' },
      { key:'slowmo',labelKey:'powerup.slowmo',cssVar:'#a896ff' },
    ];
    for (const def of defs) {
      const expiry = world.state._powerups[def.key];
      if (expiry && expiry > now) {
        const remaining = Math.max(0, Math.ceil((expiry - now) / 1000));
        let entry = chipEls.get(def.key);
        if (!entry) {
          const el = document.createElement('div');
          el.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 12px;border-radius:12px;background:rgba(0,0,0,0.55);border:1px solid ' + def.cssVar + ';font-size:11px;color:#fff;';
          el.innerHTML = '<span style="color:' + def.cssVar + ';font-weight:700;">' + t(def.labelKey) + '</span><span class="chip-sec" style="color:rgba(255,255,255,0.6);font-size:10px;">' + remaining + 's</span>';
          if (chipStrip) chipStrip.appendChild(el);
          chipEls.set(def.key, { el });
        } else {
          const secEl = entry.el.querySelector('.chip-sec');
          if (secEl) secEl.textContent = remaining + 's';
        }
      } else {
        const entry = chipEls.get(def.key);
        if (entry && entry.el && entry.el.parentNode) {
          entry.el.parentNode.removeChild(entry.el);
          chipEls.delete(def.key);
        }
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    const key = e.key;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (key === '?') { e.preventDefault(); settings.toggleShortcuts(); return; }
    if (key === 'Escape') {
      e.preventDefault();
      const order = [
        { id:'briefingsPanel', close:()=>panels.closeBriefings() },
        { id:'lobbyPanel', close:()=>lobby.closeLobby() },
        { id:'settingsPanel', close:()=>settings.closeSettings() },
        { id:'leaderboardPanel', close:()=>panels.closeLeaderboard() },
        { id:'skinLabPanel', close:()=>{const e=document.getElementById('skinLabPanel');if(e)e.classList.add('hidden');} },
        { id:'marketplacePanel', close:()=>panels.closeMarketplace() },
        { id:'replayDetailPanel', close:()=>{const e=document.getElementById('replayDetailPanel');if(e)e.classList.add('hidden');const p=document.getElementById('replayPanel');if(p)p.classList.remove('hidden');} },
        { id:'replayPanel', close:()=>{const e=document.getElementById('replayPanel');if(e)e.classList.add('hidden');} },
        { id:'runHistoryPanel', close:()=>panels.closeRunHistory() },
        { id:'profilePanel', close:()=>panels.closeProfile() },
        { id:'communityPowerupPanel', close:()=>panels.closeCommunityPowerups() },
        { id:'legalPanel', close:()=>settings.closeLegal() },
        { id:'shortcutsPanel', close:()=>settings.toggleShortcuts() },
        { id:'pauseScreen', close:()=>resumeGame() },
        { id:'deleteConfirmPanel', close:()=>modals.closeDeleteConfirm() },
      ];
      let handled = false;
      for (const entry of order) {
        const el = document.getElementById(entry.id);
        if (el && !el.classList.contains('hidden')) { entry.close(); handled = true; break; }
      }
      if (!handled) { if (skipExplodeIf
