/**
 * Lighting — Add lights, manage existing, control intensity and color
 */
const meta = {
  controls: [
    // ── Add Lights ──
    { key: 'add-point',       label: 'Add Point Light',      type: 'button', onClick: () => window.ProModelerApp?.addLight('point') },
    { key: 'add-directional', label: 'Add Directional Light', type: 'button', onClick: () => window.ProModelerApp?.addLight('directional') },
    { key: 'sep1', label: '──────────', type: 'label' },
    // ── Ambient Intensity ──
    {
      key: 'ambient',
      label: 'Ambient Intensity',
      type: 'slider',
      min: 0, max: 2, step: 0.05, default: 0.4,
      description: 'Global ambient light level',
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app?.lights?.[0]?.isAmbientLight) {
          app.lights[0].intensity = val;
          app.render();
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Light Info ──
    {
      key: 'light-count',
      label: `Scene lights: ${(() => {
        const app = window.ProModelerApp;
        return app?.lights?.length ?? 0;
      })()}`,
      type: 'label',
    },
    { key: 'info', type: 'label', label: 'Select a light in the viewport to edit its properties in the Texture page.' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
