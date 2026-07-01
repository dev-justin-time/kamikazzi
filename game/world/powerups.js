// /game/world/powerups.js
// Powerup manager — drives the 5-type spawn/drift/spin/pickup pipeline.
//
// Architecture (was previously just spin+drift, no pickup, so cubes just
// floated past the plane and did nothing):
//   - POWERUP_TYPES catalog — single source of truth for shape/colour/label
//     and which TUNING key holds its duration. Adding a new type = add one
//     row + a corresponding TUNING entry. No new spawn-path code.
//   - Per-type geometry picker so each shape reads distinctly at a glance:
//       shield  → cube (BoxGeometry, classic powerup cube)
//       boost   → tall pylon (CylinderGeometry, vertical bar)
//       magnet  → torus ring (TorusGeometry, magnetically attractor vibe)
//       score2x → octahedron (OctahedronGeometry, gem-like)
//       slowmo  → tetrahedron (TetrahedronGeometry, hourglass/diamond)
//   - Public surface stays tiny: { clear, spawn, checkPickup, update } so
//     world.js doesn't reach into engine internals.
//
// Pickup math:
//   plane at (x,y,z), powerup mesh at its own position. AABB-ish check
//   |dz| <= POWERUP_PICKUP_RADIUS and |dy| <= ~half-height. Cheap O(N)
//   per-frame check; spawn cap is 6 powerups so it's negligible.
//
// Magnet effect (powerups.js local responsibility):
//   while state reports magnet active, update() pulls any powerup within
//   POWERUP_MAGNET_RADIUS of the plane toward the plane on the X axis at
//   MAGNET_PULL m/s. The Y/Z axes aren't pulled — only left/right, since
//   that mirrors the gameplay feel of "my plane is steering powerups
//   sideways into my lane".
import * as THREE from 'https://esm.sh/three@0.128.0';
import { TUNING, removeAndDispose } from './shared.js';

// Type catalog. Shape fns produce a centered THREE.Object3D so the spawn
// side can position the wrapper mesh consistently. Shape geometries are
// INSTANCED per-spawn (not shared via registerShared) — the pickup pipeline
// calls removeAndDispose on the wrapper per hit, so per-powerup lifetime
// ownership of its geometry is the natural model here.
const POWERUP_TYPES = {
  shield: {
    label: '🛡 Shield',
    color: 0x66ffff,                                                  // cyan
    build() {
      const g = new THREE.BoxGeometry(2.2, 2.2, 2.2);
      return { geometry: g, halfHeight: 1.1 };
    },
    durationKey: 'POWERUP_SHIELD_MS',
  },
  boost: {
    label: '🔥 Boost',
    color: 0xfff176,                                                  // amber/yellow
    build() {
      const g = new THREE.CylinderGeometry(0.7, 0.7, 3.2, 16);
      return { geometry: g, halfHeight: 1.6 };
    },
    durationKey: 'POWERUP_BOOST_MS',
  },
  magnet: {
    label: '🧲 Magnet',
    color: 0xff5dc8,                                                  // magenta
    build() {
      const g = new THREE.TorusGeometry(1.1, 0.32, 12, 24);
      return { geometry: g, halfHeight: 0.55 };
    },
    durationKey: 'POWERUP_MAGNET_MS',
  },
  score2x: {
    label: '✦ 2× Score',
    color: 0x6dff8c,                                                  // light green
    build() {
      const g = new THREE.OctahedronGeometry(1.4);
      return { geometry: g, halfHeight: 1.0 };
    },
    durationKey: 'POWERUP_SCORE2X_MS',
  },
  slowmo: {
    label: '⏱ Slow-mo',
    color: 0x9a7dff,                                                  // indigo
    build() {
      const g = new THREE.TetrahedronGeometry(1.6);
      return { geometry: g, halfHeight: 1.0 };
    },
    durationKey: 'POWERUP_SLOWMO_MS',
  },
};

