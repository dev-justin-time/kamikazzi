# KAMIKAZZI — Branded Game Suite

> **A high-octane browser-based flight arcade, a full 3D content studio, and a growing universe of creative tools.**  
> Built with Three.js, powered by Puter.js. No build step required.

---

## Suite Overview

| App | Directory | Description |
|-----|-----------|-------------|
| 🎮 **KAMIKAZZI 3D — Aero Command** | `kamakazii_3d_aero_comand/` | Endless flyer — dodge buildings, collect powerups, chase the high score across 8 sectors. AI skins, replays, leaderboard, multiplayer. |
| ⚡ **VECTOR STRIKE: OMNI** | `kamasazii_vecter_omega3d/` | Air-to-air combat — Rust + Rhai + Go + Puter.js. 6DOF physics, wireframe rendering, multiplayer, Puter AI briefings, cloud replays. |
| 🐺 **Going Balls — Web Edition** | `games/going_balls___web_edition/` | Physics-driven rolling platformer with Jack the Wolf. Procedural levels, shop, track builder, item studio, and accessibility features. |
| 🧱 **BLOCKBUSTER** | `games/BLOCKBUSTER/` | Minecraft-inspired voxel sandbox with block breaking/placing, crafting, furnace smelting, inventory, zombie AI, chat, and multiplayer. |
| 🛠️ **KAMAKAZII STUDIO 3D** | `kamakazii_studio3D/` | Browser-based 3D model editor and game content studio. Sculpting, texture painting, animation, node editor, physics, marketplace. |

Each app is a **standalone repository** deployable independently on the Puter App Store. See each app's README for details.

---

## Quick Start

```bash
# From the suite root — serve locally
python -m http.server 8765
# or
npx http-server

# Then open:
#   Game:     http://localhost:8765/
#   Studio:   http://localhost:8765/kamakazii_studio3D/ui/index.html
#   Standalone game: http://localhost:8765/kamakazii_3d_aero_comand/index.html
```

---

## Project Structure

```
kamikazzi/
├── kamakazii_3d_aero_comand/   # 🎮 Game app (standalone repo)
│   ├── game/                   # Core engine: main.js, renderer.js, world/, controls/
│   ├── index.html              # Game entry point (standalone)
│   ├── sw.js                   # PWA service worker
│   ├── manifest.json           # PWA manifest
│   └── README.md               # Game documentation
│
├── kamakazii_studio3D/         # 🛠️ Studio app (standalone repo)
│   ├── app/                    # Core shell, state, AI bridge
│   ├── editor/                 # Tool managers (model, objects, animation)
│   ├── systems/                # Physics, sculpting, paint, node editor
│   ├── features/               # Feature pages
│   ├── marketplace/            # Plugin registry, asset store
│   ├── tools/                  # Standalone tools (pose editor, map maker)
│   ├── ui/                     # Entry HTML, manifest
│   └── README.md               # Studio documentation
│
├── kamasazii_vecter_omega3d/   # ⚡ VECTOR STRIKE: OMNI (standalone repo)
│   ├── Cargo.toml              # Rust crate → Wasm
│   ├── src/lib.rs              # Engine: 6DOF physics, Rhai VM, WebGL2
│   ├── scripts/                # Rhai AI behavior + weapon definitions
│   ├── server/                 # Go authoritative multiplayer server
│   ├── index.html              # Frontend + Puter.js
│   ├── style.css               # Cyberpunk HUD
│   └── README.md               # Full documentation
│
├── assets/                     # Shared suite assets
│   ├── icons/                  # App icons (SVG, PNG)
│   ├── image/                  # Game backgrounds, decals
│   ├── audio/                  # Sound effects
│   └── model/                  # 3D models (GLB)
│
├── index.html                  # Game entry (suite root)
├── sw.js                       # Root service worker
├── manifest.json               # Root PWA manifest
├── package.json                # Suite-level scripts
├── docs/                       # Suite documentation (see also kamakazii_3d_aero_comand/docs/)
└── README.md                   # This file
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **3D Engine** | Three.js 0.128.0 (ESM via esm.sh) |
| **Controls** | Keyboard, pointer, joystick (nipplejs), gyroscope |
| **Cloud** | Puter.js SDK (KV, FS, AI, Presence) |
| **PWA** | Service worker, manifest, offline support |
| **Fonts** | Stick No Bills, Noto Sans JP, JetBrains Mono |
| **No Build** | ES modules + import maps — open and play |

---

## Game — KAMIKAZZI 3D

See [`kamakazii_3d_aero_comand/README.md`](./kamakazii_3d_aero_comand/README.md) for full documentation.

### Highlights
- **8 progressive sectors** with photographic backgrounds and boss atmosphere
- **6 powerup types**: Shield, Boost, Magnet, 2× Score, Slow-mo, Stamina
- **Near-miss bullet-time** — Matrix-style slow-motion on close calls
- **Skin Lab** — AI-generated plane textures, pilot portraits, building palettes
- **Leaderboard** — global top-10 across week / month / all-time
- **Replay Gallery** — auto-saved screenshots + telemetry
- **Multiplayer Lobby** — real-time presence via Puter rooms
- **Level Fabricator** — full 3D terrain editor with 14 presets

---

## Studio — KAMAKAZII STUDIO 3D

See [`kamakazii_studio3D/README.md`](./kamakazii_studio3D/README.md) for full documentation.

### Highlights
- **3D Viewport** — orbit controls, selection, transform tools
- **Sculpting** — brush-based mesh editing with multiple brush types
- **Texture Painting** — layer-based and vertex painting
- **Animation** — timeline, keyframes, clips, playback
- **Node Editor** — visual material and effect graph
- **Physics** — rigid body simulation, SPH fluid solver
- **Marketplace** — plugin registry, asset store, creator portal
- **AI Integration** — mesh generation, texture synthesis, scene description

---

## Puter Deployment

All apps are designed for the [Puter App Store](https://developer.puter.com/app-center/):

| App | Entry URL | Category |
|-----|-----------|----------|
| KAMIKAZZI 3D | `/kamakazii_3d_aero_comand/index.html` | Games / Action |
| VECTOR STRIKE: OMNI | `/kamasazii_vecter_omega3d/index.html` | Games / Action / Air Combat |
| Going Balls | `/games/going_balls___web_edition/index.html` | Games / Arcade |
| BLOCKBUSTER | `/games/BLOCKBUSTER/index.html` | Games / Sandbox |
| Studio | `/kamakazii_studio3D/ui/index.html` | Developer Tools / 3D Modeling |

See [`kamakazii_3d_aero_comand/docs/puter-deployment-audit.md`](./kamakazii_3d_aero_comand/docs/puter-deployment-audit.md) for the full audit checklist.

---

## Controls (Game)

| Input | Action |
|-------|--------|
| Arrow Keys / WASD | Steer plane |
| Touch drag | Relative steering (mobile) |
| On-screen joystick | Bottom-left knob (touch) |
| Device tilt | Gyro steering |
| ESC | Pause / close panels |
| `?` | Keyboard shortcuts overlay |
| Space | Start / retry |

---

## License

MIT — Each standalone repo carries its own license.  
*Built with Three.js. Cloud features via Puter.js. Plane model: "Stylized WW1 Plane" by Helijah (CC-BY).*
