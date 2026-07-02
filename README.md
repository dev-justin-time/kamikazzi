# Kamikazzi 3D

A lightweight browser-based 3D endless flyer built with Three.js — dodge buildings, collect powerups, generate AI plane skins, save replay screenshots, and compete via cloud leaderboard and real-time multiplayer presence. This repo contains a modular renderer, world logic, UI, input handling, and deep Puter.js integration for cloud sync, AI image generation, replay storage, and live room presence.

## Live
Open `index.html` in a modern browser (Chrome/Edge/Firefox). For best results run from a local static server (e.g. `npx http-server` or `python -m http.server`) to avoid GLB and audio CORS/autoplay issues. The sky/photographic background expects the project root to be the served root, with assets under `/assets/...` and `%20`-encoded filenames where needed.

**Puter hosting:** The game is designed to run inside [Puter](https://puter.com) — a free, open-source internet OS. When hosted on Puter, cloud save, AI image generation, leaderboards, replay storage, and multiplayer presence activate automatically via the Puter.js SDK.

## Controls

UI is the same across platforms: **"Start Flying"** begins a run, **"Try Again"** restarts after crash.

### Steering input (`game/input.js`)
Four input sources feed `world.state.target.{x,y}`, which `world.js#loop()` clamps and bridges to `PlaneController.update`. Each run picks the **first** source the player touches and locks the mode — a small pill in the HUD (`#inputPill`) shows the active mode so the player can see why the plane is sliding.

| Mode | Source | Behavior |
|------|--------|----------|
| `keyboard` (⌨ Keys) | Arrow keys / WASD | Each held key nudges `target` by ±0.9 (x) / ±0.6 (y) per frame. Clamped to bounds. |
| `touch` (👆 Touch) | Pointer / touch drag on canvas | **RELATIVE**: at `pointerdown` capture the finger position + current target as anchor; `pointermove` applies a delta scaled by `(BOUND_X × 2.5, Y_RANGE × 1.5)` so a full-width drag ≈ full bound range. The plane no longer teleports to the touch spot — drag feels like a smartphone flight joystick. |
| `joystick` (🕹 Joystick) | Bottom-left touchscreen knob | Direct knob-to-target: drag-to-edge ⇒ full bound range in X, ~60 % of Y. |
| `gyro` (📱 Tilt) | `DeviceOrientationEvent` | **AUTO-CALIBRATION** (median of first 5 events after each fresh run = neutral pose) + **2° dead-zone** + **exponential smoothing** (`target += (raw − target) × 0.18`) so iOS orientation-event jitter doesn't yank the plane. Engagement threshold 4° of net tilt (otherwise small jitter leaves mode at `'none'` so the player can still pick another input). |

## Puter Integration

When the page runs inside Puter (or any environment where `puter.js` is available), the game unlocks a full suite of cloud-native features. All features are **best-effort** — if Puter is absent or the user is not signed in, the game falls back gracefully to localStorage or disables the feature silently.

### Cloud Save (`puter.kv`)
- **High score** — synced across devices via `puter.kv` with `localStorage` fallback.
- **Run history** — last 50 runs stored with score, grade, level, distance, and duration.
- **Settings** — cloud-persisted game settings merged with local values at boot.

### Leaderboard
A shared KV key (`kamikazzi3d_global_leaderboard`) stores the top-10 scores across all players. Entries include username, avatar, score, and timestamp. Submit happens automatically at the end of notable runs (new personal best, mission success, or score ≥ 3000).

### AI Image Generation — Skin Lab
Click **🎨 Customize** on the start screen to open the **Skin Lab**:
- **Plane Skin** — type a prompt (e.g. `"flaming skull decals"`) and the game calls `puter.ai.txt2img()` to generate a texture. The image is applied to the fuselage and wings (skipping transparent cockpit glass and dark propeller parts). Skins persist in `localStorage` and are re-applied on every load.
- **Pilot Portrait** — generate a circular portrait avatar that appears next to your score in the HUD.
- File responses from Puter are converted to base64 data URLs so they survive page reloads.

### Replay Gallery
Notable runs (personal best, mission success, or score ≥ 3000) are auto-saved as **replays**:
- **Cloud storage** — `puter.fs.write()` saves `screenshot.png` + `replay.json` under `/kamikazzi3d/replays/<id>/`.
- **Telemetry** — each replay captures score, grade, level, distance, altitude, throttle, duration, and outcome.
- **Fallback** — when `puter.fs` is unavailable, replay JSON is stored in `localStorage` (screenshots skipped to stay under the ~5 MB quota).
- Click **📼 Replays** on the start screen to browse, view detail screenshots, and delete old runs.

### Real-Time Multiplayer Presence
Replaces the legacy `WebsimSocket` with a **shared KV room** (`createPuterRoom()`):
- Each client writes its position, score, and state to a shared KV key every 2.5 seconds.
- Peers are visualized as coloured marker meshes drifting alongside your plane.
- Entries expire after 15 seconds of inactivity so stale players auto-vanish.
- No invite codes required — all players in the same room name auto-join.

### AI Game Config Chat
The legacy `generateFromComment()` function sends player text to `puter.ai.chat.completions` (model `gpt-5-mini`) and returns structured JSON to tweak game parameters (`spawnInterval`, `baseSpeed`, `night mode`, `enablePowerups`, etc.).

### Authentication
- `getUser()` / `getUsername()` / `getAvatarUrl()` — display the signed-in Puter user's identity in the HUD.
- `refreshUser()` — re-fetch identity after sign-in events.
- Legacy API-key auth (`window.setPuterApiKey`) is preserved for backward compatibility.

### Mode-lock semantics

- **First-writer wins**: a run starts with `inputSource = 'none'`. Touch / joystick / keyboard CLAIM as soon as the first event fires. Gyro waits — it only writes when `inputSource === 'none'` OR `'gyro'`.
- **Per-run reset**: a `rAF` poll watches `state.running`; on every false→true edge (Start Flying, Try Again) it resets `inputSource = 'none'` AND clears the gyro calibration samples so the user re-calibrates to their current hand pose.
- **iOS 13+ permission**: the gyro module calls `DeviceOrientationEvent.requestPermission()` on first touch if available. If denied the pill shows `🛰 Motion denied`. If the JS API is missing entirely the pill shows `🛰 No Motion` after 800 ms.

### Bounds
All clamps use `TUNING.BOUND_X` (34), `BOUND_Y_MIN` (−4), `BOUND_Y_MAX` (16) so input + steering + world bounds cannot drift apart.

### Powerups (`game/world/powerups.js`)
Pick up **5 distinct types** of glowing items while flying. Spawn cadence is 3 items per run (or 6 if the briefing classifier marks `_ideas_cascade = true`), round-robin across the catalog so every type appears at least once.

| Type | Shape | Colour | Effect | Duration | Source |
|------|-------|--------|--------|----------|--------|
| 🛡 **Shield**   | BoxGeometry cube    | cyan `#66ffff` | Skips building-collision check while active. | 3 s | `TUNING.POWERUP_SHIELD_MS` |
| 🔥 **Boost**    | CylinderGeometry pylon | amber `#fff176` | World speed ×1.5 for the window (boost stacks on every dt-multiplied term: building drift, strip scroll, cloud drift, building spawn cadence). | 4 s | `TUNING.POWERUP_BOOST_MS`, `BOOST_MULT = 1.5` |
| 🧲 **Magnet**   | TorusGeometry ring  | magenta `#ff5dc8` | Pulls any nearby powerup toward the plane's X axis at `POWERUP_MAGNET_PULL = 8 m/s` within `POWERUP_MAGNET_RADIUS = 12 m`. | 5 s | `TUNING.POWERUP_MAGNET_MS` |
| ✦ **2× Score**  | OctahedronGeometry gem | green `#6dff8c` | `state.score += effSpeed * dt * SCORE_GAIN * 2` while active. | 6 s | `TUNING.POWERUP_SCORE2X_MS`, `SCORE2X_MULT = 2` |
| ⏱ **Slow-mo**  | TetrahedronGeometry hourglass | indigo `#9a7dff` | Composes with near-miss bullet-time via `Math.min(timeScaleTarget, 0.4)` — whichever demands the slowest dt wins. | 3 s | `TUNING.POWERUP_SLOWMO_MS`, `SLOWMO_SCALE = 0.4` |
| ⚡ **Stamina**  | IcosahedronGeometry lattice | lime `#dfff66` | **One-shot — no duration, no `_powerups.*UntilMs` field, no HUD chip.** Instantly restores the near-miss bullet-time window: `timeScale = NEAR_MISS_TIME_SCALE` (no lerp-in) + `timeScaleUntilMs = max(now, currentUntil) + POWERUP_STAMINA_MS` — covers both a fresh slow-mo trigger AND extending an active window. Math in `world.js#applyPowerupEffect` branch `type === 'stamina'`. | n/a | `TUNING.POWERUP_STAMINA_MS` (= `NEAR_MISS_DURATION_MS = 1200`) |

Pickup is an AABB-style check inside `powerups.checkPickup(planePos)`: `|dz| ≤ POWERUP_PICKUP_RADIUS = 1.6 m` and `|dy| ≤ per-type-halfHeight + 0.6 m`. The mesh is disposed inside that call so the pickup → disappearance is immediate.

When a pickup lands, `world.js#applyPowerupEffect(type)` pushes the expiry timestamp onto `state._powerups.{shield,boost,magnet,score2x,slowmo}UntilMs` AND fires a `powerupPickup` `CustomEvent` on `window` so the UI chip can react without coupling to gameplay state directly.

**HUD chip**: a `div#activePowerups` is auto-injected under `#hud` by `setupUI()`. Each active window renders as a tweak-styled chip — type-coloured border + glow + the remaining seconds ticking down — that gets created when the window opens and removed when it closes.

**Magnet halo**: while `state._powerups.magnetUntilMs > now` AND the plane is alive, `world.js#loop()` calls `magnetHalo.setActive(true, now)` which makes the magenta-tinted additive billboard (`game/world/magnet_halo.js#createMagnetHalo`) visible. The halo is a `THREE.Sprite` parented to `plane` with a procedurally-generated `CanvasTexture` radial gradient (256×256, 5-stop cyan-to-magenta falloff), `AdditiveBlending`, `depthWrite:false`, `depthTest:false`, and `renderOrder=5` — so it always reads on top of the scene even when buildings are in front of the plane (the case where the player most needs the cue while threading a corridor of pickups). Baseline scale 12 m, with a `±8%` `cos`-driven scale pulse over ~1.4 s so the halo breathes without throbbing. Hidden via `setActive(false)` once the window expires or `state.over` flips true. The Sprite's camera-facing orientation is independent of `plane.quaternion`, so it can't tilt with banking. `dispose()` is wired to `world.dispose()` so the CanvasTexture + SpriteMaterial are freed on world teardown.

**Pickup SFX**: every pickup plays a synthesised, distinct tone via Web Audio API (no audio assets required). Each of the 5 types has a tone recipe in `ui.js#TONE_RECIPES` — `shield` is a rising triangle, `boost` is a sawtooth sweep-up, `magnet` is a square double-pulse, `score2x` is a sine bell, `slowmo` is a triangle descending slide. Tones schedule against `world.audioContext` (the shared AudioContext that engine + impact SFX also use, exposed from `world.js`). The canonical WAV URLs for richer audio live in `shared.js#POWERUP_SFX_URLS`; drop small WAVs at `/assets/audio/powerup-{shield|boost|magnet|score2x|slowmo}.wav` to upgrade any recipe to a real one-shot clip without touching the schedule code. `world.js` preloads canonical WAVs at boot and caches each successful decode in `world.pickupSfxBuffers`, which `playTypeTone` checks before falling back to synth. **Note**: pickup SFX shares the same `AudioContext` gating as engine sound — if the browser blocks autoplay, `ctx.state === 'suspended'` and pickup tones are silently skipped (queued nodes would stack opaquely); the chip pulse stays visible feedback until a real user gesture unlocks the context.

## Files & Structure
- index.html — main page, HUD overlays (start / game over), Google Fonts (Stick No Bills + Noto Sans JP) and kanji sub-title (神風).
- game.js — application bootstrap (creates renderer, world, input, UI).
- game/renderer.js — Three.js renderer and camera setup.
- game/world.js — world composition: scene, lights, ground, clouds, managers and main loop. Owns the `PlaneController` instance + presence loop.
- game/world/plane/factory.js — procedural plane (`buildPlane`) and GLB loader (`loadPlaneFromGLB`) with shared geometries/materials.
- game/world/plane/controller.js — `PlaneController` (frame-independent steering, banking, propeller spin) and twin `ExhaustTrail` contrails.
- game/world/buildings.js — building spawning, windows, and graffiti decals (skip-shared disposal).
- game/world/explosion.js — explosion particle manager (shared geometry/material pool).
- game/world/powerups.js — powerup spawn/drift/reap; finally reaps past camera. **Five types (shield / boost / magnet / score2x / slowmo)** with per-type shape + colour, AABB pickup via `checkPickup(plane)`, and magnet-pull inside `update(...)` while `state._powerups.magnetUntilMs` is in the future.
- game/world/magnet_halo.js — magenta additive Sprite billboard + procedural CanvasTexture radial gradient under the plane, driven by `world.js#loop()` from `state._powerups.magnetUntilMs` so the player sees the magnet window even when the chip strip is offscreen.
- game/world/ideas.js — small "briefings" config applied from local storage. *(Note: `ideas.js` and `powerups.js` at repo root were removed; their functionality lives in `game/world/`.)*
- game/world/shared.js — centralized `TUNING` constants, `loadTexture` cache, `removeAndDispose` helpers, skip-shared dispose registry.
- game/input.js — keyboard, pointer, joystick, and gyroscope steering.
- game/ui.js — HUD wiring, start/retry buttons, score display.
- The crash-overlay image slot in `game/ui.js` and the graffiti decal list in `game/world/shared.js` (`GRAFFITI_ASSETS`) currently point at surrogate assets under `/assets/image/...` because the originals (`/Clipboard0E2.webp`, `/KKKKKKK.webp`, `/Clipboard0EDD2.webp`) are no longer in the repo. Swap them for real assets and the rest of the code already handles them.
- puter-client.js — **Puter integration layer**: cloud sync (KV), user identity, leaderboard, AI chat config, AI image generation (`generateImage`), real-time room presence (`createPuterRoom`), replay save/load via `puter.fs`, and legacy API-key compatibility.
- assets: models (GLB), images (PNG/WebP/JPG), audio (airplane.wav). Files with `(1)` in their name are original browser-downloaded copies; the canonical URLs point at root-level or `assets/image/...`.

## Plane & Propeller

Two plane paths are supported, both rooted in `game/world/plane/factory.js`:

### Procedural WW1 biplane (`buildPlane()`)
A `THREE.Group` named `'plane'` with seven children — fuselage, nose cone, main wing, tail wing, vertical fin, cockpit canopy, and a `propeller` sub-group. All parts share the module-scope `GEO` (geometries) and `SHARED` (materials) so the procedural plane is essentially free after first build.

| Part | Geometry | Material | Local position |
|------|----------|----------|----------------|
| `body` (fuselage) | `CylinderGeometry(0.8, 0.5, 5, 12)` rotated `x = π/2` so it lays along Z (length 5, radius taper 0.8→0.5) | `MeshLambertMaterial` red `#e53935` (`SHARED.body`) | origin |
| `nose` | `ConeGeometry(0.8, 1.4, 12)`, `x = π/2` to align with fuselage | `MeshLambertMaterial` dark accent `#37474f` (`SHARED.accent`) | `z = 3.0` (front) |
| `wing` | `BoxGeometry(7, 0.25, 1.6)` (long thin slab) | `MeshLambertMaterial` yellow `#fdd835` (`SHARED.wing`) | `z = 0.2` |
| `tailWing` | `BoxGeometry(3, 0.2, 1)` | yellow (`SHARED.wing`) | `z = -2.2` (rear) |
| `fin` (vertical stabilizer) | `BoxGeometry(0.2, 1.4, 1.2)` | dark accent (`SHARED.accent`) | `(0, 0.7, -2.2)` |
| `cockpit` (canopy) | `SphereGeometry(0.6, 10, 10)` scaled `(1, 0.8, 1.4)` (squashed half-sphere) | `MeshLambertMaterial` cyan `#80deea`, `transparent: true, opacity: 0.85` (`SHARED.cockpit`) | `(0, 0.5, 0.6)` |
| `propeller` | sub-`Group` named `'propeller'` (see below); NOT a child of `plane` — re-parented to `scene` for viewport lock | — | detached (HUD-locked by `world.js#syncPropellerToViewport`) |

Every part has `castShadow = true`. `receiveShadow` is flipped on for every mesh during world-init (`world.js#createWorld` traverses the plane after attaching it).

### Propeller (`propeller` sub-group)
- **Two blades** from a shared `BoxGeometry(0.1, 2.2, 0.3)` — a tall thin sliver, default orientation.
- Material: dark grey `#222222` (`SHARED.prop`).
- Blade 1 has no rotation; blade 2 has `rotation.z = π/2` so the two blades form a "+".
- The propeller is **not a child of the plane group** anymore — it's added directly to `scene` so it doesn't inherit banking/pitching from the plane. Each frame `world.js#syncPropellerToViewport` re-positions it at the bottom of the viewport (see Viewport lock below). PlaneController stores a reference (passed in via constructor) and spins it the same way.
- Spun around its **Z axis** every frame in `PlaneController.update`:
  ```js
  const spinRate = delta * (25 + Math.abs(velocity.x) * 0.8);
  for (const p of this.propellers) if (p) p.rotation.z += spinRate;
  ```
  Baseline 25 rad/s + 0.8 rad/s per unit of `|velocity.x|` — lateral bank/slide faster ⇒ faster prop spin. `this.propellers` is collected at construction by traversing the plane wrapper for any `Object3D` named `'propeller'` (and adding the HUD-locked ref defensively), so the GLB-sourced sibling spin in **lockstep** with the synth HUD prop instead of appearing frozen while the HUD copy turns.
- Name `'propeller'` is preserved (synthesised or GLB-sourced). `loadPlaneFromGLB` ALWAYS synthesises a HUD propeller via `makePropeller()` and returns it alongside the wrapper, so the GLB model and the HUD prop are siblings in the scene tree (the wrapper keeps its GLB meshes intact, the synth prop is added at world-init to `scene`).

### Plane viewport lock (propeller HUD-locked to viewport bottom)
The propeller is decoupled from the plane so it stays at the bottom-center of the viewport even when the plane climbs toward the world bounds. The math lives in `game/world.js#syncPropellerToViewport`, called once per frame before render:

1. Read `camera.getWorldDirection()` — unit vector `fwd` pointing where the camera looks.
2. Cross `fwd × camera.up` and normalise to get `right`.
3. Rotate `fwd` around `right` by `-camera.fov / 2` (radians) — this pitches the look ray DOWN by half the vertical viewport angle, producing the **bottom-center ray** of the screen.
4. Place the propeller at `camera.position + bottomRay * TUNING.PROPELLER_DISTANCE`.

Three hoisted scratch `Vector3`s (`_camFwd`, `_camRight`, `_bottomRay`) are allocated once at world-init and reused every frame to avoid GC pressure in the RAF loop.

After the position copy the function writes `propeller.quaternion.identity()` (world-upright; **no bleed from camera tilt** because Three.js `PerspectiveCamera` doesn't roll), and `propeller.visible = plane.visible` so the prop hides during the 5.4s crash sequence along with the plane.

**Why `PROPELLER_DISTANCE = 4.0` and not literally `0`:** the prop needs to be in front of the renderer's near plane (`camera near = 0.1` in `game/renderer.js`). `0` would clip → invisible. `4.0` lands it ~11% of the 36m camera→lookAt distance along the bottom ray, well inside the frustum. If you want it coplanar with the camera, set near to `0` in `renderer.js` and drop `PROPELLER_DISTANCE` to `0` in `game/world/shared.js#TUNING`.

### GLB fallback (`loadPlaneFromGLB(url, opts)`)
Loads `/assets/model/stylized_ww1_plane.glb` via `GLTFLoader`. Wraps the loaded scene in a `'plane'` `Group`, walks every mesh to set `castShadow` / `receiveShadow` per `opts`, applies a default `emissiveIntensity = 0.6` on materials that don't already have one (so the GLB doesn't go flat-shaded black under low light), then never adds an extra yaw — the wrapper is yours to rotate. If the GLB fails to load, the procedural `buildPlane` is used as a deterministic fallback so the game still runs offline.

### Plane orientation (yaw = π on every reset)
The plane flies toward **-Z** — the camera looks down -Z, level strips drift in -Z, and the world is essentially a "forward to -Z" tube. To enforce this, `world.js#resetGame` sets `plane.rotation.set(0, Math.PI, 0)` on every game start. The procedural plane's nose is modeled at local **+Z** in `buildPlane` (geometry convention — positive Z is forward for the body cylinder + nose cone); without the `+π` yaw, the zeroed rotation would have the plane visually flying backwards while the on-screen movement heads forward. After the fix:

- `rotation.x` (pitch) and `rotation.z` (bank) start at 0 and are driven each frame by `PlaneController.update`.
- `rotation.y` (yaw) stays at `π` permanently — `PlaneController.update` never touches yaw.

### `PlaneController` (`game/world/plane/controller.js`)
Single steering authority for the plane across `world.js#startLoop`. Owns: velocity, smoothed bank/pitch, propeller spin, two wing-tip contrails.

**Constructor:** `new PlaneController(plane, propeller, scene)`. The propeller ref is passed in explicitly (was previously looked up via `plane.getObjectByName('propeller')`); the HUD-lock refactor re-parented the prop to `scene` so a recursive lookup under `plane` would now miss it. Falls back to `null` if not supplied — spin path then no-ops cleanly.

Tuning constants (private to the controller — tweak here):

| Constant | Default | What it does |
|----------|---------|--------------|
| `moveSpeed` | `28` | Max horizontal velocity (units/s) |
| `verticalSpeed` | `14` | Max vertical velocity (units/s) |
| `turnSmooth` | `6` | Velocity lerp rate (s⁻¹), frame-rate independent |
| `maxBank` | `0.75` (rad) | Max roll angle (`-ix * maxBank`; bank-left input rolls right) |
| `maxPitch` | `0.35` (rad) | Max pitch angle (`iy * maxPitch`) |
| `bankSmooth` | `5` | Roll lerp rate (s⁻¹) |
| `pitchSmooth` | `5` | Pitch lerp rate (s⁻¹) |

Inputs arrive as `{x, y}` normalized to `[-1, 1]` from `input.js` (keyboard / pointer / joystick / gyroscope). Velocity is smoothed toward `input * speedCap` with `1 - Math.exp(-rate * delta)` for frame-rate independence. Position is then clamped against the same `TUNING.BOUND_X` / `BOUND_Y_MIN..MAX` that the input clamp uses, so input + steering + bounds can never drift apart.

`PlaneController.reset()` is called once per `startLoop()` (before `resetGame()`) and zeros velocity, bank, pitch, and clears the trails.

### Wing-tip contrails (`ExhaustTrail`)
Two `ExhaustTrail` instances (left + right) attached during controller construction. Each is a ring-buffered `THREE.Line`:

- **Max 80 points**; new point only pushed when the world-pos moves ≥0.15m from the last (line economy — long straights don't accumulate redundant verts).
- Wing-tip anchors: `wingOffset = (±3.5, 0, -0.5)` mirrored across the X plane, transformed each frame by `plane.quaternion * plane.position` so trails follow bank/pitch correctly.
- Material: `LineBasicMaterial`, **additive blending**, opacity `0.8`, color `0xffffff` (pure white in day mode; fog tints them).
- `clear()` (called by `PlaneController.reset()`) and `dispose()` (called by `world.js#dispose()`) paths are wired so a world teardown doesn't leak the line geometry/material.

## Notable behaviors & implementation notes
- The Game Over overlay no longer renders a crash decoration — the previous source file (`/Clipboard0E2.webp`) is no longer in the repo. Drop a replacement under `/assets/image/...` and re-add a `<img>` inside `#gameOver` in index.html to bring it back.
- Multiplayer presence uses Puter's shared KV room (`createPuterRoom()`); presence is updated every 2.5s and peers are visualized as simple coloured markers.
- The game attempts to load `/assets/model/stylized_ww1_plane.glb` (wired up in `game.js`) and falls back to the procedural plane in `game/world/plane/factory.js#buildPlane` if loading fails.
- Audio is positional and best-effort; autoplay may be blocked until a user gesture. Engine sound loads `/assets/audio/airplane.wav` (`THREE.AudioLoader`) and starts inside the Start-button click handler.
- Puter integration is automatic when hosted inside Puter (via `puter.js` SDK). For legacy use, set an API key with `window.setPuterApiKey(key)`.
- Disposal: every domain manager exposes a teardown; the safe-default disposal walks the tree skipping resources the shared WeakSet registered.
- Near-miss bullet-time: when the plane AABB enters a 0.5m shell around the `+1.2` collision AABB, `state.timeScale` smoothly drops from 1.0 → 0.4 for ~1.2s, then eases back to 1.0. World dt is multiplied by `state.timeScale` so clouds, ground strips, plane motion, propeller spin, and building drift all slow together (Matrix-style). On `state.over` (post-crash) `timeScale` is forced to 1.0 so the 3-explosion GIF + 3D burst stagger keeps its real wall-clock cadence. Cooldown is **per-building** (`state.lastNearMissByBuilding: Map<building, lastFireMs>`): skimming past N distinct buildings in quick succession fires N independent bullet-time windows, while grazing along ONE building for more than 1.2s refires at most once per window (no sustained slow-mo from a single long shell-graze). Tunables in `game/world/shared.js#TUNING` (`NEAR_MISS_TIME_SCALE`, `NEAR_MISS_DURATION_MS`); helpers in `game/world.js#checkNearMiss` and the per-frame `buildings.updateForSpeed` callback.

## Local development tips
- Quick start: `npm start` (boots a static server on http://localhost:8765/ via the `start` script in `package.json`, which runs `python -m http.server 8765`).
- Serve from the project root (the canonical live root) to avoid fetch / audio / GLB CORS issues.
- For faster iteration, open devtools and watch console logs for loader, audio, and Puter warnings.
- Delete `kamikazziHiScore`, `kamikazziBriefings` and/or `kamikazziBriefingsCfg` from localStorage to reset player state and AI-driven ("briefings") changes.

## Known caveats
- DeviceOrientation on iOS may require user permission and a tap to enable.
- GLB and large textures should be served from the same origin or a permissive CORS host.
- Some `/assets/image/*.webp` files (e.g. `1.webp`, `2.webp`) are wired as surrogate graffiti decals (`GRAFFITI_ASSETS` in `game/world/shared.js`) until the originals resurface.
- esm.sh CDN is used to import Three.js — for offline development, vendor `three@0.128.0` and the GLTFLoader extension locally.

## License
This project is provided as-is for demonstration and experimentation.
