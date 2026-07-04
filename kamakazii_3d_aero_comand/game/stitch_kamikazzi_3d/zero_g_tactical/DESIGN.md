---
name: Zero-G Tactical
colors:
  surface: '#061423'
  surface-dim: '#061423'
  surface-bright: '#2d3a4b'
  surface-container-lowest: '#020f1e'
  surface-container-low: '#0e1c2c'
  surface-container: '#132030'
  surface-container-high: '#1d2b3b'
  surface-container-highest: '#283646'
  on-surface: '#d5e4f9'
  on-surface-variant: '#e5bdb8'
  inverse-surface: '#d5e4f9'
  inverse-on-surface: '#243142'
  outline: '#ac8884'
  outline-variant: '#5c403c'
  surface-tint: '#ffb4aa'
  primary: '#ffb4aa'
  on-primary: '#690004'
  primary-container: '#c01818'
  on-primary-container: '#ffd2cd'
  inverse-primary: '#bc1416'
  secondary: '#ffffff'
  on-secondary: '#003737'
  secondary-container: '#00fbfb'
  on-secondary-container: '#007070'
  tertiary: '#e1c471'
  on-tertiary: '#3d2f00'
  tertiary-container: '#c4a959'
  on-tertiary-container: '#4f3d00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930008'
  secondary-fixed: '#00fbfb'
  secondary-fixed-dim: '#00dddd'
  on-secondary-fixed: '#002020'
  on-secondary-fixed-variant: '#004f4f'
  tertiary-fixed: '#ffe08a'
  tertiary-fixed-dim: '#e1c471'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574400'
  background: '#061423'
  on-background: '#d5e4f9'
  surface-variant: '#283646'
typography:
  display-xl:
    fontFamily: Stick No Bills
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: 0.05em
  headline-lg:
    fontFamily: Stick No Bills
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Stick No Bills
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.5'
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  body-jp:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
spacing:
  edge-margin: 2rem
  hud-gutter: 1rem
  bracket-padding: 0.5rem
  stack-gap: 1.5rem
---

## Brand & Style
This design system captures a high-velocity, high-stakes tactical flight environment. The aesthetic fuses "Warbird Industrial"—weathered, mechanical, and heavy—with "Cyber-Tokyo HUD"—sharp, digital, and luminous. 

The personality is aggressive, technical, and urgent. The UI should evoke the feeling of a pilot looking through a sophisticated targeting computer while flying a machine that is barely holding together. 

**Design Style: Industrial Cyber-Brutalism**
- **Tactical Overlays:** Use scanlines, chromatic aberration on edges, and persistent grid backgrounds to simulate a physical cathode-ray flight display.
- **Glassmorphism:** HUD elements utilize high-intensity backdrop blurs to maintain legibility against chaotic, fast-moving 3D environments.
- **Weathered Textures:** While UI elements are digital, container backgrounds should feel like brushed duralumin or reinforced carbon fiber.

## Colors
The palette is built on extreme contrast to ensure visibility during high-G maneuvers.

- **Primary (Kamikaze Red):** Reserved for critical warnings, structural damage, and "Kill" indicators.
- **Secondary (Cyber Cyan):** The standard "Safe" HUD state. Used for friendly units, crosshairs, and primary flight data.
- **Tertiary (Neon Yellow):** Used for mission objectives, tactical alerts, and high-importance data points.
- **Neutral (Deep Void Blue):** The foundation for all deep-space or night-flight UI backing.
- **Accents:** Sun-orange is used for heat signatures and engine thrust levels, while tactical blue handles secondary telemetry and navigational waypoints.

## Typography
The typography system prioritizes immediate data recognition and "signs of the times" propaganda aesthetics.

- **Headlines (Stick No Bills):** Used for mission titles, "WASTED" screens, and heavy industrial signage. Always uppercase.
- **Data (JetBrains Mono):** Used for all numerical readouts (Altitude, Velocity, G-Force). It conveys a technical, machine-read precision.
- **Subtitles (Noto Sans JP):** Provides a dual-language aesthetic essential to the neo-Tokyo theme. Use for secondary flavor text and pilot transmissions.
- **Labels:** Small, monospaced caps used for "technical metadata" surrounding buttons and frames.

## Layout & Spacing
The layout follows a **HUD-centric Fluid Grid**. Critical information is clamped to the corners of the viewport (safe areas) using "brackets," while the center remains clear for targeting.

- **The Crosshair Center:** All UI elements must maintain a 20% radial clearance from the screen center to ensure the flight path is visible.
- **Tactical Brackets:** Content should be framed in L-shaped corner brackets rather than full boxes to reduce visual clutter.
- **Responsive Reflow:** On mobile, the UI compresses telemetry into a singular top bar, while desktop utilizes the full horizontal periphery for expanded engine and weapon diagnostics.

## Elevation & Depth
Depth is not achieved through shadows, but through **Optical Layering and Glow**.

- **Level 1 (Background):** The 3D world.
- **Level 2 (Interface Grid):** A semi-transparent 1px scanline or grid texture that sits over the entire screen.
- **Level 3 (HUD Glass):** Semi-transparent containers (`rgba(0, 11, 26, 0.6)`) with a `20px` backdrop-filter blur.
- **Level 4 (Active Elements):** High-intensity neon glows (`drop-shadow`) on text and icons in Cyan or Red to simulate light emission from the pilot's goggles.

## Shapes
The shape language is strictly **Sharp (0)**. 

Curves are non-existent in this system to maintain a rugged, military-spec feel. Use 45-degree chamfered corners for buttons and panels to imply armored plates. Every frame should appear "bolted" or "welded," utilizing small 1px "screw" icons at the corners of larger containers.

## Components
- **Buttons:** Use 45-degree clipped corners. Default state is a cyan outline. On hover, the button fills with cyan and the text knocks out to deep blue.
- **Targeting Brackets:** Four L-shaped corners that pulse when locked onto a target. Friendly = Cyan; Hostile = Red.
- **Status Bars (Health/Fuel):** Segmented bars rather than solid fills. Each segment represents 5% of the total capacity.
- **Input Fields:** Styled as "Command Line" entries. Use a flickering underscore cursor (`_`) to indicate focus.
- **Chips/Badges:** Small monospaced tags with a background color matching the priority level (Red for "Danger", Blue for "Info").
- **Scanlines:** A global overlay component with a repeating linear-gradient that moves vertically at a very slow speed (0.5s duration) to simulate a refresh rate.