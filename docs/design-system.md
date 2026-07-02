---
name: Aero-Tactical HUD
colors:
  surface: '#001525'
  surface-dim: '#001525'
  surface-bright: '#243b4f'
  surface-container-lowest: '#000f1d'
  surface-container-low: '#031d30'
  surface-container: '#072134'
  surface-container-high: '#142c3f'
  surface-container-highest: '#1f374a'
  on-surface: '#cde5fe'
  on-surface-variant: '#bec7d4'
  inverse-surface: '#cde5fe'
  inverse-on-surface: '#1b3345'
  outline: '#88919d'
  outline-variant: '#3f4852'
  surface-tint: '#98cbff'
  primary: '#98cbff'
  on-primary: '#003354'
  primary-container: '#00a3ff'
  on-primary-container: '#00375a'
  inverse-primary: '#00629d'
  secondary: '#96cbff'
  on-secondary: '#003353'
  secondary-container: '#004d79'
  on-secondary-container: '#88bdf1'
  tertiary: '#00dddd'
  on-tertiary: '#003737'
  tertiary-container: '#00aeae'
  on-tertiary-container: '#003b3b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#cfe5ff'
  primary-fixed-dim: '#98cbff'
  on-primary-fixed: '#001d33'
  on-primary-fixed-variant: '#004a77'
  secondary-fixed: '#cee5ff'
  secondary-fixed-dim: '#96cbff'
  on-secondary-fixed: '#001d33'
  on-secondary-fixed-variant: '#004a76'
  tertiary-fixed: '#00fbfb'
  tertiary-fixed-dim: '#00dddd'
  on-tertiary-fixed: '#002020'
  on-tertiary-fixed-variant: '#004f4f'
  background: '#001525'
  on-background: '#cde5fe'
  surface-variant: '#1f374a'
typography:
  display-lg:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  headline-md:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.5'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.1em
  telemetry-num:
    fontFamily: JetBrains Mono
    fontSize: 20px
    fontWeight: '800'
    lineHeight: '1'
spacing:
  grid-unit: 4px
  gutter: 16px
  margin-mobile: 12px
  margin-desktop: 32px
  safe-area: 24px
---

## Brand & Style

The visual identity is rooted in a **Tactical HUD / Industrial** aesthetic, mimicking a high-performance flight telemetry system. It is designed to evoke precision, urgency, and immersion. The system prioritizes data density and technical clarity, utilizing a monochromatic "blueprint" foundation.

The style leverages **sharp vector borders**, **scanning line overlays**, and **glowing cyan accents** to create a sense of depth and electronic luminescence. The interface is not merely a container but a piece of functional military-grade equipment, featuring "readouts" rather than standard labels. The emotional response is one of authority and high-stakes technological control.

## Colors

The palette is strictly monochromatic with varying luminosities of blue. 

- **Primary (#00A3FF):** Used for active data, primary borders, and focused telemetry.
- **Secondary (#004D7A):** Used for structural elements, inactive grids, and background containers.
- **Tertiary/Accent (#00FFFF):** A high-intensity cyan reserved for "glow" effects, target locks, and critical system status.
- **Neutral/Background (#001A2C):** The deep midnight base of the HUD, providing the necessary contrast for additive light effects.
- **Alert:** A high-contrast red is reserved for emergency warnings or critical "missile lock" indicators.

## Typography

Typography is exclusively monospaced to reinforce the industrial, computer-generated readout feel. **JetBrains Mono** is utilized for its high legibility in dense data environments and its technical character.

Headlines should use heavy weights and slight tracking adjustments to mimic printed military designations. Body text and "telemetry" readouts must use **tabular figures** to ensure that changing numerical values (like altitude or speed) do not cause horizontal layout shifts. All labels are strictly uppercase.

## Layout & Spacing

The layout follows a **Fixed HUD Grid** model. Content is anchored to the corners and edges of the screen to keep the "center of vision" clear for 3D flight action. 

- **Grid Overlay:** A 32px global grid should be subtly visible in the background using a 5% opacity primary color stroke.
- **Corner Anchoring:** System status, mission time, and pilot vitals are fixed to the corners using the `safe-area` margin.
- **Telemetry Columns:** Data readouts are organized into narrow, vertically stacked columns with consistent 4px spacing between line items.
- **Mobile Reflow:** On smaller screens, the corner elements compress into a simplified top/bottom bar, removing decorative vector flourishes to maintain readability.

## Elevation & Depth

Depth is achieved through **additive light** and **layer transparency** rather than shadows.

- **Background Layer:** Deep `#001A2C` base with a static "scanline" pattern (1px horizontal lines with 50% transparency).
- **Mid Layer:** Tactical grids and wireframe terrain rendered in semi-transparent `#004D7A`.
- **Foreground Layer:** Active UI borders, text readouts, and the reticle.
- **Glow Effects:** Use `drop-shadow` or `box-shadow` with a 0px offset and 4-8px blur in Cyan (#00FFFF) to simulate the glow of a CRT or high-end projected HUD.

## Shapes

The design system utilizes **zero roundedness**. All corners are sharp, 90-degree angles to maintain a brutalist, industrial aesthetic.

To add visual interest, "clipped corners" (45-degree chamfers) are used for buttons and primary container frames. This geometric cutting mimics military hardware and vector-based flight computer graphics.

## Components

- **HUD Frames:** Use 1px solid Primary borders. Add "bracket" corners (L-shaped accents) that are thicker (2px) than the main frame.
- **Telemetry Readouts:** Labels appear in `label-caps` in Secondary blue, while the values appear in `telemetry-num` in Primary blue or Cyan.
- **Action Buttons:** Octagonal or chamfered shapes. Default state is a ghost border; active state is a full Cyan fill with black text.
- **Scanning Lines:** A horizontal bar with a gradient trail that periodically moves from the top to the bottom of the screen at low opacity.
- **Progress Bars / Gauges:** Vertical or horizontal segmented bars (boxes rather than a solid line) to show fuel, throttle, or health.
- **Target Reticle:** A dynamic central component with crosshairs that flicker or rotate slightly to indicate "Systems Live" status.