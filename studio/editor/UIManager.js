import * as THREE from 'three';

export class UIManager {
    constructor(studio) {
        this.studio = studio;
        this.consoleOutput = document.querySelector('.console-output');
        this.frameRateInput = document.getElementById('frameRate');
        this.animSpeedInput = document.getElementById('animSpeed');
    }

    init() {
        this.setupGlobalListeners();
        this.setupMenuSystem();
        this.setupToolbar();
        this.setupMobileToggles();
        this.setupPanels();
        this.setupConsole();
        this.setupTimelineInteraction();
        this.setupTexturePaintControls();
        this.setupVertexPaintControls();
        this.updateMaterialPresets();
        this.setupRenderControls();
        this.setupImportExportControls();
        this.setupHelpMenu();
        this.setupDelegatedMenuToggle();
        this.setupAutosave();
        this.setupRecentFiles();
        this.setupEditorTools();
        this.setupCameraManagement();
        this.setupAnimationTopBar();
        this.setupPaintMenuControls();
        this.setupTextureMenuControls();
        this.setupMaterialControls();
        this.setupGameMapGenerator();
        this.setupFileOperations();
        this.setupExportControls();

        // Initialize UI state for buttons (disabled until selection)
        this.updateUIForSelection({ selectedObject: null, canChangeColor: true });
    }

    log(message, type = 'info') {
        if (!this.consoleOutput) return;
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = message;
        this.consoleOutput.appendChild(line);
        this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
    }

    showStatus(message, duration = 3000) {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.textContent = message;
        clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(() => { el.textContent = ''; }, duration);
    }

