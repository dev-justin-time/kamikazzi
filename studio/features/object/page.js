/**
 * Object Tools — Add Primitives, Duplicate, Delete, Transform, Frame
 * Wired to Studio API via window.ProModelerApp
 */
const meta = {
  controls: [
    // ── Add Primitives ──
    { key: 'add-cube',     label: 'Add Cube',     type: 'button', onClick: () => window.ProModelerApp?.addPrimitive('cube') },
    { key: 'add-sphere',   label: 'Add Sphere',   type: 'button', onClick: () => window.ProModelerApp?.addPrimitive('sphere') },
    { key: 'add-cylinder', label: 'Add Cylinder', type: 'button', onClick: () => window.ProModelerApp?.addPrimitive('cylinder') },
    { key: 'add-plane',    label: 'Add Plane',    type: 'button', onClick: () => window.ProModelerApp?.addPrimitive('plane') },
    { key: 'add-torus',    label: 'Add Torus',    type: 'button', onClick: () => window.ProModelerApp?.addPrimitive('torus') },
    { key: 'add-light',    label: 'Add Light (Point)', type: 'button', onClick: () => window.ProModelerApp?.addLight('point') },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Duplicate / Delete / Frame ──
    { key: 'duplicate', label: 'Duplicate Selected', type: 'button', onClick: () => window.ProModelerApp?.duplicateSelected() },
    { key: 'delete',    label: 'Delete Selected',    type: 'button', onClick: () => window.ProModelerApp?.deleteSelected() },
    { key: 'frame',     label: 'Frame Selected',     type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'frame-all', label: 'Frame All',          type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Transform Mode ──
    {
      key: 'transform',
      label: 'Transform Mode',
      type: 'select',
      default: 'move',
      options: [
        { value: 'move',   label: 'Move (Translate)' },
        { value: 'rotate', label: 'Rotate' },
        { value: 'scale',  label: 'Scale' },
      ],
      onChange: (val) => window.ProModelerApp?.setTransformMode(val),
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── View Mode ──
    {
      key: 'viewmode',
      label: 'View Mode',
      type: 'select',
      default: 'solid',
      options: [
        { value: 'solid',     label: 'Solid' },
        { value: 'wireframe', label: 'Wireframe' },
      ],
      onChange: (val) => window.ProModelerApp?.setViewMode(val),
    },
  ],
  onApply: (state, app) => {
    console.log('[Object] OK — settings applied');
  }
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
