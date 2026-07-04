/**
 * Game Tools — Export scene for game engines, physics setup
 * Note: Full game export requires the full engine with PhysicsSystem.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Export your 3D scene for use in game engines:' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'export-glb',  label: 'Export Scene as GLB',  type: 'button', onClick: () => window.ProModelerApp?.exportModel('glb') },
    { key: 'export-gltf', label: 'Export Scene as GLTF', type: 'button', onClick: () => window.ProModelerApp?.exportModel('gltf') },
    { key: 'export-obj',  label: 'Export Scene as OBJ',  type: 'button', onClick: () => window.ProModelerApp?.exportModel('obj') },
    { key: 'export-stl',  label: 'Export Scene as STL',  type: 'button', onClick: () => window.ProModelerApp?.exportModel('stl') },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'frame-all', label: 'Frame All Objects', type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-physics', type: 'label', label: '  • Rigid body physics setup' },
    { key: 'info-navmesh', type: 'label', label: '  • Navmesh generation' },
    { key: 'info-lod', type: 'label', label: '  • LOD generation' },
    { key: 'info-lightmap', type: 'label', label: '  • Lightmap baking' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
