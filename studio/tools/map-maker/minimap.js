import * as THREE from 'three';
import { getBiomeColor } from './biomeUtils.js';
import { createPerlin2D } from './noiseUtils.js';

export class Minimap {
    constructor(canvasId, resolution) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resolution = resolution;
        this.canvas.width = resolution;
        this.canvas.height = resolution;
        this.marker = document.getElementById('player-marker');
        this.mode = 'terrain'; // terrain, noise, clouds
        
        // Zoom and Pan state
        this.zoom = 1.0;
        this.offset = { x: 0.5, y: 0.5 }; // Center of view in normalized coords (0-1)
        this.isPanning = false;
        this.lastPan = { x: 0, y: 0 };

        // Persistent offscreen canvas for optimization
        this.offscreen = document.createElement('canvas');
        this.offscreenCtx = this.offscreen.getContext('2d', { alpha: false });

        this.initInteractions();
    }

    initInteractions() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom = Math.max(1, Math.min(10, this.zoom * delta));
        }, { passive: false });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.isPanning = true;
                this.lastPan = { x: e.clientX, y: e.clientY };
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            const dx = e.clientX - this.lastPan.x;
            const dy = e.clientY - this.lastPan.y;
            this.lastPan = { x: e.clientX, y: e.clientY };

            // Adjust offset based on drag distance and current zoom
            // Canvas size doesn't change here, but the 'view' does
            const moveScale = 1 / (this.zoom * this.canvas.width);
            this.offset.x -= dx * moveScale;
            this.offset.y -= dy * moveScale;

            // Clamp offset so we don't pan too far outside
            const halfRange = 0.5 / this.zoom;
            this.offset.x = Math.max(halfRange, Math.min(1 - halfRange, this.offset.x));
            this.offset.y = Math.max(halfRange, Math.min(1 - halfRange, this.offset.y));
        });

        window.addEventListener('mouseup', () => {
            this.isPanning = false;
        });

        // Touch support for panning
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isPanning = true;
                this.lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.isPanning || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - this.lastPan.x;
            const dy = e.touches[0].clientY - this.lastPan.y;
            this.lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            
            const moveScale = 1 / (this.zoom * this.canvas.width);
            this.offset.x -= dx * moveScale;
            this.offset.y -= dy * moveScale;

            const halfRange = 0.5 / this.zoom;
            this.offset.x = Math.max(halfRange, Math.min(1 - halfRange, this.offset.x));
            this.offset.y = Math.max(halfRange, Math.min(1 - halfRange, this.offset.y));
            e.preventDefault();
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            this.isPanning = false;
        });
    }

    render(heightData, dataRes, worldSize, preset, seed, scale, cloudCanvas, cloudsVisible = true, customBiomes = [], manualTrees = [], customHeightmap = null, treeInstances = []) {
        this.lastData = { heightData, dataRes, worldSize, preset, seed, scale, cloudCanvas, cloudsVisible, customBiomes, manualTrees, customHeightmap, treeInstances };
        
        const getSeed = (s) => {
            if (typeof s === 'string') return s.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
            return Math.floor(s * 1000000);
        };
        const baseSeed = getSeed(seed);
        const moistureFreq = 3.0 * (100 / scale); 
        const moistureNoise = createPerlin2D(baseSeed + 1000);
        
        if (this.offscreen.width !== dataRes) {
            this.offscreen.width = dataRes;
            this.offscreen.height = dataRes;
        }
        
        const imageData = this.offscreenCtx.createImageData(dataRes, dataRes);
        const data = imageData.data;

        for (let j = 0; j < dataRes; j++) {
            for (let i = 0; i < dataRes; i++) {
                const nx = i / (dataRes - 1);
                const ny = j / (dataRes - 1);
                const h = heightData[j * dataRes + i];
                const moisture = (moistureNoise(nx * moistureFreq + 500, ny * moistureFreq + 500) + 1) / 2;
                let color = this.mode === 'noise' ? { r: h, g: h, b: h } : getBiomeColor(h, moisture, preset, customBiomes);
                const idx = (j * dataRes + i) * 4;
                data[idx] = color.r * 255;
                data[idx + 1] = color.g * 255;
                data[idx + 2] = color.b * 255;
                data[idx + 3] = 255;
            }
        }
        this.offscreenCtx.putImageData(imageData, 0, 0);
        this.draw();
    }

    draw() {
        if (!this.lastData) return;
        const { worldSize, preset, cloudCanvas, cloudsVisible, manualTrees, customHeightmap, treeInstances } = this.lastData;
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        this.ctx.clearRect(0, 0, canvasW, canvasH);
        
        const viewSize = 1 / this.zoom;
        const sx = (this.offset.x - viewSize / 2) * this.offscreen.width;
        const sy = (this.offset.y - viewSize / 2) * this.offscreen.height;
        const sw = viewSize * this.offscreen.width;
        const sh = viewSize * this.offscreen.height;

        if (this.mode === 'clouds' && preset === 'custom' && customHeightmap) {
            if (!this.customCanvas) {
                this.customCanvas = document.createElement('canvas');
                this.customCanvas.width = customHeightmap.width;
                this.customCanvas.height = customHeightmap.height;
                const imgCtx = this.customCanvas.getContext('2d');
                const imgData = imgCtx.createImageData(customHeightmap.width, customHeightmap.height);
                imgData.data.set(customHeightmap.pixels);
                imgCtx.putImageData(imgData, 0, 0);
            }
            this.ctx.drawImage(this.customCanvas, sx * (this.customCanvas.width/this.offscreen.width), sy * (this.customCanvas.height/this.offscreen.height), sw * (this.customCanvas.width/this.offscreen.width), sh * (this.customCanvas.height/this.offscreen.height), 0, 0, canvasW, canvasH);
        } else {
            this.ctx.drawImage(this.offscreen, sx, sy, sw, sh, 0, 0, canvasW, canvasH);
            if (this.mode === 'clouds' && cloudCanvas && cloudsVisible) {
                this.ctx.globalAlpha = 0.6;
                this.ctx.drawImage(cloudCanvas, sx * (cloudCanvas.width/this.offscreen.width), sy * (cloudCanvas.height/this.offscreen.height), sw * (cloudCanvas.width/this.offscreen.width), sh * (cloudCanvas.height/this.offscreen.height), 0, 0, canvasW, canvasH);
                this.ctx.globalAlpha = 1.0;
            }
        }

        const hideCities = (this.mode === 'clouds' && preset === 'custom');
        if (!hideCities) {
            this.ctx.fillStyle = '#ffffff';
            const drawPixel = (wx, wz) => {
                const u = (wx / worldSize) + 0.5;
                const v = (wz / worldSize) + 0.5;
                const relX = (u - (this.offset.x - viewSize / 2)) / viewSize;
                const relY = (v - (this.offset.y - viewSize / 2)) / viewSize;
                if (relX >= 0 && relX <= 1 && relY >= 0 && relY <= 1) {
                    this.ctx.fillRect(relX * canvasW - 1, relY * canvasH - 1, 2, 2);
                }
            };

            if (treeInstances) {
                const dummy = new THREE.Object3D();
                treeInstances.forEach(inst => {
                    if (!inst.userData.isCity) return;
                    for (let i = 0; i < inst.count; i++) {
                        inst.getMatrixAt(i, dummy.matrix);
                        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                        drawPixel(dummy.position.x, dummy.position.z);
                    }
                });
            }
            if (manualTrees) {
                manualTrees.forEach(obj => {
                    if (obj.userData.type === 'building') drawPixel(obj.position.x, obj.position.z);
                });
            }
        }
    }

    updatePlayer(u, v, rotationY) {
        const viewSize = 1 / this.zoom;
        const relX = (u - (this.offset.x - viewSize / 2)) / viewSize;
        const relY = (v - (this.offset.y - viewSize / 2)) / viewSize;

        if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
            this.marker.style.display = 'none';
        } else {
            this.marker.style.display = 'block';
            this.marker.style.left = `${relX * 100}%`;
            this.marker.style.top = `${relY * 100}%`;
        }
        this.marker.style.transform = `translate(-50%, -50%) rotate(${-rotationY}rad)`;
        
        // Continuous redraw during animation to ensure pan/zoom smooth feel
        this.draw();
    }
}