    updateUIForSelection(detail) {
        const hasSelection = !!detail.selectedObject;
        ['deleteBtn','duplicateBtn','renameInput','renameBtn','snapToggle','snapSize'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !hasSelection;
        });
        const colorPicker = document.getElementById('brushColor') || document.getElementById('colorPicker');
        if (colorPicker) {
            colorPicker.disabled = !hasSelection || !detail.canChangeColor;
            if (detail.color) colorPicker.value = detail.color;
        }
        const renameInput = document.getElementById('renameInput');
        if (renameInput) {
            renameInput.value = (detail.selectedObject && detail.selectedObject.name) ? detail.selectedObject.name : '';
        }
        // Fire custom event for any other handlers
        document.dispatchEvent(new CustomEvent('editor-selection-change', { detail }));
    }

    setupGlobalListeners() {
         // Range inputs value display
         document.addEventListener('input', (event) => {
            if (event.target.type === 'range') {
                const valueSpan = event.target.parentNode.querySelector('.value');
                if (valueSpan) {
                    valueSpan.textContent = parseFloat(event.target.value).toFixed(2);
                }
            }
        });

        // Window resize is handled in App for renderer, but we handle nav cube here
        window.addEventListener('resize', () => {
            this.studio.updateNavCubeOrientation();
        });
    }

    setupMobileToggles() {
        const overlay = document.querySelector('.sidebar-overlay');
        const sidebars = document.querySelectorAll('.sidebar');
        
        document.querySelectorAll('.mobile-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.querySelector(`.${btn.dataset.toggle}`);
                const isOpening = !target.classList.contains('open');
                
                // Close all first
                sidebars.forEach(s => s.classList.remove('open'));
                document.querySelectorAll('.mobile-toggle-btn').forEach(b => b.classList.remove('active'));
                
                if (isOpening) {
                    target.classList.add('open');
                    btn.classList.add('active');
                    overlay?.classList.add('active');
                } else {
                    overlay?.classList.remove('active');
                }
            });
        });

        overlay?.addEventListener('click', () => {
            sidebars.forEach(s => s.classList.remove('open'));
            document.querySelectorAll('.mobile-toggle-btn').forEach(b => b.classList.remove('active'));
            overlay.classList.remove('active');
        });
    }

    setupMenuSystem() {
        document.querySelectorAll('[data-action]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.studio.handleMenuAction(action);
            });
        });
    }

    setupToolbar() {
        // Tools
        document.querySelectorAll('[data-tool]').forEach(tool => {
            tool.addEventListener('click', () => {
                document.querySelector('.tool-item.active')?.classList.remove('active');
                tool.classList.add('active');

                if (this.studio.currentTool !== 'select' && this.studio.hoveredObject) {
                    this.studio.setObjectHover(this.studio.hoveredObject, false);
                    this.studio.hoveredObject = null;
                }

                this.studio.setTransformMode(tool.dataset.tool);
            });
        });

        // View Mode
        document.querySelectorAll('[data-shading]').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelector('.shading-option.active')?.classList.remove('active');
                button.classList.add('active');
                this.studio.setViewMode(button.dataset.shading);
            });
        });

        // Viewport Camera Buttons
        document.querySelectorAll('.viewport-btn[data-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.viewport-btn[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.studio.setCameraView(btn.dataset.view);
            });
        });

        // View Mode Select
        const viewModeSelect = document.getElementById('viewMode');
        viewModeSelect?.addEventListener('change', (e) => {
             this.studio.setViewMode(e.target.value);
             document.querySelectorAll('[data-shading]').forEach(btn => {
                 btn.classList.toggle('active', btn.dataset.shading === e.target.value);
             });
        });

        // Nav Cube
        const navCube = document.querySelector('.nav-cube');
        navCube?.querySelectorAll('.cube-face').forEach(face => {
            face.addEventListener('click', (e) => {
                e.stopPropagation();
                const dir = face.dataset.dir;
                if (dir) {
                    this.studio.setCameraView(dir);
                    document.querySelectorAll('.viewport-btn[data-view]').forEach(b => b.classList.remove('active'));
                    const btn = document.querySelector(`.viewport-btn[data-view="${dir}"]`);
                    if (btn) btn.classList.add('active');
                }
            });
        });
    }

    setupPanels() {
        // Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const panelType = tab.dataset.panel;
                const parent = tab.closest('.sidebar') || tab.closest('.bottom-panel');
                parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                parent.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                parent.querySelector(`.${panelType}-panel`)?.classList.add('active');
            });
        });

        // Asset Categories
        document.querySelectorAll('.assets-panel .category').forEach(cat => {
            cat.addEventListener('click', async () => {
                const panel = cat.closest('.assets-panel');
                panel.querySelectorAll('.category').forEach(c => c.classList.remove('active'));
                cat.classList.add('active');

                const assetGrid = panel.querySelector('.asset-grid');
                
                if (cat.dataset.source === 'cloud') {
                    // Handle Cloud Store
                    if (!this.studio.cloudSystem) return;
                    
                    assetGrid.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div><div style="text-align:center; width:100%; color:#888; font-size:12px; margin-top:10px;">Connecting to Asset Store...</div>';
                    
                    try {
                        const assets = await this.studio.cloudSystem.fetchAssets();
                        this.renderCloudAssets(assets, assetGrid);
                    } catch (e) {
                        assetGrid.innerHTML = '<div style="color:#ff4444; text-align:center; padding:20px;">Failed to connect to store.</div>';
                    }
                } else {
                    // Reset to local assets (simplified restoration)
                    this.renderLocalAssets(assetGrid);
                }
            });
        });

        // Properties Input
        document.addEventListener('input', (event) => {
            if (event.target.matches('.property-row input')) {
                this.studio.updateObjectProperty(event.target);
            }
        });

        // Material Panel
        const matPanel = document.querySelector('.materials-panel');
        matPanel?.addEventListener('input', (ev) => {
            if (!this.studio.selectedObject || !this.studio.selectedObject.material) return;
            const mat = this.studio.selectedObject.material;
            if (ev.target.type === 'color') {
                mat.color.set(ev.target.value);
                this.studio.render();
            } else if (ev.target.type === 'range') {
                const rows = [...matPanel.querySelectorAll('.property-row')];
                const metallicRow = rows.find(r => r.querySelector('label')?.textContent.includes('Metallic'));
                const roughRow = rows.find(r => r.querySelector('label')?.textContent.includes('Roughness'));
                if (ev.target === metallicRow?.querySelector('input[type="range"]')) {
                    mat.metalness = parseFloat(ev.target.value);
                } else if (ev.target === roughRow?.querySelector('input[type="range"]')) {
                    mat.roughness = parseFloat(ev.target.value);
                }
                mat.needsUpdate = true;
                this.studio.render();
            }
        });
    }

    renderCloudAssets(assets, container) {
        container.innerHTML = '';
        assets.forEach(asset => {
            const el = document.createElement('div');
            el.className = 'asset-item';
            el.innerHTML = `
                <div class="asset-thumbnail" style="position:relative; overflow:hidden;">
                    <i class="fas ${asset.icon}"></i>
                    <div style="position:absolute; top:0; right:0; background:#4a9eff; color:white; font-size:9px; padding:2px 4px; border-bottom-left-radius:4px;">${asset.cost || 'Free'}</div>
                </div>
                <span>${asset.name}</span>
            `;
            el.addEventListener('click', async () => {
                this.showLoading(`Downloading ${asset.name}...`);
                try {
                    await this.studio.cloudSystem.downloadAndImport(asset.id);
                    this.log(`Imported ${asset.name}`, 'success');
                } catch (e) {
                    this.log(`Download failed: ${e.message}`, 'error');
                } finally {
                    this.hideLoading();
                }
            });
            container.appendChild(el);
        });
    }

    renderLocalAssets(container) {
        // Define canonical workflow order for local assets to ensure consistent tile ordering.
        const workflowOrder = [
            { id: 'cube', title: 'Default Cube', icon: 'fas fa-cube', action: "document.querySelector('[data-action=add-cube]').click()" },
            { id: 'sphere', title: 'UV Sphere', icon: 'fas fa-circle', action: "document.querySelector('[data-action=add-sphere]').click()" },
            { id: 'cylinder', title: 'Cylinder', icon: 'fas fa-database', action: "document.querySelector('[data-action=add-cylinder]').click()" },
            { id: 'terrain', title: 'Terrain', icon: 'fas fa-mountain', action: "document.querySelector('[data-action=gen-terrain]').click()" }
        ];

        // Clear container and render items in workflow order (stable and predictable)
        container.innerHTML = '';
        workflowOrder.forEach(item => {
            const el = document.createElement('div');
            el.className = 'asset-item';
            el.setAttribute('data-asset-id', item.id);
            el.innerHTML = `
                <div class="asset-thumbnail">
                    <i class="${item.icon}"></i>
                </div>
                <span>${item.title}</span>
            `;
            el.addEventListener('click', () => {
                try {
                    // Execute the associated action string in a safe manner
                    // (keeps current inline onclick behavior but avoids relying on innerHTML onclick)
                    // Prefer dispatching the corresponding data-action if present
                    const match = item.action.match(/\\[data-action=([^\\]]+)\\]/);
                    if (match) {
                        const act = match[1];
                        const btn = document.querySelector(`[data-action="${act}"]`);
                        if (btn) { btn.click(); return; }
                    }
                    // Fallback eval of provided action string (very limited)
                    // eslint-disable-next-line no-eval
                    eval(item.action);
                } catch (e) {
                    console.warn('Asset click action failed for', item.id, e);
                }
            });
            container.appendChild(el);
        });
    }

    setupConsole() {
        const consoleInput = document.querySelector('.console-input input');
        if (consoleInput) {
            consoleInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    const command = event.target.value.trim();
                    if (command) {
                        this.log(command, 'command');
                        this.studio.executeConsoleCommand(command);
                        event.target.value = '';
                    }
                }
            });
        }
    }

    setupRenderControls() {
        document.querySelectorAll('.render-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.textContent.includes('Render Image')) {
                    this.studio.renderImage();
                } else if (btn.textContent.includes('Render Animation')) {
                    this.studio.renderAnimation();
                }
            });
        });
    }

    setupImportExportControls() {
        const projectOpen = document.getElementById('projectOpen');
        projectOpen?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            
            this.showLoading('Loading Project...');
            await new Promise(r => setTimeout(r, 50));

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this.studio.loadProject(data);
                    this.log('Project loaded', 'success');
                } catch (err) {
                    this.log(`Load error: ${err.message}`, 'error');
                } finally {
                    this.hideLoading();
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        const modelImport = document.getElementById('modelImport');
        modelImport?.addEventListener('change', async (e) => {
            const fileList = Array.from(e.target.files || []);
            if (fileList.length === 0) return;

            const fileName = fileList[0].name;
            this.showLoading(`Importing ${fileName}${fileList.length > 1 ? ` +${fileList.length - 1} files` : ''}...`);
            await new Promise(r => setTimeout(r, 50));

            try {
                if (fileList.length === 1) {
                    // Single file — pass directly (GLB self-contained, or URL import)
                    await this.studio.importExport.importModel(fileList[0]);
                } else {
                    // Multi-file package — build file map + URLModifier package
                    const fileMap = Object.fromEntries(fileList.map(f => [f.name, URL.createObjectURL(f)]));
                    const mainFile = fileList.find(f => /\.(gltf|glb|obj|stl)$/i.test(f.name)) || fileList[0];
                    await this.studio.importExport.importModel({
                        url: fileMap[mainFile.name],
                        files: fileMap,
                        name: mainFile.name
                    });
                }
            } catch(e) {
                this.log('Import failed', 'error');
            } finally {
                this.hideLoading();
            }
            e.target.value = '';
        });
    }

    setupTexturePaintControls() {
        const colorPicker = document.getElementById('brushColor');
        const sizeSlider = document.getElementById('brushSize');
        const opacitySlider = document.getElementById('brushOpacity');

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                if (this.studio.texturePaintSystem) {
                    this.studio.texturePaintSystem.setBrushColor(e.target.value);
                }
            });
        }

        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                if (this.studio.texturePaintSystem) {
                    this.studio.texturePaintSystem.setBrushSize(parseInt(e.target.value));
                }
            });
        }
        
        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                if (this.studio.texturePaintSystem) {
                    this.studio.texturePaintSystem.brush.opacity = parseFloat(e.target.value);
                }
            });
        }

        const addLayerBtn = document.getElementById('addPaintLayerBtn');
        if (addLayerBtn) {
            addLayerBtn.addEventListener('click', () => {
                if (this.studio.texturePaintSystem) {
                    this.studio.texturePaintSystem.addLayer();
                }
            });
        }
    }

    setupVertexPaintControls() {
        const colorPicker = document.getElementById('vertexBrushColor');
        const sizeSlider = document.getElementById('vertexBrushSize');
        const strengthSlider = document.getElementById('vertexBrushStrength');

        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                if (this.studio.vertexPaintSystem) {
                    this.studio.vertexPaintSystem.setBrushColor(e.target.value);
                }
            });
        }

        if (sizeSlider) {
            sizeSlider.addEventListener('input', (e) => {
                if (this.studio.vertexPaintSystem) {
                    this.studio.vertexPaintSystem.setBrushSize(parseFloat(e.target.value));
                }
            });
        }

        if (strengthSlider) {
            strengthSlider.addEventListener('input', (e) => {
                if (this.studio.vertexPaintSystem) {
                    this.studio.vertexPaintSystem.setBrushStrength(parseFloat(e.target.value));
                }
            });
        }
    }

    updatePaintLayersList() {
        const list = document.getElementById('paintLayersList');
        if (!list || !this.studio.texturePaintSystem) return;

        list.innerHTML = '';
        const system = this.studio.texturePaintSystem;

        // Iterate backwards so top layer is top of list
        for (let i = system.layers.length - 1; i >= 0; i--) {
            const layer = system.layers[i];
            const isActive = (i === system.activeLayerIndex);
            
            const el = document.createElement('div');
            el.className = `paint-layer-item ${isActive ? 'active' : ''}`;
            el.innerHTML = `
                <div class="layer-vis-toggle" title="Toggle Visibility">
                    <i class="fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </div>
                <div class="paint-layer-name">${layer.name}</div>
                ${system.layers.length > 1 ? '<i class="fas fa-trash" style="font-size:10px; opacity:0.5; padding:4px;"></i>' : ''}
            `;

            // Click to select
            el.addEventListener('click', (e) => {
                if (!e.target.closest('.layer-vis-toggle') && !e.target.classList.contains('fa-trash')) {
                    system.setActiveLayer(i);
                }
            });

            // Toggle visibility
            el.querySelector('.layer-vis-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                system.toggleLayerVisibility(i);
            });

            // Delete
            const trash = el.querySelector('.fa-trash');
            if (trash) {
                trash.addEventListener('click', (e) => {
                    e.stopPropagation();
                    system.removeLayer(i);
                });
            }

            list.appendChild(el);
        }
    }

    toggleTexturePaintUI(show) {
        const panel = document.getElementById('texturePaintPanel');
        if (panel) {
            panel.classList.toggle('active', show);
        }
        // Also hide properties panel to reduce clutter?
        const rightSidebar = document.querySelector('.right-sidebar');
        // Optional: rightSidebar.style.display = show ? 'none' : 'flex';
    }

    toggleVertexPaintUI(show) {
        const panel = document.getElementById('vertexPaintPanel');
        if (panel) {
            panel.classList.toggle('active', show);
        }
    }

    showLoading(message = 'Loading...') {
        const overlay = document.getElementById('loadingOverlay');
        const text = overlay?.querySelector('.loading-text');
        if (overlay && text) {
            text.textContent = message;
            overlay.classList.add('active');
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    updateOutliner() {
        const outlinerTree = document.querySelector('.outliner-tree');
        if (!outlinerTree) return;

        const sceneItem = outlinerTree.querySelector('.tree-item:not(.nested)');
        outlinerTree.innerHTML = '';
        if (sceneItem) outlinerTree.appendChild(sceneItem);

        [...this.studio.objects, ...this.studio.lights].forEach(object => {
            if (object.name) {
                const item = document.createElement('div');
                item.className = 'tree-item nested';
                if (object === this.studio.selectedObject) {
                    item.classList.add('selected');
                }

                let icon = 'fas fa-cube';
                if (object.isLight) icon = 'fas fa-lightbulb';
                else if (object.isCamera) icon = 'fas fa-video';
                else if (object.isPoints) icon = 'fas fa-magic';
                else if (object.isGroup) icon = 'fas fa-layer-group';

                item.innerHTML = `
                    <i class="${icon}"></i>
                    <span>${object.name}</span>
                    <div class="item-actions">
                        <i class="fas fa-eye"></i>
                        <i class="fas fa-lock"></i>
                    </div>
                `;

                item.addEventListener('click', () => {
                    this.studio.selectObject(object);
                });

                outlinerTree.appendChild(item);
            }
        });
    }

    updateOutlinerSelection(object) {
        document.querySelectorAll('.tree-item').forEach(item => {
            item.classList.remove('selected');
        });

        const objectName = object.name || 'Unnamed';
        const treeItems = document.querySelectorAll('.tree-item');
        treeItems.forEach(item => {
            if (item.querySelector('span')?.textContent === objectName) {
                item.classList.add('selected');
            }
        });
    }

    updatePropertiesPanel(object) {
        if (!object) return;
        const position = object.position;
        const rotation = object.rotation;
        const scale = object.scale;

        const locationInputs = document.querySelectorAll('.vector-input .x-input, .vector-input .y-input, .vector-input .z-input');
        if (locationInputs.length >= 3) {
            locationInputs[0].value = position.x.toFixed(2);
            locationInputs[1].value = position.y.toFixed(2);
            locationInputs[2].value = position.z.toFixed(2);
        }

        const rotationInputs = document.querySelectorAll('.property-row')[1]?.querySelectorAll('input');
        if (rotationInputs && rotationInputs.length >= 3) {
            rotationInputs[0].value = (rotation.x * 180 / Math.PI).toFixed(0);
            rotationInputs[1].value = (rotation.y * 180 / Math.PI).toFixed(0);
            rotationInputs[2].value = (rotation.z * 180 / Math.PI).toFixed(0);
        }

        const scaleInputs = document.querySelectorAll('.property-row')[2]?.querySelectorAll('input');
        if (scaleInputs && scaleInputs.length >= 3) {
            scaleInputs[0].value = scale.x.toFixed(2);
            scaleInputs[1].value = scale.y.toFixed(2);
            scaleInputs[2].value = scale.z.toFixed(2);
        }
    }

    updateViewportStats() {
        // Throttle frequent DOM updates to avoid perf churn (every 250ms)
        try {
            if (!this._lastViewportStats) this._lastViewportStats = 0;
            const now = performance.now();
            if (now - this._lastViewportStats < 250) return;
            this._lastViewportStats = now;

            const stats = document.querySelector('.viewport-stats');
            if (!stats) return;

            // If no selection, clear or show zeros
            if (!this.studio || !this.studio.selectedObject) {
                stats.innerHTML = `<span>Verts: 0</span><span>Faces: 0</span><span>Tris: 0</span>`;
                return;
            }

            let vertices = 0;
            let faces = 0;
            const obj = this.studio.selectedObject;

            if (obj && obj.geometry) {
                try {
                    vertices = obj.geometry.attributes.position?.count || 0;
                    faces = obj.geometry.index ? (obj.geometry.index.count / 3) : (vertices / 3);
                } catch (e) {
                    // Defensive fallback if geometry is non-standard
                    vertices = 0;
                    faces = 0;
                }
            }

            stats.innerHTML = `
                <span>Verts: ${Math.floor(vertices)}</span>
                <span>Faces: ${Math.floor(faces)}</span>
                <span>Tris: ${Math.floor(faces)}</span>
            `;
        } catch (e) {
            // Ensure no exception bubbles from stats updates
            console.warn('updateViewportStats safe guard caught error:', e);
        }
    }

    updateMaterialPresets() {
        const materialsPanel = document.querySelector('.materials-panel');
        if (!materialsPanel || materialsPanel.querySelector('.material-presets')) return;

        const presetsSection = document.createElement('div');
        presetsSection.className = 'material-presets';
        presetsSection.innerHTML = `
            <h4>Material Presets</h4>
            <div class="preset-grid">
                ${Object.keys(this.studio.materialPresets || {}).map(name => `
                    <div class="preset-item" data-preset="${name}">
                        <div class="preset-preview"></div>
                        <span>${name}</span>
                    </div>
                `).join('')}
            </div>
        `;

        const ref = materialsPanel.querySelector('.material-properties');
        if (ref) materialsPanel.insertBefore(presetsSection, ref);

        presetsSection.querySelectorAll('.preset-item').forEach(item => {
            item.addEventListener('click', () => {
                const presetName = item.dataset.preset;
                this.studio.applyMaterialPreset(presetName);
            });
        });
    }

    updateMaterialUI(preset) {
        const colorInput = document.querySelector('.materials-panel input[type="color"]');
        const metallicSlider = document.querySelector('.materials-panel input[type="range"]');
        const roughnessSlider = document.querySelectorAll('.materials-panel input[type="range"]')[1];

        if (colorInput) colorInput.value = '#' + preset.color.toString(16).padStart(6, '0');
        if (metallicSlider) {
            metallicSlider.value = preset.metallic;
            metallicSlider.nextElementSibling.textContent = preset.metallic.toFixed(2);
        }
        if (roughnessSlider) {
            roughnessSlider.value = preset.roughness;
            roughnessSlider.nextElementSibling.textContent = preset.roughness.toFixed(2);
        }
    }

    setupTimelineInteraction() {
        const timeline = document.querySelector('.track-timeline');
        if (!timeline) return;

        timeline.addEventListener('click', (event) => {
            const rect = timeline.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const frame = Math.round((x / rect.width) * this.studio.totalFrames);
            this.studio.setCurrentFrame(frame);
            this.studio.addKeyframe(frame);
        });

        // Timeline controls
        document.querySelectorAll('.timeline-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                this.studio.handleTimelineAction(action);
            });
        });
    }

    updateTimelineScrubber() {
        const timeline = document.querySelector('.track-timeline');
        if (!timeline) return;
        const existingScrubber = timeline.querySelector('.timeline-scrubber');
        if (existingScrubber) existingScrubber.remove();

        const scrubber = document.createElement('div');
        scrubber.className = 'timeline-scrubber';
        scrubber.style.left = `${(this.studio.currentFrame / this.studio.totalFrames) * 100}%`;
        timeline.appendChild(scrubber);
    }

    updateTimelineKeyframes() {
        const timeline = document.querySelector('.track-timeline');
        if (!timeline) return;
        timeline.querySelectorAll('.keyframe').forEach(kf => kf.remove());

        if (this.studio.selectedObject && this.studio.keyframes.has(this.studio.selectedObject.uuid)) {
            const keyframes = this.studio.keyframes.get(this.studio.selectedObject.uuid);
            keyframes.forEach(kf => {
                const keyframeEl = document.createElement('div');
                keyframeEl.className = 'keyframe';
                keyframeEl.style.left = `${(kf.frame / this.studio.totalFrames) * 100}%`;
                keyframeEl.title = `Frame ${kf.frame}`;
                timeline.appendChild(keyframeEl);
            });
        }
    }

    updatePerformanceUI(profiler) {
        try {
            const fpsElement = document.getElementById('fpsCounter');
            const drawCallsElement = document.getElementById('drawCalls');
            const trianglesElement = document.getElementById('triangles');
            const memoryElement = document.getElementById('memoryUsage');

            // Defensive defaults if profiler or its fields are undefined
            const fps = profiler && typeof profiler.fps !== 'undefined' ? profiler.fps : '—';
            const drawCalls = profiler && typeof profiler.drawCalls !== 'undefined' ? profiler.drawCalls : '—';
            const triangles = profiler && typeof profiler.triangles !== 'undefined' ? profiler.triangles : 0;
            const memoryUsed = profiler && profiler.memory && typeof profiler.memory.used !== 'undefined' ? profiler.memory.used : '—';

            if (fpsElement) fpsElement.textContent = String(fps);
            if (drawCallsElement) drawCallsElement.textContent = String(drawCalls);
            if (trianglesElement) {
                if (typeof triangles === 'number') trianglesElement.textContent = `${(triangles / 1000).toFixed(1)}k`;
                else trianglesElement.textContent = String(triangles);
            }
            if (memoryElement) memoryElement.textContent = typeof memoryUsed === 'number' ? `${memoryUsed}MB` : String(memoryUsed);
        } catch (e) {
            console.warn('updatePerformanceUI safe guard caught error:', e);
        }
    }

    togglePerfMonitor(show) {
        const monitor = document.getElementById('perfMonitor');
        if (monitor) monitor.classList.toggle('show', show);
    }

    showSculptTools() {
        const toolbar = document.querySelector('.main-toolbar');
        if (toolbar.querySelector('.sculpt-tools')) return;

        const sculptTools = document.createElement('div');
        sculptTools.className = 'sculpt-tools tool-group';
        sculptTools.innerHTML = `
            <div class="tool-item active" data-sculpt="brush" title="Brush">
                <i class="fas fa-paint-brush"></i>
            </div>
            <div class="tool-item" data-sculpt="smooth" title="Smooth">
                <i class="fas fa-water"></i>
            </div>
            <div class="tool-item" data-sculpt="inflate" title="Inflate">
                <i class="fas fa-plus-circle"></i>
            </div>
            <div class="tool-item" data-sculpt="pinch" title="Pinch">
                <i class="fas fa-compress-alt"></i>
            </div>
        `;

        toolbar.appendChild(sculptTools);

        sculptTools.querySelectorAll('.tool-item').forEach(tool => {
            tool.addEventListener('click', () => {
                sculptTools.querySelector('.active')?.classList.remove('active');
                tool.classList.add('active');
                if (this.studio.sculptSystem) this.studio.sculptSystem.setMode(tool.dataset.sculpt);
            });
        });
    }

    // ── Merged from ui-manager.js ──

    /** Get or create a DOM element by id. Creates hidden placeholder if missing (avoids null refs). */
    _getEl(id, tag = 'div', typeAttr = null) {
        const exist = document.getElementById(id);
        if (exist) return exist;
        const el = document.createElement(tag);
        el.id = id;
        el.style.display = 'none';
        if (typeAttr) el.type = typeAttr;
        document.body.appendChild(el);
        return el;
    }

    setupHelpMenu() {
        const menuLeft = document.querySelector('.menu-left');
        if (!menuLeft || document.getElementById('menu-help')) return;

        // Prevent clicks on dropdown controls from closing their parent menus
        const stopDropdownClose = (el) => {
            el.addEventListener('click', (e) => e.stopPropagation());
            el.addEventListener('mousedown', (e) => e.stopPropagation());
        };

        const helpItem = document.createElement('div');
        helpItem.className = 'menu-item';
        helpItem.id = 'menu-help';
        helpItem.textContent = 'Help';

        const helpDropdown = document.createElement('div');
        helpDropdown.className = 'dropdown';
        helpDropdown.id = 'help-dropdown';
        helpDropdown.innerHTML = `
            <div class="dropdown-section">
                <div class="dropdown-title">Resources</div>
                <button class="dropdown-btn" id="help-shortcuts">Keyboard Shortcuts</button>
                <button class="dropdown-btn" id="help-docs">Docs / Tutorial</button>
                <button class="dropdown-btn" id="help-about">About Editor</button>
            </div>
        `;

        helpItem.appendChild(helpDropdown);
        menuLeft.appendChild(helpItem);

        helpItem.addEventListener('click', (e) => { e.currentTarget.classList.toggle('open'); });
        document.addEventListener('click', (e) => {
            if (!helpItem.contains(e.target)) helpItem.classList.remove('open');
        });

        const shortcutsBtn = helpDropdown.querySelector('#help-shortcuts');
        const docsBtn = helpDropdown.querySelector('#help-docs');
        const aboutBtn = helpDropdown.querySelector('#help-about');

        if (shortcutsBtn) {
            stopDropdownClose(shortcutsBtn);
            shortcutsBtn.addEventListener('click', () => {
                this.showStatus('Shortcuts: Click to select, WASD to navigate (when enabled), Ctrl+Z undo, Ctrl+Y redo', 6000);
            });
        }
        if (docsBtn) {
            stopDropdownClose(docsBtn);
            docsBtn.addEventListener('click', () => {
                window.open('https://example.com/docs', '_blank');
                this.showStatus('Opened docs (external)', 3000);
            });
        }
        if (aboutBtn) {
            stopDropdownClose(aboutBtn);
            aboutBtn.addEventListener('click', () => {
                this.log('ProModeler Studio — 3D modeling suite with import/export, camera, paint and texture tools.', 'info');
            });
        }
    }

    setupDelegatedMenuToggle() {
        // Toggle via delegation: handle clicks on .menu-item toggles
        document.addEventListener('click', (e) => {
            const clickedMenuItem = e.target.closest && e.target.closest('.menu-item');
            if (clickedMenuItem) {
                const dd = clickedMenuItem.querySelector('.dropdown');
                if (!dd) return;
                // Close other open menus first
                document.querySelectorAll('.menu-item.open').forEach(m => {
                    if (m !== clickedMenuItem) m.classList.remove('open');
                });
                clickedMenuItem.classList.toggle('open');
                e.stopPropagation();
                return;
            }
            // Click outside closes open menus
            document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
        }, true);

        // Escape key closes menus
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.menu-item.open').forEach(m => m.classList.remove('open'));
            }
        });
    }

    setupAutosave() {
        const toggle = document.getElementById('autosaveToggle');
        if (!toggle) return;
        toggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                this._autosaveInterval = setInterval(() => {
                    if (this.studio.exportScene) {
                        try {
                            const data = this.studio.exportScene();
                            localStorage.setItem('autosave_scene', data);
                        } catch (err) { /* ignore */ }
                    }
                }, 30000);
                this.showStatus('Autosave enabled');
            } else {
                clearInterval(this._autosaveInterval);
                this.showStatus('Autosave disabled');
            }
        });
    }

    setupRecentFiles() {
        const select = document.getElementById('recentFiles');
        if (!select) return;
        const stored = JSON.parse(localStorage.getItem('recentFiles') || '[]');
        if (stored.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No recent files';
            select.appendChild(opt);
        } else {
            select.innerHTML = '';
            stored.forEach(url => {
                const opt = document.createElement('option');
                opt.value = url;
                opt.textContent = url.split('/').pop();
                select.appendChild(opt);
            });
            select.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val && this.studio.importExport) {
                    this.showStatus('Loading recent file...', 2000);
                    this.studio.importExport.importModel(val)
                        .then(() => this.showStatus('Recent file loaded'))
                        .catch(() => this.showStatus('Failed to load recent file', 3000));
                }
            });
        }
    }

    setupEditorTools() {
        // Duplicate
        const dupBtn = document.getElementById('duplicateBtn');
        if (dupBtn) dupBtn.addEventListener('click', () => {
            const dup = this.studio.duplicateSelectedObject ? this.studio.duplicateSelectedObject() :
                (this.studio.handleMenuAction('duplicate'));
            if (dup && dup.name) this.showStatus(`Duplicated as ${dup.name}`);
        });

        // Undo / Redo
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => { this.studio.undo?.(); this.showStatus('Undid last action'); });
        if (redoBtn) redoBtn.addEventListener('click', () => { this.studio.redo?.(); this.showStatus('Redid last action'); });

        // Rename
        const renameInput = document.getElementById('renameInput');
        const renameBtn = document.getElementById('renameBtn');
        if (renameBtn && renameInput) {
            renameBtn.addEventListener('click', () => {
                const v = renameInput.value.trim();
                if (!v) { this.showStatus('Enter a name to rename', 2000); return; }
                if (this.studio.renameSelected) this.studio.renameSelected(v);
                this.showStatus(`Renamed to ${v}`);
            });
        }

        // Snap
        const snapToggle = document.getElementById('snapToggle');
        const snapSize = document.getElementById('snapSize');
        if (snapToggle && snapSize) {
            snapToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const size = parseFloat(snapSize.value) || 0.5;
                    if (this.studio.snapSelectedToGrid) this.studio.snapSelectedToGrid(size);
                    this.showStatus(`Snapped to grid (${size})`);
                } else {
                    this.showStatus('Snap disabled');
                }
            });
        }

        // Mirror
        ['x','y','z'].forEach(axis => {
            const btn = document.getElementById(`mirror-${axis}`);
            if (btn) btn.addEventListener('click', () => {
                this.studio.mirrorSelected?.(axis);
                this.showStatus(`Mirror ${axis.toUpperCase()} applied`);
            });
        });

        // Slice
        ['x','y','z'].forEach(axis => {
            const btn = document.getElementById(`slice-${axis}`);
            if (btn) btn.addEventListener('click', () => {
                this.studio.sliceSelected?.(axis);
                this.showStatus(`Toggled slice ${axis.toUpperCase()}`);
            });
        });

        // Rotate
        ['x','y','z'].forEach(axis => {
            const btn = document.getElementById(`rotate-${axis}`);
            if (btn) btn.addEventListener('click', () => {
                this.studio.rotateSelected?.(axis);
                this.showStatus(`Rotated 90° on ${axis.toUpperCase()}`);
            });
        });

        // Merge
        const mergeSel = document.getElementById('merge-selection');
        const mergeClose = document.getElementById('merge-close');
        if (mergeSel) mergeSel.addEventListener('click', () => { this.studio.mergeSelected?.(); this.showStatus('Merge applied'); });
        if (mergeClose) mergeClose.addEventListener('click', () => { this.studio.mergeCloseVertices?.(); this.showStatus('Merge close vertices applied'); });

        // Subdivide
        const subdSimple = document.getElementById('subdivide-simple');
        const subdSmooth = document.getElementById('subdivide-smooth');
        if (subdSimple) subdSimple.addEventListener('click', () => { this.studio.subdivideSelected?.('simple'); this.showStatus('Simple subdivide applied'); });
        if (subdSmooth) subdSmooth.addEventListener('click', () => { this.studio.subdivideSelected?.('smooth'); this.showStatus('Smooth subdivide applied'); });

        // UV
        const uvUnwrap = document.getElementById('uv-unwrap');
        const uvRelax = document.getElementById('uv-relax');
        if (uvUnwrap) uvUnwrap.addEventListener('click', () => { this.studio.uvUnwrapSelected?.(); this.showStatus('UV unwrap requested'); });
        if (uvRelax) uvRelax.addEventListener('click', () => { this.studio.uvRelaxSelected?.(); this.showStatus('UV relax requested'); });
    }

    setupCameraManagement() {
        // Camera menu toggle
        const menuCamera = document.getElementById('menu-camera');
        if (menuCamera) {
            menuCamera.addEventListener('click', (e) => { e.currentTarget.classList.toggle('open'); });
            document.addEventListener('click', (e) => {
                if (!menuCamera.contains(e.target)) menuCamera.classList.remove('open');
            });
        }

        // Camera projection
        const projPersp = document.getElementById('proj-persp');
        const projOrtho = document.getElementById('proj-ortho');
        if (projPersp) projPersp.addEventListener('click', () => {
            this.studio.cameraManager?.setPerspective?.();
            this.showStatus('Switched to Perspective');
        });
        if (projOrtho) projOrtho.addEventListener('click', () => {
            this.studio.cameraManager?.setOrthographic?.();
            this.showStatus('Switched to Orthographic');
        });

        // FOV
        const fovInput = document.getElementById('camera-fov');
        if (fovInput) fovInput.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value) || 75;
            this.studio.cameraManager?.setFov?.(v);
            this.showStatus(`FOV: ${v}`);
        });

        // Near/Far
        const nearInput = document.getElementById('camera-near');
        const farInput = document.getElementById('camera-far');
        if (nearInput) nearInput.addEventListener('change', () => {
            const near = parseFloat(nearInput.value) || 0.1;
            const far = parseFloat(farInput?.value) || 1000;
            this.studio.cameraManager?.setNearFar?.(near, far);
            this.showStatus(`Clipping: near ${near} far ${far}`);
        });
        if (farInput) farInput.addEventListener('change', () => {
            const near = parseFloat(nearInput?.value) || 0.1;
            const far = parseFloat(farInput.value) || 1000;
            this.studio.cameraManager?.setNearFar?.(near, far);
            this.showStatus(`Clipping: near ${near} far ${far}`);
        });

        // Preset views
        ['front','back','left','right'].forEach(view => {
            const btn = document.getElementById(`preset-${view}`);
            if (btn) btn.addEventListener('click', () => {
                this.studio.cameraManager?.applyPresetView?.(view);
                this.showStatus(`Camera preset: ${view.charAt(0).toUpperCase() + view.slice(1)}`);
            });
        });

        // Frame selection / Reset / Lock orbit
        const frameBtn = document.getElementById('camera-frame');
        const resetBtn = document.getElementById('camera-reset');
        const lockToggle = document.getElementById('camera-lock');
        if (frameBtn) frameBtn.addEventListener('click', () => {
            this.studio.cameraManager?.frameSelection?.();
            this.showStatus('Framed selection');
        });
        if (resetBtn) resetBtn.addEventListener('click', () => {
            this.studio.cameraManager?.resetCamera?.();
            this.showStatus('Camera reset');
        });
        if (lockToggle) lockToggle.addEventListener('change', (e) => {
            this.studio.cameraManager?.toggleLockOrbit?.(e.target.checked);
            this.showStatus(e.target.checked ? 'Orbit locked' : 'Orbit unlocked');
        });

        // Add Camera
        const addCamBtn = document.getElementById('addCameraBtn');
        const camNameInput = document.getElementById('cameraNameInput');
        const camTypeSelect = document.getElementById('cameraTypeSelect');
        if (camTypeSelect && camTypeSelect.length === 0) {
            try {
                const optP = document.createElement('option'); optP.value = 'perspective'; optP.textContent = 'Perspective';
                const optO = document.createElement('option'); optO.value = 'orthographic'; optO.textContent = 'Orthographic';
                camTypeSelect.appendChild(optP);
                camTypeSelect.appendChild(optO);
            } catch (e) { /* ignore */ }
        }
        if (addCamBtn) {
            addCamBtn.addEventListener('click', () => {
                const name = (camNameInput?.value.trim()) || `Camera_${Date.now()}`;
                const type = (camTypeSelect?.value) || 'perspective';
                if (!this.studio.cameraManager?.addCamera) {
                    this.showStatus('CameraManager not available', 3000);
                    return;
                }
                const newCam = this.studio.cameraManager.addCamera(
                    type === 'perspective' ? 'Perspective' : 'Orthographic',
                    this.studio.camera.position.clone()
                );
                if (newCam) {
                    newCam.name = name;
                    this.showStatus(`Added camera: ${name}`, 3000);
                    this._refreshCameraList();
                } else {
                    this.showStatus('Failed to add camera', 3000);
                }
            });
        }

        // Camera list selector
        const camList = document.getElementById('cameraList');
        if (camList) {
            camList.addEventListener('change', (e) => {
                const idx = parseInt(e.target.value, 10);
                if (!isNaN(idx) && this.studio.cameraManager?.switchCamera) {
                    this.studio.cameraManager.switchCamera(idx);
                    this.showStatus('Switched camera', 2000);
                }
            });
        }
        try { this._refreshCameraList(); } catch (e) { /* ignore */ }
    }

    /** Refresh the camera list dropdown from the camera manager */
    _refreshCameraList() {
        const list = document.getElementById('cameraList');
        if (!list || !this.studio.cameraManager) return;
        try {
            list.innerHTML = '';
            const cams = this.studio.cameraManager.cameras || [];
            cams.forEach((c, i) => {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = c.name || `Camera ${i + 1}`;
                list.appendChild(opt);
            });
            const active = this.studio.cameraManager.activeCamera;
            const idx = cams.indexOf(active);
            if (idx >= 0) list.value = String(idx);
        } catch (e) { /* ignore */ }
    }

    setupAnimationTopBar() {
        const playBtn = document.getElementById('anim-play-top');
        const pauseBtn = document.getElementById('anim-pause-top');
        const stopBtn = document.getElementById('anim-stop-top');
        const speedInput = document.getElementById('anim-speed-top');
        const loopToggle = document.getElementById('anim-loop-top');
        const animSelect = document.getElementById('anim-select-top');

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                const clip = animSelect?.value || '';
                const loop = !!(loopToggle && loopToggle.checked);
                this.studio.playAnimationByName?.(clip, loop);
                this.showStatus(`Playing ${clip || 'clip'}`);
            });
        }
        if (pauseBtn) pauseBtn.addEventListener('click', () => {
            this.studio.pauseAnimations?.();
            this.showStatus('Animations paused');
        });
        if (stopBtn) stopBtn.addEventListener('click', () => {
            this.studio.stopAnimations?.();
            this.showStatus('Animations stopped');
        });
        if (speedInput) speedInput.addEventListener('input', (e) => {
            const s = parseFloat(e.target.value) || 1;
            this.studio.setAnimationSpeed?.(s);
            this.showStatus(`Animation speed: ${s.toFixed(1)}`);
        });
        if (animSelect) {
            animSelect.addEventListener('click', (e) => e.stopPropagation());
            // Refresh clip list when animation menu opens
            const animMenuItem = document.getElementById('menu-animation');
            if (animMenuItem) {
                animMenuItem.addEventListener('click', () => {
                    if (animMenuItem.classList.contains('open') && this.studio.animationManager) {
                        this.studio.animationManager.populateSelect?.(animSelect);
                    }
                });
            }
        }
    }

    setupPaintMenuControls() {
        const paintBrush = document.getElementById('paint-brush');
        const paintEraser = document.getElementById('paint-eraser');
        const paintFill = document.getElementById('paint-fill');
        const paintSize = document.getElementById('paint-size');
        const paintOpacity = document.getElementById('paint-opacity');
        const paintColor = document.getElementById('paint-color');
        const paintToggleMode = document.getElementById('paint-toggle-mode');
        const paintClear = document.getElementById('paint-clear');

        if (paintBrush) paintBrush.addEventListener('click', () => { this.studio.setPaintMode?.('brush'); this.showStatus('Paint mode: Brush'); });
        if (paintEraser) paintEraser.addEventListener('click', () => { this.studio.setPaintMode?.('eraser'); this.showStatus('Paint mode: Eraser'); });
        if (paintFill) paintFill.addEventListener('click', () => {
            const color = paintColor?.value || '#ffffff';
            const opacity = parseFloat(paintOpacity?.value || '1');
            this.studio.fillPaint?.(color, opacity);
            this.showStatus('Fill paint applied');
        });
        if (paintSize) paintSize.addEventListener('input', (e) => {
            const size = parseInt(e.target.value, 10) || 16;
            this.studio.setBrushSize?.(size);
            this.showStatus(`Brush size: ${size}`);
        });
        if (paintOpacity) paintOpacity.addEventListener('input', (e) => {
            const op = parseFloat(e.target.value) || 1;
            this.studio.setBrushOpacity?.(op);
            this.showStatus(`Brush opacity: ${op.toFixed(2)}`);
        });
        if (paintColor) paintColor.addEventListener('input', (e) => {
            this.studio.setPaintColor?.(e.target.value);
            this.showStatus('Paint color set');
        });
        if (paintToggleMode) paintToggleMode.addEventListener('click', () => {
            const enabled = this.studio.togglePaintMode?.();
            this.showStatus(enabled ? 'Paint mode enabled' : 'Paint mode disabled');
        });
        if (paintClear) paintClear.addEventListener('click', () => {
            this.studio.clearPaintMaps?.();
            this.showStatus('Cleared paint/maps on selection');
        });
    }

    setupTextureMenuControls() {
        const bakeBtn = document.getElementById('texture-bake');
        const importBtn = document.getElementById('texture-import');
        const removeBtn = document.getElementById('texture-remove');
        const stickerBtn = document.getElementById('texture-add-sticker');
        const uvScaleBtn = document.getElementById('texture-uv-scale');
        const autoAtlasBtn = document.getElementById('texture-auto-atlas');

        if (bakeBtn) bakeBtn.addEventListener('click', () => {
            this.studio.bakeTexture?.();
            this.showStatus('Texture bake requested');
        });
        if (importBtn) importBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => {
                const f = ev.target.files && ev.target.files[0];
                if (f) {
                    const url = URL.createObjectURL(f);
                    this.studio.importTexture?.(url, f.name)
                        .then(() => this.showStatus(`Imported texture ${f.name}`))
                        .catch(() => this.showStatus('Texture import failed', 4000));
                }
            };
            input.click();
        });
        if (stickerBtn) stickerBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => {
                const f = ev.target.files && ev.target.files[0];
                if (!f) return;
                const url = URL.createObjectURL(f);
                this.studio.applySticker?.(url, f.name)
                    .then(() => this.showStatus(`Sticker added: ${f.name}`))
                    .catch(() => this.showStatus('Add sticker failed', 4000));
            };
            input.click();
        });
        if (removeBtn) removeBtn.addEventListener('click', () => {
            this.studio.removeTexture?.();
            this.showStatus('Removed texture from selection');
        });
        if (uvScaleBtn) uvScaleBtn.addEventListener('click', () => {
            const scale = prompt('Enter UV scale (e.g. 1 or 2)', '1');
            const s = parseFloat(scale) || 1;
            this.studio.setUVScale?.(s);
            this.showStatus(`Set UV scale to ${s}`);
        });
        if (autoAtlasBtn) autoAtlasBtn.addEventListener('click', () => {
            this.studio.autoAtlas?.();
            this.showStatus('Auto atlas requested');
        });
    }

    setupMaterialControls() {
        const metalnessInput = document.getElementById('mat-metalness');
        const roughnessInput = document.getElementById('mat-roughness');
        const emissiveInput = document.getElementById('mat-emissive');
        const emissiveIntInput = document.getElementById('mat-emissive-int');
        const matPreset = document.getElementById('mat-preset');
        const matApply = document.getElementById('mat-apply');

        if (metalnessInput) metalnessInput.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.studio.setMaterialProperties?.({ metalness: v });
            this.showStatus(`Metalness: ${v.toFixed(2)}`);
        });
        if (roughnessInput) roughnessInput.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            this.studio.setMaterialProperties?.({ roughness: v });
            this.showStatus(`Roughness: ${v.toFixed(2)}`);
        });
        if (emissiveInput) emissiveInput.addEventListener('input', (e) => {
            const c = e.target.value;
            const intensity = parseFloat(emissiveIntInput?.value || '0');
            this.studio.setMaterialProperties?.({ emissive: c, emissiveIntensity: intensity });
            this.showStatus('Emissive color set');
        });
        if (emissiveIntInput) emissiveIntInput.addEventListener('input', (e) => {
            const intensity = parseFloat(e.target.value);
            const color = emissiveInput?.value || '#000000';
            this.studio.setMaterialProperties?.({ emissive: color, emissiveIntensity: intensity });
            this.showStatus(`Emissive intensity: ${intensity.toFixed(1)}`);
        });
        if (matApply) matApply.addEventListener('click', () => {
            const preset = matPreset?.value;
            if (preset) {
                this.studio.applyMaterialPreset?.(preset);
                this.showStatus(`Applied preset: ${preset}`);
            } else {
                this.studio.setMaterialProperties?.({
                    metalness: parseFloat(metalnessInput?.value || '0'),
                    roughness: parseFloat(roughnessInput?.value || '0.5'),
                    emissive: emissiveInput?.value || '#000000',
                    emissiveIntensity: parseFloat(emissiveIntInput?.value || '0')
                });
                this.showStatus('Material properties applied');
            }
        });
        if (matPreset) matPreset.addEventListener('change', (e) => {
            if (e.target.value) {
                this.studio.applyMaterialPreset?.(e.target.value, true);
                this.showStatus(`Previewing preset: ${e.target.value}`);
            }
        });
    }

    setupGameMapGenerator() {
        const btn = document.getElementById('gen-game-map');
        if (!btn) return;
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!this.studio.proceduralSystem?.generateGameMap) {
                this.showStatus('Game Map generator not available', 4000);
                return;
            }
            this.showStatus('Generating Game Map...');
            try {
                await this.studio.proceduralSystem.generateGameMap();
                this.showStatus('Game Map generated', 4000);
            } catch (err) {
                console.error('Game Map generation failed', err);
                this.showStatus('Game Map generation failed: ' + (err.message || 'unknown'), 6000);
            }
        });
    }

    setupFileOperations() {
        // New Scene
        const newBtn = document.getElementById('newSceneBtn');
        if (newBtn) newBtn.addEventListener('click', () => { this.studio.newScene?.(); this.showStatus('New scene created'); });

        // Open Scene
        const openBtn = document.getElementById('openSceneBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (ev) => {
                    const f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            if (this.studio.loadSceneFromJSON) this.studio.loadSceneFromJSON(reader.result);
                            this.showStatus('Loaded scene file');
                        } catch (err) { this.showStatus('Open failed', 3000); }
                    };
                    reader.readAsText(f);
                };
                input.click();
            });
        }

        // Save As
        const saveAsBtn = document.getElementById('saveAsBtn');
        if (saveAsBtn) {
            saveAsBtn.addEventListener('click', () => {
                const name = prompt('Save scene as (filename)', 'scene.json') || 'scene.json';
                const data = this.studio.exportScene?.();
                if (data) {
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
                    URL.revokeObjectURL(url);
                    this.showStatus(`Saved as ${name}`);
                } else this.showStatus('Save As not supported', 3000);
            });
        }

        // File Manager
        const fmBtn = document.getElementById('openFileManagerBtn');
        if (fmBtn) fmBtn.addEventListener('click', () => this.openImportWindow());

        // Import Textures
        const texBtn = document.getElementById('importTexturesBtn');
        if (texBtn) {
            texBtn.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.multiple = true;
                input.onchange = (ev) => {
                    const files = Array.from(ev.target.files || []);
                    if (files.length > 0) {
                        const url = URL.createObjectURL(files[0]);
                        this.studio.importTexture?.(url, files[0].name)
                            .then(() => this.showStatus('Texture imported'))
                            .catch(() => this.showStatus('Texture import failed', 3000));
                    }
                };
                input.click();
            });
        }

        // Load URL
        const loadUrlBtn = document.getElementById('loadUrlBtn');
        const gltfUrlInput = document.getElementById('gltfUrlInput');
        if (loadUrlBtn && gltfUrlInput) {
            loadUrlBtn.addEventListener('click', () => this.handleLoadUrlModel());
        }
    }

    setupExportControls() {
        // Export model (selected object, format picker)
        const exportModelBtn = document.getElementById('exportModelBtn');
        const exportModelSelect = document.getElementById('exportModelSelect');
        if (exportModelBtn && exportModelSelect) {
            exportModelBtn.addEventListener('click', () => {
                const fmt = exportModelSelect.value || 'glb';
                if (!this.studio.selectedObject) {
                    this.showStatus('No object selected to export.', 3000);
                    return;
                }
                (this.studio.exportSelectedModel?.(fmt) || Promise.resolve())
                    .then((name) => this.showStatus(`Exported ${name || fmt}`))
                    .catch((err) => this.showStatus('Export failed: ' + (err?.message || 'unknown'), 5000));
            });
        }

        // Export all scene
        const exportAllBtn = document.getElementById('exportAllBtn');
        if (exportAllBtn && exportModelSelect) {
            exportAllBtn.addEventListener('click', () => {
                const fmt = exportModelSelect.value || 'glb';
                (this.studio.exportSceneAsFormat?.(fmt) || Promise.resolve())
                    .then((name) => this.showStatus(`Exported scene as ${name || fmt}`))
                    .catch((err) => this.showStatus('Export failed: ' + (err?.message || 'unknown'), 5000));
            });
        }
    }

    handleAddObject(type) {
        this.studio.addObject?.(type);
        this.showStatus(`Added new ${type}.`);
    }

    handleGltfImport(event) {
        const file = event.target.files[0];
        if (file) {
            this.showStatus(`Loading model: ${file.name}...`);
            const importer = this.studio.importExport || this.studio;
            const importPromise = importer?.importModel?.(file) || Promise.reject(new Error('Import not supported'));
            importPromise
                .then(() => this.showStatus(`Imported model: ${file.name}`))
                .catch((error) => this.showStatus(`Error importing model: ${error.message}`, 5000));
            event.target.value = '';
        }
    }

    handleLoadUrlModel() {
        const urlInput = document.getElementById('gltfUrlInput');
        if (!urlInput) return;
        const url = urlInput.value.trim();
        if (url) {
            this.showStatus(`Loading model from URL: ${url}...`);
            const importer = this.studio.importExport || this.studio;
            (importer?.importModel?.(url) || Promise.reject(new Error('Import not supported')))
                .then(() => this.showStatus('Loaded model from URL.'))
                .catch((error) => this.showStatus(`Error loading from URL: ${error.message}`, 5000));
            urlInput.value = '';
        } else {
            this.showStatus('Please enter a model URL.', 3000);
        }
    }

    openImportWindow() {
        const w = 520, h = 360;
        const left = (screen.width / 2) - (w / 2);
        const top = (screen.height / 2) - (h / 2);
        window.open('import-model.html', 'ImportModel', `width=${w},height=${h},left=${left},top=${top}`);
    }

    handleColorChange(event) {
        this.studio.setObjectColor?.(event.target.value);
        this.showStatus(`Changed color to ${event.target.value}.`);
    }

    handleDeleteSelected() {
        if (this.studio.selectedObject) {
            let objectName = this.studio.selectedObject.name ||
                (this.studio.selectedObject.geometry?.type && this.studio.selectedObject.geometry.type.replace('Geometry', '')) ||
                this.studio.selectedObject.type || 'object';
            this.studio.deleteSelectedObject?.();
            this.showStatus(`Deleted selected ${objectName}.`);
        }
    }

    async handleExportScene() {
        try {
            const exporter = this.studio.importExport || this.studio;
            if (exporter?.exportSceneAsFormat) {
                const name = await exporter.exportSceneAsFormat('json');
                this.showStatus(`Scene exported as ${name || 'scene.json'}`);
                return;
            }
            const sceneData = this.studio.exportScene?.();
            if (sceneData) {
                const blob = new Blob([sceneData], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'game_scene.json'; a.click();
                URL.revokeObjectURL(url);
                this.showStatus('Scene exported as game_scene.json');
            } else {
                this.showStatus('Scene export not supported', 3000);
            }
        } catch (err) {
            this.showStatus('Export failed: ' + (err?.message || 'unknown'), 5000);
        }
    }
}