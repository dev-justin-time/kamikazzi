# Kamikazzi 3D — Code Critique

A candid, prioritized review of the codebase as it stands. Findings are grouped by severity; every item references the file(s) involved so they can be triaged directly.

> Methodology: read every JS file under the project root plus `index.html`, traced execution end-to-end, and looked for correctness, resource, security, performance, and hygiene issues.

---

## TL;DR

The project is a small but **coherent** Three.js endless flyer with three notable strengths: (1) the rendering pipeline is sensibly divided into modules, (2) shared geometries/materials in `game/world/plane/factory.js` are reused rather than reallocated, and (3) UI/wiring is isolated from the loop. The five highest priorities are:

1. The `loadTexture` interface lacks deduplication of an in-flight promise so a slow first load can be re-fired by a second caller.
2. The input layer still mixes absolute and additive writes to `state.target`, allowing the absolute source to silently overwrite a keyboard press.
3. `game/input.js` self-schedules `applyKeyInputs` via RAF with no guard, leaving orphan RAF callbacks after many retries.
4. `game/world.js` reads `window.__skyBackgroundTexture` only via `scene.background?.isTexture`, so any consumer wanting the texture object must look elsewhere.
5. The `puter-client.js` service name is `kamikazzi-radio` but it doesn't validate the AI output, so `applyGameChanges` happily accepts nonsense numbers.

---

## 🔴 Severity 1 — Correctness / UX

### 1.1 Cloud color and asset paths consistency
- Cloud material is shared (`TUNING.CLOUD_COLOR = 0xffffff`) — white. ✅
- Photographic background lives at `/China City (1).jpeg` via SKY_BACKGROUND_URL — copy of the file is also at the project root for serving. ✅
- TODO: simplify the duplicate — pick one canonical location.

### 1.2 The `/game.js` boot chain is correct
`index.html` imports `/game.js`, which wires renderer → world → input → ui. ✅

### 1.3 Stale duplicate world sources at the root
`game (1).js` and `game (2).js` have been deleted. ✅

### 1.4 Powerups drift + reap
`/game/world/powerups.js` now has a real `update(speed, dt, planeZ)` that drifts toward camera and reaps with `removeAndDispose` at `TUNING.GENERATION_END_Z`. ✅

### 1.5 PlaneController is now actually used
`/game/world/plane/controller.js` is imported in `/game/world.js` and drives steering, banking, propeller spin, and contrails. ✅

### 1.6 Graffiti decals stutter
`/game/world/shared.js` exposes a `loadTexture(url)` cache that key-collapses identical URLs. The first decal on a face kicks off the load; later faces with the same image hit the cached promise. ✅

### 1.7 Input modes conflict silently
`/game/input.js` still mixes additive keyboard writes and absolute pointer/joystick/gyro writes. ⏳ Partial: now there's a single RAF for `applyKeyInputs`, but the absolute writer still wins when both fire.

### 1.8 Camera follow
`camera.lookAt(plane.position.x * 0.5, plane.position.y, plane.position.z - 20)` — acceptable on a steady frame but creates a momentary snap at `resetGame`. Consider lerping the `lookAt` center as well.

### 1.9 Stale RAF after retries (input.js)
`applyKeyInputs` requests a new RAF every frame, with **no cancellation** on retries. After N "Try Again" clicks you've got N competing RAFs. Fix: gate by `state.running === false → return;` AND keep a single shared RAF.

### 1.10 Engine sound policy (world.js)
`audio.play()` is wrapped in try/catch — fails silently when autoplay is blocked. ✅ already wrapped; called from `resetGame()` so the user gesture context is preserved.

---

## 🟠 Severity 2 — Memory / Resource leaks

### 2.1 Building disposal (FIXED)
`removeAndDispose(building)` traverses the tree but **skips** anything in `SHARED_DISPOSABLES` (the `WeakSet` in `shared.js`). The outer `BoxGeometry`/`MeshLambertMaterial` are unique and now release. Decal children are unique and release. Window children ride the shared cache. ✅

### 2.2 Explosion particle leak (FIXED)
Explosion particles share `EXPLOSION_PARTICLE_GEOMETRY` + per-color shared materials. They are removed from the group at shrink threshold, but the shared geometry/material are NOT disposed (which is correct — siblings reuse them). ✅

### 2.3 Graffiti textures aren't disposed
`loadTexture` cache holds textures for the lifetime of the page. With the cache that means dozens of unused decal `MeshBasicMaterial`s can hang around. Acceptable for a small static site; flag for a release build.

### 2.4 No `dispose()` on world teardown (FIXED)
`world.dispose()` calls `stopLoop`, `stopEngineSound`, manager disposes, and finally `disposeScene(scene)` which safely skips shared resources. ✅

### 2.5 Stale RAF on retry (FIXED)
`startLoop` now calls `stopLoop()` first, cancelling the previous RAF. ✅

### 2.6 Shadow camera frustum size
Shadow frustum is now bounded by `TUNING.BOUND_X * 4` on left/right with `SHADOW_FRUSTUM_HALF = 120` on top/bottom. Re-check against actual building lateral spread at runtime if buildings grow further out.

---

## 🟡 Severity 3 — Security / Hardening

### 3.1 `window.applyGameChanges` is exposed
Still global. Limit to puter/tunnel callers and validate every field with a schema check before applying.

### 3.2 AI output JSON parser
A regex fallback (`aiOutput.match(/\{[\s\S]*\}$/)`) catches malformed JSON but blindly trusts the *last* `{...}` substring. Whitelist keys, clamp tightly, never accept untrusted values without bounds.

