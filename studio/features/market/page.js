/**
 * Marketplace page — launches the full MarketplaceUI in an expanded popup.
 * Imports MarketplaceAPI + MarketplaceUI from ../marketplace/ and mounts them.
 * Supports Stripe live payments via env vars, URL params, or user input.
 */

// ── Stripe config resolution ──
function resolveStripeConfig() {
  // Priority: URL params > window.__ENV__ > window globals > defaults
  const params = new URLSearchParams(window.location.search);

  const publishableKey =
    params.get('stripe_key') ||
    window.__ENV__?.STRIPE_PUBLISHABLE_KEY ||
    window.STRIPE_PUBLISHABLE_KEY ||
    null;

  const checkoutEndpoint =
    params.get('checkout_url') ||
    window.__ENV__?.CHECKOUT_ENDPOINT ||
    window.CHECKOUT_ENDPOINT ||
    null;

  const successUrl =
    params.get('stripe_success') ||
    window.__ENV__?.STRIPE_SUCCESS_URL ||
    window.location.origin + window.location.pathname + '?checkout=success';

  const cancelUrl =
    params.get('stripe_cancel') ||
    window.__ENV__?.STRIPE_CANCEL_URL ||
    window.location.origin + window.location.pathname + '?checkout=cancelled';

  return { publishableKey, checkoutEndpoint, successUrl, cancelUrl };
}

let _currentStripeConfig = resolveStripeConfig();
let _mounted = false;

const meta = {
  controls: [
    {
      key: 'launch',
      label: 'Launch Marketplace',
      type: 'button',
      onClick: async () => {
        try {
          await _launchMarketplace();
        } catch (err) {
          console.error('[Market] Launch failed:', err);
          const pc = document.getElementById('popupContent');
          if (pc) {
            pc.innerHTML = `<h2>Marketplace</h2>
              <div style="text-align:center;padding:20px;color:#ef4444;">
                <p>Failed to load marketplace.</p>
                <p style="font-size:11px;color:#888;margin-top:8px">${err.message}</p>
              </div>
              <button class="btn" onclick="document.getElementById('popupOverlay')?.classList.remove('open')">Close</button>`;
          }
        }
      },
    },
  ],
  onApply: () => {},
};

