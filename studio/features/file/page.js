/**
 * File Operations — New, Open, Save, Import, Export
 * Wired to Studio API via window.ProModelerApp
 */
const meta = {
  controls: [
    // ── New / Save / Open ──
    { key: 'new',        label: 'New Project',         type: 'button', onClick: () => window.ProModelerApp?.newProject() },
    { key: 'save',       label: 'Save Project (JSON)', type: 'button', onClick: () => window.ProModelerApp?.saveProject() },
    {
      key: 'open',
      label: 'Open Project',
      type: 'button',
      onClick: () => {
        const inp = document.getElementById('projectOpen');
        if (!inp) return;
        inp.value = '';
        inp.accept = '.json';
        inp.onchange = (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target.result);
              window.ProModelerApp?.loadProject(data);
            } catch (err) {
              console.error('[File] Failed to parse project:', err);
            }
          };
          reader.readAsText(file);
        };
        inp.click();
      }
    },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Import ──
    {
      key: 'import',
      label: 'Import Model (GLTF/GLB/OBJ/STL)',
      type: 'button',
      onClick: () => {
        const inp = document.getElementById('projectOpen');
        if (!inp) return;
        inp.value = '';
        inp.accept = '.gltf,.glb,.obj,.stl';
        inp.onchange = (e) => {
          const file = e.target.files?.[0];
          if (file) window.ProModelerApp?.importModel(file);
        };
        inp.click();
      }
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    // ── Export ──
    { key: 'export-glb',  label: 'Export GLB',  type: 'button', onClick: () => window.ProModelerApp?.exportModel('glb') },
    { key: 'export-gltf', label: 'Export GLTF', type: 'button', onClick: () => window.ProModelerApp?.exportModel('gltf') },
    { key: 'export-obj',  label: 'Export OBJ',  type: 'button', onClick: () => window.ProModelerApp?.exportModel('obj') },
    { key: 'export-stl',  label: 'Export STL',  type: 'button', onClick: () => window.ProModelerApp?.exportModel('stl') },
  ],
  onApply: (state, app) => {
    // No special apply logic — buttons fire actions immediately
    console.log('[File] OK — project state applied');
  }
};

export { meta };
export function render(container, state) {
  // Inline renderer for index.html compatibility
  container.innerHTML = '';
}
