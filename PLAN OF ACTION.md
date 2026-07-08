# MARKETPLACE — PLAN OF ACTION

> **Goal:** Ship real plugin content so the marketplace functions as a working storefront with downloadable, installable assets and plugins — not just demo scaffolding.
>
> **Status:** Marketplace shell exists in `kamakazii_studio3D/marketplace/` with full UI, plugin lifecycle, Stripe integration, creator portal, licensing, and asset bundling. The missing piece is **real content delivery** — assets that actually download from Puter FS, reconstruct in the scene, and work as third-party plugins.

---

## Phase 1 — Asset Pipeline (CloudSystem → Scene)

### 1.1 Implement `_importPuterAsset()` in CloudSystem

**File:** `systems/CloudSystem.js` — currently a stub that falls through to procedural gen.

**What's needed:**

```js
async _importPuterAsset(asset, assetData) {
  // assetData contains: { geometry, materials, transforms, textures? }
  // 1. Parse assetData format (versioned schema)
  // 2. Reconstruct THREE.BufferGeometry from position/normal/uv arrays
  // 3. Create THREE.MeshStandardMaterial from serialized props
  // 4. Apply transforms (position, rotation, scale)
  // 5. Load embedded textures as data URLs or from Puter FS paths
  // 6. Add to scene, select, update outliner
}
```

**Sub-tasks:**

- [ ] Define the asset data JSON schema (`AssetSchema.md`)
- [ ] Add `THREE.Geometry` reconstruction from serialized buffers in `AssetBundler.js`
- [ ] Implement texture loading from Puter FS paths
- [ ] Add material reconstruction (PBR props, maps, emissive)
- [ ] Wire `_importPuterAsset` into `downloadAndImport()` return path
- [ ] Add error handling + fallback to procedural gen on corruption

### 1.2 Asset Upload Pipeline

**Files:** `AssetBundler.js`, `CreatorPortal.js`

- [ ] Extend `AssetBundler.exportBundle()` to write to Puter FS instead of just downloading a `.k3dasset` file
- [ ] Add `AssetBundler.publishToCloud(storeListing)` — uploads bundle JSON + embedded textures to `CloudAssets/{id}/`
- [ ] Wire CreatorPortal publish flow to trigger cloud upload
- [ ] Add progress callbacks for large asset uploads

### 1.3 Asset Versioning

- [ ] Store version history in Puter KV (`CloudAssets/{id}/versions`)
- [ ] `AssetBundler` diff format — only store changed geometry/materials per version
- [ ] Fallback to latest version if none specified

---

## Phase 2 — Plugin Content Delivery

### 2.1 Plugin Sandboxing

**File:** `PluginRegistry.js` — sandboxed execution is documented but not implemented.

```js
// Current: plugin hooks run in the same scope
this.hooks.get(hookName).push({ pluginId, handler });

// Needed: sandboxed evaluation via iframe or Web Worker
```

**Options (choose one):**

1. **Web Worker sandbox** — plugin code runs in a Worker, communicates via `postMessage`. Secure but limits DOM/Three.js access.
2. **Proxy sandbox** — wrap plugin scope with `Proxy` that restricts globals (`window`, `document`, `fetch`, etc.). Lightweight but not fully secure.
3. **Simple scope isolation** — wrap plugin `execute()` in a try/catch with limited args (only editor API subset).

**Sub-tasks:**

- [ ] Implement chosen sandbox strategy
- [ ] Define plugin API surface (what editor methods are exposed)
- [ ] Add `PluginRegistry.validateSandbox(manifest)` that checks for dangerous patterns
- [ ] Test with first-party plugins (AutoRetopology, VoxelEngine, NaturePack)

### 2.2 Plugin Market API

**File:** `PluginRegistry.js` — `fetchManifest()` uses IndexedDB cache + hardcoded local catalog.

**Needed:** Real API-backed manifest fetching.

- [ ] Define API spec (`GET /v1/marketplace/plugins/:id`)
- [ ] Add configurable `API_BASE` (default `https://api.kamakazii.com/v1/marketplace`)
- [ ] Implement response caching with `Cache-Control` headers + IndexedDB fallback
- [ ] Add `searchMarketplace()` with real query params (`?q=&category=&sort=`)
- [ ] Implement offline mode: when API is unreachable, serve from IndexedDB cache

### 2.3 Plugin Dependencies

**File:** `PluginRegistry.js` — dependency resolution exists but is basic.

- [ ] Implement recursive dependency resolution (install deps before plugin)
- [ ] Version range matching (e.g. `>=1.0.0 <2.0.0`)
- [ ] Circular dependency detection
- [ ] Dependency bundles (multiple plugins in one package)

---

## Phase 3 — Real Payments

### 3.1 Stripe Production Mode

**File:** `StripeBridge.js` — currently simulated unless env vars are set.

- [ ] Create a simple backend endpoint (Cloudflare Worker or Vercel function) for `/create-checkout-session`
- [ ] Add webhook handler for `checkout.session.completed` to grant entitlements
- [ ] Implement subscription management (cancel, upgrade, downgrade)
- [ ] Add Stripe Tax integration for automatic tax calculation
- [ ] Test with Stripe test mode (`pk_test_...`)

### 3.2 License Enforcement

**File:** `LicenseManager.js`

