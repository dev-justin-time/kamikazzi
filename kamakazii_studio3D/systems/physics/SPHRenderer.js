/**
 * SPHRenderer — Three.js visualisation for SPH fluid particles.
 *
 * Renders each particle as a small shaded sphere using an instanced mesh.
 * In future this can be replaced with screen-space splatting or
 * marching-cubes surface extraction for a liquid appearance.
 *
 * Integration: add `renderer.group` to your Three.js scene and call
 * `renderer.update(positions, count, densityBuffer, restDensity)` each
 * frame.
 */

import * as THREE from 'three';

/** Default sphere geometry detail (icosahedron for uniform triangles). */
const SPHERE_DETAIL = 1;

export class SPHRenderer {
  /**
   * @param {number} maxParticles  Maximum number of particles (pre-allocates)
   * @param {number} particleRadius  Visual radius of each particle (world units)
   */
  constructor(maxParticles = 2000, particleRadius = 0.03) {
    /** @type {number} */
    this.maxParticles = maxParticles;
    /** @type {number} */
    this.baseRadius = particleRadius;

    // ── Geometry — single SphereGeometry instanced N times ──
    const sphereGeo = new THREE.SphereGeometry(1, 12, 8);

    /** @type {THREE.InstancedMesh} */
    this.mesh = new THREE.InstancedMesh(
      sphereGeo,
      new THREE.MeshStandardMaterial({
        color: 0x4a9eff,
        roughness: 0.1,
        metalness: 0.0,
        transparent: true,
        opacity: 0.85,
      }),
      maxParticles,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;

    // ── Temporary objects for matrix computation ──
    /** @type {THREE.Matrix4} */
    this._matrix = new THREE.Matrix4();
    /** @type {THREE.Vector3} */
    this._pos = new THREE.Vector3();
    /** @type {THREE.Vector3} */
    this._scale = new THREE.Vector3();

    // ── Group containing the mesh ──
    /** @type {THREE.Group} */
    this.group = new THREE.Group();
    this.group.name = 'SPHFluid';
    this.group.add(this.mesh);

    // ── Pre-allocated quaternion (avoids per-frame GC) ──
    /** @type {THREE.Quaternion} */
    this._quat = new THREE.Quaternion();

    // ── Optional colour attribute (for density-based colouring) ──
    const colorArray = new Float32Array(maxParticles * 3);
    this._colorAttr = new THREE.InstancedBufferAttribute(colorArray, 3, false);
    this.mesh.geometry.setAttribute('instanceColor', this._colorAttr);
    this.mesh.instanceColor.needsUpdate = true;

    /** @type {THREE.Color} */
    this._color = new THREE.Color();
  }

  /**
   * Update the instanced mesh transforms and visibility count.
   *
   * @param {Float32Array} positions   Flat [x,y,z, x,y,z, …] array
   * @param {number}       count       Number of active particles
   * @param {Float32Array} [densities] Density per particle (for colouring)
   * @param {number}       [restDensity=1000]
   */
  update(positions, count, densities, restDensity = 1000) {
    this.mesh.count = Math.min(count, this.maxParticles);
    const s = this.baseRadius;

    for (let i = 0; i < this.mesh.count; i++) {
      const i3 = i * 3;
      this._pos.set(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      this._scale.set(s, s, s);

      // Density-based colour: blue at rest, white at high pressure, grey at low
      if (densities) {
        const ratio = densities[i] / restDensity;
        if (ratio > 1.2) {
          this._color.setHSL(0.55, 0.6, 0.7); // cyan-white
        } else if (ratio < 0.8) {
          this._color.setHSL(0.6, 0.3, 0.4); // dark blue-grey
        } else {
          this._color.setHSL(0.6, 0.8, 0.5 + (ratio - 1) * 0.3); // blue range
        }
        this._colorAttr.setXYZ(i, this._color.r, this._color.g, this._color.b);
      }

      this._matrix.compose(this._pos, this._quat, this._scale);
      this.mesh.setMatrixAt(i, this._matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (densities) this._colorAttr.needsUpdate = true;
  }

  /** Change the visual particle radius. */
  setRadius(r) {
    this.baseRadius = r;
  }
}
