/**
 * Motion Capture — Record, import/export animation data, retarget
 */
function _getApp() { return window.ProModelerApp; }

function _refreshUI() {
  const app = _getApp();
  const recBtn = document.querySelector('#popupContent [data-key="record-toggle"] .ctrl-button');
  if (recBtn && app) {
    recBtn.textContent = app.isRecording ? '⏹ Stop Recording' : '⏺ Record Animation';
    recBtn.style.background = app.isRecording ? '#ef4444' : '#4a9eff';
  }
  const info = document.querySelector('#popupContent [data-key="mocap-info"] .ctrl-label');
  if (info && app) {
    const totalKfs = Array.from(app.keyframes.values()).reduce((s, kfs) => s + kfs.length, 0);
    info.textContent = `Keyframes: ${totalKfs} across ${app.keyframes.size} object(s)`;
  }
}

const meta = {
  controls: [
    // ── Recording ──
    { key: 'info-record', type: 'label', label: 'Record transforms as keyframes:' },
    {
      key: 'record-toggle',
      label: '⏺ Record Animation',
      type: 'button',
      onClick: () => {
        _getApp()?.toggleRecording();
        _refreshUI();
      },
    },
    { key: 'mocap-info', type: 'label', label: 'Keyframes: 0 across 0 object(s)' },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Import / Export ──
    {
      key: 'export-kf',
      label: '📤 Export Keyframes as JSON',
      type: 'button',
      onClick: () => { _getApp()?.exportKeyframesAsJSON(); },
    },
    {
      key: 'import-kf',
      label: '📥 Import Keyframes from JSON',
      type: 'button',
      onClick: () => {
        const inp = document.getElementById('projectOpen');
        if (!inp) return;
        inp.value = '';
        inp.accept = '.json';
        inp.onchange = (e) => {
          const file = e.target.files?.[0];
          if (file) _getApp()?.importKeyframesFromJSON(file);
        };
        inp.click();
      },
    },
    {
      key: 'clear-kf',
      label: '🗑 Clear All Keyframes',
      type: 'button',
      onClick: () => {
        _getApp()?.clearAllKeyframes();
        _refreshUI();
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Retargeting helpers ──
    { key: 'info-retarget', type: 'label', label: '⤻ Retargeting & Baking:' },
    {
      key: 'bake-current',
      label: '🔥 Bake Current Pose as Keyframe',
      type: 'button',
      onClick: () => {
        _getApp()?.addKeyframe();
        _refreshUI();
      },
    },
    {
      key: 'bake-all-frames',
      label: '📋 Bake All Frames (fill timeline)',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app?.selectedObject) { log('Select an object first', 'error'); return; }
        const obj = app.selectedObject;
        const id = obj.uuid;
        app.pushUndo();
        app.keyframes.set(id, []);
        const kfs = app.keyframes.get(id);
        for (let f = 1; f <= app.totalFrames; f += 5) {
          kfs.push({
            frame: f,
            position: obj.position.clone(),
            rotation: obj.rotation.clone(),
            scale: obj.scale.clone(),
          });
        }
        log(`Baked ${kfs.length} keyframes across ${app.totalFrames} frames`);
        _refreshUI();
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Animate helpers ──
    {
      key: 'play-mocap',
      label: '▶ Play Captured Animation',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (app?.isAnimationPlaying) { app.pauseAnimation(); }
        else { app?.playAnimation(); }
        const btn = document.querySelector('#popupContent [data-key="play-mocap"] .ctrl-button');
        if (btn) btn.textContent = app?.isAnimationPlaying ? '⏸ Pause' : '▶ Play Captured Animation';
      },
    },
    {
      key: 'stop-mocap',
      label: '⏹ Stop & Reset',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        app?.pauseAnimation();
        app?.setCurrentFrame(1);
        const btn = document.querySelector('#popupContent [data-key="play-mocap"] .ctrl-button');
        if (btn) btn.textContent = '▶ Play Captured Animation';
      },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Instructions ──
    { key: 'info-tip1', type: 'label', label: '💡 How to record:' },
    { key: 'info-tip2', type: 'label', label: '1. Select an object in the scene' },
    { key: 'info-tip3', type: 'label', label: '2. Click "Record Animation"' },
    { key: 'info-tip4', type: 'label', label: '3. Move/rotate/scale using the gizmo' },
    { key: 'info-tip5', type: 'label', label: '4. Click "Stop Recording" when done' },
    { key: 'info-tip6', type: 'label', label: '5. Export or play the animation' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
