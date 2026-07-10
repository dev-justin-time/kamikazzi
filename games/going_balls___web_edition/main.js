import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import nipplejs from 'nipplejs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
            rainbow: { name: 'Rainbow', price: 0, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture' },
            gifskin: { name: 'Animated', price: 900, tex: 'IMG_0300.gif', type: 'gif' },
            wood: { name: 'Wood', price: 50, tex: 'wood_texture.png', type: 'texture' },
            metal: { name: 'Chrome', price: 150, tex: 'ball_metal.png', type: 'texture' },
            lava: { name: 'Lava', price: 300, tex: 'ball_lava.png', type: 'texture' },
            mint: { name: 'Mint', price: 200, type: 'color', color: 0x7fffd4, shininess: 60 },

            // Glass-style "image inside sphere" skins (premium)
            glass_fire:   { name: 'Glass — Flame', price: 5000, tex: 'fire.webp', type: 'glass' },
            glass_demon:  { name: 'Glass — Red Demon', price: 5500, tex: 'A-60_gif.webp', type: 'glass' },
            glass_load:   { name: 'Glass — Loading', price: 6000, tex: 'windows-loandig-cargando.gif', type: 'glass' },
            glass_sack:   { name: 'Glass — Full Sack', price: 7000, tex: 'sack.webp', type: 'glass' },
            glass_star:   { name: 'Glass — Spinning Star', price: 8000, tex: 'Spinningstar.gif', type: 'glass' },
            glass_sonic:  { name: 'Glass — Sonic', price: 9000, tex: 'sonicwalk.gif', type: 'glass' },

            // New premium glass balls (10000+)
            glass_windows95: { name: 'Glass — Win95 Kawaii', price: 10000, tex: 'windows95kwaii.gif', type: 'glass' },
            glass_img0038:   { name: 'Glass — IMG_0038', price: 10500, tex: 'IMG_0038.gif', type: 'glass' },
            glass_jfreddy:   { name: 'Glass — JFreddy Power', price: 11000, tex: 'Jfreddypower.gif', type: 'glass' },
            glass_lays:      { name: 'Glass — Lays Logo', price: 11500, tex: 'Lays_brand_logo.png', type: 'glass' },
            glass_portal:    { name: 'Glass — Portal', price: 12000, tex: 'portal.gif', type: 'glass' },
            glass_baldi:     { name: 'Glass — Baldi Dance', price: 12500, tex: 'BaldiDanceV2.gif', type: 'glass' },
            glass_dancing:   { name: 'Glass — Dancing Groovy', price: 13000, tex: 'dancing-groovy.webp', type: 'glass' },
            glass_epicface:  { name: 'Glass — Epic Face Spin', price: 13500, tex: 'epicfacespin (2).gif', type: 'glass' }
        };

        this.skyConfigs = {
            day: { name: 'Blue Sky', price: 0, tex: 'sky_day.png', color: 0x87ceeb },
            sunset: { name: 'Sunset', price: 100, tex: 'sky_sunset.png', color: 0xff7f50 },
            night: { name: 'Midnight', price: 250, tex: 'sky_night.png', color: 0x0a0a2a },
            void: { name: 'Cosmic', price: 500, tex: 'sky_void.png', color: 0x000000 }
        };
    }

    save() {
        localStorage.setItem('goingBallsData_v1', JSON.stringify(this.saveData));
    }

    initAudio() {
        this.rollSound = new Audio('rolling_loop.mp3');
        this.rollSound.loop = true;
        this.rollSound.volume = 0;
        this.rollSoundStarted = false;

        // Resume audio context on first interaction
        const resumeAudio = () => {
            if (!this.rollSoundStarted) {
                this.rollSound.play().catch(() => {});
                this.rollSoundStarted = true;
            }
            window.removeEventListener('keydown', resumeAudio);
            window.removeEventListener('mousedown', resumeAudio);
            window.removeEventListener('touchstart', resumeAudio);
        };
        window.addEventListener('keydown', resumeAudio);
        window.addEventListener('mousedown', resumeAudio);
        window.addEventListener('touchstart', resumeAudio);
    }

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
        this.gltfLoader.load(
            '.glb',
            (gltf) => {
                this.finishModel = gltf.scene;
                this.placeFinishModel();
            },
            undefined,
            (err) => {
                console.warn('GLTF load failed for .glb:', err);
                // no model available — continue gracefully
                this.finishModel = null;
            }
        );

        // static textures (with error fallbacks)
        this.ballTexture = this.textureLoader.load(
            'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png',
            (tex) => {},
            undefined,
            (err) => { console.warn('Ball texture load failed:', err); }
        );
        this.woodTexture = this.textureLoader.load(
            'wood_texture.png',
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
        this.gifImage.src = 'IMG_0300.gif';
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
        this.ballBody.position.set(0, 1, 0); // Lowered spawn to prevent bouncing on start
        this.world.addBody(this.ballBody);

        const sphereGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);
        this.ballMesh = new THREE.Mesh(sphereGeo, this.getBallMaterial());
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);

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

        // Pointer Lock and Camera Controls
        this.cameraYaw = 0;
        this.cameraPitch = 0.4;
        this.cameraDistance = 8;

        document.addEventListener('mousemove', (e) => {
            // Allow rotation if cursor is locked OR if left mouse button is held
            if (document.pointerLockElement === document.body || (e.buttons & 1)) {
                // Filter out large erratic movements and ignore tiny jitter
                const mx = Math.abs(e.movementX) > 150 ? 0 : e.movementX;
                const my = Math.abs(e.movementY) > 150 ? 0 : e.movementY;
                
                if (Math.abs(mx) > 0.1 || Math.abs(my) > 0.1) {
                    this.cameraYaw -= mx * 0.0025;
                    this.cameraPitch = Math.max(0.1, Math.min(1.4, this.cameraPitch + my * 0.0025));
                }
            }
        });

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

    clearLevel() {
        this.levelObjects.forEach(obj => {
            if (obj.body) this.world.removeBody(obj.body);
            if (obj.mesh) this.scene.remove(obj.mesh);
        });
        this.coins.forEach(coin => this.scene.remove(coin));
        this.pendulums.forEach(p => {
            if (p.body) this.world.removeBody(p.body);
            this.scene.remove(p.mesh);
            if (p.line) this.scene.remove(p.line);
        });
        this.spinners.forEach(s => {
            if (s.body) this.world.removeBody(s.body);
            this.scene.remove(s.mesh);
        });
        this.movers.forEach(m => {
            if (m.body) this.world.removeBody(m.body);
            this.scene.remove(m.mesh);
        });
        this.checkpoints = [];
        this.levelObjects = [];
        this.coins = [];
        this.pendulums = [];
        this.spinners = [];
        this.movers = [];
    }

    placeFinishModel() {
        if (!this.finishModel || this.finishZ === undefined) return;
        const model = this.finishModel.clone();
        model.position.set(this.finishX || 0, (this.finishY || 0), this.finishZ);
        model.scale.set(0.1, 0.1, 0.1);
        // Apply a "downwards right" tilted rotation
        model.rotation.set(Math.PI / 2, 0, -Math.PI / 4);
        this.scene.add(model);
        this.levelObjects.push({ mesh: model });
    }

    // --- Procedural Level Generators ---
    getBallMaterial() {
        const conf = this.ballConfigs[this.saveData.selectedBall] || this.ballConfigs.rainbow;

        // GIF animated skin: use the Image-based texture (browser advances GIF frames)
        if (conf.type === 'gif') {
            if (this.gifTexture) {
                return new THREE.MeshBasicMaterial({
                    map: this.gifTexture,
                });
            }
            return new THREE.MeshBasicMaterial({ color: 0xffffff });
        }

        // Regular static textures
        if (conf.type === 'texture') {
            const tex = this.textureLoader.load(conf.tex);
            return new THREE.MeshPhongMaterial({ map: tex });
        } else if (conf.type === 'color') {
            return new THREE.MeshPhongMaterial({ color: conf.color, shininess: conf.shininess });
        } else if (conf.type === 'emissive') {
            return new THREE.MeshPhongMaterial({ color: conf.color, emissive: conf.emissive });
        }

        // "Glass" materials: simulate an inner 2D image seen through a glossy/transmissive sphere.
        if (conf.type === 'glass') {
            // load the inner image as a texture
            const innerTex = this.textureLoader.load(conf.tex);
            innerTex.encoding = THREE.sRGBEncoding;

            // base layer: slightly glossy reflective outer shell
            const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                metalness: 0.0,
                roughness: 0.15,
                transmission: 0.9,      // glass-like transparency
                thickness: 0.6,
                envMapIntensity: 0.7,
                clearcoat: 0.4,
                clearcoatRoughness: 0.05,
                reflectivity: 0.6,
                transparent: true,
                side: THREE.FrontSide
            });

            // inner decal: rendered by using a second material that maps the image and is slightly emissive
            // We'll create a MultiMaterial-style Mesh with same geometry when applying; since Ball uses a single mesh,
            // return a special object describing both materials and let caller handle assignment:
            // To keep compatibility, create a Shader-like approach by combining map into a standard material with slight emissive.
            const innerMat = new THREE.MeshBasicMaterial({
                map: innerTex,
                transparent: true,
                depthWrite: false,
                toneMapped: false
            });

            // To approximate "image inside glass" with a single mesh, create a grouped material using MeshPhysical for lighting
            // but mix in the inner texture as an emissiveMap to make it visible under glass.
            const combined = new THREE.MeshPhysicalMaterial({
                map: innerTex,
                emissiveMap: innerTex,
                emissiveIntensity: 0.08,
                color: 0xffffff,
                metalness: 0.0,
                roughness: 0.3,
                transmission: 0.85,
                thickness: 0.5,
                clearcoat: 0.4,
                clearcoatRoughness: 0.05,
                envMapIntensity: 0.6,
                reflectivity: 0.6,
                transparent: true
            });

            return combined;
        }

        return new THREE.MeshPhongMaterial({ color: 0xffffff });
    }

    createLevel() {
        this.clearLevel();
        this.lastCheckpointPos.set(0, 5, 0);
        
        let currentZ = 0;
        let currentX = 0;
        let currentY = 0;

        // Start platform
        this.addPlatform(0, 0, 0, 8, 15);
        currentZ -= 7.5;

        const currentSky = this.skyConfigs[this.saveData.selectedSky] || this.skyConfigs.day;

        // Massive variety of segment types for "infinite" combinations
        const segmentTypes = [
            'straight', 'ramp', 'narrow', 'pendulum', 'zigzag', 'gap', 
            'bumpy', 'spinner', 'thin_bridge', 'stairs', 'tunnel', 
            'archipelago', 'sloped_turn', 'speed_boost', 'checkerboard',
            'hammer_gauntlet', 'moving_rects', 'speed_strip', 'halfpipe',
            'funnel', 'spiral_staircase', 'side_crusher',
            'jump_gap', 'double_jump_gap', 'triple_jump_gap', 'climb'
        ];

        // Difficulty Chart logic
        const difficultyTiers = [
            { level: 1, color: 0x7cfc00, label: "EASY", types: ['straight', 'ramp', 'tunnel', 'speed_strip', 'jump_gap'] },
            { level: 4, color: 0x32cd32, label: "NORMAL", types: ['straight', 'ramp', 'tunnel', 'zigzag', 'bumpy', 'jump_gap', 'climb'] },
            { level: 7, color: 0x1e90ff, label: "CHALLENGING", types: ['zigzag', 'gap', 'archipelago', 'spinner', 'double_jump_gap', 'climb'] },
            { level: 10, color: 0xffff00, label: "HARD", types: ['gap', 'spinner', 'pendulum', 'stairs', 'halfpipe', 'double_jump_gap'] },
            { level: 13, color: 0xffa500, label: "TOUGH", types: ['pendulum', 'hammer_gauntlet', 'moving_rects', 'checkerboard', 'triple_jump_gap'] },
            { level: 16, color: 0xff4500, label: "EXPERT", types: ['hammer_gauntlet', 'side_crusher', 'narrow', 'moving_rects', 'triple_jump_gap'] },
            { level: 19, color: 0x8b0000, label: "EXTREME", types: ['narrow', 'side_crusher', 'checkerboard', 'archipelago', 'triple_jump_gap'] },
            { level: 22, color: 0x4b0082, label: "INSANE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap'] },
            { level: 25, color: 0x000000, label: "IMPOSSIBLE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap'] }
        ];

        let tier = difficultyTiers[0];
        for (let t of difficultyTiers) {
            if (this.currentLevel >= t.level) tier = t;
        }

        // Apply tier visual (fog matches difficulty tier, background stays as selected sky)
        const selectedSky = this.skyConfigs[this.saveData.selectedSky] || this.skyConfigs.day;
        if (selectedSky.tex) {
            this.textureLoader.load(
                selectedSky.tex,
                (tex) => {
                    tex.mapping = THREE.EquirectangularReflectionMapping;
                    this.scene.background = tex;
                },
                undefined,
                (err) => {
                    console.warn('Selected sky texture failed:', selectedSky.tex, err);
                    this.scene.background = new THREE.Color(tier.color || 0x000000);
                }
            );
        } else {
            this.scene.background = new THREE.Color(tier.color);
        }
        
        if (this.scene.fog) {
            this.scene.fog.color.setHex(tier.color);
        }
        document.body.style.backgroundColor = `#${tier.color.toString(16).padStart(6, '0')}`;

        // Level scaling
        const numSegments = 15 + Math.floor(this.currentLevel * 2.5);
        const checkpointInterval = Math.floor(numSegments / 3);
        const baseWidth = Math.max(0.7, 7 - (this.currentLevel * 0.3));
        const hazardSpeedMult = 1 + (this.currentLevel * 0.15);
        
        for (let i = 0; i < numSegments; i++) {
            // Add checkpoint every few segments
            if (i > 0 && i % checkpointInterval === 0) {
                this.addCheckpoint(currentX, currentY, currentZ, baseWidth);
                currentZ -= 4;
            }

            const type = tier.types[Math.floor(Math.random() * tier.types.length)];
            
            // Each case is a "sub-generator"
            switch(type) {
                case 'straight': {
                    const len = 15 + Math.random() * 20;
                    this.addPlatform(currentX, currentY, currentZ - len/2, baseWidth, len);
                    this.addCoins(currentX, currentY + 1, currentZ, len, 3);
                    currentZ -= len;
                    break;
                }
                case 'ramp': {
                    const rampH = 4 + Math.random() * 4;
                    const rampL = 15 + Math.random() * 10;
                    this.addRamp(currentX, currentY, currentZ, baseWidth + 1, rampL, rampH);
                    currentZ -= rampL;
                    currentY += rampH;
                    break;
                }
                case 'narrow': {
                    const len = 20;
                    this.addPlatform(currentX, currentY, currentZ - len/2, baseWidth * 0.4, len);
                    this.addCoins(currentX, currentY + 1.2, currentZ, len, 4);
                    currentZ -= len;
                    break;
                }
                case 'pendulum': {
                    this.addPlatform(currentX, currentY, currentZ - 10, baseWidth + 3, 20);
                    this.addPendulum(currentX, currentY, currentZ - 10, hazardSpeedMult);
                    currentZ -= 20;
                    break;
                }
                case 'zigzag': {
                    const zzLen = 12;
                    const offset = 4;
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    this.addPlatform(currentX, currentY, currentZ - zzLen/2, baseWidth, zzLen);
                    currentZ -= zzLen;
                    currentX += offset * dir;
                    this.addPlatform(currentX, currentY, currentZ - zzLen/2, baseWidth, zzLen);
                    currentZ -= zzLen;
                    break;
                }
                case 'gap': {
                    const gapSize = 5 + Math.random() * 3;
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= (10 + gapSize);
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'bumpy': {
                    for(let b=0; b<6; b++) {
                        const bH = Math.random() * 0.7;
                        this.addPlatform(currentX, currentY + bH, currentZ - 3, baseWidth + 1.5, 6);
                        currentZ -= 6;
                    }
                    break;
                }
                case 'spinner': {
                    this.addPlatform(currentX, currentY, currentZ - 12, baseWidth + 4, 24);
                    this.addSpinner(currentX, currentY + 0.5, currentZ - 12, hazardSpeedMult);
                    currentZ -= 24;
                    break;
                }
                case 'stairs': {
                    const stepCount = 5;
                    const stepLen = 4;
                    const stepH = 0.8;
                    for(let s=0; s<stepCount; s++) {
                        this.addPlatform(currentX, currentY, currentZ - stepLen/2, baseWidth + 2, stepLen);
                        currentZ -= stepLen;
                        currentY += stepH;
                    }
                    break;
                }
                case 'tunnel': {
                    const tLen = 30;
                    this.addPlatform(currentX, currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                    this.addTunnelWalls(currentX, currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                    currentZ -= tLen;
                    break;
                }
                case 'archipelago': {
                    const count = 5;
                    const dist = 8;
                    for(let a=0; a<count; a++) {
                        const offX = (Math.random() - 0.5) * 6;
                        this.addPlatform(currentX + offX, currentY, currentZ - dist/2, 3, 3);
                        this.addCoins(currentX + offX, currentY + 1, currentZ - dist/2, 1, 1);
                        currentZ -= dist;
                    }
                    break;
                }
                case 'checkerboard': {
                    const rows = 4;
                    const cSize = 3;
                    for(let r=0; r<rows; r++) {
                        const offX = (r % 2 === 0) ? -2 : 2;
                        this.addPlatform(currentX + currentX + offX, currentY, currentZ - cSize/2, cSize, cSize);
                        currentZ -= cSize + 2;
                    }
                    break;
                }
                case 'hammer_gauntlet': {
                    this.addPlatform(currentX, currentY, currentZ - 15, baseWidth + 4, 30);
                    for(let h=0; h<3; h++) {
                        this.addHammer(currentX, currentY, currentZ - 8 - h*8, hazardSpeedMult);
                    }
                    currentZ -= 30;
                    break;
                }
                case 'moving_rects': {
                    const len = 25;
                    this.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 2, len);
                    for(let m=0; m<4; m++) {
                        this.addMover(currentX, currentY + 0.5, currentZ - 5 - m*5, 3, 1, 2, false, hazardSpeedMult);
                    }
                    currentZ -= len;
                    break;
                }
                case 'speed_strip': {
                    const len = 20;
                    this.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 1, len, 0xffff00);
                    currentZ -= len;
                    break;
                }
                case 'halfpipe': {
                    const len = 20;
                    this.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 6, len);
                    // Sidewalls as ramps
                    this.addRamp(currentX - (baseWidth/2 + 3), currentY + 1.5, currentZ, 1, len, 0); // Flat visual but physics box...
                    // Better to just add static tilted boxes
                    this.addWall(currentX - baseWidth/2 - 2, currentY + 1, currentZ - len/2, 1, len, Math.PI/4);
                    this.addWall(currentX + baseWidth/2 + 2, currentY + 1, currentZ - len/2, 1, len, -Math.PI/4);
                    currentZ -= len;
                    break;
                }
                case 'side_crusher': {
                    const len = 15;
                    this.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 2, len);
                    this.addMover(currentX - 3, currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                    this.addMover(currentX + 3, currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                    currentZ -= len;
                    break;
                }
                case 'jump_gap': {
                    const gap = 8; // Reduced gap for lower max speed
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    this.addCoins(currentX, currentY + 2, currentZ - 5 - gap/2, 1, 1);
                    currentZ -= (10 + gap);
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'double_jump_gap': {
                    const gap = 16; // Reduced gap for lower max speed
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    this.addCoins(currentX, currentY + 2.5, currentZ - 5 - gap/3, 1, 1);
                    this.addCoins(currentX, currentY + 4, currentZ - 5 - (2*gap/3), 1, 1);
                    currentZ -= (10 + gap);
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'triple_jump_gap': {
                    const gap = 24; // Reduced gap for lower max speed
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    this.addCoins(currentX, currentY + 2, currentZ - 5 - gap/4, 1, 1);
                    this.addCoins(currentX, currentY + 5, currentZ - 5 - (2*gap/4), 1, 1);
                    this.addCoins(currentX, currentY + 3, currentZ - 5 - (3*gap/4), 1, 1);
                    currentZ -= (10 + gap);
                    this.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'climb': {
                    const stepL = 10;
                    const stepH = 4.5;
                    const stepGap = 6;
                    for(let c=0; c<3; c++) {
                        this.addPlatform(currentX, currentY, currentZ - stepL/2, baseWidth + 3, stepL);
                        this.addCoins(currentX, currentY + 2, currentZ - stepL - stepGap/2, 1, 1);
                        currentZ -= (stepL + stepGap);
                        currentY += stepH;
                    }
                    break;
                }
                default: { // fallback straight
                    this.addPlatform(currentX, currentY, currentZ - 10, baseWidth, 20);
                    currentZ -= 20;
                }
            }
        }

        // Finish line
        const finishLen = 30;
        this.addPlatform(currentX, currentY, currentZ - finishLen/2, 8, finishLen, 0x00ff00);
        this.finishX = currentX;
        this.finishY = currentY;
        this.finishZ = currentZ - finishLen + 10;
        this.placeFinishModel();
        currentZ -= finishLen;

        this.levelLength = Math.abs(currentZ);
    }

    addPlatform(x, y, z, width, length, color = null) {
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, length / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y - 0.5, z);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 1, length);
        const mat = color ? this.sharedMaterials.finish : this.sharedMaterials.wood;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(body.position);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.levelObjects.push({ mesh, body });
    }

    addTunnelWalls(x, y, z, width, length) {
        const wallH = 2;
        const wallW = 0.2;
        
        // Left wall
        const shapeL = new CANNON.Box(new CANNON.Vec3(wallW/2, wallH/2, length/2));
        const bodyL = new CANNON.Body({ mass: 0, shape: shapeL });
        bodyL.position.set(x - width/2 - wallW/2, y + wallH/2, z);
        this.world.addBody(bodyL);

        const geo = new THREE.BoxGeometry(wallW, wallH, length);
        const meshL = new THREE.Mesh(geo, this.sharedMaterials.wall);
        meshL.position.copy(bodyL.position);
        this.scene.add(meshL);

        // Right wall
        const bodyR = new CANNON.Body({ mass: 0, shape: shapeL });
        bodyR.position.set(x + width/2 + wallW/2, y + wallH/2, z);
        this.world.addBody(bodyR);
        const meshR = new THREE.Mesh(geo, this.sharedMaterials.wall);
        meshR.position.copy(bodyR.position);
        this.scene.add(meshR);

        this.levelObjects.push({ mesh: meshL, body: bodyL }, { mesh: meshR, body: bodyR });
    }

    addRamp(x, y, z, width, length, height) {
        const angle = Math.atan2(height, length);
        const rampLen = Math.sqrt(length*length + height*height);
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, rampLen / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        const posZ = z - length/2;
        const posY = y + height/2 - 0.5;
        body.position.set(x, posY, posZ);
        body.quaternion.setFromEuler(angle, 0, 0);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 1, rampLen);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.levelObjects.push({ mesh, body });
    }

    addPendulum(x, y, z, speedMult = 1) {
        const pivotHeight = y + 8;
        const ballSize = 1.6;
        const shape = new CANNON.Sphere(ballSize);
        const body = new CANNON.Body({ mass: 10, shape: shape });
        body.position.set(x, pivotHeight - 5, z);
        this.world.addBody(body);

        const geo = new THREE.SphereGeometry(ballSize, 20, 20);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.pendulum);
        this.scene.add(mesh);

        const linePoints = [new THREE.Vector3(x, pivotHeight, z), new THREE.Vector3(x, pivotHeight - 5, z)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        lineGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
        const line = new THREE.Line(lineGeo, this.sharedMaterials.rope);
        this.scene.add(line);

        this.pendulums.push({ body, mesh, line, pivot: new THREE.Vector3(x, pivotHeight, z), startTime: Math.random() * Math.PI * 2, speedMult });
    }

    addSpinner(x, y, z, speedMult = 1) {
        const w = 10, h = 0.6, d = 1.0;
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y + 0.5, z);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.spinner);
        this.scene.add(mesh);
        this.spinners.push({ body, mesh, speed: (2.5 + Math.random() * 1.5) * speedMult });
    }

    addHammer(x, y, z, speedMult = 1) {
        const hSize = 2;
        const shape = new CANNON.Box(new CANNON.Vec3(hSize, hSize, 0.5));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y + 2, z);
        this.world.addBody(body);
        const geo = new THREE.BoxGeometry(hSize*2, hSize*2, 1);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.pendulum);
        this.scene.add(mesh);
        this.movers.push({ body, mesh, type: 'hammer', basePos: new THREE.Vector3(x, y + 2, z), offset: Math.random() * Math.PI, speedMult });
    }

    addMover(x, y, z, w, h, d, sideways = false, speedMult = 1) {
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y, z);
        this.world.addBody(body);
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.spinner);
        this.scene.add(mesh);
        this.movers.push({ body, mesh, type: sideways ? 'side' : 'slide', basePos: new THREE.Vector3(x, y, z), offset: Math.random() * Math.PI, speedMult });
    }

    addWall(x, y, z, w, l, rotZ) {
        const h = 2;
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, l/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y, z);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotZ);
        this.world.addBody(body);
        const geo = new THREE.BoxGeometry(w, h, l);
        const mesh = new THREE.Mesh(geo, this.sharedMaterials.wall);
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
        this.scene.add(mesh);
        this.levelObjects.push({ body, mesh });
    }

    addCoins(x, y, startZ, length, count) {
        // Create coins with varied sizes, shades and values between 1 and 50.
        const step = length / (count + 1);
        for(let i=1; i<=count; i++) {
            // Determine a value distribution: mix of small (1-5), medium (6-20), large (21-50)
            const r = Math.random();
            let value;
            if (r < 0.5) value = 1 + Math.floor(Math.random() * 5);         // common small coins 1-5
            else if (r < 0.85) value = 6 + Math.floor(Math.random() * 15);  // medium 6-20
            else value = 21 + Math.floor(Math.random() * 30);               // rare big 21-50

            // Map value to visual size and shade
            const scale = THREE.MathUtils.lerp(0.6, 1.4, (value - 1) / 49); // size from 0.6..1.4
            let colorHex = 0xffd700; // gold default
            if (value <= 5) colorHex = 0xcd7f32;       // bronze-ish for small
            else if (value <= 20) colorHex = 0xc0c0c0; // silver-ish for medium
            else colorHex = 0xffd700;                  // gold for large/high value

            // Create geometry with a bit of thickness
            const coinGeo = new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 0.12 * scale, 24);
            const mat = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 80, emissive: 0x000000 });
            const coin = new THREE.Mesh(coinGeo, mat);
            coin.rotation.x = Math.PI / 2;
            // slight random offset so coins aren't perfectly aligned
            const px = x + (Math.random() - 0.5) * Math.min(3, scale * 2);
            const pz = startZ - i * step + (Math.random() - 0.5) * 0.6;
            const py = y + 0.4 + (scale - 1) * 0.5;
            coin.position.set(px, py, pz);

            // store value and a tiny glow intensity for visual variety
            coin.userData = { value: value };
            // subtle pulse via scale baseline stored for later animation if desired
            coin.userData.baseScale = scale;

            this.scene.add(coin);
            this.coins.push(coin);
        }
    }

    addCheckpoint(x, y, z, width) {
        const length = 6;
        // Physical platform (Cyan color for checkpoint)
        this.addPlatform(x, y, z - length/2, width + 2, length, 0x00ffff);
        
        // Logic object
        this.checkpoints.push({
            z: z,
            pos: new CANNON.Vec3(x, y + 2, z - length/2),
            reached: false
        });
    }

    jump() {
        if (this.jumpCount < 3 && !this.isGameOver) {
            this.ballBody.velocity.y = JUMP_FORCE;
            this.jumpCount++;
            this.isGrounded = false;
            this.playSound('jump');
        }
    }

    playSound(name) {
        const audio = new Audio(`${name}.mp3`);
        audio.volume = 0.4;
        audio.play().catch(() => {});
    }

    // Spawn a visual coin-explosion "confetti" effect and animate it (non-physics)
    spawnCoinExplosion(origin, totalValue) {
        // limit number of pieces so it's performant
        const pieces = Math.min(30, Math.max(5, Math.floor(totalValue / 2)));
        if (!this._coinExplosions) this._coinExplosions = [];
        for (let i = 0; i < pieces; i++) {
            const frac = i / Math.max(1, pieces);
            const size = THREE.MathUtils.lerp(0.25, 0.9, Math.random());
            const value = Math.max(1, Math.round(totalValue / pieces));
            const geo = new THREE.CylinderGeometry(0.4 * size, 0.4 * size, 0.08 * size, 16);
            const colorHex = (value > 20) ? 0xffd700 : (value > 6 ? 0xc0c0c0 : 0xcd7f32);
            const mat = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 80 });
            const coin = new THREE.Mesh(geo, mat);
            coin.rotation.x = Math.PI / 2;
            coin.position.copy(origin);
            this.scene.add(coin);

            // random velocity and angular velocity for playful scatter
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                Math.random() * 8 + 4,
                (Math.random() - 0.5) * 8
            );
            const angular = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );

            this._coinExplosions.push({
                mesh: coin,
                velocity: vel,
                angular: angular,
                life: 0,
                maxLife: 3 + Math.random() * 2
            });
        }
    }

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
        }

        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);

        if (this.keys['ArrowUp'] || this.keys['KeyW']) this.inputZ = -1;
        if (this.keys['ArrowDown'] || this.keys['KeyS']) this.inputZ = 1;
        if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.inputX = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.inputX = 1;

        this.inputX += this.joystickInput.x;
        this.inputZ -= this.joystickInput.y;

        // Apply control relative to camera rotation
        const airMult = this.isGrounded ? 1.0 : 0.25;
        
        // Calculate movement direction based on camera yaw
        const forward = new THREE.Vector3(0, 0, this.inputZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        const right = new THREE.Vector3(this.inputX, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        
        // Snap the camera yaw to track alignment when nearly straight to prevent drift
        const normalizedYaw = ((this.cameraYaw % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
        const isAligned = normalizedYaw < 0.3 || normalizedYaw > (Math.PI * 2 - 0.3) || 
                          (normalizedYaw > Math.PI - 0.3 && normalizedYaw < Math.PI + 0.3);
        
        // When mostly aligned and not actively steering, lock movement to the Z-axis
        if (isAligned && Math.abs(this.inputX) < 0.1) {
            forward.x = 0;
            right.x = 0;
            right.z = 0;
        }

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
        
        // Update rolling sound
        if (this.rollSound) {
            if (this.isGrounded && !this.isGameOver && speed > 0.5) {
                const targetVol = Math.min(0.6, speed / MAX_VELOCITY);
                this.rollSound.volume += (targetVol - this.rollSound.volume) * 0.1;
                this.rollSound.playbackRate = 0.5 + (speed / MAX_VELOCITY) * 1.0;
            } else {
                this.rollSound.volume *= 0.9;
            }
        }

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

    updateWalletUI() {
        document.getElementById('total-coins').innerText = `Wallet: ${this.saveData.totalCoins}`;
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
        this.isGameOver = false;
        this.isWin = false;
        this.score = 0;
        document.getElementById('coin-display').innerText = `Coins: 0`;
        document.getElementById('overlay').style.display = 'none';
        this.coins.forEach(c => c.visible = true);
    }

    setupUI() {
        document.getElementById('next-btn').addEventListener('click', () => this.reset());

        const setupModal = (btnId, modalId) => {
            const btn = document.getElementById(btnId);
            const modal = document.getElementById(modalId);
            const close = modal.querySelector('.close-modal');
            btn.addEventListener('click', () => {
                // If opening builder, render builder UI; else render grids
                if (modalId === 'builder-modal') {
                    this.renderBuilder();
                } else {
                    this.renderGrids();
                }
                modal.style.display = 'flex';
                // Ensure pointer lock is released when menu opens
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            });
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.style.display = 'none';
                // clear preview objects when closing builder
                if (modalId === 'builder-modal') this.clearBuilderPreview();
            });
        };

        setupModal('help-btn-open', 'help-modal');
        setupModal('store-btn-open', 'store-modal');
        setupModal('skins-btn-open', 'skins-modal');
        setupModal('skies-btn-open', 'skies-modal');
        setupModal('builder-btn-open', 'builder-modal');
    }

    // --- Builder: simple track editor (store as array of segments with type and params) ---
    renderBuilder() {
        // Prepare builder state
        if (!this.builder) {
            this.builder = {
                segments: [], // each: {type:'platform'|'ramp'|'gap'|'checkpoint'|'finish', len, width, height}
                cursorZ: -5
            };
        }
        // Populate saved list
        const list = document.getElementById('builder-saved-list');
        list.innerHTML = '';
        const saved = JSON.parse(localStorage.getItem('goingBalls_customTracks_v1') || '[]');
        saved.forEach((t, idx) => {
            const btn = document.createElement('button');
            btn.className = 'menu-btn';
            btn.style.padding = '6px 10px';
            btn.innerText = t.name || `Track ${idx+1}`;
            btn.onclick = () => {
                this.builder.segments = JSON.parse(JSON.stringify(t.segments || []));
                this.builder.cursorZ = -5;
                this.clearBuilderPreview();
                this.previewBuilder();
            };
            list.appendChild(btn);
        });

        // Wire up builder controls
        document.getElementById('builder-add-platform').onclick = () => {
            this.builder.segments.push({ type: 'platform', width: 6, len: 12, y: 0 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-ramp').onclick = () => {
            this.builder.segments.push({ type: 'ramp', width: 6, len: 12, height: 3 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-gap').onclick = () => {
            this.builder.segments.push({ type: 'gap', len: 8 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-checkpoint').onclick = () => {
            this.builder.segments.push({ type: 'checkpoint', width: 6, len: 6 });
            this.previewBuilder();
        };
        document.getElementById('builder-set-finish').onclick = () => {
            // ensure only one finish at end
            this.builder.segments = this.builder.segments.filter(s => s.type !== 'finish');
            this.builder.segments.push({ type: 'finish', width: 8, len: 12 });
            this.previewBuilder();
        };

        // New trap/hazard buttons
        document.getElementById('builder-add-spikes').onclick = () => {
            // spikes segment: narrow row of spikes across track
            this.builder.segments.push({ type: 'spikes', width: 6, len: 6, count: 6 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-pendulum').onclick = () => {
            // pendulum hazard that swings across the track
            this.builder.segments.push({ type: 'pendulum', width: 6, len: 12, intensity: 1 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-spinner').onclick = () => {
            // spinner hazard: rotating bar
            this.builder.segments.push({ type: 'spinner', width: 8, len: 12, speedMult: 1 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-crusher').onclick = () => {
            // side crusher: movers that slide inward/outward
            this.builder.segments.push({ type: 'crusher', width: 8, len: 12, force: 1 });
            this.previewBuilder();
        };

        // Scene starter / decorative start area
        document.getElementById('builder-scene-starter').onclick = () => {
            this.builder.segments.unshift({ type: 'scene_starter', width: 10, len: 10 });
            this.previewBuilder();
        };

        // Additional builder tools
        document.getElementById('builder-add-trampoline').onclick = () => {
            this.builder.segments.push({ type: 'trampoline', width: 4, len: 4, bounce: 18 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-coinring').onclick = () => {
            this.builder.segments.push({ type: 'coin_ring', radius: 3, count: 10 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-movingplatform').onclick = () => {
            this.builder.segments.push({ type: 'moving_platform', width: 4, len: 8, travel: 6, axis: 'x' });
            this.previewBuilder();
        };
        document.getElementById('builder-add-spikepit').onclick = () => {
            this.builder.segments.push({ type: 'spike_pit', width: 6, len: 6, depth: 1.2, count: 8 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-seesaw').onclick = () => {
            this.builder.segments.push({ type: 'seesaw', width: 6, len: 8 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-spring').onclick = () => {
            this.builder.segments.push({ type: 'spring_pad', width: 2, len: 2, boost: 22 });
            this.previewBuilder();
        };

        // Stunt section buttons
        document.getElementById('builder-add-stunt-ramp').onclick = () => {
            this.builder.segments.push({ type: 'stunt_ramp', width: 8, len: 18, height: 6 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-stunt-loop').onclick = () => {
            this.builder.segments.push({ type: 'stunt_loop', radius: 4, segments: 16 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-stunt-grind').onclick = () => {
            this.builder.segments.push({ type: 'stunt_grind', width: 0.6, len: 20, height: 1.2 });
            this.previewBuilder();
        };
        document.getElementById('builder-add-stunt-donut').onclick = () => {
            this.builder.segments.push({ type: 'stunt_donut', outer: 6, inner: 3, thickness: 0.8 });
            this.previewBuilder();
        };

        document.getElementById('builder-clear').onclick = () => {
            this.builder.segments = [];
            this.builder.cursorZ = -5;
            this.clearBuilderPreview();
        };
        document.getElementById('builder-preview').onclick = () => {
            this.clearBuilderPreview();
            this.previewBuilder();
        };
        document.getElementById('builder-save').onclick = () => {
            const nameInput = document.getElementById('builder-name').value || 'Custom Track';
            const saved = JSON.parse(localStorage.getItem('goingBalls_customTracks_v1') || '[]');
            saved.push({ name: nameInput, segments: this.builder.segments });
            localStorage.setItem('goingBalls_customTracks_v1', JSON.stringify(saved));
            this.renderBuilder();
        };
        document.getElementById('builder-load').onclick = () => {
            // load first saved (if any) into current level immediately
            const saved = JSON.parse(localStorage.getItem('goingBalls_customTracks_v1') || '[]');
            if (saved.length > 0) {
                this.loadCustomLevel(saved[0]);
                document.getElementById('builder-modal').style.display = 'none';
            }
        };

        // Enter-live scene builder button (places platform segments directly in the world)
        const enterBtn = document.getElementById('builder-enter-scene');
        if (enterBtn) {
            enterBtn.onclick = () => {
                this.enterBuilderScene();
            };
        }
    }

    clearBuilderPreview() {
        if (!this.builderPreview) this.builderPreview = [];
        this.builderPreview.forEach(o => {
            if (o.mesh) this.scene.remove(o.mesh);
        });
        this.builderPreview = [];
    }

    previewBuilder() {
        if (!this.builder) return;
        const startX = 0;
        let curY = 0;
        let curZ = -5;
        this.clearBuilderPreview();
        this.builder.segments.forEach(seg => {
            if (seg.type === 'platform') {
                const geo = new THREE.BoxGeometry(seg.width, 1, seg.len);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
                mesh.position.set(startX, curY - 0.5, curZ - seg.len/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'platform' });
                curZ -= seg.len;
            } else if (seg.type === 'ramp') {
                const geo = new THREE.BoxGeometry(seg.width, 1, Math.sqrt(seg.len*seg.len + (seg.height||3)*(seg.height||3)));
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
                // tilt for visual
                mesh.position.set(startX, curY + (seg.height||3)/2 - 0.5, curZ - seg.len/2);
                mesh.rotation.x = -Math.atan2((seg.height||3), seg.len);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'ramp' });
                curY += (seg.height||3);
                curZ -= seg.len;
            } else if (seg.type === 'gap') {
                // just move cursor forward by gap length
                curZ -= (seg.len || 8);
            } else if (seg.type === 'checkpoint') {
                const geo = new THREE.BoxGeometry((seg.width||6)+2, 1, seg.len||6);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.finish);
                mesh.position.set(startX, curY - 0.5, curZ - (seg.len||6)/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'checkpoint' });
                curZ -= (seg.len || 6);
            } else if (seg.type === 'spikes') {
                // preview spikes as small thin tall boxes across the track
                const count = seg.count || 6;
                const spacing = (seg.width || 6) / count;
                for (let s = 0; s < count; s++) {
                    const spikeGeo = new THREE.ConeGeometry(0.2, 0.8, 6);
                    const spike = new THREE.Mesh(spikeGeo, this.sharedMaterials.hazard);
                    const px = startX - (seg.width||6)/2 + spacing * (s + 0.5);
                    spike.position.set(px, curY + 0.2, curZ - (seg.len||6)/2);
                    spike.rotation.x = Math.PI;
                    this.scene.add(spike);
                    this.builderPreview.push({ mesh: spike, kind: 'spike' });
                }
                curZ -= (seg.len || 6);
            } else if (seg.type === 'pendulum') {
                // preview pendulum as a hanging sphere + line
                const geo = new THREE.SphereGeometry(0.6, 12, 12);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.pendulum);
                mesh.position.set(startX, curY + 4, curZ - (seg.len||12)/2);
                this.scene.add(mesh);
                const points = [ new THREE.Vector3(startX, curY + 6, curZ - (seg.len||12)/2), new THREE.Vector3(startX, curY + 4, curZ - (seg.len||12)/2) ];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(lineGeo, this.sharedMaterials.rope);
                this.scene.add(line);
                this.builderPreview.push({ mesh, line, kind: 'pendulum' });
                curZ -= (seg.len || 12);
            } else if (seg.type === 'spinner') {
                // preview spinner as a rotating bar
                const geo = new THREE.BoxGeometry(6, 0.5, 0.8);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.spinner);
                mesh.position.set(startX, curY + 0.5, curZ - (seg.len||12)/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'spinner' });
                curZ -= (seg.len || 12);
            } else if (seg.type === 'crusher') {
                // preview side crushers as two sliding walls
                const leftGeo = new THREE.BoxGeometry(1, 2, seg.len || 12);
                const left = new THREE.Mesh(leftGeo, this.sharedMaterials.pendulum);
                left.position.set(startX - (seg.width||8)/2 - 0.6, curY + 1, curZ - (seg.len||12)/2);
                const right = left.clone();
                right.position.set(startX + (seg.width||8)/2 + 0.6, curY + 1, curZ - (seg.len||12)/2);
                this.scene.add(left);
                this.scene.add(right);
                this.builderPreview.push({ mesh: left, kind: 'crusher' });
                this.builderPreview.push({ mesh: right, kind: 'crusher' });
                curZ -= (seg.len || 12);
            } else if (seg.type === 'stunt_ramp') {
                // big stunt ramp preview (taller ramp)
                const geo = new THREE.BoxGeometry(seg.width||8, 1, Math.sqrt((seg.len||18)*(seg.len||18) + (seg.height||6)*(seg.height||6)));
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
                mesh.position.set(startX, curY + (seg.height||6)/2 - 0.5, curZ - (seg.len||18)/2);
                mesh.rotation.x = -Math.atan2((seg.height||6), seg.len||18);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'stunt_ramp' });
                curY += (seg.height||6);
                curZ -= (seg.len || 18);
            } else if (seg.type === 'stunt_loop') {
                // loop preview as ring of small platforms
                const segCount = seg.segments || 16;
                const r = seg.radius || 4;
                for (let i=0;i<segCount;i++){
                    const a = (i/segCount)*Math.PI*2;
                    const px = startX + Math.cos(a)*r;
                    const pz = curZ - (seg.radius||4) + Math.sin(a)*r - 2;
                    const geo = new THREE.BoxGeometry(1.2, 0.6, 1.2);
                    const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
                    mesh.position.set(px, curY + Math.sin(a) * (r*0.15) + r*0.2, pz);
                    mesh.rotation.z = Math.cos(a)*0.2;
                    this.scene.add(mesh);
                    this.builderPreview.push({ mesh, kind: 'stunt_loop' });
                }
                curZ -= (seg.radius || 6) * 2;
            } else if (seg.type === 'stunt_grind') {
                // grind rail preview as a thin elevated plank
                const geo = new THREE.BoxGeometry(seg.width||0.6, 0.2, seg.len||20);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.coin);
                mesh.position.set(startX, curY + (seg.height||1.2), curZ - (seg.len||20)/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'stunt_grind' });
                curZ -= (seg.len || 20);
            } else if (seg.type === 'stunt_donut') {
                // donut preview as torus
                const torusGeo = new THREE.TorusGeometry(seg.outer||6, (seg.outer-seg.inner||3)/2 || 1, 16, 64);
                const torus = new THREE.Mesh(torusGeo, this.sharedMaterials.wood);
                torus.position.set(startX, curY + 1.0, curZ - 4);
                torus.rotation.x = Math.PI/2;
                this.scene.add(torus);
                this.builderPreview.push({ mesh: torus, kind: 'stunt_donut' });
                curZ -= 10;
            } else if (seg.type === 'trampoline') {
                const geo = new THREE.CylinderGeometry((seg.width||4)/2, (seg.width||4)/2, 0.6, 16);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.speed);
                mesh.rotation.x = Math.PI / 2;
                mesh.position.set(startX, curY + 0.2, curZ - (seg.len||4)/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'trampoline' });
                curZ -= (seg.len || 4);
            } else if (seg.type === 'coin_ring') {
                const count = seg.count || 8;
                const radius = seg.radius || 3;
                for (let i=0;i<count;i++){
                    const a = (i / count) * Math.PI * 2;
                    const cx = startX + Math.cos(a) * radius;
                    const cz = curZ - 4 + Math.sin(a) * radius;
                    const coinGeo = new THREE.CylinderGeometry(0.3,0.3,0.08,16);
                    const coin = new THREE.Mesh(coinGeo, this.sharedMaterials.coin);
                    coin.rotation.x = Math.PI/2;
                    coin.position.set(cx, curY + 1.2, cz);
                    this.scene.add(coin);
                    this.builderPreview.push({ mesh: coin, kind: 'coin' });
                }
                curZ -= 4;
            } else if (seg.type === 'moving_platform') {
                const geo = new THREE.BoxGeometry(seg.width||4, 1, seg.len||8);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
                mesh.position.set(startX, curY - 0.5, curZ - (seg.len||8)/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'moving_platform' });
                curZ -= (seg.len || 8);
            } else if (seg.type === 'spike_pit') {
                const count = seg.count || 6;
                const spacing = (seg.width || 6) / count;
                for (let s=0; s<count; s++){
                    const px = startX - (seg.width||6)/2 + spacing*(s+0.5);
                    const spikeGeo = new THREE.ConeGeometry(0.25, 0.8, 6);
                    const spike = new THREE.Mesh(spikeGeo, this.sharedMaterials.hazard);
                    spike.position.set(px, curY - 0.2, curZ - (seg.len||6)/2);
                    spike.rotation.x = Math.PI;
                    this.scene.add(spike);
                    this.builderPreview.push({ mesh: spike, kind: 'spike_pit' });
                }
                curZ -= (seg.len || 6);
            } else if (seg.type === 'seesaw') {
                const base = new THREE.BoxGeometry(0.6, 0.6, 1.2);
                const plank = new THREE.BoxGeometry(seg.width||6, 0.3, 1.2);
                const baseMesh = new THREE.Mesh(base, this.sharedMaterials.pendulum);
                baseMesh.position.set(startX, curY + 0.3, curZ - (seg.len||8)/2);
                const plankMesh = new THREE.Mesh(plank, this.sharedMaterials.wood);
                plankMesh.position.set(startX, curY + 0.8, curZ - (seg.len||8)/2);
                this.scene.add(baseMesh); this.scene.add(plankMesh);
                this.builderPreview.push({ mesh: baseMesh, kind: 'seesaw' });
                this.builderPreview.push({ mesh: plankMesh, kind: 'seesaw_plank' });
                curZ -= (seg.len || 8);
            } else if (seg.type === 'spring_pad') {
                const geo = new THREE.CircleGeometry((seg.width||2)/2, 16);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.speed);
                mesh.rotation.x = -Math.PI/2;
                mesh.position.set(startX, curY + 0.01, curZ - (seg.len||2)/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'spring' });
                curZ -= (seg.len || 2);
            } else if (seg.type === 'scene_starter') {
                const geo = new THREE.BoxGeometry(seg.width||10, 1, seg.len||10);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.finish);
                mesh.position.set(startX, curY - 0.5, curZ - (seg.len||10)/2);
                this.scene.add(mesh);
                const bannerGeo = new THREE.PlaneGeometry(4,1);
                const banner = new THREE.Mesh(bannerGeo, this.sharedMaterials.coin);
                banner.position.set(startX, curY + 1.5, curZ - (seg.len||10)/2);
                this.scene.add(banner);
                this.builderPreview.push({ mesh, banner, kind: 'scene_starter' });
                curZ -= (seg.len || 10);
            } else if (seg.type === 'finish') {
                const geo = new THREE.BoxGeometry(seg.width, 1, seg.len);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.finish);
                mesh.position.set(startX, curY - 0.5, curZ - seg.len/2);
                this.scene.add(mesh);
                this.builderPreview.push({ mesh, kind: 'finish' });
                curZ -= seg.len;
            }
        });
    }

    loadCustomLevel(custom) {
        // Clear current level and build from segments
        this.clearLevel();
        this.lastCheckpointPos.set(0, 5, 0);
        let currentZ = 0;
        let currentX = 0;
        let currentY = 0;

        // start platform
        this.addPlatform(0, 0, 0, 8, 15);
        currentZ -= 7.5;

        (custom.segments || []).forEach(seg => {
            switch(seg.type) {
                case 'platform':
                    this.addPlatform(currentX, currentY, currentZ - (seg.len||12)/2, seg.width||6, seg.len||12);
                    currentZ -= (seg.len||12);
                    break;
                case 'ramp':
                    this.addRamp(currentX, currentY, currentZ, seg.width||6, seg.len||12, seg.height||3);
                    currentZ -= seg.len||12;
                    currentY += seg.height||3;
                    break;
                case 'gap':
                    currentZ -= seg.len||8;
                    break;
                case 'checkpoint':
                    this.addCheckpoint(currentX, currentY, currentZ - (seg.len||6)/2, seg.width||6);
                    currentZ -= seg.len||6;
                    break;
                case 'finish':
                    this.addPlatform(currentX, currentY, currentZ - (seg.len||12)/2, seg.width||8, seg.len||12, 0x00ff00);
                    this.finishX = currentX;
                    this.finishY = currentY;
                    this.finishZ = currentZ - (seg.len||12) + 10;
                    this.placeFinishModel();
                    currentZ -= seg.len||12;
                    break;
                case 'spikes':
                    // create a row of thin spike colliders (use thin walls/cones approximated by thin boxes)
                    const spikeCount = seg.count || 6;
                    const spacing = (seg.width || 6) / spikeCount;
                    for (let s=0; s<spikeCount; s++) {
                        const px = currentX - (seg.width||6)/2 + spacing * (s + 0.5);
                        // tall thin box that acts as hazard (player will collide and be knocked)
                        this.addWall(px, currentY + 0.5, currentZ - (seg.len||6)/2, 0.2, seg.len || 6, 0);
                    }
                    currentZ -= (seg.len || 6);
                    break;
                case 'pendulum':
                    // add a pendulum hazard centered in this segment
                    this.addPendulum(currentX, currentY, currentZ - (seg.len||12)/2, seg.intensity || 1);
                    currentZ -= (seg.len || 12);
                    break;
                case 'spinner':
                    // add a spinner hazard
                    this.addSpinner(currentX, currentY + 0.5, currentZ - (seg.len||12)/2, seg.speedMult || 1);
                    currentZ -= (seg.len || 12);
                    break;
                case 'crusher':
                    // add two movers that slide inward/outward as crushers
                    this.addMover(currentX - (seg.width||8)/2 - 1, currentY + 1, currentZ - (seg.len||12)/2, 1.2, 2, seg.len || 12, true, seg.force || 1);
                    this.addMover(currentX + (seg.width||8)/2 + 1, currentY + 1, currentZ - (seg.len||12)/2, 1.2, 2, seg.len || 12, true, seg.force || 1);
                    currentZ -= (seg.len || 12);
                    break;
                case 'stunt_ramp':
                    // create a physical stunt ramp (use addRamp)
                    this.addRamp(currentX, currentY, currentZ, seg.width||8, seg.len||18, seg.height||6);
                    currentZ -= (seg.len || 18);
                    currentY += seg.height || 6;
                    break;
                case 'stunt_loop':
                    // approximate a loop by placing multiple short platforms in a circular arrangement
                    const loopSegs = seg.segments || 16;
                    const loopR = seg.radius || 4;
                    for (let i=0;i<loopSegs;i++){
                        const a = (i/loopSegs)*Math.PI*2;
                        const px = currentX + Math.cos(a)*loopR;
                        const pz = currentZ - loopR + Math.sin(a)*loopR;
                        // small platforms to approximate loop surface
                        this.addPlatform(px, currentY + Math.sin(a)*0.6, pz, 1.2, 1.2);
                    }
                    currentZ -= loopR*2;
                    break;
                case 'stunt_grind':
                    // grind rail as a thin elevated physics platform (narrow long box)
                    this.addPlatform(currentX, currentY + (seg.height||1.2), currentZ - (seg.len||20)/2, seg.width||0.6, seg.len||20);
                    currentZ -= (seg.len || 20);
                    break;
                case 'stunt_donut':
                    // donut approximated by ring of small platforms around center
                    const outer = seg.outer || 6;
                    const inner = seg.inner || 3;
                    const donutSegs = 20;
                    for (let i=0;i<donutSegs;i++){
                        const a = (i/donutSegs)*Math.PI*2;
                        const r = (outer+inner)/2;
                        const px = currentX + Math.cos(a)*r;
                        const pz = currentZ - 4 + Math.sin(a)*r;
                        this.addPlatform(px, currentY + 0.6, pz, 1.0, 1.0);
                    }
                    currentZ -= 10;
                    break;
            }
        });

        // finalize
        this.levelLength = Math.abs(currentZ);
    }

    // --- Live in-world scene builder: overhead camera, grid, cursor and simple controls ---
    enterBuilderScene() {
        if (this.inBuilderScene) return;
        this.inBuilderScene = true;
        // hide UI menus
        document.getElementById('builder-modal').style.display = 'none';
        if (!this.builder) this.builder = { segments: [], cursorZ: -5 };

        // save previous camera state
        this._savedCamera = {
            position: this.camera.position.clone(),
            yaw: this.cameraYaw,
            pitch: this.cameraPitch,
            distance: this.cameraDistance
        };

        // set overhead camera
        this.cameraYaw = 0;
        this.cameraPitch = 1.45; // almost top-down
        this.cameraDistance = 18;

        // create a grid plane for visual placement
        const size = 100;
        if (!this._builderGrid) {
            const grid = new THREE.GridHelper(size, size / 1, 0x444444, 0x222222);
            grid.rotation.x = 0;
            this.scene.add(grid);
            this._builderGrid = grid;
        }

        // create placement cursor (a semi-transparent box)
        if (!this._builderCursor) {
            const geo = new THREE.BoxGeometry(6, 0.6, 6);
            const mat = new THREE.MeshPhongMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, 0.3, this.builder.cursorZ || -5);
            this.scene.add(mesh);
            this._builderCursor = mesh;
            this._builderCursor.userData = { width: 6, len: 6, rotation: 0 };
        }

        // place a small HUD indicator
        if (!this._builderHint) {
            const el = document.createElement('div');
            el.id = 'builder-hint';
            el.style.position = 'absolute';
            el.style.left = '10px';
            el.style.bottom = '10px';
            el.style.padding = '8px 12px';
            el.style.background = 'rgba(0,0,0,0.6)';
            el.style.color = 'white';
            el.style.fontSize = '13px';
            el.style.borderRadius = '8px';
            el.style.zIndex = 2000;
            el.innerText = 'Builder: Arrows move • Q/E rotate • +/- size • P place • Esc exit';
            document.body.appendChild(el);
            this._builderHint = el;
        }

        // Key handlers for builder placement
        this._builderKeyHandler = (e) => {
            if (!this.inBuilderScene) return;
            const step = 0.5;
            if (e.code === 'ArrowUp') {
                this._builderCursor.position.z -= step;
            } else if (e.code === 'ArrowDown') {
                this._builderCursor.position.z += step;
            } else if (e.code === 'ArrowLeft') {
                this._builderCursor.position.x -= step;
            } else if (e.code === 'ArrowRight') {
                this._builderCursor.position.x += step;
            } else if (e.code === 'KeyQ') {
                this._builderCursor.rotation.y += 0.12;
            } else if (e.code === 'KeyE') {
                this._builderCursor.rotation.y -= 0.12;
            } else if (e.code === 'Equal' || e.key === '+') {
                // increase size
                this._builderCursor.scale.x += 0.05;
                this._builderCursor.scale.z += 0.05;
            } else if (e.code === 'Minus' || e.key === '-') {
                // decrease size but clamp
                this._builderCursor.scale.x = Math.max(0.4, this._builderCursor.scale.x - 0.05);
                this._builderCursor.scale.z = Math.max(0.4, this._builderCursor.scale.z - 0.05);
            } else if (e.code === 'KeyP') {
                // Place a platform segment at cursor — push into builder.segments
                const w = Math.round(6 * this._builderCursor.scale.x * 10) / 10;
                const l = Math.round(6 * this._builderCursor.scale.z * 10) / 10;
                const seg = { type: 'platform', width: w, len: l, y: 0, x: this._builderCursor.position.x, z: this._builderCursor.position.z, rotY: this._builderCursor.rotation.y };
                this.builder.segments.push(seg);
                // also create a preview object so the user sees immediate placement
                const geo = new THREE.BoxGeometry(w, 1, l);
                const mesh = new THREE.Mesh(geo, this.sharedMaterials.wood);
                mesh.position.set(seg.x, 0 - 0.5, seg.z);
                mesh.rotation.y = seg.rotY;
                this.scene.add(mesh);
                this.builderPreview = this.builderPreview || [];
                this.builderPreview.push({ mesh, kind: 'platform' });
            } else if (e.code === 'Escape') {
                this.exitBuilderScene();
            }
        };

        window.addEventListener('keydown', this._builderKeyHandler);
    }

    exitBuilderScene() {
        if (!this.inBuilderScene) return;
        this.inBuilderScene = false;
        // restore camera
        if (this._savedCamera) {
            this.cameraYaw = this._savedCamera.yaw;
            this.cameraPitch = this._savedCamera.pitch;
            this.cameraDistance = this._savedCamera.distance;
            this.camera.position.copy(this._savedCamera.position);
            this._savedCamera = null;
        }
        // remove helper objects
        if (this._builderGrid) { this.scene.remove(this._builderGrid); this._builderGrid = null; }
        if (this._builderCursor) { this.scene.remove(this._builderCursor); this._builderCursor = null; }
        if (this._builderHint) { document.body.removeChild(this._builderHint); this._builderHint = null; }
        if (this._builderKeyHandler) { window.removeEventListener('keydown', this._builderKeyHandler); this._builderKeyHandler = null; }

        // update preview in modal / builder UI to reflect placed segments
        this.clearBuilderPreview();
        this.previewBuilder();

        // reopen builder modal so user can save/load or fine-tune
        document.getElementById('builder-modal').style.display = 'flex';
    }

    renderGrids() {
        // Primary skins grid (used by SKINS modal)
        const skinsGrid = document.getElementById('skins-grid');
        if (skinsGrid) {
            skinsGrid.innerHTML = '';
            Object.keys(this.ballConfigs).forEach(key => {
                const conf = this.ballConfigs[key];
                const isUnlocked = this.saveData.unlockedBalls.includes(key);
                const isSelected = this.saveData.selectedBall === key;
                
                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                
                let previewStyle = '';
                if (conf.tex) {
                    previewStyle = `background-image: url(${conf.tex});`;
                } else {
                    const colorHex = `#${conf.color.toString(16).padStart(6, '0')}`;
                    previewStyle = `background-color: ${colorHex};`;
                }

                card.innerHTML = `
                    <div class="item-preview ball-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => this.handlePurchase('ball', key, conf.price);
                skinsGrid.appendChild(card);
            });
        }

        // Primary skies grid (used by SKIES modal)
        const skiesGrid = document.getElementById('skies-grid');
        if (skiesGrid) {
            skiesGrid.innerHTML = '';
            Object.keys(this.skyConfigs).forEach(key => {
                const conf = this.skyConfigs[key];
                const isUnlocked = this.saveData.unlockedSkies.includes(key);
                const isSelected = this.saveData.selectedSky === key;

                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                
                let previewStyle = '';
                if (conf.tex) {
                    previewStyle = `background-image: url(${conf.tex});`;
                } else {
                    const colorHex = `#${conf.color.toString(16).padStart(6, '0')}`;
                    previewStyle = `background-color: ${colorHex};`;
                }

                card.innerHTML = `
                    <div class="item-preview sky-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => this.handlePurchase('sky', key, conf.price);
                skiesGrid.appendChild(card);
            });
        }

        // Store modal grids (combined shop)
        const storeSkins = document.getElementById('store-skins-grid');
        if (storeSkins) {
            storeSkins.innerHTML = '';
            Object.keys(this.ballConfigs).forEach(key => {
                const conf = this.ballConfigs[key];
                const isUnlocked = this.saveData.unlockedBalls.includes(key);
                const isSelected = this.saveData.selectedBall === key;
                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                let previewStyle = '';
                if (conf.tex) previewStyle = `background-image: url(${conf.tex});`; 
                else previewStyle = `background-color: #${conf.color.toString(16).padStart(6,'0')};`;
                card.innerHTML = `
                    <div class="item-preview ball-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => this.handlePurchase('ball', key, conf.price);
                storeSkins.appendChild(card);
            });
        }

        const storeSkies = document.getElementById('store-skies-grid');
        if (storeSkies) {
            storeSkies.innerHTML = '';
            Object.keys(this.skyConfigs).forEach(key => {
                const conf = this.skyConfigs[key];
                const isUnlocked = this.saveData.unlockedSkies.includes(key);
                const isSelected = this.saveData.selectedSky === key;
                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                let previewStyle = '';
                if (conf.tex) previewStyle = `background-image: url(${conf.tex});`; 
                else previewStyle = `background-color: #${conf.color.toString(16).padStart(6,'0')};`;
                card.innerHTML = `
                    <div class="item-preview sky-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => this.handlePurchase('sky', key, conf.price);
                storeSkies.appendChild(card);
            });
        }
    }

    handlePurchase(type, key, price) {
        // Helper to attempt payment from wallet (totalCoins) then session (score)
        const tryPay = (amount) => {
            let remaining = amount;
            // Use wallet first
            const fromWallet = Math.min(this.saveData.totalCoins, remaining);
            remaining -= fromWallet;
            this.saveData.totalCoins -= fromWallet;
            // If still needed, use session score
            if (remaining > 0) {
                const fromSession = Math.min(this.score, remaining);
                remaining -= fromSession;
                this.score -= fromSession;
            }
            // If fully paid remaining === 0 -> success; otherwise restore deducted amounts and fail
            if (remaining === 0) return true;
            // restore if failed
            this.saveData.totalCoins += (amount - remaining) - Math.max(0, amount - remaining - this.score);
            return false;
        };

        if (type === 'ball') {
            if (this.saveData.unlockedBalls.includes(key)) {
                this.saveData.selectedBall = key;
                this.ballMesh.material = this.getBallMaterial();
            } else {
                // Allow buying with Wallet OR Session coins combined
                if (tryPay(price)) {
                    this.saveData.unlockedBalls.push(key);
                    this.saveData.selectedBall = key;
                    this.ballMesh.material = this.getBallMaterial();
                } else {
                    // Not enough combined funds — simple feedback: flash the shop (re-render will show unchanged funds)
                }
            }
        } else {
            const updateSky = (skyKey) => {
                this.saveData.selectedSky = skyKey;
                const sky = this.skyConfigs[skyKey];
                if (sky.tex) {
                    this.textureLoader.load(sky.tex, (tex) => {
                        tex.mapping = THREE.EquirectangularReflectionMapping;
                        this.scene.background = tex;
                    });
                } else {
                    this.scene.background = new THREE.Color(sky.color);
                }
                this.scene.fog.color = new THREE.Color(sky.color);
            };

            if (this.saveData.unlockedSkies.includes(key)) {
                updateSky(key);
            } else {
                if (tryPay(price)) {
                    this.saveData.unlockedSkies.push(key);
                    updateSky(key);
                } else {
                    // insufficient funds
                }
            }
        }
        this.save();
        this.updateWalletUI();
        this.renderGrids();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.isGameOver) {
            this.updatePhysics();
            this.checkGameState();
        }

        // Calculate orbiting camera position
        const offsetX = Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * this.cameraDistance;
        const offsetY = Math.sin(this.cameraPitch) * this.cameraDistance;
        const offsetZ = Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * this.cameraDistance;

        const targetCamPos = new THREE.Vector3(
            this.ballMesh.position.x + offsetX,
            this.ballMesh.position.y + offsetY,
            this.ballMesh.position.z + offsetZ
        );

        this.camera.position.lerp(targetCamPos, 0.2);
        this.camera.lookAt(this.ballMesh.position.x, this.ballMesh.position.y, this.ballMesh.position.z);
        
        // Auto-align camera yaw slowly if moving forward and not touching controls
        if (Math.abs(this.inputZ || 0) > 0.5 && Math.abs(this.inputX || 0) < 0.1 && !this.keys['KeyA'] && !this.keys['KeyD']) {
            const shortestAngle = ((this.cameraYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
            this.cameraYaw -= shortestAngle * 0.02;
        }

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

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();