async function _launchMarketplace() {
  if (_mounted) return;
  _mounted = true;

  const popupOverlay = document.getElementById('popupOverlay');
  const popupContent = document.getElementById('popupContent');
  if (!popupOverlay || !popupContent) return;

  // Expand popup to full-screen
  popupContent.style.cssText += 'width:90vw;max-width:1200px;height:85vh;max-height:85vh;overflow-y:hidden;padding:0;';

  // Show loading state
  popupContent.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#666;">
      <i class="fas fa-store" style="font-size:40px;opacity:0.3"></i>
      <span>Loading Marketplace...</span>
    </div>`;

  try {
    // Dynamically import marketplace modules
    const [{ MarketplaceAPI }, { MarketplaceUI }] = await Promise.all([
      import('../marketplace/index.js'),
      import('../marketplace/marketplace-ui.js'),
    ]);

    // Create editorState stub for the API
    const editorState = {
      ui: {
        log: (msg, type) => {
          console.log(`[Market] ${msg}`);
          if (type === 'error') console.warn(`[Market Error] ${msg}`);
        },
      },
    };

    // Refresh config (in case URL params changed or user set globals)
    _currentStripeConfig = resolveStripeConfig();

    // Create and initialize the API with Stripe config
    const api = new MarketplaceAPI(editorState, {
      publishableKey: _currentStripeConfig.publishableKey,
      checkoutEndpoint: _currentStripeConfig.checkoutEndpoint,
      successUrl: _currentStripeConfig.successUrl,
      cancelUrl: _currentStripeConfig.cancelUrl,
    });

    // If config has keys, ensure they're applied (redundant but explicit)
    if (_currentStripeConfig.publishableKey && _currentStripeConfig.checkoutEndpoint) {
      api.configureStripe({
        publishableKey: _currentStripeConfig.publishableKey,
        checkoutEndpoint: _currentStripeConfig.checkoutEndpoint,
        successUrl: _currentStripeConfig.successUrl,
        cancelUrl: _currentStripeConfig.cancelUrl,
      });
    }

    await api.init();

    // Check final mode
    const stripeStatus = api.monetization.stripe.getStatus();
    const isLive = stripeStatus.live;

    // Clear popup and mount the UI
    popupContent.innerHTML = '';

    // ── Header bar with Stripe status + configure button ──
    const headerBar = document.createElement('div');
    headerBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:#252526;border-bottom:1px solid #333;flex-shrink:0;';

    headerBar.innerHTML = `
      <span style="font-weight:600;color:#e0e0e0;display:flex;align-items:center;gap:8px">
        <i class="fas fa-store" style="color:#60a5fa"></i> Marketplace
        <span id="stripeStatus" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:400;padding:2px 8px;border-radius:10px;${
          isLive
            ? 'background:#4ade8022;color:#4ade80;border:1px solid #4ade8044;'
            : 'background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;'
        }">
          <span style="width:6px;height:6px;border-radius:50%;background:${isLive ? '#4ade80' : '#f59e0b'}"></span>
          ${isLive ? 'LIVE' : 'SIM'}
        </span>
      </span>
      <div style="display:flex;align-items:center;gap:6px">
        <button id="stripeConfigBtn" style="background:none;border:1px solid #555;color:#aaa;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;" title="Configure Stripe">
          <i class="fas fa-key"></i> Stripe
        </button>
        <button id="marketCloseBtn" style="background:none;border:1px solid #555;color:#aaa;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px;">✕ Close</button>
      </div>`;

    // Create container for MarketplaceUI
    const uiContainer = document.createElement('div');
    uiContainer.id = 'market-ui-container';
    uiContainer.style.cssText = 'flex:1;overflow:hidden;position:relative;';

    popupContent.style.display = 'flex';
    popupContent.style.flexDirection = 'column';
    popupContent.appendChild(headerBar);
    popupContent.appendChild(uiContainer);

    // Mount the marketplace UI
    const marketplaceUI = new MarketplaceUI(api, uiContainer);
    marketplaceUI.mount();

    // ── Stripe configure button ──
    const stripeConfigBtn = document.getElementById('stripeConfigBtn');
    if (stripeConfigBtn) {
      stripeConfigBtn.addEventListener('click', () => {
        _showStripeConfigPopup(api);
      });
    }

    // ── Close button ──
    const closeBtn = document.getElementById('marketCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        try { marketplaceUI.unmount(); } catch (e) {}
        _mounted = false;
        popupContent.style.cssText =
          'background:#1e1e2e;border-radius:8px;border:1px solid #444;min-width:320px;max-width:500px;max-height:80vh;overflow-y:auto;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
        popupOverlay.classList.remove('open');
      });
    }
  } catch (err) {
    console.error('[Market] Failed to mount:', err);
    popupContent.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:40px;text-align:center;">
      <i class="fas fa-exclamation-triangle" style="font-size:36px;color:#ef4444"></i>
      <h3 style="color:#eee;margin:0">Failed to Load Marketplace</h3>
      <p style="color:#888;font-size:13px">${err.message}</p>
      <button id="marketRetryBtn" class="btn" style="max-width:200px">Retry</button>
    </div>`;
    const retryBtn = document.getElementById('marketRetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => { _mounted = false; _launchMarketplace(); });
  }
}

/**
 * Show a small inline config popup for Stripe keys.
 * Falls back to SIM mode until both fields are provided.
 */
