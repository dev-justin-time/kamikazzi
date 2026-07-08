/* game/ui/panels.js
   Responsibility: panel-based UI components — Leaderboard, Marketplace,
   Community Powerups, Briefings, Run History, Player Profile,
   Replay Gallery, Level Fabricator.
   Extracted from the original monolithic game/ui.js.
*/
import { t } from '../locale.js';
import {
  isPuterAvailable, getUsername, getAvatarUrl, getLeaderboard,
  generateImage, getReplays, deleteReplay,
  getRunHistory, submitCommunityPowerup, getCommunityPowerups, voteCommunityPowerup,
  buildSkinPrompt, getSkinStylePresets, generateBuildingPalette,
} from '../puter-client.js';

/**
 * wirePanels — wires all panel-based UI components.
 * Returns a controller with closeAll (array of close functions)
 * and individual panel close functions for orchestration.
 * @param {object} opts - { world, rendererObj, computeGrade }
 */
export function wirePanels({ world, rendererObj, computeGrade }) {
  // ---- Utility ----
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }
  const puterAvailable = isPuterAvailable();

  // ---- Building Marketplace ----
  const marketplaceBtn = document.getElementById('marketplaceBtn');
  const marketplacePanel = document.getElementById('marketplacePanel');
  const marketplaceBody = document.getElementById('marketplaceBody');
  const marketplaceClose = document.getElementById('marketplaceClose');

  function openMarketplace() {
    if (marketplacePanel) marketplacePanel.classList.remove('hidden');
    renderMarketplace();
  }
  function closeMarketplace() {
    if (marketplacePanel) marketplacePanel.classList.add('hidden');
  }
  function renderMarketplace() {
    if (!marketplaceBody) return;
    import('../world/shared.js').then(({
      BUILDING_SKINS, getActiveBuildingSkin, setActiveBuildingSkin, isSkinUnlocked
    }) => {
      const active = getActiveBuildingSkin();
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
        html += `<div class="${cardClass}" data-skin-id="${skin.id}" ${interactive} ${activeAttr} aria-label="${skin.name}: ${skin.desc}">
          <div class="skin-swatch" style="background:linear-gradient(135deg,${skin.palette.slice(0,4).map(h => '#' + h.toString(16).padStart(6,'0')).join(',')});">🎨</div>
          <div class="skin-info">
            <div class="skin-name">${skin.name}</div>
            <div class="skin-desc">${skin.desc}</div>
          </div>
          <div class="skin-status ${statusClass}">${statusText}</div>
        </div>`;
      });
      marketplaceBody.innerHTML = html;
      marketplaceBody.querySelectorAll('.skin-card:not(.locked)').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-skin-id');
          if (id) { setActiveBuildingSkin(id); renderMarketplace(); }
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

  // ---- Leaderboard ----
  const leaderboardBtn = document.getElementById('leaderboardBtn');
  const leaderboardPanel = document.getElementById('leaderboardPanel');
  const leaderboardClose = document.getElementById('leaderboardClose');
  const leaderboardBody = document.getElementById('leaderboardBody');
  let _leaderboardPeriod = 'week';

  async function renderLeaderboard(period) {
    if (!leaderboardBody) return;
    const p = period || _leaderboardPeriod;
    _leaderboardPeriod = p;
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
        leaderboardBody.innerHTML = `<div style="text-align:center;padding:12px 0;color:rgba(152,203,255,0.6);">${p !== 'all' ? 'No scores for this period.' : 'No scores yet. Be the first!'}</div>`;
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
    leaderboardBtn.addEventListener('click', () => { leaderboardPanel.classList.remove('hidden'); renderLeaderboard(); });
  }
  if (leaderboardClose && leaderboardPanel) {
    leaderboardClose.addEventListener('click', () => leaderboardPanel.classList.add('hidden'));
  }
  if (leaderboardPanel) {
    leaderboardPanel.addEventListener('click', e => {
      const tab = e.target.closest('.lb-tab');
      if (tab) { const period = tab.getAttribute('data-period'); if (period) renderLeaderboard(period); }
    });
  }

  // ---- Community Powerup Registry ----
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

  async function openCommunityPowerups() {
    if (communityPowerupPanel) communityPowerupPanel.classList.remove('hidden');
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
      communityPowerupPanel.querySelectorAll('.cp-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      tab.classList.add('active'); tab.setAttribute('aria-selected','true');
      if (view === 'browse') {
        if (communityPowerupSubmit) communityPowerupSubmit.style.display = 'none';
        if (communityPowerupBody) communityPowerupBody.style.display = 'block';
        renderCommunityPowerups();
      } else {
        if (communityPowerupBody) communityPowerupBody.style.display = 'none';
        if (communityPowerupSubmit) communityPowerupSubmit.style.display = 'block';
      }
    });
    // Color picker handler
    communityPowerupPanel.addEventListener('click', e => {
      const colorBtn = e.target.closest('.cp-color-btn');
      if (!colorBtn || !cpColor) return;
      communityPowerupPanel.querySelectorAll('.cp-color-btn').forEach(b => b.classList.remove('selected'));
      colorBtn.classList.add('selected');
      cpColor.value = colorBtn.getAttribute('data-color') || '10092543';
    });
    // Select first color by default
    const firstColor = communityPowerupPanel.querySelector('.cp-color-btn');
    if (firstColor) firstColor.classList.add('selected');
  }
  async function doSubmitCommunityPowerup() {
    if (!cpName || !cpShape || !cpEffect || !cpColor || !cpSubmitStatus) return;
    const name = cpName.value.trim();
    if (!name) { cpSubmitStatus.textContent = 'Enter a powerup name.'; return; }
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
        cpName.value = ''; if (cpDesc) cpDesc.value = '';
      } else { cpSubmitStatus.textContent = 'Failed to submit. Try again.'; }
    } catch (_) { cpSubmitStatus.textContent = 'Failed to submit. Try again.'; }
    if (cpSubmitBtn) cpSubmitBtn.disabled = false;
  }
  if (cpSubmitBtn) cpSubmitBtn.addEventListener('click', doSubmitCommunityPowerup);
  if (cpName) cpName.addEventListener('keydown', e => { if (e.key === 'Enter' && cpSubmitBtn) cpSubmitBtn.click(); });
  if (communityPowerupBtn) communityPowerupBtn.addEventListener('click', openCommunityPowerups);
  if (communityPowerupClose) communityPowerupClose.addEventListener('click', closeCommunityPowerups);
  if (communityPowerupPanel) {
    communityPowerupPanel.addEventListener('click', e => { if (e.target === communityPowerupPanel) closeCommunityPowerups(); });
  }

  // ---- Briefings ----
  const briefingsBtn = document.getElementById('briefingsBtn');
  const briefingsPanel = document.getElementById('briefingsPanel');
  const briefingsClose = document.getElementById('briefingsClose');
  const briefingsBody = document.getElementById('briefingsBody');
  const briefingInput = document.getElementById('briefingInput');
  const briefingSend = document.getElementById('briefingSend');
  const briefingFetch = document.getElementById('briefingFetch');

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
    try { await world.sendIdeasToPuter(); } catch (_) {}
  }
  async function fetchBriefings() {
    if (!world) return;
    try { await world.fetchCommentsFromPuter(); loadBriefings(); } catch (_) {}
  }
  function openBriefings() { if (briefingsPanel) { briefingsPanel.classList.remove('hidden'); loadBriefings(); } }
  function closeBriefings() { if (briefingsPanel) briefingsPanel.classList.add('hidden'); }
  if (briefingsBtn) briefingsBtn.addEventListener('click', openBriefings);
  if (briefingsClose) briefingsClose.addEventListener('click', closeBriefings);
  if (briefingSend) briefingSend.addEventListener('click', sendBriefing);
  if (briefingFetch) briefingFetch.addEventListener('click', fetchBriefings);
  if (briefingInput) briefingInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBriefing(); });
  window.addEventListener('ideasUpdated', () => { if (briefingsPanel && !briefingsPanel.classList.contains('hidden')) loadBriefings(); });

  // ---- Run History ----
  const runHistoryBtn = document.getElementById('runHistoryBtn');
  const runHistoryPanel = document.getElementById('runHistoryPanel');
  const runHistoryClose = document.getElementById('runHistoryClose');
  const runHistoryBody = document.getElementById('runHistoryBody');

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
      history.forEach(run => {
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

  // ---- Player Profile ----
  const profileBtn = document.getElementById('profileBtn');
  const profilePanel = document.getElementById('profilePanel');
  const profileClose = document.getElementById('profileClose');
  const profileBody = document.getElementById('profileBody');

  function formatDuration(ms) {
    if (!ms || ms <= 0) return '—';
    const totalSec = ms / 1000;
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return mins > 0 ? mins + ' min ' + secs + ' s' : secs + ' s';
  }

  function buildProfileHtml(history, username, avatarUrl, computeGrade) {
    const totalRuns = history.length;
    if (!totalRuns) return '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">No runs yet. Fly a mission to build your pilot profile.</div>';
    let bestScore = 0, sumScore = 0, totalDistance = 0, wins = 0, totalTimeMs = 0, longestRunMs = 0, longestRunScore = 0;
    const gradeCounts = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    const levelReached = {};
    const recentScores = [];
    let streak = 0, maxStreak = 0;
    const chronological = [...history].reverse();
    for (const run of chronological) {
      const score = Number(run.score) || 0;
      if (score > bestScore) bestScore = score;
      sumScore += score;
      totalDistance += Number(run.distance) || 0;
      totalTimeMs += Number(run.timeMs) || 0;
      const runTime = Number(run.timeMs) || 0;
      if (runTime > longestRunMs) { longestRunMs = runTime; longestRunScore = score; }
      if (run.won) wins++;
      const grade = run.grade || computeGrade(score);
      if (grade in gradeCounts) gradeCounts[grade]++;
      const level = run.level || 1;
      levelReached[level] = (levelReached[level] || 0) + 1;
      if (run.won) { streak++; if (streak > maxStreak) maxStreak = streak; } else { streak = 0; }
    }
    for (let i = 0; i < Math.min(10, totalRuns); i++) {
      recentScores.push({ score: Number(history[i].score) || 0, won: history[i].won, isBest: (Number(history[i].score) || 0) >= bestScore && i === 0 });
    }
    const maxRecent = Math.max(...recentScores.map(s => s.score), 1);
    const avgScore = Math.round(sumScore / totalRuns);
    const winRate = ((wins / totalRuns) * 100).toFixed(1);
    const sortedLevels = Object.entries(levelReached).sort((a, b) => b[1] - a[1]);
    const mostCommonLevel = sortedLevels.length ? sortedLevels[0][0] : 1;
    const gradeOrder = ['S', 'A', 'B', 'C', 'D'];
    let avgGradeIndex = 0, totalGradeWeight = 0;
    gradeOrder.forEach((g, i) => { totalGradeWeight += (gradeCounts[g] || 0) * (i + 1); });
    if (totalRuns > 0) { const avgIdx = Math.round(totalGradeWeight / totalRuns); avgGradeIndex = Math.min(avgIdx - 1, gradeOrder.length - 1); }
    const avgGrade = gradeOrder[Math.max(0, avgGradeIndex)] || '-';
    const totalDistKm = (totalDistance / 1000).toFixed(2);
    const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" alt="${escapeHtml(username)}" />` : `<span>👤</span>`;
    const displayName = username || 'Guest Pilot';
    const firstRunTime = history[history.length - 1]?.timestamp;
    const joinDate = firstRunTime ? new Date(firstRunTime).toLocaleDateString() : '—';
    let html = `<div class="profile-header"><div class="profile-avatar">${avatarHtml}</div><div><div class="profile-name">${escapeHtml(displayName)}</div><div class="profile-meta">PILOT  ·  ${totalRuns} runs  ·  since ${joinDate}</div></div></div>`;
    html += `<div class="profile-section"><div class="profile-section-title">Performance</div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Total Missions</span><span class="profile-stat-value gold">${totalRuns}</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Best Score</span><span class="profile-stat-value gold">${bestScore.toLocaleString()} pts</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Avg Score</span><span class="profile-stat-value">${avgScore.toLocaleString()} pts</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Total Distance</span><span class="profile-stat-value">${totalDistKm} km</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Win Rate</span><span class="profile-stat-value highlight">${winRate}%</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Total Flight Time</span><span class="profile-stat-value">${formatDuration(totalTimeMs)}</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Longest Run</span><span class="profile-stat-value">${formatDuration(longestRunMs)} · ${longestRunScore.toLocaleString()} pts</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Avg Grade</span><span class="profile-stat-value highlight">${avgGrade}</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Perfect Streak</span><span class="profile-stat-value">${maxStreak} win${maxStreak !== 1 ? 's' : ''}</span></div>`;
    html += `<div class="profile-stat-row"><span class="profile-stat-label">Most Common Sector</span><span class="profile-stat-value">SECTOR_${String(mostCommonLevel).padStart(2, '0')}</span></div></div>`;
    html += `<div class="profile-section"><div class="profile-section-title">Grade Distribution</div><div class="profile-grades">${gradeOrder.map(g => `<div class="profile-grade-pill profile-grade-${g}"><span class="profile-grade-count">${gradeCounts[g] || 0}</span><span style="letter-spacing:0.06em;">${g}</span></div>`).join('')}</div></div>`;
    if (recentScores.length > 0) {
      html += `<div class="profile-section"><div class="profile-section-title">Score Trend (Last ${recentScores.length})</div><div class="profile-chart">${recentScores.map((s, i) => { const pct = Math.max(3, (s.score / maxRecent) * 100); const cls = s.isBest ? 'profile-bar new-best' : s.won ? 'profile-bar win' : 'profile-bar'; return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;"><div class="${cls}" style="height:${pct}%;" title="${s.score.toLocaleString()} pts${s.won ? ' · SUCCESS' : ''}"></div><div class="profile-bar-label">#${recentScores.length - i}</div></div>`; }).join('')}</div></div>`;
    }
    const levelEntries = sortedLevels.slice(0, 7);
    const maxLevelCount = Math.max(...levelEntries.map(([_, c]) => c), 1);
    html += `<div class="profile-section"><div class="profile-section-title">Level Reached</div><div class="profile-level-bars">${levelEntries.map(([lv, count]) => { const pct = Math.max(3, (count / maxLevelCount) * 100); return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;"><div class="profile-level-bar" style="height:${pct}%;" title="Level ${lv}: ${count}×"></div><div class="profile-level-bar-label">Lv${lv}</div></div>`; }).join('')}</div></div>`;
    return html;
  }

  async function openProfile(computeGrade) {
    if (profilePanel) profilePanel.classList.remove('hidden');
    if (!profileBody) return;
    profileBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Loading profile...</div>';
    try {
      const [history, username, avatarUrl] = await Promise.all([getRunHistory(), getUsername(), getAvatarUrl()]);
      profileBody.innerHTML = buildProfileHtml(history || [], username || 'Guest Pilot', avatarUrl, computeGrade);
    } catch (_) {
      profileBody.innerHTML = '<div style="text-align:center;padding:30px 0;color:rgba(152,203,255,0.6);font-size:12px;">Unable to load profile.</div>';
    }
  }
  function closeProfile() { if (profilePanel) profilePanel.classList.add('hidden'); }
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      if (typeof computeGrade === 'function') {
        openProfile(computeGrade);
      } else {
        openProfile(() => 'A'); // fallback grade
      }
    });
  }
  if (profileClose) profileClose.addEventListener('click', closeProfile);
  if (profilePanel) { profilePanel.addEventListener('click', e => { if (e.target === profilePanel) closeProfile(); }); }

  // ---- Replay Gallery ----
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
  // Delete confirm callback — set by ui.js
  let _onDeleteReplay = null;

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
        </div>`;
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
        const badge = r.notableReason === 'new-best' ? '⭐ NEW BEST' : r.won ? '✅ SUCCESS' : r.notableReason === 'high-score' ? '🔥 HIGH SCORE' : '';
        const thumb = r._screenshotDataUrl ? `background-image:url(${r._screenshotDataUrl});` : 'background:rgba(0,0,0,0.3);';
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
  if (replayDetailDelete) {
    replayDetailDelete.addEventListener('click', () => {
      if (_onDeleteReplay) _onDeleteReplay();
    });
  }
  window.addEventListener('replaySaved', () => {
    if (replayPanel && !replayPanel.classList.contains('hidden')) renderReplays();
  });

  // ---- Level Fabricator ----
  const lvFabBtn = document.getElementById('sg-lv-fab-btn');
  const lvFabClose = document.getElementById('sg-lv-fab-close');
  let _lfMounted = false;

  async function openLevelFabricator() {
    if (_lfMounted) return;
    _lfMounted = true;
    try {
      const { mountLevelFabricator } = await import('../level-fabricator-init.js');
      await mountLevelFabricator(world, rendererObj);
    } catch (e) { console.error("Failed to mount Level Fabricator:", e); _lfMounted = false; }
  }
  function closeLevelFabricator() {
    if (!_lfMounted) return;
    _lfMounted = false;
    import('../level-fabricator-init.js').then(({ destroyLevelFabricator }) => { destroyLevelFabricator(); }).catch(() => {});
  }
  if (lvFabBtn) lvFabBtn.addEventListener('click', openLevelFabricator);
  if (lvFabClose) lvFabClose.addEventListener('click', closeLevelFabricator);

  // ---- Return controller ----
  const closeAll = [
    closeMarketplace,
    closeCommunityPowerups,
    closeBriefings,
    closeRunHistory,
    closeProfile,
    closeReplayGallery,
    closeLevelFabricator,
    // Leaderboard and skin-lab are closed via DOM in quitToMenu
  ];

  function closeLeaderboard() {
    if (leaderboardPanel) leaderboardPanel.classList.add('hidden');
  }
  // closeSkinLab is provided externally (from ui.js)

  return {
    closeAll,
    closeMarketplace,
    closeCommunityPowerups,
    closeBriefings,
    closeRunHistory,
    closeProfile,
    closeReplayGallery,
    closeLevelFabricator,
    closeLeaderboard,
    openProfile,
    set onDeleteReplay(fn) { _onDeleteReplay = fn; },
    // Exposed for settings to call
  };
}
