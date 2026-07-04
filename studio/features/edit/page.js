/**
 * Edit Tools — Duplicate, Delete, Mirror, Snap
 */
const meta = {
  controls: [
    // ── Undo / Redo ──
    {
      key: 'undo-row',
      label: '',
      type: 'label',
      description: 'Undo/Redo',
    },
    { key: 'undo', label: '↩ Undo (Ctrl+Z)', type: 'button', onClick: () => window.ProModelerApp?.undo() },
    { key: 'redo', label: '↪ Redo (Ctrl+Y)', type: 'button', onClick: () => window.ProModelerApp?.redo() },
    { key: 'sep0', label: '──────────', type: 'label' },
    // ── Basic Actions ──
    { key: 'duplicate', label: 'Duplicate Selected', type: 'button', onClick: () => window.ProModelerApp?.duplicateSelected() },
    { key: 'delete',    label: 'Delete Selected',    type: 'button', onClick: () => window.ProModelerApp?.deleteSelected() },
    { key: 'sep1', label: '──────────', type: 'label' },
    // ── Snap ──
    { key: 'snap', label: 'Snap to Grid', type: 'button', onClick: () => window.ProModelerApp?.snapToGrid() },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Mirror ──
    { key: 'mirror-x', label: 'Mirror X', type: 'button', onClick: () => window.ProModelerApp?.mirror('x') },
    { key: 'mirror-y', label: 'Mirror Y', type: 'button', onClick: () => window.ProModelerApp?.mirror('y') },
    { key: 'mirror-z', label: 'Mirror Z', type: 'button', onClick: () => window.ProModelerApp?.mirror('z') },
    { key: 'sep3', label: '──────────', type: 'label' },
    // ── Transform Mode Shortcuts ──
    {
      key: 'quick-transform',
      label: 'Quick Transform',
      type: 'select',
      default: 'move',
      options: [
        { value: 'move',   label: 'Move' },
        { value: 'rotate', label: 'Rotate' },
        { value: 'scale',  label: 'Scale' },
      ],
      onChange: (val) => window.ProModelerApp?.setTransformMode(val),
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
