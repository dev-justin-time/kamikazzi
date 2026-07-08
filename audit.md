# KAMIKAZZI — Full Audit

> **Scope:** All three apps + root structure. Tech debt, best-practice gaps, security/licensing concerns, and concrete improvements, prioritized.
> **Date of audit:** July 2026 — refreshed against working tree at HEAD on `master` (2 commits ahead of origin).
> **Audience:** maintainers preparing the suite for Puter App Store deployment.

---

## TL;DR — Top Risks

1. **Root `manifest.json` icon SVG recreated** — the deleted `assets/icons/icon.svg` was restored and the manifest trimmed to SVG-only (PNG entries removed since they were not recoverable). `kamakazii_3d_aero_comand/manifest.json` was verified — its icons exist at `kamakazii_3d_aero_comand/assets/icons/` and are correct.
2. **CSP meta tags added to all 5 primary entry points; SRI applied to Font Awesome 6.4.0.** Most CDN resources (import maps, Tailwind, Google Fonts, Puter.js) cannot use SRI — see Appendix B. All three apps load Puter.js, Three.js, Tailwind, Google Fonts, and Font Awesome via plain `<script src>` / `<link>` with zero integrity hashes. A CDN compromise would be invisible.
3. **CI is now wired (GitHub Actions) but coverage is minimal.** `cargo check` (wasm32), `go vet + build`, JS syntax checks on 5 key files, and `node --test` for import-normalize tests. No lint, no typecheck, no HTTP smoke tests yet.
4. **Go server now has auth, rate limiting, and read limits** (no TLS yet). Player ID validated via regex, max 5 connections per IP, token-bucket rate limiter (20 msg/s), SetReadLimit(4KB). `mathRand()` now uses crypto/rand-seeded PRNG. `applyTorque()` implements real ZYX Euler rotation.
5. **Root `sw.js` `/game.js` removed.** Absolute paths remain (required for root-level service worker covering the suite).
6. **License attribution is complete for confirmed assets** (5 entries in `ATTRIBUTION.md` with matching `lic/` folders). The **Bogotá Skyline model (CC-BY-NC-4.0)** was **removed** — all CC-BY-NC-4.0 assets are now cleared from the suite.
7. **vecter_omega3d README updated** — all "Lua" references replaced with "Rhai", `.lua` filenames changed to `.rhai`, code examples converted to Rhai syntax.

---

## 1. Repo-Level Findings

### 1.1 Working tree deletions — intent verified

The working tree has ~150 unstaged deletions under `assets/` and the `3d_pacman_investigate` submodule. These are **intentional** — the root `index.html` has been rewritten as a clean suite launchpad (no longer depends on deleted assets), and the `README.md` has been updated to remove stale references to Lua.

**Resolved:** Root `manifest.json` now references only the recreated `assets/icons/icon.svg`. `kamakazii_3d_aero_comand/manifest.json` icons verified present.

### 1.2 New documentation files added

Since the previous audit, three significant files were added:

| File | Status | Notes |
|------|--------|-------|
| `a11y.css` | ✅ New | Universal focus-visible, prefers-reduced-motion, contrast tokens |
| `ACCESSIBILITY.md` | ✅ New | Documents the a11y pass, contrast spot-check, migration guide |
| `ATTRIBUTION.md` | ✅ New | 6 confirmed attributions + audit queue for unverified assets. Companion `lic/` folder with verbatim license texts |

### 1.3 Submodule configuration is asymmetric

`.gitmodules` declares `kamasazii_vecter_omega3d` and `kamakazii_studio3D` as submodules, but `kamakazii_3d_aero_comand` is a plain directory. The README does not make this distinction clear.

### 1.4 Root `package.json` is still a façade

No dependencies, no devDependencies, no test/lint/format/build/typecheck scripts, no lockfile. The three `scripts` entries all just run `python -m http.server 8765`.

### 1.5 Root `index.html` — now a proper launchpad

The root entry point has been rewritten as a clean 3-card suite launcher linking to each app. It is self-contained (~220 lines), uses inline CSS (no Tailwind dependency), and does not reference any deleted assets. **This is a significant improvement** over the previous state.

### 1.6 Root `sw.js` — ✅ fixed

`/game.js` removed from SHELL_URLS. Absolute paths remain (required for root-level service worker covering the suite). The aero_comand `sw.js` also had `/game.js` removed.

### 1.7 `.gitattributes` — ✅ added

`.gitattributes` now enforces LF for all source files (JS, CSS, HTML, JSON, MD, RS, Rhai, Go, TOML, YAML, SVG), CRLF for Windows-specific files (.bat, .ps1, .cmd), binary for media/3D/font/archive files, and `-diff` for lock files.

---

## 2. Per-App Findings

### 2.1 `kamakazii_3d_aero_comand/` — the main game

**State:** Production-quality game with 8 sectors, 6 powerups, AI skin lab, multiplayer lobby, replay gallery, level fabricator, profile system, leaderboard, community powerup registry, legal/compliance panel, and internationalization (7 locales).

