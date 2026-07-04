/**
 * Animation — Play/Pause, Keyframes, Frame controls
 */
const meta = {
  controls: [
    // ── Transport Controls ──
    { key: 'play',  label: '▶ Play',  type: 'button', onClick: () => window.ProModelerApp?.playAnimation() },
    { key: 'pause', label: '⏸ Pause', type: 'button', onClick: () => window.ProModelerApp?.pauseAnimation() },
    { key: 'sep1', label: '──────────', type: 'label' },
    // ── Keyframes ──
    { key: 'add-keyframe', label: 'Add Keyframe at Current Frame', type: 'button', onClick: () => window.ProModelerApp?.addKeyframe() },
    { key: 'sep2', label: '──────────', type: 'label' },
    // ── Frame Control ──
    {
      key: 'current-frame',
      label: 'Current Frame',
      type: 'number',
      default: 1,
      description: 'Current frame in the animation timeline',
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app) {
          app.currentFrame = Math.max(1, Math.min(val, app.totalFrames));
        }
      },
    },
    {
      key: 'total-frames',
      label: 'Total Frames',
      type: 'number',
      default: 250,
      description: 'Length of the animation',
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app) {
          app.totalFrames = Math.max(1, Math.floor(val));
        }
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },
    // ── Status ──
    { key: 'status', type: 'label', label: 'Animation status and keyframe count shown in status bar' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
