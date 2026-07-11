import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import nipplejs from 'nipplejs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Extracted modules ---
import { initAudio, playSound, spawnCoinExplosion, playFootstep } from "./js/audio.js";
import { getBallMaterial } from "./js/ball-skins.js";
import {
  clearLevel, placeFinishModel, createLevel,
  addPlatform, addTunnelWalls, addRamp, addPendulum, addSpinner,
  addHammer, addMover, addWall, addCoins, addCheckpoint
} from "./js/level-gen.js";
import {
  renderBuilder, clearBuilderPreview, previewBuilder,
  loadCustomLevel, enterBuilderScene, exitBuilderScene
} from "./js/track-builder.js";
import { setupUI, renderGrids, handlePurchase, updateWalletUI } from "./js/ui.js";
import { initWolfModel, updateWolfAnimation, resetWolfModel, setWolfRunning } from "./js/wolf-model.js";
import { initStudio, isStudioActive } from "./js/studio.js";


// Global safety: catch unhandled promise rejections to avoid noisy "network error" crashes.
window.addEventListener('unhandledrejection', (evt) => {
  console.warn('Unhandled promise rejection:', evt.reason);
  // Prevent default logging bubbling if possible
  try { evt.preventDefault(); } catch (e) {}
});

// --- Configuration ---
const BALL_RADIUS = 0.5;
const GRAVITY = -45; // Even stronger gravity for "heavy" feel
const BALL_SPEED = 5000; // Scaled up for higher mass
const STEER_SPEED = 22;
const MAX_VELOCITY = 18; // Stable but faster limit
const JUMP_FORCE = 25; // Higher force needed to lift 100kg

class Game {
    constructor() {
        this.loadData();
        this.initAudio();
        this.initScene();
        this.initPhysics();
        this.initControls();
        this.createLevel();
        this.animate();
        this.setupUI();
        this.updateWalletUI();
        this.initStudio();
    }

    loadData() {
        const defaultData = {
            totalCoins: 0,
            unlockedBalls: ['rainbow'],
            unlockedSkies: ['day'],
            selectedBall: 'rainbow',
            selectedSky: 'day'
        };
        // Load saved data, fall back to default
        this.saveData = JSON.parse(localStorage.getItem('goingBallsData_v1')) || defaultData;

        // Ensure core defaults are always available and selection is valid
        if (!Array.isArray(this.saveData.unlockedBalls)) this.saveData.unlockedBalls = ['rainbow'];
        if (!this.saveData.unlockedBalls.includes('rainbow')) this.saveData.unlockedBalls.unshift('rainbow');
        if (!Array.isArray(this.saveData.unlockedSkies)) this.saveData.unlockedSkies = ['day'];
        if (!this.saveData.unlockedSkies.includes('day')) this.saveData.unlockedSkies.unshift('day');

        // Explicitly remove the animated GIF skin from unlocked list by default so it must be purchased
        // This prevents older saved data from leaving the GIF as free/equipped.
        if (Array.isArray(this.saveData.unlockedBalls)) {
            this.saveData.unlockedBalls = this.saveData.unlockedBalls.filter(k => k !== 'gifskin');
        }

        // If saved selectedBall/selectedSky are invalid or not unlocked, reset to defaults
        if (!this.saveData.selectedBall || !this.saveData.unlockedBalls.includes(this.saveData.selectedBall)) {
            this.saveData.selectedBall = 'rainbow';
        }
        if (!this.saveData.selectedSky || !this.saveData.unlockedSkies.includes(this.saveData.selectedSky)) {
            this.saveData.selectedSky = 'day';
        }

        // Persist any fixes immediately to avoid inconsistent UI
        localStorage.setItem('goingBallsData_v1', JSON.stringify(this.saveData));
        
        this.ballConfigs = {
            rainbow: { name: 'Rainbow', price: 0, tex: 'assets/image/Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture' },
            gifskin: { name: 'Animated', price: 900, tex: 'assets/image/IMG_0300.gif', type: 'gif' },
            wood: { name: 'Wood', price: 50, tex: 'assets/image/wood_texture.png', type: 'texture' },
            metal: { name: 'Chrome', price: 150, tex: 'assets/image/ball_metal.png', type: 'texture' },
            lava: { name: 'Lava', price: 300, tex: 'assets/image/ball_lava.png', type: 'texture' },
            mint: { name: 'Mint', price: 200, type: 'color', color: 0x7fffd4, shininess: 60 },

            // Glass-style "image inside sphere" skins (premium)
            glass_fire:   { name: 'Glass — Flame', price: 5000, tex: 'assets/image/fire.webp', type: 'glass' },
            glass_demon:  { name: 'Glass — Red Demon', price: 5500, tex: 'assets/image/A-60_gif.webp', type: 'glass' },
            glass_load:   { name: 'Glass — Loading', price: 6000, tex: 'assets/image/windows-loandig-cargando.gif', type: 'glass' },
            glass_sack:   { name: 'Glass — Full Sack', price: 7000, tex: 'assets/image/sack.webp', type: 'glass' },
            glass_star:   { name: 'Glass — Spinning Star', price: 8000, tex: 'assets/image/Spinningstar.gif', type: 'glass' },
            glass_sonic:  { name: 'Glass — Sonic', price: 9000, tex: 'assets/image/sonicwalk.gif', type: 'glass' },

            // New premium glass balls (10000+)
            glass_windows95: { name: 'Glass — Win95 Kawaii', price: 10000, tex: 'assets/image/windows95kwaii.gif', type: 'glass' },
            glass_img0038:   { name: 'Glass — IMG_0038', price: 10500, tex: 'assets/image/IMG_0038.gif', type: 'glass' },
            glass_jfreddy:   { name: 'Glass — JFreddy Power', price: 11000, tex: 'assets/image/Jfreddypower.gif', type: 'glass' },
            glass_lays:      { name: 'Glass — Lays Logo', price: 11500, tex: 'assets/image/Lays_brand_logo.png', type: 'glass' },
            glass_portal:    { name: 'Glass — Portal', price: 12000, tex: 'assets/image/portal.gif', type: 'glass' },
            glass_baldi:     { name: 'Glass — Baldi Dance', price: 12500, tex: 'assets/image/BaldiDanceV2.gif', type: 'glass' },
            glass_dancing:   { name: 'Glass — Dancing Groovy', price: 13000, tex: 'assets/image/dancing-groovy.webp', type: 'glass' },
            glass_epicface:  { name: 'Glass — Epic Face Spin', price: 13500, tex: 'assets/image/epicfacespin (2).gif', type: 'glass' }
        };

        this.skyConfigs = {
            day: { name: 'Blue Sky', price: 0, tex: 'assets/image/sky_day.png', color: 0x87ceeb },
            sunset: { name: 'Sunset', price: 100, tex: 'assets/image/sky_sunset.png', color: 0xff7f50 },
            night: { name: 'Midnight', price: 250, tex: 'assets/image/sky_night.png', color: 0x0a0a2a },
            void: { name: 'Cosmic', price: 500, tex: 'assets/image/sky_void.png', color: 0x000000 }
        };
    }