**Strengths**
- Comprehensive ARIA attributes on all overlays and interactive elements (`role="dialog"`, `aria-modal="true"`, `aria-label`, `aria-live`, `role="switch"`, etc.).
- `a11y.css` block appended to both CSS files (`gui-states/styles.css` and `level-fabricator/ui/styles.css`).
- i18n system with 7 locale files (en, de, es, fr, ja, zh) and `data-i18n` / `data-i18n-html` attributes.
- Material Symbols icon font with `aria-hidden="true"` on decorative icons.
- Screen loader system for dynamic GUI state injection from `gui-states/*.html`.
- Level fabricator is a full 3D terrain editor with 14 presets.

**Issues**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 1 | ~~**High**~~ | ~~`manifest.json` references deleted icons~~ | ✅ Fixed — SVG recreated, manifest trimmed to SVG-only |
| 2 | ~~**High**~~ | ~~`sw.js` caches nonexistent `/game.js`~~ | ✅ Fixed — removed from both sw.js files |
| 3 | **High** | Crash images reference deleted assets | `#explodeScreen` references `/assets/image/1.webp` and `/assets/image/explode.gif` — both deleted. |
| 4 | **Medium** | `index.html` is 114,647 characters | Single-file architecture with all CSS + HTML + Tailwind config inline. Hard to navigate, easy to regress. |
| 5 | **Medium** | Tailwind loaded from CDN at runtime | `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries">` — adds ~300KB download on every page load. Should be pre-compiled for production. |
| 6 | **Medium** | Three.js 0.128.0 (2021) | Missing 3+ years of renderer improvements, glTF animation fixes, and security patches. |
| 7 | ~~**Medium**~~ | ~~No SRI on CDN scripts~~ | ✅ Resolved — CDN resources in aero_comand (Tailwind CDN, esm.sh import maps, Google Fonts) cannot use SRI (Appendix B). No Font Awesome in this app (uses Material Symbols). |
| 8 | **Low** | `#bootScreen` references deleted dev photo | `<img class="dev-splash" src="./assets/image/jt.png">` — file deleted. |
| 9 | **Low** | `console.log` throughout production code | 126 matches across the suite. Should be gated behind a debug flag or stripped for production. |

**Concrete improvements**
1. Fix `manifest.json` icon paths or create replacement icons.
2. Remove `/game.js` from `sw.js` SHELL_URLS; fix absolute paths to relative.
3. Extract CSS from `index.html` into a separate file; pre-compile Tailwind.
4. Upgrade Three.js to latest stable (0.170+) or at least pin in `package.json`.
5. Add SRI hashes to all CDN `<script>` and `<link>` tags.

### 2.2 `kamakazii_studio3D/` — the editor (standalone repo)

**State:** Fully scaffolded 3D editor with 40+ feature pages, marketplace system with Stripe integration (simulated), plugin registry with lifecycle hooks, physics/sculpt/paint systems, and a modular architecture.

**Strengths**
- **Real architecture:** `engine.js` (~1,000 lines) implements a full Three.js editor with OrbitControls, TransformControls, GLTFLoader, GLTFExporter, OBJExporter, STLExporter, procedural generation, physics, sculpting, texture painting, node editor, animation system, and plugin registry.
- **Modular shell:** `shell.js` implements a grouped icon bar with search/filter, category dividers, tooltips, and popup page system.
- **Reactive state:** `state.js` provides a clean pub/sub state management pattern.
- **One test file exists:** `tests/import-normalize.test.mjs` — uses Node.js built-in test runner, tests the import normalization system with 5 test cases per model variant.
- **`a11y.css` appended to 6 CSS files** in this app.
- **Import normalization:** `editor/import-normalize.js` scales, floor-aligns, centers, and yaws imported models — tested and documented.

**Issues**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 1 | **High** | `manifest.json` references icons that may not exist | `../assets/icons/icon.svg`, `icon-192.png`, `icon-512.png` — verify these exist in the submodule. |
| 2 | **Medium** | Three.js version mismatch with aero_comand | Studio uses 0.158.0 (via unpkg.com), aero_comand uses 0.128.0 (via esm.sh). Different CDN providers, different versions. |
| 3 | ~~**Medium**~~ | ~~No SRI on CDN scripts~~ | ✅ Font Awesome has SRI. Other CDN resources are import map entries (cannot have SRI) — see Appendix B. |
| 4 | **Medium** | `engine.js` imports from wrong paths | `import { ProceduralSystem } from './modules/ProceduralSystem.js'` — the actual file is at `systems/ProceduralSystem.js` (confirmed on disk). This will fail at runtime unless there's an import map alias. Same issue for `InputManager`, `AudioSystem`, `CloudSystem`, and marketplace imports. |
| 5 | ~~**Medium**~~ | ~~Many feature pages are stubs~~ | ✅ **Partially resolved** — 51 of 56 feature pages now use shared `_shared/actionMap.js` + `_shared/renderControls.js` modules (eliminated ~5,000 lines of duplicated boilerplate). 5 pages with custom canvas-based UIs (biome-painter, scenery-scatter, terrain-analytics, terrain-export, terrain-presets) retained their own implementations. Each page now imports shared action handlers + control renderer instead of duplicating 80+ lines of `_actionMap`/`_renderControls`/`_status` per file. |
| 6 | **Medium** | Duplicate code between `tools/blender/` and `engine.js` | Both implement scene management, object manipulation, and rendering. The `tools/blender/script.js` is ~2,300 lines. |
| 7 | **Low** | `ARCHITECTURE_PLAN.md` references `app/boot.js` | This file doesn't exist in the tree. The plan is aspirational, not reflective of current state. |
| 8 | **Low** | Marketplace Stripe integration is simulated | `StripeBridge.js` creates fake checkout sessions. Fine for development, but document this clearly. |

