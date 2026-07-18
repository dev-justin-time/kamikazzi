import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import nipplejs from 'nipplejs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// --- Extracted modules ---
import { initAudio, playSound, spawnCoinExplosion, playFootstep } from "./js/audio.js";
import { getBallMaterial } from "./js/ball-skins.js";
import {
  clearLevel, placeFinishModel, createLevel,
  addPlatform, addTunnelWalls, addRamp, addPendulum, addSpinner,
  addHammer, addMover, addWall, addCoins, addCheckpoint,
  TRACK_ANGLE
} from "./js/level-gen.js";
import {
  renderBuilder, clearBuilderPreview, previewBuilder,
  loadCustomLevel, enterBuilderScene, exitBuilderScene
} from "./js/track-builder.js";
import { setupUI, renderGrids, handlePurchase, updateWalletUI, showToast } from "./js/ui.js";
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
        // Track rotation: compute forward direction and rotation quaternion
        this.trackAngle = TRACK_ANGLE;
        this._trackQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), TRACK_ANGLE);
        this.trackForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this._trackQuat);
        this.initControls();

        // Cache coin risk warning element to avoid DOM queries every frame
        this._coinRiskWarning = document.getElementById('coin-risk-warning');

        // Pause resume button
        const pauseResumeBtn = document.getElementById('pause-resume-btn');
        if (pauseResumeBtn) {
            pauseResumeBtn.addEventListener('click', () => this.togglePause());
        }

        // Mute button
        this.audioMuted = false;
        const savedMuted = localStorage.getItem('gb_audioMuted');
        if (savedMuted === 'true') {
            this.audioMuted = true;
        }
        this._syncMuteButton();
        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => this.toggleMute());
        }

        this.createLevel();
        this.animate();
        this.setupUI();
        this.updateWalletUI();
        this.initStudio();

        // Show start screen and pause until the player clicks START FLYING
        this.isPaused = true;
        this._startScreen = document.getElementById('start-screen');
        this._wireStartButton();

        // Show tutorial on first launch (after start screen is dismissed)
        if (!this.saveData.tutorialSeen) {
            this._pendingTutorial = true;
        }
    }

    _wireStartButton() {
        const startBtn = document.getElementById('start-btn');
        if (!startBtn) return;

        const startGame = () => {
            if (this._startScreen) {
                this._startScreen.classList.add('hidden');
                setTimeout(() => { if (this._startScreen) this._startScreen.style.display = 'none'; }, 500);
            }
            this.isPaused = false;

            // Show first-launch tutorial now that the player has started the game
            if (this._pendingTutorial) {
                this._pendingTutorial = false;
                this.showTutorial();
            }
        };

        startBtn.addEventListener('click', startGame);

        // Focus the start button so keyboard users can press Enter/Space immediately
        startBtn.focus();
    }

    loadData() {
        const defaultData = {
            totalCoins: 0,
            unlockedBalls: ['rainbow'],
            unlockedSkies: ['day'],
            selectedBall: 'rainbow',
            selectedSky: 'day',
            bestLevel: 1,
            deaths: 0,
            totalPlayTime: 0,
            lifetimeCoins: 0,
            cameraSensitivity: 1.0,
            invertY: false,
            shadowQuality: 'high',
            tutorialSeen: false
        };
        // Load saved data, fall back to default
        this.saveData = JSON.parse(localStorage.getItem('goingBallsData_v1')) || defaultData;

        // Backfill fields if missing from older saved data
        if (this.saveData.bestLevel == null) this.saveData.bestLevel = 1;
        if (this.saveData.deaths == null) this.saveData.deaths = 0;
        if (this.saveData.totalPlayTime == null) this.saveData.totalPlayTime = 0;
        if (this.saveData.lifetimeCoins == null) this.saveData.lifetimeCoins = 0;
        if (this.saveData.cameraSensitivity == null) this.saveData.cameraSensitivity = 1.0;
        if (this.saveData.invertY == null) this.saveData.invertY = false;
        if (this.saveData.shadowQuality == null) this.saveData.shadowQuality = 'high';
        if (this.saveData.tutorialSeen == null) this.saveData.tutorialSeen = true;

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
    createLevel() {
        createLevel(this);
        this.levelStartTime = performance.now();
    }
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
    renderStats() { _renderStats(this); }
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
                    // Offset to rotate sky ~162° so the visible seam sits behind the camera
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.offset.x = 0.45;
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
        // Shadow map: respect saved setting, default high (2048) on desktop, low (1024) on mobile
        const savedShadow = this.saveData.shadowQuality;
        const isMobile = 'ontouchstart' in window && window.innerWidth < 1024;
        const shadowRes = savedShadow ? (savedShadow === 'low' ? 1024 : 2048) : (isMobile ? 1024 : 2048);
        sunLight.shadow.mapSize.width = shadowRes;
        sunLight.shadow.mapSize.height = shadowRes;
        this._sunLight = sunLight;
        this.scene.add(sunLight);

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setDRACOLoader(dracoLoader);
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
        this._lastGifUpdate = 0;

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
        // Rotate starting position to match track angle
        const _sv = new THREE.Vector3(0, 1, -3).applyQuaternion(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), TRACK_ANGLE)
        );
        this.ballBody.position.set(_sv.x, _sv.y, _sv.z);
        this.world.addBody(this.ballBody);

        initWolfModel(this);
        // Sync mesh position to physics body immediately so camera sees Jack during tutorial/pause
        this.ballMesh.position.copy(this.ballBody.position);
        // Set initial rotation to match track direction (no snap on first frame)
        this.ballMesh.rotation.y = Math.atan2(this.trackForward.x, this.trackForward.z);

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

        // Kick animation state (soccer ball bob when pressing forward)
        this._kickOffset = 0;       // current Z offset of soccer ball
        this._kickVelocity = 0;     // spring velocity for bounce-back
        this._wasPressingForward = false;
    }

    initControls() {
        this.keys = {};
        this.isPaused = false;
        
        // Detect touch capability and add class to body
        if (!('ontouchstart' in window)) {
            document.body.classList.add('no-touch');
        }
        
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') this.jump();
            if (e.code === 'Escape') this.togglePause();
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

        // Chase camera: behind the ball, looking forward along the track
        // Offset is computed per-frame in animate() using trackForward

        // --- Mouse orbit camera ---
        this.cameraDistance = 9.43; // base distance, adjustable via mouse wheel
        this.orbitYaw = 0;
        this.orbitPitch = 0;
        this._isDragging = false;
        this._dragMoved = false;
        this._lastMouseX = 0;
        this._lastMouseY = 0;

        const canvas = this.renderer.domElement;
        canvas.addEventListener('mousedown', (e) => {
            // Don't start drag on UI elements
            if (e.target.closest('#top-menu') || e.target.closest('.modal') ||
                e.target.closest('#joystick-container') || e.target.closest('#jump-btn')) return;
            this._isDragging = true;
            this._dragMoved = false;
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this._isDragging) return;
            const dx = e.clientX - this._lastMouseX;
            const dy = e.clientY - this._lastMouseY;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._dragMoved = true;
            const sens = (this.saveData.cameraSensitivity || 1) * 0.005;
            const invert = this.saveData.invertY ? -1 : 1;
            this.orbitYaw -= dx * sens;
            this.orbitPitch -= dy * sens * invert;
            this.orbitPitch = Math.max(-1.2, Math.min(1.2, this.orbitPitch)); // clamp ±70°
            this._lastMouseX = e.clientX;
            this._lastMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            if (this._isDragging && !this._dragMoved) {
                // Short click (not a drag): toggle top menu
                const topMenu = document.getElementById('top-menu');
                const isVisible = topMenu.classList.toggle('visible');
                if (this.menuHideTimeout) clearTimeout(this.menuHideTimeout);
                if (isVisible) {
                    this.menuHideTimeout = setTimeout(() => {
                        topMenu.classList.remove('visible');
                    }, 4000);
                }
            }
            this._isDragging = false;
        });

        // Middle-click to reset orbit camera
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                this.orbitYaw = 0;
                this.orbitPitch = 0;
                this.cameraDistance = 9.43;
                this._isDragging = false;
            }
        });
        // Also reset orbit on 'R' key (when not typing in inputs)
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyR' && document.activeElement === document.body) {
                this.orbitYaw = 0;
                this.orbitPitch = 0;
                this.cameraDistance = 9.43;
            }
        });

        // Mouse wheel zoom: scroll to zoom camera in/out
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSens = 0.005;
            this.cameraDistance += e.deltaY * zoomSens;
            this.cameraDistance = Math.max(4, Math.min(20, this.cameraDistance)); // clamp 4–20
        }, { passive: false });

        // Touch: keep menu toggle for touch taps (not joystick area)
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest('#top-menu') || e.target.closest('.modal')) return;
            if (e.target.closest('#joystick-container') || e.target.closest('#jump-btn')) return;
            const topMenu = document.getElementById('top-menu');
            const isVisible = topMenu.classList.toggle('visible');
            if (this.menuHideTimeout) clearTimeout(this.menuHideTimeout);
            if (isVisible) {
                this.menuHideTimeout = setTimeout(() => {
                    topMenu.classList.remove('visible');
                }, 4000);
            }
        }, { passive: true });
    }



    // --- Procedural Level Generators ---












    jump() {
        if (this.isStartScreenVisible()) return;
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
        // Face Jack along the track direction when not steering.
        // When actively steering, face the velocity direction for natural turning.
        const vel = this.ballBody.velocity;
        const moving = Math.abs(vel.x) > 0.1 || Math.abs(vel.z) > 0.1;
        if (moving) {
            if (Math.abs(this.inputX) < 0.05) {
                // Not steering: face straight along the track
                this.ballMesh.rotation.y = Math.atan2(this.trackForward.x, this.trackForward.z);
            } else {
                // Steering: face the raw velocity direction
                this.ballMesh.rotation.y = Math.atan2(vel.x, vel.z);
            }
        }

        if (this.keys['ArrowUp'] || this.keys['KeyW']) this.inputZ = -1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) this.inputZ = 1;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.inputX = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.inputX = 1;

        // Kick animation: trigger on rising edge of forward press (soccer ball bob)
        // Only fire if the ball is near home to prevent stacking from rapid taps
        const pressingForward = this.inputZ < 0;
        if (pressingForward && !this._wasPressingForward && this.isGrounded && Math.abs(this._kickOffset) < 0.05) {
            this._kickVelocity = -3.0; // push ball forward in local Z (toward -Z)
        }
        this._wasPressingForward = pressingForward;

        this.inputX += this.joystickInput.x;
        this.inputZ -= this.joystickInput.y;

        const airMult = this.isGrounded ? 1.0 : 0.25;
        
        // Side-scrolling: controls are screen-relative
        // Left/Right keys move along X, Up/Down move along -Z/+Z (track direction)
        const forward = new THREE.Vector3(0, 0, this.inputZ).applyQuaternion(this._trackQuat);
        const right = new THREE.Vector3(this.inputX, 0, 0).applyQuaternion(this._trackQuat);

        const combinedMove = forward.add(right);
        const force = new CANNON.Vec3(
            combinedMove.x * BALL_SPEED * airMult, 
            0, 
            combinedMove.z * BALL_SPEED * airMult
        );
        
        this.ballBody.applyForce(force, this.ballBody.position);

        const velocity = this.ballBody.velocity;
        
        // Track-relative lateral stabilization: decompose velocity into along-track
        // and perpendicular components. When not steering, kill lateral drift entirely.
        // When steering, lightly dampen lateral to keep movement tight on both axes.
        if (this.isGrounded) {
            const v = this.ballBody.velocity;
            const along = v.x * this.trackForward.x + v.z * this.trackForward.z;
            const perp = v.x * (-this.trackForward.z) + v.z * this.trackForward.x;
            const perpDamp = (Math.abs(this.inputX) < 0.05) ? 0 : 0.95;
            this.ballBody.velocity.x = along * this.trackForward.x + perp * perpDamp * (-this.trackForward.z);
            this.ballBody.velocity.z = along * this.trackForward.z + perp * perpDamp * this.trackForward.x;
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
            const localOff = Math.sin(angle) * 6;
            const px = p.pivot.x + localOff * Math.cos(this.trackAngle);
            const pz = p.pivot.z - localOff * Math.sin(this.trackAngle);
            const py = p.pivot.y - Math.cos(angle) * 6;
            p.body.position.set(px, py, pz);
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
            const cosT = Math.cos(this.trackAngle);
            const sinT = Math.sin(this.trackAngle);
            if (m.type === 'hammer') {
                const lo = Math.sin(t * 3) * 5;
                m.body.position.set(m.basePos.x + lo * cosT, m.basePos.y, m.basePos.z - lo * sinT);
            } else if (m.type === 'slide') {
                const lo = Math.sin(t * 2) * 3;
                m.body.position.set(m.basePos.x + lo * cosT, m.basePos.y, m.basePos.z - lo * sinT);
            } else if (m.type === 'side') {
                const lo = Math.sin(t * 2.5) * 2 * (m.basePos.x > 0 ? 1 : -1);
                m.body.position.set(m.basePos.x + lo * cosT, m.basePos.y, m.basePos.z - lo * sinT);
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
                this.saveData.lifetimeCoins += val;
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

        // Pre-death coin risk warning: show when falling with coins at stake
        if (this._coinRiskWarning && !this.isGameOver) {
            if (this.ballBody.position.y < -3 && this.score > 0) {
                this._coinRiskWarning.classList.add('visible');
            } else {
                this._coinRiskWarning.classList.remove('visible');
            }
        }

        if (this.ballBody.position.y < -10 && !this.isGameOver) this.gameOver(false);

        // Project ball position onto track direction for progress/distance checks
        const ballProj = this.ballBody.position.x * this.trackForward.x + this.ballBody.position.z * this.trackForward.z;
        const finishProj = this.finishX * this.trackForward.x + this.finishZ * this.trackForward.z;
        if (ballProj > finishProj && !this.isGameOver) this.gameOver(true);

        // Check for checkpoints using track-direction projection
        this.checkpoints.forEach(cp => {
            if (!cp.reached) {
                const cpProj = cp.pos.x * this.trackForward.x + cp.pos.z * this.trackForward.z;
                if (ballProj > cpProj) {
                    cp.reached = true;
                    this.lastCheckpointPos.copy(cp.pos);
                    this.playSound('coin_collect');
                }
            }
        });

        const progress = Math.min(100, Math.max(0, Math.floor((ballProj / this.levelLength) * 100)));
        document.getElementById('distance-display').innerText = `Distance: ${progress}%`;

        // Update visual progress bar
        const progBar = document.getElementById('progress-bar-fill');
        if (progBar) {
            progBar.style.width = progress + '%';
        }
    }

    gameOver(win) {
        this.isGameOver = true;
        this.isWin = win;
        // Ensure coin risk warning is hidden when death occurs
        if (this._coinRiskWarning) this._coinRiskWarning.classList.remove('visible');
        if (win) {
            this.playSound('finish_line');
            this._showCelebration();
        } else {
            const overlay = document.getElementById('overlay');
            const title = document.getElementById('overlay-title');
            const btn = document.getElementById('next-btn');
            overlay.style.display = 'flex';
            title.innerText = "CRASHED!";
            btn.innerText = "TRY AGAIN";
            this.playSound('fall_off');

            // Track death stat
            this.saveData.deaths++;

            // Lose session-collected coins (they were already added to wallet at collection time).
            // Subtract the current run score from totalCoins to "drop" them; clamp at zero.
            const lost = Math.min(this.saveData.totalCoins, this.score);
            if (lost > 0) {
                // visual origin for explosion: slightly above the ball
                const origin = new THREE.Vector3().copy(this.ballMesh.position).add(new THREE.Vector3(0, 1, 0));
                this.spawnCoinExplosion(origin, this.score || lost, 'loss');

                // remove lost coins from wallet
                this.saveData.totalCoins = Math.max(0, this.saveData.totalCoins - lost);
                this.save();
                this.updateWalletUI();
            }
        }
    }

    _showCelebration() {
        const overlay = document.getElementById('celebration-overlay');

        // Update best level stat
        if (this.currentLevel > this.saveData.bestLevel) {
            this.saveData.bestLevel = this.currentLevel;
            this.save();
        }

        // Compute stats
        const elapsed = this.levelStartTime ? (performance.now() - this.levelStartTime) / 1000 : 0;
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        // Use track-direction projection (matches HUD calculation)
        const ballProj = this.ballBody.position.x * this.trackForward.x + this.ballBody.position.z * this.trackForward.z;
        const progress = Math.min(100, Math.max(0, Math.floor((ballProj / Math.max(1, this.levelLength)) * 100)));

        document.getElementById('celebration-level').textContent = this.currentLevel;
        document.getElementById('celebration-coins').textContent = this.score;
        document.getElementById('celebration-time').textContent = mins + ':' + String(secs).padStart(2, '0');
        document.getElementById('celebration-distance').textContent = progress + '%';

        overlay.classList.add('visible');

        // Auto-advance after 2.5 seconds
        this._celebrationTimeout = setTimeout(() => this._dismissCelebration(), 2500);

        // Skip on click or keypress
        const skip = () => this._dismissCelebration();
        this._celebrationSkip = skip;
        overlay.addEventListener('click', skip, { once: true });
        window.addEventListener('keydown', skip, { once: true });
    }

    _dismissCelebration() {
        if (this._celebrationTimeout) {
            clearTimeout(this._celebrationTimeout);
            this._celebrationTimeout = null;
        }
        const overlay = document.getElementById('celebration-overlay');
        overlay.classList.remove('visible');
        // Remove skip listeners
        if (this._celebrationSkip) {
            overlay.removeEventListener('click', this._celebrationSkip);
            window.removeEventListener('keydown', this._celebrationSkip);
            this._celebrationSkip = null;
        }
        this.reset();
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
        this.isPaused = false;
        // Reset kick animation state
        this._kickOffset = 0;
        this._kickVelocity = 0;
        this._wasPressingForward = false;
        document.getElementById('pause-overlay').classList.remove('visible');
        this.score = 0;
        document.getElementById('coin-display').innerText = `Session: 0`;
        document.getElementById('overlay').style.display = 'none';
        // Reset progress bar
        const progBar = document.getElementById('progress-bar-fill');
        if (progBar) progBar.style.width = '0%';
        this.coins.forEach(c => c.visible = true);
    }


    // --- Builder: simple track editor (store as array of segments with type and params) ---




    // --- Live in-world scene builder: overhead camera, grid, cursor and simple controls ---




    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    togglePause() {
        if (this.isGameOver) return;
        if (this.isStartScreenVisible()) return;
        this.isPaused = !this.isPaused;
        const pauseOverlay = document.getElementById('pause-overlay');
        if (this.isPaused) {
            pauseOverlay.classList.add('visible');
        } else {
            pauseOverlay.classList.remove('visible');
        }
    }

    isStartScreenVisible() {
        return this._startScreen && !this._startScreen.classList.contains('hidden');
    }

    toggleMute() {
        this.audioMuted = !this.audioMuted;
        localStorage.setItem('gb_audioMuted', this.audioMuted);
        this._syncMuteButton();
        showToast(this.audioMuted ? 'Audio muted' : 'Audio on', this.audioMuted ? 'info' : 'success');
    }

    _syncMuteButton() {
        const btn = document.getElementById('mute-btn');
        if (!btn) return;
        if (this.audioMuted) {
            btn.textContent = '🔇';
            btn.classList.add('muted');
        } else {
            btn.textContent = '🔊';
            btn.classList.remove('muted');
        }
    }

    setBuilderActive(active) {
        document.body.classList.toggle('builder-active', active);
    }

    showTutorial() {
        const overlay = document.getElementById('tutorial-overlay');
        if (!overlay) return;
        overlay.classList.add('visible');
        // Pause game while tutorial is shown
        this.isPaused = true;

        const dismissBtn = document.getElementById('tutorial-dismiss-btn');
        const escHandler = (e) => {
            if (e.code === 'Escape') {
                e.stopImmediatePropagation();
                dismiss();
            }
        };
        const dismiss = () => {
            window.removeEventListener('keydown', escHandler);
            overlay.classList.remove('visible');
            this.saveData.tutorialSeen = true;
            this.save();
            this.isPaused = false;
        };
        if (dismissBtn) dismissBtn.addEventListener('click', dismiss, { once: true });
        window.addEventListener('keydown', escHandler);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        // Skip physics/rendering when the studio overlay is open
        if (typeof isStudioActive === 'function' && isStudioActive()) return;
        // Skip physics/rendering when paused
        if (this.isPaused) return;
        if (!this.isGameOver) {
            this.updatePhysics();
            this.checkGameState();
        }

        // Orbit camera: default behind Jack, rotatable via mouse drag
        const dist = this.cameraDistance; // zoomable via mouse wheel
        const basePhi = 0.56; // atan2(5, 8) ≈ 32° base elevation
        const phi = basePhi + this.orbitPitch;
        const yaw = this.orbitYaw;

        // Spherical → local offset (behind = +Z in track-local, before rotation)
        const localOffset = new THREE.Vector3(
            dist * Math.cos(phi) * Math.sin(yaw),
            dist * Math.sin(phi),
            dist * Math.cos(phi) * Math.cos(yaw)
        );
        localOffset.applyQuaternion(this._trackQuat);

        const targetCamPos = new THREE.Vector3().copy(this.ballMesh.position).add(localOffset);
        this.camera.position.lerp(targetCamPos, 0.08);
        // Look above Jack's head so the player can see the track ahead
        this.camera.lookAt(
            this.ballMesh.position.x,
            this.ballMesh.position.y + 3.0,
            this.ballMesh.position.z
        );

        // Throttle GIF texture updates to ~20fps (browser decodes new GIF frames every ~50ms)
        if (this.gifTexture) {
            const now = performance.now();
            if (now - this._lastGifUpdate > 50) {
                this.gifTexture.needsUpdate = true;
                this._lastGifUpdate = now;
            }
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

        // Kick animation: spring physics for soccer ball bob
        if (Math.abs(this._kickOffset) > 0.001 || Math.abs(this._kickVelocity) > 0.01) {
            const springForce = -this._kickOffset * 20;  // spring toward home (z=0)
            const damping = 8;                            // smooth out oscillation
            this._kickVelocity += springForce * wolfDelta;
            this._kickVelocity *= Math.max(0, 1 - damping * wolfDelta);
            this._kickOffset += this._kickVelocity * wolfDelta;
            // Clamp to prevent extreme values
            this._kickOffset = Math.max(-0.5, Math.min(0.1, this._kickOffset));
            if (this._soccerBall) {
                this._soccerBall.position.z = this._kickOffset;
            }
        }

        // Accumulate play time stat (save every ~5s to avoid excessive localStorage writes)
        if (!this.isGameOver && !this.isPaused) {
            this.saveData.totalPlayTime += wolfDelta;
            this._statsSaveTimer = (this._statsSaveTimer || 0) + wolfDelta;
            if (this._statsSaveTimer > 5) {
                this._statsSaveTimer = 0;
                this.save();
            }
        }

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
                        this.ballMesh.position.y - 0.45,
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

/**
 * Render lifetime stats into the stats modal.
 */
function _renderStats(game) {
    const el = document.getElementById('stats-content');
    if (!el) return;
    const d = game.saveData;
    const playSecs = Math.floor(d.totalPlayTime || 0);
    const hrs = Math.floor(playSecs / 3600);
    const mins = Math.floor((playSecs % 3600) / 60);
    const secs = playSecs % 60;
    const timeStr = hrs > 0
        ? hrs + 'h ' + mins + 'm'
        : mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';

    el.innerHTML = `
        <div class="stats-row">
            <span class="stats-label">🏆 Best Level</span>
            <span class="stats-value">${d.bestLevel || 1}</span>
        </div>
        <div class="stats-row">
            <span class="stats-label">🪙 Lifetime Coins Earned</span>
            <span class="stats-value">${(d.lifetimeCoins || 0).toLocaleString()}</span>
        </div>
        <div class="stats-row">
            <span class="stats-label">⏱ Total Play Time</span>
            <span class="stats-value">${timeStr}</span>
        </div>
        <div class="stats-row">
            <span class="stats-label">💀 Deaths</span>
            <span class="stats-value">${(d.deaths || 0).toLocaleString()}</span>
        </div>
    `;
}

new Game();