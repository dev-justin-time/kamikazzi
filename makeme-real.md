# MAKEME-REAL — Placeholder & Stub Tracker

> Tracks every placeholder, stub, fallback, and "not yet implemented" marker across the kamikazzi monorepo.
> **Last updated:** July 8, 2026 — cloud status refactoring + MVP uniform upload.

---


### PhysicsSystem Shim
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `systems/PhysicsSystem.js` | 31+ | **Physics shim fallback** | PhysicsSystem initializes a "shim placeholder" when cannon-es is unavailable. 8+ methods are no-ops. This is by design — cannon-es is a dynamic import that may fail in some environments. The shim allows the editor to run without physics. |

### ModelPreviewRenderer Fallback
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `marketplace/ModelPreviewRenderer.js` | 251 | **Fallback preview mesh** | When no geometry is available, creates a `THREE.BoxGeometry(0.5, 0.5, 0.5)` placeholder. This is an intentional fallback for the 8-category procedural preview system (~700 lines) — not a stub. |

### engine.js Lightmap Stub
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `app/engine.js` | 506–522 | **`advancedLighting.generateLightmap` stub** | Original stub logged a message and returned `{ bake: () => {}, cancel: () => {} }`. **Already replaced** with real `LightmapBaker` (see `systems/LightmapBaker.js`) — procedural UV2 baking via MultiRenderTarget accumulation + normalization. Archived for reference. |

### physics_bridge Stub
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `tools/pose/physics_bridge.js` | 91 | **`stubApplyPhysics` stub** | Original stub was a one-liner `return initPhysicsBridge({ timeStep })`. **Already replaced** with real implementation — scans scene for meshes, delegates to cannon-es PhysicsSystem when available, returns lifecycle handle with `pause()`/`resume()`/`destroy()`. Archived for reference. |

### CloudSystem Marketplace Stub
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `systems/CloudSystem.js` | 217 | **`_importPuterAsset` stub** | Comment reads: *"This is a stub that can be expanded when the marketplace / asset storage pipeline is fully implemented."* Currently falls through to procedural generation for both voxel and model types. Needs to reconstruct THREE geometry from downloaded asset data. |

### by-design Placeholders
| File | Line | Issue | Notes |
|------|------|-------|-------|
| `game/puter-client.js` | 1464 | **Prompt template `{prompt}`** | AI prompt templates use `{prompt}` as a placeholder string for user text. This is by design — the templates are filled at runtime. |


**Remaining open items:** 6 (physics shim fallback, preview mesh fallback, lightmap stub, physics_bridge stub, CloudSystem marketplace stub, prompt templates) — lightmap + physics_bridge already replaced, marketplace stub pending real asset reconstruction.