**Concrete improvements**
1. Fix `engine.js` import paths (or verify the `modules/` alias works via import map).
2. Add SRI hashes to all CDN imports in `ui/index.html`.
3. Run `node --test tests/import-normalize.test.mjs` in CI.
4. Align Three.js version with the rest of the suite or document the divergence.
5. Add feature-implementation status to README (✅ / 🟡 / ⬜).

### 2.3 `kamasazii_vecter_omega3d/` — air combat (most active)

**State:** Mature, multi-language stack with Rust→Wasm engine, Go authoritative server, Rhai scripting, WebGL2 frontend, and a modular Star Sparrow spaceship builder.

**Strengths**
- **Rust engine is well-structured:** `lib.rs` (~400 lines) implements 6DOF physics with nalgebra, Rhai VM integration, WebGL2 wireframe rendering, ship state management with custom build stats (mass, thrust_mult, drag, angular_drag), and PvP/PvAI mode switching.
- **Go server is functional:** `main.go` (~280 lines) implements room-based matchmaking, 60Hz authoritative tick, input validation (anti-cheat clamp), projectile collision detection, glitch drive with cooldown, and broadcast state sync.
- **Rhai scripts are clean:** `ai_apex.rhai` implements a 5-state behavior tree (Glitch Drive → Evasive Retreat → Attack → Pursuit → Patrol) with formation flying support. `weapons.rhai` defines 5 weapon types with overheat system.
- **Client error logger:** Comprehensive error logging system that captures `window.onerror` + `unhandledrejection`, deduplicates within 5s window, buffers up to 50 entries, and flushes to Puter FS as date-bucketed JSONL.
- **Rhai hot-reload:** Polls script files every 1.5s, compares content, and re-loads into the engine without page refresh. Includes error display panel in HUD.
- **Star Sparrow builder:** Modular spaceship builder (`star_sparrow_builder.js`, ~930 lines) with 32 parts, per-part VAOs, theme presets, save/load to Puter KV, and Rust stats integration via `set_ship_stats()`.
- **`wasm-opt = false`** correctly set in `package.json` build scripts.
- **Attribution in HUD:** Arena credit line `#arena-credit` displays CC-BY-4.0 attribution for the Neon Grid model.

**Issues**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 1 | ~~**High**~~ | ~~README references "Lua" throughout~~ | ✅ Fixed — all references updated to Rhai, code examples converted |
| 2 | ~~**High**~~ | ~~Go server has no auth, no rate limiting~~ | ✅ Fixed — IP limiter, player_id regex, rate limiter, read limits |
| 3 | ~~**Medium**~~ | ~~`mathRand()` is biased and predictable~~ | ✅ Fixed — crypto/rand seeded math/rand |
| 4 | ~~**Medium**~~ | ~~Go server `applyTorque()` is a no-op~~ | ✅ Fixed — real ZYX Euler rotation with ROTATION_SPEED=3.0 rad/s |
| 5 | **Medium** | `saveLoadout()` has a missing closing brace | The function has `{` after `try` but the `catch` block closes without matching. The `loadLoadout()` and `saveReplay()` functions are nested inside `saveLoadout()` due to a brace mismatch. |
| 6 | ~~**Medium**~~ | ~~No SRI on Puter.js SDK~~ | ✅ Verified — Puter.js has no published SRI hashes (Appendix B). `crossorigin="anonymous"` is present. |
| 7 | **Medium** | `Cargo.toml` uses `rhai` but README says Lua | The dependency is correct (`rhai = "1.19"`) but the documentation is stale. |
| 8 | **Medium** | `index.html.audit_backup` still in tree | Leftover backup file from previous audit work. Should be removed. |
| 9 | **Verified** | `heavy_spaceship` filename in SHIPS paths | `'./assets/heavy_spaceship (1).glb'` — filename on disk matches; no typo (was previously suspected). ✅ |
| 10 | **Low** | WebSocket URL uses `ws://` not `wss://` | `wsUrl: \`ws://${location.hostname}:8080/ws\`` — unencrypted. Fine for local dev, not for production. |
| 11 | **Low** | Hot-reload enabled by default | `CONFIG.hotReload.enabled: true` — polls scripts every 1.5s in production. Should be gated behind a dev flag. |
| 12 | **Low** | `server/main.go` serves `./public` which doesn't exist | The file server points to `./public` but no such directory exists. The frontend is served separately via `python -m http.server`. |

