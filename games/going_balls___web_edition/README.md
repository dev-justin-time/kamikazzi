# Going Balls — Web Edition

A 3D physics-based rolling platformer inspired by "Going Balls," built entirely for the browser with Three.js and Cannon-es.

---

## 📸 Screenshots

### Loading Screen

![Loading screen](screenshots/loading.png)

*Splash screen with shimmering title and progress bar while the wolf model loads.*

### First-Launch Tutorial

![Tutorial popup](screenshots/tutorial.png)

*One-time popup explaining controls, goals, and the shop system.*

### Gameplay with Orbit Camera

![Gameplay](screenshots/gameplay.png)

*Orbit camera rotated around Jack mid-run — drag mouse to orbit, scroll to zoom.*

### Level Complete Celebration

![Celebration screen](screenshots/celebration.png)

*Animated celebration overlay showing coins, time, and distance after finishing a level.*

---

## 🎮 Features

### Core Gameplay
- **Physics-driven movement** — 100 kg sphere with realistic friction, gravity (`-45 m/s²`), and damping for a heavy, satisfying roll.
- **Player-controlled** — Press W/↑ to move forward, S/↓ to slow down, A/D to steer. Ball stays centered by default.
- **Orbit camera** — Drag the mouse to orbit around Jack; scroll to zoom in/out. R key or middle-click resets the view.
- **Multi-jump system** — Up to 3 jumps in the air, with grounded detection via Cannon-es contact normals.
- **Procedural level generation** — 26 segment types (5 new!) across 9 difficulty tiers (Easy → Impossible), alternating safe/hazard segments, smooth difficulty scaling.

### Obstacles & Hazards
Pendulums, spinners, hammers, side crushers, moving platforms, narrow bridges, gap jumps, tunnels, halfpipes, archipelagos, checkerboards, stairs, ramps, thin bridges, sloped turns, funnels, spiral staircases, speed boosts, and more.

### Character — Jack the Wolf
- ~~18 MB~~ **6.9 MB** DRACO-compressed GLTF skeletal model with **idle ↔ run** animation crossfade (67% smaller!).
- Speed-scaled animation playback (0.5×–1.5×) and smooth blend transitions.
- Footstep particle effects (dust puffs) and procedural Web Audio API footstep sounds.

### Shop & Customization
- **20+ ball skins** — Rainbow (free), Wood, Chrome, Lava, Mint, and 14 premium "glass" skins with inner-image materials.
- **4 sky themes** — Blue Sky, Sunset, Midnight, Cosmic.
- Coins collected during runs fund purchases; coins lost on death.

### Track Builder
- **20+ track elements** — Platforms, ramps, gaps, checkpoints, hazards, stunts (loops, grind rails, donuts).
- **Drag-and-drop** — Drag items from toolbar panels onto the 3D canvas.
- **Scene Builder** — Overhead camera mode for in-world placement with keyboard controls.
- **Save/Load** — Persist custom tracks to localStorage.

### Item Studio
- In-game material editor (color, emissive, opacity, metalness, roughness, wireframe, texture upload).
- Object hierarchy browser with selection highlighting.
- Orbit camera, transform controls (position/rotation/scale).
- Screenshot export and reset functionality.

### UX & Accessibility
- **Loading screen** — Splash overlay with progress bar while the wolf model loads.
- **First-launch tutorial** — One-time popup explaining controls, goals, and the shop system.
- **Pause** — Escape to pause/unpause; overlay with Resume button.
- **Mute** — 🔊/🔇 toggle in the top menu, persisted to localStorage.
- **Settings** — Camera sensitivity slider, invert Y toggle, shadow quality toggle.
- **Stats** — Lifetime stats modal (best level, coins earned, play time, deaths).
- **Celebration screen** — Animated level-complete overlay with stats (coins, time, distance).
- **Visual progress bar** — Green bar at top of screen showing track progress.
- **Keyboard navigation** — Tab/Enter in all modals; focus trapping; Escape to close.
- **Color-blind accessibility** — Shape-based indicators on hazards, checkpoints, coins, and finish line.
- **ARIA labels** — All interactive elements labeled for screen readers.

---

## 🕹️ Controls

> **Press `?` in-game** to open the Help modal — the authoritative controls reference.

| Input | Action |
|---|---|
| **W / ↑** | Move forward |
| **S / ↓** | Slow down / reverse |
| **A / ←** | Steer left |
| **D / →** | Steer right |
| **Space** | Jump (up to 3×) |
| **Escape** | Pause / Close modals |
| **R** | Reset camera view |
| **🖱 Drag** | Orbit camera around Jack |
| **🖱 Scroll** | Zoom camera in/out |
| **🖱 Click** | Toggle top menu |
| **🖱 Middle-click** | Reset camera view |
| **Mobile joystick** | Steer (on-screen, bottom-left) |
| **Jump button** | Jump (on-screen, bottom-right) |

> **Note:** Touch controls are automatically hidden on desktop. Press **W** or **↑** to start moving!

---

## 🏗️ Architecture

