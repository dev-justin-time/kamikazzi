/**
 * SPHParticle — data structure for a single SPH fluid particle.
 *
 * Each particle carries the standard SPH attributes plus PBF (Position Based
 * Fluids) constraint data.  Positions and velocities are stored as plain
 * Float32Arrays so the solver can work with them cache-efficiently.
 *
 * @see PBF: https://matthias-research.github.io/pages/publications/PBF.pdf
 */

export class SPHParticle {
  /**
   * @param {number} index  Global index in the solver's flat arrays
   * @param {number} x      Initial X position
   * @param {number} y      Initial Y position
   * @param {number} z      Initial Z position
   */
  constructor(index, x, y, z) {
    this.index = index;

    // ── Position & predicted position (PBF) ──
    /** @type {Float32Array}  Current (frame-start) position, length 3 */
    this.position = new Float32Array([x, y, z]);
    /** @type {Float32Array}  Predicted position after external forces, length 3 */
    this.predicted = new Float32Array([x, y, z]);
    /** @type {Float32Array}  Velocity, length 3 */
    this.velocity = new Float32Array([0, 0, 0]);

    // ── SPH state ──
    this.density = 0;         // ρ — current fluid density
    this.densityPrev = 0;     // ρ_prev — density from previous timestep
    this.pressure = 0;        // p — fluid pressure at this particle
    this.lambda = 0;          // λ — PBF Lagrange multiplier (position correction scale)

    // ── Per-particle constraint data ──
    this.deltaP = new Float32Array([0, 0, 0]);  // Position correction from constraints
    this.neighborCount = 0;   // Number of neighbors found in current frame

    // ── Debug / visualisation ──
    this.color = new Float32Array([0.3, 0.6, 1.0]); // Default water blue
  }

  /** Copy initial position into a target array at offset (convenience for flat buffers). */
  writePositionTo(array, offset) {
    array[offset]     = this.position[0];
    array[offset + 1] = this.position[1];
    array[offset + 2] = this.position[2];
  }

  /** Copy current position into caller's Vector3 (for rendering). */
  readPosition(out) {
    out.set(this.position[0], this.position[1], this.position[2]);
    return out;
  }

  /** Reset to a given position (used when recycling particles). */
  reset(x, y, z) {
    this.position[0] = x; this.position[1] = y; this.position[2] = z;
    this.predicted[0] = x; this.predicted[1] = y; this.predicted[2] = z;
    this.velocity[0] = 0; this.velocity[1] = 0; this.velocity[2] = 0;
    this.density = 0;
    this.pressure = 0;
    this.lambda = 0;
    this.deltaP[0] = 0; this.deltaP[1] = 0; this.deltaP[2] = 0;
    this.neighborCount = 0;
  }
}

/** Rest density of water (~1000 kg/m³ in world units, scaled for the sim). */
export const REST_DENSITY = 1000;

/** Gas constant — controls pressure stiffness (higher = stiffer fluid). */
export const GAS_CONSTANT = 2000;

/** Particle mass — all particles share the same mass. */
export const PARTICLE_MASS = 1.0;

/** Viscosity constant. */
export const VISCOSITY = 0.002;

/** Surface-tension coefficient. */
export const SURFACE_TENSION = 0.0001;

/** Fixed timestep for the SPH simulation. */
export const TIMESTEP = 1 / 60;

/** Maximum number of neighbours per particle (for pre-allocation). */
export const MAX_NEIGHBORS = 80;
