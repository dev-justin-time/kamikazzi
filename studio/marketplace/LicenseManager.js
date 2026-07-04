/**
 * LicenseManager — Handles asset and plugin licensing for the marketplace.
 *
 * License types:
 * - free: No restrictions, attribution appreciated
 * - standard: Single user, non-commercial use allowed with limits
 * - commercial: Full commercial use, redistribution not allowed
 * - extended: Unlimited commercial, redistribution allowed in larger projects
 * - subscription: Monthly/yearly recurring access
 * - enterprise: Custom terms for studios
 *
 * Features:
 * - License template generation
 * - Entitlement checks (can user use this?)
 * - Watermark preview rendering
 * - Trial period enforcement
 * - License key generation & validation
 */

export class LicenseManager {
  constructor(editorState) {
    this.editor = editorState;
    this.licenses = new Map();       // licenseKey -> LicenseRecord
    this.entitlements = new Map();   // assetId -> Entitlement (for current user)
    this.templates = this._initTemplates();
  }

  /* ── License Templates ── */

  _initTemplates() {
    return {
      free: {
        id: 'free',
        name: 'Free License',
        icon: 'fa-gift',
        color: '#4ade80',
        description: 'Free to use in any project. Attribution appreciated but not required.',
        permissions: ['use', 'modify'],
        prohibitions: ['resell', 'redistribute-source'],
        attribution: false,
        royalty: 0,
        maxSeats: Infinity,
        duration: 'perpetual'
      },

      standard: {
        id: 'standard',
        name: 'Standard License',
        icon: 'fa-file-contract',
        color: '#60a5fa',
        description: 'Single user license. Use in personal and commercial projects (up to $10K revenue).',
        permissions: ['use', 'modify', 'commercial-use'],
        prohibitions: ['resell', 'redistribute-source', 'sub-license'],
        attribution: true,
        royalty: 0,
        maxSeats: 1,
        duration: 'perpetual',
        revenueCap: 10000
      },

      commercial: {
        id: 'commercial',
        name: 'Commercial License',
        icon: 'fa-briefcase',
        color: '#f59e0b',
        description: 'Full commercial use for any project size. No revenue cap. No redistribution.',
        permissions: ['use', 'modify', 'commercial-use', 'sublicense-in-product'],
        prohibitions: ['resell', 'redistribute-source'],
        attribution: false,
        royalty: 0,
        maxSeats: 5,
        duration: 'perpetual'
      },

      extended: {
        id: 'extended',
        name: 'Extended License',
        icon: 'fa-crown',
        color: '#a78bfa',
        description: 'Unlimited commercial use, redistribute in larger projects, unlimited seats.',
        permissions: ['use', 'modify', 'commercial-use', 'sublicense-in-product', 'redistribute-incorporated'],
        prohibitions: ['resell-standalone', 'redistribute-source'],
        attribution: false,
        royalty: 0,
        maxSeats: Infinity,
        duration: 'perpetual'
      },

      subscription: {
        id: 'subscription',
        name: 'Subscription',
        icon: 'fa-sync-alt',
        color: '#f472b6',
        description: 'Monthly or yearly recurring access. Cancel anytime. Licensed while active.',
        permissions: ['use', 'modify', 'commercial-use'],
        prohibitions: ['resell', 'redistribute-source', 'perpetual-use-after-cancel'],
        attribution: false,
        royalty: 0,
        maxSeats: 1,
        duration: 'monthly', // or 'yearly'
        renewalPeriod: 30 // days
      },

      enterprise: {
        id: 'enterprise',
        name: 'Enterprise License',
        icon: 'fa-building',
        color: '#fb923c',
        description: 'Custom terms for studios. Volume pricing, dedicated support, seat management.',
        permissions: ['use', 'modify', 'commercial-use', 'sublicense-in-product', 'redistribute-incorporated', 'custom'],
        prohibitions: ['resell-standalone'],
        attribution: false,
        royalty: 0,
        maxSeats: Infinity,
        duration: 'perpetual',
        customTerms: true
      }
    };
  }

  getTemplate(licenseId) {
    return this.templates[licenseId] || this.templates.standard;
  }

  listTemplates() {
    return Object.values(this.templates);
  }

  /* ── Entitlement Management ── */

  /**
   * Check if the current user is entitled to use a specific asset
   */
  checkEntitlement(assetId) {
    const entitlement = this.entitlements.get(assetId);
    if (!entitlement) {
      return { entitled: false, reason: 'not-purchased', watermark: true };
    }

    // Check expiry
    if (entitlement.expiresAt && Date.now() > entitlement.expiresAt) {
      return { entitled: false, reason: 'expired', watermark: true, expiredAt: entitlement.expiresAt };
    }

    // Check seat limit
    if (entitlement.seats && entitlement.seatsUsed >= entitlement.seats) {
      return { entitled: false, reason: 'seat-limit-reached', watermark: true };
    }

    return { entitled: true, watermark: false, license: entitlement.licenseType };
  }

  /**
   * Grant an entitlement (after purchase)
   */
  grantEntitlement(assetId, licenseType, options = {}) {
    const template = this.getTemplate(licenseType);
    const now = Date.now();

    let expiresAt = null;
    if (template.duration === 'monthly') {
      expiresAt = now + 30 * 24 * 60 * 60 * 1000;
    } else if (template.duration === 'yearly') {
      expiresAt = now + 365 * 24 * 60 * 60 * 1000;
    }

    const entitlement = {
      assetId,
      licenseType,
      grantedAt: now,
      expiresAt: options.expiresAt || expiresAt,
      perpetual: !expiresAt,
      seats: options.seats || template.maxSeats || 1,
      seatsUsed: 0,
      licenseKey: this._generateLicenseKey(assetId, licenseType),
      metadata: options.metadata || {}
    };

    this.entitlements.set(assetId, entitlement);
    this.licenses.set(entitlement.licenseKey, entitlement);

    console.log(`[LicenseManager] Granted "${licenseType}" entitlement for asset "${assetId}"`);
    return entitlement;
  }

