/**
 * MarketplaceStore — Product catalog, search, browsing, reviews, and featured listings.
 *
 * All product data that users browse is managed here.
 * Integrates with MonetizationEngine for purchase and CreatorPortal for publishing.
 *
 * Features:
 * - Full-text search (title, description, tags, creator)
 * - Category browsing with filters
 * - Review & rating system
 * - Featured / trending / new-releases collections
 * - Product version history
 * - Related products
 * - Favorites / wishlist
 */

export class MarketplaceStore {
  constructor(editorState, monetizationEngine) {
    this.editor = editorState;
    this.monetization = monetizationEngine;

    // Product catalog
    this.products = new Map();       // productId -> ProductListing
    this.categories = this._initCategories();

    // User interactions
    this.reviews = new Map();        // productId -> Review[]
    this.favorites = new Set();      // productId[] (current user's favorites)
    this.wishlist = new Set();       // productId[] (current user's wishlist)

    // Collections
    this.featuredIds = [];           // hand-picked featured products
    this.trendingIds = [];           // algorithmically ranked
    this.newReleases = [];           // sorted by publish date

    // Seed with demo products
    this._seedDemoProducts();
  }

  /* ── Categories ── */

  _initCategories() {
    return {
      'modeling': { id: 'modeling', name: 'Modeling', icon: 'fa-cube', count: 0 },
      'sculpting': { id: 'sculpting', name: 'Sculpting', icon: 'fa-paint-brush', count: 0 },
      'materials': { id: 'materials', name: 'Materials & Textures', icon: 'fa-palette', count: 0 },
      'animation': { id: 'animation', name: 'Animation & Rigging', icon: 'fa-bone', count: 0 },
      'environment': { id: 'environment', name: 'Environment & HDRI', icon: 'fa-image', count: 0 },
      'physics': { id: 'physics', name: 'Physics & Simulation', icon: 'fa-forward', count: 0 },
      'workflow': { id: 'workflow', name: 'Workflow & Tools', icon: 'fa-tools', count: 0 },
      'generator': { id: 'generator', name: 'Procedural Generators', icon: 'fa-magic', count: 0 },
      'misc': { id: 'misc', name: 'Miscellaneous', icon: 'fa-archive', count: 0 }
    };
  }

  getCategories() {
    return Object.values(this.categories);
  }

  getCategory(id) {
    return this.categories[id] || this.categories.misc;
  }

  /* ── Product CRUD ── */

  /**
   * Create a new product listing (called by CreatorPortal on publish)
   */
  async createListing(productData) {
    const listing = {
      id: productData.id || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: productData.title || 'Untitled',
      description: productData.description || '',
      category: productData.category || 'misc',
      tags: productData.tags || [],
      price: productData.price || 0,
      currency: productData.currency || 'USD',
      license: productData.license || 'standard',
      tierId: productData.tierId || 'one-time',
      version: productData.version || '1.0.0',
      thumbnail: productData.thumbnail || null,
      previewImages: productData.previewImages || [],
      previewVideo: productData.previewVideo || null,
      creator: productData.creator || 'Anonymous',
      creatorId: productData.creatorId || null,
      bundleData: productData.bundleData || null,

      // Stats
      viewCount: 0,
      downloadCount: 0,
      favoriteCount: 0,
      rating: 0,
      reviewCount: 0,
      salesCount: 0,

      // Timestamps
      createdAt: productData.createdAt || Date.now(),
      updatedAt: Date.now(),

      // Status
      status: 'published', // draft, review, published, archived
      featured: false
    };

    this.products.set(listing.id, listing);

    // Update category count
    if (this.categories[listing.category]) {
      this.categories[listing.category].count++;
    }

    // Add to new releases
    this.newReleases.unshift(listing.id);
    if (this.newReleases.length > 50) this.newReleases.pop();

    console.log(`[MarketplaceStore] Listing created: "${listing.title}" by ${listing.creator}`);
    return listing;
  }

