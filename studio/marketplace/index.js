/**
 * Kamakazii Studio 3D — Marketplace Module Barrel
 *
 * Exports all marketplace systems as a cohesive module.
 * Usage:
 *   import { MarketplaceAPI, PluginRegistry, AssetBundler, etc. } from './marketplace/index.js';
 *
 * For standalone use:
 *   const { marketplace } = await import('./marketplace/index.js');
 *   marketplace.init(editorState);
 */

export { PluginRegistry } from './PluginRegistry.js';
export { AssetBundler } from './AssetBundler.js';
export { LicenseManager } from './LicenseManager.js';
export { MonetizationEngine } from './MonetizationEngine.js';
export { CreatorPortal } from './CreatorPortal.js';
export { MarketplaceStore } from './MarketplaceStore.js';
export { StripeBridge } from './StripeBridge.js';

/**
 * MarketAPI — High-level facade that wires all subsystems together.
 *
 * This is the main entry point for integrating the marketplace into the editor.
 * Instantiate once with `editorState`, then use the unified API surface.
 */
export class MarketplaceAPI {
  constructor(editorState, stripeOptions = {}) {
    this.editor = editorState;

    // Subsystems — pass stripeOptions to MonetizationEngine for StripeBridge
    this.plugins = new PluginRegistry(editorState);
    this.assets = new AssetBundler(editorState);
    this.licenses = new LicenseManager(editorState);
    this.monetization = new MonetizationEngine(editorState, stripeOptions);
    this.store = new MarketplaceStore(editorState, this.monetization);
    this.creator = new CreatorPortal(editorState, this.store, this.monetization);

    // Wire CreatorPortal to MonetizationEngine for earnings tracking
    this._wireSubsystems();

    // Stats
    this._startedAt = Date.now();
    this._initCount = 0;
  }

  /**
   * Configure Stripe payment integration after construction.
   * Useful when loading config asynchronously (e.g., from an API or env vars).
   *
   * @param {Object} opts
   * @param {string} opts.publishableKey  — Stripe pk_... key
   * @param {string} opts.checkoutEndpoint — Backend /create-checkout-session URL
   * @param {string} [opts.successUrl]    — Redirect URL on success
   * @param {string} [opts.cancelUrl]     — Redirect URL on cancel
   */
  configureStripe(opts = {}) {
    const bridge = this.monetization.stripe;
    bridge.publishableKey = opts.publishableKey || bridge.publishableKey;
    bridge.checkoutEndpoint = opts.checkoutEndpoint || bridge.checkoutEndpoint;
    if (opts.successUrl) bridge.successUrl = opts.successUrl;
    if (opts.cancelUrl) bridge.cancelUrl = opts.cancelUrl;

    // Re-detect mode
    bridge.mode = bridge._detectMode();

    console.log(`[MarketplaceAPI] Stripe configured: ${bridge.mode === 'live' ? 'LIVE' : 'SIMULATED'} mode`);
    return bridge.getStatus();
  }

  /**
   * Check if Stripe is in live (real payment) mode
   */
  get isPaymentLive() {
    return this.monetization.stripe.getStatus().live;
  }

  _wireSubsystems() {
    // When a checkout completes, grant entitlement
    const originalConfirm = this.monetization.confirmPayment.bind(this.monetization);
    this.monetization.confirmPayment = async (sessionId) => {
      const result = await originalConfirm(sessionId);
      if (result.success && result.transaction) {
        // Grant license entitlement to the user
        this.licenses.grantEntitlement(
          result.transaction.productId,
          result.transaction.tier === 'free' ? 'free' : 'commercial',
          { metadata: { transactionId: result.transaction.id } }
        );
      }
      return result;
    };

    // Wire early return for free items
    const originalCheckout = this.monetization.createCheckout.bind(this.monetization);
    this.monetization.createCheckout = async (product, tierId, options) => {
      if (product.price === 0 || tierId === 'free') {
        // Free items get instant grant
        this.licenses.grantEntitlement(product.id || product.title, 'free');
        this.store.products.get(product.id).downloadCount++;
        return {
          success: true,
          session: {
            id: `free_${Date.now()}`,
            productId: product.id,
            status: 'completed',
            completedAt: Date.now(),
            total: 0,
            free: true
          },
          transaction: {
            id: `tx_free_${Date.now()}`,
            productId: product.id,
            status: 'completed',
            amount: 0,
            free: true
          }
        };
      }
      return originalCheckout(product, tierId, options);
    };
  }

