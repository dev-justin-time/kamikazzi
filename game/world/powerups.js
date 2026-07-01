// /game/world/powerups.js
// Powerup manager — spawn, drift+spin, dispose when out of bounds.
// Was only spinning (no drift) AND never reaped, so meshes leaked indefinitely.
// Now: drift with buildings (so they actually reachable), reap at GENERATION_END_Z.
import * as THREE from 'https://esm.sh/three@0.128.0';
import { TUNING, removeAndDispose } from './shared.js';

const POWERUP_COLOR = {
  shield: 0x66ffff,
  boost:  0xfff176,
};

export function createPowerupManager(scene) {
  const powerups = [];

  function clear() {
    for (const p of powerups) removeAndDispose(p.mesh);
    powerups.length = 0;
  }

  function spawn(z, type = 'shield') {
    const color = POWERUP_COLOR[type] ?? POWERUP_COLOR.shield;
    const geo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 40, 2 + Math.random() * 10, z);
    mesh.userData = { type };
    scene.add(mesh);
    powerups.push({ mesh, type });
    return mesh;
  }

  /**
   * Drift forward (matching building flow) + spin + dispose when past the camera.
   * @param {number} speed  world speed in loop units
   * @param {number} dt     seconds
   * @param {number} planeZ current plane z (used to gate pass-by events)
   */
  function update(speed, dt, planeZ) {
    const drift = speed * TUNING.BUILD_DRIFT_FACTOR * dt;
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.mesh.position.z += drift;
      p.mesh.rotation.x += dt * 2;
      p.mesh.rotation.y += dt * 3;
      if (p.mesh.position.z > TUNING.GENERATION_END_Z) {
        removeAndDispose(p.mesh);
        powerups.splice(i, 1);
      } else if (!p.passed && planeZ !== undefined && p.mesh.position.z > planeZ + 4) {
        p.passed = true;
      }
    }
  }

  return { clear, spawn, update };
}
