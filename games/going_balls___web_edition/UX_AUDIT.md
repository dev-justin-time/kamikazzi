# UX Audit Report — Going Balls: Web Edition

**Last updated:** July 11, 2026  
**Scope:** Full gameplay loop — onboarding, controls, visual feedback, UI, performance, accessibility  
**Status:** ✅ = fixed, 🔧 = in progress, ❌ = not yet addressed

---

## Executive Summary

Going Balls: Web Edition is a feature-rich 3D platformer with polished core mechanics. Since the initial audit, **14 of 20 issues have been resolved**, and several major features have been added (orbit camera, mouse zoom, auto-roll, tutorial, settings, pause, mute, keyboard nav, color-blind accessibility, loading screen, celebration screen, stats, progress bar).

---

## 🔴 Critical — Immediate Player-Facing Issues

### 1. No Loading / Splash Screen ✅
- **Status:** FIXED. Added `#loading-screen` with gradient background, animated title, progress bar (`#loading-bar-fill`), and status text. The overlay tracks GLTFLoader progress and fades out on model load. Appears in `index.html` with styles in `css/style.css`, controlled by `dismissSplash()` in `js/wolf-model.js`.

### 2. Purchase Failure Is Silent ✅
- **Status:** FIXED. Added `showToast()` in `js/ui.js` with error/success/info variants. In `handlePurchase()`, insufficient funds now triggers `showToast('Not enough coins!', 'error')`. Toast auto-dismisses after 2 seconds with fade animation.

### 3. "Distance" and "Progress" Labels Are Confused ✅
- **Status:** FIXED. Standardized HUD labels: `#coin-display` uses "Session:", `#distance-display` uses "Distance:". Both `updatePhysics()` display text and `reset()` reset text are consistent.

---

## 🟠 High — Reduces Engagement / Polish

### 4. Coin Loss on Death Is Punishing Without Warning ✅
- **Status:** FIXED. Added `#coin-risk-warning` overlay in `index.html` with pulsing red styling in `css/style.css`. In `main.js` `checkGameState()`, the warning is shown when the ball falls below y = -3 and the player has session coins at risk (`this.score > 0`). It auto-hides once the ball is safe, giving players clear feedback that their coins are about to be lost on death.

### 5. Builder UI Clutters Normal Gameplay ✅
- **Status:** FIXED. All builder elements (`.drag-bar`, `.drag-panel`, `#studio-gear-btn`) are `display: none` by default. They become visible only when `body.builder-active` is set — which happens when the Builder modal opens. `setupModal()` in `js/ui.js` toggles `builder-active` on open/close.

### 6. No Pause Functionality ✅
- **Status:** FIXED. Added `#pause-overlay` with "PAUSED" title and Resume button. `togglePause()` in `main.js` toggles `this.isPaused`, which skips `updatePhysics()` and `checkGameState()` in the `animate()` loop. Triggered by Escape key and the Resume button. Overlay has backdrop blur.

### 7. Joystick and Jump Button Always Visible on Desktop ✅
- **Status:** FIXED. Added `body.no-touch` class detection in `initControls()`: `if (!('ontouchstart' in window)) document.body.classList.add('no-touch')`. CSS rule `body.no-touch #joystick-container, body.no-touch #jump-btn { display: none; }` hides touch controls on desktop.

### 8. No Audio Controls ✅
- **Status:** FIXED. Added `#mute-btn` (🔊/🔇) in the top menu. `toggleMute()` in `main.js` sets `this.audioMuted` and persists to `localStorage`. Button state synced on load via `_syncMuteButton()`. Toast confirms mute/unmute.

---

## 🟡 Medium — Polish & Accessibility

### 9. Help Modal Is Incomplete ✅
- **Status:** FIXED. Rewritten with sections: Controls (WASD, Space, Esc, mouse orbit/zoom, mobile joystick), Goal, Shop, Tips. Includes multi-jump (3×), pause, orbit camera, mouse zoom. Builder tips included.

### 10. No Keyboard Navigation for Menus ✅
- **Status:** FIXED. Added `trapFocus()`/`untrapFocus()` in `js/ui.js` for all 6 modals (help, store, skins, skies, builder, stats, settings). `makeCardFocusable()` adds `tabindex="0"`, `role="button"`, and Enter/Space handlers to shop cards. Focus returns to opener button on close. Escape closes modals.

### 11. No ARIA Labels on Interactive Elements ✅
- **Status:** FIXED. Added `aria-label` to all menu buttons (`#mute-btn`, `#help-btn-open`, `#store-btn-open`, etc.), modals (`role="dialog"`), close buttons, joystick container (`role="application"`), jump button, and studio gear icon.

### 12. No Color-Blind Considerations ✅
- **Status:** FIXED. Added shape-based accessibility markers throughout `js/level-gen.js`:
  - **Pendulums:** Warning sphere at pivot point
  - **Spinners:** Floating diamond cone above the bar
  - **Hammers:** Diamond cone above the hammer center
  - **Movers:** Octahedron diamond markers at movement range ends
  - **Checkpoints:** Yellow beacon poles flanking the platform
  - **Finish:** Tall green pillars flanking the finish line
  - **Coins:** Geometry detail varies by value tier — 6 sides (bronze), 8 sides (silver), 24 sides (gold)

### 13. Coin Explosion on Death Looks Like Coin Spawning ✅
- **Status:** FIXED. `spawnCoinExplosion()` in `js/audio.js` handles the `'loss'` type with red/silver colors (vs. gold/bronze for collection), lower burst velocity (implosion feel), and shorter particle lifetime. The `gameOver()` call in `main.js` passes `'loss'` as the type.

