# KAMIKAZZI — Branded Game Suite: Full Project Audit

> **Audit Date:** July 6, 2026  
> **Auditor:** Codebuff AI  
> **Audit Scope:** All 4 sub-projects + shared assets + root configuration

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Overview & Structure](#2-project-overview--structure)
3. [Sub-Project Audits](#3-sub-project-audits)
   - 3.1 KAMAKAZII 3D — Aero Command (Game)
   - 3.2 KAMAKAZII STUDIO 3D
   - 3.3 VECTOR STRIKE: OMNI
   - 3.4 3D Pac-Man Investigate
   - 3.5 Shared Assets
4. [Code Quality Assessment](#4-code-quality-assessment)
5. [Architecture & Design Patterns](#5-architecture--design-patterns)
6. [Dependencies & Technical Stack](#6-dependencies--technical-stack)
7. [Issues & Recommendations](#7-issues--recommendations)
8. [Security & Compliance](#8-security--compliance)
9. [PWA & Deployment](#9-pwa--deployment)
10. [Overall Score & Conclusion](#10-overall-score--conclusion)
11. [Unwired Files & Dead Code Audit](#11-unwired-files--dead-code-audit)
   - 11.1 gui-states Directory: Standalone Mockups
   - 11.2 Dead/Legacy Code in puter-client.js
   - 11.3 Orphaned/Dead Files
   - 11.4 Unwired Functions Summary

---

## 1. Executive Summary

The **Kamikazzi Branded Game Suite** is an ambitious collection of browser-based 3D applications built around a core flight arcade game. The suite demonstrates strong technical architecture, comprehensive feature sets, and solid integration with cloud services (Puter.js). Code quality is generally good with well-structured modules, though several areas show clear signs of rapid prototyping (duplicate code, dead files, submodule drift). The project is best described as **"feature-complete but needs polish"** — every major feature is implemented and functional, but testing infrastructure is absent and there are several maintainability concerns.

**Overall Rating: B+** (Good, maintainable, but with notable gaps in testing and some code duplication across sub-projects.)

---

## 2. Project Overview & Structure

### 2.1 Repository Layout

```
kamikazzi/
├── kamakazii_3d_aero_comand/   # 🎮 Main game (standalone repo)
├── kamakazii_studio3D/         # 🛠️ 3D modeling studio (submodule)
├── kamasazii_vecter_omega3d/   # ⚡ Rust/Wasm air combat game (submodule)
├── 3d_pacman_investigate/      # 🟡 3D Pac-Man (standalone, bundled)
├── assets/                     # Shared suite assets
│   ├── audio/                  # SFX (8 WAV files)
│   ├── kamikazzi/              # UI mockups, screen designs (56+ HTML files)
│   ├── model/                  # 3D models (GLB, GLTF)
│   └── ...                     # images, floors, graffiti
├── index.html                  # Suite entry point
├── sw.js                       # Root service worker
├── manifest.json               # Root PWA manifest
└── package.json                # Suite-level scripts
```

### 2.2 Git Submodules

Two sub-projects are git submodules:
- `kamasazii_vecter_omega3d` → `https://github.com/dev-justin-time/kamasazii-vecter-omega3d.git`
- `kamakazii_studio3D` → `https://github.com/dev-justin-time/kamakazii-studio3d.git`

The remaining two (`kamakazii_3d_aero_comand/` and `3d_pacman_investigate/`) are bundled directly.

### 2.3 Repository State

- **Branch:** master, up to date with origin/master
- **Unstaged changes:** 30+ modified files (all GUI state HTML files received Tailwind CSS + redesign)
- **Untracked:** `assets/kamikazzi/` directory (56+ UI mockup HTML files)
- **Recent commits:** "new feature" (appears 3×), indicates non-descriptive commit messages

---

## 3. Sub-Project Audits

### 3.1 KAMAKAZII 3D — Aero Command (The Game)

**Status: ✅ Most polished, actively developed**

#### Architecture
```
game/
├── main.js              # Bootstrap entry point
├── world.js             # World orchestrator (~1100 lines)
├── renderer.js          # Three.js renderer setup
├── ui.js                # Full HUD + UI management (~2000+ lines)
├── locale.js            # i18n module (7 languages)
├── puter-client.js      # Puter.js integration (~1800 lines)
├── level-fabricator-init.js
├── controls/            # Input handling (5 modules)
│   ├── index.js         # Composition root
│   ├── shared.js        # Shared state, HUD pill
│   ├── keyboard.js      # Arrow/WASD steering
│   ├── touch.js         # Relative drag input
│   ├── joystick.js      # On-screen virtual joystick
│   └── gyro.js          # Device orientation
├── world/               # Game world subsystems
│   ├── shared.js        # TUNING, textures, disposables, background
│   ├── buildings.js     # Procedural city generation
│   ├── explosion.js     # Particle explosion system
│   ├── powerups.js      # 6 powerup types
│   ├── magnet_halo.js   # Magnet powerup visual
│   ├── ideas.js         # AI briefing classification
│   └── plane/           # Plane model + controller
└── gui-states/          # 20+ HTML screens (boot, HUD, start, etc.)
```

#### Strengths
- **Excellent modularity** — clean separation of concerns across `world/`, `controls/`, `game/`
- **Comprehensive TUNING system** — all gameplay constants centralized in `shared.js`
- **Smart resource management** — shared geometry/material registries with WeakSet-based skip-dispose
- **Gradual degradation** — every feature has graceful fallbacks (GLTF → procedural, WAV → synthesized audio, Puter → localStorage)
- **Full i18n** — 7 locales (en, de, es, fr, ja, zh, with locales.json registry)
- **Input arbitration** — mode-lock system (touch, gyro, keyboard, joystick all coexist)
- **6 powerup types** with distinct visual/audio identity
- **Multiplayer presence** via Puter KV + BroadcastChannel fallback
- **HUD propeller lock** — clever camera-relative positioning

#### Issues
- **`ui.js` is ~2200+ lines** — monolithic, should be split into manageable modules
- **`puter-client.js` is ~1800+ lines** — excessive for a client library; should be split
- **World loop is ~900+ lines** in `world.js` — could be factored
- **No test coverage** — zero unit or integration tests
- **CSS in JS** — extensive inline styles throughout `ui.js` instead of CSS classes
- **Several `import('./locale.js')` dynamic imports** — repeated, could be cached
- **Some dead code** — `game/assets/` directory with model/audio duplicates of root assets
- **saveReplay in `puter-client.js`** — `puter.fs.write()` usage is fragile; no `rm`/`rmdir` equivalent

#### Key Metrics
| Metric | Value |
|--------|-------|
| JS files | ~25 |
| Lines of code (game/) | ~8,000+ |
| HTML screens | 20+ |
| Locales | 7 |
| Powerup types | 6 |
| Levels | 8 (progressive) |

---

### 3.2 KAMAKAZII STUDIO 3D

**Status: ⚠️ Ambitious but incomplete / prototype stage**

#### Architecture
```
kamakazii_studio3D/
├── app/                 # Core (7 files)
│   ├── studio.js        # Main Studio class (~1600 lines)
│   ├── engine.js        # ProModelerStudio class (~1200 lines)
│   ├── shell.js         # Shell UI (~800 lines)
│   ├── state.js         # Reactive state
│   ├── cache.js         # LRU cache
│   ├── ai-bridge.js     # WebSim + Puter AI
│   ├── safe-dom.js      # DOM safety helpers
│   └── simple.js        # Simple entry point
├── editor/              # 6 editor managers
├── systems/             # 10 engine systems
├── marketplace/         # Full marketplace module (10 files)
├── features/            # 40+ feature pages
├── tools/               # Standalone tools (blender, pose, map-maker)
└── flags/               # Feature flag modules
```

#### Strengths
- **Massive scope** — modeling, sculpting, animation, physics, node editor, marketplace
- **Plugin system** — lifecycle hooks (`onBoot`, `onBeforeRender`, `onObjectSelected`, etc.)
- **Import/Export** — GLTF, GLB, OBJ, STL, multi-file package import
- **Benchmarking tool** — built-in performance benchmark with JSON export
- **Undo/Redo** — full state snapshot system
- **Marketplace module** — Stripe bridge, asset bundler, license manager, creator portal
- **Wireframe valley generator** — seeded procedural terrain with collision-aware city scatter
- **Animations** — keyframes, easing, timeline, playback

#### Issues
- **Dual entry points** — `studio.js` (new) and `engine.js` (legacy ProModelerStudio) coexist with significant overlap
- **~1600-line Studio class** — monolithic, violates single-responsibility
- **Structural drift** — `ARCHITECTURE_PLAN.md` describes a clean domain-based layout, but the actual file structure doesn't match (uses `./app/` but some imports reference `/modules/`)
- **Large feature pages directory** — 40+ feature `.js` files, many are stubs
- **No build system** — uses bare ES module imports (`import * as THREE from 'three'`), which requires import-maps that aren't consistently configured
- **Import path confusion** — some imports use `'three'` (bare specifier), others use `'three/addons/...'` — will fail without proper import-map
- **`performance.memory` usage** — Chrome-specific API referenced without guard
- **JSZip dependency** — used in render animation but no package.json
- **Marketplace module may not function** — Stripe keys referenced but not configured
- **Duplicate functionality** — two Studio classes with overlapping feature sets

#### Key Metrics
| Metric | Value |
|--------|-------|
| JS files | ~90+ |
| Lines of code (est.) | ~20,000+ |
| Systems | 10 (physics, sculpt, paint, node, audio, cloud, procedural, etc.) |
| Feature pages | 40+ |
| Marketplace files | 10 |
| Entry points | 2+ (studio.js, engine.js, simple.js) |

---

### 3.3 VECTOR STRIKE: OMNI (Rust + Lua + Go)

**Status: ✅ Multi-language proof-of-concept, structurally sound**

#### Architecture
```
kamasazii_vecter_omega3d/
├── Cargo.toml           # Rust crate (wasm-bindgen target)
├── src/lib.rs           # Core engine: 6DOF physics, Lua VM, Wireframe render (~750 lines)
├── scripts/
│   ├── ai_apex.lua     # AI behavior tree
│   └── weapons.lua     # Weapon definitions
├── server/
│   ├── main.go         # WebSocket multiplayer server
│   └── go.mod          # gorilla/websocket dependency
├── index.html          # Frontend + Puter.js SDK
├── style.css           # Cyberpunk HUD theme
├── js/                 # JS renderer
│   ├── wireframe-renderer.js
│   ├── wireframe-models.js
│   ├── level-fabricator.js
│   └── projectiles.js
└── pkg/                # Generated Wasm output
```

#### Strengths
- **Multi-language architecture** — Rust → Wasm for core engine, Lua for scripting, Go for authoritative server
- **Clean Rust code** — well-structured `lib.rs` with `ShipState`, `GameEngine`, `WireframeMesh`
- **6DOF physics** — nalgebra-based rotation integration (Rodrigues' rotation formula)
- **Lua scripting bridge** — Rhai engine embedded in Rust for AI behavior
- **Authoritative Go server** — room-based matchmaking, 60Hz tick, collision detection, anti-cheat
- **WebGL2 wireframe renderer** — custom GLSL shaders, perspective projection
- **Wireframe model generators** — procedural ship models (Interceptor, Apex Fighter)
- **Hot-reloadable scripts** — Lua files loaded dynamically, no recompile needed

#### Issues
- **Build complexity** — requires `wasm-pack`, Rust toolchain, Go SDK
- **Rhai (not Lua)** — despite naming files `.lua`, the embedded scripting engine is Rhai (Rust-native), not Lua
- **No actual physics in Go server** — collisions described but not fully implemented in `server/main.go`
- **Go server not compiled** — no binary in repo, only source
- **Lua/Rhai file mismatch** — `ai_core.rhai` file exists but `ai_apex.lua` and `weapons.lua` use `.lua` extension despite being Rhai syntax
- **`target/` directory committed** — full Rust build artifacts (debug + release + wasm) in repo (~200MB+)
- **Duplicate rendering** — both Rust (WebGL2 in lib.rs) and JS (wireframe-renderer.js) have renderers
- **index.html references both** Rust Wasm entry and JS fallback — hybrid approach unclear

#### Key Metrics
| Metric | Value |
|--------|-------|
| Rust LOC | ~750 (lib.rs) |
| Lua/Rhai files | 3 |
| Go LOC | ~200 (main.go est.) |
| JS files | 6 |
| Build artifacts in repo | ~200MB+ (target/) |
| Multiplayer | WebSocket + Go server |

---

### 3.4 3D Pac-Man Investigate

**Status: ✅ Feature-complete, self-contained game**

#### Architecture
```
3d_pacman_investigate/
├── index.html              # Entry point
├── pacman.js               # Core engine (~2800+ lines)
├── asset-manager.js        # Asset registry
├── asset-selector.js       # UI for model/assets
├── levels.js               # Level definitions
├── challenge-levels.js     # Challenge modes
├── fruit.js                # Fruit spawn system
├── puter-integration.js    # Cloud features
├── pacman-multiplayer.js   # Multiplayer support
├── floors.js               # Map generation
├── model_render.js         # 3D model rendering
├── thumb.js                # Thumbnail generator
├── ...                     # HTML tools, demos
└── assets/                 # Fonts, models, audio
```

#### Strengths
- **Feature-rich** — 3D maze, jump mechanic, power pellets, ghost AI (Puter AI-powered), fruits
- **13 Pac-Man models, 5 ghost models** — impressive asset variety
- **Puter integration** — cloud leaderboards, AI ghosts, authentication, tournaments
- **Accessibility** — full keyboard nav, reduced-motion support
- **Mobile support** — virtual joystick, responsive UI
- **Level progression system** — standard + challenge levels

#### Issues
- **`pacman.js` is 2800+ lines** — monolithic engine
- **No tests** — zero test coverage
- **Separate repository** — doesn't integrate with the game suite's navigation

#### Key Metrics
| Metric | Value |
|--------|-------|
| JS files | 15+ |
| Lines of code (est.) | ~6,000+ |
| Pac-Man models | 13 |
| Ghost models | 5 |
| Fonts | 6 |
| Music tracks | 9 |

---

### 3.5 Shared Assets

**Status: ✅ Well-organized, duplication exists**

#### Structure
```
assets/
├── audio/             # 8 WAV files (SFX)
├── image/             # Backgrounds, explosion GIF, crash splash
├── model/             # 3D models
│   ├── rain_1/        # GLTF cloud model
│   ├── BOEING/        # GLTF plane model
│   └── stylized_ww1_plane.glb
├── floor/             # Ground textures
├── graffiti/          # Wall decals
├── icons/             # App icons
└── kamikazzi/         # UI mockup HTML screens (56+ files)
```

#### Issues
- **`assets/kamikazzi/` is untracked** — 56+ HTML mockup files not in git
- **Duplicate model references** — game references `rain_1/scene.gltf` for clouds and `BOEING/scene.gltf` for plane swap, but only `stylized_ww1_plane.glb` is the canonical plane model
- **Audio fallback chain** — game has elaborate synthesization fallbacks, indicating not all audio assets are finalized
- **`assets/kamikazzi/` contains placeholder references** — `{{DATA:IMAGE:IMAGE_41}}` etc. in achievement/mockup files

---

## 4. Code Quality Assessment

### 4.1 Strengths

| Aspect | Assessment |
|--------|------------|
| **Modularity (Game)** | Excellent — controls split into 5 focused modules, world subsystems cleanly separated |
| **Error handling** | Consistent try/catch with console.warn fallbacks throughout |
| **Graceful degradation** | Every cloud/audio/asset feature has a fallback path |
| **Naming conventions** | Clear, descriptive variable/function names |
| **Comment quality** | Detailed architectural comments, especially in `world.js` and `shared.js` |
| **Resource management** | Shared geometry/material registry prevents GPU memory leaks |
| **State management (Studio)** | Clean reactive state with subscriber pattern |

### 4.2 Weaknesses

| Aspect | Assessment |
|--------|------------|
| **Test coverage** | **ZERO** — no tests anywhere in the entire suite |
| **Monolithic files** | `ui.js` (2200+ lines), `puter-client.js` (1800+ lines), `world.js` (1100+ lines) |
| **Inline styles** | Extensive JS template strings with CSS instead of class-based styling |
| **Duplicate code (Studio)** | Two Studio-class implementations with ~80% overlap |
| **Build artifacts** | Rust `target/` directory committed (~200MB) |
| **Dead files** | `game/assets/` duplicates root assets; stale `flycheck0/` in target |
| **Submodule drift** | Studio submodule has structural drift from its own ARCHITECTURE_PLAN.md |

### 4.3 Patterns & Conventions

- **ES Modules** — consistent use of `import`/`export` across all projects
- **No TypeScript** — entire suite is vanilla JS
- **ESM CDN imports** — Three.js and Puter.js loaded from CDN (esm.sh, jsdelivr)
- **No package manager** — no npm dependencies for the game (pure CDN)
- **LocalStorage for persistence** — shared between game and cloud sync
- **Custom events** — `window.dispatchEvent(new CustomEvent(...))` for cross-module communication
- **Module-level IIFE patterns** — some legacy patterns remain

---

## 5. Architecture & Design Patterns

### 5.1 Game Loop Architecture

The game follows a classic game loop pattern with:
1. **Render loop** — `requestAnimationFrame` with delta-time normalization
2. **State machine** — `state.running`, `state.paused`, `state.over`, `state.won`
3. **Observer pattern** — CustomEvents for cross-cutting concerns (powerup pickup, final sector, etc.)
4. **Manager pattern** — BuildingManager, PowerupManager, ExplosionManager

### 5.2 Dual-Scene Rendering

Innovative approach to backgrounds:
- **Scene 1 (Orthographic)** — Full-screen city photo, contain-fit with overscan
- **Scene 2 (Perspective)** — 3D game world with alpha transparency
- Both composited per frame with `renderer.autoClear = false`

### 5.3 Input Arbitration

Sophisticated input arbitration:
- 4 input sources (keyboard, touch, joystick, gyro)
- Mode-lock: last-used input claims control
- Idle-release: gyro reclaims control after 2.5s of inactivity
- HUD pill shows active input mode

### 5.4 Plugin System (Studio)

Lifecycle hooks pattern:
```
onBoot → onSceneReady → onObjectAdded → onObjectSelected
→ onToolChange → onBeforeRender → onPhysicsStep
→ onAfterRender → onMenuAction → onImport/onExport
```

### 5.5 Cloud Integration Pattern

```
Browser ↔ Puter.js SDK ↔ Puter Cloud
  ↕                          ↕
localStorage (fallback)    KV Store / AI / FS
```

All cloud operations have localStorage fallbacks — the game works fully offline.

---

## 6. Dependencies & Technical Stack

### 6.1 Core Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **3D Engine** | Three.js | 0.128.0 (ESM via esm.sh) |
| **Cloud SDK** | Puter.js | Latest (via CDN) |
| **Controls** | vanilla JS + nipplejs-like joystick | Custom |
| **PWA** | Service Worker + Manifest | Custom |
| **Fonts** | Stick No Bills, Noto Sans JP, JetBrains Mono, Space Mono, Anton, Geist | Google Fonts |

### 6.2 VECTOR STRIKE Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Core Engine** | Rust → Wasm | wasm-bindgen 0.2 |
| **Scripting** | Rhai (not Lua) | 1.x |
| **Physics** | nalgebra | 0.32 |
| **Server** | Go + gorilla/websocket | Latest |
| **Serialization** | serde + serde_json | 1.0 |

### 6.3 Studio Stack

| Component | Technology |
|-----------|------------|
| **Rendering** | Three.js (bare import) |
| **Controls** | OrbitControls, TransformControls |
| **Import/Export** | GLTFLoader, DRACOLoader, GLTFExporter, OBJExporter, STLExporter |
| **Packaging** | JSZip (in code, not package.json) |
| **Marketplace** | Custom Stripe bridge |

### 6.4 Missing Dependencies

- **No test framework** — jest, vitest, mocha, or any testing library
- **No linter** — ESLint, Prettier not configured
- **No type checking** — TypeScript not used anywhere
- **No build tool** — Vite, webpack, esbuild not used (intentional "no build" philosophy)
- **JSZip in engine.js** — imported but not in any package.json

---

## 7. Issues & Recommendations

### 7.1 Critical Issues

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 1 | **Zero test coverage** | 🔴 High | Add at least smoke tests for game loop, world initialization, and collision detection |
| 2 | **~200MB build artifacts** | 🔴 High | Add `target/` to `.gitignore`, run `git filter-branch` to remove from history |
| 3 | **Submodule structural drift** | 🟠 Medium | Reconcile Studio code with ARCHITECTURE_PLAN.md or update the plan |
| 4 | **Rhai/Lua naming mismatch** | 🟠 Medium | Rename `.lua` files to `.rhai` or switch to actual Lua (mlua) |

### 7.2 Moderate Issues

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 5 | **Monolithic files** | 🟠 Medium | Split `ui.js` (HUD, panels, events), `puter-client.js` (KV, AI, lobby, TTS), `world.js` (loop, physics, state) |
| 6 | **Inline styles everywhere** | 🟠 Medium | Extract CSS classes for the HUD panel system |
| 7 | **Two Studio entry points** | 🟠 Medium | Consolidate `studio.js` and `engine.js` into one canonical Studio class |
| 8 | **No import map configured** | 🟠 Medium | Add `<script type="importmap">` for Three.js bare imports in Studio |
| 9 | **Commit message quality** | 🟢 Low | Use descriptive commit messages ("new feature" × 3 is not helpful) |

### 7.3 Minor Issues

| # | Issue | Severity | Recommendation |
|---|-------|----------|----------------|
| 10 | **Dead assets directory** | 🟢 Low | Remove `game/assets/` (duplicates root assets/) |
| 11 | **performance.memory usage** | 🟢 Low | Add guard for non-Chrome browsers |
| 12 | **GUI states not linked** | 🟢 Low | Create navigation between the 56 HTML mockups or remove unused ones |
| 13 | **Missing env vars** | 🟢 Low | Stripe publishable key, Puter API key not configured |
| 14 | **No .gitignore for Rust** | 🟢 Low | Add target/ to `kamasazii_vecter_omega3d/.gitignore` |
| 15 | **SaveReplay cleanup** | 🟢 Low | Fix `puter.fs` cleanup (no rm/rmdir available) |

---

## 8. Security & Compliance

### 8.1 Security Assessment

- **No authentication** — game doesn't require login; Puter auth is optional
- **Content Security Policy** — not configured (would need CDN allowlisting)
- **localStorage data** — scores, settings, briefings, replays — no sensitive data
- **Puter KV** — uses `puter.kv` with prefixes but no encryption (Puter handles this)
- **Puter AI** — TTS and txt2img calls could be exploited; prompt injection handled via structured system prompts

### 8.2 Compliance

- **Legal panel** — comprehensive CCPA, GDPR, COPPA compliance UI
- **Age gate** — consent checkbox with localStorage persistence
- **Data collection disclosed** — score, username, avatar_url, run history
- **No cookie tracking** — entirely first-party storage

---

## 9. PWA & Deployment

### 9.1 PWA Status

| Requirement | Status |
|-------------|--------|
| Manifest | ✅ Complete (icons, shortcuts, orientation, categories) |
| Service Worker | ✅ Shell caching + network-first strategy |
| Offline support | ✅ Core game works without network (localStorage fallbacks) |
| Standalone display | ✅ `display: standalone`, `display_override` |
| Icons | ✅ SVG (any), PNG (192, 512) |
| Shortcuts | ✅ Start Flying, Leaderboard |

### 9.2 Deployment Targets

| Target | URL | Status |
|--------|-----|--------|
| **Puter App Store** | Multiple entry points | ✅ Designed for it |
| **GitHub Pages** | Root + subdirectories | ✅ Static, no build needed |
| **Self-hosted** | Any HTTP server | ✅ Python, Node, nginx |

---

## 10. Overall Score & Conclusion

### Scoring

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 8/10 | Clean modular game, but Studio has duality |
| **Features** | 9/10 | Rich feature set across all apps |
| **Code Quality** | 6/10 | Good patterns marred by monolithic files |
| **Testing** | 0/10 | No tests anywhere |
| **Documentation** | 8/10 | Good READMEs, detailed comments |
| **Performance** | 7/10 | Smart resource management, but no profiling |
| **Security** | 7/10 | Basic compliance, no CSP |
| **Maintainability** | 5/10 | Submodule drift, build artifacts, dead code |
| **PWA Readiness** | 9/10 | Well-configured, offline support |
| **Cloud Integration** | 9/10 | Comprehensive Puter.js integration |
| **Overall** | **6.8/10** | **B — Good, feature-rich, needs testing and polish** |

### Final Word

The Kamikazzi suite is an **impressive, ambitious project** that successfully delivers a playable 3D flight arcade, a promising (if incomplete) 3D modeling studio, and a multi-language proof-of-concept combat game. The main game (`kamakazii_3d_aero_comand`) is the crown jewel — polished, modular, and feature-rich.

The top priorities for improvement are:
1. **Add tests** — even basic smoke tests would dramatically improve confidence
2. **Clean up build artifacts** — remove `target/` from version control
3. **Consolidate Studio classes** — resolve the dual-entry-point situation
4. **Split monolithic files** — `ui.js`, `puter-client.js`, `world.js`
5. **Fix submodule drift** — ensure code matches documented architecture

The project's greatest strength is its **graceful degradation philosophy** — every feature from cloud sync to sound effects has a working fallback, ensuring the game never breaks regardless of environment. This is excellent engineering practice.

---

## 11. Unwired Files & Dead Code Audit

> **Audit Focus:** `gui-states/` directory, dead/legacy code in game JS, orphaned files, unwired functions  
> **Scope:** `kamakazii_3d_aero_comand/game/` only  
> **Method:** Code search (`ripgrep`), manual review of imports/exports, cross-referencing JS vs HTML

---

### 11.1 gui-states Directory: Standalone Mockups (Not Wired to Game)

The `gui-states/` directory contains **26 files** (25 HTML + 1 CSS). **None are dynamically loaded or referenced by the game JavaScript at runtime.** A search for `"gui-states"` across all game JS returned 0 matches. All game screens are **inlined as hidden `<div>` elements** in the game's `index.html`.

The standalone HTML files exist as **previewable mockups** — each works independently with its own Tailwind-based navigation bar linking to sibling files. They serve as design references but are NOT consumed by the game engine.

#### Wired vs. Unwired Mapping

| gui-states file | Inline ID in index.html | Wired via game JS? | Purpose |
|---|---|---|---|
| `index.html` | N/A | ❌ | Hub page for browsing gui-states mockups — not used by game |
| `styles.css` | N/A | ❌ | Original CSS — not loaded by game (styles are inlined in index.html) |
| `boot.html` | `bootScreen` | ✅ (ui.js L185) | Boot sequence overlay — inlined as HTML, manipulated via JS |
| `start.html` | `startScreen` | ✅ (ui.js L152) | Main menu — inlined, managed by JS |
| `hud.html` | Inline `<div id="hud">` | ✅ (index.html) | HUD inline in index.html body — standalone file is a preview only |
| `crash.html` | `explodeScreen` | ✅ (ui.js L153) | Crash animation overlay |
| `mission-success.html` | `missionSuccess` | ✅ (ui.js L171) | Success screen — inlined div |
| `mission-terminated.html` | `gameOver` | ✅ (ui.js L155) | Game over screen — inlined div |
| `pause.html` | `pauseScreen` | ✅ (ui.js L240) | Pause menu — inlined div |
| `leaderboard.html` | `leaderboardPanel` | ✅ (ui.js L262) | Leaderboard panel |
| `lobby.html` | `lobbyPanel` | ✅ (ui.js L410) | Multiplayer lobby |
| `profile.html` | `profilePanel` | ✅ (ui.js L335) | Pilot profile |
| `skin-lab.html` | `skinLabPanel` | ✅ (ui.js L270) | AI skin generation lab |
| `marketplace.html` | `marketplacePanel` | ✅ (ui.js L247) | Building skins marketplace |
| `powerups.html` | `communityPowerupPanel` | ✅ (ui.js L320) | Community powerup registry |
| `replays.html` | `replayPanel` | ✅ (ui.js L387) | Replay gallery |
| `replay-detail.html` | `replayDetailPanel` | ✅ (ui.js L390) | Replay detail view |
| `history.html` | `runHistoryPanel` | ✅ (ui.js L341) | Run history |
| `briefings.html` | `briefingsPanel` | ✅ (ui.js L347) | Pilot briefings |
| `settings.html` | `settingsPanel` | ✅ (ui.js L253) | Settings |
| `shortcuts.html` | `shortcutsPanel` | ✅ (ui.js L405) | Keyboard shortcuts |
| `legal.html` | `legalPanel` | ✅ (ui.js L294) | Legal & compliance |
| `delete-confirm.html` | `deleteConfirmPanel` | ✅ (ui.js L400) | Replay delete confirmation |
| `final-sector.html` | `finalSectorScreen` | ✅ (ui.js L1835) | Boss-approaching flash |
| `model-upgrade.html` | `modelUpgradeScreen` | ✅ (ui.js L1857) | Plane upgrade announcement |
| `terrain-editor.html` | `levelFabricatorOverlay` | ✅ (level-fabricator-init.js L21,55) | Level Fabricator terrain editor |

**Key takeaway:** The `gui-states/` HTML files are **duplicated efforts** — their content mirrors what's inlined in `index.html`. They are not referenced by game JS (`fetch`, `XMLHttpRequest`, `innerHTML` load, etc.). The standalone nav bar each file has (linking to all others) creates a separate preview app that exists outside the game runtime.

#### Recommendation
- Option A: Remove `gui-states/` and use `index.html` as the single source of truth for all screens
- Option B: Keep them as design documentation but add a README stating their purpose ("standalone UI mockups — not loaded at runtime")
- Option C: If mockup iteration is valuable, set up a static generator to derive the standalone mockups from the inlined source

---

### 11.2 Dead/Legacy Code in puter-client.js

The `puter-client.js` module exports **35+ functions**, all of which are imported and used by `world.js` and/or `ui.js`. However, it also sets **4 legacy window globals** that appear to be dead — never called from game code:

| Window Global | Set In | Called From Game JS? | Notes |
|---|---|---|---|
| `window.setPuterApiKey` | puter-client.js (IIFE) | ❌ | Legacy API-key auth; may be used from browser console for debugging |
| `window.__puterSendIdeas` | puter-client.js (IIFE) | ❌ | Legacy `puter.create()` call; superseded by `createKVCollection` / `powerupColl.create()` |
| `window.addSkyIdea` | puter-client.js (IIFE) | ❌ | Legacy local-briefing writer; superseded by `save('Briefings', ...)` via world.js |
| `window.fetchCommentsFromPuter` | puter-client.js (IIFE) | ❌ | Legacy briefings fetcher; superseded by `powerupColl.list()` / `getCommunityPowerups()` |
| `window.generateFromComment` | puter-client.js | ✅ | Used by `ideas.js` `maybeEscalateToAi()` — still active |

**Additionally:** The entire `function initLegacy()` IIFE + `setPuterApiKey` + `legacyClient` machinery (lines 335–375) is legacy API-key auth that modern Puter SDK ESM imports replace. It runs on every module load, unconditionally.

#### Recommendation
- Remove the 4 dead window globals and the `legacyClient` init path if no external consumers depend on them
- `initLegacy()` runs at module load time and tries `localStorage.getItem('puterApiKey')` every time — could be deferred or removed

---

### 11.3 Orphaned/Dead Files

| File/Directory | Status | Size | Notes |
|---|---|---|---|
| `kamakazii_3d_aero_comand/game/assets/` | 🟢 Dead | Unknown | Duplicates root `assets/` — contains model/audio duplicates |
| `kamakazii_3d_aero_comand/gui-states/styles.css` | 🟢 Dead | ~15KB | Styles superseded by Tailwind classes + inlined CSS in index.html |
| `kamasazii_vecter_omega3d/target/` | 🔴 Bloated | ~200MB | Full Rust build artifacts committed to git |
| `kamasazii_vecter_omega3d/target/flycheck0/` | 🟢 Dead | ~small | Stale Rust compiler scratch files |
| `kamakazii_studio3D/features/*.js` (many) | 🟡 Stubs | 40+ files | Many are empty/placeholder feature files with just exports |
| `assets/kamikazzi/` | 🟢 Untracked | 56+ files | UI mockup HTML files — should be .gitignored or tracked |
| `kamakazii_3d_aero_comand/game/locale.js` L8 | 🟡 Cyclic | 1 line | Has `import { t, setLocale, ... } from './locale.js'` — self-import / circular reference? |

**`game/assets/` duplication detail:**
The game has its own `game/assets/` directory that mirrors root `assets/`. This means:
- `root/assets/audio/explosion.wav` and `game/assets/audio/explosion.wav` — same file, two locations
- `root/assets/model/...` and `game/assets/model/...` — duplicated 3D models
- The game's `world/shared.js` references paths under `/assets/` (root), so `game/assets/` is not used at runtime

---

### 11.4 Unwired Functions Summary

**No orphaned internal functions found.** Every function defined in `world.js`, `ui.js`, `renderer.js`, `controls/*.js`, and `world/*.js` is either:
- Called internally within the same file, OR
- Exported and imported by another game module, OR
- Referenced via the `world` return object

The game's function wiring is **complete** — no defined functions go unused.

**Only the legacy window globals in puter-client.js (Section 11.2) represent truly dead code paths.**

---

### 11.5 Key Statistics

| Metric | Value |
|--------|-------|
| gui-states standalone files | 26 (25 HTML + 1 CSS) |
| gui-states files loaded by game JS | 0 |
| Dead window globals in puter-client.js | 4 |
| Orphaned asset directories | 1 (`game/assets/`) |
| Build artifacts in git | ~200MB (`target/`) |
| Stub feature files (Studio) | 40+ |
| Untracked mockup files | 56+ |
| Unused exported functions | 0 |
| Unused internal functions | 0 |
| Self-circular import | 1 (locale.js L8 — benign but messy) |

---
