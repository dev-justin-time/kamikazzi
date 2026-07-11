# Going Balls — Web Edition

A 3D physics-based rolling platformer inspired by "Going Balls," built entirely for the browser with Three.js and Cannon-es.

---

## 🎮 Features

### Core Gameplay
- **Physics-driven ball movement** — 100 kg sphere with realistic friction, gravity (`-45 m/s²`), and damping for a heavy, satisfying roll.
- **Side-scrolling camera** — Fixed side view with smooth lerp tracking; Jack (the wolf) runs on the left side of the screen.
- **Multi-jump system** — Up to 3 jumps in the air, with grounded detection via Cannon-es contact normals.
- **Procedural level generation** — 26 segment types across 9 difficulty tiers (Easy → Impossible), scaling with level number.

### Obstacles & Hazards
Pendulums, spinners, hammers, side crushers, moving platforms, spike pits, trampolums, spring pads, seesaws, narrow bridges, gap jumps, tunnels, halfpipes, archipelagos, checkerboards, stairs, and ramps.

### Character — Jack the Wolf
- 18 MB GLTF skeletal model with **idle ↔ run** animation crossfade.
- Speed-scaled animation playback (0.5×–1.5×) and smooth blend transitions.
- Footstep particle effects (dust puffs) and procedural Web Audio API footstep sounds.

### Shop & Customization
- **20+ ball skins** — Rainbow (free), Wood, Chrome, Lava, Mint, and 14 premium "glass" skins with inner-image materials.
- **4 sky themes** — Blue Sky, Sunset, Midnight, Cosmic.
- Coins collected during runs fund purchases; coins lost on death.

### Track Builder
- **20+ track elements** — Platforms, ramps, gaps, checkpoints, hazards, stunts (loops, grind rails, donuts).
- **Drag-and-drop** — Drag items from toolbar panels onto the 3D canvas.
- **Scene Builder** — Overhead camera mode for in-world placement with keyboard controls (Arrows, Q/E rotate, P place).
- **Save/Load** — Persist custom tracks to localStorage.

### Item Studio
- In-game material editor (color, emissive, opacity, metalness, roughness, wireframe, texture upload).
- Object hierarchy browser with selection highlighting.
- Orbit camera, transform controls (position/rotation/scale).
- Screenshot export and reset functionality.

---

## 🕹️ Controls

| Input | Action |
|---|---|
| **W / ↑** | Move forward (–Z) |
| **S / ↓** | Move backward (+Z) |
| **A / ←** | Steer left (–X) |
| **D / →** | Steer right (+X) |
| **Space** | Jump (up to 3×) |
| **T** | Exit pointer lock |
| **Mouse drag** | Steer + move (when pointer locked) |
| **Mobile joystick** | Steer (on-screen, bottom-left) |
| **Jump button** | Jump (on-screen, bottom-right) |

---

## 🏗️ Architecture

```
going_balls___web_edition/
├── index.html              # Entry point, UI layout, importmap
├── main.js                 # Game class — scene, physics, controls, animate loop
├── css/style.css           # All styling (HUD, modals, studio, builder, mobile)
├── js/
│   ├── audio.js            # Procedural footsteps (Web Audio), sound effects
│   ├── ball-skins.js       # Ball material factory (texture, color, glass, GIF)
│   ├── level-gen.js        # 26 segment generators + difficulty tier system
│   ├── track-builder.js    # Builder UI, preview, save/load, scene builder
│   ├── ui.js               # Modal wiring, shop grids, purchase logic
│   ├── wolf-model.js       # GLTF model loader, idle/run crossfade, animation
│   └── studio.js           # In-game item editor (material, transform, export)
├── assets/
│   ├── model/jack_the_wolf/  # GLTF model + textures
│   ├── image/               # Ball textures, sky textures, GIF skins
│   └── audio/               # Sound effect MP3s
├── BALLS.MD                 # (empty)
├── UX_AUDIT.md              # UX audit report
└── README.md                # This file
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Rendering | Three.js r160 (via esm.sh CDN) |
| Physics | Cannon-es 0.20.0 |
| Mobile Controls | nipplejs 0.10.1 |
| Model Format | GLTF 2.0 (GLTFLoader) |
| Audio | Web Audio API (procedural) + MP3 fallbacks |
| Persistence | localStorage |
| Build | None — ES modules + importmap, served directly |

---

## 🚀 Running Locally

```bash
# From the project root:
cd games/going_balls___web_edition

# Option A: Python
python -m http.server 8080

# Option B: Node
npx serve .

# Option C: PHP
php -S localhost:8080
```

Open `http://localhost:8080` in your browser.

> **Note:** The wolf model (18 MB) may take 5–15 seconds to load on first visit. Check the browser console for `[Jack]` logs to monitor loading progress.

---

## 📊 Difficulty Tiers

| Level | Tier | Color | Segment Types (each tier picks from its own set) |
|---|---|---|---|
| 1–3 | EASY | 🟢 | Straight, ramp, tunnel, speed strip, jump gap |
| 4–6 | NORMAL | 🟩 | Straight, ramp, tunnel, zigzag, bumpy, jump gap, climb |
| 7–9 | CHALLENGING | 🔵 | Zigzag, gap, archipelago, spinner, double jump, climb |
| 10–12 | HARD | 🟡 | Gap, spinner, pendulum, stairs, halfpipe, double jump |
| 13–15 | TOUGH | 🟠 | Pendulum, hammer gauntlet, moving rects, checkerboard, triple jump |
| 16–18 | EXPERT | 🔴 | Hammer gauntlet, side crusher, narrow, moving rects, triple jump |
| 19–21 | EXTREME | 🟣 | Narrow, side crusher, checkerboard, archipelago, triple jump |
| 22–24 | INSANE | ⚫ | Narrow, side crusher, hammer gauntlet, checkerboard, triple jump |
| 25+ | IMPOSSIBLE | ⚫ | Same as INSANE (max hazard speed scaling) |

---

## 🐛 Known Issues

See [UX_AUDIT.md](UX_AUDIT.md) for the full audit. Key items:

- No loading screen — 18 MB model loads silently behind a fallback sphere.
- Purchase failures are silent (no error toast).
- Builder UI and studio gear icon visible during normal gameplay.
- No pause functionality.
- Touch controls always visible on desktop.

---

## 📜 License

Internal project — not licensed for redistribution.
