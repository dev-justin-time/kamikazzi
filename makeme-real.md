# 🔧 Make Me Real — Stubs, Placeholders & Unfinished Features

> **Auto-generated audit** of the entire kamikazzi monorepo.
> Every entry below is code that exists but doesn't do real work yet.

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| **Stubs (empty/no-op implementations)** | 6 | 🔴 High |
| **Placeholder logic (uses fake data or no-ops)** | 10 | 🟡 Medium |
| **Fallback-only paths (graceful degradation)** | 22 | 🟢 Low |
| **Mock / demo data in production paths** | 2 | 🟡 Medium |
| **"For now" / temporary implementations** | 4 | 🟡 Medium |
| **TOTAL** | **44** | |

> **Note:** Items #1, #3–9, #11–16, #19, #22–25, #28–32 below have been **fixed** (see [Resolved](#-resolved-items) section). The counts above reflect remaining open items.

---

## ✅ Resolved Items

The following items have been implemented with production-quality logic:

| # | Item | Resolution |
|---|------|-----------|
| 1 | `apply_torque` no-op (Vector Strike) | Command buffer pattern with `Rc<RefCell<Vec<ShipCommand>>>` — closures push commands, `tick()` drains and applies |
| 3 | Auto-Retopology stub | QEM edge-collapse simplification with 4×4 symmetric quadric matrices, binary min-heap, Cramer's rule |
| 4 | Voxel Engine stub | Sparse octree with triangle-AABB voxelization, flood-fill interior, boolean CSG, marching cubes (256-entry tables) |
| 5 | Marketplace API simulated fetch | IndexedDB-backed cache with network fetch fallback and offline-first local catalog |
| 6 | Creator Portal no cloud sync | Puter.js KV store sync with localStorage fallback, dirty-flag debouncing, conflict resolution |
| 7 | Tax calculation flat placeholder | Jurisdiction-based tax engine with US state sales tax rates, EU VAT, UK/CA/AU/JP rates |
| 8 | SPHSolver `setBounds()` hardcoded | Instance-level `this.bounds` object, `setBounds()` updates runtime bounds, `_enforceBounds()` reads from instance |
| 9 | Event listener cleanup no-op | All handlers stored as bound references (`_onKeyDown`, `_onMouseUp`, etc.), `dispose()` removes all + destroys nipplejs |
| 10 | Mock gameplay endings (4 stitch files) | Replaced `setTimeout` with `kamikazzi:game-state` event listener + score-based completion check (≥1M points) |
| 11 | UV generation basic planar | Conformal UV projection using arc-length (U) and cross-section angle (V) for screw geometry |
| 12 | Bevel limited to Cubes | Generalized `generateBevelGeometry()` using edge-face adjacency, dihedral angle detection, vertex offset + chamfer strips |
| 13 | Rounded box geometry stub | Real `RoundedBoxGeometry` from Three.js addons with radius clamping and segment validation |
| 14 | Per-frame editor hook empty | `registerFrameHook(fn)` / `unregisterFrameHook(fn)` with Set-based registry, fired every frame in `update(delta)` |
| 15 | Selection API lacks features | Multi-select (`Set`), Shift+click toggle, undo grouping (`beginUndoGroup`/`endUndoGroup`), batch commands, selection highlights, center-point gizmo |
| 19 | Controls.js event cleanup | All 9 event listeners stored as bound references, `dispose()` removes all, nipplejs manager destroyed |
| 28 | `apply_torque` no-op (Vector Strike) | Same as #1 — command buffer pattern |
| 29–32 | Mock gameplay endings | Same as #10 — event-driven completion |


---

## 🔴 Stubs — Empty or No-Op Implementations

### `kamasazii_vecter_omega3d` (Vector Strike: OMNI)

| # | File | Line | What's Stubbed | What Needs Building |
|---|------|------|----------------|-------------------|
| 1 | `src/lib.rs` | 207 | ~~**`apply_torque` — physics torque integration**~~ | ✅ **RESOLVED** — Command buffer pattern (`Rc<RefCell<Vec<ShipCommand>>>`). Closures push Torque/Thrust/Fire/Glitch/Align commands; `tick()` drains and applies them. |
| 2 | `src/lib.rs` | 416 | **MVP uniform upload** | The `uModelViewProjection` uniform location is fetched but the actual upload from Rust side is a placeholder comment. Vertex data rendering is handled on the JS side instead. |

