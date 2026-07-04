/**
 * Camera Tools — Preset views, frame, camera management
 */
const meta = {
  controls: [
    // ── Preset Views ──
    { key: 'view-front',  label: 'Front View',  type: 'button', onClick: () => window.ProModelerApp?.setCameraView('front') },
    { key: 'view-back',   label: 'Back View',   type: 'button', onClick: () => window.ProModelerApp?.setCameraView('back') },
    { key: 'view-left',   label: 'Left View',   type: 'button', onClick: () => window.ProModelerApp?.setCameraView('left') },
    { key: 'view-right',  label: 'Right View',  type: 'button', onClick: () => window.ProModelerApp?.setCameraView('right') },
    { key: 'view-top',    label: 'Top View',    type: 'button', onClick: () => window.ProModelerApp?.setCameraView('top') },
    { key: 'view-bottom', label: 'Bottom View', type: 'button', onClick: () => window.ProModelerApp?.setCameraView('bottom') },
    { key: 'sep1', label: '──────────', type: 'label' },
    // ── Frame ──
    { key: 'frame',     label: 'Frame Selected', type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'frame-all', label: 'Frame All',      type: 'button', onClick: () => window.ProModelerApp?.frameAll() },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
