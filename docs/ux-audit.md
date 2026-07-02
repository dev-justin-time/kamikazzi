# KAMIKAZZI 3D — UX Audit Report

> **Date:** July 2026
> **Scope:** All game files, UI components, user flows, accessibility, and platform integration

---

## Summary

| Category | Score | Status |
|----------|-------|--------|
| **Visual Design** | ⭐⭐⭐⭐⭐ | Excellent tactical/HUD aesthetic |
| **Input Methods** | ⭐⭐⭐⭐⭐ | 4 modes with mode-lock + idle-release |
| **Cloud Integration** | ⭐⭐⭐⭐ | Rich Puter.js features, graceful fallback |
| **PWA Readiness** | ⭐⭐⭐ | Missing service worker, icons now fixed |
| **Accessibility** | ⭐⭐ | Limited ARIA, color-dependency, no captions |
| **Error Handling** | ⭐⭐⭐ | Silent fallbacks in many cloud paths |
| **Onboarding** | ⭐⭐⭐ | Boot sequence is great, no tutorial |
| **Performance** | ⭐⭐⭐⭐ | Well-optimized with shared geometry cache |

---

## ✅ Resolved Issues

### R1 — Missing PNG Icons
**Files affected:** `manifest.json`, `index.html`
**Issue:** `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` referenced but did not exist.
**Fix:** Generated all three from `assets/icon.svg` using sharp.

### R2 — Missing App Store Documentation
**Issue:** No guide for submitting to the Puter App Center.
**Fix:** Created `PUTER_APP_STORE.md` with submission checklist, guidelines, and flow.

### R3 — Missing Marketing Kit
**Issue:** `assets/marketing_kit.md` referenced in README but didn't exist.
**Fix:** Created with branding guidelines, screenshot list, and app descriptions.

---

## 🔴 Critical UX Issues

### C1 — No Service Worker (Offline Mode)
**Files:** `index.html`, `manifest.json`
**Severity:** High
**Issue:** Despite having a full PWA manifest with `display: standalone` and icons, there is no service worker registered. The game cannot be installed as a true PWA that works offline.
**Impact:** On mobile, users can't add to home screen as a working offline app. The manifest declares `display_override: ["standalone", "fullscreen"]` but without a service worker, browsers may not honor the install prompt.
**Recommendation:** Create a `sw.js` service worker that caches the shell (index.html, game.js, renderer.js, core Three.js dependencies) and major assets. Register it in `index.html`:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### C2 — Missing Impact Sound Asset
**Files:** `game/world/shared.js` (line: `IMPACT_SOUND_URL`), `game/world.js`
**Severity:** High
**Issue:** `IMPACT_SOUND_URL = '/assets/audio/explosion.wav'` — this file does not exist in the repo. The fallback (`airplane.wav` played as a punchy one-shot) sounds like an engine rev, not a crash impact.
**Impact:** Every crash plays the airplane engine sound as a one-shot burst, which sounds wrong and breaks immersion.
**Recommendation:** Add a proper `explosion.wav` (or `.mp3`) file to `assets/audio/`. If no real asset is available, synthesize one via Web Audio API (white noise burst with exponential decay) in `world.js#playImpact()`.

### C3 — No Delete Confirmation for Replays
**Files:** `game/ui.js` (function `doDeleteReplay`)
**Severity:** Medium-High
**Issue:** The delete button in the Replay Gallery detail view immediately deletes without any confirmation dialog.
**Impact:** A user could accidentally lose a notable run's replay with no undo.
**Recommendation:** Add a confirmation step before deletion. Use a simple `confirm()` dialog or a styled confirmation overlay matching the tactical aesthetic.

### C4 — No Visual Feedback When Puter Services Fail
**Files:** `puter-client.js`, `game/ui.js`
**Severity:** Medium
**Issue:** Most Puter API calls have empty `catch (e) { return null }` or `catch (_) {}` blocks. The user sees no indication when: leaderboard fails to load, AI image generation fails, or cloud sync fails.
**Recommendation:** Surface errors through the status text/UI elements already present (e.g., `skinStatus`, `portraitStatus`, leaderboard "Unable to load" text). Log specific error messages to console.

---

## 🟠 Moderate UX Issues

### M1 — Touch Joystick Obscures View on Small Screens
**Files:** `game/input.js`
**Issue:** The on-screen joystick is placed at `bottom: 18px; left: 14px`. On phones < 375px width, this overlaps with the bottom portion of the game canvas and may be hard to use without covering critical gameplay.
**Recommendation:** Make the joystick semi-transparent when idle (not being touched) and fully opaque when active. Reduce the knob size on very narrow viewports.

### M2 — Settings Only Accessible Via Pause Menu
**Files:** `index.html` (settings panel inside `#pauseScreen`)
**Issue:** The only way to access Settings (toggle overlays, toggle cloud sync) is to start a game, then press ESC to pause. New users who haven't started flying can't configure the game.
**Recommendation:** Add a Settings button to the start screen overlay that opens the same settings panel. Consider persisting settings choices more prominently.

### M3 — Briefings Input Has No Character Limit
**Files:** `index.html` (`#briefingInput`)
**Issue:** The briefing text input accepts unlimited text. Very long briefings could cause issues with localStorage size limits (typically 5-10MB) and the AI chat API token limits.
**Recommendation:** Add `maxlength="200"` to the input and show a character counter.

