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
      label: 'Import Model (GLTF/GLB + .bin + textures)',
      type: 'button',
      onClick: () => {
        const inp = document.getElementById('projectOpen');
        if (!inp) return;
        inp.value = '';
        inp.multiple = true;
        inp.accept = '.gltf,.glb,.obj,.stl,.bin,.png,.jpg,.jpeg,.webp,.hdr,.ktx2';
        inp.onchange = (e) => {
          const fileList = Array.from(e.target.files || []);
          if (fileList.length === 0) return;
          // Build file map FIRST so main file's blob URL is reused (no double creation)
          const fileMap = Object.fromEntries(fileList.map(f => [f.name, URL.createObjectURL(f)]));
          const mainFile = fileList.find(f => /\.(gltf|glb|obj|stl)$/i.test(f.name)) || fileList[0];
          window.ProModelerApp?.importModel({
            url: fileMap[mainFile.name],  // reuse — same blob URL as in files map
            files: fileMap,
            name: mainFile.name
          });
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