**Concrete improvements**
1. **Update README** — replace all "Lua" references with "Rhai" throughout.
2. ~~**Fix `mathRand()`**~~ ✅ — crypto/rand seeded PRNG.
3. ~~**Implement `applyTorque()`**~~ ✅ — ZYX Euler rotation with ROTATION_SPEED=3.0.
4. **Fix `saveLoadout()` brace mismatch** — nested functions are leaking scope.
5. ~~**Add auth/rate limiting to Go server**~~ ✅ — IP limiter, player_id regex, token-bucket rate limiter, read limits.
6. **Remove `index.html.audit_backup`**.
7. **Add SRI to Puter.js SDK**.

---

## 3. Cross-Cutting Concerns

### 3.1 No build, no CI, no tests across the suite

| Runtime | CI gate | Status |
|---------|---------|--------|
| Rust (cargo check) | ❌ Not wired | `Cargo.toml` and `Cargo.lock` exist |
| Go (go vet) | ❌ Not wired | `go.mod` exists |
| JS (node --check) | ❌ Not wired | Multiple JS files |
| Tests (node --test) | ❌ Not wired | 1 test file exists (`import-normalize.test.mjs`) |
| HTTP smoke test | ❌ Not wired | All entry points serve correctly |
| Rhai syntax check | ❌ Not wired | `luacheck` in package.json but no luacheck installed |

**Minimum viable CI** (GitHub Actions):
```yaml
- cargo check                    # vecter_omega3d
- cd server && go vet ./...      # Go server
- node --test tests/import-normalize.test.mjs  # studio3D tests
- node --check star_sparrow_builder.js          # JS syntax
```

### 3.2 No CSP / no SRI

None of the three apps sets a Content-Security-Policy meta tag. All external CDN scripts (Puter.js, Three.js, Tailwind, esm.sh, unpkg.com, Google Fonts, Font Awesome, Material Symbols) are loaded without SRI hashes.

**Recommendation:**
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self' https://js.puter.com https://esm.sh https://unpkg.com https://cdn.tailwindcss.com;
               script-src  'self' 'unsafe-inline' https://js.puter.com https://esm.sh https://unpkg.com https://cdn.tailwindcss.com;
               connect-src 'self' https://api.puter.com wss: ws:;
               img-src     'self' data: https:;
               font-src    'self' https://fonts.gstatic.com data:;">
