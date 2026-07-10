# KAMAKAZII STUDIO 3D

A browser-based 3D modeling, animation, and game asset creation suite built with Three.js.

## Quick Start

```bash
cd kamakazii_studio3D
npm install
node serve_local.js
# Open http://localhost:3000/ui/index.html
```

## Architecture

```
kamakazii_studio3D/
├── app/                  # Core engine modules
│   ├── studio.js         # Main Studio class (scene, renderer, controls)
│   ├── engine.js         # Three.js renderer setup, resize, render loop
│   ├── state.js          # Shared reactive state store
│   ├── cache.js          # In-memory asset cache
│   ├── ai-bridge.js      # AI feature bridge (Puter AI integration)
│   ├── puter-client.js   # Puter SDK auth & cloud storage
│   ├── status-bar.js     # Status bar updater
│   ├── shell.js          # App shell (icon bar, popups, status)
│   ├── simple.js         # Lightweight studio mode
│   ├── dbg.js            # Debug logger utility
│   ├── defaultModels.js  # Bundled starter model definitions
│   ├── material-helpers.js
│   └── error-logger.js   # Client-side error logger (cloud-backed)
│
├── ui/                   # Main HTML entry & stylesheets
│   ├── index.html        # Entry point (icon bar, viewport, popup system)
│   ├── import-model.html # Standalone model import popup window
│   ├── manifest.json     # PWA manifest
│   ├── style.css         # Legacy styles
│   ├── styles.css        # Extended styles
│   └── css/              # Modular stylesheets
│       ├── base.css      # Reset, variables, scrollbar, focus-visible
│       ├── layout.css    # Menu bar, toolbars, sidebars, viewport
│       ├── components.css # Panels, outliner, assets, properties, materials
│       └── utilities.css # Loading overlay, responsive helpers
│
├── editor/               # Editor subsystem
│   ├── UIManager.js      # All UI wiring (panels, menus, tools, cameras)
│   ├── ModelEditor.js    # Object editing operations
│   ├── AnimationManager.js # Keyframe & clip management
│   ├── CameraManager.js  # Camera presets, projection, FOV
│   ├── ImportExportManager.js # GLTF/GLB/OBJ/STL import & export
│   ├── ImportNormalize.js # Import pipeline normalization
│   ├── BoneRemapper.js   # Skeleton retargeting
│   ├── ObjectsManager.js # Object lifecycle (add, delete, duplicate)
│   ├── ModelIO.js        # Low-level model read/write
│   ├── ModelEditor.js    # Edit operations (subdivide, mirror, slice)
│   └── motionStorage.js  # Motion clip persistence
│
├── features/             # Feature pages (loaded into popup overlay)
│   ├── _shared/          # Shared utilities
│   │   ├── actionMap.js  # Action registry & dispatch
│   │   ├── canvasUtils.js # Canvas rendering helpers
│   │   └── renderControls.js # Declarative control renderer
│   ├── page-loader.js    # Dynamic feature page loader
│   ├── ai/page.js        # AI generation & suggestions
│   ├── animate/page.js   # Timeline & keyframe editor
│   ├── file/page.js      # New/open/save/export
│   ├── paint/page.js     # Vertex & texture painting
│   ├── rig/page.js       # Bone rigging & skinning
│   ├── material/page.js  # Material properties & presets
│   ├── inventory/page.js # Asset library browser
│   ├── market/page.js    # Marketplace integration
│   ├── profile/page.js   # User preferences
│   ├── chat/page.js      # AI chat & collaboration
│   ├── camera/page.js    # Camera management
│   ├── lighting/page.js  # Lighting & HDRI
│   ├── game/page.js      # Game mode & physics
│   ├── map/page.js       # Terrain & level editing
│   ├── texture/page.js   # UV mapping & texture tools
│   ├── paint/page.js     # Paint system
│   ├── sculpt/page.js    # Sculpting tools
│   ├── particles/page.js # Particle system
│   ├── physics/page.js   # Physics simulation
│   ├── terrain-*/page.js # Terrain analytics/export/presets
│   ├── biome-painter/page.js # Biome painting
│   ├── scenery-scatter/page.js # Scenery placement
│   ├── publish/page.js   # Marketplace publishing
│   ├── report/page.js    # Scene diagnostics
│   ├── extensions/page.js # Plugin manager
│   └── ...               # 50+ feature modules
│
├── systems/              # Runtime systems
│   ├── SystemManager.js  # System lifecycle coordinator
│   ├── ProceduralSystem.js # Procedural generation
│   ├── SculptSystem.js   # Sculpting engine
│   ├── TexturePaintSystem.js # Texture painting
│   ├── VertexPaintSystem.js  # Vertex painting
│   ├── ParticleSystem.js # GPU particle system
│   ├── PhysicsSystem.js  # Cannon.js physics wrapper
│   ├── AudioSystem.js    # Audio playback & analysis
│   ├── CloudSystem.js    # Cloud asset store
│   ├── LightmapBaker.js  # Lightmap baking
│   ├── WaterSystem.js    # Water rendering
│   ├── WeatherSystem.js  # Weather effects
│   ├── VolumetricFog.js  # Fog rendering
│   ├── InputManager.js   # Keyboard/mouse input
│   ├── NodeEditorSystem.js # Visual node editor
│   └── physics/          # SPH fluid simulation
│
├── marketplace/          # Asset marketplace
│   ├── index.js          # MarketplaceAPI
│   ├── marketplace-ui.js # Full marketplace UI (browse, detail, checkout)
│   ├── marketplace.css   # Marketplace styles
│   ├── MarketplaceStore.js # Product catalog
│   ├── ModelPreviewRenderer.js # 3D model preview
│   ├── PluginRegistry.js # Plugin management
│   ├── LicenseManager.js # License/entitlement tracking
│   ├── CreatorPortal.js  # Creator dashboard
│   ├── MonetizationEngine.js # Stripe checkout
│   ├── StripeBridge.js   # Stripe.js integration
│   └── plugins/          # Built-in plugins
│
├── tools/                # Standalone tools
│   ├── blender/          # Blender-like editor tools
│   ├── map-maker/        # Terrain map editor
│   └── pose/             # Pose & animation tool
│
├── systems/physics/      # SPH fluid simulation
├── flags/                # Feature flags
├── locales/              # i18n (en/studio.json)
├── shared/               # Cross-project utilities
├── tests/                # Unit & integration tests
├── docs/                 # Documentation
├── licences/             # Third-party model licenses
└── assets/               # Models, icons, textures
```

