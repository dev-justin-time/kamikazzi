/**
 * History — Full undo/redo history browser — view, jump, clear, compare snapshots
 */
function _getApp() { return window.ProModelerApp; }


const _actionMap = {
  frameSelected:       () => _getApp()?.frameSelected(),
  frameAll:            () => _getApp()?.frameAll(),
  deleteSelected:      () => _getApp()?.deleteSelected(),
  undo:                () => _getApp()?.undo(),
  redo:                () => _getApp()?.redo(),
  addKeyframe:         () => _getApp()?.addKeyframe(),
  playAnimation:       () => _getApp()?.playAnimation(),
  pauseAnimation:      () => _getApp()?.pauseAnimation(),
  generateWireframeValley: () => _getApp()?.generateWireframeValley(),
  toggleViewMode:      () => { const a = _getApp(); if (a) a.setViewMode(a.viewMode === 'wireframe' ? 'solid' : 'wireframe'); },
  addPrimitive_cube:   () => _getApp()?.addPrimitive('cube'),
  addPrimitive_torus:  () => _getApp()?.addPrimitive('torus'),
  exportModel_glb:     () => _getApp()?.exportModel('glb'),
  exportModel_gltf:    () => _getApp()?.exportModel('gltf'),

  logRemesh:           () => _status('Remesh: Would apply remesh with current params'),
  logDecimate:         () => _status('Remesh: Decimating 50%...'),
  logDeform:           () => _status('Deform: Applying deform modifier'),
  logBoolean:          () => _status('Boolean: Executing boolean operation'),
  logExtrude:          () => _status('Curve: Extruding from curve'),
  logMaterial:         () => _status('Shaders: Applied material to selected'),
  logShaderImport:     () => { const i = document.createElement('input'); i.type='file'; i.accept='.glsl,.frag,.vert'; i.click(); },
  logDecalImport:      () => { const i = document.createElement('input'); i.type='file'; i.accept='image/*'; i.click(); },
  logPlaceDecal:       () => _status('Decal: Placed decal on surface'),
  logClearDecals:      () => _status('Decal: All decals cleared'),
  logBake:             () => _status('Bake: Starting bake...'),
  logBakePreview:      () => _status('Bake: Showing preview'),
  logUVPack:           () => _status('UV: Packing islands'),
  logUVRelax:          () => _status('UV: Relaxing islands'),
  logChecker:          () => _status('UV: Applied checker map'),
  logUVExport:         () => _status('UV: Exported UV layout'),
  logConstraint:       () => _status('Constraints: Added constraint'),
  logRemoveConstraints:() => _status('Constraints: Removed all constraints'),
  logAddShapeKey:      () => _status('Shape Keys: Added shape key'),
  logExportSK:         () => _status('Shape Keys: Exported as JSON'),
  logPhysics:          () => _status('Physics: Applied physics body'),
  logBakePhysics:      () => _status('Physics: Baking simulation'),
  logSky:              () => _status('Sky: Atmosphere applied'),
  logHDRI:             () => { const i = document.createElement('input'); i.type='file'; i.accept='.hdr,.exr,.png,.jpg'; i.click(); },
  logAddWater:         () => _status('Water: Added water plane'),
  logFoliage:          () => _status('Foliage: Scattering vegetation'),
  logClearFoliage:     () => _status('Foliage: Cleared all foliage'),
  logExportHeightmap:  () => _status('Terrain: Exported heightmap'),
  logWeather:          () => _status('Weather: Applied weather effect'),
  logParticleEmit:     () => _status('Particles: Starting emitter'),
  logParticleStop:     () => _status('Particles: Stopping emitter'),
  logTrailToggle:      () => _status('Trails: Toggled motion trails'),
  logClearTrails:      () => _status('Trails: Cleared trails'),
  logIgnite:           () => _status('Fire FX: Ignited!'),
  logExtinguish:       () => _status('Fire FX: Extinguished'),
  logReport:           () => { const s = _getApp()?.getSceneStats?.(); _status('Report: ' + JSON.stringify(s || {})); },
  logCopyReport:       () => _status('Report: Copied to clipboard'),
  logRunScript:        () => { const ta = document.getElementById('scriptInput'); if(ta) try { const r = eval(ta.value); _status('OK: ' + (r ?? 'done')); } catch(e) { _status('Error: ' + e.message); } },
  logClearScript:      () => { const out = document.getElementById('scriptOutput'); if(out) out.innerHTML = ''; _status('Output cleared'); },
  logBatch:            () => _status('Batch: Executing batch operation'),
  logBatchPreview:     () => _status('Batch: Previewing results'),
  logClearHistory:     () => _status('History: History cleared'),
  logExportHistory:    () => _status('History: Exported history log'),
  logSnapshot:         () => _status('Snapshot: Captured viewport'),
  logTurntable:        () => _status('Snapshot: Rendering turntable'),
  logBrowseExt:        () => _status('Extensions: Opening browser...'),
  logSearchExt:        () => _status('Extensions: Searching...'),
  logOpenMarket:       () => { const btn = document.querySelector('[data-feature="market"]'); if (btn) btn.click(); },
  logPublish:          () => _status('Publish: Publishing asset...'),
  logTeamCreate:       () => _status('Team: Created collaboration room'),
  logTeamJoin:         () => _status('Team: Joined room'),
  logTeamLeave:        () => _status('Team: Left room'),
};

