/**
 * Map Editor — Terrain generation, level editing
 * Note: Full procedural generation requires the full engine with ProceduralSystem.
 * The Map Maker tool is available separately in studio/tools/map-maker/.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Terrain and level generation tools.' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'frame-all', label: 'Frame All', type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
    { key: 'snap', label: 'Snap Selected to Grid', type: 'button', onClick: () => window.ProModelerApp?.snapToGrid() },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'open-map-maker', label: 'Open Map Maker (new tab)', type: 'button', onClick: () => {
      window.open('/studio/tools/map-maker/index.html', '_blank');
    }},
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-terrain', type: 'label', label: '  • Procedural terrain generation' },
    { key: 'info-biome', type: 'label', label: '  • Biome painting' },
    { key: 'info-deco', type: 'label', label: '  • Decoration scattering' },
    { key: 'info-minimap', type: 'label', label: '  • Minimap rendering' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
