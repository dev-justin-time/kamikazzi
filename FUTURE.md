# Future Enhancements

This document tracks planned upgrades to address known weaknesses in the current codebase. Each enhancement is a separate, self-contained project with its own scope, approach, and success criteria.

---

## 1. SPH Fluid Simulation

**Status:** 🔮 Planned
**Priority:** Medium
**Depends on:** PhysicsSystem refactor

### Current State
`PhysicsSystem.createFluid()` creates a ball-pit of stacked spheres with basic physics bodies. There is no fluid cohesion, surface tension, or incompressibility — it's a particle pile, not a fluid.

### Target
A real Smoothed Particle Hydrodynamics (SPH) solver that simulates:
- Fluid incompressibility via density/pressure constraints
- Surface tension at the fluid-air boundary
- Viscosity for different fluid types (water, honey, oil)
- Particle-neighbor queries for efficient force computation

### Technical Approach

```
kamakazii_studio3D/systems/physics/
├── SPHSolver.js         # Core SPH computation loop
├── SPHParticle.js       # Particle data structure (position, velocity, density, pressure)
├── SPHNeighborhood.js   # Spatial hash for O(1) neighbor lookups
├── SPHKernels.js        # Smoothing kernel functions (Poly6, Spiky, Viscosity)
└── SPHRenderer.js       # Adaptive metaball / screen-space splatting renderer
```

**Integration:** Swap-in via `PhysicsSystem.setSolver('sph')` to replace the existing ball-pit fallback. The existing `createFluid()` signature stays the same.

### Known Challenges
- **Performance:** SPH requires ~50-100 neighbors per particle per timestep. A spatial hash (similar to `VertexSpatialHash` in SculptSystem) is essential.
- **Rendering:** Particles alone look like sand. Screen-space splatting or marching-cubes surface extraction is needed for a liquid appearance.
- **Stability:** Courant condition limits timestep. Adaptive sub-stepping required for stable simulation.

### Success Criteria
- [ ] Water pours from a container and pools on the ground
- [ ] Fluid interacts with existing physics bodies (floats objects, pushes them)
- [ ] Achieves 30+ FPS with 500+ particles on mid-range hardware
- [ ] Toggle between SPH mode and current ball-pit mode