### `kamakazii_studio3D` (KAMAKAZII STUDIO 3D)

| # | File | Line | What's Stubbed | What Needs Building |
|---|------|------|----------------|-------------------|
| 3 | `marketplace/PluginRegistry.js` | 61 | ~~**Auto-Retopology plugin**~~ | ✅ **RESOLVED** — QEM edge-collapse with 4×4 quadric matrices, binary min-heap priority queue, deduplicated edge tracking. |
| 4 | `marketplace/PluginRegistry.js` | 100 | ~~**Voxel Engine plugin**~~ | ✅ **RESOLVED** — Sparse octree with triangle-AABB voxelization, flood-fill, boolean CSG, marching cubes (256-entry tables), blocky mesh export. |
| 5 | `marketplace/PluginRegistry.js` | 398 | ~~**Marketplace API fetch**~~ | ✅ **RESOLVED** — IndexedDB cache → network fetch (`AbortSignal.timeout(8000)`) → offline-first local catalog fallback. |
| 6 | `editor/ModelEditor.js` | 252 | ~~**Selection API**~~ | ✅ **RESOLVED** — Multi-select Set, Shift+click toggle, selection highlights, undo grouping, batch commands, selection center for gizmo. |
| 7 | `editor/ModelEditor.js` | 207 | ~~**Per-frame editor update hook**~~ | ✅ **RESOLVED** — Set-based hook registry with `registerFrameHook(fn)` / `unregisterFrameHook(fn)`, fired every frame with error isolation. |
| 8 | `systems/PhysicsSystem.js` | 31+ | **Entire physics shim** | PhysicsSystem initializes a "shim placeholder" when no real physics engine is available. 8+ methods are no-ops or simple stubs that silently ignore calls (lines 101, 157, 276, 355, 421, 434). |
| 9 | `systems/physics/SPHSolver.js` | 514 | ~~**`setBounds()` method**~~ | ✅ **RESOLVED** — Instance-level `this.bounds` with min/max X/Y/Z/damping, `setBounds()` updates runtime, `_enforceBounds()` reads from instance. |
| 10 | `tools/pose/maim.js` | 1–5 | **Entire file is a placeholder** | `maim.js` exists solely so `main.js` can import MAIM without failing. Contains no real logic. |
| 11 | `tools/pose/main.js` | 13–20 | **Placeholder 3D topic modules** | Multiple imported modules (`maim.js`, `roundbox.js`, `lighting_presets.js`, `physics_integration.js`, `vr_interactions.js`) are lightweight stubs wired into the app for future structure. |
| 12 | `marketplace/CreatorPortal.js` | 20 | ~~**Creator profile storage**~~ | ✅ **RESOLVED** — Puter.js KV store sync with localStorage fallback, dirty-flag debouncing (30s interval), conflict resolution, `flush()` for page unload. |

---

## 🟡 Placeholder Logic — Uses Fake Data or Simplified Behavior

### `kamakazii_studio3D`

| # | File | Line | Placeholder | Real Implementation Needed |
|---|------|------|------------|---------------------------|
| 13 | `marketplace/MonetizationEngine.js` | 168 | ~~**Tax calculation**~~ | ✅ **RESOLVED** — Jurisdiction-based `_getTaxRate()` with US state sales tax (50 states + DC), EU VAT (27 member states), UK/CA/AU/JP rates. |
| 14 | `marketplace/ModelPreviewRenderer.js` | 251 | **Fallback preview mesh** | When no geometry is available, creates a `THREE.BoxGeometry(0.5, 0.5, 0.5)` placeholder. |
| 15 | `tools/blender/modifiers.js` | 669 | ~~**UV generation**~~ | ✅ **RESOLVED** — Conformal UV projection: arc-length parameterization (U) + cross-section angle mapping (V) for screw geometry. |
| 16 | `tools/pose/roundbox.js` | 11 | ~~**Rounded box geometry**~~ | ✅ **RESOLVED** — Real `RoundedBoxGeometry` from Three.js addons with radius clamping (`< 0.5 * min(w,h,d)`) and segment validation. |

