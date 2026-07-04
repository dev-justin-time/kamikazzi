/*
  roundbox.js
  Title: RoundBox Utilities
  Purpose: Placeholder utilities for creating rounded box geometries and stylized primitives.
  Notes: Provides a factory function stub for rounded boxes.
*/

import * as THREE from 'three';

export function createRoundBox(width = 1, height = 1, depth = 1, radius = 0.1, material = new THREE.MeshStandardMaterial({ color: 0x888888 })) {
  // Minimal stub: fallback to a simple BoxGeometry until a proper rounded-geometry implementation is added.
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.roundBox = { width, height, depth, radius };
  return mesh;
}