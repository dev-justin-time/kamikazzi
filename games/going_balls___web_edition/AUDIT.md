# Comprehensive Audit — Going Balls: Web Edition

**Audited:** July 11, 2026  
**Scope:** Bugs, 3D rendering, security, UX, technical debt, improvement opportunities  
**Files reviewed:** `main.js`, `index.html`, `css/style.css`, `js/audio.js`, `js/ball-skins.js`, `js/level-gen.js`, `js/studio.js`, `js/track-builder.js`, `js/ui.js`, `js/wolf-model.js`

---

## 🔴 Critical Bugs

### 1. Wolf Model Disappears After Death
- **File:** `main.js` line 997, `js/wolf-model.js` lines 30 & 150
- `resetWolfModel()` removes `_wolfModel` from `ballMesh` and nullifies all references. But `initWolfModel()` is only called once in `initPhysics()` (constructor).
- On death, `reset()` calls `resetWolfModel(this)` — Jack is removed permanently. The fallback sphere does NOT reappear because `_fallbackMesh` was already disposed when the model first loaded. The player sees an empty void where Jack should be.
- **Fix:** Either re-call `initWolfModel(this)` in `reset()` or, simpler, don't remove the wolf model on reset (just reset its animation state). The model should persist across respawns.

### 2. `THREE.sRGBEncoding` Deprecated → Silent Error
- **File:** `js/ball-skins.js` line 33
- `innerTex.encoding = THREE.sRGBEncoding;` — `sRGBEncoding` was removed in Three.js r152. In r160, this silently fails (sets an undefined property). The texture won't get proper sRGB encoding, causing glass skins to appear washed out or incorrect.
- **Fix:** Change to `innerTex.colorSpace = THREE.SRGBColorSpace;`

### 3. Builder Scene Camera Save/Restore Broken
- **File:** `js/track-builder.js` lines 509–512, 515–516, 611–612
- `enterBuilderScene()` saves `game.cameraYaw` / `game.cameraPitch` but the actual orbit properties are `orbitYaw` / `orbitPitch`. The saved camera state is always `undefined`, so restoring it in `exitBuilderScene()` does nothing.
- **Fix:** Change all references to `orbitYaw` / `orbitPitch`.

---

## 🟠 3D Rendering Issues

### 4. Shadow Camera Never Follows the Player
- **File:** `main.js` lines 251–254
- `sunLight.shadow.camera` has fixed frustum at origin (±100 units). As the player moves down a 500+ unit track, the shadow camera stays behind. Shadows completely disappear after ~100 units of movement.
- **Fix:** In `animate()`, reposition `sunLight.position` and `sunLight.target` to track the ball, and update `sunLight.shadow.camera` frustum accordingly.

### 5. Directional Light Fixed at Origin
- **File:** `main.js` line 249
- `sunLight.position.set(15, 30, 20)` — never updated. Lighting becomes inconsistent as the player moves hundreds of units away.
- **Fix:** Either make the light a child of the scene origin (ambient handles far-away shading) or update its position to follow the ball.

### 6. `MeshPhysicalMaterial.transmission` Requires WebGL2/WebGPU Backend
- **File:** `js/ball-skins.js` lines 48–73
- The glass material uses `transmission: 0.85`. In Three.js r160's default WebGL1 renderer, `transmission` is a no-op (requires `WebGLRenderer` with `physically correct lights` or a WebGPURenderer). The glass balls render as opaque glossy spheres, not transparent.
- **Fix:** Add `renderer.useLegacyLights = false` and ensure `physicallyCorrectLights` is enabled, or fall back to opacity-based transparency for the glass effect.

### 7. Fog Range Too Short for Long Levels
- **File:** `main.js` line 261
- `this.scene.fog = new THREE.Fog(sky.color, 20, 150)` — fog starts at 20 units and fully obscures at 150. Later levels are 500+ units long. The player can't see the track ahead during later segments.
- **Fix:** Scale fog range with level length: `near = Math.abs(currentZ) * 0.1, far = Math.abs(currentZ) * 0.8`.

### 8. Center Line Uses `LineDashedMaterial` — `lineWidth` Not Supported
- **File:** `js/level-gen.js` (center line creation)
- `LineDashedMaterial` defaults to 1px line width on all platforms (WebGL limitation). The center line may be nearly invisible on high-DPI screens.
- **Fix:** Consider using a thin `PlaneGeometry` strip (e.g., 0.1×length) with a dashed alpha texture instead of a Line.

---

## 🔵 Security Issues

### 9. CDN Imports Without Integrity Hashes
- **File:** `index.html` lines 332–341
- Importmap pulls from `esm.sh` and `unpkg.com` with no `integrity` or SRI hashes. If either CDN is compromised, arbitrary JS executes in the player's browser.
- **Risk:** Supply-chain attack; MITM if served over HTTP.
- **Mitigation:** Pin versions with SRI hashes, serve from a self-hosted CDN, or use a lockfile mechanism.

