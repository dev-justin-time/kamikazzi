/**
 * Performance Monitor — live draw calls, frame time, memory via renderer.info
 * Updates every 500ms with a running performance snapshot.
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Live performance metrics (updates every 500ms).' },
    { key: 'sep0', label: '──────────', type: 'label' },
    { key: 'fps', label: 'FPS', type: 'label', description: 'Frames per second (30-frame rolling average)' },
    { key: 'frametime', label: 'Frame Time', type: 'label', description: 'Milliseconds per frame' },
    { key: 'sep1', label: '──────────', type: 'label' },
    { key: 'drawcalls', label: 'Draw Calls', type: 'label', description: 'WebGL draw calls per frame' },
    { key: 'triangles', label: 'Triangles', type: 'label', description: 'Triangles rendered per frame' },
    { key: 'points', label: 'Points', type: 'label', description: 'Points rendered per frame' },
    { key: 'lines', label: 'Lines', type: 'label', description: 'Line segments rendered per frame' },
    { key: 'sep2', label: '──────────', type: 'label' },
    { key: 'geometries', label: 'Geometries', type: 'label', description: 'GPU geometry buffers' },
    { key: 'textures', label: 'Textures', type: 'label', description: 'GPU textures' },
    { key: 'programs', label: 'GPU Programs', type: 'label', description: 'Shader program count' },
    { key: 'objects', label: 'Scene Objects', type: 'label', description: 'User objects in scene' },
    { key: 'lights', label: 'Lights', type: 'label', description: 'Active lights' },
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'js-heap', label: 'JS Heap', type: 'label', description: 'JavaScript heap usage (Chrome only)' },
    { key: 'pixel-ratio', label: 'Pixel Ratio', type: 'label', description: 'Device pixel ratio' },
    { key: 'sep4', label: '──────────', type: 'label' },
    {
      key: 'reset-stats',
      label: 'Reset Renderer Stats',
      type: 'button',
      onClick: () => {
        const app = window.ProModelerApp;
        if (app?.renderer?.info?.reset) app.renderer.info.reset();
      },
    },
    {
      key: 'save-snapshot',
      label: '💾 Save Snapshot',
      type: 'button',
      onClick: () => {
        window.ProModelerApp?.savePerformanceSnapshot();
      },
    },
  ],
  onApply: () => {},
};

function _fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

function _fmtBytes(bytes) {
  if (!bytes) return 'N/A';
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return mb.toFixed(0) + ' MB';
  return mb.toFixed(1) + ' MB';
}

function _getApp() { return window.ProModelerApp; }

export { meta };
export function render(container, state) {
  container.innerHTML = '';

  // Build a structured table of live values
  const table = document.createElement('div');
  table.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:12px;';

  const rows = [
    { key: 'fps',        label: 'FPS',                 valueOf: (d) => d.fps },
    { key: 'frametime',  label: 'Frame Time',          valueOf: (d) => d.frameTime + ' ms' },
    { key: 'sep1',       isSep: true },
    { key: 'drawcalls',  label: 'Draw Calls',          valueOf: (d) => _fmt(d.drawCalls) },
    { key: 'triangles',  label: 'Triangles',           valueOf: (d) => _fmt(d.triangles) },
    { key: 'points',     label: 'Points',              valueOf: (d) => _fmt(d.points) },
    { key: 'lines',      label: 'Lines',               valueOf: (d) => _fmt(d.lines) },
    { key: 'sep2',       isSep: true },
    { key: 'geometries', label: 'Geometries',          valueOf: (d) => d.geometries },
    { key: 'textures',   label: 'Textures',            valueOf: (d) => d.textures },
    { key: 'programs',   label: 'GPU Programs',        valueOf: (d) => d.programs },
    { key: 'objects',    label: 'Scene Objects',       valueOf: (d) => d.objects },
    { key: 'lights',     label: 'Lights',              valueOf: (d) => d.lights },
    { key: 'sep3',       isSep: true },
    { key: 'js-heap',    label: 'JS Heap',             valueOf: (d) => _fmtBytes(d.jsHeapUsed) + ' / ' + _fmtBytes(d.jsHeapTotal) },
    { key: 'pixel-ratio',label: 'Pixel Ratio',         valueOf: (d) => '×' + d.pixelRatio.toFixed(1) },
  ];

  const elements = {};
  rows.forEach(row => {
    if (row.isSep) {
      const sep = document.createElement('div');
      sep.style.cssText = 'grid-column:1/-1;text-align:center;color:#444;font-size:10px;letter-spacing:2px;padding:2px 0;';
      sep.textContent = '• • • • • • • • •';
      table.appendChild(sep);
      return;
    }

    const labelEl = document.createElement('span');
    labelEl.textContent = row.label;
    labelEl.style.cssText = 'color:#aaa;padding:2px 0;';

    let valueEl;
    // Check if it's a metric that should show color-coded status
    const isFps = row.key === 'fps';
    const isFrameTime = row.key === 'frametime';
    const isDrawCalls = row.key === 'drawcalls';

    if (isFps || isFrameTime || isDrawCalls) {
      valueEl = document.createElement('span');
      valueEl.style.cssText = 'padding:2px 0;font-weight:600;text-align:right;';
    } else {
      valueEl = document.createElement('span');
      valueEl.textContent = '—';
      valueEl.style.cssText = 'padding:2px 0;text-align:right;';
    }

    elements[row.key] = valueEl;
    table.appendChild(labelEl);
    table.appendChild(valueEl);
  });

  container.appendChild(table);

  // Separator
  const sep2 = document.createElement('div');
  sep2.style.cssText = 'margin:12px 0;height:1px;background:#333;';
  container.appendChild(sep2);

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.textContent = '🔄 Reset Renderer Stats';
  resetBtn.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;font-size:13px;transition:background .15s;';
  resetBtn.addEventListener('mouseenter', () => resetBtn.style.background = '#3a8eef');
  resetBtn.addEventListener('mouseleave', () => resetBtn.style.background = '#4a9eff');
  resetBtn.addEventListener('click', () => {
    const app = _getApp();
    if (app?.renderer?.info?.reset) app.renderer.info.reset();
  });
  container.appendChild(resetBtn);

  // Save Snapshot button
  const snapshotBtn = document.createElement('button');
  snapshotBtn.textContent = '💾 Save Snapshot';
  snapshotBtn.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#22c55e;color:#fff;cursor:pointer;font-size:13px;transition:background .15s;margin-top:4px;';
  snapshotBtn.addEventListener('mouseenter', () => snapshotBtn.style.background = '#16a34a');
  snapshotBtn.addEventListener('mouseleave', () => snapshotBtn.style.background = '#22c55e');
  snapshotBtn.addEventListener('click', () => {
    _getApp()?.savePerformanceSnapshot();
  });
  container.appendChild(snapshotBtn);

  // Separator
  const sep3 = document.createElement('div');
  sep3.style.cssText = 'margin:12px 0;height:1px;background:#333;';
  container.appendChild(sep3);

  // Benchmark section header
  const benchHeader = document.createElement('div');
  benchHeader.textContent = 'Stress Test Benchmark';
  benchHeader.style.cssText = 'font-size:13px;font-weight:600;color:#eee;margin-bottom:4px;';
  container.appendChild(benchHeader);

  const benchDesc = document.createElement('div');
  benchDesc.textContent = 'Duplicates the selected mesh in batches and records the performance curve.';
  benchDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;';
  container.appendChild(benchDesc);

  // Benchmark count slider (in meta controls, updated via DOM query)
  let benchCount = 100;

  const countRow = document.createElement('div');
  countRow.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;';
  const countLabel = document.createElement('label');
  countLabel.textContent = 'Object Count';
  countLabel.style.cssText = 'font-size:12px;color:#aaa;';
  const countSlider = document.createElement('input');
  countSlider.type = 'range';
  countSlider.min = 10;
  countSlider.max = 500;
  countSlider.step = 10;
  countSlider.value = 100;
  countSlider.style.cssText = 'width:100%;accent-color:#a855f7;';
  const countVal = document.createElement('span');
  countVal.textContent = '100';
  countVal.style.cssText = 'font-size:11px;color:#888;text-align:right;';
  countSlider.addEventListener('input', () => {
    benchCount = parseInt(countSlider.value);
    countVal.textContent = benchCount;
  });
  countRow.appendChild(countLabel);
  countRow.appendChild(countSlider);
  countRow.appendChild(countVal);
  container.appendChild(countRow);

  // Run Benchmark button
  const benchBtn = document.createElement('button');
  benchBtn.textContent = '🚀 Run Benchmark';
  benchBtn.style.cssText = 'width:100%;padding:10px;border:none;border-radius:4px;background:#a855f7;color:#fff;cursor:pointer;font-size:13px;font-weight:600;transition:background .15s;';
  benchBtn.addEventListener('mouseenter', () => benchBtn.style.background = '#9333ea');
  benchBtn.addEventListener('mouseleave', () => benchBtn.style.background = '#a855f7');
  benchBtn.addEventListener('click', () => {
    const app = _getApp();
    if (!app) return;
    benchBtn.textContent = '⏳ Benchmarking...';
    benchBtn.disabled = true;
    benchBtn.style.opacity = '0.6';
    app.runBenchmark(benchCount);
    // Re-enable after a short delay (benchmark runs async)
    setTimeout(() => {
      benchBtn.textContent = '🚀 Run Benchmark';
      benchBtn.disabled = false;
      benchBtn.style.opacity = '1';
    }, benchCount * 50 + 2000); // rough estimate of benchmark duration
  });
  container.appendChild(benchBtn);

  // Result info
  const benchInfo = document.createElement('div');
  benchInfo.id = 'bench-result';
  benchInfo.style.cssText = 'font-size:11px;color:#888;margin-top:6px;';
  benchInfo.textContent = 'Select a mesh, set count, then click Run.';
  container.appendChild(benchInfo);

  // ── Live-update timer ──
  let timer = null;

  function _update() {
    const app = _getApp();
    if (!app) { _schedule(); return; }
    const data = app.getPerformanceData();
    if (!data) { _schedule(); return; }

    // Update each element
    Object.entries(elements).forEach(([key, el]) => {
      const row = rows.find(r => r.key === key);
      if (!row || !row.valueOf) return;
      const val = row.valueOf(data);

      if (key === 'fps') {
        el.textContent = val + ' FPS';
        el.style.color = val >= 55 ? '#4ade80' : val >= 30 ? '#f59e0b' : '#ef4444';
      } else if (key === 'frametime') {
        el.textContent = val;
        el.style.color = data.frameTime <= 18 ? '#4ade80' : data.frameTime <= 33 ? '#f59e0b' : '#ef4444';
      } else if (key === 'drawcalls') {
        el.textContent = _fmt(data.drawCalls);
        el.style.color = data.drawCalls <= 100 ? '#4ade80' : data.drawCalls <= 500 ? '#f59e0b' : '#ef4444';
      } else {
        el.textContent = typeof val === 'string' ? val : String(val);
        el.style.color = '#eee';
      }
    });

    _schedule();
  }

  function _schedule() {
    timer = setTimeout(_update, 500);
  }

  // Start the update loop
  _update();

  // Cleanup when the container is detached (observer)
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      clearTimeout(timer);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
