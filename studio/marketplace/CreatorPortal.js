/**
 * CreatorPortal — Full creator dashboard for publishing, analytics, and managing assets.
 *
 * Capabilities:
 * - Publish workflow (draft → review → published)
 * - Earnings analytics (daily/monthly breakdowns)
 * - Asset management (edit listings, update versions, respond to reviews)
 * - Storefront customization (bio, banner, social links)
 * - Payout management (history, methods, thresholds)
 * - Sales reports (downloads, revenue, conversion)
 * - Customer support (Q&A, dispute resolution)
 */

export class CreatorPortal {
  constructor(editorState, marketplaceStore, monetizationEngine) {
    this.editor = editorState;
    this.store = marketplaceStore;
    this.monetization = monetizationEngine;

    // Creator profile (saved locally for now — would sync to cloud)
    this.profile = {
      id: null,
      username: 'Anonymous Creator',
      displayName: 'Anonymous Creator',
      bio: '3D artist creating assets for Kamakazii Studio',
      avatar: null,
      banner: null,
      website: '',
      socialLinks: {
        twitter: '',
        github: '',
        youtube: '',
        discord: ''
      },
      joinedAt: Date.now(),
      totalProducts: 0,
      totalSales: 0,
      rating: 0,
      responseRate: 0
    };

    this.drafts = new Map();     // draftId -> ListingDraft
    this.notifications = [];     // CreatorNotification[]
  }

  /* ── Creator Profile ── */

  updateProfile(updates) {
    Object.assign(this.profile, updates);
    console.log(`[CreatorPortal] Profile updated: ${this.profile.displayName}`);
    return this.profile;
  }

  getProfile() {
    return { ...this.profile };
  }

  /* ── Publish Workflow ── */

  /**
   * Start a new draft listing
   */
  createDraft(title = 'Untitled Asset') {
    const draftId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft = {
      id: draftId,
      title,
      description: '',
      category: 'uncategorized',
      tags: [],
      price: 0,
      currency: 'USD',
      license: 'standard',
      tierId: 'one-time',
      version: '1.0.0',
      changelog: '',
      thumbnail: null,
      previewImages: [],
      previewVideo: null,
      bundleData: null,       // Linked AssetBundler bundle
      requirements: '',
      documentation: '',
      status: 'draft',        // draft → review → published → rejected
      createdAt: Date.now(),
      updatedAt: Date.now(),
      reviewedAt: null,
      reviewNotes: ''
    };

    this.drafts.set(draftId, draft);
    return draft;
  }

  /**
   * Save draft updates
   */
  saveDraft(draftId, updates) {
    const draft = this.drafts.get(draftId);
    if (!draft) throw new Error(`Draft "${draftId}" not found`);
    Object.assign(draft, updates);
    draft.updatedAt = Date.now();
    return draft;
  }

  /**
   * Submit draft for review
   */
  submitForReview(draftId) {
    const draft = this.drafts.get(draftId);
    if (!draft) return { success: false, error: 'Draft not found' };

    // Validate required fields
    if (!draft.title || draft.title.trim() === '') return { success: false, error: 'Title is required' };
    if (!draft.description || draft.description.trim() === '') return { success: false, error: 'Description is required' };
    if (!draft.category || draft.category === 'uncategorized') return { success: false, error: 'Category is required' };
    if (draft.price < 0) return { success: false, error: 'Invalid price' };

    draft.status = 'review';
    draft.submittedAt = Date.now();

    this._addNotification('Submission', `"${draft.title}" submitted for review.`, 'info');
    return { success: true, draft };
  }

  /**
   * Publish an approved draft to the marketplace
   */
  async publish(draftId) {
    const draft = this.drafts.get(draftId);
    if (!draft) return { success: false, error: 'Draft not found' };
    if (draft.status !== 'review') return { success: false, error: 'Draft not in review' };

    // Auto-approve for simulation
    draft.status = 'published';
    draft.publishedAt = Date.now();
    draft.reviewedAt = Date.now();
    draft.reviewNotes = 'Auto-approved (simulated review)';

    // Create marketplace listing
    if (this.store) {
      await this.store.createListing({
        id: draft.id,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        tags: draft.tags,
        price: draft.price,
        currency: draft.currency,
        license: draft.license,
        tierId: draft.tierId,
        version: draft.version,
        thumbnail: draft.thumbnail,
        previewImages: draft.previewImages,
        creator: this.profile.displayName,
        creatorId: this.profile.id,
        createdAt: Date.now()
      });
    }

    this.profile.totalProducts++;
    this._addNotification('Published', `"${draft.title}" is now live on the marketplace!`, 'success');
    return { success: true, listing: draft };
  }

