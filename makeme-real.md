# MAKEME-REAL — Placeholder & Stub Tracker

> Tracks every placeholder, stub, fallback, and "not yet implemented" marker across the kamikazzi monorepo.
> **Last updated:** July 2026 — post-session resolution pass.

---

## Resolved ✅

### Pose Tool Stubs (kamakazii_studio3D/tools/pose/)
| File | Status | Resolution |
|------|--------|------------|
| `maim.js` | ✅ Resolved | **Model Assembly & Import Manager** — `importModel()` with GLTFLoader, `validateModel()` checking degenerate faces/NaN/bounding box, `assembleModel()` for multi-part grouping, import history tracking. Shared `normalizeToUnitBox()` + `centerAtOrigin()` helpers. |
| `geometries.js` | ✅ Resolved | **Geometry hub** — `generateHumanoid()` with 12-segment skeleton, 7 primitive types (box, sphere, cylinder, cone, torus, plane, icosahedron), geometry validation with boolean flag for computed normals. |
| `lighting_presets.js` | ✅ Resolved | **5 complete presets** — studio (soft 3-point), dramatic (warm key + cool fill), outdoor (sun + sky + bounce), night (moon + rim), neon (colored spots). Each with cleanup function. |
| `physics_integration.js` | ✅ Resolved | **PhysicsSystem bridge** — `initPhysics()` delegates to `PhysicsSystem.setEnabled()`, `createRigidBody()` with collision shape types, `createRagdoll()` with spring constraints, step callback hook. |
| `vr_interactions.js` | ✅ Resolved | **WebXR helpers** — `enterXR()` / `exitXR()` session management, `setupTeleportation()` with raycasting + parabolic arc, `setupLaserPointer()` with raycaster, `setupControllers()` for grip/trigger/thumbstick mapping. |
| `physics_bridge.js` | ✅ Resolved | **Enhanced physics bridge** — `init()` with configurable timeStep + gravity fallback, `step()` delegates to PhysicsSystem or manual integration, `addBody()`/`removeBody()`/`setGravity()` wrappers, `onBeforeStep`/`onAfterStep` callbacks. |
| `roundbox.js` | ✅ Kept | **Rounded box geometry primitive** — already a real implementation (not a stub). Exports a `roundbox()` function generating rounded-corner box geometry. No changes needed. |

### Audio Placeholders (kamakazii_3d_aero_comand/)
| File | Line | Status | Resolution |
|------|------|--------|------------|
| `gui-states/powerups.html` | 423 | ✅ Resolved | Web Audio API singleton (`window._sfxCtx`) with synthesized tones (shield: 440Hz, boost: 880Hz ascending, magnet: 220Hz pulsing, score2x: 660Hz double-tap, slowmo: 110Hz descending, stamina: 550Hz burst). No external URLs. |
| `gui-states/pause.html` | 292 | ✅ Resolved | Web Audio API synthesized click tone (1200Hz, 50ms exponential decay) replaces soundjay.com URL. CSP `media-src` directive removed. |

### Ship Fallback (kamasazii_vecter_omega3d/js/renderer.js)
| Line | Status | Resolution |
|------|--------|------------|
| 80 | ✅ Kept | Wireframe cube placeholder for arena — this is an intentional loading state, not a stub. |
| 237 | ✅ Resolved | **Proper wireframe ship silhouette** — 11 line segments forming fuselage, swept wings, and tail section with per-component color coding (body: cyan, wings: bright cyan, tail: dim cyan). Replaces flat 3-vertex triangle. |

### Hardcoded Placeholder Positions
| File | Line | Status | Resolution |
|------|------|--------|------------|
| `kamakazii_3d_aero_comand/game/world.js` | 402 | ✅ Resolved | `const placeholder = { x: 0, y: 2, z: 0 }` replaced with named constants `PLANE_SPAWN_X`, `PLANE_SPAWN_Y`, `PLANE_SPAWN_Z`. Constants wired into initial `plane.position.set()`, `state.target` init, `resetGame()` respawn, and `resetGame()` steering target reset. |
| `kamakazii_studio3D/tools/blender/world.js` | 338 | ✅ Resolved | Same pattern — `placeholder` object replaced with `PLANE_SPAWN_X/Y/Z` constants, all 4 hardcoded `0, 2, 0` references updated. |

