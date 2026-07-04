/**
 * Texture Tools — Material presets, color picker, metallic/roughness
 */
const meta = {
  controls: [
    { key: 'sep-mats', label: 'Material Presets', type: 'label' },
    { key: 'mat-chrome', label: 'Apply Chrome', type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('chrome') },
    { key: 'mat-gold',   label: 'Apply Gold',   type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('gold') },
    { key: 'mat-plastic',label: 'Apply Plastic',type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('plastic') },
    { key: 'mat-rubber', label: 'Apply Rubber', type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('rubber') },
    { key: 'mat-wood',   label: 'Apply Wood',   type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('wood') },
    { key: 'mat-glass',  label: 'Apply Glass',  type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('glass') },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Color ──
    {
      key: 'color',
      label: 'Base Color',
      type: 'color',
      default: '#ffffff',
      description: 'Sets the base color of the selected object',
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app?.selectedObject?.material) {
          app.selectedObject.material.color.set(val);
          app.selectedObject.material.needsUpdate = true;
          app.render();
        }
      },
    },
    // ── Metallic / Roughness (quick access) ──
    {
      key: 'metallic',
      label: 'Metallic',
      type: 'slider',
      min: 0, max: 1, step: 0.01, default: 0,
      description: 'How metallic the surface appears',
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app?.selectedObject?.material) {
          app.selectedObject.material.metalness = val;
          app.selectedObject.material.needsUpdate = true;
          app.render();
        }
      },
    },
    {
      key: 'roughness',
      label: 'Roughness',
      type: 'slider',
      min: 0, max: 1, step: 0.01, default: 0.5,
      description: 'How rough the surface appears',
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app?.selectedObject?.material) {
          app.selectedObject.material.roughness = val;
          app.selectedObject.material.needsUpdate = true;
          app.render();
        }
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