  /**
   * Initialize subsystems in order
   */
  async init() {
    this._initCount++;

    // Handle Stripe Checkout return (user redirected back after payment)
    this.handlePaymentReturn();

    const pluginsLoaded = this.plugins.getInstalled().length;
    const storeProducts = Array.from(this.store.products.values()).length;

    console.log(`[MarketplaceAPI] Initialized (v1.0.0) — ${pluginsLoaded} plugins, ${storeProducts} products in store`);
    return {
      plugins: pluginsLoaded,
      products: storeProducts
    };
  }

  /**
   * Handle return from Stripe Checkout redirect.
   * Detects success/cancelled params in URL and finalizes the pending transaction.
   * Call this on app init (or page load after Stripe redirect).
   */
  handlePaymentReturn() {
    const result = this.monetization.stripe.checkUrlForPaymentResult();

    if (result.result === 'success') {
      // Find the most recent pending live session and confirm it
      const pending = this.monetization.transactions
        .filter(t => t.live && t.status === 'pending')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

      if (pending) {
        this.monetization.confirmPayment(pending.id, {
          stripePaymentIntentId: result.paymentIntent || null
        }).then(confirmResult => {
          if (confirmResult.success) {
            console.log(`[MarketplaceAPI] Stripe payment finalized for: ${pending.productTitle}`);
            // Clean URL params
            const url = new URL(window.location);
            url.searchParams.delete('checkout');
            url.searchParams.delete('payment_intent');
            url.searchParams.delete('payment_intent_client_secret');
            window.history.replaceState({}, '', url);
          }
        }).catch(err => {
          console.warn('[MarketplaceAPI] Failed to finalize Stripe payment:', err);
        });
      }
    } else if (result.result === 'cancelled') {
      console.log('[MarketplaceAPI] Stripe checkout was cancelled by user');
      // Clean URL params
      const url = new URL(window.location);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url);
    }
  }

  /**
   * Get a comprehensive dashboard of the entire marketplace
   */
  getDashboard() {
    return {
      store: this.store.getCategories(),
      stats: this.monetization.getMarketplaceStats(),
      trending: this.store.getTrending(),
      featured: this.store.getFeatured(),
      newReleases: this.store.getNewReleases(),
      plugins: this.plugins.getInstalled().length,
      creatorStats: this.creator.getDashboardStats()
    };
  }

  /**
   * Search everything (products, plugins) with unified query
   */
  unifiedSearch(query, filters = {}) {
    const productResults = this.store.search(query, filters);
    return productResults;
  }

  /**
   * Serialize all subsystem state for save/restore
   */
  serialize() {
    return {
      plugins: this.plugins.serialize(),
      licenses: this.licenses.serialize(),
      monetization: this.monetization.serialize(),
      store: this.store.serialize(),
      creator: this.creator.serialize()
    };
  }

  /**
   * Restore all subsystem state
   */
  deserialize(data) {
    if (!data) return;
    if (data.plugins) this.plugins.deserialize(data.plugins);
    if (data.licenses) this.licenses.deserialize(data.licenses);
    if (data.monetization) this.monetization.deserialize(data.monetization);
    if (data.store) this.store.deserialize(data.store);
    if (data.creator) this.creator.deserialize(data.creator);
  }
}

/**
 * Convenience: create a fully wired marketplace instance
 */
export async function createMarketplace(editorState) {
  const api = new MarketplaceAPI(editorState);
  await api.init();
  return api;
}
