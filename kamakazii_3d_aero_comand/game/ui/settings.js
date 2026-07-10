/* game/ui/settings.js
   Responsibility: Settings panel, overlay toggles, cloud sync, Puter
   login/logout, legal & compliance panel, language picker, keyboard
   shortcuts overlay.
   Extracted from the original monolithic game/ui.js.
*/
import { t, setLocale, getAvailableLocales } from '../locale.js';
import {
  isPuterAvailable, getUsername, getAvatarUrl, setCloudSyncEnabled,
  syncSettings, getSettings, speak, refreshUser,
} from '../puter-client.js';
import { setCloudStatus, initCloudRecheck, CloudState } from '../../../shared/cloud-status.js';
import { dbg } from '../dbg.js';

/**
 * wireSettings — wires settings panel, overlays, cloud sync, Puter auth,
 * legal panel, language picker, and keyboard shortcuts.
 * Returns a controller with { closeSettings, toggleShortcuts, closeLegal,
 * legalConsentAccepted }.
 */
export function wireSettings({ world, onStartLegal, onResumeLegal, onLegalConsentAccepted }) {
  const puterAvailable = isPuterAvailable();
  const OVERLAYS_KEY = 'kamikazzi_overlays_enabled';
  const CLOUD_SYNC_KEY = 'kamikazzi_cloud_sync_enabled';

  // ---- Cloud status indicator (uses shared/cloud-status.js) ----
  if (puterAvailable) {
    setCloudStatus('cloudStatusPill', CloudState.CHECKING, 'Connecting to Puter...');
    // Reveal the element on first update (initially display:none to avoid flash)
    const el = document.getElementById('cloudStatusPill');
    if (el && el.style.display === 'none') el.style.display = '';
  }

  // Wire click-to-recheck on the cloud status pill
  initCloudRecheck('cloudStatusPill', async () => {
    // User-initiated recheck: reset the puter-lib circuit breaker so the
    // next attempt actually hits the network. If the backend is still down,
    // the breaker will re-open after 3 more failures (30s window).
    try {
      const { resetCloudCircuit } = await import('../../../puter-lib.js');
      if (typeof resetCloudCircuit === 'function') resetCloudCircuit();
    } catch (_) { /* puter-client not available in some build configs */ }

    if (!puterAvailable) return;
    try {
      const username = await getUsername();
      if (username) {
        setCloudStatus('cloudStatusPill', CloudState.CONNECTED, 'Puter connected — cloud sync active');
      } else {
        setCloudStatus('cloudStatusPill', CloudState.DISCONNECTED, 'Puter not available — sign in to sync');
      }
    } catch (_) {
      setCloudStatus('cloudStatusPill', CloudState.DISCONNECTED, 'Puter unavailable — using local storage');
    }
  });

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

  // ---- DOM refs ----
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsClose = document.getElementById('settingsClose');
  const toggleOverlays = document.getElementById('toggleOverlays');
  const scanlineOverlay = document.querySelector('.scanline-overlay');
  const gridOverlay = document.querySelector('.grid-overlay');
  const toggleCloudSync = document.getElementById('toggleCloudSync');
  const userBadge = document.getElementById('userBadge');
  const puterLoginBtn = document.getElementById('puterLoginBtn');
  const legalBtn = document.getElementById('legalBtn');
  const legalPanel = document.getElementById('legalPanel');
  const legalClose = document.getElementById('legalClose');
  const legalBody = document.getElementById('legalBody');
  const legalConsentBar = document.getElementById('legalConsentBar');
  const legalConsentCheck = document.getElementById('legalConsentCheck');
  const legalConsentText = document.getElementById('legalConsentText');
  const legalAgreeBtn = document.getElementById('legalAgreeBtn');
  const shortcutsPanel = document.getElementById('shortcutsPanel');
  const shortcutsClose = document.getElementById('shortcutsClose');
  const langSelect = document.getElementById('langSelect');

  // ---- Legal consent state ----
  const LEGAL_CONSENT_KEY = 'kamikazzi_legal_consent';
  let _legalConsentAccepted = (() => {
    try { return localStorage.getItem(LEGAL_CONSENT_KEY) === 'true'; } catch (_) { return false; }
  })();
  let _puterLoginInFlight = false;

  // ---- Overlay toggle persistence ----
  function loadOverlaySetting() {
    try { const saved = localStorage.getItem(OVERLAYS_KEY); return saved === null ? true : saved === 'true'; } catch (_) { return true; }
  }
  function saveOverlaySetting(enabled) {
    try { localStorage.setItem(OVERLAYS_KEY, String(enabled)); } catch (_) {}
  }
  function setOverlaysVisible(visible) {
    if (scanlineOverlay) { scanlineOverlay.classList.toggle('overlay-visible', visible); scanlineOverlay.classList.toggle('overlay-hidden', !visible); }
    if (gridOverlay) { gridOverlay.classList.toggle('overlay-visible', visible); gridOverlay.classList.toggle('overlay-hidden', !visible); }
  }
  const overlaysEnabled = loadOverlaySetting();
  setOverlaysVisible(overlaysEnabled);
  if (toggleOverlays) {
    toggleOverlays.checked = overlaysEnabled;
    toggleOverlays.setAttribute('aria-checked', String(overlaysEnabled));
  }

  // ---- Cloud sync toggle ----
  let cloudSyncEnabled = (() => {
    try { const saved = localStorage.getItem(CLOUD_SYNC_KEY); return saved === null ? puterAvailable : saved === 'true'; } catch (_) { return puterAvailable; }
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

  // ---- Settings panel ----
  function openSettings() { if (settingsPanel) settingsPanel.classList.remove('hidden'); }
  function closeSettings() { if (settingsPanel) settingsPanel.classList.add('hidden'); }
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsPanel) { settingsPanel.addEventListener('click', e => { if (e.target === settingsPanel) closeSettings(); }); }
  if (toggleOverlays) {
    toggleOverlays.addEventListener('change', () => {
      const enabled = toggleOverlays.checked;
      toggleOverlays.setAttribute('aria-checked', String(enabled));
      setOverlaysVisible(enabled);
      saveOverlaySetting(enabled);
    });
  }
  function resetSettingsPanel() { if (settingsPanel) settingsPanel.classList.add('hidden'); }

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
    } else { userBadge.classList.add('hidden'); }
  }
  refreshUserBadge();

  window.addEventListener('puterUserReady', () => {
    refreshUserBadge();
    if (puterLoginBtn) {
      getUsername().then(name => {
        if (name) {
          puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_done</span>Cloud Synced';
          puterLoginBtn.classList.remove('highlight');
          puterLoginBtn.classList.add('puter-btn-synced');
          puterLoginBtn.classList.remove('puter-btn-disconnected');
          puterLoginBtn.setAttribute('aria-label', 'Connected to Puter as ' + name + '. Click to disconnect.');
          setCloudStatus('cloudStatusPill', CloudState.CONNECTED, 'Puter connected — cloud sync active');
        }
      });
    }
  });

  // ---- Puter login button ----
  if (puterLoginBtn) {
    puterLoginBtn.addEventListener('click', async () => {
      if (_puterLoginInFlight) return;
      _puterLoginInFlight = true;
      const existingUser = await getUsername();
      if (existingUser) {
        puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_off</span>Disconnecting...';
        puterLoginBtn.disabled = true;
        try {
          localStorage.removeItem('puterApiKey');
          await refreshUser();
          const stillUser = await getUsername();
          if (!stillUser) {
            if (userBadge) userBadge.classList.add('hidden');
            puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_sync</span>Cloud Sync';
            puterLoginBtn.classList.add('highlight', 'puter-btn-disconnected');
            puterLoginBtn.classList.remove('puter-btn-synced');
            puterLoginBtn.setAttribute('aria-label', 'Sign in with Puter for cloud sync');
            setCloudStatus('cloudStatusPill', CloudState.DISCONNECTED, 'Signed out of Puter — using local storage');
          } else {
            puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_done</span>Cloud Synced';
          }
        } catch (_) {}
        puterLoginBtn.disabled = false;
        _puterLoginInFlight = false;
        return;
      }
      puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_upload</span>Connecting...';
      puterLoginBtn.disabled = true;
      try {
        const user = await window.setPuterApiKey();
        if (user) {
          puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_done</span>Cloud Synced';
          puterLoginBtn.classList.remove('highlight');
          puterLoginBtn.classList.add('puter-btn-synced');
          puterLoginBtn.classList.remove('puter-btn-disconnected');
          puterLoginBtn.setAttribute('aria-label', 'Connected to Puter as ' + (user.username || user.name || 'Pilot') + '. Click to disconnect.');
          refreshUserBadge();
          setCloudStatus('cloudStatusPill', CloudState.CONNECTED, 'Puter connected — cloud sync active');
        } else {
          puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_sync</span>Cloud Sync';
          puterLoginBtn.setAttribute('aria-label', 'Sign in with Puter for cloud sync');
          setCloudStatus('cloudStatusPill', CloudState.DISCONNECTED, 'Puter not available — using local storage');
        }
      } catch (e) {
        dbg.warn('Puter login failed:', e);
        puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_off</span>Sync Failed';
        setCloudStatus('cloudStatusPill', CloudState.DISCONNECTED, 'Puter sync failed — try again');
        setTimeout(() => {
          puterLoginBtn.innerHTML = '<span class="menu-btn-icon material-symbols-outlined" aria-hidden="true">cloud_sync</span>Cloud Sync';
          puterLoginBtn.setAttribute('aria-label', 'Sign in with Puter for cloud sync');
        }, 2500);
      }
      puterLoginBtn.disabled = false;
      _puterLoginInFlight = false;
    });
  }

  // User badge click
  if (userBadge) {
    userBadge.addEventListener('click', async () => {
      const username = await getUsername();
      if (username) { userBadge.classList.add('user-badge-fade'); setTimeout(() => { userBadge.classList.remove('user-badge-fade'); }, 200); }
    });
    userBadge.classList.add('interactive');
  }

  // ---- Legal & Compliance panel ----
  function buildLegalHtml() {
    const sections = [
      { id: 'age', title: 'legal.section.age.title', icon: '🔞',
        content: `<p><span class="legal-highlight age">${t('legal.section.age.required')}</span></p><p>${t('legal.section.age.body')}</p>` },
      { id: 'privacy', title: 'legal.section.privacy.title', icon: '🔒',
        content: `<p>${t('legal.section.privacy.intro')}</p><p><strong>${t('legal.section.privacy.collect')}</strong></p><p>${t('legal.section.privacy.collect.body')}</p><p><strong>${t('legal.section.privacy.use')}</strong></p><p>${t('legal.section.privacy.use.body')}</p><p><strong>${t('legal.section.privacy.retention')}</strong></p><p>${t('legal.section.privacy.retention.body')}</p><p><strong>${t('legal.section.privacy.rights')}</strong></p><p>${t('legal.section.privacy.rights.body')}</p>` },
      { id: 'terms', title: 'legal.section.terms.title', icon: '📜',
        content: `<p><strong>${t('legal.section.terms.license')}</strong></p><p>${t('legal.section.terms.license.body')}</p><p><strong>${t('legal.section.terms.conduct')}</strong></p><p>${t('legal.section.terms.conduct.body')}</p><p><strong>${t('legal.section.terms.liability')}</strong></p><p>${t('legal.section.terms.liability.body')}</p><p><strong>${t('legal.section.terms.termination')}</strong></p><p>${t('legal.section.terms.termination.body')}</p><p><strong>${t('legal.section.terms.governing')}</strong></p><p>${t('legal.section.terms.governing.body')}</p>` },
      { id: 'compliance', title: 'legal.section.compliance.title', icon: '🛡️',
        content: `<p><span class="legal-highlight compliance">CCPA</span> <span class="legal-highlight compliance" style="margin-left:4px;">GDPR</span> <span class="legal-highlight compliance" style="margin-left:4px;">COPPA</span></p><p><strong>${t('legal.section.compliance.ccpa')}</strong></p><p>${t('legal.section.compliance.ccpa.body')}</p><p><strong>${t('legal.section.compliance.gdpr')}</strong></p><p>${t('legal.section.compliance.gdpr.body')}</p><p><strong>${t('legal.section.compliance.coppa')}</strong></p><p>${t('legal.section.compliance.coppa.body')}</p>` },
      { id: 'licensing', title: 'legal.section.licensing.title', icon: '©️',
        content: `<p><span class="legal-highlight copyright">${t('legal.section.licensing.copyright').slice(0, 4)}</span></p><p><strong>${t('legal.section.licensing.puter')}</strong></p><p>${t('legal.section.licensing.puter.body')}</p><p><strong>${t('legal.section.licensing.copyright')}</strong></p><p>${t('legal.section.licensing.copyright.body')}</p><p><strong>${t('legal.section.licensing.thirdparty')}</strong></p><p>${t('legal.section.licensing.thirdparty.body')}</p>` },
    ];
    let html = '';
    for (const sec of sections) {
      html += `<div class="legal-section" data-legal-section="${sec.id}">
        <div class="legal-section-title" role="button" tabindex="0" aria-expanded="false" aria-label="${sec.title}">
          <span>${sec.icon} ${sec.title}</span><span class="legal-arrow">▶</span>
        </div>
        <div class="legal-section-content" role="region" aria-label="${sec.title} content">${sec.content}</div>
      </div>`;
    }
    html += `<div class="legal-footer">${t('legal.consent')}</div>`;
    return html;
  }

  function openLegal() {
    if (!legalPanel) return;
    legalPanel.classList.remove('hidden');
    if (!legalBody) return;
    if (!legalBody.getAttribute('data-built')) {
      legalBody.setAttribute('data-built', 'true');
      legalBody.innerHTML = buildLegalHtml();
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
      legalBody.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          const title = e.target.closest('.legal-section-title');
          if (title) { e.preventDefault(); title.click(); }
        }
      });
    }
    if (legalConsentBar) {
      if (!_legalConsentAccepted) {
        legalConsentBar.classList.remove('hidden');
        if (legalConsentCheck) legalConsentCheck.checked = false;
        if (legalAgreeBtn) legalAgreeBtn.disabled = true;
      } else { legalConsentBar.classList.add('hidden'); }
    }
  }

  function closeLegal() {
    if (legalPanel) legalPanel.classList.add('hidden');
  }

  // Legal consent wiring
  if (legalConsentText) legalConsentText.textContent = t('legal.consent.checkbox');
  if (legalAgreeBtn) legalAgreeBtn.textContent = t('legal.consent.agree');
  if (legalConsentCheck && legalAgreeBtn) {
    legalConsentCheck.addEventListener('change', () => { legalAgreeBtn.disabled = !legalConsentCheck.checked; });
  }
  if (legalAgreeBtn) {
    legalAgreeBtn.addEventListener('click', () => {
      if (legalConsentCheck && !legalConsentCheck.checked) return;
      try { localStorage.setItem(LEGAL_CONSENT_KEY, 'true'); } catch (_) {}
      _legalConsentAccepted = true;
      if (legalConsentBar) legalConsentBar.classList.add('hidden');
      // Notify modals so the start/resume flow can proceed without re-opening legal
      if (typeof onLegalConsentAccepted === 'function') onLegalConsentAccepted();
    });
  }

  if (legalBtn) legalBtn.addEventListener('click', openLegal);
  if (legalClose) legalClose.addEventListener('click', closeLegal);
  if (legalPanel) { legalPanel.addEventListener('click', e => { if (e.target === legalPanel) closeLegal(); }); }

  // ---- Keyboard shortcuts overlay ----
  function toggleShortcuts() {
    if (!shortcutsPanel) return;
    const isOpen = !shortcutsPanel.classList.contains('hidden');
    if (isOpen) { shortcutsPanel.classList.add('hidden'); }
    else {
      // Close other panels
      if (document.getElementById('leaderboardPanel')) document.getElementById('leaderboardPanel').classList.add('hidden');
      if (document.getElementById('skinLabPanel')) document.getElementById('skinLabPanel').classList.add('hidden');
      if (document.getElementById('marketplacePanel')) document.getElementById('marketplacePanel').classList.add('hidden');
      if (document.getElementById('settingsPanel')) document.getElementById('settingsPanel').classList.add('hidden');
      if (document.getElementById('replayPanel')) document.getElementById('replayPanel').classList.add('hidden');
      if (document.getElementById('replayDetailPanel')) document.getElementById('replayDetailPanel').classList.add('hidden');
      if (document.getElementById('runHistoryPanel')) document.getElementById('runHistoryPanel').classList.add('hidden');
      if (document.getElementById('profilePanel')) document.getElementById('profilePanel').classList.add('hidden');
      if (document.getElementById('briefingsPanel')) document.getElementById('briefingsPanel').classList.add('hidden');
      if (document.getElementById('communityPowerupPanel')) document.getElementById('communityPowerupPanel').classList.add('hidden');
      if (document.getElementById('lobbyPanel')) document.getElementById('lobbyPanel').classList.add('hidden');
      closeLegal();
      shortcutsPanel.classList.remove('hidden');
    }
  }

  if (shortcutsClose) shortcutsClose.addEventListener('click', () => { if (shortcutsPanel) shortcutsPanel.classList.add('hidden'); });
  if (shortcutsPanel) { shortcutsPanel.addEventListener('click', e => { if (e.target === shortcutsPanel) shortcutsPanel.classList.add('hidden'); }); }

  // ---- Language picker ----
  if (langSelect) {
    import('../locale.js').then(mod => {
      const locales = mod.getAvailableLocales();
      langSelect.innerHTML = locales.map(l => `<option value="${l.code}">${l.flag} ${l.nativeName}</option>`).join('');
      langSelect.value = mod.getLocale();
      langSelect.addEventListener('change', () => mod.setLocale(langSelect.value));
    });
  }
  window.addEventListener('localeChanged', () => {
    import('../locale.js').then(mod => { if (langSelect) langSelect.value = mod.getLocale(); });
  });

  // ---- Settings cloud sync ----
  async function saveSettingsToCloud() {
    try {
      const settings = { overlaysEnabled: loadOverlaySetting(), cloudSyncEnabled: cloudSyncEnabled, lastSaved: Date.now() };
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
          if (toggleOverlays) { toggleOverlays.checked = cloudSettings.overlaysEnabled; toggleOverlays.setAttribute('aria-checked', String(cloudSettings.overlaysEnabled)); }
        }
        if (typeof cloudSettings.cloudSyncEnabled === 'boolean') {
          cloudSyncEnabled = cloudSettings.cloudSyncEnabled;
          setCloudSyncEnabled(cloudSyncEnabled);
          if (toggleCloudSync) { toggleCloudSync.checked = cloudSyncEnabled; toggleCloudSync.setAttribute('aria-checked', String(cloudSyncEnabled)); }
        }
      }
    } catch (_) {}
  }
  loadSettingsFromCloud();
  if (toggleOverlays) toggleOverlays.addEventListener('change', () => { saveSettingsToCloud(); });
  if (toggleCloudSync) toggleCloudSync.addEventListener('change', () => { saveSettingsToCloud(); });

  return {
    closeSettings,
    resetSettingsPanel,
    toggleShortcuts,
    closeLegal,
    get legalConsentAccepted() { return _legalConsentAccepted; },
  };
}
