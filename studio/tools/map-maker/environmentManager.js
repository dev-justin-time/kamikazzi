import * as THREE from 'three';
import { createPerlin2D } from './noiseUtils.js';

export class EnvironmentManager {
    constructor(scene) {
        this.scene = scene;
        this.water = null;
        this.clouds = null;
        this.cloudCanvas = null;
        this.stars = null;
        this.initWater();
    }

    initWater() {
        const waterGeo = new THREE.PlaneGeometry(16384, 16384, 128, 128);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x004d71,
            transparent: true,
            opacity: 0.8,
            roughness: 0.05,
            metalness: 0.3
        });
        this.water = new THREE.Mesh(waterGeo, waterMat);
        this.water.rotation.x = -Math.PI / 2;
        this.scene.add(this.water);
    }

    update(params) {
        const { preset, size, height, seed, showWater } = params;

        // Water visibility and color
        if (preset === 'mars' || preset === 'moon' || preset === 'landlocked' || !showWater) {
            this.water.visible = false;
        } else {
            this.water.visible = true;
            this.water.position.y = height * 0.3;
            if (preset === 'ring_of_fire') {
                this.water.material.color.set(0xff4500); // Match volcano lava orange
                this.water.material.opacity = 1.0;
                this.water.material.emissive = new THREE.Color(0x330000);
            } else if (preset === 'lava_doughnut') {
                this.water.material.emissive = new THREE.Color(0x000000);
                this.water.material.color.set(0x004d71);
                this.water.material.opacity = 0.8;
            } else if (preset === 'venus') {
                this.water.material.color.set(0x8a7f0e); // Corrosive yellow-green
                this.water.material.opacity = 0.95;
                this.water.material.emissive = new THREE.Color(0x1a1a00);
            } else {
                this.water.material.emissive = new THREE.Color(0x000000);
                this.water.material.color.set(0x004d71);
                this.water.material.opacity = 0.8;
            }
        }

        // Clouds visibility and creation
        if (preset !== 'mars' && preset !== 'moon') {
            this.createClouds(size, height, seed, preset === 'venus');
            this.clouds.visible = true;
        } else if (this.clouds) {
            this.clouds.visible = false;
        }

        // Stars for Moon preset
        if (this.stars) this.scene.remove(this.stars);
        if (preset === 'moon') {
            const starGeo = new THREE.BufferGeometry();
            const starPos = [];
            for (let i = 0; i < 3000; i++) {
                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const r = 8000;
                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);
                starPos.push(x, y, z);
            }
            starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
            const starMat = new THREE.PointsMaterial({ 
                color: 0xffffff, size: 2, transparent: true, opacity: 0.9, sizeAttenuation: false, fog: false 
            });
            this.stars = new THREE.Points(starGeo, starMat);
            this.scene.add(this.stars);
        }
    }

    createClouds(size, height, seed, isVenus = false) {
        if (this.clouds) {
            this.scene.remove(this.clouds);
            this.clouds.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    if (child.material.alphaMap) child.material.alphaMap.dispose();
                    child.material.dispose();
                }
            });
        }

        const cloudRes = 512; 
        const canvas = document.createElement('canvas');
        canvas.width = cloudRes;
        canvas.height = cloudRes;
        const ctx = canvas.getContext('2d');
        this.cloudCanvas = canvas;
        
        const cloudNoise = createPerlin2D(seed + 999);
        const imgData = ctx.createImageData(cloudRes, cloudRes);
        for (let y = 0; y < cloudRes; y++) {
            for (let x = 0; x < cloudRes; x++) {
                const nx = x / cloudRes;
                const ny = y / cloudRes;
                
                let v = 0, amp = 1.0, freq = 2.5; 
                for (let k = 0; k < 6; k++) {
                    v += amp * cloudNoise(nx * freq + 10, ny * freq + 10);
                    amp *= 0.5; freq *= 2.0;
                }
                
                v = (v + 0.5); 
                v = Math.pow(Math.max(0, v), 2.5) * 0.7; 
                v = Math.max(0, Math.min(1, (v - 0.2) * 1.5));

                const idx = (y * cloudRes + x) * 4;
                if (isVenus) {
                    imgData.data[idx] = 220;
                    imgData.data[idx + 1] = 180;
                    imgData.data[idx + 2] = 50;
                } else {
                    imgData.data[idx] = 255;
                    imgData.data[idx + 1] = 255;
                    imgData.data[idx + 2] = 255;
                }
                imgData.data[idx + 3] = Math.floor(v * 255);
            }
        }
        ctx.putImageData(imgData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        
        // Create cloud structure as a group to add "depth" and avoid flat "Minecraft" look
        this.clouds = new THREE.Group();
        const cloudGeo = new THREE.PlaneGeometry(size * 10, size * 10); 
        
        const createCloudLayer = (yOffset, opacity, speedMult, emissiveInt) => {
            const layerTex = texture.clone();
            layerTex.needsUpdate = true;
            const mat = new THREE.MeshStandardMaterial({
                map: layerTex,
                alphaMap: layerTex,
                transparent: true,
                opacity: opacity,
                depthWrite: false,
                side: THREE.DoubleSide,
                fog: false,
                emissive: 0xffffff,
                emissiveIntensity: emissiveInt,
                roughness: 1,
                metalness: 0
            });
            const mesh = new THREE.Mesh(cloudGeo, mat);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.y = yOffset;
            mesh.userData.speedMult = speedMult;
            return mesh;
        };

        const baseHeight = height + (size * 0.2) + 100;
        const layer1 = createCloudLayer(baseHeight, 0.9, 1.0, 1.0);
        const layer2 = createCloudLayer(baseHeight + 40, 0.7, 0.6, 0.7);
        const layer3 = createCloudLayer(baseHeight + 100, 0.5, 0.4, 0.4);
        
        this.clouds.add(layer1);
        this.clouds.add(layer2);
        this.clouds.add(layer3);
        this.scene.add(this.clouds);
    }

    animate(time, camera, terrainHeight) {
        if (this.clouds && this.clouds.visible) {
            this.clouds.children.forEach(layer => {
                const mult = layer.userData.speedMult || 1.0;
                const offsetX = time * 0.008 * mult;
                const offsetY = time * 0.004 * mult;
                layer.material.map.offset.set(offsetX, offsetY);
                if (layer.material.alphaMap) {
                    layer.material.alphaMap.offset.set(offsetX, offsetY);
                }
            });
        }

        if (this.water && this.water.visible) {
            this.water.position.x = camera.position.x;
            this.water.position.z = camera.position.z;
            // Optimized wave: Just drift the texture instead of updating thousands of vertices
            if (this.water.material.map) {
                this.water.material.map.offset.x = time * 0.02;
                this.water.material.map.offset.y = time * 0.01;
            }
        }
    }
}