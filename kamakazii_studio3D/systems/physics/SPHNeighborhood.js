/**
 * SPHNeighborhood — Spatial hash grid for O(1) neighbor lookups.
 *
 * Each cell stores a list of particle indices that currently fall within
 * it.  The grid is rebuilt every timestep by clearing all cells and
 * re-inserting every particle.
 *
 * Cell size is set to the SPH kernel radius *h* so that neighbour queries
 * only need to check the 3×3×3 block of cells centred on the query point.
 *
 * @see Teschner et al. (2003) "Optimized Spatial Hashing for Collision
 *      Detection of Deformable Objects"
 */

/** Default grid cell size (matches default kernel radius). */
const CELL_SIZE = 0.08;

/**
 * Simple hash: combine three integers into a single key.
 * This is not a perfect hash but works well enough for a fixed grid extent.
 */
function hashCell(cx, cy, cz) {
  // Large primes to reduce collisions
  return (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
}

export class SPHNeighborhood {
  /**
   * @param {number} cellSize  Size of each grid cell (typically kernel radius)
   * @param {number} capacity  Max expected particles (pre-allocates map)
   */
  constructor(cellSize = CELL_SIZE, capacity = 2000) {
    /** @type {number} */
    this.cellSize = cellSize;
    /** @type {number} */
    this.invCellSize = 1 / cellSize;

    /**
     * Spatial map: cell hash → array of particle indices.
     * Using a plain object (not Map) for faster get/set with numeric keys.
     * @type {Record<number, number[]>}
     */
    this.cells = Object.create(null);

    /**
     * Reusable arrays for query results (avoids allocation per query).
     * @type {number[]}
     */
    this._queryResult = [];

    /** @type {number} */
    this._capacity = capacity;
  }

  // ── Grid management ──

  /** Remove all particles from the grid. */
  clear() {
    this.cells = Object.create(null);
  }

  /**
   * Insert a particle index at the given world position.
   * @param {number} idx  Particle index
   * @param {number} x    World X
   * @param {number} y    World Y
   * @param {number} z    World Z
   */
  insert(idx, x, y, z) {
    const cx = Math.floor(x * this.invCellSize);
    const cy = Math.floor(y * this.invCellSize);
    const cz = Math.floor(z * this.invCellSize);
    const key = hashCell(cx, cy, cz);
    if (!this.cells[key]) this.cells[key] = [];
    this.cells[key].push(idx);
  }

  /**
   * Rebuild the entire grid from a flat position array.
   * Particles that have left the valid range are still inserted (the
   * caller should clamp them before calling rebuild).
   *
   * @param {Float32Array} pos  Flat array of xyzxyz… positions, length = count×3
   * @param {number} count       Number of particles
   */
  rebuild(pos, count) {
    this.clear();
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      this.insert(i, pos[i3], pos[i3 + 1], pos[i3 + 2]);
    }
  }

  // ── Queries ──

  /**
   * Return all particle indices whose cell overlaps the 3×3×3 region
   * around the given world position.  Duplicates are possible if the
   * hash collides; the caller should de-duplicate with a Set.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number[]} [out]  Optional array to fill (reused each call)
   * @returns {number[]}  Neighbour candidates (may include self)
   */
  query(x, y, z, out) {
    const result = out || this._queryResult;
    result.length = 0;

    const cx0 = Math.floor(x * this.invCellSize) - 1;
    const cy0 = Math.floor(y * this.invCellSize) - 1;
    const cz0 = Math.floor(z * this.invCellSize) - 1;

    for (let cx = cx0; cx < cx0 + 3; cx++) {
      for (let cy = cy0; cy < cy0 + 3; cy++) {
        for (let cz = cz0; cz < cz0 + 3; cz++) {
          const key = hashCell(cx, cy, cz);
          const cell = this.cells[key];
          if (cell) {
            for (let k = 0; k < cell.length; k++) {
              result.push(cell[k]);
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Count neighbours within a given radius squared (without collecting
   * them).  Used during density computation to avoid allocations.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} radiusSq  Squared search radius (typically h²)
   * @param {Float32Array} positions  Flat position array
   * @param {number} selfIdx  Index of the query particle (to skip self)
   * @returns {number}  Number of neighbours (excluding self)
   */
  countNearby(x, y, z, radiusSq, positions, selfIdx) {
    let count = 0;
    const cx0 = Math.floor(x * this.invCellSize) - 1;
    const cy0 = Math.floor(y * this.invCellSize) - 1;
    const cz0 = Math.floor(z * this.invCellSize) - 1;

    for (let cx = cx0; cx < cx0 + 3; cx++) {
      for (let cy = cy0; cy < cy0 + 3; cy++) {
        for (let cz = cz0; cz < cz0 + 3; cz++) {
          const key = hashCell(cx, cy, cz);
          const cell = this.cells[key];
          if (!cell) continue;
          for (let k = 0; k < cell.length; k++) {
            const ni = cell[k];
            if (ni === selfIdx) continue;
            const ni3 = ni * 3;
            const dx = positions[ni3]     - x;
            const dy = positions[ni3 + 1] - y;
            const dz = positions[ni3 + 2] - z;
            if (dx * dx + dy * dy + dz * dz <= radiusSq) count++;
          }
        }
      }
    }
    return count;
  }
}