```
going_balls___web_edition/
├── index.html              # Entry point, UI layout, importmap, tutorial + modals
├── main.js                 # Game class — scene, physics, controls, camera, animate loop
├── css/style.css           # All styling (HUD, modals, studio, builder, mobile, tutorial)
├── js/
│   ├── audio.js            # Procedural footsteps (Web Audio), sound effects
│   ├── ball-skins.js       # Ball material factory (texture, color, glass, GIF)
│   ├── level-gen.js        # 26 segment generators + 9 difficulty tiers + accessibility markers
│   ├── track-builder.js    # Builder UI, preview, save/load, scene builder
│   ├── ui.js               # Modal wiring, shop grids, purchase logic, toasts, keyboard nav
│   ├── wolf-model.js       # GLTF model loader, idle/run crossfade, loading splash
│   └── studio.js           # In-game item editor (material, transform, export)
├── assets/
│   ├── model/jack_the_wolf/  # DRACO-compressed GLTF model (6.9 MB)
│   ├── image/               # Ball textures, sky textures, GIF skins
│   └── audio/               # Sound effect MP3s
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
| Model Format | GLTF 2.0 with DRACO mesh compression |
| Texture Format | WebP (EXT_texture_webp) |
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

> **Note:** The wolf model is ~6.9 MB (DRACO-compressed) and loads in a few seconds on typical connections. A loading screen with progress bar is shown during the initial download.

---

## 📊 Difficulty Tiers

| Level | Tier | Color | Segment Types (8 per tier) |
|---|---|---|---|
| 1–3 | EASY | 🟢 | Straight, ramp, tunnel, speed strip, jump gap, speed boost, stairs, bumpy |
| 4–6 | NORMAL | 🟩 | Straight, ramp, zigzag, bumpy, jump gap, climb, thin bridge, sloped turn |
| 7–9 | CHALLENGING | 🔵 | Zigzag, gap, archipelago, spinner, double jump, climb, funnel, spiral staircase |
| 10–12 | HARD | 🟡 | Gap, spinner, pendulum, stairs, double jump, hammer gauntlet, moving rects, halfpipe |
| 13–15 | TOUGH | 🟠 | Pendulum, hammer gauntlet, moving rects, checkerboard, triple jump, narrow, side crusher, spinner |
| 16–18 | EXPERT | 🔴 | Hammer gauntlet, side crusher, narrow, moving rects, triple jump, pendulum, checkerboard, gap |
| 19–21 | EXTREME | 🟣 | Narrow, side crusher, checkerboard, triple jump, hammer gauntlet, pendulum, double jump, spinner |
| 22–24 | INSANE | ⚫ | Narrow, side crusher, hammer gauntlet, checkerboard, triple jump, pendulum, archipelago, moving rects |
| 25+ | IMPOSSIBLE | ⚫ | Same as INSANE (max hazard speed scaling) |

**Level generation:** 25 + level×4 segments per level (40–125+). Alternating safe/hazard pattern prevents consecutive hazard segments. Checkpoints every 8 segments. Width tapers smoothly per segment. Coins scale in count and value with level difficulty.

---

## 📝 Changelog

### v1.5 — Polish & Accessibility (July 2026)
- 🎨 Color-blind accessibility: shape-based indicators on hazards, coins, checkpoints, and finish line
- ⌨️ Keyboard navigation: Tab/Enter in all modals, focus trapping, Escape to close
- 🏷️ ARIA labels on all interactive elements for screen readers
- 📊 Stats modal: lifetime best level, coins earned, play time, deaths
- 📈 Visual progress bar: green bar at top of screen
- 🔔 Toast notifications for errors (purchase failures) and confirmations (mute)

### v1.4 — Orbit Camera & Tutorial (July 2026)
- 🖱️ Mouse orbit camera: drag to rotate around Jack, scroll to zoom
- 📖 First-launch tutorial popup explaining controls, goals, and shop
- ⚙️ Settings modal: camera sensitivity, invert Y, shadow quality
- 🔇 Mute button: toggle audio on/off, persisted to localStorage
- 🏁 Celebration screen: animated level-complete overlay with stats

### v1.3 — UX & Level Generation (July 2026)
- ⏸️ Pause functionality: Escape to pause, overlay with Resume button
- 📱 Touch controls hidden on desktop, shown only on mobile
- 🏗️ Builder UI hidden during normal gameplay
- 🎯 Level generation rewrite: 25+level×4 segments, alternating safe/hazard, 8 types per tier, 5 new segment types
- 🔄 Track rotated 40° CCW for visual variety
- 🪙 Coins scale in count and value with difficulty

### v1.2 — Performance (July 2026)
- 🗜️ DRACO mesh compression: wolf model 20.7 MB → 6.9 MB (67% smaller)
- 🖼️ WebP texture compression for faster loads
- ⏳ Loading screen with shimmering title and progress bar
- 📸 Shadow quality toggle: 2048 (desktop) / 1024 (mobile)
- 🎞️ GIF texture updates throttled to ~20fps

### v1.1 — Initial Release
- 🎮 Core physics-based platformer with Three.js + Cannon-es
- 🐺 Jack the Wolf: GLTF model with idle/run animation crossfade
- 🛒 Shop: 20+ ball skins, 4 sky themes, coin economy
- 🏗️ Track Builder with drag-and-drop and scene builder
- 🔧 Item Studio: material editor, transform controls, screenshot export
- 📱 Mobile controls: virtual joystick + jump button
- 🎵 Procedural footstep audio and sound effects

---

## 📜 License

Internal project — not licensed for redistribution.
