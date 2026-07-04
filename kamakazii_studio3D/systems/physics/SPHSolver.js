/**
 * SPHSolver — Core Position Based Fluids (PBF) solver.
 *
 * Implements the complete SPH simulation loop:
 *   1. External forces (gravity)
 *   2. Neighbour search via spatial hash
 *   3. Density & pressure computation
 *   4. Lambda (Lagrange multiplier) solve
 *   5. Position correction (deltaP)
 *   6. Collision handling with container boundaries
 *   7. Velocity update from position delta
 *   8. Vorticity & viscosity post-processing
 *
 * Usage:
 *   const solver = new SPHSolver(1000);
 *   solver.initializeCube(particleCount);
 *   // each frame:
 *   solver.simulate(dt);
 *   renderer.update(solver.positions, solver.activeCount, solver.densities);
 *
 * @see PBF: https://matthias-research.github.io/pages/publications/PBF.pdf
 */

import { SPHNeighborhood } from './SPHNeighborhood.js';
import { poly6, spikyGrad, viscosityLap, KERNEL_RADIUS } from './SPHKernels.js';

// ── Constants ──

/** Rest density (~1000 kg/m³). */
const REST_DENSITY = 1000;

/** Gas constant for pressure computation. */
const GAS_CONSTANT = 2000;

/** Particle mass (all particles equal). */
const PARTICLE_MASS = 1.0;

/** Viscosity coefficient. */
const VISCOSITY = 0.002;

/** Vorticity confinement strength. */
const VORTICITY_EPS = 0.001;

/** Artificial surface tension coefficient. */
const SURFACE_TENSION = 0.0001;

/** Number of PBF constraint iterations per timestep. */
const PBF_ITERATIONS = 5;

/** Default smoothing radius (kernel radius) in world units. */
const H = KERNEL_RADIUS;
const H2 = H * H;

/** Default spacing between particles when initializing a cube. */
const DEFAULT_SPACING = H * 0.65;

// ── Container boundary ──

const CONTAINER_MIN = -0.5;
const CONTAINER_MAX = 0.5;
const CONTAINER_HEIGHT = 0.6;

export class SPHSolver {
  /**
   * @param {number} maxParticles  Maximum number of particles (pre-allocates arrays)
   */
  constructor(maxParticles = 2000) {
    /** @type {number} */
    this.maxParticles = maxParticles;

    /** @type {number} */
    this.activeCount = 0;

    // ── Flat arrays (cache-friendly for the solver loop) ──
    /** Predicted positions (after external forces, before constraint solve). */
    this.predicted = new Float32Array(maxParticles * 3);
    /** Current (frame-start) positions. */
    this.positions = new Float32Array(maxParticles * 3);
    /** Velocities. */
    this.velocities = new Float32Array(maxParticles * 3);
    /** Density per particle. */
    this.densities = new Float32Array(maxParticles);
    /** Pressure per particle. */
    this.pressures = new Float32Array(maxParticles);
    /** Lambda (Lagrange multiplier for PBF). */
    this.lambdas = new Float32Array(maxParticles);
    /** Position correction delta. */
    this.deltaP = new Float32Array(maxParticles * 3);

    // ── Spatial index ──
    /** @type {SPHNeighborhood} */
    this.neighborhood = new SPHNeighborhood(H, maxParticles);

    // ── Temporary / scratch ──
    this._scratch = new Float32Array(maxParticles * 3);
    this._neighbors = [];
    this._gradientSum = new Float32Array(3);
  }

  // ── Initialisation ──

  /**
   * Fill a cube of particles centred at the origin.
   * @param {number}  count   Number of particles along one edge
   * @param {number}  [spacing]  Distance between particle centres
   * @param {Float32Array} [posOffset]  Centre offset [x, y, z]
   */
  initializeCube(count, spacing = DEFAULT_SPACING, posOffset = null) {
    const offset = posOffset || new Float32Array([0, 0.15, 0]);
    const half = (count - 1) * spacing * 0.5;
    let idx = 0;

    for (let ix = 0; ix < count; ix++) {
      for (let iy = 0; iy < count; iy++) {
        for (let iz = 0; iz < count; iz++) {
          if (idx >= this.maxParticles) break;
          const i3 = idx * 3;
          const x = -half + ix * spacing + offset[0];
          const y = -half + iy * spacing + offset[1];
          const z = -half + iz * spacing + offset[2];
          this.positions[i3] = x;
          this.positions[i3 + 1] = y;
          this.positions[i3 + 2] = z;
          this.predicted[i3] = x;
          this.predicted[i3 + 1] = y;
          this.predicted[i3 + 2] = z;
          this.velocities[i3] = 0;
          this.velocities[i3 + 1] = 0;
          this.velocities[i3 + 2] = 0;
          this.densities[idx] = REST_DENSITY;
          idx++;
        }
      }
    }
    this.activeCount = idx;
  }

