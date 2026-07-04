# Studio Reorganization Architecture Plan

## 1. Domain-Based Directory Structure

```
studio/
├── app/                          # Application core
│   ├── main.js                   # Entry point (premium) — loads shell + engine
│   ├── simple.js                 # Simple editor entry (was main.js)
│   ├── shell.js                  # GUI shell: top icon bar, centered 3D viewport, popups
│   ├── state.js                  # Shared state management (all features share state)
│   ├── cache.js                  # LRU cache for heavy/often items
│   ├── ai-bridge.js              # websim.ai + puter.js parallel/staggered AI bridge
│   ├── safe-dom.js               # Safe DOM element helpers
│   └── boot.js                   # Bootstrap guard + shims (from premium-index.html)
│
├── systems/                      # Engine systems (moved from pro/ root)
│   ├── PhysicsSystem.js
│   ├── ProceduralSystem.js
│   ├── SculptSystem.js
│   ├── TexturePaintSystem.js
│   ├── VertexPaintSystem.js
│   ├── NodeEditorSystem.js
│   ├── AudioSystem.js
│   ├── CloudSystem.js
│   ├── SystemManager.js
│   └── InputManager.js
│
├── editor/                       # Editor tool managers
│   ├── UIManager.js              # Full UI manager (merged)
│   ├── ui-manager.js             # Re-export wrapper
│   ├── ModelEditor.js            # (was mod-editor.js)
│   ├── ObjectsManager.js         # (was objects-manager.js)
│   ├── CameraManager.js          # (was camera-manager.js)
│   ├── AnimationManager.js       # (was animations-manager.js)
│   └── ImportExportManager.js    # (was import-export-manager.js)
│
├── features/                     # Feature modules — each with own page
│   ├── file/                     # File operations (New, Open, Save, Export, Import)
│   │   ├── page.js               # Feature page logic
│   │   └── index.html            # Popup HTML with inputs/buttons/sliders
│   ├── select/                   # Selection tools (click, box, lasso)
│   │   ├── page.js
│   │   └── index.html
│   ├── edit/                     # Edit tools (transform, snap, mirror, etc.)
│   │   ├── page.js
│   │   └── index.html
│   ├── transition/               # Transitions / tweens
│   │   ├── page.js
│   │   └── index.html
│   ├── object/                   # Object creation & properties
│   │   ├── page.js
│   │   └── index.html
│   ├── texture/                  # Texture tools & baking
│   │   ├── page.js
│   │   └── index.html
│   ├── paint/                    # Vertex & texture paint
│   │   ├── page.js
│   │   └── index.html
│   ├── ai/                       # AI features (via ai-bridge.js)
│   │   ├── page.js
│   │   └── index.html
│   ├── rig/                      # Rigging (bones, FK/IK, skinning)
│   │   ├── page.js
│   │   └── index.html
│   ├── mocap/                    # Motion capture import
│   │   ├── page.js
│   │   └── index.html
│   ├── animate/                  # Animation (timeline, keyframes, clips)
│   │   ├── page.js
│   │   └── index.html
│   ├── camera/                   # Camera management
│   │   ├── page.js
│   │   └── index.html
│   ├── lighting/                 # Lighting controls
│   │   ├── page.js
│   │   └── index.html
│   ├── game/                     # Game mode / map export
│   │   ├── page.js
│   │   └── index.html
│   ├── map/                      # Map maker integration
│   │   ├── page.js
│   │   └── index.html
│   ├── inventory/                # Asset library / inventory
│   │   ├── page.js
│   │   └── index.html
│   ├── market/                   # Marketplace
│   │   ├── page.js
│   │   └── index.html
│   ├── profile/                  # User profile & settings
│   │   ├── page.js
│   │   └── index.html
│   └── chat/                     # Collaboration chat
│       ├── page.js
│       └── index.html
│
├── ui/                           # HTML pages and styles
│   ├── index.html                # Main entry page (was premium-index.html)
│   ├── styles.css                # Main styles (was styles(1).css)
│   ├── import-model.html         # Import popup
│   └── marketplace.css           # Marketplace styles
│
├── marketplace/                  # Marketplace module (was modules/marketplace/)
│   ├── index.js                  # MarketplaceAPI
│   ├── marketplace-ui.js         # MarketplaceUI
│   ├── AssetBundler.js
│   ├── CreatorPortal.js
│   ├── LicenseManager.js
│   ├── MarketplaceStore.js
│   ├── ModelPreviewRenderer.js
│   ├── MonetizationEngine.js
│   ├── PluginRegistry.js
│   └── StripeBridge.js
│
├── tools/                        # Standalone tools
│   ├── blender/                  # Blender-like modeling tools
│   │   ├── script.js
│   │   ├── editer.js
│   │   ├── modifiers.js
│   │   ├── object-utils.js
│   │   ├── world.js
│   │   ├── audio.js
│   │   ├── chat.js
│   │   └── ...
│   ├── pose/                     # Pose editor tool
│   │   ├── main.js
│   │   ├── index.html
│   │   ├── style.css
│   │   └── ...
│   └── map-maker/                # Map maker tool
│       ├── main.js
│       ├── index.html
│       ├── style.css
│       └── ...
│
├── flags/                        # Feature flags (was features/)
│   ├── animation-features.js
│   ├── interaction-features.js
│   └── ...
│
├── assets/                       # Static assets
│   ├── models/                   # simba.glb, etc.
│   ├── textures/                 # Images
│   ├── audio/                    # WAV, MP3 files
│   └── webp/                     # WebP images
│
└── docs/                         # Documentation
    ├── ARCHITECTURE.md
    ├── REVIEW.md
    ├── TODO.md
    └── plan.md
```