## UI System

### Popup Overlay (Feature Pages)

The main UI uses a **popup overlay system**. Each feature opens as a centered modal panel:

- Click an **icon bar button** → `openPopup(id, label)` loads the feature's `page.js`
- **Close methods**: ✕ button (top-right), Escape key, or click outside overlay
- Feature pages render into a container via `export function render(container, state)` or `export const meta = { controls: [...] }`

### Close Button Pattern

All modals/panels include a close button with consistent styling:

```css
.popup-close-btn {
  width: 28px; height: 28px;
  background: rgba(255,255,255,0.06); border: none; border-radius: 6px;
  color: #888; font-size: 16px; cursor: pointer; transition: all .15s;
}
.popup-close-btn:hover { background: rgba(255,70,70,0.2); color: #ff5555; }
```

All panels support **Escape key** to close.

### Feature Page Patterns

**Declarative (simple features):**
```js
export const meta = {
  controls: [
    { key: 'name', type: 'select', label: 'Preset', options: [...] },
    { key: 'apply', type: 'button', label: 'Apply', onClick: 'applyPreset' },
  ],
  onApply: (state, app) => { /* apply logic */ },
};
export { meta };
```

**Custom render (rich features):**
```js
export function render(container, state) {
  container.innerHTML = `<div class="my-panel">...</div>`;
  // Wire events, build UI, etc.
}
```

### Marketplace

The marketplace is a full-screen overlay with sidebar navigation:

- **Browse**: Featured, trending, new releases, categories
- **Search**: Filtered results with sort
- **Detail**: Product info, 3D preview, reviews, purchase
- **Plugin Manager**: Install/enable/disable plugins
- **Creator Dashboard**: Earnings, products, analytics
- **Checkout**: Stripe integration (simulated in dev mode)

## Key Modules

### Studio (`app/studio.js`)
Main application class. Manages:
- Three.js scene, camera, renderer
- Object selection and transform gizmo
- Undo/redo history
- Animation playback
- Import/export pipeline

### UIManager (`editor/UIManager.js`)
Wires all DOM elements to Studio methods. Handles:
- Menu system (File, Edit, Object, etc.)
- Toolbar (transform modes, shading)
- Sidebars (outliner, properties, materials)
- Timeline interaction
- Camera management
- Console commands

### State (`app/state.js`)
Shared key-value store for cross-module communication:
```js
import { state } from '../app/state.js';
state.set('studio', studioInstance);
const studio = state.get('studio');
```

### Puter SDK (`app/puter-client.js`)
Cloud storage, AI, and auth via Puter:
- File read/write to virtual drive
- AI text generation
- User authentication
- Circuit breaker for outages

## Development

### Serving Locally
```bash
node serve_local.js          # Serves on localhost:3000
```

### Testing
```bash
npm test                     # Run unit tests
npx eslint .                 # Lint
```

### Adding a Feature
1. Create `features/my-feature/page.js`
2. Add icon to the `ICONS` array in `ui/index.html`
3. Feature loads automatically when the icon is clicked

### CSS Architecture
- `ui/css/base.css` — Reset, variables, focus states
- `ui/css/layout.css` — App shell, toolbars, sidebars
- `ui/css/components.css` — Panel content, outliner, properties
- `marketplace/marketplace.css` — Marketplace-specific styles
- Inline `<style>` in `ui/index.html` for popup overlay styles

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D Engine | Three.js r158 |
| Physics | Cannon.js ES |
| Cloud | Puter SDK v2 |
| Payments | Stripe.js |
| Build | ES Modules (no bundler) |
| UI | Vanilla JS + DOM |
| Icons | Font Awesome 6.4 |
| Audio | Web Audio API |

## Close Button Audit

| Location | Close Method | Status |
|----------|-------------|--------|
| Feature popup overlay | ✕ button + Escape + overlay click | ✅ |
| Marketplace overlay | ✕ Close button + Escape | ✅ |
| Import model window | Close button | ✅ |
| Pose tool panels | Panel toggle buttons (×) | ✅ |
| Map maker overlay | Escape / overlay click | ✅ |