  /**
   * Create a fluid block with a specific particle count (auto-computes grid size).
   * @param {number} totalParticles  Approximate total count (rounded to cube)
   * @param {number} [spacing]
   */
  initializeAuto(totalParticles, spacing = DEFAULT_SPACING) {
    const side = Math.ceil(Math.cbrt(totalParticles));
    this.initializeCube(side, spacing);
  }

  // ── Main simulation step ──

  /**
   * Advance the simulation by one fixed timestep.
   * @param {number} dt  Delta time (should be ~1/60 for stability)
   */
  simulate(dt) {
    if (this.activeCount === 0) return;

    // 1. Apply external forces → predict positions
    this._applyExternalForces(dt);

    // 2. Rebuild spatial hash from predicted positions
    this.neighborhood.rebuild(this.predicted, this.activeCount);

    // 3. Compute densities from predicted positions
    this._computeDensities();

    // 4. PBF iterations: solve density constraints
    for (let iter = 0; iter < PBF_ITERATIONS; iter++) {
      this._computeLambdas();
      this._applyDeltaP();
    }

    // 5. Update velocities from position delta
    this._updateVelocities(dt);

    // 6. Vorticity confinement & viscosity (XSPH)
    this._vorticityConfinement(dt);
    this._xsphViscosity(dt);

    // 7. Enforce container boundaries
    this._enforceBounds();

    // 8. Swap positions = predicted
    this._swapPositions();
  }

  // ── Step 1: External forces ──

