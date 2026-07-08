import { setupDragging, processHeightmapToData } from './UIUtils.js';
import { saveMap, loadMap, listMaps, deleteMap, exportMap, importMapFromFile, buildMapSnapshot, applyMapSnapshot } from '../mapStorage.js';

export class UIManager {
    constructor(app) {
        this.app = app;
        this.init();
        this.setupSaveLoadEvents();
    }

    init() {
        const ids = [
            'controls-panel', 'regenerate-btn', 'reset-defaults-btn', 'preset-select', 'quality-select', 'size-slider', 'scale-slider', 
            'height-slider', 'octaves-slider', 'persistence-slider',
            'speed-slider', 'pheight-slider',
            'heightmap-input', 'toggle-minimap-size', 'mode-minimap', 'water-toggle', 'city-density-slider',
            'toggle-controls', 'toggle-minimap-collapse', 'controls-handle', 'minimap-handle', 'fullscreen-btn'
        ];
        this.elements = {};
        ids.forEach(id => this.elements[id] = document.getElementById(id));
        
        this.vals = {
            size: document.getElementById('sg-size-val'),
            scale: document.getElementById('sg-scale-val'),
            height: document.getElementById('sg-height-val'),
            octaves: document.getElementById('sg-octaves-val'),
            falloff: document.getElementById('sg-falloff-val'),
            treeDensity: document.getElementById('sg-tree-density-val'),
            cityDensity: document.getElementById('sg-city-density-val'),
            speed: document.getElementById('sg-speed-val'),
            pheight: document.getElementById('sg-pheight-val'),
            brushSize: document.getElementById('sg-brush-size-val'),
            brushStrength: document.getElementById('sg-brush-strength-val'),
            stampHeight: document.getElementById('sg-stamp-height-val'),
            vNoise: document.getElementById('sg-v-noise-val'),
            vDetail: document.getElementById('sg-v-detail-val'),
            biomeRange: document.getElementById('sg-biome-range-val')
        };

        this.setupEvents();
        this.updateToolVisibility();
        this.updateViewMode();
    }

    setupEvents() {
        const { app, elements } = this;
        
        setupDragging(elements['controls-panel'], elements['controls-handle']);
        setupDragging(document.getElementById('sg-minimap-container'), elements['minimap-handle']);

        this.setupGenerationEvents();
        this.setupPlayerEvents();
        this.setupEditEvents();
        this.setupGlobalEvents();
    }

