/**
 * Paint Tools — Color, brush controls, paint mode
 * Note: Full paint system requires loading the full engine (engine.js) which has
 * TexturePaintSystem and VertexPaintSystem. The slim Studio has basic material
 * editing available in the Texture page.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Paint mode requires the full engine.' },
    { key: 'sep1', label: '──────────', type: 'label' },
    {
      key: 'paint-color',
      label: 'Brush Color',
      type: 'color',
      default: '#ff4444',
      description: 'Color used for vertex painting (full engine required)',
      onChange: (val) => {
        const state = window.__paintState || (window.__paintState = {});
        state.color = val;
      },
    },
    {
      key: 'paint-size',
      label: 'Brush Size',
      type: 'slider',
      min: 0.1, max: 3, step: 0.1, default: 0.5,
      description: 'Radius of the paint brush in scene units',
      onChange: (val) => {
        const state = window.__paintState || (window.__paintState = {});
        state.size = val;
      },
    },
    {
      key: 'paint-opacity',
      label: 'Brush Opacity',
      type: 'slider',
      min: 0, max: 1, step: 0.05, default: 1,
      onChange: (val) => {
        const state = window.__paintState || (window.__paintState = {});
        state.opacity = val;
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'paint-apply', label: 'Apply Color to Selected', type: 'button', onClick: () => {
      const app = window.ProModelerApp;
      const state = window.__paintState || {};
      if (app?.selectedObject?.material) {
        app.selectedObject.material.color.set(state.color || '#ff4444');
        app.selectedObject.material.needsUpdate = true;
        app.render();
      }
    }},
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
