/**
 * Lighting — Add, remove, and adjust lights. Color picker, intensity, shadow toggle, helpers.
 */
const meta = {
  controls: [
    // ── Light Selector ──
    {
      key: 'light-select',
      label: 'Active Light',
      type: 'select',
      default: '0',
      options: [{ value: '0', label: 'Ambient [0]' }],
      onChange: (val) => {
        window.__lightingSelectedIdx = parseInt(val);
      },
    },
    { key: 'sep-select', label: '──────────', type: 'label' },

    // ── Color Picker ──
    {
      key: 'light-color',
      label: 'Light Color',
      type: 'color',
      default: '#ffffff',
      description: 'Color of the selected light',
      onChange: (val) => {
        window.ProModelerApp?.setLightColor(window.__lightingSelectedIdx || 0, val);
      },
    },
    // ── Intensity ──
    {
      key: 'light-intensity',
      label: 'Intensity',
      type: 'slider',
      min: 0, max: 5, step: 0.05, default: 1,
      description: 'Brightness of the selected light',
      onChange: (val) => {
        window.ProModelerApp?.setLightIntensity(window.__lightingSelectedIdx || 0, val);
      },
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Shadow Toggle ──
    {
      key: 'shadow-toggle',
      label: 'Toggle Shadows',
      type: 'button',
      onClick: () => {
        const idx = window.__lightingSelectedIdx || 0;
        window.ProModelerApp?.toggleLightShadow(idx);
        // Update shadow label
        const app = window.ProModelerApp;
        const light = app?.lights?.[idx];
        const btn = document.querySelector('#popupContent [data-key="shadow-toggle"] .ctrl-button');
        if (btn && light) {
          btn.textContent = light.castShadow ? '✓ Shadows ON' : '✗ Shadows OFF';
        }
      },
    },
    // ── Remove Light ──
    {
      key: 'remove-light',
      label: 'Remove Light',
      type: 'button',
      onClick: () => {
        const idx = window.__lightingSelectedIdx || 0;
        window.ProModelerApp?.removeLight(idx);
        // Rebuild the select options by dispatching change on the select
        const sel = document.querySelector('#popupContent [data-key="light-select"] select');
        if (sel) {
          const app = window.ProModelerApp;
          if (app?.lights) {
            sel.innerHTML = app.lights.map((l, i) =>
              `<option value="${i}">${l.name || l.type || 'Light'} [${i}]</option>`
            ).join('');
            sel.value = '0';
            window.__lightingSelectedIdx = 0;
          }
        }
        // Update light count label
        const label = document.querySelector('#popupContent [data-key="light-count"] .ctrl-label');
        if (label) {
          label.textContent = `Scene lights: ${window.ProModelerApp?.lights?.length ?? 0}`;
        }
      },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Add Lights ──
    { key: 'add-point',       label: '➕ Add Point Light',      type: 'button', onClick: () => {
      window.ProModelerApp?.addLight('point');
      _refreshLightUI();
    }},
    { key: 'add-directional', label: '➕ Add Directional Light', type: 'button', onClick: () => {
      window.ProModelerApp?.addLight('directional');
      _refreshLightUI();
    }},
    { key: 'sep3', label: '──────────', type: 'label' },

    // ── Ambient Intensity ──
    {
      key: 'ambient',
      label: 'Ambient Intensity',
      type: 'slider',
      min: 0, max: 2, step: 0.05, default: 0.4,
      description: 'Global ambient light level',
      onChange: (val) => {
        const app = window.ProModelerApp;
        const ambient = app?.lights?.find(l => l.isAmbientLight);
        if (ambient) {
          ambient.intensity = val;
          app.render();
        }
      },
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ── Light Helpers Toggle ──
    {
      key: 'helpers-toggle',
      label: '🔦 Toggle Light Helpers',
      type: 'button',
      onClick: () => {
        const app = window.ProModelerApp;
        app?.toggleLightHelpersVisible();
        const btn = document.querySelector('#popupContent [data-key="helpers-toggle"] .ctrl-button');
        if (btn && app) {
          btn.textContent = app._showLightHelpers ? '🔦 Light Helpers ON' : '🔦 Light Helpers OFF';
        }
      },
    },
    { key: 'sep5', label: '──────────', type: 'label' },

    // ── Light Info ──
    {
      key: 'light-count',
      label: `Scene lights: ${(() => {
        const app = window.ProModelerApp;
        return app?.lights?.length ?? 0;
      })()}`,
      type: 'label',
    },
  ],
  onApply: () => {},
};

/** Refresh the light selector dropdown and count label after add/remove */
function _refreshLightUI() {
  const app = window.ProModelerApp;
  const sel = document.querySelector('#popupContent [data-key="light-select"] select');
  if (sel && app?.lights) {
    sel.innerHTML = app.lights.map((l, i) =>
      `<option value="${i}">${l.name || l.type || 'Light'} [${i}]</option>`
    ).join('');
    sel.value = String(app.lights.length - 1);
    window.__lightingSelectedIdx = app.lights.length - 1;
  }
  const label = document.querySelector('#popupContent [data-key="light-count"] .ctrl-label');
  if (label) {
    label.textContent = `Scene lights: ${app?.lights?.length ?? 0}`;
  }
}

export { meta };
export function render(container, state) {
  container.innerHTML = '';
}