---

## 🔵 Low — Nice-to-Have Improvements

### 14. No Score History / Statistics ✅
- **Status:** FIXED. Added Stats modal (`#stats-modal`) with lifetime stats: Best Level, Lifetime Coins Earned, Total Play Time, Deaths. `_renderStats()` in `main.js` populates the modal. Stats tracked in `saveData` (bestLevel, deaths, totalPlayTime, lifetimeCoins) with periodic saves every ~5s.

### 15. Progress Bar Could Be Visual ✅
- **Status:** FIXED. Added `#progress-bar-container` with `#progress-bar-fill` — a thin green gradient bar at the top of the screen. Updates every frame in `checkGameState()` based on track-direction distance projection. CSS transition for smooth fill animation.

### 16. No Transition Between Levels ✅
- **Status:** FIXED. Added `#celebration-overlay` with animated stars, "LEVEL X COMPLETE!" title (gradient text), and stats (coins, time, distance). `_showCelebration()` triggers on win. Auto-advances after 2.5s or on click/keypress. Fade-in + slide-up animations.

### 17. No Camera Sensitivity Setting ✅
- **Status:** FIXED. Added Settings modal (`#settings-modal`) with:
  - Camera Sensitivity slider (0.5×–3.0×) — applies to mouse orbit drag speed
  - Invert Vertical Orbit toggle — flips pitch direction
  - Shadow Quality toggle — switches between 2048 (High) and 1024 (Low), applies immediately
  - All settings persist in `saveData` via `localStorage`

### 18. Wolf Model Scale May Still Be Too Small ✅
- **Status:** FIXED. Increased `WOLF_SCALE` from 0.8 to 1.0 in `js/wolf-model.js`. Jack is now ~3.0 units tall — 25% larger and more visible on screen.

### 19. GIF Texture Updates Every Frame ✅
- **Status:** FIXED. Throttled to ~20fps in `animate()`: `if (now - this._lastGifUpdate > 50) { this.gifTexture.needsUpdate = true; this._lastGifUpdate = now; }`. Only updates every 50ms instead of every frame.

### 20. Shadow Map May Be Excessive for Mobile ✅
- **Status:** FIXED. Mobile detection in `initScene()`: `const isMobile = 'ontouchstart' in window && window.innerWidth < 1024`. Uses 1024×1024 on mobile, 2048×2048 on desktop. Additionally, the Settings modal lets players manually toggle quality, which overrides auto-detection.

---

## ✨ New Features Added (Not in Original Audit)

| Feature | Description |
|---|---|
| **Mouse Orbit Camera** | Drag mouse to rotate camera around Jack (yaw + pitch). Click toggles menu. R key or middle-click resets. |
| **Mouse Wheel Zoom** | Scroll to zoom camera in/out (4–20 distance range). Independently reset with R/middle-click. |
| **First-Launch Tutorial** | `#tutorial-overlay` with 4 sections (Controls, Goal, Shop, Tips) and "GOT IT" dismiss. Shown once via `tutorialSeen` flag. |
| **DRACO Model Compression** | Jack model compressed from 20.7 MB → 6.9 MB (67% reduction) using `gltf-transform` with Draco mesh + WebP textures. DRACOLoader configured on GLTFLoader. |
| **Sky Seam Fix** | Equirectangular sky textures offset by 0.45 (~162°) to hide the visible wraparound seam behind the camera. |
| **Level Generation Rewrite** | 25+level×4 segments (up to 125), alternating safe/hazard pattern, 8 segment types per tier, 5 new segment types, smooth width tapering, checkpoint every 8 segments, coin scaling with level. |
| **Track Rotation** | Entire level rotated 40° counter-clockwise around Y axis for visual variety. |
| **Settings Modal** | Camera sensitivity, invert Y orbit, shadow quality — all persistent in localStorage. |

---

## Remaining Issues (Not Yet Addressed)

| Priority | Issue | Effort |
|---|---|---|
| P1 | ✅ Pre-death coin loss warning (item #4) — players aren't warned coins are at risk | Small |
| P2 | Add "Replay Tutorial" button to Help modal | Tiny |
| P3 | Add touch pinch-to-zoom support | Medium |
| P3 | Add dynamic FOV adjustment with zoom (narrower close, wider far) | Small |

---

## Summary Scorecard

| Category | Old Score | New Score | Notes |
|---|---|---|---|
| **Onboarding** | 2/5 | **4/5** | Loading screen + tutorial + help modal done |
| **Controls** | 4/5 | **5/5** | Orbit, zoom, auto-roll, pause, mute added; touch clutter fixed |
| **Visual Feedback** | 3/5 | **5/5** | Celebration screen, progress bar, toasts, coin-loss red/silver effect all done |
| **UI Polish** | 3/5 | **4/5** | Builder hidden, settings modal, stats added |
| **Accessibility** | 1/5 | **4/5** | ARIA labels, keyboard nav, color-blind shapes, focus-visible styles done |
| **Performance** | 3/5 | **4/5** | Model 67% smaller, shadow quality toggle, GIF throttled |
| **Overall** | **3/5** | **4.5/5** | 19 of 20 original issues resolved; only minor polish remains |

---

## Priority Roadmap (Remaining)

| Priority | Item | Effort |
|---|---|---|
| P1 | Pre-death coin loss risk indicator on HUD | Small |
| P2 | Replay Tutorial button in Help modal | Tiny |
| P3 | Touch pinch-to-zoom support | Medium |
| P3 | Dynamic FOV adjustment with zoom | Small |
| P3 | See [AUDIT.md](AUDIT.md) for bugs, rendering, security, and tech debt findings | — |
