# KAMAKAZII 3D — AERO COMMAND

> **Strap into a rattletrap warbird and scream through the neon valley.**

A high-octane 3D endless flyer built with Three.js. Dodge procedurally generated buildings, collect powerups, trigger bullet-time near-misses, advance through 8 photographic sectors, and chase the high score. Fully integrated with Puter.js for cloud sync, AI skin generation, replays, leaderboard, and multiplayer presence.

---

## Quick Start

```bash
# From the suite root
npm start
# or
python -m http.server 8765
# Open http://localhost:8765/kamakazii_3d_aero_comand/
```

**Controls:** Arrow Keys / WASD to steer · ESC to pause · `?` for shortcuts

---

## Game Features

### 🎯 Mission System
8 progressive sectors with increasing speed, photographic backgrounds, and a climactic Final Sector (boss atmosphere) at Sector 8.

### ⚡ Powerups
| Type | Effect | Duration |
|------|--------|----------|
| Shield | Fly through one building safely | 3s |
| Boost | World speed ×1.5 | 4s |
| Magnet | Pulls nearby powerups toward you | 5s |
| 2× Score | Score gains doubled | 6s |
| Slow-mo | Time slows to 40% | 3s |
| Stamina | Refresh bullet-time window | Instant |

### ⏱ Near-Miss Bullet-Time
Enter a 0.5m danger shell around buildings to trigger Matrix-style slow-motion. Stackable with Slow-mo powerup.

### 🎨 Skin Lab (AI-Powered)
Generate plane textures, pilot portraits, and building palettes via AI. Style presets including Kamikaze, Stealth, Chrome, Cyberpunk, and more.

### ☁️ Cloud Features (Puter.js)
- **Cloud Save** — high scores, settings, run history
- **Leaderboard** — global top-10 with period filters
- **Replay Gallery** — auto-saved screenshots + telemetry
- **Multiplayer** — real-time presence in the lobby
- **AI Image Generation** — text-to-texture for skins

### 🌍 Level Fabricator
Full 3D terrain editor with 14 presets, custom heightmap upload, and real-time editing tools.

---

## Project Structure

```
kamakazii_3d_aero_comand/
├── game/               # Game engine source
│   ├── main.js         # Entry point
│   ├── locale.js       # Internationalization
│   ├── puter-client.js # Puter.js integration
│   ├── renderer.js     # Three.js rendering
│   ├── ui.js           # HUD and UI management
│   ├── world.js        # World controller
│   ├── world/          # World subsystems
│   │   ├── shared.js   # Shared constants and helpers
│   │   ├── buildings.js# Procedural city buildings
│   │   ├── explosion.js# Crash explosion particles
│   │   ├── ideas.js    # Game idea generation
│   │   ├── magnet_halo.js # Magnet powerup visual
│   │   ├── powerups.js # Powerup spawning and logic
│   │   └── plane/      # Plane controller and factory
│   ├── controls/       # Input control modules
│   └── level-fabricator/ # Terrain editor
├── index.html          # Game entry point
├── sw.js               # Service worker (PWA offline)
├── manifest.json       # PWA manifest
├── package.json        # Dependencies
└── README.md
```

---

## Deploy to Puter App Store

### Checklist

| Requirement | Status |
|-------------|--------|
| PWA Manifest | ✅ Complete |
| Service Worker | ✅ Complete (offline support) |
| 512×512 Icon | ✅ Ready |
| Puter.js Integration | ✅ KV, FS, AI, Presence |
| Functional & Complete | ✅ Fully playable |
| App-like Experience | ✅ Standalone mode, boot screen, HUD |

### Submission
1. Host the `kamakazii_3d_aero_comand/` directory on a web server
2. Visit [Puter Dev Center](https://developer.puter.com/app-center/)
3. Click "New App" — name: `KAMIKAZZI 3D`
4. Upload icon from `assets/icons/icon-512.png`
5. Set entry URL to `/kamakazii_3d_aero_comand/index.html`
6. Category: Games / Action

See `docs/puter-app-store.md` for the full submission guide.

---

## Technical Architecture

### Core Loop
```
requestAnimationFrame
  ├── Read input → state.target.x/y
  ├── Compute dt × timeScale
  ├── Update powerups (drift, spin, magnet pull, pickup)
  ├── Update score
  ├── Level advancer
  ├── Near-miss detector
  ├── Collision detector
  ├── PlaneController.update
  ├── Buildings.updateForSpeed
  ├── Camera lerp
  ├── Presence push (multiplayer)
  ├── Render: bgScene → clearDepth → main scene
  └── HUD update
```

### 3D Scene Layers
1. **Background scene** — Orthographic camera with full-screen city photo
2. **Main scene** — Perspective camera with buildings, plane, clouds, powerups

---

## Scoring

| Source | Points |
|--------|--------|
| Distance flown | `effSpeed × dt × 1.0` per frame |
| Building pass bonus | +5 per building |
| 2× Score powerup | All score ×2 while active |

### Grades
| Grade | Threshold |
|-------|-----------|
| S | ≥ 10,000 pts |
| A | ≥ 5,000 pts |
| B | ≥ 3,000 pts |
| C | ≥ 1,500 pts |
| D | < 1,500 pts |

---

## License

MIT — See project root for details.

*Built with Three.js. Cloud features via Puter.js. Plane model: "Stylized WW1 Plane" by Helijah (CC-BY).*
