/*
  scene_helpers.js
  Title: Scene Helpers
  Purpose: Utility helpers for creating common scene elements (skybox, grid, lighting presets).
*/

import * as THREE from 'three';

export function applyGridHelper(scene, size = 10, divisions = 10) {
  const grid = new THREE.GridHelper(size, divisions, 0x444444, 0x888888);
  grid.name = 'helper_grid';
  scene.add(grid);
  return grid;
}

export function clearHelperByName(scene, name) {
  const obj = scene.getObjectByName(name);
  if (obj) {
    scene.remove(obj);
  }
}