    save() {
        localStorage.setItem('goingBallsData_v1', JSON.stringify(this.saveData));
    }

    // --- Module-delegated methods ---
    initAudio() { initAudio(this); }
    getBallMaterial() { return getBallMaterial(this); }
    clearLevel() { clearLevel(this); }
    placeFinishModel() { placeFinishModel(this); }
    createLevel() { createLevel(this); }
    addPlatform(x, y, z, w, l, c) { addPlatform(this, x, y, z, w, l, c); }
    addTunnelWalls(x, y, z, w, l) { addTunnelWalls(this, x, y, z, w, l); }
    addRamp(x, y, z, w, l, h) { addRamp(this, x, y, z, w, l, h); }
    addPendulum(x, y, z, s) { addPendulum(this, x, y, z, s); }
    addSpinner(x, y, z, s) { addSpinner(this, x, y, z, s); }
    addHammer(x, y, z, s) { addHammer(this, x, y, z, s); }
    addMover(x, y, z, w, h, d, sid, s) { addMover(this, x, y, z, w, h, d, sid, s); }
    addWall(x, y, z, w, l, r) { addWall(this, x, y, z, w, l, r); }
    addCoins(x, y, z, l, c) { addCoins(this, x, y, z, l, c); }
    addCheckpoint(x, y, z, w) { addCheckpoint(this, x, y, z, w); }
    renderBuilder() { renderBuilder(this); }
    clearBuilderPreview() { clearBuilderPreview(this); }
    previewBuilder() { previewBuilder(this); }
    loadCustomLevel(c) { loadCustomLevel(this, c); }
    enterBuilderScene() { enterBuilderScene(this); }
    exitBuilderScene() { exitBuilderScene(this); }
    setupUI() { setupUI(this); }
    renderGrids() { renderGrids(this); }
    handlePurchase(t, k, p) { handlePurchase(this, t, k, p); }
    updateWalletUI() { updateWalletUI(this); }
    playSound(n) { playSound(this, n); }
    spawnCoinExplosion(o, v) { spawnCoinExplosion(this, o, v); }
    playFootstep(s) { playFootstep(this, s); }
    initStudio() { initStudio(this); }



