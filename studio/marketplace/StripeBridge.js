/**
 * StripeBridge — Real Stripe payment integration for the marketplace.
 *
 * Two modes:
 *   LIVE  — loads @stripe/stripe-js, redirects to Stripe Checkout / mounts Payment Element
 *   SIM   — simulated fallback when no publishable key is configured (development/testing)
 *
 * Architecture:
 *   ┌─────────────────┐       ┌──────────────────────┐
 *   │ MonetizationEngine│ ──►  │    StripeBridge      │
 *   │                  │       │                      │
 *   │ createCheckout() │       │  LIVE: stripe.       │
 *   │ confirmPayment() │       │   redirectToCheckout │
 *   └─────────────────┘       │  SIM: fake confirm    │
 *                              └──────────────────────┘
 *
 * Stripe Checkout creation requires a server-side endpoint. This bridge
 * lets you configure the endpoint URL. If none is set, it falls back to
 * simulation (for dev/testing without a backend).
 *
 * Required env vars (LIVE mode):
 *   STRIPE_PUBLISHABLE_KEY  — pk_... from Stripe dashboard
 *   CHECKOUT_ENDPOINT       — your backend /create-checkout-session URL
 */

export class StripeBridge {
  constructor(options = {}) {
    // Configuration
    this.publishableKey = options.publishableKey || null;
    this.checkoutEndpoint = options.checkoutEndpoint || null;
    this.successUrl = options.successUrl || window.location.origin + '/marketplace?checkout=success';
    this.cancelUrl = options.cancelUrl || window.location.origin + '/marketplace?checkout=cancelled';

    // State
    this._stripe = null;         // Stripe.js instance (lazy-loaded)
    this._elements = null;       // Stripe Elements instance
    this._loaded = false;        // Whether stripe.js has been loaded
    this._loadPromise = null;    // In-flight load promise

    // Mode
    this.mode = this._detectMode();

    // Callbacks for payment events
    this.onPaymentSuccess = options.onPaymentSuccess || null;
    this.onPaymentError = options.onPaymentError || null;
  }

  /* ── Mode Detection ── */

  _detectMode() {
    if (this.publishableKey && this.checkoutEndpoint) {
      return 'live';
    }
    // Check global env (window.__ENV__ or window.STRIPE_PUBLISHABLE_KEY)
    if (typeof window !== 'undefined') {
      const globalKey = window.__ENV__?.STRIPE_PUBLISHABLE_KEY ||
                        window.STRIPE_PUBLISHABLE_KEY ||
                        null;
      const globalEndpoint = window.__ENV__?.CHECKOUT_ENDPOINT ||
                             window.CHECKOUT_ENDPOINT ||
                             null;
      if (globalKey && globalEndpoint) {
        this.publishableKey = globalKey;
        this.checkoutEndpoint = globalEndpoint;
        return 'live';
      }
    }
    console.info('[StripeBridge] No publishable key configured — using simulated payments');
    return 'simulated';
  }

  /* ── Stripe.js Loading ── */

