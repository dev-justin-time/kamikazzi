/**
 * Studio Shell — top icon bar + centered 3D viewport + popup page system.
 */
export class StudioShell {
  constructor(state) {
    this.state = state;
    this._features = {};
    this._activePopup = null;
    this._iconBar = null;
    this._viewportContainer = null;
    this._popupOverlay = null;
    this._popupContent = null;
    this._statusBar = null;
  }

  /** Register a feature module */
  registerFeature(id, meta) {
    this._features[id] = meta;
  }

  /** Mount the shell into a container element */
  mount(container) {
    container.innerHTML = '';
    container.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background:#111;color:#eee;font:13px/1.4 system-ui,sans-serif;overflow:hidden;position:relative;';

    // ── Top Icon Bar ──
    this._iconBar = document.createElement('div');
    this._iconBar.style.cssText = 'display:flex;align-items:center;gap:2px;padding:4px 8px;background:#1a1a2e;border-bottom:1px solid #333;min-height:44px;overflow-x:auto;flex-shrink:0;';
    container.appendChild(this._iconBar);

    // ── Centered 3D Viewport ──
    this._viewportContainer = document.createElement('div');
    this._viewportContainer.id = 'viewport';
    this._viewportContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;background:#1a1a1a;';
    container.appendChild(this._viewportContainer);

    // ── Status Bar ──
    this._statusBar = document.createElement('div');
    this._statusBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 12px;background:#0d0d1a;border-top:1px solid #333;font-size:11px;color:#888;flex-shrink:0;min-height:24px;';
    this._statusBar.innerHTML = '<span id="status-left">Ready</span><span id="status-right">FPS: 60</span>';
    container.appendChild(this._statusBar);

    // ── Popup Overlay ──
    this._popupOverlay = document.createElement('div');
    this._popupOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;background:rgba(0,0,0,0.6);justify-content:center;align-items:center;';
    this._popupContent = document.createElement('div');
    this._popupContent.style.cssText = 'background:#1e1e2e;border-radius:8px;border:1px solid #444;min-width:320px;max-width:480px;max-height:80vh;overflow-y:auto;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
    this._popupOverlay.appendChild(this._popupContent);
    this._popupOverlay.addEventListener('click', (e) => { if (e.target === this._popupOverlay) this._closePopup(); });
    document.body.appendChild(this._popupOverlay);

    // ── Render icons ──
    this._renderIconBar();

    // ── Store refs in state ──
    this.state.set('shell', this);
    this.state.set('viewport', this._viewportContainer);
  }

