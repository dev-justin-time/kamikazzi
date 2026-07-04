/**
 * Motion Capture — Import and retarget animation data
 * Note: Full mocap pipeline requires the full engine with animation mixer.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Motion Capture import and retargeting.' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'frame', label: 'Frame Selected', type: 'button', onClick: () => window.ProModelerApp?.frameSelected() },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'With full engine:' },
    { key: 'info-import', type: 'label', label: '  • Import BVH/FBX animation data' },
    { key: 'info-retarget', type: 'label', label: '  • Retarget to different rigs' },
    { key: 'info-blend', type: 'label', label: '  • Blend between animations' },
    { key: 'info-export', type: 'label', label: '  • Export as keyframes' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
