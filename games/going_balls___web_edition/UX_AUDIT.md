# UX Audit Report — Going Balls: Web Edition

**Audited:** July 11, 2026  
**Scope:** Full gameplay loop — onboarding, controls, visual feedback, UI, performance, accessibility  
**Files reviewed:** `main.js`, `index.html`, `css/style.css`, `js/ui.js`, `js/audio.js`, `js/wolf-model.js`, `js/level-gen.js`, `js/track-builder.js`, `js/studio.js`, `js/ball-skins.js`

---

## Executive Summary

Going Balls: Web Edition is a feature-rich 3D platformer with polished core mechanics (physics, camera, level generation, shop system, track builder, item studio). However, several UX gaps reduce first-time player engagement and long-term polish. Issues are grouped by severity.

---

## 🔴 Critical — Immediate Player-Facing Issues

### 1. No Loading / Splash Screen
- The game jumps straight into the 3D scene with no visual indication that assets are loading.
- The wolf model is **18 MB** (GLTF 8.6 MB + bin 9.6 MB + textures). On slow connections this can take 10–30 seconds, during which the player sees only a **fallback sphere** and may assume the game is broken.
- **Impact:** High first-session abandonment.
- **Recommendation:** Add a splash/loading overlay with a progress bar that tracks GLTFLoader progress (`progress.loaded / progress.total`). Remove the overlay only after the wolf model fires its `onLoad` callback.

### 2. Purchase Failure Is Silent
- `handlePurchase()` in `js/ui.js` silently fails when the player has insufficient coins — the grid re-renders showing unchanged funds with no toast, shake, or error message.
- **Impact:** Players may think the button is broken.
- **Recommendation:** Show a brief "Not enough coins!" toast or flash the wallet counter red.

### 3. "Distance" and "Progress" Labels Are Confused
- `index.html` shows `Progress: 0%` in the HUD, but `checkGameState()` writes `Distance: ${progress}%` to the same element.
- On reset, `reset()` writes `Coins: 0` to `#coin-display`, but the initial HTML says `Session: 0`.
- **Impact:** Inconsistent text creates confusion about what's being tracked.
- **Recommendation:** Standardize labels — pick either "Distance" or "Progress", and either "Session" or "Coins".

---

## 🟠 High — Reduces Engagement / Polish

### 4. Coin Loss on Death Is Punishing Without Warning
- `gameOver(false)` subtracts the entire session score from `totalCoins` and triggers a coin-explosion effect. There's no visual cue *before* death that coins are at risk.
- **Impact:** Players lose progress unexpectedly, which is frustrating in a casual game.
- **Recommendation:** Show a subtle "Keep your coins!" warning near coin-heavy sections, or add a risk/reward indicator on the HUD.

### 5. Builder UI Clutters Normal Gameplay
- Four drag bars (`#top-bar`, `#bottom-bar`, `#left-panel`, `#right-panel`) and the studio gear icon are always visible — even during normal play.
- **Impact:** Visual noise for the 95% of time the player isn't building.
- **Recommendation:** Hide all builder elements by default. Show them only when the Builder modal is open or when `inBuilderScene` is active. Add a small toggle in the top menu.

### 6. No Pause Functionality
- There is no way to pause the game. Clicking anywhere toggles the top menu (which auto-hides after 4 seconds), but physics keeps running.
- **Impact:** Players can't step away without losing progress.
- **Recommendation:** Add a pause overlay triggered by Escape or a pause button. Freeze `world.step()` and the animation loop while paused.

### 7. Joystick and Jump Button Always Visible on Desktop
- `#joystick-container` and `#jump-btn` are rendered at all times with `pointer-events: auto`, even on desktop where WASD/mouse controls are used.
- **Impact:** Visual clutter, accidental clicks.
- **Recommendation:** Detect desktop vs. mobile via `'ontouchstart' in window` or pointer type and hide touch controls on desktop. Show them only on touch devices.

### 8. No Audio Controls
- No volume slider or mute button exists. Sound effects play at a fixed `0.4` volume.
- **Impact:** Players in shared spaces have no way to quiet the game.
- **Recommendation:** Add a speaker icon in the top menu that toggles audio. Store preference in `localStorage`.

---

## 🟡 Medium — Polish & Accessibility

### 9. Help Modal Is Incomplete
- The help text says "Press T to toggle mouse lock" but T actually *exits* pointer lock. No instructions for jump (Space), multi-jump (3x), or the shop system.
- **Recommendation:** Rewrite the help modal with sections: Controls, Goal, Shop, Builder, Tips.