## 2. GUI Architecture — Top Icon Bar + Centered 3D Viewport

```
┌─────────────────────────────────────────────────────┐
│  [📁] [🎯] [✏️] [🔄] [🧊] [🎨] [🖌️] [🤖] [🦴] [🎬] │
│  [🎥] [💡] [🎮] [🗺️] [📦] [🏪] [👤] [💬]          │
│  File  Sel  Edit Trans Obj  Tex  Paint AI   Rig  Anim│
│  Camera Lgt  Game Map  Inv  Mkt  Prof Chat          │
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│              🎯 3D Viewport (centered)               │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Status: Ready  │  FPS: 60  │  Verts: 0  │  Tris: 0 │
└─────────────────────────────────────────────────────┘
```

### 2.1 Top Icon Bar

Each icon:
- **Hover**: Shows tooltip description (from feature's metadata)
- **Click**: Opens a popup page with inputs/buttons/sliders for that feature
- **OK button**: On click, applies settings, executes the action, closes the popup
- **Active state**: Glowing icon when feature is active/modal

### 2.2 Popup Pages

Each feature page (`studio/features/<topic>/index.html`) contains:
- Input controls (sliders, color pickers, number inputs, toggles)
- Action buttons
- OK button that wires inputs to the engine and closes the popup

### 2.3 Shared State

All feature pages share a central state object via `state.js`:
```js
studio.state = {
  selectedObject: null,
  scene: scene,
  camera: camera,
  viewMode: 'solid',
  currentTool: 'select',
  materialPresets: {...},
  // ... all current ProModelerStudio properties
}
```

## 3. State Management (`app/state.js`)

Central reactive state with subscriptions:
- `state.get(key)` — read a value
- `state.set(key, value)` — set a value, triggers subscribers
- `state.subscribe(key, callback)` — react to changes
- Works across all feature pages

## 4. Caching System (`app/cache.js`)

LRU cache for expensive operations:
- `cache.get(key)` — retrieve cached value
- `cache.set(key, value, ttl)` — cache with optional TTL
- `cache.invalidate(pattern)` — clear by pattern
- Caches: loaded models, texture data, AI responses, procedural generations

## 5. AI Bridge (`app/ai-bridge.js`)

Dual-platform AI bridge:
- **WebSim.ai**: Front-end AI for generating UI code, textures, descriptions
- **Puter.js**: Backend AI for heavy processing, file operations, data analysis
- Parallel execution: Sends requests to both, picks fastest response
- Staggered fallback: Falls through from WebSim → Puter → local fallback
- Usage in features: AI code generation, AI texture generation, AI rigging suggestions

```js
// Example: AI-powered feature request
const result = await AIBridge.request({
  prompt: 'Generate a procedural rock mesh',
  platforms: ['websim', 'puter'],    // parallel
  timeout: 10000,
  fallback: () => generateRockLocal() // fallback function
});
```

## 6. Migration Steps

1. **Create directory tree** — mkdir all new domain directories
2. **Move files** — Move existing files into domain directories
3. **Update imports** — Update all `import` paths to new locations
4. **Update HTML** — Update `<script src>` paths
5. **Build `app/shell.js`** — New icon bar + popup system
6. **Build `app/state.js`** — Reactive state management
7. **Build `app/cache.js`** — LRU cache
8. **Build `app/ai-bridge.js`** — WebSim.ai + Puter.js bridge
9. **Create feature pages** — HTML + JS for each of the 19 feature topics
10. **Wire everything** — Connect features to engine systems
11. **Delete duplicates** — Remove old directory structure

## 7. Rust/Lua/Go Audit

| Language | Pros | Cons | Fit |
|----------|------|------|-----|
| **Rust** | Performance, WASM target, memory safety | Build complexity, wasm-bindgen overhead | ✅ Physics engine, heavy computation via WASM |
| **Lua** | Fast prototyping, embeddable, Three.js-like | No type safety, slower runtime | ❌ Too slow for production 3D engine |
| **Go** | Great concurrency, fast compile, GopherJS | Weak WASM support, large binaries | ⚠️ Could work for backend AI bridge, not for frontend |

**Recommendation**: Rust via WASM for performance-critical systems (physics, procedural gen, sculpt). Keep JS for UI/UX layer. Use Go for any backend/API server (not frontend).
