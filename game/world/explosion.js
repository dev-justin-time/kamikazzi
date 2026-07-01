// /game/world/explosion.js
// Particle burst on crash. Was 40×BoxGeometry + 40×MeshBasicMaterial per explosion
// (and they were never disposed, leaking across rounds).
// Now: single shared geometry + per-color shared material + dispose on shrink.
import * as THREE from 'https://esm.sh/three@0.128.0';
import {
  EXPLOSION_COLORS, EXPLOSION_PARTICLE_GEOMETRY,
  getExplosionParticleMaterial, removeAndDispose,
} from './shared.js';

const PARTICLES_PER_BURST = 40;

export function createExplosionManager(scene) {
  const explosionGroup = new THREE.Group();
  scene.add(explosionGroup);
  const particles = [];

  function spawn(pos) {
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      const mat  = getExplosionParticleMaterial(EXPLOSION_COLORS[i % EXPLOSION_COLORS.length]);
      const mesh = new THREE.Mesh(EXPLOSION_PARTICLE_GEOMETRY, mat);
      mesh.position.copy(pos);
      mesh.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 2.2
      );
      explosionGroup.add(mesh);
      particles.push(mesh);
    }
  }

  function update(dt) {
    if (!particles.length) return;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 0.05 * dt;
      p.rotation.x += 0.2 * dt;
      p.rotation.y += 0.2 * dt;
      p.scale.multiplyScalar(1 - 0.012 * dt);
      if (p.scale.x < 0.06) {
        // Geometries + materials are shared, so DON'T dispose them here.
        // Just detach this Mesh instance.
        if (p.parent) p.parent.remove(p);
        particles.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const p of particles) {
      if (p.parent) p.parent.remove(p);
    }
    particles.length = 0;
  }

  // For symmetry with the other managers — full teardown
  function dispose() {
    clear();
    removeAndDispose(explosionGroup);
  }

  return { spawn, update, clear, dispose };
}
