// /game/world/magnet_halo.js
// Magnet halo billboard — a transparent glow sprite that visually
// announces the magnet powerup is active, regardless of where the HUD
// chip strip is onscreen.
//
// Design choices (with reasoning, since this reads as a single texture):
//   - Sprite (not a plane mesh) → camera-facing by default, no per-frame
//     billboard math needed. The PlaneController rotates the plane on
//     bank/pitch; a Sprite parented to the plane inherits translation
//     but is locked to camera orientation independently. Without this,
//     the halo would tilt and "shimmer" with banking.
//   - AdditiveBlending → reads as a glow on top of the scene rather
//     than a tinted disk. Don't tell the player "there is a circle
//     here"; tell them "your plane is collecting a magnetic field".
//   - depthWrite:false → never occludes anything. depthTest:false (with
//     additive blending) → never gets occluded by anything either. So
//     the halo ALWAYS reads, even when buildings are in front of the
//     plane (which is when the player most needs the cue: while
//     threading a corridor of pickups).
//   - Texture is generated procedurally via Canvas2D radial gradient —
//     no asset required to ship. Hot-swap to a real PNG later if
//     desired: replace the createRadialGradient block with a
//     loadTexture(`/assets/glow/magnet.png`) call.
//   - Subtle scale pulse (±8% over ~1.4s) draws the eye without
//     throbbing; cos-based so it doesn't have spike discontinuities.
//
// Caller responsibility:
//   - Parent the returned sprite to `plane` so it follows translation.
//   - Call halo.setActive(isMagnetActive, performance.now()) each frame.
//   - On reset/crash, setActive(false, now) so it doesn't linger.
import * as THREE from 'https://esm.sh/three@0.128.0';

const MAGNET_HALO_COLOR = 0xff5dc8;        // matches powerups.js POWERUP_TYPES.magnet.color
const MAGNET_HALO_SCALE = 12;              // halo radius in world meters (plane scale 3.0 + 11m wingspan)
const MAGNET_HALO_PULSE_AMP = 0.08;        // ±8% scale wobble around baseline
const MAGNET_HALO_PULSE_HZ = 0.7;          // ~1.4s per cycle, smooth in/out

export function createMagnetHalo() {
  // Procedural radial-gradient texture — Canvas2D, alpha-falloff to 0
  // at the edges so the sprite fades smoothly into the background.
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c2d = canvas.getContext('2d');
  const grad = c2d.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.00, 'rgba(255, 235, 250, 0.95)');
  grad.addColorStop(0.30, 'rgba(255, 180, 230, 0.65)');
  grad.addColorStop(0.60, 'rgba(255,  93, 200, 0.30)');
  grad.addColorStop(0.85, 'rgba(255,  93, 200, 0.08)');
  grad.addColorStop(1.00, 'rgba(255,  93, 200, 0.00)');
  c2d.fillStyle = grad;
  c2d.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    color: MAGNET_HALO_COLOR,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    opacity: 1.0,
  });
  const sprite = new THREE.Sprite(mat);
  // Sprite.scale is 2D (x,y only, z is implicit for camera-facing). Set
  // both axes to MAGNET_HALO_SCALE so the halo is a circle, not an oval
  // — a 1:1 ratio mirrors the radial-gradient texture aspect.
  sprite.scale.set(MAGNET_HALO_SCALE, MAGNET_HALO_SCALE, 1);
  sprite.renderOrder = 5;       // above plane/markers, below overlays
  sprite.visible = false;       // hidden until magnet is collected

  /**
   * Drive the halo's per-frame visibility + scale pulse.
   * Cheap O(1); calls a few Setters, no allocations.
   * @param {boolean} isActive true while the magnet window is in flight
   *                          AND the player is alive (not state.over)
   * @param {number}  nowMs    performance.now() timestamp
   */
  function setActive(isActive, nowMs) {
    sprite.visible = !!isActive;
    if (!isActive) return;
    // Subtle breathing pulse — cos-based so it loops smoothly without
    // a hard reset at phase boundaries. Math.cos range [-1,+1] →
    // multiplied by ±AMP, added to 1 for ±8% around baseline scale.
    const phase = (nowMs / 1000) * MAGNET_HALO_PULSE_HZ * 2 * Math.PI;
    const k = 1 + MAGNET_HALO_PULSE_AMP * Math.cos(phase);
    const s = MAGNET_HALO_SCALE * k;
    sprite.scale.set(s, s, 1);
  }

  /** Free GPU resources (CanvasTexture + SpriteMaterial). */
  function dispose() {
    tex.dispose();
    mat.dispose();
  }

  return { sprite, setActive, dispose };
}