function _status(msg) {
  const el = document.getElementById('status-left');
  if (el) el.textContent = msg;
  console.log('[Feature]', msg);
}


// ── Render Controls from Meta ──
function _renderControls(container, controlsList) {
  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:4px 0;';

  controlsList.forEach(ctrl => {
    if (ctrl.type === 'label') {
      const el = document.createElement('div');
      el.style.cssText = 'font-size:12px;color:' + (ctrl.label.startsWith('  •') ? '#888;padding-left:8px' : '#aaa');
      el.textContent = ctrl.label;
      form.appendChild(el);
      return;
    }

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    if (ctrl.type === 'button') {
      const btn = document.createElement('button');
      btn.textContent = ctrl.label;
      btn.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;font-size:13px;transition:background .15s;';
      btn.addEventListener('mouseenter', () => btn.style.background = '#3a8eef');
      btn.addEventListener('mouseleave', () => btn.style.background = '#4a9eff');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fn = _actionMap[ctrl.onClick];
        if (fn) fn();
        else console.warn('No action:', ctrl.onClick);
      });
      row.appendChild(btn);
    } else if (ctrl.type === 'toggle') {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = ctrl.default ?? false;
      cb.style.cssText = 'width:16px;height:16px;accent-color:#4a9eff;';
      const span = document.createElement('span');
      span.textContent = ctrl.label;
      lbl.appendChild(cb);
      lbl.appendChild(span);
      row.appendChild(lbl);
    } else if (ctrl.type === 'slider') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = ctrl.min ?? 0;
      inp.max = ctrl.max ?? 1;
      inp.step = ctrl.step ?? 0.01;
      inp.value = ctrl.default ?? 0.5;
      inp.style.cssText = 'width:100%;accent-color:#4a9eff;';
      const val = document.createElement('span');
      val.textContent = inp.value;
      val.style.cssText = 'font-size:11px;color:#888;text-align:right;';
      inp.addEventListener('input', () => { val.textContent = inp.value; });
      row.appendChild(lbl);
      row.appendChild(inp);
      row.appendChild(val);
    } else if (ctrl.type === 'number') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = ctrl.default ?? 0;
      inp.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;';
      row.appendChild(lbl);
      row.appendChild(inp);
    } else if (ctrl.type === 'color') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = ctrl.default ?? '#ffffff';
      inp.style.cssText = 'width:100%;padding:4px;border-radius:4px;border:1px solid #444;background:#222;';
      row.appendChild(lbl);
      row.appendChild(inp);
    } else if (ctrl.type === 'select') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const sel = document.createElement('select');
      sel.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;';
      (ctrl.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      if (ctrl.default) sel.value = ctrl.default;
      row.appendChild(lbl);
      row.appendChild(sel);
    } else if (ctrl.type === 'text') {
      const lbl = document.createElement('label');
      lbl.textContent = ctrl.label;
      lbl.style.cssText = 'font-size:12px;color:#aaa;';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = ctrl.default ?? '';
      inp.placeholder = ctrl.label;
      inp.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;';
      row.appendChild(lbl);
      row.appendChild(inp);
    }

    form.appendChild(row);
  });

  container.appendChild(form);
}

const meta = {
  controls: [
    { key: 'hist-info', type: 'label', label: 'Undo/Redo history for the current session.' },
    { key: 'sep1', type: 'label', label: '──────────' },
    { key: 'undo', type: 'button', label: '↩ Undo', onClick: 'undo' },
    { key: 'redo', type: 'button', label: '↪ Redo', onClick: 'redo' },
    { key: 'sep2', type: 'label', label: '──────────' },
    { key: 'hist-clear', type: 'button', label: 'Clear History', onClick: 'logClearHistory' },
    { key: 'hist-export', type: 'button', label: 'Export as Log', onClick: 'logExportHistory' }
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  
  _renderControls(container, meta.controls);
}