- [ ] Implement watermark overlay for unlicensed assets (currently stubbed)
- [ ] Add periodic entitlement re-validation (check expiry on editor idle)
- [ ] Store entitlements in Puter KV for cross-device sync
- [ ] Add license key validation UI in settings panel

---

## Phase 4 — UI & UX

### 4.1 In-Editor Plugin Store

**File:** `marketplace-ui.js`

- [ ] Add "Browse Plugins" tab (separate from assets)
- [ ] Plugin detail view with screenshots, version history, changelog
- [ ] One-click install from marketplace (currently requires tab refresh)
- [ ] Plugin update notifications badge

### 4.2 Asset Preview Improvements

**File:** `ModelPreviewRenderer.js`

- [ ] Load actual GLTF/GLB previews instead of procedural fallbacks
- [ ] Add environment map for reflections
- [ ] Ground shadow + contact shadows
- [ ] Skeleton animation playback for rigged assets
- [ ] LOD visualization

### 4.3 Creator Dashboard Enhancements

**File:** `CreatorPortal.js`

- [ ] Analytics charts (sales over time, download geography)
- [ ] Review management (reply to reviews, report abuse)
- [ ] Payout history with filters
- [ ] Promo code management UI

---

## Phase 5 — Infrastructure

### 5.1 Puter FS Asset Storage

- [ ] Define directory structure: `CloudAssets/{creatorId}/{assetId}/`
- [ ] Upload/download with progress tracking
- [ ] Thumbnail generation on upload (server-side)
- [ ] CDN caching for popular assets

### 5.2 Marketplace Backend API

Suggested endpoints:

```
GET    /v1/marketplace/products          — list/search
GET    /v1/marketplace/products/:id      — detail
POST   /v1/marketplace/products          — create listing
PUT    /v1/marketplace/products/:id      — update
DELETE /v1/marketplace/products/:id      — delist

GET    /v1/marketplace/plugins           — list plugins
GET    /v1/marketplace/plugins/:id       — plugin detail
POST   /v1/marketplace/plugins/install   — trigger install

POST   /v1/marketplace/checkout          — create Stripe session
POST   /v1/marketplace/webhook           — Stripe webhook

GET    /v1/marketplace/creators/:id      — creator profile
GET    /v1/marketplace/creators/:id/earnings — payout info
```

### 5.3 Content Moderation

- [ ] Auto-scan plugin code for malicious patterns
- [ ] Manual review queue for first submissions
- [ ] Report/dispute resolution flow
- [ ] Age rating / content warnings

---

## Immediate Action Items (Next Sprint)

| Priority | Task | Owner | Est. |
|----------|------|-------|------|
| 🔴 P0 | Implement `_importPuterAsset()` — real asset reconstruction | — | 3d |
| 🔴 P0 | Define asset JSON schema | — | 1d |
| 🟡 P1 | Add Puter FS upload to AssetBundler publish flow | — | 2d |
| 🟡 P1 | Plugin sandboxing (Proxy scope isolation) | — | 3d |
| 🟢 P2 | Stripe test mode checkout endpoint | — | 2d |
| 🟢 P2 | License watermark enforcement | — | 1d |
| 🔵 P3 | In-editor plugin store browse tab | — | 2d |

---

## Schema: Asset JSON Format (Draft)

```json
{
  "version": "1.0.0",
  "assetId": "v_hero_01",
  "format": "k3dasset",
  "generatedAt": 1743552000000,

  "items": [
    {
      "name": "Voxel Hero",
      "type": "mesh",
      "geometry": {
        "type": "BufferGeometry",
        "attributes": {
          "position": { "array": [/* Float32Array flattened */], "itemSize": 3, "count": 1200 },
          "normal":  { "array": [/* ... */], "itemSize": 3, "count": 1200 },
          "uv":      { "array": [/* ... */], "itemSize": 2, "count": 1200 }
        },
        "index": { "array": [/* Uint32Array flattened */], "count": 6000 }
      },
      "material": {
        "type": "MeshStandardMaterial",
        "color": 0x3333cc,
        "roughness": 0.5,
        "metalness": 0.1,
        "map": "textures/hero_diffuse.png"   // relative to asset bundle
      },
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "children": []
    }
  ],

  "textures": {
    "textures/hero_diffuse.png": "data:image/png;base64,..."
  }
}
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Puter FS write quota exceeded | Medium | High | Compress assets, warn before publish |
| Stripe webhook delivery failures | Low | High | Idempotency keys, retry queue |
| Plugin sandbox bypass | Low | Critical | Regular audit, manual review for paid plugins |
| Asset format breaking changes | Medium | Medium | Versioned schema, migration layer |
| CDN cache invalidation delays | Low | Low | Cache-bust via asset version in URL |
| Browser storage quota (IndexedDB) | Medium | Medium | LRU eviction, cloud-first strategy |

---

## Success Metrics

- [ ] A user can publish a plugin from Creator Dashboard and install it from the store
- [ ] Asset bundles download from Puter FS and reconstruct in-scene correctly
- [ ] Stripe test-mode payments complete end-to-end
- [ ] License enforcement shows watermark for unlicensed assets
- [ ] Plugin removal cleans up all hooks and resources
- [ ] Offline: marketplace works from IndexedDB cache
- [ ] Offline: installed plugins continue to function