    initScene() {
        this.scene = new THREE.Scene();
        this.textureLoader = new THREE.TextureLoader();
        const sky = this.skyConfigs[this.saveData.selectedSky] || this.skyConfigs.day;
        
        if (sky.tex) {
            this.textureLoader.load(
                sky.tex,
                (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    this.scene.background = texture;
                },
                undefined,
                (err) => {
                    console.warn('Sky texture load failed:', sky.tex, err);
                    // fallback to solid color if texture fails
                    this.scene.background = new THREE.Color(sky.color || 0x000000);
                }
            );
        } else {
            this.scene.background = new THREE.Color(sky.color);
        }
        this.scene.fog = new THREE.Fog(sky.color, 20, 150);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.debug.checkShaderErrors = false;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(15, 30, 20);
        sunLight.castShadow = true;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        this.scene.add(sunLight);

        this.gltfLoader = new GLTFLoader();
        this.finishModel = null;
        // No finish .glb model present — finishModel stays null, finish line uses procedural mesh

        // static textures (with error fallbacks)
        this.ballTexture = this.textureLoader.load(
            'assets/image/Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png',
            (tex) => {},
            undefined,
            (err) => { console.warn('Ball texture load failed:', err); }
        );
        this.woodTexture = this.textureLoader.load(
            'assets/image/wood_texture.png',
            (tex) => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(1, 4);
            },
            undefined,
            (err) => {
                console.warn('Wood texture failed:', err);
                // If wood texture fails, create a simple fallback
                const fallback = new THREE.Texture();
                fallback.needsUpdate = false;
                this.woodTexture = fallback;
            }
        );
        // ensure safe wrap values if woodTexture loaded via onLoad
        if (this.woodTexture && this.woodTexture.wrapS === undefined) {
            try {
                this.woodTexture.wrapS = THREE.RepeatWrapping;
                this.woodTexture.wrapT = THREE.RepeatWrapping;
                this.woodTexture.repeat && this.woodTexture.repeat.set(1, 4);
            } catch (e) {}
        }

        // special handling for animated GIF skin (use Image -> Texture so browser handles GIF frames; update when loaded)
        this.gifImage = new Image();
        this.gifImage.crossOrigin = 'anonymous';
        this.gifImage.src = 'assets/image/IMG_0300.gif';
        this.gifTexture = new THREE.Texture(this.gifImage);
        // Only mark texture for update once the browser has loaded a frame of the GIF
        this.gifImage.onload = () => { 
            this.gifTexture.needsUpdate = true;
        };
        this.gifImage.onerror = (err) => {
            console.warn('GIF image failed to load:', this.gifImage.src, err);
            // avoid trying to use a broken gif texture
            this.gifTexture = null;
        };

