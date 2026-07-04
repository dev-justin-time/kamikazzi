/*
  physics_bridge.js
  Title: Physics Bridge
  Purpose: Lightweight bridge to optionally integrate a physics engine later.
*/

export function stubApplyPhysics(scene, timeStep = 1/60) {
  // No physics engine available — provide a no-op hook so the app can call it safely.
  // Consumers can replace window.applyPhysics with a real implementation.
  // Keep reference on window for runtime override.
  if (!window.applyPhysics) {
    window.applyPhysics = () => {};
  }
  return true;
}