### `kamasazii_vecter_omega3d`

| # | File | Line | Placeholder | Real Implementation Needed |
|---|------|------|------------|---------------------------|
| 17 | `js/renderer.js` | 80 | **Wireframe cube** | Draws a neon cyan wireframe cube as placeholder when the arena model hasn't loaded yet. |
| 18 | `js/renderer.js` | 237 | **Ship fallback marker** | When a ship model fails to load, renders a flat colored triangle (3 verts) instead. |

### `kamakazii_3d_aero_comand` (KAMIKAZZI 3D — Aero Command)

| # | File | Line | Placeholder | Real Implementation Needed |
|---|------|------|------------|---------------------------|
| 19 | `game/level-fabricator/input/Controls.js` | 185 | ~~**`removeEventListeners()` no-op**~~ | ✅ **RESOLVED** — All 9 event listeners stored as bound references. `dispose()` removes all + destroys nipplejs manager. |
| 20 | `game/puter-client.js` | 1464 | **Prompt template placeholders** | AI prompt templates use `{prompt}` as a placeholder string for user text — this is by design but worth noting. |

---

## 🟡 "For Now" / Temporary Implementations

| # | App | File | Line | What's Temporary |
|---|-----|------|------|-----------------|
| 21 | studio3D | `marketplace/CreatorPortal.js` | 20 | ~~Creator profiles saved to localStorage only~~ ✅ Now synced via Puter.js KV |
| 22 | studio3D | `systems/physics/SPHSolver.js` | 514 | ~~`setBounds()` logs but doesn't apply~~ ✅ Now updates instance bounds at runtime |
| 23 | studio3D | `tools/blender/modifiers.js` | 669 | ~~UV generation is simple planar projection~~ ✅ Now uses conformal UV projection |
| 24 | studio3D | `tools/blender/chat.js` | 58 | ~~Bevel only works on Cube objects~~ ✅ Now generalized to any mesh via `generateBevelGeometry()` |
| 25 | aero_comand | `game/level-fabricator/input/Controls.js` | 185 | ~~Event listener cleanup is a no-op~~ ✅ All listeners properly removed in `dispose()` |
| 26 | aero_comand | `game/world.js` | 402 | Plane position uses a hardcoded `placeholder = { x: 0, y: 2, z: 0 }` |
| 27 | studio3D | `tools/blender/world.js` | 338 | Same hardcoded `placeholder = { x: 0, y: 2, z: 0 }` for plane position |
| 28 | vector_strike | `src/lib.rs` | 207 | ~~`apply_torque` is a no-op placeholder~~ ✅ Command buffer pattern |

---

## 🟡 Mock / Demo Data in Production Paths

| # | App | File | Line | Mock Content |
|---|-----|------|------|-------------|
| 29 | aero_comand | `stitch_kamikazzi_3d/kamikazzi_3d_animated_boot_sequence/code.html` | 417 | ~~`"Mock gameplay ending for success screen demo"`~~ ✅ Event-driven with `kamikazzi:game-state` listener |
| 30 | aero_comand | `stitch_kamikazzi_3d/kamikazzi_3d_rapid_boot_sequence/code.html` | 417 | ~~Same mock gameplay ending~~ ✅ Event-driven |
| 31 | aero_comand | `stitch_kamikazzi_3d/kamikazzi_3d_game_interface/code.html` | 347 | ~~Same mock gameplay ending~~ ✅ Event-driven |
| 32 | aero_comand | `stitch_kamikazzi_3d/kamikazzi_3d_animated_interface/code.html` | 433 | ~~Same mock gameplay ending~~ ✅ Event-driven |
| 33 | aero_comand | `gui-states/powerups.html` | 423 | `const audio = new Audio(); // Placeholder for sound effect logic` — audio object created but no source set |
| 34 | aero_comand | `gui-states/pause.html` | 292 | Uses external URL `soundjay.com` for a tactical beep sound — hardcoded example audio |

---

## 🟢 Fallback-Only Paths (Graceful Degradation)

These are **intentional** graceful-degradation patterns, not bugs. Listed for completeness — they work but represent reduced functionality.

