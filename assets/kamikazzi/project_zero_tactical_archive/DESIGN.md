---
name: 'Project: Zero Tactical Archive'
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
  on-surface-variant: '#e3beb8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#aa8984'
  outline-variant: '#5a403c'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690000'
  primary-container: '#8b0000'
  on-primary-container: '#ff907f'
  inverse-primary: '#b52619'
  secondary: '#d2c5b1'
  on-secondary: '#372f21'
  secondary-container: '#4e4636'
  on-secondary-container: '#c0b3a0'
  tertiary: '#bfc7d1'
  on-tertiary: '#293139'
  tertiary-container: '#3b434b'
  on-tertiary-container: '#a7b0b9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#920703'
  secondary-fixed: '#efe1cc'
  secondary-fixed-dim: '#d2c5b1'
  on-secondary-fixed: '#211b0e'
  on-secondary-fixed-variant: '#4e4636'
  tertiary-fixed: '#dbe3ed'
  tertiary-fixed-dim: '#bfc7d1'
  on-tertiary-fixed: '#151c23'
  on-tertiary-fixed-variant: '#40484f'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  display-lg:
    fontFamily: Anton
    fontSize: 72px
    fontWeight: '400'
    lineHeight: '1.0'
    letterSpacing: 0.05em
  headline-lg:
    fontFamily: Anton
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Anton
    fontSize: 24px
    fontWeight: '400'
    lineHeight: '1.2'
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-stamped:
    fontFamily: Courier Prime
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1.4'
  data-log:
    fontFamily: Courier Prime
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
spacing:
  unit: 4px
  gutter: 24px
  margin: 32px
  container-max: 1280px
---

## Brand & Style
This design system reimagines the Neo-Bushido aesthetic through a mid-century military intelligence lens. The personality is **Gritty, Archival, and Industrial**, evoking the atmosphere of a clandestine 1944 aerospace hangar. It balances the precision of tactical instrumentation with the visceral, weathered textures of wartime machinery.

The visual style is a fusion of **Brutalism** and **Tactile Industrialism**. It utilizes high-contrast but low-luminance values to simulate light reflecting off cold steel and aged vellum. The interface should feel like a classified dossier—stamped, stencilled, and mechanically assembled. Key characteristics include heavy structural borders, grainy overlays, and a strict adherence to functional hierarchy typical of military field manuals.

## Colors
The palette is desaturated and weighted heavily toward low-luminance tones to maintain a "Top Secret" atmosphere.

*   **Obsidian Black (#0F0F0F):** The foundational base, representing the deep shadows of a midnight hangar.
*   **Worn Blood Red (#8B0000):** Used for critical alerts, primary actions, and "Hinomaru" inspired accents. It should feel like dried pigment on metal.
*   **Sepia Bone (#D2C5B1):** The primary color for text and data, mimicking the tone of aged technical blueprints and weathered paper.
*   **Oxidized Steel (#4A525A):** Used for structural elements, containers, and secondary UI components to provide a cold, metallic contrast.

## Typography
The typography system relies on the tension between authoritative propaganda and technical documentation.

*   **Headlines (Anton):** Used for major section titles and impactful numbers. This font should be treated like a stencil on a fuselage—bold, vertical, and commanding.
*   **Body (IBM Plex Sans):** Provides modern readability for long-form reports and intelligence logs, ensuring the "industrial" feel remains functional.
*   **Labels & Logs (Courier Prime):** Reserved for technical data, metadata, and status indicators. This mimics a typewriter's output, suggesting a manual, time-stamped process. Use `text-transform: uppercase` for labels to enhance the military feel.

## Layout & Spacing
The layout follows a **Rigid Grid** philosophy, mirroring mechanical engineering drawings. 

*   **Grid System:** A 12-column grid for desktop with fixed 24px gutters. Elements should align strictly to these columns to create a sense of structural integrity.
*   **Spacing Rhythm:** Use a 4px base unit. Large sections are separated by 32px or 48px to allow for "breathing room" in an otherwise dense, data-heavy environment.
*   **Responsiveness:** On mobile, the layout collapses to a 1-column stack. Margins reduce to 16px. Typography scales down specifically for the `display` and `headline` roles to ensure no clipping occurs on smaller screens.

## Elevation & Depth
In this system, depth is conveyed through **Material Layering** rather than light and shadow.

*   **Tonal Layers:** The background is the deepest level (Obsidian). Containers (Oxidized Steel) sit above this, separated by 1px solid borders in Sepia Bone at low opacity (15%).
*   **Metallic Weathering:** UI surfaces should utilize a noise texture overlay (approx. 5% opacity) to simulate grainy film or brushed metal. 
*   **Static/Low Contrast:** Avoid soft drop shadows. Use hard, 1px offset "drop lines" in Worn Blood Red or Sepia Bone to indicate active or "pressed" states, mimicking the physical depth of a stamped metal plate.

## Shapes
The shape language is strictly **Sharp (0)**. There are no rounded corners in this design system. All containers, buttons, and input fields must have 90-degree angles to reinforce the industrial, high-precision military aesthetic. 

Structural elements should often feature "notched" corners or 45-degree chamfers on primary containers to suggest armor plating or aerospace components.

## Components
Consistent application of the "Project: Zero" aesthetic across core elements:

*   **Buttons:** Rectangular, sharp-edged. Primary buttons use a solid Worn Blood Red background with Sepia Bone text. Secondary buttons use a transparent background with a 2px Oxidized Steel border.
*   **Input Fields:** Styled as "Field Logs." 1px borders on all sides with a Courier Prime label positioned strictly above or inside the top-left corner of the border.
*   **Cards:** Called "Dossiers." These feature a subtle parchment or metallic texture background and a header bar in a darker shade of Oxidized Steel.
*   **Status Chips:** Designed to look like mechanical toggle switches or physical stamps. "Active" states use a flickering light effect in Red; "Inactive" uses a dull Sepia.
*   **Data Grids:** Use heavy horizontal rules and no vertical rules. Highlight rows on hover with a low-opacity Sepia Bone tint to suggest a sliding viewfinder.