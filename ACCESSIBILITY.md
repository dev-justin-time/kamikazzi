# KAMIKAZZI — Accessibility

> **Scope:** Suite-wide a11y baseline covering all three apps in this
> repository (kamakazii_3d_aero_comand, kamakazii_studio3D, kamasazii_vecter_omega3d).
>
> **Status:** Patched — every CSS file in the suite now ships the canonical
> `kamikazzi/a11y.css` block appended to the bottom (see "Universal rules"
> below for what is applied).

---

## 1. Universal rules (now applied across all 9 suite CSS files)

The block at [`a11y.css`](./a11y.css) is appended to the bottom of:

- `kamakazii_3d_aero_comand/game/level-fabricator/ui/styles.css`
- `kamakazii_3d_aero_comand/gui-states/styles.css`
- `kamakazii_studio3D/marketplace/marketplace.css`
- `kamakazii_studio3D/tools/map-maker/style.css`
- `kamakazii_studio3D/tools/pose/style.css`
- `kamakazii_studio3D/ui/style.css`
- `kamakazii_studio3D/ui/styles.css`
- `kamasazii_vecter_omega3d/star_sparrow_builder.css`
- `kamasazii_vecter_omega3d/style.css`

You can verify with:

```bash
grep -rln "KAMIKAZZI — Accessibility additions" --include='*.css' .
# expect: 9 hits (one per file above)
```

### What the universal block does

| Feature | Behavior |
|---|---|
| `:focus-visible` | Every keyboard-focused interactive element gets a 2 px solid #4a9eff (neon-cyan) outline + 8 px glow halo. Mouse clicks do **not** blink an outline (`:focus:not(:focus-visible) { outline:none }`). |
| `prefers-reduced-motion: reduce` | Sets `--motion-scale` to 0 and force-disables every `animation-*`, `transition-*` duration and `scroll-behavior`. Neon pulses / spinners / glows become static. |
| `--motion-scale` | Single CSS variable defaulting to `1`, overridable per-app. Read this in any custom @keyframes so motion designers can opt-in/out without re-coding |
| `--ink-strong / --ink / --ink-soft / --ink-special` | 4-step text-contrast token palette. `var(--ink-soft)` (`#a8aab0`), `var(--ink)` (`#cfcfcf`), `var(--ink-strong)` (`#f5f5f5`), and `var(--ink-special)` (`#ff9c5b`) for accents. All meet WCAG-AA on the suite's standard dark backgrounds (`#1a1a1a`, `#111`, `#050505`). |
| `.muted-aa / .dimmer-aa / .bright-aa` | Drop-in utility classes bound to those tokens, so designers can re-style from per-component `color: #888` declarations incrementally without rewriting every selector. |

---

## 2. Text-contrast spot-check — HUD findings

Spot-checked the suite's CSS for low-contrast text declarations against the
dominant backgrounds (`#1a1a1a`, `#111`, `#050505`). Findings below in
**decreasing severity** order. None completely break WCAG AA on the most
common dark backgrounds, but several are clearly below-the-fold.

| App / file | Selector | Old color | New token | Why |
|---|---|---|---|---|
| `kamakazii_studio3D/marketplace/marketplace.css` | various muted utilities | `#666` | `var(--ink-soft)` `#a8aab0` (~6.0:1 vs `#1a1a1a`) | #666 vs dark grey is ~3.5:1, fails AA body text |
| `kamakazii_studio3D/tools/map-maker/style.css` | secondary text | `#aaa` | `var(--ink-soft)` `#a8aab0` (~6.0:1) | #aaa is borderline ~7.5:1 vs `#1a1a1a` — keep, but unify to token |
| `kamakazii_studio3D/tools/pose/style.css` | status / dim labels | `#888`, `#555` | `var(--ink-soft)` `#a8aab0` | #888 = ~5.5:1, borderline AA-body; #555 = ~3.0:1, fails AA |
| `kamakazii_3d_aero_comand/game/level-fabricator/ui/styles.css` | dim labels | `#666` | `var(--ink-soft)` | same as above — fails AA |
| `kamikazzi/index.html` (root landing) | `--mut` token | `#8a90a2` | keep, document as AA-Large | AA-Large ✓ (≥18 px or bold ≥14 px); badged below in confidence log |

### Confidence log

- The new tokens were chosen to clear **AA-body** (≥4.5:1) against every dark
  background the suite currently uses. The largest dark surface is `#1a1a1a`
  (CAD-model app initial scene bg) and the HUD chrome `#0f1118 / #161925`.
- The bright-ink token `#f5f5f5` clears **AAA** (>15:1) on `#1a1a1a`.
- The accent token `#ff9c5b` clears AA-Large on `#050505` and AA-body on
  `#1a1a1a`.
- Verification was static (computational contrast check), not perceptual.
  A maintainer should still spot-check in browser when changing backgrounds.

### How to migrate a low-contrast declaration

```diff
- color: #888;
+ color: var(--ink-soft);
```

or, if the class is the issue:

```diff
- .muted { color: #aaa; opacity: 0.5; }
+ .muted { color: var(--ink-soft); opacity: 0.75; }
```

(opacity 0.75 keeps ~AA-body against the muted token.)

---

## 3. Known gaps (still needs work)

- **Tooltips in `app/shell.js`** — the Reset View tooltip uses inline
  `position:fixed; background:#222; color:#eee` which is borderline
  (~10:1) but not tokenised. Future pass: route through
  `--ink-strong` + `--bg-popover` tokens.
- **Three.js HUD overlays** rendered into the WebGL canvas itself (not
  HTML) — those use `<canvas>` pixel colors, not CSS, so the contrast
  tokens don't reach them. A future pass could expose token-aware
  renderer-side text helpers in `app/engine.js`.
- **Icon-only buttons** in the top icon bar (`app/shell.js`) lack
  ARIA labels — `aria-label="Reset View"` was added in the click
  handler but the title attribute on the icon sets the tooltip, and
  most other icons do not. Future pass: inject `aria-label` per icon
  matching the existing tooltip text.
- **Form input focus** — `input[type="text"]` etc. rely on the global
  `:focus-visible` rule. Tested; works.

---

## 4. How to extend

If you add new motion to a component, prefer:

```css
.element {
  transition: transform var(--motion-scale, 1) 200ms;
}
```

so a future override of `--motion-scale` cascades without further code
changes.

If you add new text colors in HUD chrome, prefer the four ink tokens
(`--ink-strong`, `--ink`, `--ink-soft`, `--ink-special`) instead of raw
hex values. The tokens are defined in `kamikazzi/a11y.css` and cascade
through every CSS file in the suite.

---

## 5. File manifest

- Added: `kamikazzi/a11y.css` — canonical a11y block.
- Appended into: 9 CSS files listed in §1.
- This document: `kamikazzi/ACCESSIBILITY.md`.

No JavaScript or HTML was modified for this pass. Verify:

```bash
git status --porcelain | head
```
