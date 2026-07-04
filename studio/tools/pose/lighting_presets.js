/*
  lighting_presets.js
  Title: Lighting Presets
  Purpose: Placeholder module to hold reusable lighting setup functions (studio, dramatic, outdoor).
*/

import * as THREE from 'three';

export function applyStudioLighting(scene) {
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(5, 10, 7);
  const fill = new THREE.HemisphereLight(0x8888ff, 0x444422, 0.4);
  scene.add(key, fill);
  return { key, fill };
}