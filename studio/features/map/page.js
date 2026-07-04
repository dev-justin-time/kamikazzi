/**
 * Map Editor — Terrain generation with parameter controls
 * Seed, amplitude, ridge count, segment resolution, and noise amount sliders.
 */
function _getApp() { return window.ProModelerApp; }

const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Valley Generator Parameters:' },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Seed ──
    {
      key: 'valley-seed',
      label: 'Seed',
      type: 'slider',
      min: 0, max: 9999, step: 1, default: 0,
      description: 'Random seed for reproducible terrain (0 = unique each time)',
      onChange: (val) => { _getApp()?.setValleyParam('seed', val); },
    },
    // ── Amplitude ──
    {
      key: 'valley-amp',
      label: 'Amplitude',
      type: 'slider',
      min: 0.5, max: 5, step: 0.1, default: 2.5,
      description: 'Depth of the valley — higher values create deeper canyons',
      onChange: (val) => { _getApp()?.setValleyParam('amplitude', val); },
    },
    // ── Ridge Count ──
    {
      key: 'valley-ridges',
      label: 'Ridge Count',
      type: 'slider',
      min: 0, max: 8, step: 1, default: 3,
      description: 'Number of sinusoidal ridges along the valley walls',
      onChange: (val) => { _getApp()?.setValleyParam('ridgeCount', val); },
    },
    // ── Segments ──
    {
      key: 'valley-seg',
      label: 'Segments',
      type: 'slider',
      min: 12, max: 128, step: 2, default: 48,
      description: 'Geometry resolution — higher = smoother terrain but more vertices',
      onChange: (val) => { _getApp()?.setValleyParam('segments', val); },
    },
    // ── Noise Amount ──
    {
      key: 'valley-noise',
      label: 'Noise Amount',
      type: 'slider',
      min: 0, max: 0.5, step: 0.01, default: 0.15,
      description: 'Amount of random height variation for organic feel',
      onChange: (val) => { _getApp()?.setValleyParam('noiseAmount', val); },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Generate Button ──
    {
      key: 'gen-valley',
      label: '🏔 Generate Wireframe Valley',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app) return;
        // If seed is 0, randomize for this generation but restore so next click re-randomizes
        const seedWasZero = app._valleyParams.seed === 0;
        if (seedWasZero) {
          app._valleyParams.seed = Math.floor(Math.random() * 9999) + 1;
        }
        app.generateWireframeValley();
        if (seedWasZero) {
          app._valleyParams.seed = 0;
          // Also update the slider value back to 0
          const slider = document.querySelector('#popupContent [data-key="valley-seed"] input');
          if (slider) slider.value = 0;
        }
      },
    },

    // ── Randomize Seed ──
    {
      key: 'rand-seed',
      label: '🎲 Randomize Seed',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app) return;
        const newSeed = Math.floor(Math.random() * 9999) + 1;
        app._valleyParams.seed = newSeed;
        // Update the slider display
        const slider = document.querySelector('#popupContent [data-key="valley-seed"] input');
        if (slider) { slider.value = newSeed; slider.dispatchEvent(new Event('input')); }
      },
    },
    { key: 'sep1b', label: '──────────', type: 'label' },

    // ── City Scatter ──
    {
      key: 'scatter-city',
      label: '🌆 Scatter City on Valley',
      type: 'button',
      onClick: () => { _getApp()?.scatterCity(); },
    },
    // ── Building Gap ──
    {
      key: 'building-gap',
      label: 'Minimum Gap',
      type: 'slider',
      min: 0, max: 2, step: 0.05, default: 0,
      description: 'Padding around each building to prevent crowding (expands the collision footprint)',
      onChange: (val) => { _getApp()?.setValleyParam('buildingGap', val); },
    },
    // ── Street Grid ──
    {
      key: 'street-interval',
      label: 'Street Interval',
      type: 'slider',
      min: 0, max: 10, step: 1, default: 0,
      description: 'Every N grid cells, carve a street (0 = no streets, organic layout)',
      onChange: (val) => { _getApp()?.setValleyParam('streetInterval', val); },
    },
    {
      key: 'street-width',
      label: 'Street Width',
      type: 'slider',
      min: 1, max: 4, step: 1, default: 1,
      description: 'How many cell widths the street occupies',
      onChange: (val) => { _getApp()?.setValleyParam('streetWidth', val); },
    },
    { key: 'sep-street', label: '──────────', type: 'label' },

    // ── Building Batch Select ──
    {
      key: 'select-buildings',
      label: '🏢 Select All Buildings',
      type: 'button',
      onClick: () => { _getApp()?.selectAllBuildings(); },
    },
    {
      key: 'collision-grid',
      label: '🔲 Toggle Collision Grid',
      type: 'button',
      onClick: () => { _getApp()?.toggleCollisionGrid(); },
    },
    { key: 'sep1ba', label: '──────────', type: 'label' },

    // ── Utility Buttons ──
    { key: 'frame-all', label: 'Frame All', type: 'button', onClick: () => _getApp()?.frameAll() },
    { key: 'snap', label: 'Snap Selected to Grid', type: 'button', onClick: () => _getApp()?.snapToGrid() },
    { key: 'sep1c', label: '──────────', type: 'label' },

    // ── Export ──
    { key: 'export-valley-gltf', label: '📤 Export Valley as GLTF', type: 'button', onClick: () => { _getApp()?.exportValleyAsGLTF(); }},
    { key: 'export-valley-glb',  label: '📤 Export Valley as GLB',  type: 'button', onClick: () => { _getApp()?.exportValleyAsGLB(); }},
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Map Maker ──
    { key: 'open-map-maker', label: 'Open Map Maker (new tab)', type: 'button', onClick: () => {
      window.open('/studio/tools/map-maker/index.html', '_blank');
    }},
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-terrain', type: 'label', label: '  • Procedural terrain generation' },
    { key: 'info-biome',   type: 'label', label: '  • Biome painting' },
    { key: 'info-deco',    type: 'label', label: '  • Decoration scattering' },
    { key: 'info-minimap', type: 'label', label: '  • Minimap rendering' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
