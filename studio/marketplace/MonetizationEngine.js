/**
 * MonetizationEngine — Pricing, checkout, revenue splits, and purchase ledger.
 *
 * Uses StripeBridge for real payment processing when configured.
 * Falls back to simulated payments for development/testing.
 *
 * Architecture:
 *   MarketplaceUI  ──►  MonetizationEngine  ──►  StripeBridge
 *                          │                          ├── LIVE: stripe.redirectToCheckout()
 *                          │                          └── SIM:  simulated confirm
 *                          ├── transactions[]  (ledger)
 *                          ├── payouts[]
 *                          └── pendingEarnings Map
 */

import { StripeBridge } from './StripeBridge.js';

export class MonetizationEngine {
  constructor(editorState, stripeOptions = {}) {
    this.editor = editorState;
    this.pricingTiers = this._initTiers();
    this.transactions = [];         // PurchaseTransaction[]
    this.payouts = [];              // PayoutRecord[]
    this.pendingEarnings = new Map(); // creatorId -> accumulated earnings (cents)
    this.coupons = new Map();       // code -> Coupon

    // Default split: 70% creator, 25% platform, 5% affiliate
    this.defaultSplit = { creator: 0.70, platform: 0.25, affiliate: 0.05 };

    // Payout settings
    this.payoutMinimum = 5000; // $50.00 minimum
    this.payoutFrequency = 'monthly';

    // Stripe integration
    this.stripe = new StripeBridge({
      publishableKey: stripeOptions.publishableKey || null,
      checkoutEndpoint: stripeOptions.checkoutEndpoint || null,
      successUrl: stripeOptions.successUrl,
      cancelUrl: stripeOptions.cancelUrl,
      onPaymentSuccess: (data) => {
        console.log('[MonetizationEngine] Stripe payment success:', data);
      },
      onPaymentError: (err) => {
        console.error('[MonetizationEngine] Stripe payment error:', err);
      }
    });
  }

  /* ── Pricing Tiers ── */

  _initTiers() {
    return {
      free: {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        description: 'No cost — download and use immediately',
        badge: 'Free',
        badgeColor: '#4ade80',
        features: ['Full asset access', 'Standard license', 'Community support']
      },
      'one-time': {
        id: 'one-time',
        name: 'One-Time Purchase',
        price: 0, // set per product
        currency: 'USD',
        description: 'Pay once, use forever',
        badge: 'Premium',
        badgeColor: '#60a5fa',
        features: ['Full asset access', 'Commercial license', 'Priority support', 'Updates included']
      },
      subscription_monthly: {
        id: 'subscription_monthly',
        name: 'Monthly Subscription',
        price: 0, // set per product
        currency: 'USD',
        description: 'Access while subscribed',
        badge: 'Subscribe',
        badgeColor: '#f472b6',
        features: ['Full access while active', 'Commercial license', 'Priority support', 'All updates'],
        recurring: true,
        interval: 'month',
        trialDays: 7
      },
      subscription_yearly: {
        id: 'subscription_yearly',
        name: 'Yearly Subscription',
        price: 0, // set per product
        currency: 'USD',
        description: '2 months free vs monthly',
        badge: 'Best Value',
        badgeColor: '#a78bfa',
        features: ['Full access while active', 'Commercial license', 'Priority support', 'All updates', '2 months free'],
        recurring: true,
        interval: 'year',
        trialDays: 14,
        discount: 0.17 // ~17% off vs monthly
      },
      'rent-to-own': {
        id: 'rent-to-own',
        name: 'Rent-to-Own',
        price: 0,
        currency: 'USD',
        description: 'Pay over time, own after N payments',
        badge: 'Flexible',
        badgeColor: '#fb923c',
        features: ['Split payments', 'Own after 12 payments', 'Commercial license', 'Full access immediately'],
        installments: 12,
        recurring: true,
        interval: 'month'
      }
    };
  }

  getTier(tierId) {
    return this.pricingTiers[tierId] || this.pricingTiers['one-time'];
  }

  listTiers() {
    return Object.values(this.pricingTiers);
  }

  /* ── Checkout ── */