### 10. DRACO Decoder from Unpkg CDN
- **File:** `main.js` line 267
- `dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/')` — the WASM decoder is loaded from a public CDN with no integrity verification.
- **Risk:** If unpkg is compromised, malicious WASM executes during model loading.
- **Mitigation:** Host DRACO files locally or use SRI for the JS decoder.

### 11. localStorage Data Trusted Without Validation
- **File:** `main.js` lines 86–140
- `loadData()` parses localStorage JSON and trusts all values. A malicious browser extension or XSS could inject crafted data (e.g., negative prices, enormous coin values, invalid skin keys) causing UI errors or breaking game logic.
- **Fix:** Validate and sanitize all loaded values against known ranges and enums. Reject (reset to default) any value outside expected bounds.

### 12. No CSP (Content Security Policy)
- **File:** `index.html`
- No `Content-Security-Policy` meta tag or HTTP header. Scripts from CDNs execute with full permissions.
- **Mitigation:** Add a CSP header limiting script-src to trusted CDNs.

---

## 🟡 UX Issues

### 13. Top Menu Auto-Hides After 4 Seconds
- **File:** `main.js` lines 603, 609, 614
- Desktop users expect persistent menus. The 4-second auto-hide forces repeated clicks just to navigate.
- **Suggestion:** On desktop (no-touch), keep the menu visible permanently. Auto-hide only on mobile.

### 14. No "Are You Sure?" on Builder Clear
- **File:** `js/track-builder.js` line 124
- Clicking CLEAR instantly discards all builder segments with no confirmation. Easy to lose work.
- **Suggestion:** Show a brief toast or confirm dialog: "Clear all segments? Click again to confirm."

### 15. Jump Button Clicks Also Toggle Menu
- **File:** `main.js` lines 573–576
- `jumpBtn.addEventListener('mousedown', (e) => this.jump())` — no `e.stopPropagation()`. On desktop, clicking the jump button also triggers the canvas click handler that toggles the top menu. Every jump toggles the menu.
- **Fix:** Add `e.stopPropagation()` in the jump button handler.

### 16. Studio Clones Don't Affect Game World
- **File:** `js/studio.js` `populateStudioScene()`
- The studio clones level objects for editing, but changes to clone materials/transforms have no effect on the actual game scene. This is a dead-end feature — users can edit objects but the changes are lost when the studio closes.
- **Fix:** Either sync changes back to the game scene on studio close, or clearly label the studio as a "preview/inspection only" view.

### 17. No Loading Indicator for Non-Wolf Assets
- **File:** `js/wolf-model.js`
- The loading screen only tracks wolf model progress. Ball textures, sky textures, GIFs, and MP3 sound effects load silently in the background with no progress indication. On slow connections, the game appears loaded but textures are missing.
- **Suggestion:** Track all asset loads with a `LoadingManager` and update the progress bar accordingly.

---

## 🟢 Technical Debt & Improvement Opportunities

### 18. Physics Step Uses Fixed Timestep
- **File:** `main.js` line 717
- `this.world.step(1/60)` — always advances by 16.67ms regardless of actual frame delta. On high-refresh monitors (120Hz+), physics runs at half speed. On slow devices (~30fps), physics runs at double speed (objects fly through walls).
- **Fix:** Use `performance.now()` delta or Cannon-es's built-in `world.step(dt, timeSinceLastCalled, maxSubSteps)`.

### 19. Dust Particle `material.clone()` Every Frame
- **File:** `main.js` lines 1080–1081
- `const dust = new THREE.Mesh(this._dustGeo, this._dustMat.clone())` — clones material for every particle (potentially 30+ per frame at high speeds). `clone()` is expensive and creates GC pressure.
- **Fix:** Use a shared material and adjust opacity via `material.uniforms` or use `InstancedMesh` for particles.

### 20. `ballConfigs` / `skyConfigs` Defined Inline in `loadData()`
- **File:** `main.js` lines 151–186
- Both config objects (~60 lines each) are defined in `loadData()` which runs in the constructor. Since these are static data, they're recreated on every page load. Move to module-level constants or a separate config file.

### 21. Wood Texture Has Redundant Error Fallback
- **File:** `main.js` lines 278–297
- `this.woodTexture` has an error callback that creates an empty `new THREE.Texture()` fallback. This empty texture will render black on all platform meshes. Also has a post-load guard that checks `wrapS === undefined` which always fails since the `onLoad` callback already sets `wrapS`.

### 22. Coin Collision Uses Distance Check, Not Physics
- **File:** `main.js` line 866
- `this.ballMesh.position.distanceTo(coin.position) < 1.2` — pure distance check. Coins are static, but if a coin is inside a platform mesh, the player can collect it through walls.
- **Suggestion:** Use a raycast or proper trigger volume for coin collection, or ensure coins are always placed above platform surfaces.

### 23. No WebGL Context Loss Handling
- **File:** `main.js`
- No `webglcontextlost` / `webglcontextrestored` event listeners. If the GPU driver crashes or the browser suspends the tab, the renderer breaks silently.
- **Fix:** Add context loss/restore handlers to pause the game and reinitialize textures/shaders.

