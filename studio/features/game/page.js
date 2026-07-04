/**
 * Game Tools — Scene stats, LOD generation, collider helpers, optimization, export
 */
function _getApp() { return window.ProModelerApp; }

function _refreshUI() {
  const app = _getApp();
  // Update scene stats
  const statsEl = document.querySelector('#popupContent [data-key="scene-stats"] .ctrl-label');
  if (statsEl && app) {
    const s = app.getSceneStats();
    statsEl.textContent =
      `Objects: ${s.objects} · Meshes: ${s.meshes} · Groups: ${s.groups} · Lights: ${s.lights}\n` +
      `Vertices: ${s.vertices.toLocaleString()} · Faces: ${s.faces.toLocaleString()}`;
    statsEl.style.whiteSpace = 'pre';
  }
  // Update collider toggle button
  const collBtn = document.querySelector('#popupContent [data-key="colliders-toggle"] .ctrl-button');
  if (collBtn && app) {
    collBtn.textContent = app._showColliders ? '🟢 Colliders ON' : '🔴 Colliders OFF';
  }
}

const meta = {
  controls: [
    // ── Scene Stats ──
    { key: 'info-stats', type: 'label', label: 'Scene Statistics:' },
    { key: 'scene-stats', type: 'label', label: 'Select an object to see stats' },
    {
      key: 'refresh-stats',
      label: '🔄 Refresh Stats',
      type: 'button',
      onClick: () => { _refreshUI(); },
    },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── LOD ──
    { key: 'info-lod', type: 'label', label: 'LOD Generation:' },
    {
      key: 'gen-lod',
      label: '📉 Generate LOD (simplified)',
      type: 'button',
      onClick: () => {
        _getApp()?.generateLOD();
        _refreshUI();
      },
    },
    {
      key: 'group-objects',
      label: '🔗 Group Others Under Selected',
      type: 'button',
      onClick: () => {
        _getApp()?.groupSelected();
        _refreshUI();
      },
    },
    {
      key: 'ungroup-objects',
      label: '🔓 Ungroup Children to Scene',
      type: 'button',
      onClick: () => {
        _getApp()?.ungroupSelected();
        _refreshUI();
      },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Collider Helpers ──
    { key: 'info-colliders', type: 'label', label: 'Collider Visualization:' },
    {
      key: 'collider-box',
      label: '📦 Add Box Collider',
      type: 'button',
      onClick: () => { _getApp()?.addColliderHelper('box'); },
    },
    {
      key: 'collider-sphere',
      label: '⚪ Add Sphere Collider',
      type: 'button',
      onClick: () => { _getApp()?.addColliderHelper('sphere'); },
    },
    {
      key: 'colliders-toggle',
      label: '🟢 Colliders ON',
      type: 'button',
      onClick: () => {
        _getApp()?.toggleColliderHelpers();
        _refreshUI();
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Export ──
    { key: 'info-export', type: 'label', label: 'Export (selected or whole scene):' },
    { key: 'export-glb',  label: 'Export Selected as GLB',  type: 'button', onClick: () => _getApp()?.exportModel('glb') },
    { key: 'export-gltf', label: 'Export Selected as GLTF', type: 'button', onClick: () => _getApp()?.exportModel('gltf') },
    { key: 'export-obj',  label: 'Export Selected as OBJ',  type: 'button', onClick: () => _getApp()?.exportModel('obj') },
    { key: 'export-stl',  label: 'Export Selected as STL',  type: 'button', onClick: () => _getApp()?.exportModel('stl') },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Utilities ──
    { key: 'frame-all', label: 'Frame All Objects', type: 'button', onClick: () => _getApp()?.frameAll() },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info-tip1', type: 'label', label: '💡 Tips:' },
    { key: 'info-tip2', type: 'label', label: '  • LOD = Level of Detail. Creates a simplified copy with fewer polygons.' },
    { key: 'info-tip3', type: 'label', label: '  • Colliders show bounding volumes for physics/collision detection.' },
    { key: 'info-tip4', type: 'label', label: '  • Group/ungroup organizes objects in the scene hierarchy.' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