  _renderIconBar() {
    const icons = [
      // ── File & Selection ──
      { id: 'file',     label: 'File',         icon: '📁', desc: 'New, open, save, export projects' },
      { id: 'select',   label: 'Select',       icon: '🎯', desc: 'Click, box, lasso selection tools' },
      { id: 'edit',     label: 'Edit',         icon: '✏️', desc: 'Transform, snap, mirror, slice, merge' },
      { id: 'boolean',  label: 'Boolean',      icon: '🔲', desc: 'CSG boolean ops — union, subtract, intersect' },
      { id: 'curve',    label: 'Curve',        icon: '📐', desc: 'Bezier/NURBS curves, path extrusion' },
      { id: 'array',    label: 'Array',        icon: '🔁', desc: 'Linear, radial, grid array modifiers' },

      // ── Sculpting & Modeling ──
      { id: 'object',   label: 'Object',       icon: '🧊', desc: 'Add primitives, properties, hierarchy' },
      { id: 'sculpt',   label: 'Sculpt',       icon: '🪨', desc: 'Clay, smooth, inflate, pinch, crease brushes' },
      { id: 'remesh',   label: 'Remesh',       icon: '🔄', desc: 'Remesh, decimate, retopology solver' },
      { id: 'deform',   label: 'Deform',       icon: '🌊', desc: 'Bend, twist, taper, stretch, lattice deform' },

      // ── Animation & Rigging ──
      { id: 'transition', label: 'Transition', icon: '🔄', desc: 'Tween, morph, interpolate objects' },
      { id: 'rig',      label: 'Rig',          icon: '🦴', desc: 'Bones, FK/IK, skinning, weights' },
      { id: 'mocap',    label: 'Mocap',        icon: '🎬', desc: 'Motion capture import & retarget' },
      { id: 'animate',  label: 'Animate',      icon: '⏯️', desc: 'Timeline, keyframes, clips, playback' },
      { id: 'mixer',    label: 'Mixer',        icon: '🎛️', desc: 'Animation mixer — blend clips, cross-fade, layers' },
      { id: 'constraints', label: 'Constraints', icon: '🔗', desc: 'IK/FK, parent, look-at, path constraints' },
      { id: 'shapes',   label: 'Shape Keys',   icon: '🎭', desc: 'Blend shapes, morph targets, shape key editor' },

      // ── Materials & Textures ──
      { id: 'texture',  label: 'Texture',      icon: '🎨', desc: 'UV mapping, bake, import textures' },
      { id: 'shaders',  label: 'Shaders',      icon: '✨', desc: 'Shader graph, custom materials, PBR editor' },
      { id: 'decal',    label: 'Decal',        icon: '📋', desc: 'Project decals, stickers onto surfaces' },
      { id: 'bake',     label: 'Bake',         icon: '🔥', desc: 'Bake normal/AO/curvature/lightmaps' },
      { id: 'uv',       label: 'UV Tools',     icon: '🗾', desc: 'Unwrap, seam marking, island packing' },
      { id: 'paint',    label: 'Paint',        icon: '🖌️', desc: 'Vertex & texture paint, layers' },

      // ── AI & Pipeline ──
      { id: 'ai',       label: 'AI',           icon: '🤖', desc: 'AI generation, suggestions, texturing' },
      { id: 'script',   label: 'Script',       icon: '📜', desc: 'JS scripting console, automation, batch ops' },
      { id: 'batch',    label: 'Batch',        icon: '📑', desc: 'Batch rename, recolor, rescale, merge' },
      { id: 'snapshot', label: 'Snapshot',     icon: '📸', desc: 'Screenshot, GIF capture, turntable render' },

      // ── Scene & Camera ──
      { id: 'camera',   label: 'Camera',       icon: '📷', desc: 'Camera management, FOV, presets' },
      { id: 'lighting', label: 'Lighting',     icon: '💡', desc: 'Lights, HDRI, environment' },
      { id: 'sky',      label: 'Sky',          icon: '🌌', desc: 'Procedural atmosphere, HDRI skybox, sun' },
      { id: 'weather',  label: 'Weather',      icon: '🌧️', desc: 'Rain, snow, fog, volumetric clouds, wind' },

      // ── World Building ──
      { id: 'map',      label: 'Map',          icon: '🗺️', desc: 'Terrain generation, level editing' },
      { id: 'terrain',  label: 'Terrain',       icon: '⛰️', desc: 'Heightmap editor, erosion, paint terrain' },
      { id: 'water',    label: 'Water',        icon: '🌊', desc: 'Ocean, lake, river simulation with waves' },
      { id: 'foliage',  label: 'Foliage',      icon: '🌿', desc: 'Grass, trees, vegetation scatter system' },
      { id: 'game',     label: 'Game',         icon: '🎮', desc: 'Game mode export, physics setup' },
      { id: 'physics',  label: 'Physics',      icon: '⚡', desc: 'Rigid body, soft body, cloth simulation' },

      // ── VFX & Particles ──
      { id: 'particles', label: 'Particles',   icon: '✨', desc: 'Fire, smoke, sparks, dust, magic emitters' },
      { id: 'fire',     label: 'Fire FX',      icon: '🔥', desc: 'Campfire, explosion, smoke plume, embers' },
      { id: 'trails',   label: 'Trails',       icon: '🌠', desc: 'Motion trails, ghost frames, smear effects' },

      // ── Data & Analysis ──
      { id: 'performance', label: 'Performance', icon: '📊', desc: 'FPS, draw calls, frame time, memory' },
      { id: 'report',   label: 'Report',       icon: '📋', desc: 'Scene diagnostics, stats, material audit' },
      { id: 'history',  label: 'History',      icon: '🕐', desc: 'Undo/redo history browser, snapshot compare' },

      // ── Assets & Collaboration ──
      { id: 'inventory', label: 'Inventory',   icon: '📦', desc: 'Asset library, materials, textures' },
      { id: 'market',   label: 'Market',       icon: '🏪', desc: 'Asset marketplace, purchases' },
      { id: 'voxel',    label: 'Voxel',        icon: '🧱', desc: 'Sparse octree voxel editor (planned)' },
      { id: 'extensions', label: 'Extensions', icon: '🔌', desc: 'Plugin manager, browse, install, configure' },
      { id: 'publish',  label: 'Publish',      icon: '🚀', desc: 'Publish to marketplace, export as asset' },
      { id: 'team',     label: 'Team',         icon: '👥', desc: 'Real-time collaboration, review, merge' },
      { id: 'chat',     label: 'Chat',         icon: '💬', desc: 'Collaboration, comments, AI chat' },
      { id: 'profile',  label: 'Profile',      icon: '👤', desc: 'User settings, preferences' },
    ];

    this._iconBar.innerHTML = '';
    icons.forEach(({ id, label, icon, desc }) => {
      const btn = document.createElement('button');
      btn.dataset.feature = id;
      btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 8px;border:none;border-radius:4px;background:transparent;color:#aaa;cursor:pointer;font-size:10px;transition:all .15s;white-space:nowrap;position:relative;';
      btn.innerHTML = `<span style="font-size:18px;line-height:1">${icon}</span><span>${label}</span>`;

      // Hover tooltip
      let tooltip = null;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255,255,255,0.08)';
        btn.style.color = '#fff';
        tooltip = document.createElement('div');
        tooltip.className = 'sh-tooltip';
        tooltip.textContent = desc;
        tooltip.style.cssText = 'position:fixed;bottom:100%;left:50%;transform:translateX(-50%);background:#222;color:#eee;padding:4px 10px;border-radius:4px;font-size:11px;white-space:nowrap;pointer-events:none;z-index:999;border:1px solid #444;margin-bottom:4px;';
        btn.appendChild(tooltip);
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = '#aaa';
        if (tooltip) { tooltip.remove(); tooltip = null; }
      });

