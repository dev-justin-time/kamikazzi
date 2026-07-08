/* game/world/collision.js
   Extracted from world.js — AABB collision and near-miss detection.
   Pure functions: no closure state, no side effects.
*/

/**
 * Check whether the plane is intersecting a building's collision AABB.
 * The plane position is treated as a point; the building's AABB is
 * expanded by a 1.2m cushion so grazing contact registers as a crash.
 */
export function checkCollision(plane, b) {
  const px = plane.position.x, py = plane.position.y, pz = plane.position.z;
  const halfW = b.userData.w / 2 + 1.2;
  const halfD = b.userData.d / 2 + 1.2;
  const top    = b.position.y + b.userData.h / 2 + 0.8;
  const bottom = b.position.y - b.userData.h / 2 - 0.8;
  return Math.abs(px - b.position.x) < halfW
      && Math.abs(pz - b.position.z) < halfD
      && py < top && py > bottom;
}

/**
 * Check whether the plane is inside the 0.5m "near-miss" shell outside
 * the collision AABB. If true the near-miss bullet-time slow-mo is
 * triggered (timeScale bump).
 */
export function checkNearMiss(plane, b) {
  const px = plane.position.x, py = plane.position.y, pz = plane.position.z;
  const halfW = b.userData.w / 2 + 1.7;
  const halfD = b.userData.d / 2 + 1.7;
  const top    = b.position.y + b.userData.h / 2 + 1.3;
  const bottom = b.position.y - b.userData.h / 2 - 1.3;
  return Math.abs(px - b.position.x) < halfW
      && Math.abs(pz - b.position.z) < halfD
      && py < top && py > bottom;
}
