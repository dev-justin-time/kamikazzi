# Kamakazii Studio 3D — Plan of Action

## 1. Executive Summary

**Goal:** Transform the existing monolithic `studio/pro/` 3D editor codebase into a clean, modular **kamakazii_studio3D/** standalone app with a multi-page UI architecture, shared state, and full integration of all sub-folder features.

**Current State:** ~45 files across 5 directories with 2 competing UI frameworks, 3 entry points, 2 CSS systems, and 4 standalone sub-apps (blender, map maker, pose, pro editor).

**Target State:** A single coherent app with one index router, shared state bus, per-concern HTML pages, and all sub-system capabilities woven together.

---

## 2. Architecture Design

### 2.1 Multi-Page UI Structure

Instead of one monolithic `index.html`, we create **one HTML page per top-menu concern**, each fully featured, but sharing state through a `SharedEditorState` singleton:

```
kamakazii_studio3D/
├── index.html                    # App shell / router + shared state loader
├── app-shell.js                  # Bootstrap, shared state, navigation
├── shared-state.js               # EditorState singleton
├── styles.css                    # Unified dark theme
│
├── pages/
│   ├── file-manager.html         # File, Import, Export, Scene Mgmt
│   ├── objects.html              # Primitives, Lights, Advanced Geo
│   ├── camera.html               # Views, Projection, Presets, FOV
│   ├── rigging.html              # Bones, Skinning, Weights, Pose
│   ├── animation.html            # Timeline, Keyframes, Clips, Playback
│   ├── integrations.html         # Asset Store, Cloud, Plugins, Collab
│   ├── edit-tools.html           # Mirror, Merge, Subdivide, UV, Slice
│   ├── textures.html             # Bake, Import, Stickers, Atlasing
│   └── paint.html                # Brush, Eraser, Fill, Material, Layers
│
├── core/                         # Shared core modules
│   ├── EditorState.js            # Singleton — shared across all pages
│   ├── editor-bridge.js          # Three.js scene/Camera/Renderer host
│   ├── objects-manager.js        # Unified from studio/pro
│   ├── camera-manager.js         # Unified from studio/pro
│   ├── animation-manager.js      # Unified from studio/pro
│   └── safe-dom.js               # From studio/pro
│
├── systems/                      # Feature systems (merged, deduplicated)
│   ├── PhysicsSystem.js          # studio/pro/PhysicsSystem.js
│   ├── ProceduralSystem.js       # studio/pro/ProceduralSystem.js
│   ├── SculptSystem.js           # studio/pro/SculptSystem.js
│   ├── TexturePaintSystem.js     # studio/pro/TexturePaintSystem.js
│   ├── VertexPaintSystem.js      # studio/pro/VertexPaintSystem.js
│   ├── NodeEditorSystem.js       # studio/pro/NodeEditorSystem.js
│   ├── AudioSystem.js            # studio/pro/AudioSystem.js
│   ├── CloudSystem.js            # studio/pro/CloudSystem.js
│   ├── ImportExportSystem.js     # studio/pro/import-export-manager.js
│   ├── InputManager.js           # studio/pro/InputManager.js
│   └── SystemManager.js          # studio/pro/SystemManager.js
│
├── features/                     # Integrated from sub-folders
│   ├── blender/                  # studio/pro/blender/ (merged)
│   ├── map-maker/                # studio/pro/map maker/ (merged)
│   └── pose/                     # studio/pro/pose/ (merged)
│
├── ui/                           # Per-page UI controllers
│   ├── FilePage.js
│   ├── ObjectsPage.js
│   ├── CameraPage.js
│   ├── RiggingPage.js
│   ├── AnimationPage.js
│   ├── IntegrationsPage.js
│   ├── EditToolsPage.js
│   ├── TexturesPage.js
│   └── PaintPage.js
│
└── assets/                       # Static assets
    └── (icons, models, textures)
```

### 2.2 Shared State Architecture

```javascript
// core/EditorState.js — Singleton
class EditorState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  transformControls: TransformControls
  selectedObject: Object3D | null
  objects: Object3D[]
  animations: AnimationClip[]
  lights: Light[]
  currentTool: string
  viewMode: string
  // ... all shared state
  init(canvas)       // Bootstrap Three.js once
  selectObject(obj)  // Centralized selection + outline
  notify(event, data) // Publish event to all pages
  subscribe(event, fn) // Subscribe from any page
}
```

### 2.3 Navigation Pattern

Each page loads as a content fragment via `<object>` or dynamic `<iframe>`, communicating with the parent via `postMessage` → `EditorState.notify()`:

```
                    ┌─────────────────────────┐
                    │     index.html           │
                    │  (App Shell + 3D View)   │
                    │  (EditorState Singleton) │
                    └──────┬──────────┬───────┘
                           │          │
              ┌────────────┘          └────────────┐
              ▼                                     ▼
     ┌──────────────────┐               ┌──────────────────┐
     │ pages/objects.html │             │ pages/camera.html │
     │ (UI only)         │             │ (UI only)         │
     │ postMessage ↔ ES  │             │ postMessage ↔ ES  │
     └──────────────────┘             └──────────────────┘
```

---

## 3. Step-by-Step Implementation Plan

### Phase 1: Foundation (Highest Value First)

| Step | Task | Description | Files Involved |
|------|------|-------------|----------------|
| **1.1** | Create `kamakazii_studio3D/` directory structure | Empty scaffold of folders | mkdir all directories |
| **1.2** | Create `core/EditorState.js` | Singleton state bus + Three.js bootstrap. Merge best of `main.js` initialization with `app(2).js` class to produce a clean, single init sequence. | `main.js`, `app(2).js`, `SystemManager.js` |
| **1.3** | Create `core/safe-dom.js` | Copied from `studio/pro/safe-dom.js` (clean pattern) | `studio/pro/safe-dom.js` |
| **1.4** | Create unified `styles.css` | Merge `style.css` (menu bar + dropdown) and `styles(1).css` (dark theme + sidebar + timeline + node editor + paint panels). Keep all `.dropdown-btn`, `.menu-item`, `.tool-item`, `.sidebar`, `.tab`, `.panel`, `.viewport`, `.node-editor`, `.timeline`, `.console`, `.asset-grid`, `.paint-layer`, `.material-presets` styles. | `style.css`, `styles(1).css` |
| **1.5** | Create `index.html` (app shell) | Minimal shell with 3D viewport, top nav bar, and content frame area. Importmap for Three.js, load `app-shell.js`. | New file |
| **1.6** | Create `app-shell.js` | Bootstrap: init EditorState, render 3D scene, wait for page loads, handle navigation clicks, forward events. | New file |
| **1.7** | Create first page: **Objects.html** + `ui/ObjectsPage.js` | Simplest page. Wire "Add Cube/Sphere/Cylinder/Plane/Light" buttons to `EditorState.objectsManager.addObject()`. | `objects-manager.js` |

### Phase 2: Core Systems (Merge & Deduplicate)

| Step | Task | Description | Files Involved |
|------|------|-------------|----------------|
| **2.1** | Merge Camera systems | Take `camera-manager.js` (has perspective/ortho switching, presets, frame, reset, lock) and add camera list management from `app(2).js` cameraManager. | `camera-manager.js`, `app(2).js` CameraManager |
| **2.2** | Merge Animation systems | `animations-manager.js` provides clip selection and playback wiring; `app(2).js` provides keyframe timeline and interpolation. Merge into `core/animation-manager.js`. | `animations-manager.js`, `app(2).js` animation methods |
| **2.3** | Create **Camera.html** + `ui/CameraPage.js` | Page with projection toggle, FOV slider, near/far inputs, preset views (front/back/left/right), frame selection, reset, orbit lock toggle. | New file |
| **2.4** | Create **EditTools.html** + `ui/EditToolsPage.js` | Mirror X/Y/Z, Merge, Subdivide simple/smooth, UV Unwrap/Relax, Slice X/Y/Z, Rotate 90°, Vertex Paint Fill/Brush. | New file |
| **2.5** | Create **FileManager.html** + `ui/FilePage.js` | New Scene, Open/Save, Autosave, Import (GLTF/OBJ/STL file picker + URL + drag-drop), Recent Files, Export dropdown (GLB/GLTF/OBJ/JSON), ZIP import. | `ImportExportSystem.js` |

### Phase 3: Sub-Folder Integration

| Step | Task | Description | Files Involved |
|------|------|-------------|----------------|
| **3.1** | Integrate **blender/** | The `studio/pro/blender/` folder has a separate app (`aiblender.html`, `app.js`, `chat.js`, `editer.js`, `modifiers.js`, `world.js`). Extract the unique capabilities (modifier system, script editor, AI chat) and merge into the studio as a "Modifiers" panel + "AI Assistant" sidebar. | `blender/*` |
| **3.2** | Integrate **map maker/** | The `studio/pro/map maker/` folder has terrain generation, biomes, landscaping, decoration, and environment management. These are more advanced than `ProceduralSystem`. Merge: `terrain.js` → enhance `ProceduralSystem`, `biomeUtils.js` + `decorationManager.js` → new EnvironmentSystem, `landscapingManager.js` → terrain editing tools. | `map maker/*` |
| **3.3** | Integrate **pose/** | The `studio/pro/pose/` folder has VR interactions, physics bridge, lighting presets, scene helpers, model importers. Merge: `physics_bridge.js` → enhance `PhysicsSystem`, `vr_interactions.js` + `vr_support.js` → new VR mode, `lighting_presets.js` → environment lighting controls. | `pose/*` |
| **3.4** | Create **Rigging.html** + `ui/RiggingPage.js` | Bones (add/remove/mirror/auto-rig), Skinning (bind/normalize/clear weights), Pose (zero/rest pose), Advanced (transfer/bake). Wire to editor stubs. | New file |
| **3.5** | Create **Animation.html** + `ui/AnimationPage.js` | Play/Pause/Stop, Loop toggle, Speed slider, Frame input/navigation, Clip selector, Open Timeline, Focus Selection. | New file |

### Phase 4: Advanced Features

| Step | Task | Description | Files Involved |
|------|------|-------------|----------------|
| **4.1** | Create **Paint.html** + `ui/PaintPage.js` | Brush/Eraser/Fill modes, Size/Opacity/Color sliders, Toggle Paint Mode, Clear Paint. Material properties: Metalness, Roughness, Emissive Color, Emissive Intensity, Material Presets dropdown. | `TexturePaintSystem.js`, `VertexPaintSystem.js` |
| **4.2** | Create **Textures.html** + `ui/TexturesPage.js` | Bake Texture, Import Texture, Remove Texture, Add Sticker, Set UV Scale, Auto Atlas. | New file |
| **4.3** | Create **Integrations.html** + `ui/IntegrationsPage.js` | Asset Store, Cloud Sync, Plugin Manager, Marketplace, Live Session, Comments, Webhooks, CI Pipeline. Wire to CloudSystem and placeholders. | `CloudSystem.js` |
| **4.4** | Merge NodeEditorSystem | The node editor in `app(2).js` and `NodeEditorSystem.js` is the same. Keep `NodeEditorSystem.js` as canonical and add it to an "Effects" or "Materials" panel. | `NodeEditorSystem.js` |

### Phase 5: Deduplication & Cleanup

| Step | Task | Description | Files Involved |
|------|------|-------------|----------------|
| **5.1** | Delete duplicate `mod-editor.js` | `model-editor.js` (referenced by main.js) and `mod-editor.js` (the cleaned-up version) — keep `mod-editor.js`, rename to `ModelEditor.js`. | `mod-editor.js`, `model-editor.js` |
| **5.2** | Remove `app(2).js` duplicate code | The `ProModelerStudio` class in `app(2).js` duplicates 80% of `main.js`. Extract unique features (advanced materials, animation system, profiler, custom shaders, morph targets) into their respective system files. Then delete `app(2).js`. | `app(2).js` |
| **5.3** | Delete redundant `ui-manager.js` or `UIManager.js` | `UIManager.js` (Capital U) is the comprehensive one used by `app(2).js`. `ui-manager.js` (lowercase) has the safe-get pattern. Merge: use the safe-get pattern from `ui-manager.js` with the comprehensive panel/menu/toolbar/timeline wiring from `UIManager.js`. | `ui-manager.js`, `UIManager.js` |
| **5.4** | Delete orphaned sub-app entry points | Remove `studio/pro/blender/aiblender.html`, `studio/pro/map maker/index.html`, `studio/pro/pose/index.html` standalone HTML files after their features are integrated. | Sub-folder HTMLs |
| **5.5** | Final scan for stale references | Run code-searcher for any remaining imports of old paths. Update importmaps to single Three.js version. | All files |

### Phase 6: Polish & Validation

| Step | Task | Description |
|------|------|-------------|
| **6.1** | Cross-page navigation | Ensure all 9 pages load, their UI controls work, and they properly read/write `EditorState`. |
| **6.2** | Responsive layout | Test dropdown scroll, sidebar overlay on mobile, touch joystick support. |
| **6.3** | Smoke test all features | Boot app, add objects, import GLB, paint, sculpt, animate, apply physics, export — verify no console errors. |
| **6.4** | Write README.md | Document the new structure, page routing, shared state pattern, and how to add new pages. |

---

## 4. Merged Feature Matrix

| Concern | Menu | HTML Page | Core System | Sub-Folder Integration |
|---------|------|-----------|-------------|----------------------|
| File Operations | File | `file-manager.html` | `ImportExportSystem.js` | blender/ export tools |
| Object Creation | Objects | `objects.html` | `ObjectsManager` | map maker/ terrain |
| Camera Controls | Camera | `camera.html` | `CameraManager` | pose/ scene_helpers |
| Rigging | Rigging | `rigging.html` | Editor stubs | (direct) |
| Animation | Animation | `animation.html` | `AnimationManager` | pose/ vr_support |
| Cloud/Collab | Integrations | `integrations.html` | `CloudSystem` | (direct) |
| Geometry Editing | Edit Tools | `edit-tools.html` | `ModelEditor` | blender/ modifiers |
| Textures | Texture | `textures.html` | `TexturePaintSystem` | pose/ lighting_presets |
| Painting | Paint | `paint.html` | `TexturePaintSystem` + `VertexPaintSystem` | (direct) |

---

## 5. Redundancy Removal Map

| Redundant Element | Keep | Remove/Archive | Rationale |
|-------------------|------|---------------|-----------|
| `main.js` vs `app(2).js` | Merge both → `app-shell.js` | Both originals | `main.js` has clean init order; `app(2).js` has richer features |
| `ui-manager.js` vs `UIManager.js` | Merge → `core/shared-ui-helpers.js` | Both originals | `ui-manager.js` has safe-get pattern, `UIManager.js` has comprehensive panel wiring |
| `model-editor.js` vs `mod-editor.js` | `mod-editor.js` (cleaner) → `core/ModelEditor.js` | `model-editor.js` | `mod-editor.js` has cleaner exports and Draco lazy-load |
| `style.css` vs `styles(1).css` | Merge → `styles.css` | Both originals | `style.css` has menu/dropdown, `styles(1).css` has full dark theme |
| `index.html` (the 8 variants) | New `index.html` shell | All old `studio/pro/index*` | Each was a different experiment; we consolidate |
| `features/*.js` (10 files) | Keep as design docs | Move to `docs/features/` | These are feature specifications, not code |
| Sub-folder standalone HTMLs | Integrate features | Remove standalone entry points | No longer needed once integrated |
| `studio/premium/` vs `studio/pro/` | Merge unique docs into pro; keep pro system files | premium/ modules (superseded) | premium `index.html` (44KB) is richer — kept as `premium-index.html`. premium `app.js` is identical to `app(2).js`. premium `modules/*` are older versions without SystemManager guards. |

### Premium Merge Summary

| Premium File | Verdict | Destination |
|-------------|---------|-------------|
| `index.html` (44,887 bytes) | **Unique** — full panel UI (outliner, assets, modifiers, properties, materials, lighting, render, timeline, node editor, console, plugins, status bar) | Copied → `pro/premium-index.html` |
| `Architecture.MD` (1,463 bytes) | **Unique** — architecture documentation | Copied → `pro/Architecture.MD` |
| `Review.MD` (1,936 bytes) | **Unique** — project review with weaknesses analysis | Copied → `pro/Review.MD` |
| `TODO.MD` (2,270 bytes) | **Unique** — action items showing phases 1-7 complete | Copied → `pro/TODO.MD` |
| `styles.css` (46,974 bytes) | **Duplicate** — identical to `pro/styles(1).css` | Discarded (keep pro version) |
| `app.js` | **Duplicate** — identical to `pro/app(2).js` (`ProModelerStudio` class) | Discarded (keep pro version) |
| `modules/*.js` (10 files) | **Superseded** — older versions without SystemManager, safe-dom, Draco lazy-load, ImportExportManager enhancements | Discarded (keep pro versions) |

---

## 6. Complexity & Effort Estimate

| Phase | Files to Create | Files to Merge | Files to Remove | Est. Effort |
|-------|----------------|----------------|-----------------|-------------|
| 1. Foundation | 6 | 3 | 0 | ⭐⭐ |
| 2. Core Systems | 5 | 2 | 0 | ⭐⭐⭐ |
| 3. Sub-Folder Integration | 3 | ~55 | 3 | ⭐⭐⭐⭐⭐ |
| 4. Advanced Features | 4 | 1 | 0 | ⭐⭐ |
| 5. Deduplication | 0 | 0 | 6+ | ⭐⭐ |
| 6. Polish & Validation | 1 | 0 | 0 | ⭐ |

**Total: ~19 new files, ~60 merged files, ~9 removals. Est. 8-12 hours.**

---

## 7. Identified Weaknesses (from Code Audit)

These are acknowledged limitations in the current `studio/pro/` codebase that will be carried forward or addressed during the rebuild:

| Weakness | Category | Plan to Address |
|----------|----------|----------------|
| **Dense menus for mobile touch targets** | Mobile Support | Phase 6.2 (responsive layout) adds scrollable sections, touch-friendly 44px min-height buttons, and overlay sidebars. See `Phase 5 — Input & Interaction` in studio/pro/plan.md for joystick lazy-load. |
| **Texture painting is basic (color-only brush)** | Feature Depth | Phase 4.1 (Paint page) will expand brush modes, add layer compositing, and integrate `TexturePaintSystem`'s existing layer system (add/remove/toggle layers). Future: stamp textures, alpha brushes. |
| **Fluid simulation uses basic particle stacking, not SPH**| Physics | Current `PhysicsSystem.createFluid()` stacks spheres (ball-pit style). True SPH is a future enhancement — tracked in FUTURE.md. The system architecture supports swapping in an SPH solver via `PhysicsSystem`. |
| **Voxel assets are procedural with high vertex count** | Performance | `CloudSystem.generateVoxelAsset()` builds per-voxel BoxGeometry meshes. Future: sparse octree representation + instanced mesh rendering. Architecture allows replacement: swap `generateVoxelAsset` with an octree engine. |
| **Auto-retopology is UI simulation only** | Known Stub | The Plugin system has a stub that logs "simulated". Real retopology requires a WebAssembly solver — tracked as a future integration. |

---

## 8. Known Issues & Stubs

These features are present in the UI but backed by stubs or simulations rather than real implementations:

| Feature | File(s) | Current State | Notes |
|---------|---------|---------------|-------|
| Auto-Retopology | `app(2).js` Plugin system | `this.ui.log('Retopology simulated', 'success')` | UI placeholder only |
| Cloud Asset Store | `CloudSystem.js` | Simulated 800ms delay, procedural voxel generation | No real network backend |
| Collaboration (Live Session, Comments) | `app(2).js` Integrations menu | UI buttons only, no wiring | Placeholder for real-time service |
| Webhooks / CI Pipeline | Integrations menu | UI buttons only | Placeholder |
| Voice Chat / Audio Reactive | `AudioSystem.js` | Playable test tone only | No voice input or FFT visualization beyond basic scale modulation |

---

## 9. Ongoing Maintenance & Action Items

| Action Item | Frequency | Details |
|-------------|-----------|--------|
| Monitor Three.js deprecations | Per release | Check `https://github.com/mrdoob/three.js/releases` for breaking changes to `WebGLRenderer`, `Material`, `BufferGeometry` APIs used in core modules. Pin importmap version explicitly. |
| Continuous profiling on lower-end devices | Monthly | Test on integrated GPU / mobile Safari. Key metrics: FPS in paint mode, physics step time with 10+ bodies, node editor connection redraw performance. Add automated perf regression checks in Phase 6.3. |
| Keep `studio/pro/plan.md` in sync | As-needed | The existing merge plan covers phases 2-12 of the current codebase. This plan supersedes it for the new architecture; cross-reference for implementation details. |

---

## 10. Recommended Execution Order

### Sprint 1 (Foundation — Highest ROI)
1. ✅ Scaffold directory structure
2. ✅ Create `core/EditorState.js` (shared state = enabler for everything)
3. ✅ Create unified `styles.css`
4. ✅ Create `index.html` + `app-shell.js`
5. ✅ Create `pages/objects.html` + `ui/ObjectsPage.js` (show it works end-to-end)

### Sprint 2 (Pages — High Visibility)
6. ✅ Create `pages/camera.html` + `ui/CameraPage.js`
7. ✅ Create `pages/file-manager.html` + `ui/FilePage.js`
8. ✅ Create `pages/edit-tools.html` + `ui/EditToolsPage.js`

### Sprint 3 (Sub-Folder Integration — Deep Work)
9. ✅ Integrate `blender/` → Modifiers panel + AI Assistant
10. ✅ Integrate `map maker/` → Enhanced ProceduralSystem
11. ✅ Integrate `pose/` → Physics enhancements + VR mode

### Sprint 4 (Remaining Pages)
12. ✅ Create `pages/rigging.html` + `ui/RiggingPage.js`
13. ✅ Create `pages/animation.html` + `ui/AnimationPage.js`
14. ✅ Create `pages/paint.html` + `ui/PaintPage.js`
15. ✅ Create `pages/textures.html` + `ui/TexturesPage.js`
16. ✅ Create `pages/integrations.html` + `ui/IntegrationsPage.js`

### Sprint 5 (Cleanup)
17. ✅ Remove redundant files
18. ✅ Update all import paths
19. ✅ Final smoke test

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **EditorState becomes too large** | Keep it focused on 3D state only. UI state stays local to each page. |
| **postMessage between shell and pages gets complex** | Use a simple `editorBridge.notify(type, data)` wrapper that serializes/deserializes. Consider moving to same-origin `<iframe>` where postMessage is synchronous. |
| **Sub-folder feature merge breaks existing editor** | Add features behind feature flags initially. Only enable after smoke test passes. |
| **Duplicate systems conflict** | Always merge into the canonical existing system (e.g., `objects-manager.js` → `core/ObjectsManager.js`). Never keep two copies. |
| **CSS conflicts from merge** | Prefix new styles with `.kamakazii-` namespace to avoid collisions during transition. |

---

## 12. First Action Steps

To begin executing this plan:
1. Run `mkdir -p kamakazii_studio3D/{core,systems,ui,pages,features,assets}`
2. Create `core/EditorState.js` as the foundation
3. Create `index.html` shell with importmap and nav bar
4. Create `styles.css` as the merged dark theme
5. Create `pages/objects.html` + `ui/ObjectsPage.js` as the first working page

Each subsequent step follows the phase order above.
