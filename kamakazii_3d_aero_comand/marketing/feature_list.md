# KAMIKAZZI 3D — Feature List

---

## Core Gameplay

- [x] WWI biplane flight through procedurally generated city canyon
- [x] Mouse/touch steering — drag to bank, climb, and dive
- [x] 8 escalating sectors with level-gated base speeds
- [x] Gentle within-level speed ramp for natural tension
- [x] Building collision = crash and game over
- [x] Near-miss system: graze buildings to trigger bullet-time slow-mo
- [x] Per-building near-miss cooldown — each building can independently trigger slow-mo
- [x] Score accumulates based on distance flown + building pass bonuses
- [x] Mission Success at 5,000 points (Grade A)
- [x] S-rank requires 10,000 points
- [x] Final Sector (Level 8) — dramatic atmosphere tint + HUD announcement

## Powerups (6 Types)

| Type | Effect | Duration |
|---|---|---|
| Shield | Invincible through buildings | 3s |
| Boost | 1.5× speed surge | 4s |
| Magnet | Pulls distant pickups toward you | 5s |
| 2× Score | Double points | 6s |
| Slow-mo | Bullet-time precision | 3s |
| Stamina | Refresh near-miss slow-mo window | 1.2s (one-shot) |

- Round-robin spawn cycle ensures variety each run
- Storm/cascade mode doubles powerup spawns (6 instead of 3)
- HUD chip strip shows active powerups with remaining seconds
- Synthesised audio tones + optional WAV files for each type

## AI Skin Lab

- [x] Generate custom plane textures from text prompts
- [x] Generate custom pilot portraits from text prompts
- [x] 14 style presets:
  - Kamikaze Red (default)
  - Cyberpunk Night
  - Arctic Frost
  - Neon Sun
  - Wasteland
  - Digital Rain
  - Chrome Beast
  - Steampunk Brass
  - Bioluminescent
  - Pixel Art
  - Origami Paper
  - + 3 more legacy presets
- [x] Prompt preview showing expanded template before generation
- [x] Negative prompt generation for better AI results
- [x] Style preset persistence in localStorage
- [x] Building Palette Generator — AI-generated city color themes
- [x] 14 building palette templates matching skin presets
- [x] Color extraction from generated images — samples 7 dominant colors
- [x] Custom building skin saved to localStorage and visible in Marketplace

## Building Marketplace

- [x] 6 unlockable building skin themes
- [x] Unlock via score thresholds (500 / 1,000 / 1,500 / 2,000 / 3,000 pts)
- [x] Custom generated skins appear automatically in the list
- [x] Gradient palette preview per skin
- [x] Active skin indicator

## Levels & Environment

- [x] 8 photographic background images (city skylines)
- [x] Shuffled order each run for variety
- [x] Day / night / dusk / dawn modes driven by player briefings
- [x] Special tints (mint, neon, rose) from briefing keywords
- [x] Final sector blood-red atmosphere tint
- [x] Storm cascade mode — doubles powerup spawns
- [x] Cloud drift animation (even on start screen)
- [x] Ground strip scrolling for speed feedback
- [x] Fog system (day and night variants)

## Plane

- [x] Stylized WWI biplane GLB model with procedural fallback
- [x] Propeller HUD-lock — pinned to bottom of viewport regardless of camera
- [x] Engine sound (airplane.wav loop)
- [x] Impact explosion sound
- [x] Skin texture application — maps to fuselage and wings, skips cockpit glass

## Crash Sequence

- [x] 3 sequential explosion GIF plays (~5.4s total)
- [x] CSS shake + flash overlay per explosion play
- [x] 3D particle burst in lockstep with GIF plays (3 staggered stages)
- [x] Warm-orange → amber → smoke-grey color progression
- [x] ESC to fast-forward through crash sequence
- [x] Mission Terminated screen with telemetry (score, sector, distance, altitude, time)
- [x] Mission Success screen with telemetry + grade display

## Multiplayer

- [x] Puter Room-based presence system
- [x] Real-time lobby showing other pilots
- [x] Status indicators (In Lobby / In Game / Away)
- [x] Score-based sorting
- [x] Peer markers in 3D scene (username-colored cylinders)
- [x] Slerp-interpolated peer position updates
- [x] Quick Match button — finds other available players
- [x] Websim BroadcastChannel fallback

## Replays & History

- [x] Notable runs auto-saved (new best, mission success, score ≥ 3,000)
- [x] Screenshot capture on notable runs
- [x] Replay detail view with full telemetry
- [x] Delete individual replays with confirmation dialog
- [x] Run history with per-run details
- [x] Player profile with analytics:
  - Score trend chart (last 10 runs)
  - Grade distribution
  - Level reached breakdown
  - Win rate, total distance, flight time
  - Streak tracking

## Cloud Integration (Puter.js)

- [x] High score sync across devices
- [x] Leaderboard with weekly / monthly / all-time periods
- [x] Run history persistence
- [x] Settings sync (overlays, cloud sync toggle)
- [x] Game snapshot system — pause auto-saves, resume cross-device
- [x] Cloud settings load on boot
- [x] User badge with avatar

## Community Features

- [x] Briefings system — submit ideas that can modify gameplay
- [x] AI-powered game config from player briefings
- [x] Community Powerup Registry — submit and vote on custom powerup designs
- [x] Color picker with preset swatches

## Localization

- [x] 6 languages: English, Deutsch, Español, Français, 日本語, 中文
- [x] Full UI localization including boot messages, legal docs, and HUD
- [x] Language picker in settings

## Boot & Onboarding

- [x] 10-step animated boot sequence with progress bar
- [x] Status messages in all 6 languages
- [x] Start screen with server / client version display
- [x] Legal consent system (GDPR / CCPA / COPPA)
- [x] Resume Run button for saved snapshots
- [x] Keyboard shortcuts overlay

## Settings & Accessibility

- [x] Scanline overlay toggle
- [x] Grid overlay toggle
- [x] Persistent overlay settings
- [x] Cloud sync toggle
- [x] TTS (text-to-speech) for powerup pickups
- [x] ARIA labels throughout UI
- [x] Keyboard navigation for panels

## Technical

- [x] Three.js 3D renderer (r128)
- [x] ES modules throughout
- [x] Shared geometry/material cache with skip-shared dispose
- [x] Level-gated speed system (SPEED_PER_LEVEL array)
- [x] Service Worker for offline-capable loading
- [x] PWA manifest
- [x] Responsive design (mobile + desktop)
- [x] `<meta name="viewport">` with user-scalable=no for game input