        this.sharedMaterials = {
            wood: new THREE.MeshPhongMaterial({ map: this.woodTexture }),
            finish: new THREE.MeshPhongMaterial({ color: 0x00ff00 }),
            coin: new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 80 }),
            pendulum: new THREE.MeshPhongMaterial({ color: 0xaa0000 }),
            spinner: new THREE.MeshPhongMaterial({ color: 0x0000ff }),
            rope: new THREE.LineBasicMaterial({ color: 0x333333 }),
            wall: new THREE.MeshPhongMaterial({ color: 0x666666, transparent: true, opacity: 0.5 }),
            speed: new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0x444400 }),
            hazard: new THREE.MeshPhongMaterial({ color: 0xff4500 })
        };

        window.addEventListener('resize', () => this.onWindowResize());

        // --- Drag & Drop support: allow dragging builder items from UI bars/panels into the world ---
        // Add dragstart to items
        setTimeout(() => {
            document.querySelectorAll('.drag-item[draggable="true"]').forEach(el => {
                el.addEventListener('dragstart', (ev) => {
                    const kind = el.getAttribute('data-item') || 'platform';
                    ev.dataTransfer.setData('text/plain', kind);
                    // small ghost image so it's visible
                    try {
                        const ghost = document.createElement('canvas');
                        ghost.width = 64; ghost.height = 32;
                        const ctx = ghost.getContext('2d');
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.fillRect(0,0,64,32);
                        ctx.fillStyle = 'white';
                        ctx.font = '10px sans-serif';
                        ctx.fillText(kind, 6, 18);
                        ev.dataTransfer.setDragImage(ghost, 32, 16);
                    } catch (e) {}
                });
            });

            // allow dropping onto renderer canvas
            const canvas = this.renderer.domElement;
            const onDragOver = (e) => { e.preventDefault(); canvas.classList.add('drop-highlight'); };
            const onDragLeave = (e) => { canvas.classList.remove('drop-highlight'); };
            const onDrop = (e) => {
                e.preventDefault();
                canvas.classList.remove('drop-highlight');
                const kind = e.dataTransfer.getData('text/plain') || 'platform';
                // get normalized device coords
                const rect = canvas.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                // project into world at ball depth (or use raycast onto y=0 plane)
                const ndc = new THREE.Vector3(x, y, 0.5);
                ndc.unproject(this.camera);
                // Create a ray from camera through ndc
                const dir = ndc.sub(this.camera.position).normalize();
                const t = (0 - this.camera.position.y) / dir.y;
                const intersection = new THREE.Vector3().copy(this.camera.position).add(dir.multiplyScalar(t));
                const worldX = intersection.x;
                const worldZ = intersection.z;

                // If live builder is active, place physical platforms at drop pos
                if (this.inBuilderScene) {
                    // Basic mapping of draggable kinds to segments
                    const mapToSeg = {
                        platform: { type: 'platform', width: 6, len: 8, x: worldX, z: worldZ },
                        ramp: { type: 'ramp', width: 6, len: 12, height: 3, x: worldX, z: worldZ },
                        gap: { type: 'gap', len: 8, x: worldX, z: worldZ },
                        checkpoint: { type: 'checkpoint', width: 6, len: 6, x: worldX, z: worldZ },
                        spikes: { type: 'spikes', width: 6, len: 6, count: 6, x: worldX, z: worldZ },
                        pendulum: { type: 'pendulum', width: 6, len: 12, intensity: 1, x: worldX, z: worldZ },
                        spinner: { type: 'spinner', width: 8, len: 12, speedMult: 1, x: worldX, z: worldZ },
                        trampoline: { type: 'trampoline', width: 4, len: 4, bounce: 18, x: worldX, z: worldZ },
                        coin_ring: { type: 'coin_ring', radius: 3, count: 10, x: worldX, z: worldZ },
                        moving_platform: { type: 'moving_platform', width: 4, len: 8, travel: 6, axis: 'x', x: worldX, z: worldZ },
                        spring_pad: { type: 'spring_pad', width: 2, len: 2, boost: 22, x: worldX, z: worldZ },
                        stunt_ramp: { type: 'stunt_ramp', width: 8, len: 18, height: 6, x: worldX, z: worldZ },
                        stunt_loop: { type: 'stunt_loop', radius: 4, segments: 16, x: worldX, z: worldZ },
                        stunt_grind: { type: 'stunt_grind', width: 0.6, len: 20, height: 1.2, x: worldX, z: worldZ }
                    };
                    const seg = mapToSeg[kind] || mapToSeg.platform;
                    // Place a physical element at drop location; for platforms we use addPlatform; for others call corresponding adders
                    const segType = seg.type;
                    if (segType === 'platform') {
                        this.addPlatform(seg.x, 0, seg.z, seg.width, seg.len);
                    } else if (segType === 'ramp') {
                        this.addRamp(seg.x, 0, seg.z, seg.width, seg.len, seg.height);
                    } else if (segType === 'checkpoint') {
                        this.addCheckpoint(seg.x, 0, seg.z, seg.width);
                    } else if (segType === 'spikes') {
                        // use addWall approximations across width
                        const spikeCount = seg.count || 6;
                        const spacing = (seg.width || 6) / spikeCount;
                        for (let s=0; s<spikeCount; s++){
                            const px = seg.x - (seg.width||6)/2 + spacing*(s+0.5);
                            this.addWall(px, 0.5, seg.z, 0.2, seg.len || 6, 0);
                        }
                    } else if (segType === 'pendulum') {
                        this.addPendulum(seg.x, 0, seg.z, seg.intensity || 1);
                    } else if (segType === 'spinner') {
                        this.addSpinner(seg.x, 0.5, seg.z, seg.speedMult || 1);
                    } else if (segType === 'trampoline') {
                        this.addPlatform(seg.x, 0, seg.z, seg.width, seg.len, 0xffff00);
                    } else if (segType === 'coin_ring') {
                        // add coins in ring around drop pos (non-physics coins)
                        const count = seg.count || 8;
                        const radius = seg.radius || 3;
                        for (let i=0;i<count;i++){
                            const a = (i / count) * Math.PI * 2;
                            const cx = seg.x + Math.cos(a) * radius;
                            const cz = seg.z + Math.sin(a) * radius;
                            const coinGeo = new THREE.CylinderGeometry(0.3,0.3,0.08,16);
                            const coin = new THREE.Mesh(coinGeo, this.sharedMaterials.coin);
                            coin.rotation.x = Math.PI/2;
                            coin.position.set(cx, 1.2, cz);
                            this.scene.add(coin);
                            this.coins.push(coin);
                        }
                    } else if (segType === 'moving_platform') {
                        this.addMover(seg.x, 0.5, seg.z, 4, 1, seg.len || 8, seg.axis === 'x' ? false : false, 1);
                    } else if (segType === 'spring_pad') {
                        const geo = new THREE.CircleGeometry((seg.width||2)/2, 16);
                        const mesh = new THREE.Mesh(geo, this.sharedMaterials.speed);
                        mesh.rotation.x = -Math.PI/2;
                        mesh.position.set(seg.x, 0.01, seg.z);
                        this.scene.add(mesh);
                        this.levelObjects.push({ mesh }); // non-physical visual
                    } else if (segType === 'stunt_ramp') {
                        this.addRamp(seg.x, 0, seg.z, seg.width, seg.len, seg.height);
                    } else if (segType === 'stunt_loop') {
                        // approximate loop in-world
                        const segCount = seg.segments || 16;
                        const r = seg.radius || 4;
                        for (let i=0;i<segCount;i++){
                            const a = (i/segCount)*Math.PI*2;
                            const px = seg.x + Math.cos(a)*r;
                            const pz = seg.z + Math.sin(a)*r;
                            this.addPlatform(px, Math.sin(a)*0.6, pz, 1.2, 1.2);
                        }
                    } else if (segType === 'stunt_grind') {
                        this.addPlatform(seg.x, seg.height||1.2, seg.z, seg.width||0.6, seg.len||20);
                    }

                } else {
                    // Not in live builder: append to builder segments array for later use (preview)
                    this.builder = this.builder || { segments: [], cursorZ: -5 };
                    const addMap = {
                        platform: { type: 'platform', width: 6, len: 8 },
                        ramp: { type: 'ramp', width: 6, len: 12, height: 3 },
                        gap: { type: 'gap', len: 8 },
                        checkpoint: { type: 'checkpoint', width: 6, len: 6 },
                        spikes: { type: 'spikes', width: 6, len: 6, count: 6 },
                        pendulum: { type: 'pendulum', width: 6, len: 12, intensity: 1 },
                        spinner: { type: 'spinner', width: 8, len: 12, speedMult: 1 },
                        trampoline: { type: 'trampoline', width: 4, len: 4, bounce: 18 },
                        coin_ring: { type: 'coin_ring', radius: 3, count: 10 },
                        moving_platform: { type: 'moving_platform', width: 4, len: 8, travel: 6, axis: 'x' },
                        spring_pad: { type: 'spring_pad', width: 2, len: 2, boost: 22 },
                        stunt_ramp: { type: 'stunt_ramp', width: 8, len: 18, height: 6 },
                        stunt_loop: { type: 'stunt_loop', radius: 4, segments: 16 },
                        stunt_grind: { type: 'stunt_grind', width: 0.6, len: 20, height: 1.2 }
                    };
                    const seg = addMap[kind] || addMap.platform;
                    this.builder.segments.push(seg);
                    this.previewBuilder();
                }
            };

            canvas.addEventListener('dragover', onDragOver);
            canvas.addEventListener('dragleave', onDragLeave);
            canvas.addEventListener('drop', onDrop);

            // remove highlight if drag ends anywhere outside
            window.addEventListener('dragend', () => { this.renderer.domElement.classList.remove('drop-highlight'); });

        }, 200);
    }

    initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, GRAVITY, 0);
        this.world.allowSleep = true;
        
        const ballMaterial = new CANNON.Material('ball');
        const groundMaterial = new CANNON.Material('ground');
        const contactMaterial = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
            friction: 1.0, // Max friction to prevent unwanted sliding
            restitution: 0.1 // Minimal bounce for heavy feel
        });
        this.world.addContactMaterial(contactMaterial);

        const sphereShape = new CANNON.Sphere(BALL_RADIUS);
        this.ballBody = new CANNON.Body({
            mass: 100, // Extremely heavy to prevent flinging
            shape: sphereShape,
            material: ballMaterial,
            angularDamping: 0.95, // High damping for control
            linearDamping: 0.5     // Reduced slightly for smoother rolling
        });
        this.ballBody.position.set(0, 1, -3); // Slightly forward to show track ahead
        this.world.addBody(this.ballBody);

        initWolfModel(this);
        // Set initial rotation so wolf faces forward (-Z) on first frame
        this.ballMesh.rotation.y = Math.PI;

        this.dustParticles = [];
        this.dustSpawnTimer = 0;
        this._dustGeo = new THREE.CircleGeometry(0.1, 6);
        this._dustMat = new THREE.MeshBasicMaterial({
            color: 0xc2a66e, transparent: true, opacity: 0.6, depthWrite: false
        });
        this.coins = [];
        this.score = 0;
        this.levelLength = 0;
        this.currentLevel = 1;
        this.levelObjects = []; 
        this.pendulums = [];
        this.spinners = [];
        this.movers = []; 
        this.isGameOver = false;
        this.isWin = false;
        this.isGrounded = false;
        this.jumpCount = 0;
        this.checkpoints = [];
        this.lastCheckpointPos = new CANNON.Vec3(0, 5, 0);
    }

    initControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') this.jump();
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        const joystick = nipplejs.create({
            zone: document.getElementById('joystick-container'),
            mode: 'static',
            position: { left: '90px', bottom: '90px' },
            color: 'white',
            size: 140,
            threshold: 0.1
        });

        this.joystickInput = { x: 0, y: 0 };
        joystick.on('move', (evt, data) => {
            // Add a small deadzone to prevent drift
            if (data.force < 0.1) {
                this.joystickInput.x = 0;
                this.joystickInput.y = 0;
            } else {
                this.joystickInput.x = data.vector.x;
                this.joystickInput.y = data.vector.y;
            }
        });
        joystick.on('end', () => {
            this.joystickInput.x = 0;
            this.joystickInput.y = 0;
        });

        const jumpBtn = document.getElementById('jump-btn');
        jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.jump(); });
        jumpBtn.addEventListener('mousedown', (e) => this.jump());

        // Side-scrolling camera: left-side view for Jack running
        this.sideCamOffset = new THREE.Vector3(14, 7, 0); // right side camera → ball on LEFT of screen

        // Unified interaction listener for UI visibility and pointer lock
        const handleInteraction = (e) => {
            const topMenu = document.getElementById('top-menu');
            const isMenuClick = e.target.closest('#top-menu');
            const isModalClick = e.target.closest('.modal');
            const isControlClick = e.target.closest('#joystick-container') || e.target.closest('#jump-btn');

            if (isMenuClick || isModalClick) return;

            // Toggle UI visibility when tapping anywhere else
            const isVisible = topMenu.classList.toggle('visible');

            // Handle pointer lock logic: lock only if UI was just hidden and we aren't in a menu
            if (!isVisible && !this.isGameOver && !isControlClick) {
                // Mobile browsers do not support requestPointerLock
                if (typeof this.renderer.domElement.requestPointerLock === 'function') {
                    this.renderer.domElement.requestPointerLock();
                }
            }
            
            // Auto-hide menu after 4 seconds of inactivity if shown
            if (this.menuHideTimeout) clearTimeout(this.menuHideTimeout);
            if (isVisible) {
                this.menuHideTimeout = setTimeout(() => {
                    topMenu.classList.remove('visible');
                }, 4000);
            }
        };

        window.addEventListener('mousedown', handleInteraction);
        window.addEventListener('touchstart', (e) => {
            // If we are clicking UI elements, don't trigger the game-world interaction logic
            if (e.target.closest('#top-menu') || e.target.closest('.modal')) return;

            // Special handling for touch to not conflict with joystick immediately
            if (!e.target.closest('#joystick-container') && !e.target.closest('#jump-btn')) {
                handleInteraction(e);
            }
        }, { passive: true });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyT') {
                document.exitPointerLock();
            }
        });
    }



    // --- Procedural Level Generators ---












    jump() {
        if (this.jumpCount < 3 && !this.isGameOver) {
            this.ballBody.velocity.y = JUMP_FORCE;
            this.jumpCount++;
            this.isGrounded = false;
            this.playSound('jump');
        }
    }


    // Spawn a visual coin-explosion "confetti" effect and animate it (non-physics)

    updatePhysics() {
        this.world.step(1/60);
        this.inputX = 0;
        this.inputZ = 0;

        // Grounded check via contact points
        this.isGrounded = false;
        for (let i = 0; i < this.world.contacts.length; i++) {
            const contact = this.world.contacts[i];
            if (contact.bi === this.ballBody || contact.bj === this.ballBody) {
                const normal = new CANNON.Vec3();
                if (contact.bi === this.ballBody) contact.ni.negate(normal);
                else normal.copy(contact.ni);
                if (normal.y > 0.4) { // Lowered threshold to keep grounded state on steeper ramps
                    this.isGrounded = true;
                    break;
                }
            }
        }

        if (this.isGrounded) {
            this.jumpCount = 0;
            // Play footstep sounds when Jack is running on the ground
            const v = this.ballBody.velocity;
            const footstepSpeed = Math.sqrt(v.x**2 + v.z**2);
            if (footstepSpeed > 0.5 && !this.isGameOver) {
                this.playFootstep(footstepSpeed);
            }
        }

        this.ballMesh.position.copy(this.ballBody.position);
        // Don't copy quaternion — Jack runs upright, doesn't roll like a ball
        // Only rotate Y to face direction of movement
        const vel = this.ballBody.velocity;
        if (Math.abs(vel.x) > 0.1 || Math.abs(vel.z) > 0.1) {
            const moveAngle = Math.atan2(vel.x, vel.z);
            this.ballMesh.rotation.y = moveAngle;
        }

        if (this.keys['ArrowUp'] || this.keys['KeyW']) this.inputZ = -1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) this.inputZ = 1;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.inputX = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.inputX = 1;

        this.inputX += this.joystickInput.x;
        this.inputZ -= this.joystickInput.y;

        const airMult = this.isGrounded ? 1.0 : 0.25;
        
        // Side-scrolling: controls are screen-relative
        // Left/Right keys move along X, Up/Down move along -Z/+Z (track direction)
        const forward = new THREE.Vector3(0, 0, this.inputZ); // inputZ is -1 when pressing W (forward = -Z)
        const right = new THREE.Vector3(this.inputX, 0, 0);

        const combinedMove = forward.add(right);
        const force = new CANNON.Vec3(
            combinedMove.x * BALL_SPEED * airMult, 
            0, 
            combinedMove.z * BALL_SPEED * airMult
        );
        
        this.ballBody.applyForce(force, this.ballBody.position);

        const velocity = this.ballBody.velocity;
        
        // Aggressive lateral stabilization to prevent ramp sliding
        if (this.isGrounded) {
            if (Math.abs(this.inputX) < 0.05) {
                // Not steering: kill side velocity aggressively to stay centered on ramps
                this.ballBody.velocity.x *= 0.75;
                if (Math.abs(this.ballBody.velocity.x) < 0.05) this.ballBody.velocity.x = 0;
            } else {
                // Actively steering: allow movement but keep it tight
                this.ballBody.velocity.x *= 0.95;
            }
        }

        const speed = Math.sqrt(velocity.x**2 + velocity.z**2);

        // Switch wolf animation: run when moving, idle when still
        setWolfRunning(this, speed > 1.0 && this.isGrounded);
        
        if (speed > MAX_VELOCITY) {
            const ratio = MAX_VELOCITY / speed;
            this.ballBody.velocity.x *= ratio;
            this.ballBody.velocity.z *= ratio;
        }

        const time = Date.now() * 0.002;
        this.pendulums.forEach(p => {
            const t = time * p.speedMult;
            const angle = Math.sin(t + p.startTime) * 1.3;
            const px = p.pivot.x + Math.sin(angle) * 6;
            const py = p.pivot.y - Math.cos(angle) * 6;
            p.body.position.set(px, py, p.pivot.z);
            p.mesh.position.copy(p.body.position);
            const pos = p.line.geometry.attributes.position.array;
            pos[3] = p.body.position.x; pos[4] = p.body.position.y; pos[5] = p.body.position.z;
            p.line.geometry.attributes.position.needsUpdate = true;
        });

        this.spinners.forEach(s => {
            const rot = time * s.speed;
            s.body.quaternion.setFromEuler(0, rot, 0);
            s.mesh.position.copy(s.body.position);
            s.mesh.quaternion.copy(s.body.quaternion);
        });

        this.movers.forEach(m => {
            const t = (time + m.offset) * m.speedMult;
            if (m.type === 'hammer') {
                const offX = Math.sin(t * 3) * 5;
                m.body.position.set(m.basePos.x + offX, m.basePos.y, m.basePos.z);
            } else if (m.type === 'slide') {
                const offX = Math.sin(t * 2) * 3;
                m.body.position.set(m.basePos.x + offX, m.basePos.y, m.basePos.z);
            } else if (m.type === 'side') {
                const offX = Math.sin(t * 2.5) * 2;
                const dir = m.basePos.x > 0 ? 1 : -1;
                m.body.position.set(m.basePos.x + offX * dir, m.basePos.y, m.basePos.z);
            }
            m.mesh.position.copy(m.body.position);
        });
    }


    checkGameState() {
        this.coins.forEach(coin => {
            if (coin.visible && this.ballMesh.position.distanceTo(coin.position) < 1.2) {
                coin.visible = false;
                const val = (coin.userData && coin.userData.value) ? coin.userData.value : 10;
                this.score += val;
                this.saveData.totalCoins += val;
                this.save();
                this.updateWalletUI();
                this.playSound('coin_collect');
                document.getElementById('coin-display').innerText = `Session: ${this.score}`;
            }
            if (coin.visible) {
                // gentle spin and subtle bob effect
                coin.rotation.z += 0.05;
                const b = (coin.userData && coin.userData.baseScale) ? coin.userData.baseScale : 1;
                coin.position.y += Math.sin(Date.now() * 0.004 + (coin.id || 0)) * 0.002 * b;
            }
        });

        if (this.ballBody.position.y < -10 && !this.isGameOver) this.gameOver(false);
        if (this.ballBody.position.z < this.finishZ && !this.isGameOver) this.gameOver(true);

        // Check for checkpoints
        this.checkpoints.forEach(cp => {
            if (!cp.reached && this.ballBody.position.z < cp.z) {
                cp.reached = true;
                this.lastCheckpointPos.copy(cp.pos);
                // Subtle feedback for checkpoint reached
                this.playSound('coin_collect');
            }
        });

        const progress = Math.min(100, Math.max(0, Math.floor((Math.abs(this.ballBody.position.z) / this.levelLength) * 100)));
        document.getElementById('distance-display').innerText = `Distance: ${progress}%`;
    }

    gameOver(win) {
        this.isGameOver = true;
        this.isWin = win;
        const overlay = document.getElementById('overlay');
        const title = document.getElementById('overlay-title');
        const btn = document.getElementById('next-btn');
        overlay.style.display = 'flex';
        if (win) {
            title.innerText = "LEVEL " + this.currentLevel + " COMPLETE!";
            btn.innerText = "NEXT LEVEL";
            this.playSound('finish_line');
        } else {
            title.innerText = "CRASHED!";
            btn.innerText = "TRY AGAIN";
            this.playSound('fall_off');

            // Lose session-collected coins (they were already added to wallet at collection time).
            // Subtract the current run score from totalCoins to "drop" them; clamp at zero.
            const lost = Math.min(this.saveData.totalCoins, this.score);
            if (lost > 0) {
                // visual origin for explosion: slightly above the ball
                const origin = new THREE.Vector3().copy(this.ballMesh.position).add(new THREE.Vector3(0, 1, 0));
                this.spawnCoinExplosion(origin, this.score || lost);

                // remove lost coins from wallet
                this.saveData.totalCoins = Math.max(0, this.saveData.totalCoins - lost);
                this.save();
                this.updateWalletUI();
            }
        }
    }

    reset() {
        if (this.isWin) {
            this.currentLevel++;
            this.createLevel();
        }
        
        // Reset to last checkpoint or start
        this.ballBody.position.copy(this.lastCheckpointPos);
        // Ensure ball is slightly above ground to prevent clipping on reset
        this.ballBody.position.y += 1;
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        resetWolfModel(this);

        // Clean up dust particles
        this.dustParticles.forEach(p => { this.scene.remove(p.mesh); p.mesh.material.dispose(); });
        this.dustParticles.length = 0;
        this.dustSpawnTimer = 0;

        this.isGameOver = false;
        this.isWin = false;
        this.score = 0;
        document.getElementById('coin-display').innerText = `Coins: 0`;
        document.getElementById('overlay').style.display = 'none';
        this.coins.forEach(c => c.visible = true);
    }


    // --- Builder: simple track editor (store as array of segments with type and params) ---




    // --- Live in-world scene builder: overhead camera, grid, cursor and simple controls ---




    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        // Skip physics/rendering when the studio overlay is open
        if (typeof isStudioActive === 'function' && isStudioActive()) return;
        if (!this.isGameOver) {
            this.updatePhysics();
            this.checkGameState();
        }

        // Side-scrolling camera: Jack runs on the left side of screen
        const targetCamPos = new THREE.Vector3(
            this.ballMesh.position.x + this.sideCamOffset.x,
            this.ballMesh.position.y + this.sideCamOffset.y,
            this.ballMesh.position.z + this.sideCamOffset.z
        );
        this.camera.position.lerp(targetCamPos, 0.15);
        // Look at Jack from the side — slightly ahead to show track
        this.camera.lookAt(
            this.ballMesh.position.x,
            this.ballMesh.position.y + 0.5,
            this.ballMesh.position.z - 6
        );

        // Ensure animated GIF texture updates each frame (browser advances GIF frames on the Image element)
        if (this.gifTexture) {
            this.gifTexture.needsUpdate = true;
        }

        // Update any active coin-explosion confetti pieces
        if (this._coinExplosions && this._coinExplosions.length > 0) {
            const gravity = new THREE.Vector3(0, -9.8, 0);
            for (let i = this._coinExplosions.length - 1; i >= 0; i--) {
                const p = this._coinExplosions[i];
                // integrate velocity
                p.velocity.addScaledVector(gravity, 1/60);
                p.mesh.position.addScaledVector(p.velocity, 1/60);
                // rotate visually
                try {
                    p.mesh.rotation.x += p.angular.x * 0.01;
                    p.mesh.rotation.y += p.angular.y * 0.01;
                    p.mesh.rotation.z += p.angular.z * 0.01;
                } catch (e) {}
                p.life += 1/60;
                // fade out near end of life
                const t = Math.min(1, p.life / p.maxLife);
                try {
                    p.mesh.material.opacity = 1 - t;
                    p.mesh.material.transparent = true;
                } catch (e) {}
                if (p.mesh.position.y < -10 || p.life > p.maxLife) {
                    try { this.scene.remove(p.mesh); } catch (e) {}
                    this._coinExplosions.splice(i, 1);
                }
            }
        }

        const now = performance.now();
        const wolfDelta = (now - (this._lastWolfFrame || now)) / 1000;
        this._lastWolfFrame = now;
        const wolfSpeed = Math.sqrt(this.ballBody.velocity.x**2 + this.ballBody.velocity.z**2);
        updateWolfAnimation(this, wolfDelta, wolfSpeed);

        // --- Dust particles under Jack's feet while running ---
        if (!this.isGameOver && this.isGrounded) {
            const spd = Math.sqrt(this.ballBody.velocity.x**2 + this.ballBody.velocity.z**2);
            if (spd > 1.0) {
                this.dustSpawnTimer += wolfDelta;
                const spawnInterval = Math.max(0.04, 0.12 - spd * 0.005);
                while (this.dustSpawnTimer >= spawnInterval && this.dustParticles.length < 30) {
                    this.dustSpawnTimer -= spawnInterval;
                    const dust = new THREE.Mesh(this._dustGeo, this._dustMat.clone());
                    dust.rotation.x = -Math.PI / 2;
                    dust.position.set(
                        this.ballMesh.position.x + (Math.random() - 0.5) * 0.6,
                        0.05,
                        this.ballMesh.position.z + (Math.random() - 0.5) * 0.4 + 0.3
                    );
                    this.scene.add(dust);
                    this.dustParticles.push({
                        mesh: dust,
                        life: 0,
                        maxLife: 0.4 + Math.random() * 0.3,
                        vy: 0.3 + Math.random() * 0.5,
                        vx: (Math.random() - 0.5) * 0.8
                    });
                }
            }
        }
        // Animate dust particles
        for (let i = this.dustParticles.length - 1; i >= 0; i--) {
            const p = this.dustParticles[i];
            p.life += wolfDelta;
            p.mesh.position.y += p.vy * wolfDelta;
            p.mesh.position.x += p.vx * wolfDelta;
            const t = p.life / p.maxLife;
            p.mesh.material.opacity = 0.6 * (1 - t);
            p.mesh.scale.setScalar(1 + t * 2);
            if (p.life >= p.maxLife) {
                this.scene.remove(p.mesh);
                p.mesh.material.dispose();
                this.dustParticles.splice(i, 1);
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();