### 10. No Keyboard Navigation for Menus
- Modals (Store, Skins, Skies, Builder, Help) are mouse/touch-only. No Tab/Enter navigation.
- **Impact:** Inaccessible for keyboard-only and screen-reader users.
- **Recommendation:** Add `tabindex`, `role="dialog"`, and focus trapping when modals open.

### 11. No ARIA Labels on Interactive Elements
- Buttons like `?`, `STORE`, `SKINS`, `SKIES`, `BUILDER` have no `aria-label`. The joystick container has no accessibility semantics.
- **Recommendation:** Add `aria-label` to all buttons and `role="application"` to the joystick container.

### 12. No Color-Blind Considerations
- Coins are gold, hazards are red, checkpoints are cyan, finish is green. These rely entirely on hue.
- **Impact:** ~8% of males have red-green color blindness and may confuse hazards with coins.
- **Recommendation:** Add icon overlays (⚠ for hazards, ✦ for checkpoints) or use a high-contrast palette option.

### 13. Coin Explosion on Death Looks Like Coin Spawning
- The visual effect when losing coins uses the same `spawnCoinExplosion()` as collecting coins, just in reverse context.
- **Impact:** Players may think they're *gaining* coins when they die.
- **Recommendation:** Use a different color (red/silver) or an implosion effect for coin loss.

---

## 🔵 Low — Nice-to-Have Improvements

### 14. No Score History / Statistics
- There's no way to see best level reached, total coins earned lifetime, or time played.
- **Recommendation:** Add a simple stats panel in the Store modal or a dedicated Stats button.

### 15. Progress Bar Could Be Visual
- Distance is shown as a text percentage. A visual progress bar (thin bar at top of screen) would be more intuitive and satisfying.
- **Recommendation:** Add a CSS progress bar that fills as the player advances.

### 16. No Transition Between Levels
- Completing a level jumps straight to the next with no celebration or transition.
- **Recommendation:** Add a 1–2 second "Level Complete" animation with stats (coins collected, time, distance) before advancing.

### 17. No Camera Sensitivity Setting
- The side-scrolling camera lerp speed is hardcoded at `0.15`.
- **Recommendation:** Expose a camera sensitivity slider in Settings.

### 18. Wolf Model Scale May Still Be Too Small
- At `WOLF_SCALE = 0.8`, the wolf is ~2.4 units tall. From the side camera at 14 units away, this may still be small on mobile screens.
- **Recommendation:** Test on actual mobile devices and potentially increase to `1.0`–`1.2`.

### 19. GIF Texture Updates Every Frame
- `this.gifTexture.needsUpdate = true` runs every frame regardless of whether the GIF has advanced.
- **Impact:** Minor GPU overhead.
- **Recommendation:** Only set `needsUpdate` when the browser has actually decoded a new GIF frame (check `gifImage.complete` timestamp or use a frame counter).

### 20. Shadow Map May Be Excessive for Mobile
- Shadow map is 2048×2048 with `PCFSoftShadowMap`. On low-end mobile GPUs this can cause frame drops.
- **Recommendation:** Detect device pixel ratio / GPU tier and use 1024×1024 on mobile.

---

## Summary Scorecard

| Category | Score | Notes |
|---|---|---|
| **Onboarding** | 2/5 | No loading screen, no tutorial, help modal incomplete |
| **Controls** | 4/5 | Solid WASD + joystick + mobile layout, minor clutter |
| **Visual Feedback** | 3/5 | Dust particles and footsteps are good; coin feedback and death feedback need work |
| **UI Polish** | 3/5 | Clean shop grid, but builder clutter and missing error states |
| **Accessibility** | 1/5 | No ARIA, no keyboard nav, no color-blind support |
| **Performance** | 3/5 | 18MB model is the bottleneck; otherwise well-optimized |
| **Overall** | **3/5** | Strong foundation, needs polish passes on onboarding, feedback, and accessibility |

---

## Priority Roadmap

| Priority | Item | Effort |
|---|---|---|
| P0 | Loading screen with progress bar | Small |
| P0 | Purchase failure toast | Small |
| P0 | Fix label inconsistencies (Session/Distance) | Tiny |
| P1 | Pause functionality | Medium |
| P1 | Hide builder UI during normal play | Small |
| P1 | Hide touch controls on desktop | Small |
| P1 | Volume/mute control | Small |
| P2 | Rewrite help modal | Small |
| P2 | Coin-loss visual feedback (different from coin-gain) | Small |
| P2 | ARIA labels + keyboard nav for modals | Medium |
| P3 | Progress bar UI | Small |
| P3 | Level transition animation | Medium |
| P3 | Stats panel | Medium |
