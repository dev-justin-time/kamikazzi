/**
 * Selection Tools — Transform modes, Snap, Frame
 */
const meta = {
  controls: [
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
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Snap ──
    { key: 'snap', label: 'Snap Selected to Grid', type: 'button', onClick: () => window.ProModelerApp?.snapToGrid() },
    { key: 'sep3', label: '──────────', type: 'label' },
    // ── Frame ──
    { key: 'frame',     label: 'Frame Selected', type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'frame-all', label: 'Frame All',      type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
    { key: 'sep4', label: '──────────', type: 'label' },
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
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
