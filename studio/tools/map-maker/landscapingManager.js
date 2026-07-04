import * as THREE from 'three';

export class LandscapingManager {
    constructor(app) {
        this.app = app;
        this.raycaster = new THREE.Raycaster();
        this.isEditing = false;
        this.levelTargetHeight = 0;
        this.setupListeners();
    }

    setupListeners() {
        const el = this.app.sceneManager.renderer.domElement;

        const startEdit = (e) => {
            if (!this.app.uiManager.isEditTabActive()) return;
            const tool = document.getElementById('edit-tool')?.value;
            if (tool === 'none' || !tool) return;
            this.isEditing = true;
            this.handleInteraction(e);
        };

        const onEdit = (e) => {
            if (this.isEditing) this.handleInteraction(e);
        };

        const endEdit = () => {
            this.isEditing = false;
        };

        el.addEventListener('mousedown', startEdit);
        window.addEventListener('mousemove', (e) => {
            if (this.isEditing) {
                requestAnimationFrame(() => this.handleInteraction(e));
            }
        });
        window.addEventListener('mouseup', endEdit);

        el.addEventListener('touchstart', startEdit, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (this.isEditing) {
                requestAnimationFrame(() => this.handleInteraction(e));
                e.preventDefault();
            }
        }, { passive: false });
        window.addEventListener('touchend', endEdit);
    }

    handleInteraction(e) {
        if (!this.app.uiManager.isEditTabActive()) return;
        const tool = document.getElementById('edit-tool')?.value;
        if (!tool || tool === 'none') return;

        const mouse = new THREE.Vector2();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(mouse, this.app.sceneManager.camera);
        const intersects = this.raycaster.intersectObject(this.app.terrain.mesh);

        if (intersects.length > 0) {
            const point = intersects[0].point;
            if (tool === 'level' && !this.isEditingPreviously) {
                const u = (point.x / this.app.terrainParams.size) + 0.5;
                const v = (point.z / this.app.terrainParams.size) + 0.5;
                const i = Math.floor(u * (this.app.terrainParams.resolution - 1));
                const j = Math.floor(v * (this.app.terrainParams.resolution - 1));
                this.levelTargetHeight = this.app.terrain.heightData[j * this.app.terrainParams.resolution + i];
            }
            this.applyTool(point, tool, this.levelTargetHeight);
        }
    }

    applyTool(point, tool, targetHeight) {
        const size = this.app.terrainParams.size;
        const res = this.app.terrainParams.resolution;
        const bSize = parseFloat(document.getElementById('brush-size-slider').value);
        const bStrength = parseFloat(document.getElementById('brush-strength-slider').value);

        // Removal tools optimization
        if (tool === 'axe' || tool === 'demolish') {
            const distThreshold = bSize * 0.8;
            for (let i = this.app.decorations.manualTrees.length - 1; i >= 0; i--) {
                const item = this.app.decorations.manualTrees[i];
                if (tool === 'axe' && item.userData.type !== 'tree') continue;
                if (tool === 'demolish' && item.userData.type !== 'building') continue;
                
                const dx = item.position.x - point.x;
                const dz = item.position.z - point.z;
                const d2 = Math.sqrt(dx * dx + dz * dz);
                if (d2 < distThreshold) {
                    this.app.decorations.removeManual(item);
                }
            }
            return;
        }

        const stampHeight = parseFloat(document.getElementById('stamp-height-slider')?.value || 0.8);
        const vDetail = parseInt(document.getElementById('v-detail-slider')?.value || 2);
        const treeType = document.getElementById('tree-type-select')?.value || 'pine';
        const cityType = document.getElementById('city-type-select')?.value || 'rural';

        const u_center = (point.x / size) + 0.5;
        const v_center = (point.z / size) + 0.5;
        const i_center = u_center * (res - 1);
        const j_center = v_center * (res - 1);
        const pixelRadius = (bSize / size) * res;

        // Optimization: iterate only over the bounding box of the brush
        const startI = Math.max(0, Math.floor(i_center - pixelRadius));
        const endI = Math.min(res - 1, Math.ceil(i_center + pixelRadius));
        const startJ = Math.max(0, Math.floor(j_center - pixelRadius));
        const endJ = Math.min(res - 1, Math.ceil(j_center + pixelRadius));

        const brushStep = res > 1024 ? 2 : 1; // Performance boost for ultra-high res brushes

        for (let j = startJ; j <= endJ; j += brushStep) {
            for (let i = startI; i <= endI; i += brushStep) {
                const dx = i - i_center;
                const dy = j - j_center;
                const distSq = dx * dx + dy * dy;
                if (distSq < pixelRadius * pixelRadius) {
                    const dist = Math.sqrt(distSq);
                    const falloff = Math.pow(1.0 - (dist / pixelRadius), 2);
                    const idx = j * res + i;
                    
                    if (tool === 'raise') {
                        this.app.terrain.heightData[idx] += 0.005 * bStrength * falloff;
                    } else if (tool === 'lower') {
                        this.app.terrain.heightData[idx] -= 0.005 * bStrength * falloff;
                    } else if (tool === 'level') {
                        this.app.terrain.heightData[idx] += (targetHeight - this.app.terrain.heightData[idx]) * 0.1 * bStrength * falloff;
                    } else if (tool === 'volcano') {
                        const vNoiseAmt = parseFloat(document.getElementById('v-noise-slider')?.value || 0);
                        let noiseVal = 0;
                        if (vNoiseAmt > 0) {
                            for (let k = 0; k < vDetail; k++) {
                                noiseVal += (Math.random() - 0.5) * vNoiseAmt * (1.0 / (k + 1));
                            }
                        }
                        const cone = Math.pow(Math.max(0, 1.0 - (dist / pixelRadius)), 1.2);
                        const crater = Math.pow(Math.max(0, 1.0 - (dist / (pixelRadius * 0.25))), 0.8);
                        let v_h = Math.max(0, (cone - crater * 0.9)) * stampHeight;
                        if (v_h > 0) v_h += noiseVal * 0.1;
                        this.app.terrain.heightData[idx] = Math.max(this.app.terrain.heightData[idx], v_h);
                    } else if (tool === 'biome') {
                        const bRange = parseFloat(document.getElementById('biome-range-slider').value);
                        this.app.terrain.heightData[idx] += (bRange - this.app.terrain.heightData[idx]) * 0.1 * bStrength * falloff;
                    } else if (tool === 'tree') {
                        if (Math.random() < 0.03 * bStrength) {
                            this.addTreeAt(i / (res-1), j / (res-1), treeType);
                        }
                    } else if (tool === 'city') {
                        if (Math.random() < 0.05 * bStrength) {
                            this.addBuildingAt(i / (res-1), j / (res-1), cityType);
                        }
                    }
                    this.app.terrain.heightData[idx] = Math.max(0, Math.min(1.5, this.app.terrain.heightData[idx]));
                }
            }
        }
        // Optimization: Pass the brush point and size to only update decorations in that area
        this.app.refreshTerrain(point, bSize);
    }

    addTreeAt(nx, ny, type) {
        const p = this.app.terrainParams.preset;
        if (p === 'moon' || p === 'mars' || p === 'venus') return;

        const size = this.app.terrainParams.size;
        const res = this.app.terrainParams.resolution;
        const h_val = this.app.terrain.heightData[Math.floor(ny * (res-1)) * res + Math.floor(nx * (res-1))];
        
        const isWaterPreset = !['mars', 'moon', 'landlocked'].includes(p);
        const waterLevel = (this.app.terrainParams.showWater && isWaterPreset) ? 0.33 : 0.02;

        if (h_val <= waterLevel) return;

        const wx = (nx - 0.5) * size;
        const wz = (ny - 0.5) * size;
        const y = h_val * this.app.terrainParams.height;
        
        const { pineGeo, oakGeo, palmGeo, cactusGeo } = this.app.terrain.treeGeoms || {};
        if (!pineGeo) return; // Fail safe

        let geo;
        let mat;
        if (type === 'cactus') { geo = cactusGeo; mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }); }
        else if (type === 'oak') { geo = oakGeo; mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0 }); }
        else if (type === 'palm') { geo = palmGeo; mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0 }); }
        else { geo = pineGeo; mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0 }); }

        const mesh = new THREE.Mesh(geo, mat);
        const s = (0.7 + Math.random() * 0.6) * 0.1;
        mesh.scale.set(s, s, s);
        mesh.position.set(wx, y, wz);
        mesh.rotation.y = Math.random() * Math.PI;
        mesh.userData.type = 'tree';
        this.app.decorations.addManual(mesh);
    }

    addBuildingAt(nx, ny, type) {
        const size = this.app.terrainParams.size;
        const res = this.app.terrainParams.resolution;
        const h_val = this.app.terrain.heightData[Math.floor(ny * (res-1)) * res + Math.floor(nx * (res-1))];
        
        const preset = this.app.terrainParams.preset;
        const isWaterPreset = !['mars', 'moon', 'landlocked'].includes(preset);
        const waterLevel = (this.app.terrainParams.showWater && isWaterPreset) ? 0.33 : 0.02;

        if (h_val <= waterLevel) return;

        const wx = (nx - 0.5) * size;
        const wz = (ny - 0.5) * size;
        const y = h_val * this.app.terrainParams.height;
        const isSpace = (preset === 'moon' || preset === 'mars' || preset === 'venus');

        const { ruralGeo, subGeo, urbGeo, spaceGeo } = this.app.terrain.geometries || { 
            ruralGeo: new THREE.BoxGeometry(1,1,1),
            subGeo: new THREE.BoxGeometry(1.2,1,1.2),
            urbGeo: new THREE.BoxGeometry(1.5,8,1.5),
            spaceGeo: new THREE.SphereGeometry(1.5,8,8)
        };
        
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
        const sMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.2 });

        const mesh = new THREE.Group();

        if (isSpace) {
            mesh.add(new THREE.Mesh(spaceGeo, sMat));
        } else if (type === 'rural') {
            mesh.add(new THREE.Mesh(ruralGeo, mat));
        } else if (type === 'suburban') {
            mesh.add(new THREE.Mesh(subGeo, mat));
        } else if (type === 'urban') {
            mesh.add(new THREE.Mesh(urbGeo, mat));
        }

        mesh.position.set(wx, y, wz);
        mesh.rotation.y = Math.floor(Math.random() * 4) * (Math.PI / 2);
        mesh.userData.type = 'building';
        
        // Ensure manual buildings are scaled consistently
        if (type === 'urban' && !isSpace) {
            mesh.scale.set(1, 1, 1); 
        } else if (!isSpace) {
            mesh.scale.set(1.5, 1.5, 1.5); // Boost smaller manual buildings visibility
        }

        this.app.decorations.addManual(mesh);
    }
}