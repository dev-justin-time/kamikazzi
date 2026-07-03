# KAMIKAZZI 3D — Press Kit

> **One-sentence pitch:** A WWI biplane arcade game where you dodge buildings at high speed, collect powerups, and push your score through 8 escalating sectors — with AI-generated skins and real-time multiplayer.

---

## Fact Sheet

| Field | Detail |
|---|---|
| **Title** | KAMIKAZZI 3D |
| **Developer** | Kamikazzi Studios |
| **Platforms** | Web (PWA), iOS, Android |
| **Release Date** | 2026 |
| **Price** | Free (no ads, no pay-to-win) |
| **Genre** | Arcade / Action / Flight |
| **Languages** | EN, DE, ES, FR, JA, ZH |
| **Engine** | Three.js (WebGL) |
| **Website** | [kamikazzi.com] |
| **Contact** | [press@kamikazzi.com] |

---

## Key Features

### 🛩️ Precision Arcade Flight
Steer a WWI biplane through a procedurally generated city canyon. Mouse/touch controls — drag to bank, climb, and dive. 8 sectors with level-gated base speeds ensure fair, predictable difficulty.

### 🎯 Score Attack
Survive 8 sectors (~2,960 pts) or push to 5,000 for Mission Success. S-rank requires 10,000 points. Every run is replayable with shuffled level order and briefing-driven world modifications.

### 🧬 AI Skin Lab
Generate custom plane textures, pilot portraits, and building color palettes from text prompts. 14 style presets including Steampunk Brass, Bioluminescent, Pixel Art, and Origami Paper.

### 👥 Real-Time Multiplayer
See other pilots in the lobby. Scores update live. Quick Match finds opponents. Peer markers appear in the 3D scene.

### ⚡ 6 Powerup Types
Shield (invincibility), Boost (speed surge), Magnet (attract pickups), 2× Score (double points), Slow-mo (bullet-time), Stamina (refresh slow-mo).

---

## Development History

KAMIKAZZI 3D started as a Three.js experiment in procedural city generation and evolved into a full arcade experience. Key milestones:

- **Initial prototype** — Basic flight + random building spawning
- **Powerup system** — 6 pickup types with visual HUD chips and synthesised audio
- **AI Skin Lab** — Text-to-texture pipeline using Puter.js image generation
- **Level-gated speed** — Replaced continuous ramp with per-sector base speeds for fairness
- **Multiplayer** — Real-time presence via Puter Rooms with Websim fallback
- **Building Palette Generator** — AI-generated city color themes with color extraction
- **Full localization** — 6 languages across all UI

---

## Visual Style

The game combines:
- **Photographic city backgrounds** — 8 real-world skyline photos shuffled each run
- **Low-poly 3D buildings** — Procedural geometry with colored window panes and graffiti decals
- **Stylized biplane** — GLB model with procedural fallback, customizable with AI textures
- **Neon HUD** — Scanline overlay, grid overlay, and cyan/gold telemetry readouts
- **Flashy explosions** — 3-stage particle bursts + GIF overlay on crash

---

## Audio

- **Engine loop** — Procedural airplane.wav played through Three.js PositionalAudio
- **Crash impact** — Synthesised explosion burst with low-pass filter decay
- **Powerup pickups** — Per-type synthesised tones (triangle, sawtooth, square, sine waves)
- **TTS announcements** — Powerup pickups spoken via Puter.ai text-to-speech

---

## Monetization

**None.** The game is completely free with no ads, no in-app purchases, and no pay-to-win mechanics. Cloud features (AI generation, multiplayer, score sync) are powered by Puter.js and available at no cost.

---

## Quotes

> "The level-gated speed system means every sector feels fair — you know exactly what you're getting into." — Lead Developer

> "Building palette generation was a happy accident. We wanted skin presets for planes, realized we could do the same for cities, and suddenly the whole world was customizable." — Design Team

---

## Logos & Assets

Logos and icon assets are available in the project root:
- `assets/icon.svg` — Vector icon
- `assets/icon-192.png` — 192×192 PWA icon
- `assets/icon-512.png` — 512×512 PWA icon
- `assets/apple-touch-icon.png` — iOS home screen icon

Screenshot descriptions available in `marketing/screenshots.md`.
