import * as THREE from 'three';
import { createTerrain } from '../terrain/TerrainGenerator.js';
import { getBiomeColor } from '../terrain/BiomeUtils.js';
import { SetupControls } from '../input/Controls.js';
import { Minimap } from '../ui/Minimap.js';
import { SceneManager } from './SceneManager.js';
import { EnvironmentManager } from '../environment/EnvironmentManager.js';
import { UIManager } from '../ui/UIManager.js';
import { InputManager } from '../input/InputManager.js';
import { LandscapingManager } from '../editing/LandscapingManager.js';
import { DecorationManager } from '../editing/DecorationManager.js';

export class LevelFabricatorApp {
    constructor(containerId) {
        this.containerId = containerId;
        this._animId = null;
        this._running = true;

        this.sceneManager = new SceneManager(document.getElementById(containerId));
        this.environmentManager = new EnvironmentManager(this.sceneManager.scene);
        this.input = new InputManager(this.sceneManager.renderer.domElement);
        this.decorations = new DecorationManager(this);
        
        this.terrainParams = {
            size: 256,
            resolution: 256,
            scale: 40,
            quality: 'medium',
            height: 25,
            seed: Math.random(),
            octaves: 4,
            persistence: 0.5,
            preset: 'default',
            customHeightmap: null,
            showWater: true,
            customBiomes: [],
            treeDensity: 1.0,
            cityDensity: 0.0,
            lastRawHeightmapImage: null
        };

        this.terrain = null;
        this.minimap = new Minimap('sg-minimap-canvas', 512);
        
        this.generate();
        
        this.landscaping = new LandscapingManager(this);
        this.controls = new SetupControls(this.sceneManager.camera, this.sceneManager.renderer.domElement, this.terrain, this);
        this.uiManager = new UIManager(this);

        this.sceneManager.camera.position.set(0, 100, 0);
        
        this.animate();
    }

    refreshTerrain(brushPoint = null, brushSize = 0) {
        if (!this.terrain || !this.terrain.mesh) return;
        const res = this.terrainParams.resolution;
        const height = this.terrainParams.height;
        const positions = this.terrain.mesh.geometry.attributes.position.array;
        const colors = this.terrain.mesh.geometry.attributes.color.array;
        
        const moistureFreq = 3.0 * (100 / this.terrainParams.scale); 
        const moistureNoise = this.terrain.moistureNoise;

        for (let j = 0; j < res; j++) {
            const rowOffset = j * res;
            const ny = j / (res - 1);
            for (let i = 0; i < res; i++) {
                const idx = rowOffset + i;
                const h = this.terrain.heightData[idx];
                positions[idx * 3 + 1] = h * height;

                const nx = i / (res - 1);
                const moisture = (moistureNoise(nx * moistureFreq + 500, ny * moistureFreq + 500) + 1) / 2;
                const color = getBiomeColor(h, moisture, this.terrainParams.preset, this.terrainParams.customBiomes);
                
                const cIdx = idx * 3;
                colors[cIdx] = color.r;
                colors[cIdx + 1] = color.g;
                colors[cIdx + 2] = color.b;
            }
        }
        
        this.terrain.mesh.geometry.attributes.position.needsUpdate = true;
        this.terrain.mesh.geometry.attributes.color.needsUpdate = true;
        this.terrain.mesh.geometry.computeVertexNormals();

        const now = Date.now();
        if (!this.lastDecorationUpdate || now - this.lastDecorationUpdate > 60) {
            this.decorations.updateY(brushPoint, brushSize * 1.5);
            this.updateMinimap();
            this.lastDecorationUpdate = now;
        }
    }

    updateFPS() {
        if (!this.fpsData) {
            this.fpsData = { lastTime: performance.now(), frames: 0 };
        }
        const now = performance.now();
        this.fpsData.frames++;
        if (now - this.fpsData.lastTime >= 1000) {
            const fps = Math.round((this.fpsData.frames * 1000) / (now - this.fpsData.lastTime));
            const el = document.getElementById('sg-fps-counter');
            if (el) el.textContent = `FPS: ${fps}`;
            this.fpsData.frames = 0;
            this.fpsData.lastTime = now;
        }
    }

    updateMinimap() {
        this.minimap.render(
            this.terrain.heightData,
            this.terrainParams.resolution,
            this.terrainParams.size,
            this.terrainParams.preset, 
            this.terrainParams.seed, 
            this.terrainParams.scale,
            this.environmentManager.cloudCanvas,
            this.environmentManager.clouds ? this.environmentManager.clouds.visible : true,
            this.terrainParams.customBiomes,
            this.decorations.manualTrees,
            this.terrainParams.customHeightmap,
            this.decorations.treeInstances
        );
    }

    generate(keepEdits = false) {
        let oldHeightData = null;
        if (keepEdits && this.terrain && this.terrain.heightData) {
            oldHeightData = new Float32Array(this.terrain.heightData);
        }

        if (this.terrain && this.terrain.mesh) {
            this.sceneManager.scene.remove(this.terrain.mesh);
            this.terrain.mesh.geometry.dispose();
            this.terrain.mesh.material.dispose();
        }
        
        this.decorations.clear(keepEdits);

        this.sceneManager.updateSky(this.terrainParams.preset);
        this.environmentManager.update(this.terrainParams);

        const terrainResult = createTerrain(this.terrainParams);
        this.terrain = terrainResult;
        
        this.decorations.addInstances(terrainResult.treeInstances);

        if (oldHeightData && oldHeightData.length === this.terrain.heightData.length) {
            this.terrain.heightData.set(oldHeightData);
            this.refreshTerrain();
        }
        
        this.sceneManager.scene.add(this.terrain.mesh);
        this.updateMinimap();
        
        if (this.controls) {
            this.controls.terrain = this.terrain;
            this.controls.worldSize = this.terrainParams.size;
        }

        this.playSound('/assets/audio/sg-terrain-gen.mp3');
    }

    playSound(file) {
        const audio = new Audio(file);
        audio.volume = 0.15;
        audio.play().catch(() => {});
    }

    animate() {
        if (!this._running) return;
        this._animId = requestAnimationFrame(() => this.animate());
        this.updateFPS();
        
        const time = Date.now() * 0.001;
        this.environmentManager.animate(time, this.sceneManager.camera, this.terrainParams.height);

        if (this.controls) this.controls.update(0.016);
        
        const pX = (this.sceneManager.camera.position.x / this.terrainParams.size) + 0.5;
        const pZ = (this.sceneManager.camera.position.z / this.terrainParams.size) + 0.5;
        this.minimap.updatePlayer(pX, pZ, this.sceneManager.camera.rotation.y);

        this.sceneManager.render();
    }

    destroy() {
        this._running = false;
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
        if (this.controls) this.controls.dispose();
        if (this.environmentManager) this.environmentManager.dispose();
        if (this.decorations) this.decorations.clear(false);
        if (this.terrain && this.terrain.mesh) {
            this.sceneManager.scene.remove(this.terrain.mesh);
            this.terrain.mesh.geometry.dispose();
            this.terrain.mesh.material.dispose();
        }
        if (this.sceneManager) this.sceneManager.dispose();
        const container = document.getElementById(this.containerId);
        if (container) container.innerHTML = '';
    }
}