  /**
   * Revoke an entitlement
   */
  revokeEntitlement(assetId) {
    const entitlement = this.entitlements.get(assetId);
    if (entitlement) {
      this.licenses.delete(entitlement.licenseKey);
    }
    this.entitlements.delete(assetId);
    console.log(`[LicenseManager] Revoked entitlement for "${assetId}"`);
  }

  /**
   * Use a seat (e.g., when opening a project that uses the asset)
   */
  useSeat(assetId) {
    const entitlement = this.entitlements.get(assetId);
    if (!entitlement) return false;
    if (entitlement.seatsUsed >= entitlement.seats) return false;
    entitlement.seatsUsed++;
    return true;
  }

  /**
   * Release a seat
   */
  releaseSeat(assetId) {
    const entitlement = this.entitlements.get(assetId);
    if (!entitlement) return;
    entitlement.seatsUsed = Math.max(0, entitlement.seatsUsed - 1);
  }

  /* ── License Key Generation & Validation ── */

  _generateLicenseKey(assetId, licenseType) {
    const prefix = licenseType.substring(0, 2).toUpperCase();
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const check = this._checksum(`${prefix}-${assetId}-${ts}-${rand}`);
    return `${prefix}-${ts}-${rand}-${check}`;
  }

  _checksum(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(36).substring(0, 4).toUpperCase();
  }

  validateLicenseKey(licenseKey) {
    const record = this.licenses.get(licenseKey);
    if (!record) {
      return { valid: false, reason: 'invalid-key' };
    }

    if (record.expiresAt && Date.now() > record.expiresAt) {
      return { valid: false, reason: 'expired', entitlement: record };
    }

    return { valid: true, entitlement: record };
  }

  /* ── Watermark Rendering ── */

  /**
   * Apply a watermark preview overlay to the viewport for unlicensed assets.
   * This deterres unauthorized use while allowing the user to evaluate.
   */
  applyWatermark() {
    // Remove existing watermark first
    this.removeWatermark();

    const watermark = document.createElement('div');
    watermark.id = 'k3d-watermark';
    watermark.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 40px,
        rgba(255, 0, 0, 0.03) 40px,
        rgba(255, 0, 0, 0.03) 80px
      );
    `;

    const label = document.createElement('div');
    label.style.cssText = `
      color: rgba(255, 255, 255, 0.15);
      font: bold 48px/1 monospace;
      text-transform: uppercase;
      letter-spacing: 8px;
      transform: rotate(-30deg);
      text-shadow: 0 0 20px rgba(0,0,0,0.5);
      user-select: none;
    `;
    label.textContent = 'PREVIEW — PURCHASE TO REMOVE';

    watermark.appendChild(label);
    document.body.appendChild(watermark);
  }

  removeWatermark() {
    const existing = document.getElementById('k3d-watermark');
    if (existing) existing.remove();
  }

  /* ── License Text Generation ── */

  generateLicenseText(assetTitle, creatorName, licenseType, year) {
    const template = this.getTemplate(licenseType);
    const y = year || new Date().getFullYear();

    return `
${assetTitle} — License Agreement
Copyright © ${y} ${creatorName}

License Type: ${template.name}
${template.description}

────────────────────────────────

Permissions:
${template.permissions.map(p => `  ✅ ${this._formatPermission(p)}`).join('\n')}

Prohibitions:
${template.prohibitions.map(p => `  ❌ ${this._formatProhibition(p)}`).join('\n')}

${template.attribution ? 'Attribution Required: Yes — please credit the creator in your project.' : 'Attribution: Not required.'}

${template.revenueCap ? `Revenue Cap: $${template.revenueCap.toLocaleString()} — projects exceeding this require an upgrade.` : ''}

Seats: ${template.maxSeats === Infinity ? 'Unlimited' : template.maxSeats}
Duration: ${template.duration}

────────────────────────────────
Generated by Kamakazii Studio 3D Marketplace
`;
  }

  _formatPermission(p) {
    const map = {
      'use': 'Use the asset in projects',
      'modify': 'Modify and adapt the asset',
      'commercial-use': 'Use in commercial projects',
      'sublicense-in-product': 'Sublicense as part of a larger product'
    };
    return map[p] || p;
  }

  _formatProhibition(p) {
    const map = {
      'resell': 'Resell the asset standalone',
      'resell-standalone': 'Resell the asset as a standalone product',
      'redistribute-source': 'Redistribute source files',
      'redistribute-incorporated': 'Redistribute separately from your product',
      'sub-license': 'Sub-license to third parties',
      'perpetual-use-after-cancel': 'Continue using after subscription cancellation'
    };
    return map[p] || p;
  }

  /* ── Serialization ── */

  serialize() {
    return {
      entitlements: Array.from(this.entitlements.entries()).map(([id, e]) => ({
        assetId: id,
        licenseType: e.licenseType,
        grantedAt: e.grantedAt,
        expiresAt: e.expiresAt,
        perpetual: e.perpetual,
        seats: e.seats,
        seatsUsed: e.seatsUsed,
        licenseKey: e.licenseKey
      }))
    };
  }

  deserialize(data) {
    if (!data?.entitlements) return;
    for (const e of data.entitlements) {
      this.entitlements.set(e.assetId, e);
      this.licenses.set(e.licenseKey, e);
    }
  }
}
