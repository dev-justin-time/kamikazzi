/**
 * Paint Tools — Vertex painting with raycaster, paint mode toggle, brush controls
 */
function _getApp() { return window.ProModelerApp; }

function _refreshUI() {
  const app = _getApp();
  const modeBtn = document.querySelector('#popupContent [data-key="paint-mode"] .ctrl-button');
  if (modeBtn && app) {
    modeBtn.textContent = app.isPaintMode ? '🎨 Painting... Click to Exit' : '🎨 Enter Paint Mode';
    modeBtn.style.background = app.isPaintMode ? '#ef4444' : '#4a9eff';
  }
}

const meta = {
  controls: [
    // ── Paint Mode Toggle ──
    {
      key: 'paint-mode',
      label: '🎨 Enter Paint Mode',
      type: 'button',
      onClick: () => {
        _getApp()?.togglePaintMode();
        _refreshUI();
      },
    },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Brush Settings ──
    { key: 'info-brush', type: 'label', label: 'Brush Settings:' },
    {
      key: 'paint-color',
      label: 'Brush Color',
      type: 'color',
      default: '#ff4444',
      description: 'Color applied when painting on a mesh',
      onChange: (val) => { _getApp()?.setPaintColor(val); },
    },
    {
      key: 'paint-size',
      label: 'Brush Size',
      type: 'slider',
      min: 0.05, max: 3, step: 0.05, default: 0.5,
      description: 'Radius of the paint brush in scene units',
      onChange: (val) => { _getApp()?.setPaintSize(val); },
    },
    {
      key: 'paint-opacity',
      label: 'Brush Opacity',
      type: 'slider',
      min: 0, max: 1, step: 0.05, default: 1,
      description: 'How strongly the color is applied',
      onChange: (val) => { _getApp()?.setPaintOpacity(val); },
    },
    {
      key: 'paint-hardness',
      label: 'Brush Hardness',
      type: 'slider',
      min: 0, max: 1, step: 0.05, default: 1,
      description: 'Edge falloff: 1 = hard edge, 0 = soft gradient',
      onChange: (val) => { _getApp()?.setPaintHardness(val); },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Quick Actions ──
    {
      key: 'apply-color',
      label: '🎨 Apply Color to Selected (Solid)',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app?.selectedObject?.material) {
          app.pushUndo();
          app.selectedObject.material.color.set(app._paintColor || '#ff4444');
          app.selectedObject.material.needsUpdate = true;
          app.render();
          log('Color applied to selected object');
        }
      },
    },
    {
      key: 'reset-vertex-colors',
      label: '↺ Reset Vertex Colors (white)',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        const obj = app?.selectedObject;
        if (obj?.isMesh && obj.geometry?.attributes.color) {
          app.pushUndo();
          const colors = obj.geometry.attributes.color;
          for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 1, 1, 1);
          colors.needsUpdate = true;
          obj.geometry.computeVertexNormals();
          log('Vertex colors reset to white');
        } else {
          log('Selected object has no vertex colors', 'error');
        }
      },
    },
    {
      key: 'enable-vertex-colors',
      label: '🔧 Enable Vertex Colors on Selected',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        const obj = app?.selectedObject;
        if (obj?.isMesh && obj.geometry) {
          app.pushUndo();
          const colors = new Float32Array(obj.geometry.attributes.position.count * 3);
          for (let i = 0; i < colors.length; i++) colors[i] = 1;
          obj.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          if (obj.material) {
            obj.material.vertexColors = true;
            obj.material.needsUpdate = true;
          }
          log('Vertex colors enabled');
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Tips ──
    { key: 'info-tip1', type: 'label', label: '💡 How to paint:' },
    { key: 'info-tip2', type: 'label', label: '1. Select a mesh in the scene' },
    { key: 'info-tip3', type: 'label', label: '2. Click "Enable Vertex Colors" first' },
    { key: 'info-tip4', type: 'label', label: '3. Click "Enter Paint Mode"' },
    { key: 'info-tip5', type: 'label', label: '4. Click on the mesh to paint' },
    { key: 'info-tip6', type: 'label', label: '5. Adjust brush size/opacity/hardness' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
