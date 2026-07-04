/**
 * Transitions — Easing curves applied to keyframe interpolation, morph targets, tween
 */
function _getApp() { return window.ProModelerApp; }

function _refreshUI() {
  const app = _getApp();
  const easingInfo = document.querySelector('#popupContent [data-key="easing-info"] .ctrl-label');
  if (easingInfo && app) {
    easingInfo.textContent = `Active easing: ${app._currentEasing || 'linear'}`;
  }
}

const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Easing curves affect how objects animate between keyframes:' },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Easing Selector ──
    {
      key: 'easing',
      label: 'Transition Easing',
      type: 'select',
      default: 'linear',
      options: [
        { value: 'linear', label: 'Linear' },
        { value: 'ease-in', label: 'Ease In (quadratic)' },
        { value: 'ease-out', label: 'Ease Out (quadratic)' },
        { value: 'ease-in-out', label: 'Ease In-Out' },
        { value: 'bounce', label: 'Bounce' },
        { value: 'elastic', label: 'Elastic' },
      ],
      description: 'Smoothness curve applied to keyframe interpolation',
      onChange: (val) => {
        _getApp()?.setEasing(val);
        _refreshUI();
      },
    },
    { key: 'easing-info', type: 'label', label: 'Active easing: linear' },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Keyframe Controls (duplicated for convenience) ──
    { key: 'info-kf', type: 'label', label: 'Keyframe Actions:' },
    { key: 'add-keyframe', label: '📷 Add Keyframe at Current Frame', type: 'button', onClick: () => {
      _getApp()?.addKeyframe();
    }},
    {
      key: 'play-transition',
      label: '▶ Preview Transition',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        app?.setCurrentFrame(1);
        app?.playAnimation();
        // Button text will be in sync — it's always "▶ Preview Transition"
        // because clicking it again pauses and resets via the Stop button
      },
    },
    {
      key: 'stop-transition',
      label: '⏹ Stop',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        app?.pauseAnimation();
        app?.setCurrentFrame(1);
        const btn = document.querySelector('#popupContent [data-key="play-transition"] .ctrl-button');
        if (btn) btn.textContent = '▶ Preview Transition';
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Morph States ──
    { key: 'info-morph', type: 'label', label: 'Morph State Capture:' },
    {
      key: 'capture-state',
      label: '📸 Capture Current State as Keyframe',
      type: 'button',
      onClick: () => {
        _getApp()?.addKeyframe();
      },
    },
    {
      key: 'goto-start',
      label: '⏪ Goto Frame 1',
      type: 'button',
      onClick: () => { _getApp()?.setCurrentFrame(1); },
    },
    {
      key: 'goto-end',
      label: '⏩ Goto Last Frame',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app) app.setCurrentFrame(app.totalFrames);
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Visual Preview ──
    { key: 'info-visual', type: 'label', label: 'Toggle between keyframe positions:' },
    {
      key: 'step-prev',
      label: '◀◀ Prev Keyframe',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app || app.keyframes.size === 0) return;
        // Find the nearest keyframe before current
        const allKfs = Array.from(app.keyframes.values()).flat();
        const sorted = allKfs.sort((a, b) => a.frame - b.frame);
        const prev = sorted.reverse().find(k => k.frame < app.currentFrame);
        if (prev) app.setCurrentFrame(prev.frame);
        else app.setCurrentFrame(1);
      },
    },
    {
      key: 'step-next',
      label: 'Next Keyframe ▶▶',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app || app.keyframes.size === 0) return;
        const allKfs = Array.from(app.keyframes.values()).flat();
        const sorted = allKfs.sort((a, b) => a.frame - b.frame);
        const next = sorted.find(k => k.frame > app.currentFrame);
        if (next) app.setCurrentFrame(next.frame);
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
