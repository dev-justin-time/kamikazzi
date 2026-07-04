/**
 * Profile — User preferences, display options, editor settings
 */
function _getApp() { return window.ProModelerApp; }

const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'Editor preferences and display settings:' },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Theme ──
    { key: 'info-theme', type: 'label', label: 'Appearance:' },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'dark',
      options: [
        { value: 'dark', label: 'Dark (default)' },
        { value: 'darker', label: 'Darker' },
        { value: 'blueprint', label: 'Blueprint' },
      ],
      description: 'Editor color scheme',
      onChange: (val) => {
        const themes = { dark: '#1a1a1a', darker: '#0a0a0a', blueprint: '#0d1b2a' };
        document.body.style.background = themes[val] || '#111';
        if (_getApp()?.scene) {
          const bg = { dark: 0x1a1a1a, darker: 0x0a0a0a, blueprint: 0x0d1b2a };
          _getApp().scene.background = new THREE.Color(bg[val] || 0x1a1a1a);
          _getApp().render();
        }
      },
    },
    {
      key: 'bg-color',
      label: 'Background Color',
      type: 'color',
      default: '#1a1a1a',
      description: 'Custom scene background color (overrides theme)',
      onChange: (val) => { _getApp()?.setBackgroundColor(val); },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Display ──
    { key: 'info-display', type: 'label', label: 'Display:' },
    {
      key: 'grid-toggle',
      label: 'Show Grid',
      type: 'toggle',
      default: true,
      onChange: (val) => {
        const app = _getApp();
        if (app?.scene) {
          app.scene.children.forEach(c => {
            if (c.isGridHelper) c.visible = val;
          });
          app.render();
        }
      },
    },
    {
      key: 'grid-snap',
      label: 'Grid Snap',
      type: 'toggle',
      default: true,
      description: 'Snap to grid when using Move tool',
      onChange: (val) => { _getApp()?.setGridSnapEnabled(val); },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Gizmo ──
    { key: 'info-gizmo', type: 'label', label: 'Transform Gizmo:' },
    {
      key: 'gizmo-size',
      label: 'Gizmo Size',
      type: 'slider',
      min: 0.5, max: 3, step: 0.1, default: 1,
      description: 'Size of the transform controls (move/rotate/scale)',
      onChange: (val) => { _getApp()?.setGizmoSize(val); },
    },
    {
      key: 'gizmo-local',
      label: 'Use Local Space',
      type: 'toggle',
      default: false,
      description: 'Transform in local object space instead of world space',
      onChange: (val) => {
        const app = _getApp();
        if (app?.transformControls) {
          app.transformControls.setSpace(val ? 'local' : 'world');
        }
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Performance ──
    { key: 'info-perf', type: 'label', label: 'Performance:' },
    {
      key: 'shadow-toggle',
      label: 'Shadows Enabled',
      type: 'toggle',
      default: true,
      description: 'Toggle shadow rendering (disable for better performance)',
      onChange: (val) => {
        const app = _getApp();
        if (app?.renderer) {
          app.renderer.shadowMap.enabled = val;
          app.render();
        }
      },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Info ──
    { key: 'info-about', type: 'label', label: 'About:' },
    {
      key: 'about',
      type: 'label',
      label: `ProModeler Studio v${(() => {
        try { return '1.2.0'; } catch(e) { return 'dev'; }
      })()}`,
    },
    {
      key: 'reset-defaults',
      label: '↺ Reset to Defaults',
      type: 'button',
      onClick: () => {
        const app = _getApp();
        if (!app) return;
        // Reset various settings
        app.scene.background = new THREE.Color(0x1a1a1a);
        app.setGridSnapEnabled(true);
        app.setGizmoSize(1);
        app.renderer.shadowMap.enabled = true;
        app.transformControls.setSpace('world');
        document.body.style.background = '#1a1a1a';
        app.render();
        log('Preferences reset to defaults');
      },
    },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