      // Click → open popup
      btn.addEventListener('click', () => this._openPopup(id, label));

      this._iconBar.appendChild(btn);
    });
  }

  /** Open a feature popup — loads from features/<id>/index.html or renders built-in */
  async _openPopup(id, label) {
    if (this._activePopup === id) { this._closePopup(); return; }

    this._popupContent.innerHTML = `<div style="margin-bottom:16px;font-size:16px;font-weight:600;color:#eee">${label}</div><div style="text-align:center;padding:20px;color:#666">Loading...</div>`;
    this._popupOverlay.style.display = 'flex';
    this._activePopup = id;

    try {
      // Try to dynamically import the feature page module
      const mod = await import(`/studio/features/${id}/page.js`);
      this._popupContent.innerHTML = '';
      const header = document.createElement('div');
      header.style.cssText = 'margin-bottom:16px;font-size:16px;font-weight:600;color:#eee';
      header.textContent = label;
      this._popupContent.appendChild(header);
      mod.render(this._popupContent, this.state);
      // Add OK button
      this._addOkButton();
    } catch (e) {
      // Fallback: render basic controls
      this._popupContent.innerHTML = `<div style="margin-bottom:16px;font-size:16px;font-weight:600;color:#eee">${label}</div><div style="padding:12px;color:#888">Feature page loading...<br><span style="font-size:11px">${e.message}</span></div>`;
      this._addOkButton();
    }
  }

  _addOkButton() {
    const ok = document.createElement('button');
    ok.textContent = 'OK ✓';
    ok.style.cssText = 'margin-top:16px;width:100%;padding:10px;border:none;border-radius:6px;background:#4a9eff;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;';
    ok.addEventListener('mouseenter', () => ok.style.background = '#3a8eef');
    ok.addEventListener('mouseleave', () => ok.style.background = '#4a9eff');
    ok.addEventListener('click', () => this._closePopup());
    this._popupContent.appendChild(ok);
  }

  _closePopup() {
    this._popupOverlay.style.display = 'none';
    this._activePopup = null;
  }

  /** Update status bar text */
  setStatus(left, right) {
    const l = document.getElementById('status-left');
    const r = document.getElementById('status-right');
    if (l && left) l.textContent = left;
    if (r && right) r.textContent = right;
  }

  getViewport() { return this._viewportContainer; }
}
