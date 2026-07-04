/**
 * Rigging Tools — Skeleton, bones, skinning, FK/IK
 * Note: Full rigging system requires the full engine (engine.js) with
 * animation mixer and bone manipulation support.
 * The slim Studio provides the base scene but no dedicated rigging system yet.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Rigging tools require the full engine.' },
    { key: 'sep1', label: '──────────', type: 'label' },
    // ── Basic actions (available with the slim Studio) ──
    { key: 'frame', label: 'Frame Selected (Bone/Object)', type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Placeholder for full engine features ──
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-bones', type: 'label', label: '  • Add/Edit bones' },
    { key: 'info-skin',  type: 'label', label: '  • Skinning & weight painting' },
    { key: 'info-fkik',  type: 'label', label: '  • FK/IK switching' },
    { key: 'info-pose',  type: 'label', label: '  • Pose library & mirroring' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
