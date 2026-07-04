import { setupDragging, processHeightmapToData } from './uiUtils.js';

export class UIManager {
    constructor(app) {
        this.app = app;
        this.init();
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
            size: document.getElementById('size-val'),
            scale: document.getElementById('scale-val'),
            height: document.getElementById('height-val'),
            octaves: document.getElementById('octaves-val'),
            falloff: document.getElementById('falloff-val'),
            treeDensity: document.getElementById('tree-density-val'),
            cityDensity: document.getElementById('city-density-val'),
            speed: document.getElementById('speed-val'),
            pheight: document.getElementById('pheight-val'),
            brushSize: document.getElementById('brush-size-val'),
            brushStrength: document.getElementById('brush-strength-val'),
            stampHeight: document.getElementById('stamp-height-val'),
            vNoise: document.getElementById('v-noise-val'),
            vDetail: document.getElementById('v-detail-val'),
            biomeRange: document.getElementById('biome-range-val')
        };

        this.setupEvents();
        this.updateToolVisibility();
        this.updateViewMode();
    }

    setupEvents() {
        const { app, elements } = this;
        
        setupDragging(elements['controls-panel'], elements['controls-handle']);
        setupDragging(document.getElementById('minimap-container'), elements['minimap-handle']);

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
        };

        elements['toggle-minimap-collapse'].onclick = () => {
            const container = document.getElementById('minimap-container');
            container.classList.toggle('collapsed');
            elements['toggle-minimap-collapse'].textContent = container.classList.contains('collapsed') ? '+' : '−';
        };

        document.getElementById('view-mode-select').onchange = () => {
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
            const container = document.getElementById('minimap-container');
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
            const upload = document.getElementById('custom-upload-group');
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
        document.getElementById('tree-density-slider').oninput = updateParam('treeDensity', 'treeDensity', true);
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
        document.getElementById('edit-tool').addEventListener('change', () => this.updateToolVisibility());

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
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

        document.getElementById('add-biome-btn').onclick = () => {
            const color = document.getElementById('biome-color').value;
            const range = parseFloat(document.getElementById('biome-range-slider').value);
            app.terrainParams.customBiomes.push({ color, range });
            app.generate();
        };

        document.getElementById('exit-edit-btn').onclick = () => {
            const playerTabBtn = document.querySelector('[data-tab="tab-player"]');
            if (playerTabBtn) playerTabBtn.click();
        };
    }

    processHeightmapImage(img) {
        const qualityVal = document.getElementById('quality-select').value;
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
        document.getElementById('tree-density-slider').value = defaults.treeDensity;
        elements['speed-slider'].value = defaults.moveSpeed;
        elements['pheight-slider'].value = defaults.playerHeight;
        document.getElementById('custom-upload-group').style.display = 'none';
        Object.keys(defaults).forEach(key => { if (this.vals[key]) this.vals[key].textContent = typeof defaults[key] === 'number' ? defaults[key].toFixed(key === 'persistence' || key === 'cityDensity' ? 2 : (key === 'treeDensity' ? 1 : 0)) : defaults[key]; });
        this.updateDensityLimits(defaults.resolution);
        app.generate(false);
    }

    updateDensityLimits(resolution) {
        const treeLimits = { 64: 15, 128: 25, 256: 50, 512: 100, 1024: 200, 2048: 400 };
        const treeMax = treeLimits[resolution] || (resolution / 5.12);
        const cityMax = resolution / 256;

        const treeSlider = document.getElementById('tree-density-slider');
        const citySlider = document.getElementById('city-density-slider');

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
        return document.getElementById('tab-edit').classList.contains('active');
    }

    updateViewMode() {
        const mode = document.getElementById('view-mode-select').value;
        if (mode === 'fly') {
            document.body.classList.add('view-fly');
        } else {
            document.body.classList.remove('view-fly');
        }
    }

    updateToolVisibility() {
        const tool = document.getElementById('edit-tool').value;
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
}