export function createPowerupManager(scene) {
  const powerups = [];

  function clear() {
    for (const p of powerups) removeAndDispose(p.mesh);
    powerups.length = 0;
  }

  /**
   * Spawn a powerup at world Z=z, randomly offset on X+Y within the
   * gameplay corridor. Random feel is intentional — keeps the player
   * reaching into the spawn lane rather than memorizing a fixed path.
   * @param {number} z                 world Z (negative = ahead of plane)
   * @param {keyof POWERUP_TYPES} type one of shield|boost|magnet|score2x|slowmo
   */
  function spawn(z, type = 'shield') {
    const def = POWERUP_TYPES[type] || POWERUP_TYPES.shield;
    const built = def.build();
    const mat = new THREE.MeshLambertMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.7,
    });
    const mesh = new THREE.Mesh(built.geometry, mat);
    // X corridor is ±20 (matches the spawning corridor — telemetry showed
    // |x| > 20 was unreachable without banking, so this matches feasibility).
    mesh.position.set(
      (Math.random() - 0.5) * 40,
      2 + Math.random() * 10,
      z,
    );
    mesh.userData = { type, halfHeight: built.halfHeight };
    scene.add(mesh);
    powerups.push({ mesh, type, halfHeight: built.halfHeight });
    return mesh;
  }

  /**
   * Drift + spin + dispose when out of bounds. While `magnetActive` is
   * true, any powerup within POWERUP_MAGNET_RADIUS of (planeX, planeZ)
   * is pulled toward planeX at MAGNET_PULL m/s — this is the visible
   * "magnet picked up the cube" feel. The Y axis isn't pulled so the
   * pickup corridor stays predictable.
   *
   * @param {number} speed         world speed in loop units
   * @param {number} dt            seconds
   * @param {number} planeZ        current plane z, or null
   * @param {boolean} magnetActive if true, run magnet pull logic
   * @param {number} [planeX]      optional x of plane (needed iff magnetActive)
   */
  function update(speed, dt, planeZ, magnetActive, planeX) {
    const drift = speed * TUNING.BUILD_DRIFT_FACTOR * dt;
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.mesh.position.z += drift;
      // Type-tinted spin rates so different shapes look alive in
      // different ways. Octahedron/tetrahedron need a faster spin than
      // the cube to read as rotating; torus should spin on its OWN axis
      // (Y) so the ring face bobs toward the camera.
      if (p.type === 'magnet') {
        p.mesh.rotation.y += dt * 3;
      } else {
        p.mesh.rotation.x += dt * 2;
        p.mesh.rotation.y += dt * 3;
      }
      // Magnet pull: only on X, only when within z-radius.
      if (magnetActive && typeof planeX === 'number') {
        const dz = p.mesh.position.z - planeZ;
        if (Math.abs(dz) <= TUNING.POWERUP_MAGNET_RADIUS) {
          const targetX = planeX;
          const dx = targetX - p.mesh.position.x;
          p.mesh.position.x += clampX(dx, dt * TUNING.POWERUP_MAGNET_PULL);
        }
      }
      // Reap if past the camera.
      if (p.mesh.position.z > TUNING.GENERATION_END_Z) {
        removeAndDispose(p.mesh);
        powerups.splice(i, 1);
      } else if (!p.passed && planeZ !== undefined && p.mesh.position.z > planeZ + 4) {
        p.passed = true;
      }
    }
  }

  /**
   * Per-frame pickup AABB check. Returns the picked powerup TYPE key on
   * hit (and disposes the mesh so it disappears immediately), or null.
   * Cheap O(N) over the small powerup pool. The caller (world.js) is
   * responsible for translating the type into a gameplay effect.
   *
   * @param {{x:number,y:number,z:number}} planePos
   * @returns {string|null} 'shield'|'boost'|'magnet'|'score2x'|'slowmo' or null
   */
  function checkPickup(planePos) {
    const r = TUNING.POWERUP_PICKUP_RADIUS;
    for (let i = 0; i < powerups.length; i++) {
      const p = powerups[i];
      const dz = p.mesh.position.z - planePos.z;
      if (Math.abs(dz) > r) continue;
      const dy = p.mesh.position.y - planePos.y;
      if (Math.abs(dy) > p.halfHeight + 0.6) continue;
      const dx = p.mesh.position.x - planePos.x;
      if (Math.abs(dx) > r) continue;
      // Hit. Dispose + drop from active.
      removeAndDispose(p.mesh);
      powerups.splice(i, 1);
      return p.type;
    }
    return null;
  }

  return { clear, spawn, checkPickup, update, powerups };
}

// Local clamp helper for the magnet pull so powerups.js doesn't reach
// into shared.js for a 1-line utility (would force coupling through the
// import path with no semantic gain).
function clampX(dx, maxAbs) {
  if (dx >  maxAbs) return  maxAbs;
  if (dx < -maxAbs) return -maxAbs;
  return dx;
}
