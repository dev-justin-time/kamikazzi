/**
 * Rigging Tools — Add bones, skeletons, pose controls
 */
function _getApp() { return window.ProModelerApp; }

const meta = {
  controls: [
    // ── Bones ──
    { key: 'info-bones', type: 'label', label: 'Add bones to the selected object:' },
    {
      key: 'add-bone',
      label: '🦴 Add Bone to Selected',
      type: 'button',
      onClick: () => { _getApp()?.addBone(); },
    },
    {
      key: 'add-skeleton',
      label: '🦴 Generate 3-Bone Chain',
      type: 'button',
      onClick: () => { _getApp()?.addSkeleton(); },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ─── Pose Controls ──
    { key: 'info-pose', type: 'label', label: 'Pose & Transform Controls:' },
    {
      key: 'pose-move',
      label: '↕ Move Mode',
      type: 'button',
      onClick: () => { _getApp()?.setTransformMode('move'); },
    },
    {
      key: 'pose-rotate',
      label: '🔄 Rotate Mode',
      type: 'button',
      onClick: () => { _getApp()?.setTransformMode('rotate'); },
    },
    {
      key: 'pose-scale',
      label: '↔ Scale Mode',
      type: 'button',
      onClick: () => { _getApp()?.setTransformMode('scale'); },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Mirror Pose ──
    {
      key: 'mirror-pose-x',
      label: 'Mirror Bone X',
      type: 'button',
      onClick: () => { _getApp()?.mirror('x'); },
    },
    {
      key: 'frame-bone',
      label: 'Frame Selected (Bone/Object)',
      type: 'button',
      onClick: () => { _getApp()?.frameSelected(); },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Visual Helpers ──
    { key: 'info-helpers', type: 'label', label: 'Helpers & Visibility:' },
    {
      key: 'toggle-wireframe',
      label: 'Toggle Wireframe View',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app) {
          app.setViewMode(app.viewMode === 'solid' ? 'wireframe' : 'solid');
          const btn = document.querySelector('#popupContent [data-key="toggle-wireframe"] .ctrl-button');
          if (btn) btn.textContent = app.viewMode === 'wireframe' ? '🔲 Solid View' : '🔲 Toggle Wireframe View';
        }
      },
    },
    {
      key: 'frame-all-rig',
      label: 'Frame All Objects',
      type: 'button',
      onClick: () => { _getApp()?.frameAll(); },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Tips ──
    { key: 'info-tip1', type: 'label', label: '💡 How to rig:' },
    { key: 'info-tip2', type: 'label', label: '1. Select an object (or create a new one)' },
    { key: 'info-tip3', type: 'label', label: '2. Click "Add Bone to Selected"' },
    { key: 'info-tip4', type: 'label', label: '3. Use Move/Rotate tools to pose the bone' },
    { key: 'info-tip5', type: 'label', label: '4. Repeat to build a hierarchy' },
    { key: 'info-tip6', type: 'label', label: '5. Or use "Generate 3-Bone Chain" for a quick skeleton' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