### Stub Feature Pages (kamakazii_studio3D/features/)
| Scope | Status | Resolution |
|-------|--------|------------|
| ~51 feature pages | ✅ Resolved | All pages refactored to use shared `_shared/actionMap.js` (80+ action handlers with real engine integration) and `_shared/renderControls.js` (shared UI control renderer). Each page reduced from ~120 lines of duplicated boilerplate to ~20 lines. **~5,000 lines of duplicated code eliminated.** |
| 5 custom-UI pages | ✅ Intentionally retained | `biome-painter`, `scenery-scatter`, `terrain-analytics`, `terrain-export`, `terrain-presets` have rich canvas-based UIs that don't follow the standard meta.controls pattern. These are real implementations, not stubs. |

### VFX Systems (kamakazii_studio3D/systems/)
| System | Status | Resolution |
|--------|--------|------------|
| `ParticleSystem.js` | ✅ Created + Wired | GPU point-sprite particle emitter with 6 presets (fire, smoke, sparks, dust, magic, bubbles). Per-particle velocity/life/size/color with compacting dead particle removal. Wired into `engine.js` animate loop with real `dt`. Menu action creates fire emitter. |
| `WeatherSystem.js` | ✅ Created + Wired | Rain/snow/sandstorm particles + fog with camera-relative wrapping. 4 presets (rain, snow, fog, sandstorm, clouds, clear). Wired into `engine.js` animate loop. |
| `WaterSystem.js` | ✅ Created + Wired | Multi-frequency Gerstner wave animation on a segmented plane. 4 presets (calm, ocean, river, pool). Auto-centers on camera for large water planes. Wired into `engine.js` animate loop with `elapsed` time for continuous wave motion. |

### Engine Integration (kamakazii_studio3D/app/engine.js)
| Change | Status | Resolution |
|--------|--------|------------|
| VFX systems not in update loop | ✅ Resolved | `ParticleSystem`, `WeatherSystem`, `WaterSystem` imported, instantiated in constructor, and called every frame in `animate()`. Shared `THREE.Clock` (`_animateClock`) provides real delta timing with `start()` called after init to avoid first-frame spike. Physics system also now uses real `dt` instead of hardcoded `0.016`. |

---

## Remaining Open Items

### vecter_omega3d
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `src/lib.rs` | 416 | **MVP uniform upload** | `uModelViewProjection` uniform location fetched but actual upload is a placeholder comment. Vertex data rendering handled on JS side instead. |

### PhysicsSystem Shim
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `systems/PhysicsSystem.js` | 31+ | **Physics shim fallback** | PhysicsSystem initializes a "shim placeholder" when cannon-es is unavailable. 8+ methods are no-ops. This is by design — cannon-es is a dynamic import that may fail in some environments. The shim allows the editor to run without physics. |

### ModelPreviewRenderer Fallback
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `marketplace/ModelPreviewRenderer.js` | 251 | **Fallback preview mesh** | When no geometry is available, creates a `THREE.BoxGeometry(0.5, 0.5, 0.5)` placeholder. This is an intentional fallback for the 8-category procedural preview system (~700 lines) — not a stub. |

### by-design Placeholders
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `game/puter-client.js` | 1464 | **Prompt template `{prompt}`** | AI prompt templates use `{prompt}` as a placeholder string for user text. This is by design — the templates are filled at runtime. |

---

## Summary

| Category | Before | After | Resolution |
|----------|--------|-------|------------|
| Pose tool stubs | 6 placeholder files | 0 | ✅ All replaced with real implementations |
| Audio placeholders | 2 (empty Audio, soundjay URL) | 0 | ✅ Web Audio API synthesized tones |
| Ship fallback | Flat triangle | Wireframe ship silhouette | ✅ 11-segment ship outline |
| Hardcoded positions | 2 files with magic numbers | 0 | ✅ Named constants wired everywhere |
| Feature page boilerplate | ~51 pages × ~120 lines | ~51 pages × ~20 lines | ✅ Shared modules, ~5,000 lines eliminated |
| VFX systems | 0 (not in update loop) | 3 systems animating | ✅ ParticleSystem + WeatherSystem + WaterSystem |
| Engine delta timing | Hardcoded 0.016 | Real `THREE.Clock` delta | ✅ Frame-rate independent simulation |

**Remaining open items:** 4 (MVP uniform upload, physics shim fallback, preview mesh fallback, prompt templates) — all are either by-design or require upstream work.
