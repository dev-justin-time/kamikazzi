/*
  animation_tools.js
  Title: Animation Tools
  Purpose: Helper functions for keyframe blending, easing utilities, and timeline utilities.
*/

export function lerpDegrees(a, b, t) {
  // shortest-path lerp for angles in degrees
  let delta = ((b - a + 180 + 360) % 360) - 180;
  return a + delta * t;
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}