### 24. `checkGameState()` Mutates DOM Directly
- **File:** `main.js` lines 887–893
- `document.getElementById('coin-display').innerText` and `document.getElementById('distance-display').innerText` — called every frame (60×/sec) even when values haven't changed. DOM writes are expensive.
- **Fix:** Cache previous values and only update DOM when they change.

### 25. No Mobile Pinch-to-Zoom Prevention on Canvas
- **File:** `index.html`
- `<meta name="viewport" ... user-scalable=no>` prevents page zoom, but pinch gestures on the canvas still trigger browser zoom on some mobile browsers.
- **Fix:** Add `touch-action: none` to the canvas element (already on `<body>` but canvas may override).

### 26. `reset()` Doesn't Reset `_celebrationTimeout`
- **File:** `main.js` lines 989–1010
- If the player spams clicks during the celebration screen, multiple `_celebrationTimeout` instances can stack. The skip handler uses `{ once: true }` which helps, but a direct `reset()` call (e.g., from `_dismissCelebration`) could race with the timeout.
- **Fix:** Clear `_celebrationTimeout` at the start of `reset()`.

### 27. `playSound()` Creates New Audio Element Per Sound
- **File:** `js/audio.js` line 51
- `const audio = new Audio(...)` — creates a new HTMLAudioElement for every footstep, coin collect, and jump. Footsteps fire at ~5–8 Hz. This creates dozens of short-lived DOM elements per second, causing GC thrash.
- **Fix:** Use the Web Audio API for all sound effects (footsteps already use it). Pool AudioBufferSourceNodes or use `HTMLAudioElement.cloneNode()`.

### 28. Builder Save Uses Separate localStorage Key
- **File:** `js/track-builder.js` line 131
- `localStorage.getItem('goingBalls_customTracks_v1')` — separate from game data. Two storage keys to manage. Accretion of versioned keys over time.
- **Fix:** Consolidate into a single `goingBallsData_v2` object that includes tracks.

### 29. No Error Boundary for `animate()` Loop
- **File:** `main.js` lines 1034+
- An uncaught exception in `animate()` kills the render loop entirely (no more frames). The game freezes with no indication.
- **Fix:** Wrap `animate()` body in a `try/catch` that logs the error and continues the loop.

---

## 📊 Severity Summary

| # | Finding | Category | Severity |
|---|---|---|---|
| 1 | Wolf disappears after death | Bug | 🔴 Critical |
| 2 | `sRGBEncoding` deprecated | Bug | 🔴 Critical |
| 3 | Builder camera save/restore broken | Bug | 🟠 High |
| 4 | Shadow camera never follows player | Rendering | 🟠 High |
| 5 | Directional light fixed at origin | Rendering | 🟡 Medium |
| 6 | `transmission` no-op without WebGL2 config | Rendering | 🟡 Medium |
| 7 | Fog range too short | Rendering | 🟡 Medium |
| 8 | Center line invisible on HiDPI | Rendering | 🔵 Low |
| 9 | CDN imports no integrity hash | Security | 🟠 High |
| 10 | DRACO decoder from unpkg | Security | 🟠 High |
| 11 | localStorage trusted without validation | Security | 🟡 Medium |
| 12 | No CSP | Security | 🔵 Low |
| 13 | Menu auto-hides on desktop | UX | 🟡 Medium |
| 14 | No confirm on builder clear | UX | 🔵 Low |
| 15 | Jump button toggles menu | UX | 🟡 Medium |
| 16 | Studio clones don't affect game | UX | 🔵 Low |
| 17 | No loading for non-wolf assets | UX | 🔵 Low |
| 18 | Fixed timestep physics | Tech Debt | 🟠 High |
| 19 | Dust material.clone() every frame | Tech Debt | 🟡 Medium |
| 20 | ballConfigs inline in loadData | Tech Debt | 🔵 Low |
| 21 | Wood texture error fallback broken | Tech Debt | 🔵 Low |
| 22 | Coin collision is distance-based | Tech Debt | 🔵 Low |
| 23 | No WebGL context loss handling | Tech Debt | 🟡 Medium |
| 24 | DOM writes every frame | Tech Debt | 🔵 Low |
| 25 | Pinch-to-zoom on canvas | Tech Debt | 🔵 Low |
| 26 | Race condition in celebration dismiss | Tech Debt | 🔵 Low |
| 27 | New Audio() per sound effect | Tech Debt | 🟡 Medium |
| 28 | Multiple localStorage keys | Tech Debt | 🔵 Low |
| 29 | No error boundary in animate() | Tech Debt | 🟡 Medium |

**Summary:** 2 critical bugs, 5 high-severity issues, 11 medium, 11 low.

---

## 🔧 Priority Fixes (P0 → P3)

| Priority | Items | Effort |
|---|---|---|
| **P0** | #1 Wolf disappears after death, #2 sRGBEncoding | Small |
| **P1** | #4 Shadow camera tracking, #18 Fixed timestep, #9 CDN integrity | Medium |
| **P2** | #3 Builder camera, #15 Jump+menu bug, #27 Audio pooling | Small |
| **P3** | #6 Glass material, #7 Fog scaling, #19 Dust GC, #23 Context loss | Medium |