### 3.3 `DeviceOrientation` permission
Permission is requested then ignored on failure (browser doesn't offer `denied` events). The handler is bound only if `enabled === true`. ✅

---

## 🟡 Severity 4 — Performance / Polish

### 4.1 Texture anisotropy clamp
`loadTexture()` sets `tex.anisotropy = opts.anisotropy ?? 4`. Reasonable for three.js 0.128.

### 4.2 Loop uses `TUNING.DT_HZ` consistently
`shared.js` exposes `DT_HZ = 60` and `MAX_DT_RAW = 0.1`. ✅

### 4.3 Multiplayer presence updates
`initMultiplayer` calls `updatePresence` once at init; loop pushes every `TUNING.PRESENCE_INTERVAL_S` seconds. ✅

### 4.4 Buildings `updateForSpeed` mutability
Walks `length-1 → 0`, mutates `passed`, splices on reap, calls per-building callback that may `endGame()` (sync, doesn't mutate the buildings array). Document this contract in a comment.

### 4.5 Keyboard-repeat protection
Holding the left-arrow clamps `target.x`; release doesn't drag. ✅

### 4.6 Bursts of synchronous texture decodes
Graffiti decals are loaded asynchronously but decode can stall first paint. Consider deferring decal load to after the first frame.

---

## 🟢 Severity 5 — Code hygiene

### 5.1 Tombstone comments
Largely removed during refactor; current `world.js` has section headers but no `// removed function ...` lines.

### 5.2 `// FIX:` comments
A few remain (e.g. `game.js`: "FIX: Removed 'async' ..."). Migrate to a CHANGELOG once stable.

### 5.3 Shipped top-level `script.js` (was)
Deleted.

### 5.4 Unreferenced utilities (were)
`hyperframes.js`, `ringtone.js` — deleted.

### 5.5 Magic numbers
Replaced with `TUNING.*` in `shared.js`. Remaining magic:
- PlaneController `moveSpeed=28`, `verticalSpeed=14`, smoothing factors — internal to controller, OK.
- `state.spawnInterval=6` floor in `world.js#applyGameChanges` — small, but should move to `TUNING.MIN_AI_SPAWN_INTERVAL`.
- `state.baseSpeed=Math.max(0.1, ...)` floor — move to `TUNING.MIN_BASE_SPEED`.

### 5.6 Module exports
`world/powerups.js` no longer exposes its internal `powerups` array via the API. ✅

### 5.7 Silent `try/catch`
Some still swallow errors silently: `audio.play()`, `presence cleanup`, `applyGameChanges` persistence. At minimum `console.warn` so they're discoverable.

### 5.8 Mixed module sources (esm.sh)
Still CDN-served. Consider vendoring `three@0.128.0` or upgrading to a current version.

### 5.9 Three.js 0.128.0 is old
`renderer.outputEncoding = THREE.sRGBEncoding`. Modern APIs:
- `outputColorSpace = THREE.SRGBColorSpace`
- `MeshBasicMaterial` defaults changed
- `MeshLambertMaterial` still fine.

### 5.10 Spaces in filenames
`China City (1).jpeg`, `Tokyo - Japan.jpeg`, `stylized_ww1_plane (1).glb` are URL-encoded in the constants. Easier to commit an alias next to them OR keep a curl-rerun-on-the-project script that produces slugs.

### 5.11 `applyPalette` was reading `window.__skyBackgroundTexture`
Now takes a `skyTexture` argument passed by world.js. ✅

---

## 🟢 Severity 6 — Accessibility & UX

- On-screen joystick has no `:focus-visible` state for keyboard users.
- No pause affordance.
- Crash image is ~48% of viewport width on tall phones.
- 🍔 is decorative — no `prefers-reduced-motion` opt-out.
- HUD `score` ignores iOS notch safe area (`top: 16px`).
- No dark-mode for the UI overlay (only scene gets night theme).

---

## 🟢 Severity 7 — Licensing / provenance

- `crashImg.src = '/Clipboard0E2.webp'` and `graffitiAssets = ['/KKKKKKK.webp', '/Clipboard0EDD2.webp']`. Confirm provenance and licensing, or remove.

---

## 📋 Suggested fix roadmap (in order of "fix-it-now")

1. ✅ Recreate `/game.js` (DONE in refactor).
2. ✅ White clouds (DONE — `TUNING.CLOUD_COLOR`).
3. ✅ Reap powerups (DONE — `powSups.update(speed, dt, planeZ)`).
4. ✅ Stop RAF on retry (DONE — `startLoop` calls `stopLoop`).
5. ✅ Disposal helper (DONE — `removeAndDispose` + `SHARED_DISPOSABLES`).
6. ✅ Texture cache (DONE — `loadTexture` cache).
7. ⏳ Schema validate `applyGameChanges`.
8. ⏳ Cancel prior keyboard RAF on retry.
9. ⏳ Audit `*.webp` files for license, remove clipboard cruft.
10. ⏳ Pruning: orphan files (DONE), dead `PlaneController` (now actively used).
11. Long-term: package.json + modern Three + remove esm.sh CDN.

---

## Appendix — files inspected

`index.html`, `game.js`, `puter-client.js`, `README.md`,
`game/renderer.js`, `game/input.js`, `game/ui.js`, `game/world.js`,
`game/world/shared.js`, `game/world/plane/factory.js`, `game/world/plane/controller.js`,
`game/world/buildings.js`, `game/world/explosion.js`,
`game/world/powerups.js`, `game/world/ideas.js`.