  /**
   * Create a checkout session for a product.
   *
   * LIVE mode (Stripe configured):
   *   Delegates to StripeBridge.createCheckoutSession() which POSTs to
   *   your backend endpoint, then redirects to Stripe Checkout.
   *
   * SIM mode (no Stripe key):
   *   Returns a simulated session with a confirm-simulated-payment flow.
   *
   * FREE items:
   *   Always instant — no payment needed.
   *
   * @param {Object} product  — { id, title, price, currency }
   * @param {string} tierId   — 'one-time', 'subscription_monthly', etc.
   * @param {Object} options  — { couponCode, affiliateId, metadata, split }
   * @returns {Promise<{success, session?, error?}>}
   */
  async createCheckout(product, tierId = 'one-time', options = {}) {
    const tier = this.getTier(tierId);
    const price = options.price || product.price || 0;
    const currency = (options.currency || product.currency || 'USD').toLowerCase();

    // Validate
    if (tierId !== 'free' && price <= 0) {
      return { success: false, error: 'Invalid price for paid tier' };
    }

    // Apply coupon if provided
    let discount = 0;
    let couponCode = null;
    let finalPrice = price;
    if (options.couponCode) {
      const coupon = this.coupons.get(options.couponCode);
      if (coupon && this._validateCoupon(coupon)) {
        discount = coupon.type === 'percentage' ? price * coupon.value : coupon.value;
        couponCode = options.couponCode;
        coupon.usedCount++;
        finalPrice = Math.max(0, price - discount);
      }
    }

    // Calculate tax (placeholder — real tax calculation would use address)
    const taxRate = 0;
    const tax = Math.round(finalPrice * taxRate);
    const total = Math.round(finalPrice + tax);

    // Revenue split
    const split = options.split || this.defaultSplit;
    const creatorEarnings = Math.round(total * split.creator);
    const platformFee = Math.round(total * split.platform);

    // Is Stripe in live mode?
    const stripeStatus = this.stripe.getStatus();
    const isLive = stripeStatus.live;

    if (isLive) {
      // ── LIVE: Save session record BEFORE Stripe redirect ──
      // Must save before redirectToCheckout() navigates away,
      // so handlePaymentReturn() can find it when user returns.
      const clientSessionId = `cs_live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const sessionRecord = {
        id: clientSessionId,
        productId: product.id,
        productTitle: product.title,
        tier: tierId,
        amount: total,
        currency,
        discount,
        tax,
        split,
        creatorEarnings,
        platformFee,
        couponCode,
        status: 'pending',
        live: true,
        createdAt: Date.now(),
        metadata: options.metadata || {}
      };
      this.transactions.push(sessionRecord);

      // Delegate to StripeBridge (will redirect browser on success)
      const result = await this.stripe.createCheckoutSession({
        productId: product.id || product.title,
        productName: product.title,
        amount: total,
        currency,
        recurring: tier.recurring || false,
        interval: tier.interval || null,
        couponCode,
        metadata: {
          ...(options.metadata || {}),
          tier: tierId,
          creatorEarnings,
          platformFee
        }
      });

      if (result.success && result.session) {
        // Update session record with the real Stripe session ID
        sessionRecord.id = result.session.id || sessionRecord.id;
        console.log(`[MonetizationEngine] Stripe checkout: ${sessionRecord.id} — $${(total / 100).toFixed(2)} ${currency}`);
      }

      return result;
    }

    // ── SIM: Create simulated session ──
    const simResult = this.stripe.createCheckoutSession({
      productId: product.id || product.title,
      productName: product.title,
      amount: total,
      currency
    });

    if (!simResult.success) return simResult;

    const session = {
      id: simResult.session.id,
      productId: product.id,
      productTitle: product.title,
      tier: tierId,
      price,
      currency,
      discount,
      tax,
      total,
      couponCode,
      split,
      creatorEarnings,
      platformFee,
      affiliateEarnings: options.affiliateId ? Math.round(total * split.affiliate) : 0,
      status: 'pending',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
      metadata: options.metadata || {},
      live: false
    };

    this.transactions.push(session);

    console.log(`[MonetizationEngine] Simulated checkout: ${session.id} — $${(total / 100).toFixed(2)} ${currency}`);
    return { success: true, session, live: false };
  }

  /**
   * Complete a checkout (payment confirmation).
   *
   * LIVE mode:    Payment confirmed via Stripe redirect return_url or webhook.
   *               This method finalizes the ledger entry after redirect back.
   *
   * SIM mode:     Instantly confirm the simulated payment.
   *
   * @param {string} sessionId
   * @param {Object} [options]  — { stripePaymentIntentId } for live mode
   */
  async confirmPayment(sessionId, options = {}) {
    const session = this.transactions.find(t => t.id === sessionId);
    if (!session) return { success: false, error: 'Session not found' };
    if (session.status !== 'pending') return { success: false, error: 'Session already processed' };

    // In live mode, the payment was already handled by Stripe.
    // We just finalize the ledger entry.
    if (session.live) {
      session.status = 'completed';
      session.completedAt = Date.now();
      session.stripePaymentIntentId = options.stripePaymentIntentId || null;

      const transaction = this._buildTransaction(session);
      this._accumulateEarnings(transaction);

      console.log(`[MonetizationEngine] Stripe payment finalized: ${transaction.id} — $${(transaction.amount / 100).toFixed(2)}`);
      return { success: true, transaction, live: true };
    }

    // Simulated confirmation
    const confirmResult = this.stripe.confirmSimulatedPayment(session);
    if (!confirmResult.success) return confirmResult;

    const transaction = {
      id: confirmResult.transaction.id,
      sessionId: session.id,
      productId: session.productId,
      productTitle: session.productTitle,
      tier: session.tier,
      amount: session.total || session.amount,
      currency: session.currency,
      creatorEarnings: session.creatorEarnings || Math.round((session.total || session.amount) * (session.split?.creator || this.defaultSplit.creator)),
      platformFee: session.platformFee || Math.round((session.total || session.amount) * (session.split?.platform || this.defaultSplit.platform)),
      status: 'completed',
      createdAt: Date.now(),
      metadata: session.metadata || {},
      live: false
    };

    // Update session
    session.status = 'completed';
    session.completedAt = Date.now();

    this.transactions.push(transaction);
    this._accumulateEarnings(transaction);

    console.log(`[MonetizationEngine] Payment confirmed (sim): ${transaction.id} — $${(transaction.amount / 100).toFixed(2)}`);
    return { success: true, transaction, live: false };
  }

  /**
   * Build a transaction record from a completed session
   */
  _buildTransaction(session) {
    return {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId: session.id,
      productId: session.productId,
      productTitle: session.productTitle,
      tier: session.tier,
      amount: session.amount || session.total,
      currency: session.currency,
      creatorEarnings: session.creatorEarnings,
      platformFee: session.platformFee,
      status: 'completed',
      createdAt: Date.now(),
      metadata: session.metadata || {},
      live: true
    };
  }

  _accumulateEarnings(transaction) {
    const creatorId = transaction.metadata?.creatorId || 'unknown';
    const current = this.pendingEarnings.get(creatorId) || 0;
    this.pendingEarnings.set(creatorId, current + (transaction.creatorEarnings || 0));
  }

  /**
   * Process a refund
   */
  async processRefund(transactionId) {
    const tx = this.transactions.find(t => t.id === transactionId);
    if (!tx) return { success: false, error: 'Transaction not found' };
    if (tx.status === 'refunded') return { success: false, error: 'Already refunded' };

    tx.status = 'refunded';
    tx.refundedAt = Date.now();

    // Reverse creator earnings
    const creatorId = tx.metadata?.creatorId || 'unknown';
    const current = this.pendingEarnings.get(creatorId) || 0;
    this.pendingEarnings.set(creatorId, Math.max(0, current - tx.creatorEarnings));

    console.log(`[MonetizationEngine] Refund processed: ${transactionId}`);
    return { success: true, transaction: tx };
  }

  /* ── Coupon / Promo Code Management ── */

  createCoupon(code, type, value, options = {}) {
    const coupon = {
      code: code.toUpperCase(),
      type, // 'percentage' or 'fixed'
      value, // 0.0-1.0 for percentage, cents for fixed
      maxUses: options.maxUses || Infinity,
      usedCount: 0,
      expiresAt: options.expiresAt || null,
      minPurchase: options.minPurchase || 0,
      productIds: options.productIds || null, // null = all products
      createdBy: options.createdBy || 'system',
      createdAt: Date.now()
    };

    this.coupons.set(coupon.code, coupon);
    return coupon;
  }

  _validateCoupon(coupon) {
    if (coupon.expiresAt && Date.now() > coupon.expiresAt) return false;
    if (coupon.usedCount >= coupon.maxUses) return false;
    return true;
  }

  /* ── Payout Management ── */

  /**
   * Request a payout for a creator
   */
  async requestPayout(creatorId, method = 'bank') {
    const earnings = this.pendingEarnings.get(creatorId) || 0;
    if (earnings < this.payoutMinimum) {
      return {
        success: false,
        error: `Minimum payout is $${(this.payoutMinimum / 100).toFixed(2)}. Current balance: $${(earnings / 100).toFixed(2)}`
      };
    }

    const payout = {
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      creatorId,
      amount: earnings,
      currency: 'USD',
      method,
      status: 'processing', // processing -> completed
      requestedAt: Date.now(),
      estimatedCompletion: Date.now() + 5 * 24 * 60 * 60 * 1000 // 5 business days
    };

    this.payouts.push(payout);
    this.pendingEarnings.set(creatorId, 0);

    // Simulate completion
    setTimeout(() => {
      payout.status = 'completed';
      payout.completedAt = Date.now();
      console.log(`[MonetizationEngine] Payout completed: ${payout.id} — $${(payout.amount / 100).toFixed(2)}`);
    }, 3000);

    console.log(`[MonetizationEngine] Payout requested: ${payout.id} — $${(payout.amount / 100).toFixed(2)}`);
    return { success: true, payout };
  }

  /* ── Analytics ── */

  getCreatorEarnings(creatorId) {
    const creatorTxs = this.transactions.filter(t => t.metadata?.creatorId === creatorId && t.status === 'completed');
    const total = creatorTxs.reduce((sum, t) => sum + t.amount, 0);
    const net = creatorTxs.reduce((sum, t) => sum + t.creatorEarnings, 0);
    const pending = this.pendingEarnings.get(creatorId) || 0;

    return {
      totalSales: creatorTxs.length,
      totalRevenue: total,
      netEarnings: net,
      pendingPayout: pending,
      averageSale: creatorTxs.length > 0 ? Math.round(total / creatorTxs.length) : 0,
      byMonth: this._groupByMonth(creatorTxs)
    };
  }

  getMarketplaceStats() {
    const completed = this.transactions.filter(t => t.status === 'completed');
    const totalVolume = completed.reduce((sum, t) => sum + t.amount, 0);
    const totalFees = completed.reduce((sum, t) => sum + t.platformFee, 0);

    return {
      totalTransactions: completed.length,
      totalVolume,
      totalPlatformFees: totalFees,
      uniqueProducts: new Set(completed.map(t => t.productId)).size,
      averageTransaction: completed.length > 0 ? Math.round(totalVolume / completed.length) : 0
    };
  }

  _groupByMonth(transactions) {
    const groups = {};
    for (const tx of transactions) {
      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = { month: key, sales: 0, revenue: 0, net: 0 };
      groups[key].sales++;
      groups[key].revenue += tx.amount;
      groups[key].net += tx.creatorEarnings;
    }
    return Object.values(groups).sort((a, b) => a.month.localeCompare(b.month));
  }

  /* ── Helpers ── */

  _generateToken() {
    return Array.from({ length: 32 }, () =>
      'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36))
    ).join('');
  }

  getTransactions(filters = {}) {
    let result = [...this.transactions];
    if (filters.creatorId) result = result.filter(t => t.metadata?.creatorId === filters.creatorId);
    if (filters.status) result = result.filter(t => t.status === filters.status);
    if (filters.productId) result = result.filter(t => t.productId === filters.productId);
    if (filters.since) result = result.filter(t => t.createdAt >= filters.since);
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  getPayouts(creatorId) {
    return this.payouts
      .filter(p => p.creatorId === creatorId)
      .sort((a, b) => b.requestedAt - a.requestedAt);
  }

  /* ── Serialization ── */

  serialize() {
    return {
      transactions: this.transactions,
      payouts: this.payouts,
      pendingEarnings: Array.from(this.pendingEarnings.entries()),
      coupons: Array.from(this.coupons.entries())
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.transactions) this.transactions = data.transactions;
    if (data.payouts) this.payouts = data.payouts;
    if (data.pendingEarnings) this.pendingEarnings = new Map(data.pendingEarnings);
    if (data.coupons) this.coupons = new Map(data.coupons);
  }
}