  /**
   * Update an existing listing
   */
  async updateListing(productId, updates) {
    const listing = this.products.get(productId);
    if (!listing) throw new Error(`Listing "${productId}" not found`);

    // Track category changes for counts
    const oldCategory = listing.category;

    Object.assign(listing, updates);
    listing.updatedAt = Date.now();

    // Update category counts if changed
    if (updates.category && updates.category !== oldCategory) {
      if (this.categories[oldCategory]) this.categories[oldCategory].count--;
      if (this.categories[updates.category]) this.categories[updates.category].count++;
    }

    return listing;
  }

  /**
   * Archive / remove a listing
   */
  async archiveListing(productId) {
    const listing = this.products.get(productId);
    if (!listing) throw new Error(`Listing "${productId}" not found`);
    listing.status = 'archived';
    if (this.categories[listing.category]) {
      this.categories[listing.category].count--;
    }
    return listing;
  }

  /* ── Search & Browse ── */

  /**
   * Full-text search across title, description, tags, and creator
   */
  search(query, filters = {}) {
    if (!query || query.trim() === '') return this.browse(filters);

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    const results = [];

    for (const [id, product] of this.products) {
      if (product.status !== 'published') continue;

      const searchText = [
        product.title,
        product.description,
        ...(product.tags || []),
        product.creator
      ].join(' ').toLowerCase();

      const matches = terms.every(term => searchText.includes(term));
      if (!matches) continue;

      // Apply category filter
      if (filters.category && product.category !== filters.category) continue;

      // Apply price range filter
      if (filters.minPrice !== undefined && product.price < filters.minPrice) continue;
      if (filters.maxPrice !== undefined && product.price > filters.maxPrice) continue;

      // Apply license filter
      if (filters.license && product.license !== filters.license) continue;

      // Apply free/paid filter
      if (filters.priceType === 'free' && product.price > 0) continue;
      if (filters.priceType === 'paid' && product.price === 0) continue;

      // Apply rating filter
      if (filters.minRating && product.rating < filters.minRating) continue;

      results.push({ ...product, id });
    }

    // Sort
    const sortBy = filters.sortBy || 'relevance';
    this._sortResults(results, sortBy);

    return { results, total: results.length };
  }

  /**
   * Browse all published products with optional filters
   */
  browse(filters = {}) {
    let results = [];

    for (const [id, product] of this.products) {
      if (product.status !== 'published') continue;

      if (filters.category && product.category !== filters.category) continue;
      if (filters.creatorId && product.creatorId !== filters.creatorId) continue;
      if (filters.minPrice !== undefined && product.price < filters.minPrice) continue;
      if (filters.maxPrice !== undefined && product.price > filters.maxPrice) continue;
      if (filters.priceType === 'free' && product.price > 0) continue;
      if (filters.priceType === 'paid' && product.price === 0) continue;
      if (filters.minRating && product.rating < filters.minRating) continue;

      results.push({ ...product, id });
    }

    const sortBy = filters.sortBy || 'newest';
    this._sortResults(results, sortBy);

    return { results, total: results.length };
  }

