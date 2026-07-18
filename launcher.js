/**
 * KAMIKAZZI Suite Launcher
 * Handles app-card interactions, loading states, existence checks,
 * recently-launched tracking, and keyboard navigation.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'kamikazzi_last_launched';
  const RECENT_BADGE_CLASS = 'recent-badge';

  function $(selector, context) {
    return (context || document).querySelector(selector);
  }

  function $$(selector, context) {
    return Array.from((context || document).querySelectorAll(selector));
  }

  function setStatus(card, text, type) {
    const btn = $('.launch-btn', card);
    if (!btn) return;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = text;
    btn.classList.remove('status-error', 'status-loading');
    if (type) btn.classList.add(`status-${type}`);
  }

  function resetStatus(card) {
    const btn = $('.launch-btn', card);
    if (!btn || !btn.dataset.originalText) return;
    btn.textContent = btn.dataset.originalText;
    btn.classList.remove('status-error', 'status-loading');
  }

  function markRecent(url) {
    try {
      localStorage.setItem(STORAGE_KEY, url);
    } catch (e) {
      // Ignore storage errors in sandboxed contexts.
    }
    renderRecentBadge();
  }

  function getRecentUrl() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function removeRecentBadges() {
    $$(`.${RECENT_BADGE_CLASS}`).forEach((badge) => badge.remove());
  }

  function renderRecentBadge() {
    removeRecentBadges();
    const recentUrl = getRecentUrl();
    if (!recentUrl) return;

    const cards = $$('.app-card');
    cards.forEach((card) => {
      if (card.getAttribute('href') === recentUrl) {
        const nameEl = $('.app-name', card);
        if (!nameEl) return;
        const badge = document.createElement('span');
        badge.className = RECENT_BADGE_CLASS;
        badge.textContent = 'Last Opened';
        nameEl.appendChild(badge);
      }
    });
  }

  async function checkExists(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        // Prevent following redirects; we only care about immediate availability.
        redirect: 'manual',
      });
      clearTimeout(timeout);
      return response.ok || response.status === 0;
    } catch (e) {
      // If HEAD fails (e.g. due to CORS or file://), fall back to trying a GET.
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timeout);
        return response.ok || response.status === 0;
      } catch (e2) {
        return true; // Assume available when network checks are blocked.
      }
    }
  }

  async function openApp(card) {
    const url = card.getAttribute('href');
    if (!url) return;

    card.classList.add('booting');
    setStatus(card, 'INITIALIZING...', 'loading');

    const available = await checkExists(url);
    if (!available) {
      card.classList.remove('booting');
      setStatus(card, 'ERR: NOT FOUND', 'error');
      setTimeout(() => resetStatus(card), 2000);
      return;
    }

    markRecent(url);
    setTimeout(() => {
      window.location.assign(url);
    }, 350);
  }

  function onCardClick(event) {
    const card = event.currentTarget;
    if (card.classList.contains('booting')) return;
    event.preventDefault();
    openApp(card);
  }

  function onCardKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCardClick(event);
    }
  }

  function init() {
    const cards = $$('.app-card');
    cards.forEach((card) => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'link');
      card.addEventListener('click', onCardClick);
      card.addEventListener('keydown', onCardKeyDown);
    });

    renderRecentBadge();

    // Global keyboard shortcut: "?" opens a compact help overlay.
    document.addEventListener('keydown', (event) => {
      if (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        showHelpOverlay();
      }
    });
  }

  function showHelpOverlay() {
    if ($('#launcher-help-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'launcher-help-overlay';
    overlay.innerHTML = `
      <div class="launcher-help-panel">
        <h3>Launcher Shortcuts</h3>
        <ul>
          <li><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> — Navigate apps</li>
          <li><kbd>Enter</kbd> / <kbd>Space</kbd> — Open selected app</li>
          <li><kbd>?</kbd> — Show this help</li>
          <li><kbd>Esc</kbd> — Close this help</li>
        </ul>
        <button id="launcher-help-close">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
    $('#launcher-help-close', overlay).addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    const closeOnEsc = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    document.addEventListener('keydown', closeOnEsc);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
