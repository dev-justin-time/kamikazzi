/**
 * SPHKernels — Smoothing kernel functions for Smoothed Particle Hydrodynamics.
 *
 * Three standard kernels are provided:
 *   - Poly6          (density estimation)
 *   - Spiky          (pressure gradient)
 *   - Viscosity      (viscosity Laplacian)
 *
 * All kernels use mutable module-level constants so that `setKernelRadius(h)`
 * takes effect immediately for all subsequent calls.
 */

/** Default smoothing radius (world units). */
export const DEFAULT_H = 0.08;

// ── Pre-computed normalisation constants for h = 0.08 ──
const _H0 = DEFAULT_H;
const _H2_0 = _H0 * _H0;
const _H3 = _H2_0 * _H0;
const _H6 = _H3 * _H3;
const _H9 = _H6 * _H3;

const _POLY6_NORM = 315 / (64 * Math.PI * _H9);
const _SPIKY_NORM = -45 / (Math.PI * _H6);
const _VISC_NORM  =  45 / (Math.PI * _H6);

// ── Mutable state (updated by setKernelRadius) ──
let _H = _H0;
let _H2 = _H2_0;
let _poly6Norm = _POLY6_NORM;
let _spikyNorm = _SPIKY_NORM;
let _viscNorm  = _VISC_NORM;

/**
 * Poly6 kernel — used for density estimation.
 * W(r, h) = 315/(64πh⁹) · (h² − r²)³   for 0 ≤ r ≤ h
 */
function poly6(r) {
  if (r < 0 || r >= _H) return 0;
  const diff = _H2 - r * r;
  return _poly6Norm * diff * diff * diff;
}

/** Gradient of the Poly6 kernel (scalar factor; caller multiplies by direction). */
function poly6Grad(r) {
  if (r < 0 || r >= _H) return 0;
  const diff = _H2 - r * r;
  return -6 * _poly6Norm * r * diff * diff;
}

/**
 * Spiky gradient — used for pressure force.
 * ∇W_spiky(r, h) = -45/(πh⁶) · (h − r)²
 */
function spikyGrad(r) {
  if (r < 0 || r >= _H) return 0;
  const diff = _H - r;
  return _spikyNorm * diff * diff;
}

/** Laplacian of the Viscosity kernel. */
function viscosityLap(r) {
  if (r < 0 || r >= _H) return 0;
  return _viscNorm * (_H - r);
}

/**
 * Re-compute normalisation constants for a custom smoothing radius.
 * Call this once before simulation if you change the radius from DEFAULT_H.
 */
export function setKernelRadius(h) {
  const h2 = h * h; const h3 = h2 * h;
  const h6 = h3 * h3; const h9 = h6 * h3;
  _poly6Norm = 315 / (64 * Math.PI * h9);
  _spikyNorm = -45 / (Math.PI * h6);
  _viscNorm  =  45 / (Math.PI * h6);
  _H = h; _H2 = h2;
}

export { poly6, poly6Grad, spikyGrad, viscosityLap, _H as KERNEL_RADIUS };