    setupGlobalEvents() {
        const { app, elements } = this;

        elements['toggle-controls'].onclick = () => {
            elements['controls-panel'].classList.toggle('collapsed');
            elements['toggle-controls'].textContent = elements['controls-panel'].classList.contains('collapsed') ? '+' : '−';
            elements['toggle-controls'].setAttribute('aria-expanded', String(!elements['controls-panel'].classList.contains('collapsed')));
        };

        elements['toggle-minimap-collapse'].onclick = () => {
            const container = document.getElementById('sg-minimap-container');
            container.classList.toggle('collapsed');
            elements['toggle-minimap-collapse'].textContent = container.classList.contains('collapsed') ? '+' : '−';
            elements['toggle-minimap-collapse'].setAttribute('aria-expanded', String(!container.classList.contains('collapsed')));
        };

        document.getElementById('sg-view-mode-select').onchange = () => {
            this.updateViewMode();
        };

        elements['fullscreen-btn'].onclick = () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn(`Fullscreen error: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };

        elements['toggle-minimap-size'].onclick = () => {
            const container = document.getElementById('sg-minimap-container');
            container.classList.remove('collapsed');
            elements['toggle-minimap-collapse'].textContent = '−';
            if (!container.classList.contains('medium') && !container.classList.contains('large')) {
                container.classList.add('medium');
            } else if (container.classList.contains('medium')) {
                container.classList.remove('medium');
                container.classList.add('large');
            } else {
                container.classList.remove('large');
            }
        };

        elements['mode-minimap'].onclick = () => {
            const modes = ['terrain', 'noise', 'clouds'];
            let currentIdx = modes.indexOf(app.minimap.mode);
            app.minimap.mode = modes[(currentIdx + 1) % modes.length];
            app.updateMinimap();
        };
    }

    setupGenerationEvents() {
        const { app, elements } = this;

        elements['regenerate-btn'].onclick = () => {
            app.terrainParams.seed = Math.random();
            app.generate();
        };

        elements['reset-defaults-btn'].onclick = () => this.resetToDefaults();

        elements['preset-select'].onchange = (e) => {
            app.terrainParams.preset = e.target.value;
            const upload = document.getElementById('sg-custom-upload-group');
            if (upload) upload.style.display = e.target.value === 'custom' ? 'block' : 'none';
            app.generate(false);
        };

        elements['quality-select'].onchange = (e) => {
            const val = e.target.value;
            const qualities = { ultralow: 64, low: 128, medium: 256, high: 512, ultra: 1024, extreme: 2048 };
            let newRes = qualities[val] || 256;
            
            if (val === 'original' && app.terrainParams.lastRawHeightmapImage) {
                newRes = app.terrainParams.lastRawHeightmapImage.width;
            }

            app.terrainParams.resolution = newRes;
            this.updateDensityLimits(newRes);

            if (app.terrainParams.lastRawHeightmapImage) {
                this.processHeightmapImage(app.terrainParams.lastRawHeightmapImage);
            } else {
                app.generate(false);
            }
        };

        elements['heightmap-input'].onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    app.terrainParams.lastRawHeightmapImage = img;
                    this.processHeightmapImage(img);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        };

        elements['water-toggle'].onchange = (e) => {
            app.terrainParams.showWater = e.target.checked;
            app.environmentManager.update(app.terrainParams);
        };

        const updateParam = (key, valKey, isFloat = false) => (e) => {
            const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
            app.terrainParams[key] = val;
            if (this.vals[valKey]) this.vals[valKey].textContent = isFloat ? val.toFixed(2) : val;
            app.generate(true);
        };

        elements['size-slider'].oninput = updateParam('size', 'size');
        elements['scale-slider'].oninput = updateParam('scale', 'scale', true);
        elements['height-slider'].oninput = updateParam('height', 'height', true);
        elements['octaves-slider'].oninput = updateParam('octaves', 'octaves');
        elements['persistence-slider'].oninput = updateParam('persistence', 'falloff', true);
        document.getElementById('sg-tree-density-slider').oninput = updateParam('treeDensity', 'treeDensity', true);
        elements['city-density-slider'].oninput = updateParam('cityDensity', 'cityDensity', true);
    }

    setupPlayerEvents() {
        const { app, elements } = this;
        elements['speed-slider'].oninput = (e) => {
            const val = parseFloat(e.target.value);
            app.controls.moveSpeed = val;
            this.vals['speed'].textContent = val;
        };

        elements['pheight-slider'].oninput = (e) => {
            const val = parseFloat(e.target.value);
            app.controls.playerHeight = val;
            this.vals['pheight'].textContent = val;
        };
    }

    setupEditEvents() {
        const { app } = this;
        document.getElementById('sg-edit-tool').addEventListener('change', () => this.updateToolVisibility());

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                document.getElementById(btn.dataset.tab).classList.add('active');
                app.sceneManager.setFogEnabled(btn.dataset.tab !== 'tab-edit');
            });
        });

        const editSliderIds = ['brush-size', 'brush-strength', 'stamp-height', 'v-noise', 'v-detail', 'biome-range'];
        editSliderIds.forEach(id => {
            const camel = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            const slider = document.getElementById(`${id}-slider`);
            if (slider && this.vals[camel]) {
                slider.oninput = (e) => this.vals[camel].textContent = e.target.value;
            }
        });

        document.getElementById('sg-add-biome-btn').onclick = () => {
            const color = document.getElementById('sg-biome-color').value;
            const range = parseFloat(document.getElementById('sg-biome-range-slider').value);
            app.terrainParams.customBiomes.push({ color, range });
            app.generate();
        };

        document.getElementById('sg-exit-edit-btn').onclick = () => {
            const playerTabBtn = document.querySelector('[data-tab="tab-player"]');
            if (playerTabBtn) playerTabBtn.click();
        };
    }

    processHeightmapImage(img) {
        const qualityVal = document.getElementById('sg-quality-select').value;
        let hRes = this.app.terrainParams.resolution;
        if (qualityVal === 'original') {
            hRes = img.width;
            this.app.terrainParams.resolution = hRes;
            this.updateDensityLimits(hRes);
        }
        this.app.terrainParams.customHeightmap = processHeightmapToData(img, hRes);
        this.app.generate(false);
    }

    resetToDefaults() {
        const { app, elements } = this;
        const defaults = { size: 256, resolution: 256, scale: 40, quality: 'medium', height: 25, octaves: 4, persistence: 0.5, preset: 'default', showWater: true, treeDensity: 1.0, cityDensity: 0.0, moveSpeed: 80, playerHeight: 10 };
        Object.assign(app.terrainParams, { ...defaults, seed: Math.random(), customHeightmap: null });
        if (app.controls) { app.controls.moveSpeed = defaults.moveSpeed; app.controls.playerHeight = defaults.playerHeight; }
        elements['quality-select'].value = defaults.quality;
        elements['preset-select'].value = defaults.preset;
        elements['size-slider'].value = defaults.size;
        elements['scale-slider'].value = defaults.scale;
        elements['height-slider'].value = defaults.height;
        elements['octaves-slider'].value = defaults.octaves;
        elements['persistence-slider'].value = defaults.persistence;
        elements['water-toggle'].checked = defaults.showWater;
        elements['city-density-slider'].value = defaults.cityDensity;
        document.getElementById('sg-tree-density-slider').value = defaults.treeDensity;
        elements['speed-slider'].value = defaults.moveSpeed;
        elements['pheight-slider'].value = defaults.playerHeight;
        document.getElementById('sg-custom-upload-group').style.display = 'none';
        Object.keys(defaults).forEach(key => { if (this.vals[key]) this.vals[key].textContent = typeof defaults[key] === 'number' ? defaults[key].toFixed(key === 'persistence' || key === 'cityDensity' ? 2 : (key === 'treeDensity' ? 1 : 0)) : defaults[key]; });
        this.updateDensityLimits(defaults.resolution);
        app.generate(false);
    }

    updateDensityLimits(resolution) {
        const treeLimits = { 64: 15, 128: 25, 256: 50, 512: 100, 1024: 200, 2048: 400 };
        const treeMax = treeLimits[resolution] || (resolution / 5.12);
        const cityMax = resolution / 256;

        const treeSlider = document.getElementById('sg-tree-density-slider');
        const citySlider = document.getElementById('sg-city-density-slider');

        if (treeSlider) {
            treeSlider.max = treeMax;
            if (this.app.terrainParams.treeDensity > treeMax) {
                this.app.terrainParams.treeDensity = treeMax;
                if (this.vals.treeDensity) this.vals.treeDensity.textContent = treeMax.toFixed(1);
            }
        }

        if (citySlider) {
            citySlider.max = cityMax;
            if (this.app.terrainParams.cityDensity > cityMax) {
                this.app.terrainParams.cityDensity = cityMax;
                if (this.vals.cityDensity) this.vals.cityDensity.textContent = cityMax.toFixed(2);
            }
        }
    }

    isEditTabActive() {
        return document.getElementById('sg-tab-edit').classList.contains('active');
    }

    updateViewMode() {
        const mode = document.getElementById('sg-view-mode-select').value;
        if (mode === 'fly') {
            document.body.classList.add('view-fly');
        } else {
            document.body.classList.remove('view-fly');
        }
    }

    updateToolVisibility() {
        const tool = document.getElementById('sg-edit-tool').value;
        document.querySelectorAll('.tool-prop').forEach(el => {
            const allowedTools = el.dataset.tools ? el.dataset.tools.split(' ') : [];
            if (allowedTools.includes(tool)) {
                el.style.display = 'flex';
                // Also handle HR tags which are block
                if (el.tagName === 'HR') el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        });
    }

    // removed setupDragging() {}

    // ── Save / Load Maps ──────────────────────────────────────────────────
    setupSaveLoadEvents() {
        const app = this.app;
        const status = (msg) => {
            const el = document.getElementById('sg-map-save-status');
            if (el) { el.textContent = msg; setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000); }
        };

        // Save
        document.getElementById('sg-save-map-btn')?.addEventListener('click', async () => {
            const nameInput = document.getElementById('sg-map-name-input');
            const name = (nameInput?.value || '').trim() || ('Map ' + new Date().toLocaleTimeString());
            try {
                const snap = buildMapSnapshot(name, app);
                await saveMap(snap);
                status('✅ Saved: ' + name);
            } catch (e) { status('❌ Save failed: ' + e.message); }
        });

        // Export
        document.getElementById('sg-export-map-btn')?.addEventListener('click', () => {
            const nameInput = document.getElementById('sg-map-name-input');
            const name = (nameInput?.value || '').trim() || 'map';
            const snap = buildMapSnapshot(name, app);
            exportMap(snap);
            status('📤 Exported: ' + name);
        });

        // Load (toggle library panel)
        document.getElementById('sg-load-map-btn')?.addEventListener('click', async () => {
            const panel = document.getElementById('sg-map-library-panel');
            if (!panel) return;
            if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
            panel.style.display = 'block';
            panel.innerHTML = '<div style="color:#666;font-size:10px;padding:4px;">Loading...</div>';
            const maps = await listMaps();
            if (maps.length === 0) { panel.innerHTML = '<div style="color:#666;font-size:10px;padding:4px;">No saved maps</div>'; return; }
            panel.innerHTML = '';
            for (const entry of maps) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 4px;border-bottom:1px solid #1a1a2e;cursor:pointer;';
                row.innerHTML = `
                    <span style="flex:1;font-size:10px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${entry.name}</span>
                    <span style="font-size:9px;color:#555;">${new Date(entry.timestamp).toLocaleDateString()}</span>
                    <button data-action="load" style="background:#3b82f6;padding:1px 5px;font-size:9px;border:none;border-radius:2px;color:#fff;cursor:pointer;">▶</button>
                    <button data-action="delete" style="background:#ef4444;padding:1px 5px;font-size:9px;border:none;border-radius:2px;color:#fff;cursor:pointer;">✕</button>
                `;
                row.querySelector('[data-action="load"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    try {
                        const snap = await loadMap(entry.id);
                        if (snap) {
                            applyMapSnapshot(app, snap);
                            const nameInput = document.getElementById('sg-map-name-input');
                            if (nameInput) nameInput.value = snap.name;
                            status('✅ Loaded: ' + snap.name);
                            panel.style.display = 'none';
                        } else { status('❌ Map not found'); }
                    } catch (err) { status('❌ Load failed'); }
                });
                row.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await deleteMap(entry.id);
                    row.remove();
                    status('🗑️ Deleted: ' + entry.name);
                });
                panel.appendChild(row);
            }
        });

        // Import
        document.getElementById('sg-import-map-btn')?.addEventListener('click', () => {
            document.getElementById('sg-import-map-file')?.click();
        });
        document.getElementById('sg-import-map-file')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const snap = await importMapFromFile(file);
                if (snap) {
                    applyMapSnapshot(app, snap);
                    const nameInput = document.getElementById('sg-map-name-input');
                    if (nameInput) nameInput.value = snap.name;
                    status('📥 Imported: ' + snap.name);
                } else { status('❌ Invalid map file'); }
            } catch (err) { status('❌ Import failed'); }
            e.target.value = '';
        });
    }
}