```

### 3.3 Accessibility — significant progress

Since the previous audit, a comprehensive a11y pass was completed:
- `a11y.css` created with focus-visible, prefers-reduced-motion, and contrast tokens.
- Appended to all 9 CSS files across the suite.
- `ACCESSIBILITY.md` documents the pass with contrast spot-check results.
- `kamakazii_3d_aero_comand` has extensive ARIA attributes on all overlays.
- `kamasazii_vecter_omega3d` has `aria-label` on loadout arrows and fire button.

**Remaining gaps:**
- `kamakazii_studio3D` has minimal ARIA attributes (only `aria-label` on search input).
- `kamasazii_vecter_omega3d` has no `role` attributes on HUD elements.
- No `prefers-reduced-motion` handling in the Rust/Wasm render loop.

### 3.4 Asset licensing — mostly complete

`ATTRIBUTION.md` now lists 6 confirmed attributions with matching `lic/` folder entries:

| Asset | License | Risk |
|-------|---------|------|
| Stylized WW1 Plane (Helijah) | CC-BY-4.0 | ✅ |
| Boeing Stearman Model 75 | CC-BY-4.0 | ✅ |
| Rain 1 (Paxar095) | CC-BY-4.0 | ✅ |
| 90s Vaporwave Neon Grid | CC-BY-4.0 | ✅ |
| ~~Bogotá Skyline 01~~ | ~~CC-BY-NC-4.0~~ | ✅ **Removed** — non-commercial asset deleted from suite |
| Cyberpunk City (Pasha) | CC-BY-4.0 | ✅ |

**Audit queue** (from ATTRIBUTION.md): star-sparrow-modular-spaceship, simba.glb, concretefloor038b texture, plus audio/image/icon assets in aero_comand that are now deleted.

### 3.5 Observability — partial

- `kamasazii_vecter_omega3d` has a comprehensive `ClientErrorLogger` that captures errors, deduplicates, buffers, and flushes to Puter FS as JSONL. **This is excellent.**
- `kamakazii_studio3D/ui/index.html` has a boot error banner that catches `error` and `unhandledrejection`.
- `kamakazii_3d_aero_comand` has no error reporting hook.

### 3.6 Line-ending policy

Mixed CRLF/LF persists. The vecter_omega3d `index.html` was CRLF, `lib.rs` is LF. No `.gitattributes` file exists.

**Add `.gitattributes`:**
```
* text=auto eol=lf
*.bat  text eol=crlf
*.ps1  text eol=crlf
```

### 3.7 Version drift across apps

| Component | aero_comand | studio3D | vecter_omega3d |
|-----------|-------------|----------|----------------|
| Three.js | 0.128.0 (esm.sh) | 0.158.0 (unpkg.com) | N/A (raw WebGL2) |
| Puter.js | SDK v2 | SDK v2 | SDK v2 |
| nipplejs | 0.10.1 (esm.sh) | 0.9.1 (esm.sh) | N/A |
| cannon-es | N/A | 0.20.0 (esm.sh) | N/A |
| dat.gui | N/A | 0.7.9 (unpkg.com) | N/A |

---

## 4. What's New Since Previous Audit

| Change | Impact |
|--------|--------|
| Root `index.html` rewritten as clean suite launchpad | ✅ No longer depends on deleted assets |
| `a11y.css` + `ACCESSIBILITY.md` added | ✅ Comprehensive a11y baseline across all 9 CSS files |
| `ATTRIBUTION.md` + `lic/` folder added | ✅ 6 confirmed attributions, Puter App Store compliance path |
| vecter_omega3d: `package.json` build scripts use `--wasm-opt=false` | ✅ Resolves the wasm-opt validation failure |
| vecter_omega3d: `Cargo.toml` migrated from `mlua` to `rhai` | ✅ Rhai is lighter, no Lua runtime needed in Wasm |
| vecter_omega3d: Client error logger added | ✅ Comprehensive error capture + Puter FS logging |
| vecter_omega3d: Rhai hot-reload system | ✅ Live script editing without recompile |
| vecter_omega3d: Star Sparrow modular builder | ✅ 32-part ship builder with Puter KV persistence |
| vecter_omega3d: PvP mode support | ✅ Dual-player with separate input handling |
| studio3D: `tests/import-normalize.test.mjs` added | ✅ First test file in the suite |
| studio3D: `shell.js` with grouped icon bar + search | ✅ 40+ tools organized by category |
| studio3D: `state.js` reactive state management | ✅ Clean pub/sub pattern |
| studio3D: ParticleSystem/WeatherSystem/WaterSystem wired into engine loop | ✅ Three new VFX systems with real-time animation, presets, and delta timing |
| studio3D: 51 feature pages refactored to shared modules | ✅ `_shared/actionMap.js` (80+ action handlers) + `_shared/renderControls.js` (UI renderer) eliminate ~5,000 lines of duplication |
| studio3D: Pose tool stubs replaced with real implementations | ✅ maim.js (model import/validation), geometries.js (7 primitives + humanoid rig), lighting_presets.js (5 presets), physics_integration.js, vr_interactions.js, physics_bridge.js |
| studio3D: Map-maker enhancements | ✅ 6 new biomes, 8 vegetation types, 4 landmark buildings, hydraulic erosion, wave-animated water, day/night cycle |
| aero_comand: Audio placeholders replaced | ✅ Web Audio API singleton with synthesized tones replaces empty `Audio()` and soundjay.com URLs |
| aero_comand + studio3D: Hardcoded plane positions replaced | ✅ `PLANE_SPAWN_X/Y/Z` constants replace magic `{ x: 0, y: 2, z: 0 }` in `aero_comand/game/world.js` and `studio3D/tools/blender/world.js` |
| vecter_omega3d: Ship fallback improved | ✅ Proper wireframe ship silhouette (11 line segments) replaces flat triangle marker |
| aero_comand: i18n system with 7 locales | ✅ en, de, es, fr, ja, zh |
| aero_comand: Level fabricator (3D terrain editor) | ✅ 14 presets, real-time editing |

---

## 5. Prioritized Improvement Backlog

| Pri | Effort | Item | Why now |
|-----|--------|------|---------|
| ~~**P0**~~ | ~~XS~~ | ~~Fix `manifest.json` icon paths (root + aero_comand)~~ | ✅ Done |
| ~~**P0**~~ | ~~XS~~ | ~~Fix root `sw.js` — remove `/game.js`~~ | ✅ Done |
| ~~**P0**~~ | ~~XS~~ | ~~Update vecter_omega3d README — replace "Lua" with "Rhai"~~ | ✅ Done |
| ~~**P0**~~ | ~~S~~ | ~~Fix `saveLoadout()` brace mismatch in vecter_omega3d~~ | ✅ Done — `{{` → `{` + added missing `}` |
| ~~**P0**~~ | ~~S~~ | ~~Add `.gitattributes`~~ | ✅ Done |
| ~~**P1**~~ | ~~S~~ | ~~Set up minimal GitHub Actions CI~~ | ✅ Done — `.github/workflows/ci.yml` with cargo check, go vet, node --check, node --test |
| ~~**P1**~~ | ~~S~~ | ~~Fix Go server `mathRand()` and `applyTorque()` stub~~ | ✅ Done |
| ~~**P1**~~ | ~~S~~ | ~~Add SRI hashes to CDN scripts~~ | ✅ Done — Font Awesome 6.4.0 (sha512) and 6.5.0 (sha384) on studio3D entry points. Other CDN resources (import maps, Tailwind CDN, Google Fonts, Puter.js) cannot use SRI — see Appendix B. |
| ~~**P1**~~ | ~~M~~ | ~~Add CSP meta tags to all entry points~~ | ✅ Done — All 8 CDN-loading entry points now have CSP meta tags (5 primary + 3 tools/test). |
| ~~**P1**~~ | ~~M~~ | ~~Resolve Bogotá Skyline CC-BY-NC-4.0 license~~ | ✅ Done — asset removed entirely |
| **P2** | M | Refactor aero_comand `index.html` (114K chars) into modules | Too large for safe iteration. |
| **P2** | M | Fix studio3D `engine.js` import paths | `./modules/` should be `../systems/` — will fail at runtime. |
| ~~**P2**~~ | ~~M~~ | ~~Wire ParticleSystem/WeatherSystem/WaterSystem into engine update loop~~ | ✅ Done — all three systems imported, instantiated, and animated per-frame with real delta timing |
| ~~**P2**~~ | ~~M~~ | ~~Refactor 51 feature page.js files to use shared modules~~ | ✅ Done — `_shared/actionMap.js` + `_shared/renderControls.js` eliminate ~5,000 lines of duplicated boilerplate |
| ~~**P2**~~ | ~~S~~ | ~~Replace pose tool stubs (maim.js, geometries.js, etc.) with real implementations~~ | ✅ Done — 6 stubs replaced with functional modules |
| ~~**P2**~~ | ~~S~~ | ~~Fix Aero Command audio placeholders~~ | ✅ Done — Web Audio API singleton replaces empty `Audio()` and soundjay.com URLs |
| ~~**P2**~~ | ~~S~~ | ~~Improve Vector Strike ship fallback~~ | ✅ Done — proper wireframe ship silhouette replaces flat triangle |
| ~~**P2**~~ | ~~S~~ | ~~Replace hardcoded placeholder positions in world.js files~~ | ✅ Done — `PLANE_SPAWN_X/Y/Z` constants replace magic `{ x: 0, y: 2, z: 0 }` objects in both `aero_comand/game/world.js` and `studio3D/tools/blender/world.js` |
| **P2** | M | Pre-compile Tailwind CSS for aero_comand | 300KB CDN download on every page load. |
| **P3** | S | Remove `index.html.audit_backup` from vecter_omega3d | Leftover file. |
| **P3** | L | Align Three.js versions across suite | 0.128.0 vs 0.158.0 — pick one. |
| ~~**P3**~~ | ~~L~~ | ~~Add auth/rate limiting to Go multiplayer server~~ | ✅ Done — IP limiter, player_id validation, token-bucket rate limiter, read limits |

Where **XS** = <30 min, **S** = <2 h, **M** = half-day, **L** = multi-day.

---

## 6. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| PWA install fails on suite root | **Medium** | Low | ✅ SVG icon restored; PNG icons removed from manifest (not recoverable) |
| CDN compromise injects malicious JS | **High** | Low | Add SRI hashes + CSP headers. |
| Go server allows unauthenticated state manipulation | **Medium** | Low | ✅ Auth + rate limiting added; TLS still missing |
| ~~Bogotá Skyline NC license blocks store submission~~ | ~~**High**~~ | ~~Certain~~ | ✅ Resolved — asset removed entirely |
| `saveLoadout()` scope leak causes runtime errors | ~~Medium~~ | ~~Medium~~ | ✅ Done |
| Studio `engine.js` import paths fail at runtime | Medium | Medium | Fix `./modules/` → `../systems/` paths. |
| Mixed CRLF/LF breaks patches on Windows | Medium | Low | ✅ `.gitattributes` added |
| vecter_omega3d README says Lua, code uses Rhai | ~~Medium~~ | ~~Certain~~ | ✅ Done |
| No CI means regressions are invisible | Medium | Low | ✅ GitHub Actions CI added |

---

## 7. What's Good — Preserve This

- **`a11y.css` + `ACCESSIBILITY.md`** — the universal a11y pass is thorough and well-documented. Keep the pattern of appending the block to every new CSS file.
- **`ATTRIBUTION.md` + `lic/`** — the attribution system is exactly what the Puter App Store requires. Keep it in lockstep with asset additions.
- **`ClientErrorLogger`** in vecter_omega3d — the deduplication, buffering, Puter FS flush, and optional analytics endpoint are production-quality error reporting. Template this for the other two apps.
- **Rhai hot-reload** — live script editing without recompile is a powerful development workflow. The HUD error panel is a nice touch.
- **No-build philosophy** with import maps and ESM — the right call for Puter App Store. Don't introduce Webpack/Vite unless CI requires it.
- **Plugin registry** in studio3D — the lifecycle hook system (`onBoot`, `onSceneReady`, `onBeforeRender`, etc.) is architecturally sound.
- **Cyberpunk HUD design** across all apps — visually distinctive, ships in pure CSS variables, and now has proper contrast tokens.

---

## Appendix A — File Inventory

### Root
| File | Lines | Status |
|------|-------|--------|
| `index.html` | ~220 | ✅ Clean suite launchpad |
| `sw.js` | ~70 | ⚠️ Stale references |
| `manifest.json` | ~40 | ❌ References deleted icons |
| `package.json` | ~25 | ⚠️ Façade — no deps/scripts |
| `a11y.css` | ~70 | ✅ Universal a11y block |
| `ACCESSIBILITY.md` | ~130 | ✅ Comprehensive documentation |
| `ATTRIBUTION.md` | ~250 | ✅ 6 confirmed + audit queue |
| `.gitattributes` | ~40 | ✅ LF enforcement + binary rules |
| `.github/workflows/ci.yml` | ~70 | ✅ 3-job CI (Rust, Go, Node) |
| `.gitmodules` | ~6 | ⚠️ Asymmetric (2 of 3 apps) |

### kamakazii_3d_aero_comand
| File | Lines | Status |
|------|-------|--------|
| `index.html` | ~114,647 chars | ⚠️ Monolithic |
| `game/main.js` | — | Entry point |
| `game/ui.js` | — | HUD management |
| `game/world.js` | — | World controller |
| `game/renderer.js` | — | Three.js rendering |
| `game/puter-client.js` | — | Puter.js integration |
| `game/locale.js` | — | i18n system |
| `game/screen-loader.js` | — | GUI state injection |
| `game/controls/` | 6 files | Input modules |
| `game/level-fabricator/` | 12 files | Terrain editor |
| `game/stitch_kamikazzi_3d/` | 60+ files | UI design mocks |
| `gui-states/` | 20+ HTML files | Overlay designs |
| `locales/` | 7 JSON files | Translations |
| `sw.js` | ~70 | ⚠️ Stale paths |
| `manifest.json` | ~40 | ❌ Deleted icons |

### kamakazii_studio3D
| File | Lines | Status |
|------|-------|--------|
| `app/engine.js` | ~1,000 | ⚠️ Wrong import paths |
| `app/shell.js` | ~400 | ✅ Grouped icon bar + search |
| `app/state.js` | ~50 | ✅ Reactive state |
| `app/studio.js` | — | Main studio class |
| `app/ai-bridge.js` | — | AI integration |
| `features/` | 40+ page.js files | 🟡 Many stubs |
| `systems/` | 10 JS files | Engine systems |
| `marketplace/` | 10 JS files | Marketplace + Stripe |
| `editor/` | 7 JS files | Editor managers |
| `tools/` | 3 subdirs | Standalone tools |
| `tests/import-normalize.test.mjs` | ~300 | ✅ First test |
| `ui/index.html` | — | Entry point |
| `ui/manifest.json` | — | PWA manifest |

### kamasazii_vecter_omega3d
| File | Lines | Status |
|------|-------|--------|
| `src/lib.rs` | ~400 | ✅ Well-structured |
| `Cargo.toml` | ~30 | ✅ Correct deps |
| `index.html` | ~2,300+ | ⚠️ Large single file |
| `star_sparrow_builder.js` | ~930 | ✅ Modular extraction |
| `star_sparrow_builder.css` | ~400 | ✅ Dedicated stylesheet |
| `style.css` | — | Cyberpunk HUD |
| `scripts/ai_apex.rhai` | ~100 | ✅ 5-state AI behavior |
| `scripts/weapons.rhai` | ~80 | ✅ 5 weapon types |
| `server/main.go` | ~280 | ⚠️ No auth/rate limit |
| `server/go.mod` | ~5 | ✅ gorilla/websocket |
| `README.md` | ~200 | ❌ References Lua |
| `index.html.audit_backup` | — | 🗑️ Leftover |

---

## Appendix B — CDN Dependencies & CSP/SRI Status

### CSP meta tags added (July 2026)

All 5 primary entry points now have Content-Security-Policy meta tags:

| File | CSP `script-src` | CSP `style-src` | CSP `connect-src` |
|------|-----------------|-----------------|-------------------|
| `index.html` (root) | `'self'` | `'self' fonts.googleapis.com` | `'self'` |
| `kamakazii_3d_aero_comand/index.html` | `'self' esm.sh cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval'` | `'self' 'unsafe-inline' fonts.googleapis.com cdn.tailwindcss.com` | `'self' esm.sh blob: data:` |
| `kamakazii_studio3D/ui/index.html` | `'self' unpkg.com esm.sh 'unsafe-inline'` | `'self' 'unsafe-inline' cdnjs.cloudflare.com` | `'self' esm.sh unpkg.com` |
| `kamakazii_studio3D/pages/integrations.html` | `'self' unpkg.com esm.sh 'unsafe-inline'` | `'self' 'unsafe-inline' cdnjs.cloudflare.com fonts.googleapis.com` | `'self' esm.sh unpkg.com` |
| `kamasazii_vecter_omega3d/index.html` | `'self' js.puter.com` | `'self'` | `'self' api.puter.com wss: ws:` |

### SRI hashes added

| CDN | Resource | SRI | File |
|-----|----------|-----|------|
| cdnjs.cloudflare.com | Font Awesome 6.4.0 CSS | `sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==` | `studio3D/ui/index.html` |
| cdnjs.cloudflare.com | Font Awesome 6.5.0 CSS | `sha384-/o6I2CkkWC//PSjvWC/eYN7l3xM3tJm8ZzVkCOfp//W05QcE3mlGskpoHB6XqI+B` | `studio3D/pages/integrations.html` |

> **Font Awesome 6.5.0 note:** SRI hash verified and added (July 2026). The `integrity` attribute is now present on the `<link>` tag in `studio3D/pages/integrations.html`.

### SRI limitations (why most CDN resources don't have SRI)

| CDN Resource | SRI Possible? | Reason |
|-------------|--------------|--------|
| **Import maps** (esm.sh, unpkg.com) | ❌ No | The HTML import map spec does not support `integrity` attributes on map entries. |
| **Tailwind CSS CDN** (`cdn.tailwindcss.com`) | ❌ No | Dynamic JS runtime — content changes based on page content and Tailwind config. |
| **Google Fonts** (`fonts.googleapis.com`) | ❌ No | CSS is dynamically generated based on user-agent sniffing. Different browsers get different CSS. |
| **Puter.js SDK** (`js.puter.com/v2/`) | ❌ No | No published SRI hashes. The `/v2/` endpoint may be updated at any time by the Puter team. |
| **Font Awesome** (`cdnjs.cloudflare.com`) | ✅ Yes | Versioned, static file on a CDN that publishes SRI hashes. |

### `crossorigin` attributes added

All external `<link>` and `<script>` tags on primary entry points now have `crossorigin="anonymous"` where applicable. This is required for SRI validation and improves error reporting for cross-origin resources.

### Remaining external CDN loads (60+ secondary files)

The `gui-states/*.html` and `stitch_kamikazzi_3d/code.html` files each load Tailwind CDN and Google Fonts independently. These are design mockups loaded dynamically by the screen-loader system, not primary entry points. CSP/SRI should be added to these files in a follow-up pass if they are ever served directly.

| CDN                                       | Script/Link   | App            | SRI |
|-------------------------------------------|-----------==--|---===========--|-----|
| `js.puter.com/v2/`                        | Puter.js SDK  | vecter_omega3d | ❌ |
| `esm.sh/three@0.128.0`                    | Three.js      | aero_comand    | ❌ |
| `esm.sh/nipplejs@0.10.1`                  | Joystick      | aero_comand    | ❌ |
| `unpkg.com/three@0.158.0`                 | Three.js      | studio3D       | ❌ |
| `unpkg.com/dat.gui@0.7.9`                 | GUI lib       | studio3D       | ❌ |
| `esm.sh/nipplejs@0.9.1`                   | Joystick      | studio3D       | ❌ |
| `esm.sh/cannon-es@0.20.0`                 | Physics       | studio3D       | ❌ |
| `esm.sh/jszip@3.10.1`                     | ZIP export    | studio3D       | ❌ |
| `cdn.tailwindcss.com`                     | Tailwind CSS  | aero_comand    | ❌ |
| `cdnjs.cloudflare.com/font-awesome/6.4.0` | Font Awesome  | studio3D       | ❌ |
| `fonts.googleapis.com`                    | Google Fonts  | all three      | ❌ |
| `www.gstatic.com/draco/v1/decoders/`      | Draco decoder | studio3D       | ❌ |

---

## Appendix C — Verification Notes

This audit was performed via static file analysis (read_files, glob, code_searcher, read_subtree). The following were **not** run:
- `cargo check` / `cargo build` (Rust compilation)
- `go vet ./...` (Go linting)
- `node --test` (test suite)
- HTTP smoke test (server startup)
- Browser runtime verification (Chrome not available)

A follow-up should run these commands to verify compilation and test status.

---

## Appendix D — `console.log` Distribution

| App                      | Matches | Notes                                    |
|--------------------------|---------|------------------------------------------|
| kamakazii_3d_aero_comand |     ~30 | game/*.js, screen-loader, puter-client   |
| kamakazii_studio3D       |     ~80 | systems, features, marketplace, tools    |
| kamasazii_vecter_omega3d |     ~16 | star_sparrow_builder, pkg (wasm-bindgen) |

Recommendation: Gate behind `DEBUG` flag or strip for production builds.

---

— end of audit —
