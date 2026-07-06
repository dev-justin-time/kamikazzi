---
name: Neo-Bushido Tactical
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#e4bdc2'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#ab888d'
  outline-variant: '#5b3f44'
  surface-tint: '#ffb2be'
  primary: '#ffb2be'
  on-primary: '#660026'
  primary-container: '#e0115f'
  on-primary-container: '#fff8f8'
  inverse-primary: '#bc004d'
  secondary: '#49f9f9'
  on-secondary: '#003737'
  secondary-container: '#00dddd'
  on-secondary-container: '#005c5c'
  tertiary: '#c6c6c7'
  on-tertiary: '#2f3131'
  tertiary-container: '#727373'
  on-tertiary-container: '#fafafa'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd9de'
  primary-fixed-dim: '#ffb2be'
  on-primary-fixed: '#3f0015'
  on-primary-fixed-variant: '#900039'
  secondary-fixed: '#49f9f9'
  secondary-fixed-dim: '#00dddd'
  on-secondary-fixed: '#002020'
  on-secondary-fixed-variant: '#004f4f'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-xl:
    fontFamily: Anton
    fontSize: 96px
    fontWeight: '400'
    lineHeight: 90px
    letterSpacing: -0.02em
  display-xl-mobile:
    fontFamily: Anton
    fontSize: 56px
    fontWeight: '400'
    lineHeight: 52px
  headline-lg:
    fontFamily: Anton
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 52px
  subheading:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.1em
  body-rt:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  mono-label:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.05em
  kanji-decorative:
    fontFamily: Epilogue
    fontSize: 64px
    fontWeight: '900'
    lineHeight: 64px
spacing:
  grid-margin: 40px
  gutter: 24px
  unit: 8px
  section-gap: 120px
---

## Brand & Style
The design system embodies a "Modern Japanese Cyber-Noir" aesthetic, blending the disciplined elegance of traditional calligraphy with the high-octane energy of a futuristic cockpit. The brand personality is aggressive, precise, and high-stakes, designed to evoke the adrenaline of a terminal velocity descent. 

The style merges **Brutalism** with **Glassmorphism**. It utilizes heavy structural borders and high-contrast color blocking reminiscent of traditional lacquerware, overlaid with translucent, high-tech tactical HUD elements. Atmospheric ink-wash (Sumi-e) textures provide organic depth behind razor-sharp digital components.

## Colors
The palette is rooted in **Deep Obsidian Black (#0A0A0A)**, serving as the void of the night sky. 

- **Crimson Red (#E0115F)**: The primary action color, used for "Kamikaze" branding, critical alerts, and primary buttons. It represents the "Rising Sun" and lethal intensity.
- **Electric Teal (#00DDDD)**: The secondary accent, used for HUD data, scanned lines, and futuristic interface feedback. It provides a cooling neon contrast to the heat of the red.
- **Tonal Accents**: Use 50% opacity variants of Teal for "ghost" UI elements and backdrop blurs to simulate holographic depth.

## Typography
Typography is treated as both information and texture. **Anton** provides the heavy, vertical impact required for a high-stakes racing vibe, mimicking the verticality of traditional Japanese scrolls. **Geist** offers a clean, technical contrast for readability, while **Space Mono** is utilized for tactical data readouts (coordinates, speed, fuel).

Decorative Kanji characters should be integrated into the background or behind headings at large scales, treated with a 20-30% opacity to act as textural elements rather than primary copy.

## Layout & Spacing
The layout follows a **Fluid 12-Column Grid** with wide gutters to allow the "Asanoha" (hemp leaf) patterns to breathe in the negative space. 

- **Asymmetry**: Elements should often be slightly offset or utilize "broken" layouts to evoke the movement and chaos of flight.
- **Vertical Bars**: Utilize thin, vertical Crimson lines to divide content sections, referencing the aesthetic of traditional Japanese sliding doors (Shoji) but re-imagined as laser beams.
- **Mobile**: On mobile, the 12-column grid collapses to a 4-column layout with 20px margins, emphasizing vertical scrolling and full-bleed imagery.

## Elevation & Depth
Depth is achieved through **Tactical Layering** rather than traditional drop shadows.
1. **Base Layer**: Deep Obsidian with subtle Sumi-e (ink wash) textures.
2. **Pattern Layer**: Low-opacity "Seigaiha" (wave) or "Asanoha" patterns in muted Teal.
3. **Glass Layer**: UI panels use a 10% Teal tint with a 20px backdrop blur and 1px "Electric Teal" solid borders.
4. **Overlay Layer**: Floating HUD elements, scan lines, and "glitch" artifacts that appear to sit directly against the screen.

## Shapes
The design system strictly uses **Sharp (0px)** corners to maintain a lethal, aggressive edge. Circles should only be used for "Rising Sun" motifs or radar-style HUD elements. Any container should feel like it was cut from sheet metal or folded paper (origami). Decorative "corner brackets" should be applied to cards and images to reinforce the tactical interface feel.

## Components
- **Primary Buttons**: Solid Crimson Red background with white Anton text. On hover, the button should "glitch" to Electric Teal with a slight horizontal displacement.
- **Tactical Chips**: Teal outlines with Space Mono text, used for displaying game stats (e.g., "SPEED: MACH 2").
- **Cards**: Obsidian black background, 1px Teal border, with a decorative Kanji character watermark in the bottom right corner.
- **Input Fields**: Underline-only (bottom border) in Teal, with monospaced placeholder text.
- **HUD Lists**: Lists should feature a vertical red bar on the left of the active item, with items separated by dashed teal lines.
- **Progress Bars**: Segemented blocks (reminiscent of 80s arcade UI) in Crimson, filling from left to right.