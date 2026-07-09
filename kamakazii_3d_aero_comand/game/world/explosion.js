// /game/world/explosion.js
// Particle burst on crash. Was 40×BoxGeometry + 40×MeshBasicMaterial per explosion
// (and they were never disposed, leaking across rounds).
// Now: single shared geometry + per-color shared material + dispose on shrink.
import * as THREE from 'three';
import {
  EXPLOSION_COLORS, EXPLOSION_PARTICLE_GEOMETRY, EXPLOSION_PALETTES,
  getExplosionParticleMaterial, removeAndDispose,
} from './shared.js';

const PARTICLES_PER_BURST = 40;

export function createExplosionManager(scene) {
  const explosionGroup = new THREE.Group();
  scene.add(explosionGroup);
  const particles = [];

  // Resolve the per-burst color array from spawn opts. Accepts either a raw
  // palette array (`opts.palette`) for one-off custom bursts, or an index
  // into the canonical EXPLOSION_PALETTES (`opts.paletteIdx`) used by the
  // 3-stage stagger in world.js endGame. Defaults to the legacy
  // EXPLOSION_COLORS so any existing single-shot caller keeps working.
  function resolvePalette(opts) {
    if (Array.isArray(opts.palette)) return opts.palette;
    if (Number.isInteger(opts.paletteIdx) && EXPLOSION_PALETTES[opts.paletteIdx]) {
      return EXPLOSION_PALETTES[opts.paletteIdx];
    }
    return EXPLOSION_COLORS;
  }

  function spawn(pos, opts = {}) {
    const palette = resolvePalette(opts);
    const scaleMul = Number.isFinite(opts.scale) ? opts.scale : 1.0;
    for (let i = 0; i < PARTICLES_PER_BURST; i++) {
      const mat  = getExplosionParticleMaterial(palette[i % palette.length]);
      const mesh = new THREE.Mesh(EXPLOSION_PARTICLE_GEOMETRY, mat);
      mesh.position.copy(pos);
      mesh.userData.vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 2.2
      );
      mesh.scale.setScalar(scaleMul);          // per-burst scale ramp; multiplicative decay in update()
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