### M4 — No Keyboard Shortcuts Visibility
**Files:** `game/ui.js`, `index.html`
**Issue:** The ESC key handler is comprehensive (closes panels, skips explosion, toggles pause), but there is no visible indication of available keyboard shortcuts anywhere.
**Recommendation:** Add a "?" or "⌨" button next to the burger emoji that shows a keyboard shortcuts overlay (ESC: Pause, ESC: Skip crash, ESC: Close panels).

### M5 — No Auto-Save Indicator
**Files:** `game/ui.js`, `game/world.js`
**Issue:** When a notable run ends and `saveReplay()` is called, there's no visual indicator that the replay is being saved. The transition from game-over to the Mission Terminated screen happens immediately, and the save is fire-and-forget.
**Recommendation:** Show a small "Saving replay..." indicator (maybe a pulsing dot) in the telemetry panel while the async save is in progress.

### M6 — Graffiti Decals Load Asynchronously
**Files:** `game/world/buildings.js` (`buildFace` function)
**Issue:** Graffiti decal textures are loaded via `loadTexture().then()` — if the image is slow to load, it may appear on the building after it has already passed the camera, wasting the GPU upload.
**Recommendation:** Preload all graffiti textures at world-init (similar to how `bgTextures` are preloaded in `world.js`) so decals are ready when the building spawns.

---

## 🟡 Minor UX Issues

### m1 — Burger Emoji Has No Interactive Purpose
**File:** `index.html`
**Issue:** The 🍔 emoji at the top-right is decorative and bobs via CSS animation, but has no click handler or tooltip explaining what it does. It's not referenced anywhere in the JavaScript.
**Recommendation:** Either give it a fun interaction (click counter, developer easter egg toggle) or remove it to avoid user confusion.

### m2 — Pilot Portrait is Not Displayed in HUD
**File:** `game/ui.js`
**Issue:** The Skin Lab generates and saves a pilot portrait (`kamikazziPilotPortrait`), but the portrait is never displayed in the HUD or user badge. The avatar URL from Puter is shown, but a generated portrait is not.
**Recommendation:** Display the generated pilot portrait in the user badge area when no Puter avatar is available.

### m3 — No FPS / Performance Monitor
**Files:** All
**Issue:** On lower-end devices, the game may struggle with 60 FPS. There's no way for the user or developer to see frame rate or performance metrics.
**Recommendation:** Add a hidden `#fpsCounter` element that can be toggled with a key combo (e.g., Ctrl+F) showing FPS, draw calls, and triangle count.

### m4 — Explosion GIF Preload Fires on Import
**File:** `game/world/shared.js`
**Issue:** The module-level `new Image()` preload for `explode.gif` fires as soon as the module is imported, even if the user never crashes. On low-bandwidth connections, this wastes data.
**Recommendation:** Defer the preload to after the first game start or use `IntersectionObserver`/`requestIdleCallback`.

### m5 — China City Filename Has Space + Parentheses
**File:** `game/world/shared.js`
**Issue:** `LEVEL_BACKGROUNDS` includes `/assets/image/China City (1).jpeg` — spaces and parentheses in filenames can cause issues on some web servers and tooling.
**Recommendation:** Rename to `china-city-1.jpeg` for consistency and reliability.

### m6 — Auto-Pause on Tab Hidden Shows No Banner
**File:** `game/ui.js` (visibilitychange handler)
**Issue:** When the user switches tabs, the game auto-pauses and the pause screen overlay appears. But if the user comes back to the tab after several minutes, there's no indicator of "YOU WERE AWAY" duration.
**Recommendation:** Show a brief "Away" notification in the pause panel with time elapsed.

---

## 📊 Accessibility Audit

| Criterion | Status | Notes |
|-----------|--------|-------|
| ARIA labels on buttons | ❌ | Most buttons lack `aria-label` |
| Keyboard navigation | ⚠️ | ESC works, but Tab navigation isn't tested |
| Screen reader support | ❌ | Start screen text is readable, but live score updates aren't announced |
| Color contrast | ✅ | High contrast tactical aesthetic |
| Font size scaling | ⚠️ | Uses `clamp()` which is good, but some text is very small (10px) |
| Motion sensitivity | ⚠️ | Crash screen shake animation could trigger vestibular issues |
| Touch target sizes | ✅ | Buttons use `min-height: 44px` effectively |

---

## 🚀 Recommendations by Priority

### Immediate (Before App Store Submission)
1. Create service worker (`sw.js`) for true PWA offline support
2. Add proper crash impact sound file to `assets/audio/`
3. Add delete confirmation dialog for replays
4. Fix missing icons ✅ *(already done)*

### Short-term (Next Sprint)
5. Move Settings to start screen (duplicate or relocate)
6. Add character limit to Briefings input
7. Make joystick semi-transparent when idle
8. Surface Puter API errors to user

### Long-term
9. Add keyboard shortcuts overlay
10. Preload graffiti decals at world-init
11. Add FPS counter for debugging
12. Display pilot portrait in HUD
13. Add away-time display on pause screen

---

*This audit was generated by reviewing all game source files, UI components, and user flows in the Kamikazzi 3D codebase.*