function _showStripeConfigPopup(api) {
  const container = document.getElementById('market-ui-container');
  if (!container) return;

  // Store current view to restore later
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:100;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

  const current = resolveStripeConfig();

  overlay.innerHTML = `
    <div style="background:#1e1e2e;border:1px solid #444;border-radius:8px;padding:20px;min-width:380px;max-width:480px;">
      <h3 style="color:#eee;margin:0 0 12px;font-size:15px;"><i class="fas fa-key" style="color:#60a5fa"></i> Stripe Configuration</h3>

      <div id="stripeConfigStatus" style="margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:12px;${
        api.monetization.stripe.getStatus().live
          ? 'background:#4ade8022;color:#4ade80;border:1px solid #4ade8044;'
          : 'background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;'
      }">
        <strong>${api.monetization.stripe.getStatus().live ? '🟢 LIVE mode' : '🟡 SIMULATED mode'}</strong>
        ${api.monetization.stripe.getStatus().live
          ? '<br>Real payments are enabled. Purchases will redirect to Stripe Checkout.'
          : '<br>No real payments. Set a publishable key and endpoint to enable live mode.'}
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px">Publishable Key (pk_...)</label>
        <input id="stripeKeyInput" type="text" value="${current.publishableKey || ''}" placeholder="pk_live_..." style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:13px;font-family:monospace;">
      </div>

      <div style="margin-bottom:10px">
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px">Checkout Endpoint URL</label>
        <input id="stripeEndpointInput" type="url" value="${current.checkoutEndpoint || ''}" placeholder="https://your-api.com/create-checkout-session" style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:13px;font-family:monospace;">
      </div>

      <div style="margin-bottom:14px">
        <label style="display:block;font-size:12px;color:#aaa;margin-bottom:4px">Success URL (optional)</label>
        <input id="stripeSuccessInput" type="url" value="${current.successUrl || ''}" style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:13px;font-family:monospace;">
        <label style="display:block;font-size:12px;color:#aaa;margin:6px 0 4px">Cancel URL (optional)</label>
        <input id="stripeCancelInput" type="url" value="${current.cancelUrl || ''}" style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:13px;font-family:monospace;">
      </div>

      <div style="font-size:11px;color:#666;margin-bottom:12px;padding:8px 10px;background:#222;border-radius:4px;">
        <strong>Quick tip:</strong> You can also set these via URL params:<br>
        <code style="color:#60a5fa">?stripe_key=pk_...&checkout_url=...</code>
      </div>

      <div style="display:flex;gap:8px">
        <button id="stripeConfigSave" style="flex:1;padding:9px;border:none;border-radius:6px;background:#4a9eff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save &amp; Reload</button>
        <button id="stripeConfigCancel" style="flex:1;padding:9px;border:1px solid #555;border-radius:6px;background:transparent;color:#aaa;font-size:13px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  container.appendChild(overlay);

  // Save
  document.getElementById('stripeConfigSave').addEventListener('click', () => {
    const key = document.getElementById('stripeKeyInput').value.trim();
    const endpoint = document.getElementById('stripeEndpointInput').value.trim();
    const successUrl = document.getElementById('stripeSuccessInput').value.trim();
    const cancelUrl = document.getElementById('stripeCancelInput').value.trim();

    // Store on window globals so resolveStripeConfig() picks them up
    window.STRIPE_PUBLISHABLE_KEY = key || null;
    window.CHECKOUT_ENDPOINT = endpoint || null;
    window.__ENV__ = window.__ENV__ || {};
    window.__ENV__.STRIPE_PUBLISHABLE_KEY = key || null;
    window.__ENV__.CHECKOUT_ENDPOINT = endpoint || null;

    if (successUrl) window.__ENV__.STRIPE_SUCCESS_URL = successUrl;
    if (cancelUrl) window.__ENV__.STRIPE_CANCEL_URL = cancelUrl;

    overlay.remove();

    // Reload marketplace with new config
    try {
      api.configureStripe({
        publishableKey: key,
        checkoutEndpoint: endpoint,
        successUrl: successUrl || undefined,
        cancelUrl: cancelUrl || undefined,
      });
    } catch (e) {
      console.warn('[Market] configureStripe error:', e);
    }

    // Update status badge
    const statusBadge = document.getElementById('stripeStatus');
    if (statusBadge) {
      const isLive = api.monetization.stripe.getStatus().live;
      statusBadge.style.cssText = `display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:400;padding:2px 8px;border-radius:10px;${
        isLive
          ? 'background:#4ade8022;color:#4ade80;border:1px solid #4ade8044;'
          : 'background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;'
      }`;
      statusBadge.innerHTML = `<span style="width:6px;height:6px;border-radius:50%;background:${isLive ? '#4ade80' : '#f59e0b'}"></span> ${isLive ? 'LIVE' : 'SIM'}`;
    }

    // Update status message
    const statusMsg = document.getElementById('stripeConfigStatus');
    if (statusMsg) {
      statusMsg.innerHTML = isLive
        ? '<strong>🟢 LIVE mode</strong><br>Real payments are enabled. Purchases will redirect to Stripe Checkout.'
        : '<strong>🟡 SIMULATED mode</strong><br>No real payments. Fill in both fields above and save.';
      statusMsg.style.cssText = `margin-bottom:12px;padding:8px 12px;border-radius:6px;font-size:12px;${
        isLive
          ? 'background:#4ade8022;color:#4ade80;border:1px solid #4ade8044;'
          : 'background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b44;'
      }`;
    }
  });

  // Cancel
  document.getElementById('stripeConfigCancel').addEventListener('click', () => overlay.remove());
}

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
