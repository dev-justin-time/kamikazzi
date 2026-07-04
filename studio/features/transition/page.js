/**
 * Transitions — Morph, tween, interpolate between object states
 * Note: Full transition system requires the full engine with animation mixer.
 * Basic keyframe interpolation is available in the Animate page.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Object transitions via keyframe interpolation:' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'add-keyframe', label: 'Add Keyframe at Current Frame', type: 'button', onClick: () => window.ProModelerApp?.addKeyframe() },
    { key: 'play',  label: '▶ Play Animation',  type: 'button', onClick: () => window.ProModelerApp?.playAnimation() },
    { key: 'pause', label: '⏸ Pause Animation', type: 'button', onClick: () => window.ProModelerApp?.pauseAnimation() },
    { key: 'sep2', label: '──────────', type: 'label' },
    {
      key: 'easing',
      label: 'Transition Easing',
      type: 'select',
      default: 'linear',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'ease-in', label: 'Ease In' },
        { value: 'ease-out', label: 'Ease Out' },
        { value: 'ease-in-out', label: 'Ease In-Out' },
      ],
      description: 'Smoothness curve for tween (affects rendered output)',
    },
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'Full engine adds: morph targets, shape keys, bezier paths.' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
