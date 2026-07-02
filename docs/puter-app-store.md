# Puter App Store — Submission Guide

> **Kamikazzi 3D** — High-octane technical flight simulation through procedural neon valleys.

This document covers everything required to list Kamikazzi 3D on the [Puter App Center](https://developer.puter.com/app-center/). The Puter App Store is a web-based marketplace for apps that run inside the Puter internet OS.

---

## ✅ Submission Checklist

### 1. Icon Requirements
| File | Purpose | Status |
|------|---------|--------|
| `assets/icon.svg` | Primary vector source (favicon, scalable) | ✅ Ready |
| `assets/icon-192.png` | PWA manifest (192×192) | ✅ Generated |
| `assets/icon-512.png` | App Store listing (512×512) | ✅ Generated |
| `assets/apple-touch-icon.png` | iOS home screen (512×512) | ✅ Generated |

**Icon guidelines met:**
- ✅ 512×512 pixel square
- ✅ Professionally designed (rising sun + plane silhouette)
- ✅ No embedded text on the icon body
- ✅ Transparent background edges
- ✅ Rounded corners on the PNG render

### 2. Manifest (PWA)
File: `manifest.json` — already configured with:
- ✅ App name & short name
- ✅ Description
- ✅ Display mode: `standalone` with fullscreen override
- ✅ Theme/background colors (`#001525` / `#00a3ff`)
- ✅ Categories: `games`, `entertainment`, `action`
- ✅ Orientation: `landscape`
- ✅ Icons (all three sizes referenced)
- ✅ Shortcuts: "Start Flying" and "Leaderboard"

### 3. App Store Metadata
Submit these through the [Dev Center](https://developer.puter.com/app-center/) UI:

| Field | Value |
|-------|-------|
| **Name** | KAMIKAZZI 3D |
| **Short description** | High-octane technical flight simulation through procedural neon valleys. Dodge towers, collect powerups, and chase the high score. |
| **Category** | Games / Action |
| **Icon** | `assets/icon-512.png` |

### 4. Developer Agreement
By submitting, you agree to the [Puter App Developer Agreement](https://puter.com/developer-agreement):

- You retain ownership of your app
- You grant Puter a non-exclusive license to host and promote
- Your app must comply with all applicable laws
- If your app collects user data, a privacy policy is required

---

## 📋 App Center Approval Guidelines

Your app will be reviewed against these criteria:

| Criterion | How Kamikazzi 3D meets it |
|-----------|---------------------------|
| **Functional & Complete** | Fully playable with 3D WebGL rendering, 6 powerup types, 8 progressive levels, and game-over/mission-success flows |
| **App-like Experience** | Full-screen standalone mode, immersive boot sequence, HUD overlays, pause system, and tactical aesthetic — not a simple website wrapper |
| **Meaningful Purpose** | Provides genuine arcade entertainment with progressive difficulty, score chasing, and cloud-synced leaderboards |
| **Original Work** | All code, 3D models (GLB), audio, and design assets are original or properly licensed |
| **Icon Quality** | Custom vector icon with rising sun and plane silhouette; transparent background; no embedded text |

---

## 🚀 Submission Flow

1. **Host the app** — Serve the static files (HTML, JS, CSS, assets) from any web server. Puter can serve apps from its own cloud storage.
2. **Visit the Dev Center** → [https://developer.puter.com/app-center/](https://developer.puter.com/app-center/)
3. **Click "New App"** and fill in:
   - App name: `KAMIKAZZI 3D`
   - Description (see [Marketing Kit](./assets/marketing_kit.md))
   - Upload `assets/icon-512.png` as the app icon
   - Set entry URL to where the app is hosted
   - Select category: Games
4. **Request Approval** — Puter reviews and notifies you via email.

---

## 🔌 Puter.js Integration Features

Kamikazzi 3D automatically unlocks these features when running inside Puter:

| Feature | Implementation |
|---------|---------------|
| **Cloud Save** | High scores, settings, and run history via `puter.kv` |
| **Leaderboard** | Global top-10 via shared KV key |
| **AI Skin Lab** | `puter.ai.txt2img()` generates plane textures and pilot portraits |
| **AI Config Chat** | `puter.ai.chat.completions` tweaks game parameters from player text |
| **Replay Gallery** | `puter.fs` stores screenshots + telemetry JSON per run |
| **Multiplayer** | Real-time presence via shared KV room |
| **User Identity** | Avatar + username displayed in HUD badge |

All features gracefully fall back to `localStorage` when Puter is absent — the game works offline and in any browser.

---

## 🔗 Useful Links

- [Puter Dev Center](https://developer.puter.com/app-center/)
- [Puter Developer Portal](https://developer.puter.com/)
- [Puter.js Documentation](https://docs.puter.com/)
- [Puter App Developer Agreement](https://puter.com/developer-agreement)
- [App Center Approval Guidelines](https://developer.puter.com/app-center/)
