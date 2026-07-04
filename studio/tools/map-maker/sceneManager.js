import * as THREE from 'three';

export class SceneManager {
    constructor(container) {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 20000);
        this.camera.position.set(0, 100, 200);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        this.setupLighting();
        
        window.addEventListener('resize', () => this.onResize());
    }

    setFogEnabled(enabled) {
        if (this.scene.fog) {
            this.scene.fog.density = enabled ? 0.0008 : 0;
        }
    }

    setupLighting() {
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.sunLight.position.set(500, 1000, 500);
        this.sunLight.castShadow = true;
        const d = 500;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.scene.add(this.sunLight);

        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0008);
    }

    updateSky(preset) {
        if (preset === 'mars') {
            this.scene.background.set(0x8d4a3e);
            if (this.scene.fog) this.scene.fog.color.set(0x8d4a3e);
        } else if (preset === 'moon') {
            this.scene.background.set(0x050505);
            if (this.scene.fog) this.scene.fog.color.set(0x050505);
        } else if (preset === 'venus') {
            this.scene.background.set(0xb08d57);
            if (this.scene.fog) {
                this.scene.fog.color.set(0xb08d57);
                this.scene.fog.density = 0.0015;
            }
        } else if (preset === 'ring_of_fire') {
            this.scene.background.set(0x221100);
            if (this.scene.fog) this.scene.fog.color.set(0x221100);
        } else if (preset === 'atoll') {
            this.scene.background.set(0x40a0ff);
            if (this.scene.fog) this.scene.fog.color.set(0x40a0ff);
        } else {
            this.scene.background.set(0x87ceeb);
            if (this.scene.fog) this.scene.fog.color.set(0x87ceeb);
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}