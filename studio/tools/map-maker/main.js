import * as THREE from 'three';
import { createTerrain } from './terrain.js';
import { getBiomeColor } from './biomeUtils.js';
import { SetupControls } from './controls.js';
import { Minimap } from './minimap.js';
import { SceneManager } from './sceneManager.js';
import { EnvironmentManager } from './environmentManager.js';
import { UIManager } from './uiManager.js';
import { InputManager } from './inputManager.js';
import { LandscapingManager } from './landscapingManager.js';
import { DecorationManager } from './decorationManager.js';

class App {
    constructor() {
        this.sceneManager = new SceneManager(document.getElementById('container'));
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
            cityDensity: 0.0
        };

        this.terrain = null;
        this.minimap = new Minimap('minimap-canvas', 512);
        
        this.generate();
        
        this.landscaping = new LandscapingManager(this);
        this.controls = new SetupControls(this.sceneManager.camera, this.sceneManager.renderer.domElement, this.terrain, this);
        this.uiManager = new UIManager(this);

        // Center player on spawn
        this.sceneManager.camera.position.set(0, 100, 0);
        
        this.animate();
    }

    // removed setupLighting() {}
    // removed createWater() {}
    // removed createClouds() {}
    // removed setupUI() {}
    // removed onResize() {}

    refreshTerrain(brushPoint = null, brushSize = 0) {
        if (!this.terrain || !this.terrain.mesh) return;
        const res = this.terrainParams.resolution;
        const height = this.terrainParams.height;
        const positions = this.terrain.mesh.geometry.attributes.position.array;
        const colors = this.terrain.mesh.geometry.attributes.color.array;
        
        const moistureFreq = 3.0 * (100 / this.terrainParams.scale); 
        const moistureNoise = this.terrain.moistureNoise;

        // Optimization: Use TypedArray.set or avoid redundant calculations if possible
        // For editing, we update the whole buffer, but let's make it as lean as possible.
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

        // Optimization: Throttled update for instances and minimap during editing.
        const now = Date.now();
        if (!this.lastDecorationUpdate || now - this.lastDecorationUpdate > 60) {
            this.decorations.updateY(brushPoint, brushSize * 1.5);
            this.updateMinimap();
            this.lastDecorationUpdate = now;
        }
    }
    // removed updateDecorationsY() {}

    updateFPS() {
        if (!this.fpsData) {
            this.fpsData = { lastTime: performance.now(), frames: 0 };
        }
        const now = performance.now();
        this.fpsData.frames++;
        if (now - this.fpsData.lastTime >= 1000) {
            const fps = Math.round((this.fpsData.frames * 1000) / (now - this.fpsData.lastTime));
            const el = document.getElementById('fps-counter');
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

        this.playSound('/terrain_gen.mp3');
    }

    playSound(file) {
        const audio = new Audio(file);
        audio.volume = 0.15;
        audio.play().catch(() => {});
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.updateFPS();
        
        const time = Date.now() * 0.001;
        this.environmentManager.animate(time, this.sceneManager.camera, this.terrainParams.height);

        if (this.controls) this.controls.update(0.016);
        
        const pX = (this.sceneManager.camera.position.x / this.terrainParams.size) + 0.5;
        const pZ = (this.sceneManager.camera.position.z / this.terrainParams.size) + 0.5;
        this.minimap.updatePlayer(pX, pZ, this.sceneManager.camera.rotation.y);

        this.sceneManager.render();
    }
}

new App();