  _applyExternalForces(dt) {
    const gravity = -9.81;
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      // Apply gravity to velocity
      this.velocities[i3 + 1] += gravity * dt;
      // Damping (optional)
      this.velocities[i3] *= 0.999;
      this.velocities[i3 + 1] *= 0.999;
      this.velocities[i3 + 2] *= 0.999;
      // Predict position
      this.predicted[i3]     = this.positions[i3]     + this.velocities[i3]     * dt;
      this.predicted[i3 + 1] = this.positions[i3 + 1] + this.velocities[i3 + 1] * dt;
      this.predicted[i3 + 2] = this.positions[i3 + 2] + this.velocities[i3 + 2] * dt;
    }
  }

  // ── Step 3: Density computation ──

  _computeDensities() {
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      const px = this.predicted[i3];
      const py = this.predicted[i3 + 1];
      const pz = this.predicted[i3 + 2];
      let density = 0;

      // Query neighbors
      const neighbors = this.neighborhood.query(px, py, pz);
      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        const j3 = j * 3;
        const dx = px - this.predicted[j3];
        const dy = py - this.predicted[j3 + 1];
        const dz = pz - this.predicted[j3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > H2 || distSq < 1e-12) continue;
        density += PARTICLE_MASS * poly6(Math.sqrt(distSq));
      }
      // Include self-contribution (r=0)
      density += PARTICLE_MASS * poly6(0);
      this.densities[i] = density;
      this.pressures[i] = GAS_CONSTANT * (density - REST_DENSITY);
    }
  }

  // ── Step 4a: Compute lambdas (PBF) ──

  _computeLambdas() {
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      const px = this.predicted[i3];
      const py = this.predicted[i3 + 1];
      const pz = this.predicted[i3 + 2];

      // C_i = ρ_i / ρ₀ - 1
      const Ci = this.densities[i] / REST_DENSITY - 1;
      if (Ci <= 0) { this.lambdas[i] = 0; continue; }

      // Sum of squared gradient magnitudes
      let sumGradSq = 0;
      const neighbors = this.neighborhood.query(px, py, pz);

      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        const j3 = j * 3;
        const dx = px - this.predicted[j3];
        const dy = py - this.predicted[j3 + 1];
        const dz = pz - this.predicted[j3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > H2 || distSq < 1e-12) continue;
        const dist = Math.sqrt(distSq);
        const grad = spikyGrad(dist) / REST_DENSITY;
        const gx = grad * dx / dist;
        const gy = grad * dy / dist;
        const gz = grad * dz / dist;
        sumGradSq += gx * gx + gy * gy + gz * gz;
      }

      // Also add self contribution (same as neighbor with dist→0 limit)
      // The gradient at r=0 is 0 for spiky, so self contributes nothing.
      this.lambdas[i] = -Ci / (sumGradSq + 1e-12);
    }
  }

  // ── Step 4b: Apply position correction ──

  _applyDeltaP() {
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      const px = this.predicted[i3];
      const py = this.predicted[i3 + 1];
      const pz = this.predicted[i3 + 2];
      const lambdaI = this.lambdas[i];
      if (Math.abs(lambdaI) < 1e-12) continue;

      let dx = 0, dy = 0, dz = 0;

      const neighbors = this.neighborhood.query(px, py, pz);
      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        if (j === i) continue;
        const j3 = j * 3;
        const ex = px - this.predicted[j3];
        const ey = py - this.predicted[j3 + 1];
        const ez = pz - this.predicted[j3 + 2];
        const distSq = ex * ex + ey * ey + ez * ez;
        if (distSq > H2 || distSq < 1e-12) continue;
        const dist = Math.sqrt(distSq);
        const grad = spikyGrad(dist) / REST_DENSITY;

        // Scaler: (λ_i + λ_j) * grad * (1/dist)
        const s = (lambdaI + this.lambdas[j]) * grad / dist;
        dx += s * ex;
        dy += s * ey;
        dz += s * ez;
      }

      // Surface tension correction (pulls particles toward center of mass)
      // Artificial term: keep particles together at low density
      if (this.densities[i] < REST_DENSITY * 0.9) {
        // Simple cohesion toward neighbor centroid
        let cx = 0, cy = 0, cz = 0, ncount = 0;
        for (let k = 0; k < neighbors.length; k++) {
          const j = neighbors[k];
          if (j === i) continue;
          const j3 = j * 3;
          const ex = px - this.predicted[j3];
          const ey = py - this.predicted[j3 + 1];
          const ez = pz - this.predicted[j3 + 2];
          const distSq = ex * ex + ey * ey + ez * ez;
          if (distSq > H2 || distSq < 1e-12) continue;
          const dist = Math.sqrt(distSq);
          const w = poly6(dist);
          cx += ex * w;
          cy += ey * w;
          cz += ez * w;
          ncount++;
        }
        if (ncount > 0) {
          const invN = 1 / ncount;
          dx += cx * invN * SURFACE_TENSION;
          dy += cy * invN * SURFACE_TENSION;
          dz += cz * invN * SURFACE_TENSION;
        }
      }

      this.deltaP[i3]     = dx;
      this.deltaP[i3 + 1] = dy;
      this.deltaP[i3 + 2] = dz;
    }

    // Apply corrections (need a separate loop to avoid read-write conflicts)
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      this.predicted[i3]     += this.deltaP[i3];
      this.predicted[i3 + 1] += this.deltaP[i3 + 1];
      this.predicted[i3 + 2] += this.deltaP[i3 + 2];
    }
  }

  // ── Step 5: Update velocities from position delta ──

  _updateVelocities(dt) {
    const invDt = 1 / (dt || 1 / 60);
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      this.velocities[i3]     = (this.predicted[i3]     - this.positions[i3])     * invDt;
      this.velocities[i3 + 1] = (this.predicted[i3 + 1] - this.positions[i3 + 1]) * invDt;
      this.velocities[i3 + 2] = (this.predicted[i3 + 2] - this.positions[i3 + 2]) * invDt;
    }
  }

  // ── Step 6: Vorticity confinement + XSPH viscosity ──

  _vorticityConfinement(dt) {
    // Compute vorticity at each particle (simplified 2D-ish: only Y-component)
    // Full 3D vorticity would need all three curl components.
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      const px = this.predicted[i3];
      const py = this.predicted[i3 + 1];
      const pz = this.predicted[i3 + 2];

      let omegaX = 0, omegaY = 0, omegaZ = 0;
      const neighbors = this.neighborhood.query(px, py, pz);

      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        if (j === i) continue;
        const j3 = j * 3;
        const dx = px - this.predicted[j3];
        const dy = py - this.predicted[j3 + 1];
        const dz = pz - this.predicted[j3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > H2 || distSq < 1e-12) continue;
        const dist = Math.sqrt(distSq);
        const grad = spikyGrad(dist);
        const gx = grad * dx / dist;
        const gy = grad * dy / dist;
        const gz = grad * dz / dist;

        // (v_j - v_i) × ∇W(r_ij)
        const vx = this.velocities[j3]     - this.velocities[i3];
        const vy = this.velocities[j3 + 1] - this.velocities[i3 + 1];
        const vz = this.velocities[j3 + 2] - this.velocities[i3 + 2];

        omegaX += (vy * gz - vz * gy) * PARTICLE_MASS / this.densities[j];
        omegaY += (vz * gx - vx * gz) * PARTICLE_MASS / this.densities[j];
        omegaZ += (vx * gy - vy * gx) * PARTICLE_MASS / this.densities[j];
      }

      // Apply confinement force: ε * (N × ω) where N = ∇|ω| / |∇|ω||
      const omegaMag = Math.sqrt(omegaX * omegaX + omegaY * omegaY + omegaZ * omegaZ);
      if (omegaMag > 1e-6) {
        const nx = omegaX / omegaMag;
        const ny = omegaY / omegaMag;
        const nz = omegaZ / omegaMag;
        // Cross product N × ω
        const fx = ny * omegaZ - nz * omegaY;
        const fy = nz * omegaX - nx * omegaZ;
        const fz = nx * omegaY - ny * omegaX;
        this.velocities[i3]     += VORTICITY_EPS * fx * dt;
        this.velocities[i3 + 1] += VORTICITY_EPS * fy * dt;
        this.velocities[i3 + 2] += VORTICITY_EPS * fz * dt;
      }
    }
  }

  _xsphViscosity(dt) {
    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      const px = this.predicted[i3];
      const py = this.predicted[i3 + 1];
      const pz = this.predicted[i3 + 2];

      let vCorrX = 0, vCorrY = 0, vCorrZ = 0;
      const neighbors = this.neighborhood.query(px, py, pz);

      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        if (j === i) continue;
        const j3 = j * 3;
        const dx = px - this.predicted[j3];
        const dy = py - this.predicted[j3 + 1];
        const dz = pz - this.predicted[j3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > H2 || distSq < 1e-12) continue;
        const dist = Math.sqrt(distSq);
        const w = poly6(dist);

        vCorrX += (this.velocities[j3]     - this.velocities[i3])     * w;
        vCorrY += (this.velocities[j3 + 1] - this.velocities[i3 + 1]) * w;
        vCorrZ += (this.velocities[j3 + 2] - this.velocities[i3 + 2]) * w;
      }

      const c = VISCOSITY * dt;
      this.velocities[i3]     += c * vCorrX;
      this.velocities[i3 + 1] += c * vCorrY;
      this.velocities[i3 + 2] += c * vCorrZ;
    }
  }

  // ── Step 7: Container boundaries ──

  _enforceBounds() {
    const minX = CONTAINER_MIN;
    const maxX = CONTAINER_MAX;
    const minZ = CONTAINER_MIN;
    const maxZ = CONTAINER_MAX;
    const maxY = CONTAINER_HEIGHT;
    const minY = -0.3;
    const damping = -0.5; // bounce restitution

    for (let i = 0; i < this.activeCount; i++) {
      const i3 = i * 3;
      let x = this.predicted[i3];
      let y = this.predicted[i3 + 1];
      let z = this.predicted[i3 + 2];

      // X walls
      if (x < minX) { x = minX; this.velocities[i3] *= damping; }
      if (x > maxX) { x = maxX; this.velocities[i3] *= damping; }
      // Z walls
      if (z < minZ) { z = minZ; this.velocities[i3 + 2] *= damping; }
      if (z > maxZ) { z = maxZ; this.velocities[i3 + 2] *= damping; }
      // Floor (Y)
      if (y < minY) { y = minY; this.velocities[i3 + 1] *= damping; }
      // Ceiling (Y)
      if (y > maxY) { y = maxY; this.velocities[i3 + 1] *= damping; }

      this.predicted[i3]     = x;
      this.predicted[i3 + 1] = y;
      this.predicted[i3 + 2] = z;
    }
  }

  // ── Step 8: Swap buffers ──

  _swapPositions() {
    for (let i = 0; i < this.activeCount * 3; i++) {
      this.positions[i] = this.predicted[i];
    }
  }

  // ── Utility ──

  /** Reset all particles (keep max count). */
  reset() {
    this.activeCount = 0;
  }

  /**
   * Get the number of particles currently active.
   * @returns {number}
   */
  get count() { return this.activeCount; }

  /**
   * Set container bounds.
   * @param {number} min
   * @param {number} max
   * @param {number} [height]
   */
  setBounds(min, max, height = CONTAINER_HEIGHT) {
    // These are used in _enforceBounds — store as module-level or update constants
    // For now the constants are used directly; this method is a placeholder.
    console.log(`[SPHSolver] Bounds set: ${min}–${max}, height ${height}`);
  }
}
