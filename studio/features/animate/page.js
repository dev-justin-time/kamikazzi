/**
 * Animation — Timeline scrubber, frame stepping, speed control, loop toggle, keyframes
 */
function _getApp() { return window.ProModelerApp; }

function _refreshUI() {
  const app = _getApp();
  // Update frame number label
  const frameLabel = document.querySelector('#popupContent [data-key="frame-label"] .ctrl-label');
  if (frameLabel && app) {
    const totalKfs = Array.from(app.keyframes.values()).reduce((sum, kfs) => sum + kfs.length, 0);
    frameLabel.textContent = `Frame ${app.currentFrame} / ${app.totalFrames}  ·  ${totalKfs} keyframes total`;
  }
  // Update scrubber position
  const scrubber = document.querySelector('#popupContent [data-key="timeline-scrub"] input');
  if (scrubber && app) {
    scrubber.value = app.currentFrame;
  }
  // Update selected object keyframe info
  const selInfo = document.querySelector('#popupContent [data-key="sel-kf-info"] .ctrl-label');
  if (selInfo && app) {
    const obj = app.selectedObject;
    if (obj && app.keyframes.has(obj.uuid)) {
      const kfs = app.keyframes.get(obj.uuid);
      selInfo.textContent = `\"${obj.name}\" has ${kfs.length} keyframe(s)`;
    } else if (obj) {
      selInfo.textContent = `\"${obj.name}\" has no keyframes`;
    } else {
      selInfo.textContent = 'No object selected — select an object to add keyframes';
    }
  }
  // Update play/pause button
  const playBtn = document.querySelector('#popupContent [data-key="play-pause"] .ctrl-button');
  if (playBtn && app) {
    playBtn.textContent = app.isAnimationPlaying ? '⏸ Pause' : '▶ Play';
  }
  // Update loop button
  const loopBtn = document.querySelector('#popupContent [data-key="loop-toggle"] .ctrl-button');
  if (loopBtn && app) {
    loopBtn.textContent = app.loopAnimation ? '🔁 Loop ON' : '🔂 Loop OFF';
    loopBtn.style.opacity = app.loopAnimation ? '1' : '0.5';
  }
}

const meta = {
  controls: [
    // ── Transport Controls ──
    { key: 'play-pause', label: '▶ Play', type: 'button', onClick: () => {
      const app = _getApp();
      if (app?.isAnimationPlaying) {
        app.pauseAnimation();
      } else {
        app?.playAnimation();
      }
      _refreshUI();
    }},
    { key: 'stop', label: '⏹ Stop', type: 'button', onClick: () => {
      const app = _getApp();
      if (app) {
        app.pauseAnimation();
        app.setCurrentFrame(1);
        _refreshUI();
      }
    }},
    { key: 'sep-tp', label: '──────────', type: 'label' },

    // ── Timeline Scrubber ──
    {
      key: 'timeline-scrub',
      label: 'Timeline',
      type: 'slider',
      min: 1, max: 250, step: 1, default: 1,
      description: 'Drag to scrub through the animation timeline',
      onChange: (val) => {
        _getApp()?.setCurrentFrame(val);
        _refreshUI();
      },
    },
    { key: 'frame-label', type: 'label', label: 'Frame 1 / 250  ·  0 keyframes total' },

    // ── Frame Stepping ──
    {
      key: 'step-prev',
      label: '◀◀ Prev Frame',
      type: 'button',
      onClick: () => { _getApp()?.stepFrame(-1); _refreshUI(); },
    },
    {
      key: 'step-next',
      label: 'Next Frame ▶▶',
      type: 'button',
      onClick: () => { _getApp()?.stepFrame(1); _refreshUI(); },
    },
    { key: 'sep-step', label: '──────────', type: 'label' },

    // ── Speed Control ──
    {
      key: 'anim-speed',
      label: 'Animation Speed',
      type: 'slider',
      min: 0.1, max: 5, step: 0.1, default: 1,
      description: 'Playback speed multiplier',
      onChange: (val) => { _getApp()?.setAnimationSpeed(val); },
    },
    { key: 'loop-toggle', label: '🔁 Loop ON', type: 'button', onClick: () => {
      _getApp()?.toggleLoop();
      _refreshUI();
    }},
    { key: 'sep-loop', label: '──────────', type: 'label' },

    // ── Keyframes ──
    {
      key: 'add-keyframe',
      label: '📷 Add Keyframe at Current Frame',
      type: 'button',
      onClick: () => { _getApp()?.addKeyframe(); _refreshUI(); },
    },
    {
      key: 'clear-keyframes',
      label: '🗑 Clear Keyframes (selected)',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app?.selectedObject && app.keyframes.has(app.selectedObject.uuid)) {
          app.pushUndo();
          app.keyframes.delete(app.selectedObject.uuid);
          log(`Cleared keyframes for ${app.selectedObject.name}`);
          _refreshUI();
        }
      },
    },
    { key: 'sel-kf-info', type: 'label', label: 'No object selected — select an object to add keyframes' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
