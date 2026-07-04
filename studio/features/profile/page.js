/**
 * Profile — User settings, preferences, display options
 */
const meta = {
  controls: [
    { key: 'info', type: 'label', label: 'User preferences for the 3D editor:' },
    { key: 'sep1', label: '──────────', type: 'label' },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'dark',
      options: [
        { value: 'dark', label: 'Dark (default)' },
        { value: 'darker', label: 'Darker' },
      ],
      description: 'Editor color scheme (applies to popups and UI)',
      onChange: (val) => {
        document.body.style.background = val === 'darker' ? '#0a0a0a' : '#111';
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },
    {
      key: 'grid-toggle',
      label: 'Show Grid',
      type: 'toggle',
      default: true,
      onChange: (val) => {
        const app = window.ProModelerApp;
        if (app?.scene) {
          app.scene.children.forEach(c => {
            if (c.isGridHelper) c.visible = val;
          });
          app.render();
        }
      },
    },
    { key: 'sep3', label: '──────────', type: 'label' },
    { key: 'info2', type: 'label', label: 'More profile settings coming in production release.' },
  ],
  onApply: () => {},
};

export { meta };
export function render(container, state) { container.innerHTML = ''; }
