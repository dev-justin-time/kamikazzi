# Kamikazzi 3D

A lightweight browser-based 3D endless flyer built with Three.js — dodge buildings, collect powerups, and compete via simple multiplayer presence. This repo contains a modular renderer, world logic, UI, input handling, and optional Puter/AI integration for collecting and applying player "briefings".

## Live
Open `index.html` in a modern browser (Chrome/Edge/Firefox). For best results run from a local static server (e.g. `npx http-server` or `python -m http.server`) to avoid GLB and audio CORS/autoplay issues. The sky/photographic background expects the project root to be the served root, with assets under `/assets/...` and `%20`-encoded filenames where needed.

## Controls
- Desktop: Arrow keys or WASD to steer; mouse/drag on canvas to steer.
- Mobile: On-screen joystick (bottom-left) or device tilt (DeviceOrientation) to steer.
- UI: "Start Flying" to begin; "Try Again" to restart after crash.

## Files & Structure
- index.html — main page, HUD overlays (start / game over), Google Fonts (Stick No Bills + Noto Sans JP) and kanji sub-title (神風).
- game.js — application bootstrap (creates renderer, world, input, UI).
- game/renderer.js — Three.js renderer and camera setup.
- game/world.js — world composition: scene, lights, ground, clouds, managers and main loop. Owns the `PlaneController` instance + presence loop.
- game/world/plane/factory.js — procedural plane (`buildPlane`) and GLB loader (`loadPlaneFromGLB`) with shared geometries/materials.
- game/world/plane/controller.js — `PlaneController` (frame-independent steering, banking, propeller spin) and twin `ExhaustTrail` contrails.
- game/world/buildings.js — building spawning, windows, and graffiti decals (skip-shared disposal).
- game/world/explosion.js — explosion particle manager (shared geometry/material pool).
- game/world/powerups.js — powerup spawn/drift/reap; finally reaps past camera.
- game/world/ideas.js — small "briefings" config applied from local storage.
- game/world/shared.js — centralized `TUNING` constants, `loadTexture` cache, `removeAndDispose` helpers, skip-shared dispose registry.
- game/input.js — keyboard, pointer, joystick, and gyroscope steering.
- game/ui.js — HUD wiring, crash-skull overlay behavior, retry click.
- puter-client.js — optional integration via the `kamikazzi-radio` service for sending/fetching briefings and generating AI game changes.
- assets: models (GLB), images (PNG/WebP/JPG), audio (airplane.wav). Files with `(1)` in their name are original browser-downloaded copies; the canonical URLs point at root-level or `assets/image/...`.

## Notable behaviors & implementation notes
- The skull crash image (`/Clipboard0E2.webp`) is shown only in the Game Over overlay and hidden when restarting.
- Multiplayer presence uses `WebsimSocket` if available; presence is updated each run and peers are visualized as simple markers.
- The game attempts to load `/stylized_ww1_plane.glb` and falls back to a procedural plane if loading fails.
- Audio is positional and best-effort; autoplay may be blocked until a user gesture. Engine sound attempts to start inside the Start-button click handler.
- Puter integration is optional and best-effort: set an API key with `window.setPuterApiKey(key)` to enable remote saving/fetching of briefings and runs.
- Disposal: every domain manager exposes a teardown; the safe-default disposal walks the tree skipping resources the shared WeakSet registered.

## Local development tips
- Quick start: `npm start` (boots a static server on http://localhost:8765/ via the `start` script in `package.json`, which runs `python -m http.server 8765`).
- Serve from the project root (the canonical live root) to avoid fetch / audio / GLB CORS issues.
- For faster iteration, open devtools and watch console logs for loader, audio, and Puter warnings.
- Delete `kamikazziHiScore`, `kamikazziBriefings` and/or `kamikazziBriefingsCfg` from localStorage to reset player state and AI-driven ("briefings") changes.

## Known caveats
- DeviceOrientation on iOS may require user permission and a tap to enable.
- GLB and large textures should be served from the same origin or a permissive CORS host.
- Some texture assets are used as decorative graffiti; the skull image is intentionally reserved for the crash overlay only.
- esm.sh CDN is used to import Three.js — for offline development, vendor `three@0.128.0` and the GLTFLoader extension locally.

## License
This project is provided as-is for demonstration and experimentation.