### Resources
- [PBF (Position Based Fluids)](https://matthias-research.github.io/pages/publications/PBF.pdf) — stable, GPU-friendly approach
- [Three.js SPH demo](https://threejs.org/examples/#webgl_physics_cloth) (cloth, but similar constraint patterns)

---

## 2. Sparse Octree Voxel Engine

**Status:** 🔮 Planned
**Priority:** Low
**Depends on:** Core rendering pipeline

### Current State
`CloudSystem.generateVoxelAsset()` creates per-voxel `BoxGeometry` meshes. A 10×10×10 block generates 1,000 individual mesh instances. Vertex count grows linearly with voxel count, making complex models impractical.

### Target
A sparse octree voxel representation where:
- Empty space stores no data (sparse)
- Only surface voxels are triangulated (greedy meshing)
- Supports level-of-detail by traversing the octree at lower depths
- Enables boolean operations (CSG add/subtract/intersect)

### Technical Approach

```
kamakazii_studio3D/systems/voxel/
├── Octree.js            # Sparse octree data structure
├── VoxelWorld.js        # World manager (chunks, loading, editing)
├── GreedyMesher.js      # Culled surface mesh generation from octree
├── VoxelBrush.js        # Add/remove voxels with shape brushes
└── VoxelRenderer.js     # Instanced mesh or custom shader chunk renderer
```

**Integration:** Replace `CloudSystem.generateVoxelAsset()` with octree-backed world. The existing procedural generators become brush presets that write into the octree.

### Known Challenges
- **Memory:** Octree nodes have overhead. Chunked loading (16³ or 32³ sub-volumes) keeps memory manageable.
- **Meshing:** Greedy meshing across chunk boundaries requires careful seam handling.
- **Networking:** If cloud sync is added, diff-based sync of octree changes is more efficient than full mesh transfer.

### Success Criteria
- [ ] Create a 64×64×64 voxel world at < 50MB memory
- [ ] Add/remove voxels with real-time mesh updates
- [ ] Greedy meshing produces < 10% of naive per-voxel face count
- [ ] Export to GLB for use in the main scene
- [ ] LOD: view entire world from afar, see detail up close

### Resources
- [Transvoxel Algorithm](http://transvoxel.org/) — seamless LOD transitions
- [MagicaVoxel file format](https://github.com/ephtracy/voxel-model) — import/export compatibility

---

## 3. Auto-Retopology Engine

**Status:** 🔮 Planned
**Priority:** Low
**Depends on:** WebAssembly runtime support

### Current State
The Plugin system has a stub `plugins.set('auto-retopology', { execute: () => this.ui.log('Retopology simulated', 'success') })`. It does nothing.

### Target
A real retopology engine that converts high-poly sculpts into clean, animatable low-poly meshes with:
- Quad-dominant topology with edge loops
- Adaptive tessellation (more detail in high-curvature areas)
- Symmetry preservation
- UV-friendly topology (minimal stretching)

### Technical Approach

```
kamakazii_studio3D/systems/retopology/
├── RetopologyEngine.js     # Main orchestrator
├── Remesher.js             # Voxel-based or particle-based remeshing
├── Quadrangulator.js       # Convert triangle mesh to quads
├── Decimator.js            # Quality-controlled polygon reduction
└── RetopologyWorker.js     # Runs in WebWorker to avoid blocking
```

**Integration:** The existing `auto-retopology` plugin entry point wires to this engine. UI shows progress via the existing progress indicator.

### Known Challenges
- **Compute intensity:** Retopology is CPU-bound. A WebAssembly solver (e.g., Instant Meshes algorithm ported via Emscripten) is the only viable browser approach.
- **Quality:** Automated retopology rarely matches manual edge flow. The results should be a "good starting point" rather than production-ready.
- **Dependency:** WebAssembly requires either a WASM binary shipped with the app or a CDN-hosted solver.

### Candidate Libraries
- [Instant Meshes](https://github.com/wjakob/instant-meshes) — C++ implementation, has WASM compilation targets
- [MeshLib](https://github.com/MeshInspector/MeshLib) — comprehensive geometry processing with WASM support
- [Manifold](https://github.com/elalish/manifold) — fast boolean operations and remeshing in WASM

### Success Criteria
- [ ] Reduce a 100K-triangle sculpt to 5K triangles while preserving shape
- [ ] Result is manifold (watertight, no holes)
- [ ] Maintain UV coordinates if source has them
- [ ] Runs in under 10 seconds for 100K → 5K on mid-range hardware
- [ ] Exposed as a Plugin with progress reporting

---

## 4. Implementation Priority

| Enhancement | Effort | Impact | Dependencies | Recommended Sprint |
|------------|--------|--------|-------------|-------------------|
| SPH Fluid | ⭐⭐⭐⭐ | Medium | PhysicsSystem stable | After Phase 6 |
| Voxel Engine | ⭐⭐⭐⭐⭐ | High | Build pipeline | After basic kamakazii_studio3D release |
| Auto-Retopology | ⭐⭐⭐⭐ | Medium | WASM build infra | After Voxel Engine |

---

## 5. How to Contribute

Each enhancement has its own directory structure under `systems/`. To start work on one:

1. Create the directory structure shown above
2. Implement the core algorithm in isolation (test with a standalone HTML page)
3. Integrate into `EditorState` via a new system class
4. Wire UI controls via a new page or existing page extension
5. Update this FUTURE.md with implementation notes

**Before starting any enhancement**, ensure the base `kamakazii_studio3D/` app (Phase 1-6) is stable and all existing `studio/pro/` features are merged.