  _sortResults(results, sortBy) {
    const sorters = {
      'newest': (a, b) => b.createdAt - a.createdAt,
      'oldest': (a, b) => a.createdAt - b.createdAt,
      'price-asc': (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'rating': (a, b) => b.rating - a.rating,
      'popular': (a, b) => b.downloadCount - a.downloadCount,
      'relevance': (a, b) => b.downloadCount - a.downloadCount
    };
    results.sort(sorters[sortBy] || sorters.newest);
  }

  /* ── Product Detail ── */

  getProduct(productId) {
    const product = this.products.get(productId);
    if (!product || product.status === 'archived') return null;

    // Increment view count
    product.viewCount++;

    return {
      ...product,
      id: productId,
      isFavorited: this.favorites.has(productId),
      isInWishlist: this.wishlist.has(productId),
      reviews: this.getReviews(productId),
      relatedProducts: this.getRelated(productId, 6)
    };
  }

  /* ── Collections ── */

  getFeatured() {
    return this.featuredIds
      .map(id => this.products.get(id))
      .filter(p => p && p.status === 'published')
      .slice(0, 12);
  }

  getTrending() {
    // Algorithm: sort by (downloads * 0.4 + favorites * 0.3 + sales * 0.3) within last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = [];

    for (const [id, product] of this.products) {
      if (product.status !== 'published') continue;
      if (product.createdAt < thirtyDaysAgo) continue;
      recent.push(product);
    }

    recent.sort((a, b) => {
      const scoreA = a.downloadCount * 0.4 + a.favoriteCount * 0.3 + a.salesCount * 0.3;
      const scoreB = b.downloadCount * 0.4 + b.favoriteCount * 0.3 + b.salesCount * 0.3;
      return scoreB - scoreA;
    });

    return recent.slice(0, 12);
  }

  getNewReleases() {
    return this.newReleases
      .map(id => this.products.get(id))
      .filter(p => p && p.status === 'published')
      .slice(0, 12);
  }

  /**
   * Get related products (same category, similar tags)
   */
  getRelated(productId, count = 6) {
    const product = this.products.get(productId);
    if (!product) return [];

    const candidates = [];
    for (const [id, p] of this.products) {
      if (id === productId || p.status !== 'published') continue;

      let score = 0;
      if (p.category === product.category) score += 3;
      const sharedTags = p.tags?.filter(t => product.tags?.includes(t)) || [];
      score += sharedTags.length;

      if (p.creator === product.creator) score += 1;

      if (score > 0) {
        candidates.push({ product: p, score, id });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, count).map(c => ({ ...c.product, id: c.id }));
  }

  /* ── Reviews & Ratings ── */

  /**
   * Add a review for a product
   */
  addReview(productId, userId, userName, rating, comment) {
    const product = this.products.get(productId);
    if (!product) throw new Error('Product not found');

    const review = {
      id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      productId,
      userId,
      userName,
      rating: Math.max(1, Math.min(5, rating)),
      comment,
      createdAt: Date.now(),
      helpful: 0,
      verified: false
    };

    if (!this.reviews.has(productId)) {
      this.reviews.set(productId, []);
    }
    this.reviews.get(productId).push(review);

    // Update product rating
    const allReviews = this.reviews.get(productId);
    product.rating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    product.reviewCount = allReviews.length;

    return review;
  }

  /**
   * Get reviews for a product
   */
  getReviews(productId) {
    return this.reviews.get(productId) || [];
  }

  /**
   * Mark a review as helpful
   */
  markReviewHelpful(reviewId) {
    for (const reviews of this.reviews.values()) {
      const review = reviews.find(r => r.id === reviewId);
      if (review) {
        review.helpful++;
        return review;
      }
    }
    return null;
  }

  /* ── Favorites & Wishlist ── */

  toggleFavorite(productId) {
    if (this.favorites.has(productId)) {
      this.favorites.delete(productId);
      const product = this.products.get(productId);
      if (product) product.favoriteCount--;
      return { favorited: false };
    } else {
      this.favorites.add(productId);
      const product = this.products.get(productId);
      if (product) product.favoriteCount++;
      return { favorited: true };
    }
  }

  getFavorites() {
    return Array.from(this.favorites)
      .map(id => this.products.get(id))
      .filter(p => p && p.status === 'published');
  }

  toggleWishlist(productId) {
    if (this.wishlist.has(productId)) {
      this.wishlist.delete(productId);
      return { wishlisted: false };
    } else {
      this.wishlist.add(productId);
      return { wishlisted: true };
    }
  }

  getWishlist() {
    return Array.from(this.wishlist)
      .map(id => this.products.get(id))
      .filter(p => p && p.status === 'published');
  }

  /* ── Demo Seed Products ── */

  _seedDemoProducts() {
    const products = [
      {
        id: 'demo-pro-brush-pack', title: 'Pro Brush Pack',
        description: '50+ premium sculpting brushes with alpha stamps, custom falloff curves, and pressure-sensitive stroke smoothing. Includes clay, inflate, pinch, crease, and flatten brushes.',
        category: 'sculpting', tags: ['sculpting', 'brushes', 'alpha', 'stamps'],
        price: 1499, currency: 'USD', license: 'commercial',
        creator: 'Artisan3D', creatorId: 'creator-artisan',
        downloadCount: 342, favoriteCount: 89, rating: 4.5, reviewCount: 23, salesCount: 156,
        featured: true, thumbnail: null,
        createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-hdri-skies', title: 'HDRI Skybox Vol.1',
        description: '20 high-resolution (8K) HDR environment maps covering sunrise, sunset, overcast, night sky, and studio lighting setups. Optimized for IBL rendering.',
        category: 'environment', tags: ['hdri', 'skybox', 'environment', 'lighting'],
        price: 999, currency: 'USD', license: 'standard',
        creator: 'EnvLight Labs', creatorId: 'creator-envlight',
        downloadCount: 567, favoriteCount: 134, rating: 4.8, reviewCount: 41, salesCount: 289,
        featured: true, thumbnail: null,
        createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-rigging-pro', title: 'Animation Rigging Pro',
        description: 'Advanced IK/FK rigging system with auto-rigging for bipeds, quadrupeds, and creatures. Includes weight painting tools, mirroring, and pose library.',
        category: 'animation', tags: ['rigging', 'animation', 'ik', 'fk', 'auto-rig'],
        price: 2499, currency: 'USD', license: 'commercial',
        creator: 'RigMaster', creatorId: 'creator-rigmaster',
        downloadCount: 198, favoriteCount: 67, rating: 4.3, reviewCount: 19, salesCount: 87,
        featured: false, thumbnail: null,
        createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-material-mega', title: 'Material Mega Pack',
        description: '200+ high-quality PBR materials with fully procedural node graphs. Includes metals, fabrics, wood, stone, organic, sci-fi, and fantasy categories.',
        category: 'materials', tags: ['materials', 'pbr', 'textures', 'procedural'],
        price: 3999, currency: 'USD', license: 'extended',
        creator: 'ShaderForge', creatorId: 'creator-shaderforge',
        downloadCount: 421, favoriteCount: 156, rating: 4.7, reviewCount: 52, salesCount: 198,
        featured: true, thumbnail: null,
        createdAt: Date.now() - 45 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-physics-pro', title: 'Physics Pro Toolkit',
        description: 'Advanced physics toolkit with SPH fluid simulation, soft body dynamics, cloth solver, ragdoll system, and vehicle physics. GPU-accelerated compute.',
        category: 'physics', tags: ['physics', 'sph', 'fluid', 'cloth', 'ragdoll'],
        price: 1999, currency: 'USD', license: 'commercial',
        creator: 'Simulate Labs', creatorId: 'creator-simulate',
        downloadCount: 276, favoriteCount: 88, rating: 4.6, reviewCount: 31, salesCount: 132,
        featured: false, thumbnail: null,
        createdAt: Date.now() - 20 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-nature-gen', title: 'Nature Procedural Generator',
        description: 'Generate entire forests, mountains, rivers, and biomes with a single click. 30+ tree species, 50+ rock types, terrain erosion simulation.',
        category: 'generator', tags: ['generator', 'nature', 'terrain', 'trees', 'procedural'],
        price: 1499, currency: 'USD', license: 'standard',
        creator: 'NatureForge', creatorId: 'creator-natureforge',
        downloadCount: 189, favoriteCount: 73, rating: 4.4, reviewCount: 17, salesCount: 94,
        featured: false, thumbnail: null,
        createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-free-voxel-kit', title: 'Free Voxel Starter Kit',
        description: 'A collection of 20 free voxel models to get started. Includes basic shapes, trees, rocks, and a simple character. CC0 license — no attribution needed.',
        category: 'modeling', tags: ['voxel', 'free', 'starter', 'cc0'],
        price: 0, currency: 'USD', license: 'free',
        creator: 'Kamakazii Studio', creatorId: 'creator-kamakazii',
        downloadCount: 1234, favoriteCount: 312, rating: 4.9, reviewCount: 87, salesCount: 0,
        featured: true, thumbnail: null,
        createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000
      },
      {
        id: 'demo-cyberpunk-city', title: 'Cyberpunk City Kit',
        description: 'Modular cyberpunk city building kit. 45+ unique modules including neon signs, holographic billboards, futuristic vehicles, and street props.',
        category: 'modeling', tags: ['cyberpunk', 'city', 'modular', 'sci-fi', 'buildings'],
        price: 2999, currency: 'USD', license: 'commercial',
        creator: 'UrbanMesh', creatorId: 'creator-urbanmesh',
        downloadCount: 445, favoriteCount: 178, rating: 4.8, reviewCount: 38, salesCount: 210,
        featured: true, thumbnail: null,
        createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000
      }
    ];

    for (const p of products) {
      this.products.set(p.id, p);
      if (this.categories[p.category]) this.categories[p.category].count++;
      if (p.featured) this.featuredIds.push(p.id);
      this.newReleases.push(p.id);
    }

    // Seed some reviews
    const reviewers = [
      { userId: 'user-1', userName: 'PixelArtist' },
      { userId: 'user-2', userName: 'GameDevJane' },
      { userId: 'user-3', userName: 'BlenderMaster' }
    ];

    const comments = [
      'Absolutely fantastic! This saved me hours of work.',
      'Great quality, but could use more documentation.',
      'Exactly what I needed. The setup was seamless.',
      'Good value for the price. Would recommend.',
      'Outstanding quality! The attention to detail is incredible.',
      'Works perfectly in my workflow. 5 stars!',
      'Decent but a bit overpriced for what you get.',
      'The best asset pack I have downloaded this year.',
      'Clean topology, great PBR textures. A++',
      'Support was very responsive when I had questions.'
    ];

    for (const [index, product] of this.products) {
      const reviewCount = Math.floor(Math.random() * 4) + 1;
      for (let i = 0; i < reviewCount; i++) {
        const reviewer = reviewers[Math.floor(Math.random() * reviewers.length)];
        const comment = comments[Math.floor(Math.random() * comments.length)];
        const rating = Math.floor(Math.random() * 2) + 4; // 4 or 5
        this.addReview(index, reviewer.userId, reviewer.userName, rating, comment);

        // Mark last one as verified
        const reviews = this.reviews.get(index);
        if (reviews && i === reviewCount - 1) {
          reviews[reviews.length - 1].verified = true;
        }
      }
    }
  }

  /* ── Serialization ── */

  serialize() {
    return {
      products: Array.from(this.products.entries()),
      reviews: Array.from(this.reviews.entries()),
      favorites: Array.from(this.favorites),
      wishlist: Array.from(this.wishlist),
      featuredIds: this.featuredIds,
      trendingIds: this.trendingIds,
      newReleases: this.newReleases
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.products) this.products = new Map(data.products);
    if (data.reviews) this.reviews = new Map(data.reviews);
    if (data.favorites) this.favorites = new Set(data.favorites);
    if (data.wishlist) this.wishlist = new Set(data.wishlist);
    if (data.featuredIds) this.featuredIds = data.featuredIds;
    if (data.trendingIds) this.trendingIds = data.trendingIds;
    if (data.newReleases) this.newReleases = data.newReleases;
  }
}