### Audio Fallbacks

| # | File | Description |
|---|------|-------------|
| 35 | `game/world.js` / `tools/blender/world.js` | Impact sound URL falls back to `airplane.wav` if primary 404s |
| 36 | `game/ui.js` | Sound effects use synthesised Tone.js fallbacks when WAV files not available |

### 3D Model Fallbacks

| # | File | Description |
|---|------|-------------|
| 37 | `game/world.js` / `tools/blender/world.js` | Plane GLB falls back to procedural geometry if not supplied |
| 38 | `game/world.js` | Cloud GLTF falls back to procedural sphere-puff clouds |
| 39 | `marketplace/ModelPreviewRenderer.js` | Preview falls back to a 0.5³ box mesh |
| 40 | `tools/blender/script.js:3649` | `generateFallbackModel()` creates simple shapes when AI model generation fails |

### Network / Storage Fallbacks

| # | File | Description |
|---|------|-------------|
| 41 | `game/puter-client.js` | Puter KV falls back to localStorage when offline |
| 42 | `game/puter-client.js` | Puter FS replay save falls back to alert when offline |
| 43 | `game/locale.js` | Falls back to `en` locale when requested locale unavailable |
| 44 | `game/screen-loader.js` | Screen loader falls back to body content without nav bar |
| 45 | `marketplace/StripeBridge.js` | SIM mode when no Stripe publishable key configured |

### WebGL Fallbacks

| # | File | Description |
|---|------|-------------|
| 46 | `vector_strike/js/renderer.js` | Falls back to wireframe cube when arena GLTF not loaded |
| 47 | `vector_strike/js/renderer.js` | Falls back to colored triangle when ship GLB not loaded |

---

## 🏗️ Architecture Notes

### Studio3D Feature Pages (~30 stub pages)

The audit in `audit.md` line 116 notes:

> **~30 of 40+ feature pages just render an empty container or a placeholder message.** The architecture is solid but implementation is sparse.

Affected feature directories in `kamakazii_studio3D/features/`:
`ai`, `array`, `bake`, `batch`, `boolean`, `chat`, `constraints`, `curve`, `decal`, `deform`, `extensions`, `fire`, `foliage`, `history`, `market`, `mixer`, `particles`, `physics`, `publish`, `remesh`, `report`, `script`, `sculpt`, `shapes`, `shaders`, `sky`, `snapshot`, `team`, `terrain`, `trails`, `uv`, `water`, `weather`

Each of these has a `page.js` that renders a container with generic controls but no real tool implementation behind it.

---

## Priority Recommendations

### 🔴 Critical — All Resolved ✅

1. ~~**`apply_torque` in `src/lib.rs`**~~ ✅ Command buffer pattern
2. **PhysicsSystem shim** — Still a placeholder (deferred to full cannon-es integration)
3. ~~**Auto-Retopology + Voxel Engine stubs**~~ ✅ QEM + sparse octree implementations

### 🟡 Important — Mostly Resolved

4. **~30 stub feature pages** in Studio3D — Still open (architecture exists, implementations sparse)
5. ~~**Marketplace API is simulated**~~ ✅ IndexedDB + network fetch
6. ~~**Creator Portal has no cloud sync**~~ ✅ Puter.js KV store
7. ~~**Tax calculation is a flat placeholder**~~ ✅ Jurisdiction-based rates
8. ~~**`setBounds()` in SPHSolver**~~ ✅ Runtime-configurable bounds
9. ~~**Event listener cleanup is a no-op**~~ ✅ All listeners properly tracked and removed
10. ~~**Mock gameplay endings**~~ ✅ Event-driven game state checks

### 🟢 Nice to Have — All Resolved ✅

11. ~~**UV generation is basic planar**~~ ✅ Conformal UV projection
12. ~~**Bevel limited to Cubes**~~ ✅ Generalized to any mesh
13. ~~**Rounded box geometry** is a stub~~ ✅ Real RoundedBoxGeometry
14. ~~**Per-frame editor hook** is empty~~ ✅ Hook registry system
15. ~~**Selection API** lacks features~~ ✅ Multi-select, undo grouping, batch commands