  /**
   * Load Stripe.js from the CDN (lazy, once).
   * Returns the Stripe instance.
   */
  async loadStripe() {
    if (this._stripe) return this._stripe;
    if (this._loadPromise) return this._loadPromise;

    if (this.mode !== 'live') {
      this._loaded = true;
      return null;
    }

    this._loadPromise = (async () => {
      try {
        // Load the Stripe.js script dynamically
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load Stripe.js'));
          document.head.appendChild(script);
        });

        if (typeof window.Stripe !== 'function') {
          throw new Error('Stripe.js loaded but Stripe constructor not found');
        }

        this._stripe = window.Stripe(this.publishableKey);
        this._loaded = true;
        console.log('[StripeBridge] Stripe.js loaded (live mode)');
        return this._stripe;
      } catch (err) {
        console.error('[StripeBridge] Failed to load Stripe:', err.message);
        this.mode = 'simulated';
        this._loaded = true;
        return null;
      }
    })();

    return this._loadPromise;
  }

  /* ── Checkout Session Creation ── */

  /**
   * Create a checkout session.
   *
   * LIVE mode:    POST to backend endpoint, get sessionId, redirect to Stripe Checkout
   * SIM mode:     Return simulated session (same as before)
   *
   * @param {Object} params
   * @param {string} params.productId
   * @param {string} params.productName
   * @param {number} params.amount      — in cents
   * @param {string} params.currency    — e.g. 'usd'
   * @param {boolean} params.recurring  — subscription?
   * @param {string} params.interval    — 'month' | 'year' | null
   * @param {Object} params.metadata    — additional data
   * @returns {Promise<{success, session?, error?}>}
   */
  async createCheckoutSession(params) {
    if (this.mode === 'live') {
      return this._createLiveSession(params);
    }
    return this._createSimulatedSession(params);
  }

  /**
   * LIVE: Post to backend to create a Stripe Checkout Session.
   * The backend returns { sessionId } — we then redirect via stripe.redirectToCheckout().
   */
  async _createLiveSession(params) {
    try {
      // Ensure Stripe.js is loaded
      await this.loadStripe();
      if (!this._stripe) {
        // Stripe failed to load, fall back to simulated
        console.warn('[StripeBridge] Stripe not available, falling back to simulated payment');
        return this._createSimulatedSession(params);
      }

      // 1. Call backend endpoint to create Checkout Session
      const response = await fetch(this.checkoutEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: params.productId,
          productName: params.productName,
          amount: params.amount,
          currency: params.currency || 'usd',
          recurring: params.recurring || false,
          interval: params.interval || null,
          successUrl: this.successUrl,
          cancelUrl: this.cancelUrl,
          metadata: params.metadata || {},
          couponCode: params.couponCode || null
        })
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Checkout API error (${response.status}): ${errData}`);
      }

      const data = await response.json();
      const sessionId = data.sessionId || data.id;

      if (!sessionId) {
        throw new Error('Backend did not return a sessionId');
      }

      // 2. Redirect to Stripe Checkout
      const { error } = await this._stripe.redirectToCheckout({ sessionId });

      if (error) {
        throw new Error(error.message || 'Stripe redirect failed');
      }

      // NOTE: If redirect succeeds, the page navigates away.
      // The code below runs only if redirect fails.

      return {
        success: true,
        session: {
          id: sessionId,
          productId: params.productId,
          productTitle: params.productName,
          amount: params.amount,
          currency: params.currency,
          status: 'redirected',
          redirectUrl: `https://checkout.stripe.com/c/pay/${sessionId}`,
          live: true
        }
      };
    } catch (err) {
      console.error('[StripeBridge] Live checkout failed:', err);
      return {
        success: false,
        error: err.message || 'Checkout failed. Please try again.',
        live: true
      };
    }
  }

  /**
   * SIM: Return a simulated checkout session.
   */
  _createSimulatedSession(params) {
    const sessionId = `cs_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id: sessionId,
      productId: params.productId,
      productTitle: params.productName,
      amount: params.amount,
      currency: params.currency || 'usd',
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      live: false,
      simulatorNote: 'Simulated payment — no real transaction processed'
    };

    console.log(`[StripeBridge] Simulated session created: ${sessionId} — $${(params.amount / 100).toFixed(2)}`);
    return { success: true, session };
  }

  /* ── Payment Element (Embedded Checkout) ── */

  /**
   * Mount a Stripe Payment Element into a container element.
   * Requires a clientSecret from a PaymentIntent (created by your backend).
   *
   * @param {string|HTMLElement} container — CSS selector or DOM element
   * @param {string} clientSecret — from backend PaymentIntent
   * @param {Function} onSuccess — callback when payment succeeds
   */
  async mountPaymentElement(container, clientSecret, onSuccess) {
    if (this.mode !== 'live') {
      console.warn('[StripeBridge] Payment Element requires live mode');
      return { success: false, error: 'Stripe not configured' };
    }

    try {
      await this.loadStripe();
      if (!this._stripe) throw new Error('Stripe not available');

      this._elements = this._stripe.elements({ clientSecret });
      const paymentElement = this._elements.create('payment', {
        layout: {
          type: 'tabs',
          defaultCollapsed: false
        }
      });

      const mountEl = typeof container === 'string'
        ? document.querySelector(container)
        : container;

      if (!mountEl) throw new Error('Container element not found');

      paymentElement.mount(mountEl);

      // Handle form submission
      const form = mountEl.closest('form') || mountEl;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const { error } = await this._stripe.confirmPayment({
          elements: this._elements,
          confirmParams: {
            return_url: this.successUrl
          }
        });

        if (error) {
          console.error('[StripeBridge] PaymentElement error:', error.message);
          if (this.onPaymentError) this.onPaymentError(error);
        } else {
          if (this.onPaymentSuccess) this.onPaymentSuccess();
          if (onSuccess) onSuccess();
        }
      });

      return { success: true, element: paymentElement };
    } catch (err) {
      console.error('[StripeBridge] Payment Element mount failed:', err);
      return { success: false, error: err.message };
    }
  }

  /* ── Payment Confirmation (for simulated mode) ── */

  /**
   * Confirm a simulated payment (used by MonetizationEngine in SIM mode).
   * In LIVE mode, payment is confirmed by Stripe's redirect/webhook.
   */
  confirmSimulatedPayment(session) {
    if (this.mode === 'live') {
      // In live mode, payment is confirmed by Stripe webhook / return_url
      return { success: true, message: 'Payment handled by Stripe Checkout' };
    }

    // Simulate confirmation
    session.status = 'completed';
    session.completedAt = Date.now();

    return {
      success: true,
      transaction: {
        id: `tx_sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        sessionId: session.id,
        productId: session.productId,
        productTitle: session.productTitle,
        amount: session.amount,
        currency: session.currency,
        status: 'completed',
        createdAt: Date.now(),
        live: false
      }
    };
  }

  /* ── Status / Diagnostics ── */

  getStatus() {
    return {
      mode: this.mode,
      loaded: this._loaded,
      hasPublishableKey: !!this.publishableKey,
      hasEndpoint: !!this.checkoutEndpoint,
      live: this.mode === 'live'
    };
  }

  /**
   * Check if Stripe Checkout redirect returned a success/cancel result.
   * Call this on page load when the URL contains ?checkout=success or ?checkout=cancelled.
   */
  checkUrlForPaymentResult() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      return { result: 'success' };
    }
    if (params.get('checkout') === 'cancelled') {
      return { result: 'cancelled' };
    }
    // Also check for Stripe's own redirect params
    if (params.get('payment_intent') && params.get('payment_intent_client_secret')) {
      return { result: 'success', paymentIntent: params.get('payment_intent') };
    }
    return { result: null };
  }
}
