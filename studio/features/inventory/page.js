/**
 * Inventory — Asset library, materials, textures browser
 * Browse and apply materials to selected objects.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Apply materials and textures to the selected object:' },
    { key: 'sep1', label: '──────────', type: 'label' },
    // ── Material Presets ──
    { key: 'mat-chrome', label: 'Chrome',  type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('chrome') },
    { key: 'mat-gold',   label: 'Gold',    type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('gold') },
    { key: 'mat-plastic',label: 'Plastic', type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('plastic') },
    { key: 'mat-rubber', label: 'Rubber',  type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('rubber') },
    { key: 'mat-wood',   label: 'Wood',    type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('wood') },
    { key: 'mat-glass',  label: 'Glass',   type: 'button', onClick: () => window.ProModelerApp?.applyMaterial('glass') },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Object Info ──
    { key: 'obj-name', type: 'label', label: 'Select an object to see its properties here.' },
    {
      key: 'refresh',
      label: 'Refresh Object Info',
      type: 'button',
      onClick: () => {
        const app = window.ProModelerApp;
        // Find the label element with data-key="obj-name" inside the popup
        const el = document.querySelector('#popupContent [data-key="obj-name"] .ctrl-label');
        if (el && app?.selectedObject) {
          const o = app.selectedObject;
          const faces = o.geometry?.index ? (o.geometry.index.count / 3) : 'N/A';
          const name = o.name || 'unnamed';
          el.textContent = `${name} — ${faces} faces`;
        } else if (el) {
          el.textContent = 'No object selected. Click an object in the viewport first.';
        }
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
