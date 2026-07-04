/**
 * MarketplaceUI — Full UI rendering layer for the marketplace.
 *
 * Renders all panels:
 * - Browse (category grid, featured, trending, new releases)
 * - Search (filtered results with sort)
 * - Product Detail (screenshots, description, reviews, purchase)
 * - 3D Model Preview (spinning interactive preview via Three.js)
 * - Creator Dashboard (earnings, products, analytics)
 * - Plugin Manager (installed, browse, enable/disable)
 * - Cart / Checkout
 *
 * This is a standalone module that can be mounted into any DOM container.
 * It communicates with the backend via MarketplaceAPI.
 */

import { ModelPreviewRenderer } from './ModelPreviewRenderer.js';

export class MarketplaceUI {
  constructor(api, containerEl) {
    this.api = api;
    this.container = containerEl;
    this.currentView = 'browse'; // browse, search, detail, creator, plugins, checkout
    this.currentProduct = null;
    this.searchResults = null;

    // 3D preview renderer (lazy init)
    this.previewRenderer = null;

    // Currency formatter
    this.formatPrice = (cents, currency = 'USD') => {
      if (cents === 0) return 'Free';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2
      }).format(cents / 100);
    };
  }

  /**
   * Mount the marketplace UI into the container
   */
  mount() {
    this.container.innerHTML = `
      <div class="k3d-mkt-overlay">
        <div class="k3d-mkt-sidebar">
          ${this._renderSidebar()}
        </div>
        <div class="k3d-mkt-main">
          <div class="k3d-mkt-viewport"></div>
        </div>
      </div>
    `;

    this.viewport = this.container.querySelector('.k3d-mkt-viewport');
    this._attachSidebarEvents();
    this.showView('browse');
  }

  unmount() {
    this.container.innerHTML = '';
  }

  /* ── Navigation ── */

  showView(view, params = {}) {
    // Destroy 3D preview before switching away from detail view
    if (this.currentView !== view) {
      this._destroyModelPreview();
    }

    this.currentView = view;
    if (view === 'browse') this._renderBrowse();
    else if (view === 'search') this._renderSearch(params.query, params.filters);
    else if (view === 'detail') this._renderProductDetail(params.productId);
    else if (view === 'creator') this._renderCreatorDashboard();
    else if (view === 'plugins') this._renderPluginManager();
    else if (view === 'checkout') this._renderCheckout(params.product);
    else if (view === 'favorites') this._renderFavorites();
    else if (view === 'wishlist') this._renderWishlist();
  }

  /* ── Sidebar ── */

  _renderSidebar() {
    return `
      <div class="k3d-mkt-logo">
        <i class="fas fa-store"></i>
        <span>Marketplace</span>
      </div>
      <div class="k3d-mkt-search">
        <i class="fas fa-search"></i>
        <input type="text" id="k3d-mkt-search-input" placeholder="Search assets, plugins..." />
      </div>
      <nav class="k3d-mkt-nav">
        <div class="k3d-mkt-nav-item active" data-view="browse">
          <i class="fas fa-compass"></i> <span>Browse</span>
        </div>
        <div class="k3d-mkt-nav-item" data-view="plugins">
          <i class="fas fa-puzzle-piece"></i> <span>Plugins</span>
          <span class="k3d-mkt-badge">${this.api.plugins.getInstalled().length}</span>
        </div>
        <div class="k3d-mkt-nav-item" data-view="favorites">
          <i class="fas fa-heart"></i> <span>Favorites</span>
          <span class="k3d-mkt-badge">${this.api.store.getFavorites().length}</span>
        </div>
        <div class="k3d-mkt-nav-item" data-view="wishlist">
          <i class="fas fa-bookmark"></i> <span>Wishlist</span>
          <span class="k3d-mkt-badge">${this.api.store.getWishlist().length}</span>
        </div>
      </nav>
      <div class="k3d-mkt-nav-divider"></div>
      <nav class="k3d-mkt-nav">
        <div class="k3d-mkt-nav-section-title">Categories</div>
        ${this.api.store.getCategories().map(cat => `
          <div class="k3d-mkt-nav-item" data-category="${cat.id}">
            <i class="fas ${cat.icon}"></i> <span>${cat.name}</span>
            <span class="k3d-mkt-count">${cat.count}</span>
          </div>
        `).join('')}
      </nav>
      <div class="k3d-mkt-nav-divider"></div>
      <nav class="k3d-mkt-nav">
        <div class="k3d-mkt-nav-item" data-view="creator">
          <i class="fas fa-user-astronaut"></i> <span>Creator Dashboard</span>
        </div>
      </nav>
    `;
  }

  _attachSidebarEvents() {
    const container = this.container;

    // Search input
    const searchInput = container.querySelector('#k3d-mkt-search-input');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const query = e.target.value.trim();
          if (query) {
            this.showView('search', { query });
          } else {
            this.showView('browse');
          }
        }, 300);
      });
    }

    // Nav items
    container.querySelectorAll('.k3d-mkt-nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll('.k3d-mkt-nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        this.showView(item.dataset.view);
      });
    });

    // Category nav items
    container.querySelectorAll('.k3d-mkt-nav-item[data-category]').forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll('.k3d-mkt-nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        this.showView('search', { query: '', filters: { category: item.dataset.category } });
      });
    });
  }

  /* ── Browse View ── */

  _renderBrowse() {
    const featured = this.api.store.getFeatured();
    const trending = this.api.store.getTrending();
    const newReleases = this.api.store.getNewReleases();
    const categories = this.api.store.getCategories();

    this.viewport.innerHTML = `
      <div class="k3d-mkt-header">
        <h1>Marketplace</h1>
        <p>Discover assets, plugins, and tools for Kamakazii Studio 3D</p>
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2><i class="fas fa-star"></i> Featured</h2>
        </div>
        <div class="k3d-mkt-grid">${featured.map(p => this._renderProductCard(p)).join('')}</div>
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2><i class="fas fa-fire"></i> Trending</h2>
        </div>
        <div class="k3d-mkt-grid">${trending.map(p => this._renderProductCard(p)).join('')}</div>
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2><i class="fas fa-clock"></i> New Releases</h2>
        </div>
        <div class="k3d-mkt-grid">${newReleases.map(p => this._renderProductCard(p)).join('')}</div>
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2><i class="fas fa-th-large"></i> Browse by Category</h2>
        </div>
        <div class="k3d-mkt-category-grid">
          ${categories.map(cat => `
            <div class="k3d-mkt-category-card" data-category="${cat.id}">
              <i class="fas ${cat.icon}"></i>
              <span class="k3d-mkt-category-name">${cat.name}</span>
              <span class="k3d-mkt-category-count">${cat.count} items</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Attach events
    this.viewport.querySelectorAll('.k3d-mkt-product-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showView('detail', { productId: card.dataset.productId });
      });
    });

    this.viewport.querySelectorAll('.k3d-mkt-category-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showView('search', { query: '', filters: { category: card.dataset.category } });
      });
    });
  }

  /* ── Product Card ── */

  _renderProductCard(product) {
    const isFree = product.price === 0;
    const thumbnailStyle = product.thumbnail
      ? `background-image: url(${product.thumbnail});`
      : '';

    return `
      <div class="k3d-mkt-product-card" data-product-id="${product.id}">
        <div class="k3d-mkt-product-thumb" style="${thumbnailStyle}background-color: #${Math.floor(Math.random()*16777215).toString(16).padStart(6,'0')}33;">
          <div class="k3d-mkt-product-badge ${isFree ? 'free' : 'paid'}">
            ${isFree ? 'Free' : this.formatPrice(product.price, product.currency)}
          </div>
          ${product.featured ? '<div class="k3d-mkt-product-badge featured">Featured</div>' : ''}
        </div>
        <div class="k3d-mkt-product-info">
          <h3>${product.title}</h3>
          <p class="k3d-mkt-product-creator">by ${product.creator}</p>
          <div class="k3d-mkt-product-meta">
            <span class="k3d-mkt-stars">${'★'.repeat(Math.round(product.rating))}${'☆'.repeat(5 - Math.round(product.rating))}</span>
            <span class="k3d-mkt-reviews">(${product.reviewCount})</span>
          </div>
          <div class="k3d-mkt-product-meta">
            <span><i class="fas fa-download"></i> ${product.downloadCount}</span>
            <span><i class="fas fa-heart"></i> ${product.favoriteCount}</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ── Search Results ── */

  _renderSearch(query = '', filters = {}) {
    const results = this.api.store.search(query, filters);
    const headerText = query ? `Results for "${query}"` : filters.category
      ? this.api.store.getCategory(filters.category)?.name || 'Browse'
      : 'All Products';

    this.viewport.innerHTML = `
      <div class="k3d-mkt-header">
        <h1>${headerText}</h1>
        <p>${results.total} product${results.total !== 1 ? 's' : ''} found</p>
      </div>
      <div class="k3d-mkt-toolbar">
        <div class="k3d-mkt-sort">
          <label>Sort by:</label>
          <select id="k3d-mkt-sort">
            <option value="newest">Newest</option>
            <option value="popular">Most Popular</option>
            <option value="rating">Highest Rated</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>
        <div class="k3d-mkt-filter-tags">
          <button class="k3d-mkt-filter-btn ${!filters.priceType ? 'active' : ''}" data-price="all">All</button>
          <button class="k3d-mkt-filter-btn ${filters.priceType === 'free' ? 'active' : ''}" data-price="free">Free</button>
          <button class="k3d-mkt-filter-btn ${filters.priceType === 'paid' ? 'active' : ''}" data-price="paid">Paid</button>
        </div>
      </div>
      <div class="k3d-mkt-grid">
        ${results.results.map(p => this._renderProductCard(p)).join('')}
        ${results.results.length === 0 ? '<div class="k3d-mkt-empty">No products found. Try different search terms.</div>' : ''}
      </div>
    `;

    // Sort change
    const sortSelect = this.viewport.querySelector('#k3d-mkt-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const sorted = this.api.store.search(query, { ...filters, sortBy: sortSelect.value });
        const grid = this.viewport.querySelector('.k3d-mkt-grid');
        if (grid) grid.innerHTML = sorted.results.map(p => this._renderProductCard(p)).join('');
      });
    }

    // Price filter
    this.viewport.querySelectorAll('.k3d-mkt-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const priceType = btn.dataset.price === 'all' ? undefined : btn.dataset.price;
        const newResults = this.api.store.search(query, { ...filters, priceType });
        const grid = this.viewport.querySelector('.k3d-mkt-grid');
        if (grid) grid.innerHTML = newResults.results.map(p => this._renderProductCard(p)).join('');
        this.viewport.querySelectorAll('.k3d-mkt-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Product card clicks
    this.viewport.querySelectorAll('.k3d-mkt-product-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showView('detail', { productId: card.dataset.productId });
      });
    });
  }

  /* ── Product Detail ── */

  _renderProductDetail(productId) {
    const product = this.api.store.getProduct(productId);
    if (!product) {
      this.viewport.innerHTML = '<div class="k3d-mkt-error">Product not found</div>';
      return;
    }

    const isFree = product.price === 0;
    const isOwned = this.api.licenses.checkEntitlement(productId).entitled;
    const reviews = product.reviews || [];

    this.viewport.innerHTML = `
      <div class="k3d-mkt-detail">
        <button class="k3d-mkt-back-btn"><i class="fas fa-arrow-left"></i> Back</button>
        <div class="k3d-mkt-detail-layout">
          <div class="k3d-mkt-detail-gallery">
            <div class="k3d-mkt-detail-main-image k3d-mkt-preview-container" id="k3d-mkt-model-preview">
              <div class="k3d-mkt-preview-loading">
                <i class="fas fa-cube"></i>
                <span>Loading preview...</span>
              </div>
            </div>
            <div class="k3d-mkt-detail-thumbs">
              <div class="k3d-mkt-thumb active"></div>
              <div class="k3d-mkt-thumb"></div>
              <div class="k3d-mkt-thumb"></div>
            </div>
          </div>
          <div class="k3d-mkt-detail-info">
            <h1>${product.title}</h1>
            <p class="k3d-mkt-detail-creator">by <strong>${product.creator}</strong></p>
            <div class="k3d-mkt-stars-large">
              ${'★'.repeat(Math.round(product.rating))}${'☆'.repeat(5 - Math.round(product.rating))}
              <span>${product.rating.toFixed(1)} (${product.reviewCount} reviews)</span>
            </div>
            <div class="k3d-mkt-detail-meta">
              <span><i class="fas fa-download"></i> ${product.downloadCount} downloads</span>
              <span><i class="fas fa-heart"></i> ${product.favoriteCount} favorites</span>
              <span><i class="fas fa-tag"></i> ${this.api.store.getCategory(product.category)?.name || product.category}</span>
              <span><i class="fas fa-code-branch"></i> v${product.version}</span>
            </div>
            <div class="k3d-mkt-detail-price-section">
              <div class="k3d-mkt-price-tag ${isFree ? 'free' : ''}">
                ${isFree ? 'Free' : this.formatPrice(product.price, product.currency)}
              </div>
              <div class="k3d-mkt-license-badge">${this.api.licenses.getTemplate(product.license)?.name || product.license}</div>
            </div>
            <p class="k3d-mkt-detail-desc">${product.description}</p>
            <div class="k3d-mkt-detail-tags">
              ${(product.tags || []).map(t => `<span class="k3d-mkt-tag">${t}</span>`).join('')}
            </div>
            <div class="k3d-mkt-detail-actions">
              ${isOwned
                ? `<button class="k3d-mkt-btn k3d-mkt-btn-secondary" disabled><i class="fas fa-check"></i> Owned</button>`
                : `<button class="k3d-mkt-btn k3d-mkt-btn-primary" id="k3d-mkt-purchase-btn">
                    <i class="fas fa-${isFree ? 'download' : 'shopping-cart'}"></i>
                    ${isFree ? 'Download Free' : `Purchase — ${this.formatPrice(product.price, product.currency)}`}
                  </button>`
              }
              <button class="k3d-mkt-btn k3d-mkt-btn-icon" id="k3d-mkt-fav-btn" title="${product.isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                <i class="fas fa-${product.isFavorited ? 'heart' : 'heart'}"></i>
              </button>
              <button class="k3d-mkt-btn k3d-mkt-btn-icon" id="k3d-mkt-wish-btn" title="${product.isInWishlist ? 'Remove from wishlist' : 'Add to wishlist'}">
                <i class="fas fa-${product.isInWishlist ? 'bookmark' : 'bookmark'}"></i>
              </button>
            </div>
          </div>
        </div>

        <div class="k3d-mkt-detail-section">
          <h3>Reviews & Ratings</h3>
          ${reviews.length === 0
            ? '<p class="k3d-mkt-empty">No reviews yet. Be the first!</p>'
            : reviews.map(r => `
              <div class="k3d-mkt-review">
                <div class="k3d-mkt-review-header">
                  <strong>${r.userName}</strong>
                  <span class="k3d-mkt-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                  <span class="k3d-mkt-review-date">${new Date(r.createdAt).toLocaleDateString()}</span>
                  ${r.verified ? '<span class="k3d-mkt-verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
                </div>
                <p>${r.comment}</p>
              </div>
            `).join('')
          }
        </div>

        ${product.relatedProducts?.length > 0 ? `
          <div class="k3d-mkt-detail-section">
            <h3>Related Products</h3>
            <div class="k3d-mkt-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
              ${product.relatedProducts.map(p => this._renderProductCard(p)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    // Back button
    this.viewport.querySelector('.k3d-mkt-back-btn').addEventListener('click', () => {
      this.showView('browse');
    });

    // Purchase button
    const purchaseBtn = this.viewport.querySelector('#k3d-mkt-purchase-btn');
    if (purchaseBtn) {
      purchaseBtn.addEventListener('click', async () => {
        if (isFree) {
          const result = await this.api.monetization.createCheckout(product, 'free');
          if (result.success) {
            this.showView('detail', { productId });
            this._updateSidebarCounts();
          }
        } else {
          this.showView('checkout', { product });
        }
      });
    }

    // Initialize 3D model preview
    this._initModelPreview(product);

    // Favorite
    const favBtn = this.viewport.querySelector('#k3d-mkt-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const result = this.api.store.toggleFavorite(productId);
        favBtn.querySelector('i').className = `fas fa-${result.favorited ? 'heart' : 'heart'}`;
        this._updateSidebarCounts();
      });
    }

    // Wishlist
    const wishBtn = this.viewport.querySelector('#k3d-mkt-wish-btn');
    if (wishBtn) {
      wishBtn.addEventListener('click', () => {
        const result = this.api.store.toggleWishlist(productId);
        wishBtn.querySelector('i').className = `fas fa-${result.wishlisted ? 'bookmark' : 'bookmark'}`;
        this._updateSidebarCounts();
      });
    }

    // Related product clicks
    this.viewport.querySelectorAll('.k3d-mkt-product-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showView('detail', { productId: card.dataset.productId });
      });
    });
  }

  /* ── Checkout ── */

  _renderCheckout(product) {
    const stripeStatus = this.api.monetization.stripe.getStatus();
    const isLive = stripeStatus.live;

    this.viewport.innerHTML = `
      <div class="k3d-mkt-detail">
        <button class="k3d-mkt-back-btn"><i class="fas fa-arrow-left"></i> Back to Product</button>
        <div class="k3d-mkt-checkout-layout">
          <div class="k3d-mkt-checkout-form">
            <h1>Complete Purchase</h1>
            <div class="k3d-mkt-checkout-summary">
              <div class="k3d-mkt-checkout-item">
                <span>${product.title}</span>
                <span>${this.formatPrice(product.price, product.currency)}</span>
              </div>
              <div class="k3d-mkt-checkout-item">
                <span>License: ${this.api.licenses.getTemplate(product.license)?.name || product.license}</span>
                <span>Included</span>
              </div>
              <div class="k3d-mkt-checkout-total">
                <span>Total</span>
                <span>${this.formatPrice(product.price, product.currency)}</span>
              </div>
            </div>

            ${isLive
              ? `<div class="k3d-mkt-checkout-stripe-info">
                   <i class="fab fa-stripe"></i>
                   <span>Secured by <strong>Stripe</strong></span>
                 </div>`
              : `<div class="k3d-mkt-checkout-note">
                   <i class="fas fa-flask"></i>
                   <span>Development mode — no real payment will be processed.
                   To enable live payments, set <code>STRIPE_PUBLISHABLE_KEY</code> and a checkout endpoint via <code>MarketplaceAPI.configureStripe()</code>.</span>
                 </div>`
            }

            <button class="k3d-mkt-btn k3d-mkt-btn-primary k3d-mkt-btn-large" id="k3d-mkt-confirm-btn">
              <i class="fas fa-${isLive ? 'lock' : 'flask'}"></i>
              ${isLive
                ? `Pay with Stripe — ${this.formatPrice(product.price, product.currency)}`
                : `Simulate Purchase — ${this.formatPrice(product.price, product.currency)}`
              }
            </button>

            ${isLive ? '<div class="k3d-mkt-checkout-redirect-note"><i class="fas fa-external-link-alt"></i> You will be redirected to Stripe Checkout to complete payment securely.</div>' : ''}

            <div id="k3d-mkt-checkout-result"></div>
          </div>
          <div class="k3d-mkt-checkout-sidebar">
            <div class="k3d-mkt-checkout-guarantee">
              <i class="fas fa-shield-alt"></i>
              <h4>Secure Checkout</h4>
              <p>Your payment is encrypted and processed securely. We never store your payment details.</p>
            </div>
            <div class="k3d-mkt-checkout-guarantee">
              <i class="fas fa-undo"></i>
              <h4>30-Day Guarantee</h4>
              <p>Not happy? Contact us within 30 days for a full refund.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    this.viewport.querySelector('.k3d-mkt-back-btn').addEventListener('click', () => {
      this.showView('detail', { productId: product.id });
    });

    const confirmBtn = this.viewport.querySelector('#k3d-mkt-confirm-btn');
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

      const result = await this.api.monetization.createCheckout(
        product,
        product.subscriptionTier || 'one-time',
        { metadata: { referrer: 'marketplace-ui' } }
      );

      if (result.success) {
        if (isLive && result.session?.id) {
          // LIVE MODE: Payment is handled by Stripe redirect.
          // The `stripe.redirectToCheckout()` in StripeBridge navigates away.
          // If we get here without redirect (e.g., popup blocker), show info.
          const resultDiv = this.viewport.querySelector('#k3d-mkt-checkout-result');
          resultDiv.innerHTML = `
            <div class="k3d-mkt-stripe-redirect-info">
              <i class="fas fa-external-link-alt"></i>
              <h3>Redirecting to Stripe...</h3>
              <p>If you are not redirected, <a href="${result.session.redirectUrl || '#'}" target="_blank">click here</a> to complete your purchase.</p>
              <p class="k3d-mkt-stripe-redirect-note">After payment, you will be returned to the marketplace.</p>
            </div>
          `;
          confirmBtn.style.display = 'none';

        } else if (result.session && !isLive) {
          // SIM MODE: Confirm simulated payment
          const confirmResult = await this.api.monetization.confirmPayment(result.session.id);
          if (confirmResult.success) {
            const resultDiv = this.viewport.querySelector('#k3d-mkt-checkout-result');
            resultDiv.innerHTML = `
              <div class="k3d-mkt-success-message">
                <i class="fas fa-check-circle"></i>
                <h3>Purchase Successful! (Simulated)</h3>
                <p>You now own <strong>${product.title}</strong>. License key: <code>${this.api.licenses.checkEntitlement(product.id)?.licenseKey || 'N/A'}</code></p>
                <p class="k3d-mkt-sim-note">Note: This was a simulated transaction. Configure Stripe for real payments.</p>
                <button class="k3d-mkt-btn k3d-mkt-btn-primary" onclick="this.closest('.k3d-mkt-detail').querySelector('.k3d-mkt-back-btn').click()">
                  Return to Product
                </button>
              </div>
            `;
            confirmBtn.style.display = 'none';
            this._updateSidebarCounts();
          }
        } else if (result.free) {
          // FREE item
          const resultDiv = this.viewport.querySelector('#k3d-mkt-checkout-result');
          resultDiv.innerHTML = `
            <div class="k3d-mkt-success-message">
              <i class="fas fa-check-circle"></i>
              <h3>Download Started!</h3>
              <p><strong>${product.title}</strong> is now yours — forever.</p>
              <button class="k3d-mkt-btn k3d-mkt-btn-primary" onclick="this.closest('.k3d-mkt-detail').querySelector('.k3d-mkt-back-btn').click()">
                Return to Product
              </button>
            </div>
          `;
          confirmBtn.style.display = 'none';
          this._updateSidebarCounts();
        }
      } else {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = isLive
          ? `<i class="fas fa-lock"></i> Pay with Stripe — ${this.formatPrice(product.price, product.currency)}`
          : `<i class="fas fa-flask"></i> Simulate Purchase — ${this.formatPrice(product.price, product.currency)}`;
        const resultDiv = this.viewport.querySelector('#k3d-mkt-checkout-result');
        resultDiv.innerHTML = `<div class="k3d-mkt-error">${result.error || 'Checkout failed. Please try again.'}</div>`;
      }
    });
  }

  /* ── Plugin Manager ── */

  async _renderPluginManager() {
    const installed = this.api.plugins.getInstalled();
    const marketPlugins = ['pro-brush-pack', 'hdri-skybox-collection', 'animation-rigging-pro',
      'material-mega-pack', 'physics-pro', 'sync-cloud-pro'];

    // Pre-fetch all marketplace manifests FIRST (await all promises).
    // Individual fetch failures return null instead of rejecting the entire batch.
    const marketManifests = (await Promise.all(
      marketPlugins.map(id => this.api.plugins.fetchManifest(id).catch(() => null))
    )).filter(Boolean);

    this.viewport.innerHTML = `
      <div class="k3d-mkt-header">
        <h1><i class="fas fa-puzzle-piece"></i> Plugin Manager</h1>
        <p>Manage installed plugins and discover new ones from the marketplace</p>
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2>Installed (${installed.length})</h2>
        </div>
        ${installed.length === 0
          ? '<p class="k3d-mkt-empty">No plugins installed yet. Browse the marketplace below.</p>'
          : `<div class="k3d-mkt-plugin-list">
              ${installed.map(p => `
                <div class="k3d-mkt-plugin-item ${p.enabled ? '' : 'disabled'}">
                  <div class="k3d-mkt-plugin-icon"><i class="fas ${p.icon || 'fa-puzzle-piece'}"></i></div>
                  <div class="k3d-mkt-plugin-info">
                    <h4>${p.name} <span class="k3d-mkt-plugin-version">v${p.version}</span></h4>
                    <p>${p.description}</p>
                    <div class="k3d-mkt-plugin-meta">
                      <span>by ${p.author}</span>
                      ${p.builtIn ? '<span class="k3d-mkt-badge">Built-in</span>' : ''}
                      <span>${p.price || 'Free'}</span>
                    </div>
                  </div>
                  <div class="k3d-mkt-plugin-actions">
                    <button class="k3d-mkt-btn ${p.enabled ? 'k3d-mkt-btn-warning' : 'k3d-mkt-btn-primary'} toggle-plugin" data-plugin="${p.id}">
                      ${p.enabled ? '<i class="fas fa-pause"></i> Disable' : '<i class="fas fa-play"></i> Enable'}
                    </button>
                    ${p.builtIn ? '' : '<button class="k3d-mkt-btn k3d-mkt-btn-secondary uninstall-plugin" data-plugin="' + p.id + '"><i class="fas fa-trash"></i></button>'}
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2>Available from Marketplace</h2>
        </div>
        <div class="k3d-mkt-plugin-list">
          ${marketManifests.map(manifest => this._renderMarketPlugin(manifest)).join('')}
        </div>
      </div>
    `;

    // Toggle plugin
    this.viewport.querySelectorAll('.toggle-plugin').forEach(btn => {
      btn.addEventListener('click', () => {
        const pluginId = btn.dataset.plugin;
        const plugin = this.api.plugins.getPlugin(pluginId);
        if (plugin.enabled) {
          this.api.plugins.disable(pluginId);
        } else {
          this.api.plugins.enable(pluginId);
        }
        this._renderPluginManager();
      });
    });

    // Uninstall
    this.viewport.querySelectorAll('.uninstall-plugin').forEach(btn => {
      btn.addEventListener('click', () => {
        this.api.plugins.uninstall(btn.dataset.plugin);
        this._renderPluginManager();
      });
    });

    // Install from marketplace
    this.viewport.querySelectorAll('.install-plugin').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing...';
        const result = await this.api.plugins.install(btn.dataset.pluginId);
        if (result.success) {
          this._renderPluginManager();
          this._updateSidebarCounts();
        } else {
          btn.disabled = false;
          btn.innerHTML = `<i class="fas fa-download"></i> Install`;
          alert(result.error || 'Installation failed');
        }
      });
    });
  }

  /* ── Helper: render a marketplace plugin card ── */

  _renderMarketPlugin(manifest) {
    const isInstalled = this.api.plugins.getPlugin(manifest.id);
    return `
      <div class="k3d-mkt-plugin-item">
        <div class="k3d-mkt-plugin-icon"><i class="fas ${manifest.icon}"></i></div>
        <div class="k3d-mkt-plugin-info">
          <h4>${manifest.name}</h4>
          <p>${manifest.description}</p>
          <div class="k3d-mkt-plugin-meta">
            <span>by ${manifest.author}</span>
            <span>${manifest.price}</span>
            <span>${manifest.category}</span>
          </div>
        </div>
        <div class="k3d-mkt-plugin-actions">
          ${isInstalled
            ? `<button class="k3d-mkt-btn k3d-mkt-btn-secondary" disabled><i class="fas fa-check"></i> Installed</button>`
            : `<button class="k3d-mkt-btn k3d-mkt-btn-primary install-plugin" data-plugin-id="${manifest.id}">
                <i class="fas fa-download"></i> Install
              </button>`
          }
        </div>
      </div>
    `;
  }

  /* ── Creator Dashboard ── */

  _renderCreatorDashboard() {
    const stats = this.api.creator.getDashboardStats();
    const profile = this.api.creator.getProfile();
    const drafts = this.api.creator.listDrafts();

    this.viewport.innerHTML = `
      <div class="k3d-mkt-header">
        <h1><i class="fas fa-user-astronaut"></i> Creator Dashboard</h1>
        <p>Manage your products, track earnings, and publish new assets</p>
      </div>

      <div class="k3d-mkt-creator-stats">
        <div class="k3d-mkt-stat-card">
          <i class="fas fa-cube"></i>
          <div class="k3d-mkt-stat-value">${stats.totalProducts}</div>
          <div class="k3d-mkt-stat-label">Products Published</div>
        </div>
        <div class="k3d-mkt-stat-card">
          <i class="fas fa-download"></i>
          <div class="k3d-mkt-stat-value">${stats.totalDownloads}</div>
          <div class="k3d-mkt-stat-label">Total Downloads</div>
        </div>
        <div class="k3d-mkt-stat-card">
          <i class="fas fa-dollar-sign"></i>
          <div class="k3d-mkt-stat-value">$${(stats.totalRevenue / 100).toFixed(2)}</div>
          <div class="k3d-mkt-stat-label">Total Revenue</div>
        </div>
        <div class="k3d-mkt-stat-card">
          <i class="fas fa-wallet"></i>
          <div class="k3d-mkt-stat-value">$${(stats.pendingPayout / 100).toFixed(2)}</div>
          <div class="k3d-mkt-stat-label">Available for Payout</div>
        </div>
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2>Your Products (${stats.publishedCount})</h2>
          <button class="k3d-mkt-btn k3d-mkt-btn-primary" id="k3d-mkt-new-product">
            <i class="fas fa-plus"></i> New Product
          </button>
        </div>
        ${drafts.length === 0
          ? '<p class="k3d-mkt-empty">No products yet. Create your first one!</p>'
          : `<div class="k3d-mkt-product-list">
              ${drafts.map(d => `
                <div class="k3d-mkt-product-list-item">
                  <div class="k3d-mkt-product-list-info">
                    <h4>${d.title}</h4>
                    <span class="k3d-mkt-product-status status-${d.status}">${d.status}</span>
                    <span>v${d.version}</span>
                    <span>${new Date(d.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <div class="k3d-mkt-product-list-actions">
                    <button class="k3d-mkt-btn k3d-mkt-btn-secondary">Edit</button>
                    ${d.status === 'draft' ? '<button class="k3d-mkt-btn k3d-mkt-btn-primary submit-draft" data-draft="' + d.id + '">Submit</button>' : ''}
                  </div>
                </div>
              `).join('')}
            </div>`
        }
      </div>

      <div class="k3d-mkt-section">
        <div class="k3d-mkt-section-header">
          <h2>Recent Transactions</h2>
        </div>
        ${stats.recentTransactions.length === 0
          ? '<p class="k3d-mkt-empty">No transactions yet.</p>'
          : `<div class="k3d-mkt-transaction-list">
              ${stats.recentTransactions.map(t => `
                <div class="k3d-mkt-transaction-item">
                  <span>${t.productTitle}</span>
                  <span>$${(t.amount / 100).toFixed(2)}</span>
                  <span class="status-${t.status}">${t.status}</span>
                  <span>${new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              `).join('')}
            </div>`
        }
      </div>
    `;

    // New product button
    const newBtn = this.viewport.querySelector('#k3d-mkt-new-product');
    if (newBtn) {
      newBtn.addEventListener('click', () => {
        const draft = this.api.creator.createDraft('My New Asset');
        alert(`Draft "${draft.title}" created! (ID: ${draft.id})`);
        this._renderCreatorDashboard();
      });
    }

    // Submit draft
    this.viewport.querySelectorAll('.submit-draft').forEach(btn => {
      btn.addEventListener('click', async () => {
        const result = this.api.creator.submitForReview(btn.dataset.draft);
        if (result.success) {
          // Auto-approve for simulation
          await this.api.creator.publish(btn.dataset.draft);
          this._renderCreatorDashboard();
        } else {
          alert(result.error);
        }
      });
    });
  }

  /* ── Favorites & Wishlist ── */

  _renderFavorites() {
    const favorites = this.api.store.getFavorites();
    this.viewport.innerHTML = `
      <div class="k3d-mkt-header">
        <h1><i class="fas fa-heart"></i> Favorites</h1>
        <p>${favorites.length} favorited product${favorites.length !== 1 ? 's' : ''}</p>
      </div>
      <div class="k3d-mkt-grid">
        ${favorites.map(p => this._renderProductCard(p)).join('')}
        ${favorites.length === 0 ? '<div class="k3d-mkt-empty">No favorites yet. Browse the marketplace and click the heart icon on products you like!</div>' : ''}
      </div>
    `;
    this.viewport.querySelectorAll('.k3d-mkt-product-card').forEach(card => {
      card.addEventListener('click', () => this.showView('detail', { productId: card.dataset.productId }));
    });
  }

  _renderWishlist() {
    const wishlist = this.api.store.getWishlist();
    this.viewport.innerHTML = `
      <div class="k3d-mkt-header">
        <h1><i class="fas fa-bookmark"></i> Wishlist</h1>
        <p>${wishlist.length} saved product${wishlist.length !== 1 ? 's' : ''}</p>
      </div>
      <div class="k3d-mkt-grid">
        ${wishlist.map(p => this._renderProductCard(p)).join('')}
        ${wishlist.length === 0 ? '<div class="k3d-mkt-empty">Your wishlist is empty. Bookmark products you want to purchase later.</div>' : ''}
      </div>
    `;
    this.viewport.querySelectorAll('.k3d-mkt-product-card').forEach(card => {
      card.addEventListener('click', () => this.showView('detail', { productId: card.dataset.productId }));
    });
  }

  /* ── 3D Model Preview ── */

  /**
   * Initialize the interactive 3D model preview for a product.
   * Finds the preview container and creates a ModelPreviewRenderer.
   * If the container isn't visible yet, schedules init for the next frame.
   */
  _initModelPreview(product) {
    const container = this.viewport?.querySelector('#k3d-mkt-model-preview');
    if (!container) return;

    // Wait for the container to have visible dimensions
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Container not yet laid out — retry on next frame
      requestAnimationFrame(() => this._initModelPreview(product));
      return;
    }

    // Destroy any existing preview first
    this._destroyModelPreview();

    try {
      this.previewRenderer = new ModelPreviewRenderer(container, product, {
        rotationSpeed: 25,
        backgroundColor: '#1a1a1a',
        autoRotate: true,
        interactive: true,
      });
      this.previewRenderer.init();
    } catch (err) {
      console.warn('[MarketplaceUI] Failed to initialize 3D preview:', err);
      // Show fallback icon
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:0.3;"><i class="fas fa-cube" style="font-size:80px;"></i></div>';
    }
  }

  /**
   * Destroy the current 3D model preview and clean up Three.js resources
   */
  _destroyModelPreview() {
    if (this.previewRenderer) {
      this.previewRenderer.destroy();
      this.previewRenderer = null;
    }
  }

  /* ── Helpers ── */

  _updateSidebarCounts() {
    const sidebar = this.container.querySelector('.k3d-mkt-sidebar');
    if (!sidebar) return;

    const badges = {
      'plugins': this.api.plugins.getInstalled().length,
      'favorites': this.api.store.getFavorites().length,
      'wishlist': this.api.store.getWishlist().length
    };

    sidebar.querySelectorAll('.k3d-mkt-nav-item[data-view]').forEach(item => {
      const view = item.dataset.view;
      const badge = item.querySelector('.k3d-mkt-badge');
      if (badge && badges[view] !== undefined) {
        badge.textContent = badges[view];
      }
    });
  }
}