  /**
   * Reject a submission (staff only in production)
   */
  rejectSubmission(draftId, reason) {
    const draft = this.drafts.get(draftId);
    if (!draft) return { success: false, error: 'Draft not found' };
    draft.status = 'rejected';
    draft.reviewNotes = reason || 'No reason provided';
    draft.reviewedAt = Date.now();

    this._addNotification('Rejected', `"${draft.title}" was rejected: ${reason}`, 'error');
    return { success: true, draft };
  }

  /**
   * Update an already-published product (new version)
   */
  async updatePublished(listingId, newVersion, changelog) {
    const draft = Array.from(this.drafts.values())
      .find(d => d.id === listingId || d.title === listingId);

    if (!draft) return { success: false, error: 'Listing not found' };
    if (draft.status !== 'published') return { success: false, error: 'Listing not published' };

    draft.version = newVersion;
    draft.changelog = changelog;
    draft.updatedAt = Date.now();

    // Update store listing if available
    if (this.store) {
      await this.store.updateListing(listingId, {
        version: newVersion,
        updatedAt: Date.now()
      });
    }

    this._addNotification('Updated', `"${draft.title}" updated to v${newVersion}`, 'info');
    return { success: true, draft };
  }

  /* ── Draft Management ── */

  getDraft(draftId) {
    return this.drafts.get(draftId) || null;
  }

  listDrafts(status = null) {
    const all = Array.from(this.drafts.values());
    if (status) return all.filter(d => d.status === status);
    return all;
  }

  deleteDraft(draftId) {
    return this.drafts.delete(draftId);
  }

  /* ── Analytics ── */

  getDashboardStats() {
    const earnings = this.monetization
      ? this.monetization.getCreatorEarnings(this.profile.id)
      : { totalSales: 0, totalRevenue: 0, netEarnings: 0, pendingPayout: 0, averageSale: 0, byMonth: [] };

    const published = Array.from(this.drafts.values()).filter(d => d.status === 'published');
    const totalViews = published.reduce((sum, d) => sum + (d.viewCount || 0), 0);
    const totalDownloads = published.reduce((sum, d) => sum + (d.downloadCount || 0), 0);

    return {
      totalProducts: this.profile.totalProducts,
      publishedCount: published.length,
      totalViews,
      totalDownloads,
      totalSales: earnings.totalSales,
      totalRevenue: earnings.totalRevenue,
      netEarnings: earnings.netEarnings,
      pendingPayout: earnings.pendingPayout,
      averageSale: earnings.averageSale,
      conversionRate: totalViews > 0 ? ((totalDownloads / totalViews) * 100).toFixed(1) : '0.0',
      monthlyBreakdown: earnings.byMonth,
      recentTransactions: this.monetization
        ? this.monetization.getTransactions({ creatorId: this.profile.id }).slice(0, 10)
        : []
    };
  }

  getProductAnalytics(productId) {
    const draft = this.drafts.get(productId);
    if (!draft) return null;

    const transactions = this.monetization
      ? this.monetization.getTransactions({ productId })
      : [];

    return {
      title: draft.title,
      views: draft.viewCount || 0,
      downloads: draft.downloadCount || 0,
      sales: transactions.length,
      revenue: transactions.reduce((sum, t) => sum + t.amount, 0),
      rating: draft.rating || 0,
      reviewCount: draft.reviewCount || 0,
      transactions: transactions.slice(0, 20)
    };
  }

  /* ── Notifications ── */

  _addNotification(title, message, type = 'info') {
    this.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      message,
      type,
      read: false,
      createdAt: Date.now()
    });
  }

  getNotifications(unreadOnly = false) {
    if (unreadOnly) return this.notifications.filter(n => !n.read);
    return this.notifications;
  }

  markNotificationRead(notifId) {
    const notif = this.notifications.find(n => n.id === notifId);
    if (notif) notif.read = true;
  }

  markAllRead() {
    this.notifications.forEach(n => n.read = true);
  }

  /* ── Serialization ── */

  serialize() {
    return {
      profile: this.profile,
      drafts: Array.from(this.drafts.entries()),
      notifications: this.notifications
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.profile) this.profile = { ...this.profile, ...data.profile };
    if (data.drafts) this.drafts = new Map(data.drafts);
    if (data.notifications) this.notifications = data.notifications;
  }
}
