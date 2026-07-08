import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Setup WebsimSocket for persistent database
const room = new WebsimSocket();

class ModelEditor {
    constructor() {
        this.currentModel = null;
        this.currentModelName = '';
        this.selectedMesh = null;
        this.selectedBone = null;
        this.originalMaterials = new Map();
        this.originalBoneTransforms = new Map();
        this.originalMeshTransforms = new Map();
        this.modelParts = [];
        this.bones = [];
        this.skeletonHelper = null;
        this.mixer = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControls = null;
        this.ambientLight = null;
        this.directionalLight = null;
        this.pointLight = null;
        this.spotLight = null;
        this.loader = new GLTFLoader();
        this.objLoader = new OBJLoader();
        this.backgroundMusic = null;
        this.editorMusic = null;
        this.hoverSound = null;
        this.selectSound = null;
        this.gubbyHoverSound = null;
        this.gubbySelectSound = null;
        this.allBonesVisible = false;
        this.globalWireframe = false;
        this.currentUploadFile = null;
        this.riggingMode = false;
        this.riggingPoints = [];
        this.riggingCircles = [];
        this.isDragging = false;
        this.dragTarget = null;
        this.dragStartPosition = new THREE.Vector2();
        this.dragStartBonePosition = new THREE.Vector3();
        this.dragPlane = new THREE.Plane();
        
        // AI Animation
        this.animationAction = null;
        this.lastUpdateTime = 0;
        this.animationClips = new Map(); // Store generated clips

        // Menu background animation
        this.menuScene = null;
        this.menuCamera = null;
        this.menuRenderer = null;
        this.menuModels = [];
        this.availableModelUrls = [];

        // Effects system
        this.effects = [];
        this.selectedEffect = null; // Can be a mesh or the whole model
        this.effectsTarget = null; // Can be a mesh or the whole model
        this.animationMixers = [];
        
        // Camera movement
        this.keyStates = {};
        this.flyModeActive = false;
        
        this.init();
    }

    init() {
        this.setupAudio();
        this.setupEventListeners();
        this.setupEditorPanelTabs();
        this.setupCollapsibleSections();
        this.setupThreeJS();
        this.setupMenuBackground();
        this.loadUserModelsFromDatabase();
    }

    setupAudio() {
        this.backgroundMusic = document.getElementById('backgroundMusic');
        this.backgroundMusic.volume = 0.3;
        this.editorMusic = document.getElementById('editorMusic');
        this.editorMusic.volume = 0.3;
        this.hoverSound = document.getElementById('hoverSound');
        this.selectSound = document.getElementById('selectSound');
        this.gubbyHoverSound = document.getElementById('gubbyHoverSound');
        this.gubbySelectSound = document.getElementById('gubbySelectSound');
        
        // Start playing background music when user interacts with the page
        document.addEventListener('click', () => {
            if (this.backgroundMusic.paused) {
                this.backgroundMusic.play().catch(console.error);
            }
        }, { once: true });
    }

    setupEditorPanelTabs() {
        const tabs = document.querySelectorAll('.panel-tab');
        const panes = document.querySelectorAll('.tab-pane');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetPaneId = tab.dataset.tab;

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                panes.forEach(pane => {
                    if (pane.id === targetPaneId) {
                        pane.classList.add('active');
                    } else {
                        pane.classList.remove('active');
                    }
                });
            });
        });
    }

    setupCollapsibleSections() {
        document.querySelectorAll('.collapsible-header').forEach(header => {
            header.addEventListener('click', () => {
                const collapsible = header.closest('.collapsible');
                collapsible.classList.toggle('collapsed');
            });
        });
    }

    setupThreeJS() {
        const viewport = document.getElementById('viewport');
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(75, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
        this.camera.position.set(2, 2, 5);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        viewport.appendChild(this.renderer.domElement);
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        // Transform Controls
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.transformControls.addEventListener('objectChange', () => {
            const object = this.transformControls.object;
            if (!object) return;

            if (object === this.currentModel) {
                this.updateWholeModelTransformControls();
            } else if (object.isMesh) {
                this.updateMeshTransformControls(object);
            } else if (object.isBone) {
                this.updateBoneControls(object);
            }
        });
        this.scene.add(this.transformControls);
        
        // Lighting
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(this.ambientLight);
        
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        this.directionalLight.position.set(5, 5, 5);
        this.directionalLight.castShadow = true;
        this.scene.add(this.directionalLight);
        
        this.pointLight = new THREE.PointLight(0xffffff, 0.8, 0, 1);
        this.pointLight.position.set(3, 3, 3);
        this.pointLight.castShadow = true;
        this.scene.add(this.pointLight);
        
        this.spotLight = new THREE.SpotLight(0xffffff, 1, 0, 0.5, 0.1, 1);
        this.spotLight.position.set(0, 5, 0);
        this.spotLight.castShadow = true;
        this.spotLight.visible = false;
        this.scene.add(this.spotLight);

        // Ground Plane
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshStandardMaterial({ color: 0x222222, side: THREE.DoubleSide })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grid helper
        const gridHelper = new THREE.GridHelper(10, 10);
        this.scene.add(gridHelper);
        
        window.addEventListener('resize', () => this.onWindowResize(), false);
        this.animate();
    }

    setupMenuBackground() {
        const canvas = document.getElementById('menuBackgroundCanvas');
        this.menuScene = new THREE.Scene();
        
        this.menuCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.menuCamera.position.z = 10;
        
        this.menuRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
        
        // Add stars to the background
        const starGeometry = new THREE.BufferGeometry();
        const starVertices = [];
        for (let i = 0; i < 10000; i++) {
            const x = THREE.MathUtils.randFloatSpread(2000);
            const y = THREE.MathUtils.randFloatSpread(2000);
            const z = THREE.MathUtils.randFloatSpread(2000);
            starVertices.push(x, y, z);
        }
        starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.menuScene.add(stars);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.menuScene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7.5);
        this.menuScene.add(directionalLight);
        
        window.addEventListener('resize', () => this.onMenuResize());

        this.collectAvailableModels();
    }

    onMenuResize() {
        if (this.menuCamera && this.menuRenderer) {
            this.menuCamera.aspect = window.innerWidth / window.innerHeight;
            this.menuCamera.updateProjectionMatrix();
            this.menuRenderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    collectAvailableModels() {
        this.availableModelUrls = [];
        document.querySelectorAll('.model-card[data-model]').forEach(card => {
            this.availableModelUrls.push(card.dataset.model);
        });
        this.spawnInitialMenuModels();
    }

    spawnMenuModel(url) {
        if (!url) return;

        const extension = url.split('.').pop().toLowerCase();
        let loader;
        if (extension === 'obj') {
            loader = this.objLoader;
        } else { // glb, gltf
            loader = this.loader;
        }

        loader.load(url, (loadedObject) => {
            const model = extension === 'obj' ? loadedObject : loadedObject.scene;
            
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const scale = 2 / Math.max(size.x, size.y, size.z);
            model.scale.set(scale, scale, scale);
            
            const spawnY = 15;
            const spawnX = (Math.random() - 0.5) * 20;
            const spawnZ = (Math.random() - 0.5) * 10 - 5;
            model.position.set(spawnX, spawnY, spawnZ);
            
            model.rotation.x = Math.random() * Math.PI * 2;
            model.rotation.y = Math.random() * Math.PI * 2;
            model.rotation.z = Math.random() * Math.PI * 2;
            
            model.userData.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.5,
                (-1 - Math.random() * 2) * 1.235, // 23.5% faster
                (Math.random() - 0.5) * 0.5
            );

            this.menuModels.push(model);
            this.menuScene.add(model);
        });
    }

    spawnInitialMenuModels() {
        const numModels = Math.min(this.availableModelUrls.length, 10);
        for (let i = 0; i < numModels; i++) {
            const url = this.availableModelUrls[i % this.availableModelUrls.length];
            this.spawnMenuModel(url);
        }
    }

    updateMenuAnimation(deltaTime) {
        if (!this.menuScene || !this.menuRenderer || !document.getElementById('mainMenu').classList.contains('active')) return;

        this.menuModels.forEach(model => {
            model.position.y += model.userData.velocity.y * deltaTime;
            model.rotation.x += 0.5 * deltaTime;
            model.rotation.y += 0.5 * deltaTime;
            
            if (model.position.y < -15) {
                const spawnY = 15;
                const spawnX = (Math.random() - 0.5) * 20;
                model.position.set(spawnX, spawnY, model.position.z);
            }
        });

        if (this.availableModelUrls.length > 0 && this.menuModels.length < 15 && Math.random() < 0.0025) { // 75% less spawn rate
            const url = this.availableModelUrls[Math.floor(Math.random() * this.availableModelUrls.length)];
            this.spawnMenuModel(url);
        }
        
        this.menuRenderer.render(this.menuScene, this.menuCamera);
    }

    setupEventListeners() {
        // Model selection
        document.querySelectorAll('.model-card').forEach(card => {
            card.addEventListener('mouseenter', () => {
                const customHoverSound = card.dataset.hoverSound;
                if (customHoverSound === 'gubby_pet.mp3' && this.gubbyHoverSound) {
                    this.gubbyHoverSound.currentTime = 0;
                    this.gubbyHoverSound.play().catch(console.error);
                } else {
                    this.hoverSound.currentTime = 0;
                    this.hoverSound.play().catch(console.error);
                }
            });
            card.addEventListener('click', () => {
                const customSelectSound = card.dataset.selectSound;
                if (customSelectSound === 'hi.mp3' && this.gubbySelectSound) {
                    this.gubbySelectSound.currentTime = 0;
                    this.gubbySelectSound.play().catch(console.error);
                } else {
                    this.selectSound.currentTime = 0;
                    this.selectSound.play().catch(console.error);
                }

                if (card.classList.contains('user-model')) {
                    const modelId = card.dataset.modelId;
                    this.loadUserModelFromDatabase(modelId);
                } else {
                    const modelPath = card.dataset.model;
                    const modelName = card.dataset.name;
                    this.loadModel(modelPath, modelName);
                }
            });
        });

        // Upload functionality
        document.getElementById('uploadButton').addEventListener('click', () => {
            document.getElementById('modelUpload').click();
        });

        document.getElementById('modelUpload').addEventListener('change', (e) => {
            this.handleFileSelection(e);
        });

        document.getElementById('submitUpload').addEventListener('click', () => {
            this.submitUpload();
        });

        document.getElementById('cancelUpload').addEventListener('click', () => {
            this.cancelUpload();
        });

        // Back button
        document.getElementById('backButton').addEventListener('click', () => {
            this.showMainMenu();
        });

        // Reset button
        document.getElementById('resetButton').addEventListener('click', () => {
            this.resetModel();
        });

        // Export button
        document.getElementById('exportButton').addEventListener('click', () => {
            this.exportModel();
        });

        // Transform controls
        this.setupTransformControls();

        // Material controls
        this.setupMaterialControls();

        // Bone controls
        this.setupBoneControls();

        // Mesh transform controls
        this.setupMeshTransformControls();

        // Mouse interaction for model parts
        this.setupModelInteraction();

        // Toggle Rigging Mode button
        document.getElementById('toggleRiggingButton').addEventListener('click', () => {
            this.toggleRiggingMode();
        });

        // Reset buttons
        document.getElementById('resetMeshTransform').addEventListener('click', () => {
            this.resetMeshTransform();
        });

        document.getElementById('resetWholeModel').addEventListener('click', () => {
            this.resetWholeModelTransform();
        });

        document.getElementById('selectWholeModel').addEventListener('click', () => {
            this.selectWholeModel();
        });

        // Transform mode buttons
        document.querySelectorAll('.transform-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setTransformMode(btn.dataset.mode);
            });
        });

        // Keyboard shortcuts for transform modes
        window.addEventListener('keydown', (e) => {
            if (document.getElementById('editorScreen').classList.contains('active')) {
                switch(e.key.toLowerCase()) {
                    case 'w': this.setTransformMode('translate'); break;
                    case 'e': this.setTransformMode('rotate'); break;
                    case 'r': this.setTransformMode('scale'); break;
                }
            }
        });

        // Keyboard and camera controls
        this.setupCameraAndKeyboardControls();

        // Effects controls
        this.setupEffectsControls();
    }

    setupCameraAndKeyboardControls() {
        const viewport = document.getElementById('viewport');

        // Keyboard state tracking
        window.addEventListener('keydown', (e) => {
            if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                return; // Don't trigger shortcuts if typing in an input
            }
            const key = e.key.toLowerCase();
            this.keyStates[key] = true;
            
            if (document.getElementById('editorScreen').classList.contains('active') && !this.flyModeActive) {
                switch(key) {
                    case 'w': this.setTransformMode('translate'); break;
                    case 'e': this.setTransformMode('rotate'); break;
                    case 'r': this.setTransformMode('scale'); break;
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keyStates[e.key.toLowerCase()] = false;
        });

        window.addEventListener('blur', () => {
            this.keyStates = {};
        });

        // Mouse listeners for fly controls
        viewport.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                if (this.transformControls.dragging || this.isDragging) return;

                // Raycast to see if we clicked on empty space
                const rect = viewport.getBoundingClientRect();
                this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
                this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
                this.raycaster.setFromCamera(this.mouse, this.camera);
                const intersects = this.raycaster.intersectObjects(this.modelParts.map(p => p.mesh), true);

                if (intersects.length === 0) {
                    viewport.requestPointerLock();
                }
            } else if (e.button === 2) { // Right mouse button
                if (this.flyModeActive) {
                    document.exitPointerLock();
                } else {
                    viewport.requestPointerLock();
                }
            }
        });

        // Prevent context menu on right click in viewport
        viewport.addEventListener('contextmenu', (e) => e.preventDefault());

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === viewport) {
                this.flyModeActive = true;
                this.controls.enabled = false;
            } else {
                this.flyModeActive = false;
                this.controls.enabled = true;
            }
        });
        
        document.addEventListener('mousemove', (e) => this.onCameraMouseMove(e));
    }

    onCameraMouseMove(event) {
        if (!this.flyModeActive) return;
    
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;
    
        const euler = new THREE.Euler(0, 0, 0, 'YXZ');
        euler.setFromQuaternion(this.camera.quaternion);
    
        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
    
        euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    
        this.camera.quaternion.setFromEuler(euler);
    }
    
    updateCameraMovement(deltaTime) {
        const moveSpeed = 5.0;
        const speedDelta = moveSpeed * deltaTime;
        
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        const right = new THREE.Vector3().crossVectors(direction, this.camera.up).normalize();

        // Forward/backward
        if (this.keyStates['w']) this.camera.position.addScaledVector(direction, speedDelta);
        if (this.keyStates['s']) this.camera.position.addScaledVector(direction, -speedDelta);
        
        // Left/right (strafe)
        if (this.keyStates['a']) this.camera.position.addScaledVector(right, -speedDelta);
        if (this.keyStates['d']) this.camera.position.addScaledVector(right, speedDelta);

        // Up/down
        if (this.keyStates[' '] || this.keyStates['space']) this.camera.position.y += speedDelta;
        if (this.keyStates['shift']) this.camera.position.y -= speedDelta;
    }

    setupTransformControls() {
        const transformInputs = [
            // Position
            { range: 'posX', num: 'posXNum', axis: 'x', property: 'position' },
            { range: 'posY', num: 'posYNum', axis: 'y', property: 'position' },
            { range: 'posZ', num: 'posZNum', axis: 'z', property: 'position' },
            // Rotation
            { range: 'rotX', num: 'rotXNum', axis: 'x', property: 'rotation', isDegrees: true },
            { range: 'rotY', num: 'rotYNum', axis: 'y', property: 'rotation', isDegrees: true },
            { range: 'rotZ', num: 'rotZNum', axis: 'z', property: 'rotation', isDegrees: true },
            // Scale
            { range: 'scaleX', num: 'scaleXNum', axis: 'x', property: 'scale' },
            { range: 'scaleY', num: 'scaleYNum', axis: 'y', property: 'scale' },
            { range: 'scaleZ', num: 'scaleZNum', axis: 'z', property: 'scale' },
        ];

        transformInputs.forEach(({ range, num, axis, property, isDegrees }) => {
            const rangeInput = document.getElementById(range);
            const numInput = document.getElementById(num);

            const updateTransform = (value) => {
                if (this.currentModel) {
                    let processedValue = isDegrees ? THREE.MathUtils.degToRad(value) : value;
                    this.currentModel[property][axis] = processedValue;
                }
            };

            rangeInput.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                numInput.value = value;
                updateTransform(value);
            });

            numInput.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                rangeInput.value = value;
                updateTransform(value);
            });
        });
    }

    setupMaterialControls() {
        document.getElementById('materialColor').addEventListener('input', (e) => {
            if (this.selectedMesh && this.selectedMesh.material) {
                this.selectedMesh.material.color.set(e.target.value);
            }
        });
        document.getElementById('materialOpacity').addEventListener('input', (e) => {
            if (this.selectedMesh && this.selectedMesh.material) {
                this.selectedMesh.material.opacity = parseFloat(e.target.value);
                this.selectedMesh.material.transparent = this.selectedMesh.material.opacity < 1;
                this.selectedMesh.material.needsUpdate = true;
            }
        });
        document.getElementById('materialMetalness').addEventListener('input', (e) => {
            if (this.selectedMesh && this.selectedMesh.material.metalness !== undefined) {
                this.selectedMesh.material.metalness = parseFloat(e.target.value);
            }
        });
        document.getElementById('materialRoughness').addEventListener('input', (e) => {
            if (this.selectedMesh && this.selectedMesh.material.roughness !== undefined) {
                this.selectedMesh.material.roughness = parseFloat(e.target.value);
            }
        });
        document.getElementById('materialEmissive').addEventListener('input', (e) => {
            if (this.selectedMesh && this.selectedMesh.material.emissive) {
                this.selectedMesh.material.emissive.set(e.target.value);
            }
        });
        document.getElementById('materialWireframe').addEventListener('change', (e) => {
            if (this.selectedMesh && this.selectedMesh.material) {
                this.selectedMesh.material.wireframe = e.target.checked;
            }
        });
    }

    setupBoneControls() {
        const boneInputs = [
            { range: 'bonePosX', axis: 'x', property: 'position' },
            { range: 'bonePosY', axis: 'y', property: 'position' },
            { range: 'bonePosZ', axis: 'z', property: 'position' },
            { range: 'boneRotX', axis: 'x', property: 'rotation', isDegrees: true },
            { range: 'boneRotY', axis: 'y', property: 'rotation', isDegrees: true },
            { range: 'boneRotZ', axis: 'z', property: 'rotation', isDegrees: true },
            { range: 'boneScaleX', axis: 'x', property: 'scale' },
            { range: 'boneScaleY', axis: 'y', property: 'scale' },
            { range: 'boneScaleZ', axis: 'z', property: 'scale' },
        ];
        boneInputs.forEach(({ range, axis, property, isDegrees }) => {
            document.getElementById(range).addEventListener('input', (e) => {
                if (this.selectedBone) {
                    let value = parseFloat(e.target.value);
                    if (isDegrees) {
                        value = THREE.MathUtils.degToRad(value);
                    }
                    this.selectedBone[property][axis] = value;
                }
            });
        });
    }

    setupMeshTransformControls() {
        const meshTransformInputs = [
            { range: 'meshPosX', num: 'meshPosXNum', axis: 'x', property: 'position' },
            { range: 'meshPosY', num: 'meshPosYNum', axis: 'y', property: 'position' },
            { range: 'meshPosZ', num: 'meshPosZNum', axis: 'z', property: 'position' },
            { range: 'meshRotX', num: 'meshRotXNum', axis: 'x', property: 'rotation', isDegrees: true },
            { range: 'meshRotY', num: 'meshRotYNum', axis: 'y', property: 'rotation', isDegrees: true },
            { range: 'meshRotZ', num: 'meshRotZNum', axis: 'z', property: 'rotation', isDegrees: true },
            { range: 'meshScaleX', num: 'meshScaleXNum', axis: 'x', property: 'scale' },
            { range: 'meshScaleY', num: 'meshScaleYNum', axis: 'y', property: 'scale' },
            { range: 'meshScaleZ', num: 'meshScaleZNum', axis: 'z', property: 'scale' },
        ];
        meshTransformInputs.forEach(({ range, num, axis, property, isDegrees }) => {
            const rangeInput = document.getElementById(range);
            const numInput = document.getElementById(num);
            const updateTransform = (value) => {
                if (this.selectedMesh) {
                    let processedValue = isDegrees ? THREE.MathUtils.degToRad(value) : value;
                    this.selectedMesh[property][axis] = processedValue;
                }
            };
            rangeInput.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                numInput.value = value;
                updateTransform(value);
            });
            numInput.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                rangeInput.value = value;
                updateTransform(value);
            });
        });
        document.getElementById('removeMeshButton').addEventListener('click', () => {
            this.removeSelectedMesh();
        });
    }

    setupModelInteraction() {
        const viewport = document.getElementById('viewport');
        let touchStartTime = 0;
        let touchStartPos = { x: 0, y: 0 };

        const handleInteraction = (x, y) => {
            if (this.transformControls.dragging || this.isDragging) return;

            const rect = viewport.getBoundingClientRect();
            this.mouse.x = ((x - rect.left) / viewport.clientWidth) * 2 - 1;
            this.mouse.y = -((y - rect.top) / viewport.clientHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.modelParts.map(p => p.mesh), true);
            if (intersects.length > 0) {
                this.selectMesh(intersects[0].object);
            } else {
                this.selectMesh(null);
                this.selectBone(null);
                this.transformControls.detach();
            }
        };

        viewport.addEventListener('click', (event) => {
            handleInteraction(event.clientX, event.clientY);
        });

        viewport.addEventListener('touchstart', (event) => {
            if (event.touches.length === 1) {
                touchStartTime = Date.now();
                touchStartPos.x = event.touches[0].clientX;
                touchStartPos.y = event.touches[0].clientY;
            }
        }, { passive: true });

        viewport.addEventListener('touchend', (event) => {
            if (event.changedTouches.length === 1) {
                const touch = event.changedTouches[0];
                const dx = touch.clientX - touchStartPos.x;
                const dy = touch.clientY - touchStartPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const duration = Date.now() - touchStartTime;

                // Treat as a tap if it's short and didn't move much
                if (duration < 300 && dist < 10) {
                     handleInteraction(touch.clientX, touch.clientY);
                }
            }
        });
    }

    setupEffectsControls() {
        // Add effect button
        document.getElementById('addEffect').addEventListener('click', () => {
            this.addEffect();
        });

        // Effect type selection - remove the updateEffectPreview call
        document.getElementById('effectType').addEventListener('change', () => {
            // Effect type changed, preview will be shown when added
        });
        
        // AI animation controls
        this.setupAIAnimationControls();
    }

    setupAIAnimationControls() {
        document.getElementById('generateAnimationBtn').addEventListener('click', () => {
            this.generateAIAnimation();
        });

        document.getElementById('playAnimationBtn').addEventListener('click', () => {
            this.playAnimation();
        });

        document.getElementById('pauseAnimationBtn').addEventListener('click', () => {
            this.pauseAnimation();
        });

        document.getElementById('stopAnimationBtn').addEventListener('click', () => {
            this.stopAnimation();
        });

        document.getElementById('animationTimeline').addEventListener('input', (e) => {
            this.setAnimationTime(parseFloat(e.target.value));
        });
    }

    handleFileSelection(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (!['glb', 'gltf', 'obj'].includes(fileExtension)) {
            alert('Please select a GLB, GLTF, or OBJ file.');
            return;
        }

        this.currentUploadFile = file;
        document.getElementById('uploadForm').style.display = 'flex';
        document.getElementById('modelName').value = file.name.replace(/\.[^/.]+$/, "");
    }

    cancelUpload() {
        document.getElementById('uploadForm').style.display = 'none';
        document.getElementById('modelName').value = '';
        document.getElementById('modelDescription').value = '';
        document.getElementById('authorName').value = '';
        document.getElementById('modelUpload').value = '';
        this.currentUploadFile = null;
    }

    async submitUpload() {
        const modelName = document.getElementById('modelName').value.trim();
        const modelDescription = document.getElementById('modelDescription').value.trim();
        const authorName = document.getElementById('authorName').value.trim();
        const modelEmoji = document.getElementById('modelEmoji').value.trim();

        if (!this.currentUploadFile || !modelName || !authorName || !modelEmoji) {
            alert('Please fill all required fields and select a file.');
            return;
        }

        this.showLoading();

        try {
            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
                const fileDataUrl = e.target.result;
                const modelId = 'user_' + Date.now();

                const newModel = {
                    model_id: modelId,
                    name: modelName,
                    description: modelDescription,
                    username: authorName,
                    emoji: modelEmoji,
                    file_url: fileDataUrl,
                    file_name: this.currentUploadFile.name
                };

                await room.collection('user_model').add(newModel);
                
                this.hideLoading();
                alert('Model uploaded successfully!');
                this.cancelUpload();
            };
            fileReader.onerror = (error) => {
                this.hideLoading();
                console.error('Error reading file:', error);
                alert('Error reading file for upload.');
            };
            fileReader.readAsDataURL(this.currentUploadFile);

        } catch (error) {
            this.hideLoading();
            console.error('Error uploading model:', error);
            alert('An error occurred during upload. Please check console.');
        }
    }

    loadModel(modelPath, modelName) {
        this.showLoading();

        const extension = modelPath.split('.').pop().toLowerCase();
        let loader;
        if (extension === 'obj') {
            loader = this.objLoader;
        } else {
            loader = this.loader;
        }

        loader.load(modelPath, (loadedObject) => {
            const model = extension === 'obj' ? loadedObject : loadedObject.scene;
            this.hideLoading();
            this.setCurrentModel(model, modelName);
            this.showEditor();
        }, undefined, (error) => {
            console.error('Error loading model:', error);
            this.hideLoading();
            alert('Error loading model. Please check the console for details.');
        });
    }

    async loadUserModelsFromDatabase() {
        try {
            // Subscribe to changes in user models
            room.collection('user_model').subscribe((models) => {
                this.renderUserModels(models);
            });
        } catch (error) {
            console.error('Error loading user models:', error);
        }
    }

    renderUserModels(models = []) {
        const userModelGrid = document.getElementById('userModelGrid');
        
        if (models.length === 0) {
            userModelGrid.innerHTML = '<p class="no-models">No user models uploaded yet</p>';
            return;
        }

        userModelGrid.innerHTML = '';
        
        const newModelUrls = [];
        models.forEach((model) => {
            newModelUrls.push(model.file_url);

            const modelCard = document.createElement('div');
            modelCard.className = 'model-card user-model';
            modelCard.dataset.modelId = model.id;
            
            modelCard.innerHTML = `
                <div class="model-preview">
                    <div class="preview-icon">${model.emoji || '🎨'}</div>
                </div>
                <h3>${model.name}</h3>
                <p>${model.description || 'A custom user model.'}</p>
                <div class="model-metadata">
                    <span class="model-author">@${model.username}</span>
                    <span class="model-id">ID: ${model.model_id}</span>
                </div>
            `;
            
            userModelGrid.appendChild(modelCard);
        });
        
        // Update available models for background animation
        this.availableModelUrls = [...new Set([...this.availableModelUrls, ...newModelUrls])];

        // Add click handlers for user model cards
        document.querySelectorAll('.user-model').forEach(card => {
            card.addEventListener('mouseenter', () => {
                this.hoverSound.currentTime = 0;
                this.hoverSound.play().catch(console.error);
            });
            card.addEventListener('click', () => {
                this.selectSound.currentTime = 0;
                this.selectSound.play().catch(console.error);

                const modelId = card.dataset.modelId;
                this.loadUserModelFromDatabase(modelId);
            });
        });
    }

    async loadUserModelFromDatabase(modelId) {
        try {
            const models = room.collection('user_model').getList();
            const model = models.find(m => m.id === modelId);
            
            if (!model || !model.file_url) {
                alert('Model not found or file not available.');
                return;
            }

            this.showLoading();
            
            // Fetch the model file from the stored URL
            const response = await fetch(model.file_url);
            const arrayBuffer = await response.arrayBuffer();

            const fileExtension = model.file_url.split('.').pop().toLowerCase();
            if (fileExtension === 'obj') {
                const text = new TextDecoder().decode(arrayBuffer);
                const scene = this.objLoader.parse(text);
                this.hideLoading();
                this.setCurrentModel(scene, model.name);
                this.showEditor();
            } else {
                this.loader.parse(arrayBuffer, '', (gltf) => {
                    this.hideLoading();
                    this.setCurrentModel(gltf.scene, model.name);
                    this.showEditor();
                }, (error) => {
                    console.error('Error loading model:', error);
                    this.hideLoading();
                    alert('Error loading model. Please try again.');
                });
            }
        } catch (error) {
            console.error('Error loading user model:', error);
            this.hideLoading();
            alert('Error loading user model. Please try again.');
        }
    }

    setCurrentModel(model, name) {
        // Remove existing model
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            if (this.skeletonHelper) {
                this.scene.remove(this.skeletonHelper);
                this.skeletonHelper = null;
            }
            if (this.mixer) {
                this.mixer.stopAllAction();
                this.mixer = null;
            }
            this.animationAction = null;
            this.animationClips.clear();
            document.getElementById('animationControls').style.display = 'none';
        }

        // Add new model
        this.currentModel = model;
        this.currentModelName = name;
        this.scene.add(model);

        // Enable shadows for all meshes
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Enhanced centering and scaling logic
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // First, center the model at origin
        model.position.sub(center);
        
        // Then scale to fit nicely in view
        const maxSize = Math.max(size.x, size.y, size.z);
        if (maxSize > 0) {
            const targetSize = 2.5; // Slightly larger for better visibility
            model.scale.multiplyScalar(targetSize / maxSize);
        }
        
        // Ensure model is at exact center (0, 0, 0)
        model.position.set(0, 0, 0);
        
        // For models that might have unusual pivot points, recalculate and adjust
        const finalBox = new THREE.Box3().setFromObject(model);
        const finalCenter = finalBox.getCenter(new THREE.Vector3());
        model.position.sub(finalCenter);

        // Apply global wireframe setting to new model
        if (this.globalWireframe) {
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    try {
                        // Ensure material has all required properties
                        if (!child.material.color) {
                            child.material.color = new THREE.Color(0xffffff);
                        }
                        if (!child.material.emissive) {
                            child.material.emissive = new THREE.Color(0x000000);
                        }
                        if (child.material.opacity === undefined) {
                            child.material.opacity = 1.0;
                        }
                        
                        child.material.wireframe = true;
                        child.material.needsUpdate = true;
                    } catch (error) {
                        console.warn('Error applying wireframe to material:', error);
                    }
                }
            });
        }

        // Store original materials
        this.storeOriginalMaterials(model);
        
        // Setup skeleton if available
        this.setupSkeleton(model);
        
        // Build model hierarchy
        this.buildModelHierarchy(model);
        
        // Update UI
        document.getElementById('currentModelName').textContent = name;
        this.resetControls();
        
        // Setup rigging points if in rigging mode
        if (this.riggingMode) {
            this.setupRiggingPoints();
        }
        this.clearAllEffects();
    }

    storeOriginalMaterials(model) {
        this.originalMaterials.clear();
        this.originalMeshTransforms.clear();
        this.modelParts = [];
        
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                // Ensure material is properly initialized
                if (!child.material.color) {
                    child.material.color = new THREE.Color(0xffffff);
                }
                if (!child.material.emissive) {
                    child.material.emissive = new THREE.Color(0x000000);
                }
                if (child.material.opacity === undefined) {
                    child.material.opacity = 1.0;
                }
                if (child.material.metalness === undefined) {
                    child.material.metalness = 0.0;
                }
                if (child.material.roughness === undefined) {
                    child.material.roughness = 0.5;
                }
                
                // Store original material with proper cloning
                const originalMaterial = child.material.clone();
                this.originalMaterials.set(child.uuid, originalMaterial);
                
                // Store original transforms
                this.originalMeshTransforms.set(child.uuid, {
                    position: child.position.clone(),
                    rotation: child.rotation.clone(),
                    scale: child.scale.clone()
                });
                
                // Add to model parts list
                this.modelParts.push({
                    mesh: child,
                    name: child.name || 'Unnamed Part',
                    uuid: child.uuid
                });
            }
        });
    }

    buildModelHierarchy(model) {
        const hierarchy = document.getElementById('modelHierarchy');
        hierarchy.innerHTML = '';
        
        if (this.modelParts.length === 0) {
            hierarchy.innerHTML = '<p class="no-model">No parts found</p>';
            return;
        }
        
        this.modelParts.forEach((part, index) => {
            const item = document.createElement('div');
            item.className = 'hierarchy-item';
            item.textContent = part.name || `Part ${index + 1}`;
            item.dataset.uuid = part.uuid;
            
            item.addEventListener('click', () => {
                this.selectMesh(part.mesh);
            });
            
            hierarchy.appendChild(item);
        });
        this.updateEffectsTarget(); // Set target to whole model initially
    }

    setupSkeleton(model) {
        this.bones = [];
        this.selectedBone = null;
        
        // Find skeleton
        let skeleton = null;
        model.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
                return;
            }
        });
        
        if (skeleton) {
            // Create skeleton helper
            this.skeletonHelper = new THREE.SkeletonHelper(model);
            this.skeletonHelper.material.linewidth = 2;
            this.scene.add(this.skeletonHelper);
            
            // Store bones
            this.bones = skeleton.bones;
            
            // Store original bone transforms
            this.bones.forEach(bone => {
                this.originalBoneTransforms.set(bone.uuid, {
                    position: bone.position.clone(),
                    rotation: bone.rotation.clone(),
                    scale: bone.scale.clone()
                });
            });
            
            // Build bone hierarchy
            this.buildBoneHierarchy();
            
            // Setup rigging points if in rigging mode
            if (this.riggingMode) {
                this.setupRiggingPoints();
            }
        } else {
            // No skeleton found
            document.getElementById('boneHierarchy').innerHTML = '<p class="no-bones">No bones available</p>';
            document.querySelector('#tab-object .skeleton-controls').style.display = 'none';
        }
    }

    buildBoneHierarchy() {
        const boneHierarchy = document.getElementById('boneHierarchy');
        boneHierarchy.innerHTML = '';
        
        if (this.bones.length === 0) {
            boneHierarchy.innerHTML = '<p class="no-bones">No bones available</p>';
            return;
        }
        
        this.bones.forEach((bone, index) => {
            const item = document.createElement('div');
            item.className = 'hierarchy-item';
            item.textContent = bone.name || `Bone ${index + 1}`;
            item.dataset.uuid = bone.uuid;
            
            item.addEventListener('click', () => {
                this.selectBone(bone);
            });
            
            boneHierarchy.appendChild(item);
        });
    }

    selectBone(bone) {
        // Remove previous selection highlight
        if (this.selectedBone) {
            document.querySelectorAll('#boneHierarchy .hierarchy-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
        }
        
        // Set new selection
        this.selectedBone = bone;
        
        // Attach/detach transform controls
        if (bone) {
            this.transformControls.attach(bone);
        } else if (!this.selectedMesh) {
            this.transformControls.detach();
        }
        
        // Update hierarchy UI only if a bone is actually selected
        if (bone) {
            const hierarchyItem = document.querySelector(`#boneHierarchy [data-uuid="${bone.uuid}"]`);
            if (hierarchyItem) {
                hierarchyItem.classList.add('selected');
            }
        }
        
        // Update bone controls
        this.updateBoneControls(bone);
    }

    updateBoneControls(bone) {
        const selectedBoneName = document.getElementById('selectedBoneName');
        
        if (bone) {
            selectedBoneName.textContent = bone.name || 'Unnamed Bone';
            
            // Update control values
            this.updateBoneControlsFromBone(bone);
        } else {
            selectedBoneName.textContent = 'None';
            // Reset bone controls to default/empty state
            document.getElementById('bonePosX').value = 0;
            document.getElementById('bonePosY').value = 0;
            document.getElementById('bonePosZ').value = 0;
            document.getElementById('boneRotX').value = 0;
            document.getElementById('boneRotY').value = 0;
            document.getElementById('boneRotZ').value = 0;
            document.getElementById('boneScaleX').value = 1;
            document.getElementById('boneScaleY').value = 1;
            document.getElementById('boneScaleZ').value = 1;
        }
    }

    updateBoneControlsFromBone(bone) {
        document.getElementById('bonePosX').value = bone.position.x.toFixed(2);
        document.getElementById('bonePosY').value = bone.position.y.toFixed(2);
        document.getElementById('bonePosZ').value = bone.position.z.toFixed(2);
        
        document.getElementById('boneRotX').value = THREE.MathUtils.radToDeg(bone.rotation.x).toFixed(1);
        document.getElementById('boneRotY').value = THREE.MathUtils.radToDeg(bone.rotation.y).toFixed(1);
        document.getElementById('boneRotZ').value = THREE.MathUtils.radToDeg(bone.rotation.z).toFixed(1);
        
        document.getElementById('boneScaleX').value = bone.scale.x.toFixed(2);
        document.getElementById('boneScaleY').value = bone.scale.y.toFixed(2);
        document.getElementById('boneScaleZ').value = bone.scale.z.toFixed(2);
    }

    selectMesh(mesh) {
        // Remove previous selection highlight
        if (this.selectedMesh) {
            try {
                if (this.selectedMesh.material && this.selectedMesh.material.emissive) {
                    this.selectedMesh.material.emissive.setHex(0x000000);
                }
            } catch (error) {
                console.warn('Error resetting previous mesh selection:', error);
            }
            document.querySelectorAll('.hierarchy-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
        }
        
        // Set new selection
        this.selectedMesh = mesh;
        
        // Highlight selected mesh
        if (mesh && mesh.material) {
            try {
                if (!mesh.material.emissive) {
                    mesh.material.emissive = new THREE.Color(0x000000);
                }
                mesh.material.emissive.setHex(0x222222);
            } catch (error) {
                console.warn('Error highlighting selected mesh:', error);
            }
        }
        
        // Update hierarchy UI
        document.querySelectorAll('#modelHierarchy .hierarchy-item.selected').forEach(item => {
            item.classList.remove('selected');
        });

        if (mesh) {
            const hierarchyItem = document.querySelector(`#modelHierarchy [data-uuid="${mesh.uuid}"]`);
            if (hierarchyItem) {
                hierarchyItem.classList.add('selected');
            }
        }

        // Attach/detach transform controls
        if (mesh) {
            this.transformControls.attach(mesh);
        } else {
            this.transformControls.detach();
        }
        
        // Update material controls
        this.updateMaterialControls(mesh);
        
        // Update mesh transform controls
        this.updateMeshTransformControls(mesh);
        
        // Update effects target
        this.updateEffectsTarget();
    }

    updateMaterialControls(mesh) {
        const materialControls = document.getElementById('materialControls');
        const selectedPartName = document.getElementById('selectedPartName');
        
        if (mesh && mesh.material) {
            materialControls.classList.add('active');
            selectedPartName.textContent = mesh.name || 'Unnamed Part';
            
            const material = mesh.material;
            
            // Update control values
            if (material.color) {
                document.getElementById('materialColor').value = '#' + material.color.getHexString();
            }
            document.getElementById('materialOpacity').value = material.opacity || 1;
            document.getElementById('materialMetalness').value = material.metalness || 0;
            document.getElementById('materialRoughness').value = material.roughness || 0.5;
            if (material.emissive) {
                document.getElementById('materialEmissive').value = '#' + material.emissive.getHexString();
            }
            document.getElementById('materialWireframe').checked = material.wireframe || false;
        } else {
            materialControls.classList.remove('active');
            selectedPartName.textContent = 'None';
        }
    }

    updateMeshTransformControls(mesh) {
        const meshTransformControls = document.getElementById('meshTransformControls');
        const selectedMeshName = document.getElementById('selectedMeshName');
        
        if (mesh) {
            meshTransformControls.classList.add('active');
            selectedMeshName.textContent = mesh.name || 'Unnamed Part';
            
            // Update control values
            document.getElementById('meshPosX').value = mesh.position.x.toFixed(2);
            document.getElementById('meshPosXNum').value = mesh.position.x.toFixed(2);
            document.getElementById('meshPosY').value = mesh.position.y.toFixed(2);
            document.getElementById('meshPosYNum').value = mesh.position.y.toFixed(2);
            document.getElementById('meshPosZ').value = mesh.position.z.toFixed(2);
            document.getElementById('meshPosZNum').value = mesh.position.z.toFixed(2);
            
            document.getElementById('meshRotX').value = THREE.MathUtils.radToDeg(mesh.rotation.x).toFixed(1);
            document.getElementById('meshRotXNum').value = THREE.MathUtils.radToDeg(mesh.rotation.x).toFixed(1);
            document.getElementById('meshRotY').value = THREE.MathUtils.radToDeg(mesh.rotation.y).toFixed(1);
            document.getElementById('meshRotYNum').value = THREE.MathUtils.radToDeg(mesh.rotation.y).toFixed(1);
            document.getElementById('meshRotZ').value = THREE.MathUtils.radToDeg(mesh.rotation.z).toFixed(1);
            document.getElementById('meshRotZNum').value = THREE.MathUtils.radToDeg(mesh.rotation.z).toFixed(1);
            
            document.getElementById('meshScaleX').value = mesh.scale.x.toFixed(2);
            document.getElementById('meshScaleXNum').value = mesh.scale.x.toFixed(2);
            document.getElementById('meshScaleY').value = mesh.scale.y.toFixed(2);
            document.getElementById('meshScaleYNum').value = mesh.scale.y.toFixed(2);
            document.getElementById('meshScaleZ').value = mesh.scale.z.toFixed(2);
            document.getElementById('meshScaleZNum').value = mesh.scale.z.toFixed(2);
        } else {
            meshTransformControls.classList.remove('active');
            selectedMeshName.textContent = 'None';
        }
    }

    updateWholeModelTransformControls() {
        if (!this.currentModel) return;

        const model = this.currentModel;
        // Position
        document.getElementById('posX').value = model.position.x.toFixed(2);
        document.getElementById('posXNum').value = model.position.x.toFixed(2);
        document.getElementById('posY').value = model.position.y.toFixed(2);
        document.getElementById('posYNum').value = model.position.y.toFixed(2);
        document.getElementById('posZ').value = model.position.z.toFixed(2);
        document.getElementById('posZNum').value = model.position.z.toFixed(2);

        // Rotation
        document.getElementById('rotX').value = THREE.MathUtils.radToDeg(model.rotation.x).toFixed(1);
        document.getElementById('rotXNum').value = THREE.MathUtils.radToDeg(model.rotation.x).toFixed(1);
        document.getElementById('rotY').value = THREE.MathUtils.radToDeg(model.rotation.y).toFixed(1);
        document.getElementById('rotYNum').value = THREE.MathUtils.radToDeg(model.rotation.y).toFixed(1);
        document.getElementById('rotZ').value = THREE.MathUtils.radToDeg(model.rotation.z).toFixed(1);
        document.getElementById('rotZNum').value = THREE.MathUtils.radToDeg(model.rotation.z).toFixed(1);

        // Scale
        document.getElementById('scaleX').value = model.scale.x.toFixed(2);
        document.getElementById('scaleXNum').value = model.scale.x.toFixed(2);
        document.getElementById('scaleY').value = model.scale.y.toFixed(2);
        document.getElementById('scaleYNum').value = model.scale.y.toFixed(2);
        document.getElementById('scaleZ').value = model.scale.z.toFixed(2);
        document.getElementById('scaleZNum').value = model.scale.z.toFixed(2);
    }

    resetMeshTransform() {
        if (this.selectedMesh) {
            const originalTransform = this.originalMeshTransforms.get(this.selectedMesh.uuid);
            if (originalTransform) {
                this.selectedMesh.position.copy(originalTransform.position);
                this.selectedMesh.rotation.copy(originalTransform.rotation);
                this.selectedMesh.scale.copy(originalTransform.scale);
                
                // Update UI controls
                this.updateMeshTransformControls(this.selectedMesh);
            }
        }
    }

    resetWholeModelTransform() {
        if (this.currentModel) {
            this.currentModel.position.set(0, 0, 0);
            this.currentModel.rotation.set(0, 0, 0);
            this.currentModel.scale.set(1, 1, 1);
            
            // Update UI controls
            this.resetControls();
        }
    }

    selectWholeModel() {
        if (!this.currentModel) return;

        // Deselect any selected part or bone
        this.selectMesh(null);
        this.selectBone(null);

        // Attach transform controls to the whole model
        this.transformControls.attach(this.currentModel);
        
        // Update effects target to whole model
        this.updateEffectsTarget();
    }

    resetModel() {
        if (this.currentModel) {
            this.currentModel.position.set(0, 0, 0);
            this.currentModel.rotation.set(0, 0, 0);
            this.currentModel.scale.set(1, 1, 1);
            this.resetControls();
            
            // Reset materials
            this.currentModel.traverse((child) => {
                if (child.isMesh) {
                    child.visible = true; // Make sure all parts are visible
                    if (child.material) {
                        const originalMaterial = this.originalMaterials.get(child.uuid);
                        if (originalMaterial) {
                            child.material.copy(originalMaterial);
                            child.material.needsUpdate = true;
                        }
                    }
                    
                    // Reset mesh transforms
                    const originalTransform = this.originalMeshTransforms.get(child.uuid);
                    if (originalTransform) {
                        child.position.copy(originalTransform.position);
                        child.rotation.copy(originalTransform.rotation);
                        child.scale.copy(originalTransform.scale);
                    }
                }
            });
            
            // Reset bones
            this.bones.forEach(bone => {
                const originalTransform = this.originalBoneTransforms.get(bone.uuid);
                if (originalTransform) {
                    bone.position.copy(originalTransform.position);
                    bone.rotation.copy(originalTransform.rotation);
                    bone.scale.copy(originalTransform.scale);
                }
            });
            
            // Clear selections
            this.selectedMesh = null;
            this.selectedBone = null;
            this.updateMaterialControls(null);
            this.updateMeshTransformControls(null);
            this.updateBoneControls(null);
            this.selectMesh(null); // This will detach the gizmo
            
            // Reset other settings
            this.allBonesVisible = false;
            this.globalWireframe = false;
            
            // Update UI
            document.getElementById('globalWireframe').checked = false;
            document.getElementById('showAllBonesButton').textContent = 'Show All Bones';
            document.getElementById('bonesVisibilityStatus').textContent = 'Hidden';
            document.getElementById('bonesVisibilityStatus').style.color = 'rgba(255, 255, 255, 0.7)';
            
            // Hide skeleton helper
            if (this.skeletonHelper) {
                this.skeletonHelper.visible = false;
            }
            
            // Reset rigging mode
            this.riggingMode = false;
            document.getElementById('toggleRiggingButton').textContent = 'Enable Rigging Mode';
            document.getElementById('riggingModeStatus').textContent = 'Disabled';
            document.getElementById('riggingModeStatus').style.color = 'rgba(255, 255, 255, 0.7)';
            document.getElementById('riggingOverlay').classList.remove('active');
            this.clearRiggingPoints();
            
            // Reset AI animation
            if (this.mixer) {
                this.mixer.stopAllAction();
                this.mixer = null;
            }
            this.animationAction = null;
            this.animationClips.clear();
            document.getElementById('animationControls').style.display = 'none';
        }
    }

    resetControls() {
        // Reset transform controls
        document.getElementById('posX').value = 0;
        document.getElementById('posXNum').value = 0;
        document.getElementById('posY').value = 0;
        document.getElementById('posYNum').value = 0;
        document.getElementById('posZ').value = 0;
        document.getElementById('posZNum').value = 0;
        document.getElementById('rotX').value = 0;
        document.getElementById('rotXNum').value = 0;
        document.getElementById('rotY').value = 0;
        document.getElementById('rotYNum').value = 0;
        document.getElementById('rotZ').value = 0;
        document.getElementById('rotZNum').value = 0;
        document.getElementById('scaleX').value = 1;
        document.getElementById('scaleXNum').value = 1;
        document.getElementById('scaleY').value = 1;
        document.getElementById('scaleYNum').value = 1;
        document.getElementById('scaleZ').value = 1;
        document.getElementById('scaleZNum').value = 1;
        
        // Reset bone controls
        document.getElementById('bonePosX').value = 0;
        document.getElementById('bonePosY').value = 0;
        document.getElementById('bonePosZ').value = 0;
        document.getElementById('boneRotX').value = 0;
        document.getElementById('boneRotY').value = 0;
        document.getElementById('boneRotZ').value = 0;
        document.getElementById('boneScaleX').value = 1;
        document.getElementById('boneScaleY').value = 1;
        document.getElementById('boneScaleZ').value = 1;
        
        // Reset lighting controls
        document.getElementById('ambientLight').value = 0.5;
        document.getElementById('ambientLightColor').value = '#404040';
        document.getElementById('directionalLight').value = 1;
        document.getElementById('directionalLightColor').value = '#ffffff';
        document.getElementById('dirLightX').value = 5;
        document.getElementById('dirLightY').value = 5;
        document.getElementById('dirLightZ').value = 5;
        document.getElementById('pointLightEnabled').checked = true;
        document.getElementById('pointLightIntensity').value = 0.8;
        document.getElementById('pointLightColor').value = '#ffffff';
        document.getElementById('pointLightX').value = 3;
        document.getElementById('pointLightY').value = 3;
        document.getElementById('pointLightZ').value = 3;
        document.getElementById('pointLightDistance').value = 0;
        document.getElementById('pointLightDecay').value = 1;
        document.getElementById('spotLightEnabled').checked = false;
        document.getElementById('spotLightIntensity').value = 1;
        document.getElementById('spotLightColor').value = '#ffffff';
        document.getElementById('spotLightX').value = 0;
        document.getElementById('spotLightY').value = 5;
        document.getElementById('spotLightZ').value = 0;
        document.getElementById('spotLightAngle').value = 0.5;
        document.getElementById('spotLightPenumbra').value = 0.1;
        document.getElementById('spotLightDistance').value = 0;
        document.getElementById('spotLightDecay').value = 1;
    }

    exportModel() {
        if (!this.currentModel) return;
        
        // Create a simple export (screenshot for now)
        const canvas = this.renderer.domElement;
        const link = document.createElement('a');
        link.download = `${this.currentModelName.replace(/\s+/g, '_')}_export.png`;
        link.href = canvas.toDataURL();
        link.click();
    }

    showMainMenu() {
        document.getElementById('mainMenu').classList.add('active');
        document.getElementById('editorScreen').classList.remove('active');
        if (!this.editorMusic.paused) this.editorMusic.pause();
        if (this.backgroundMusic.paused) this.backgroundMusic.play().catch(console.error);
    }

    showEditor() {
        document.getElementById('mainMenu').classList.remove('active');
        document.getElementById('editorScreen').classList.add('active');
        if (!this.backgroundMusic.paused) this.backgroundMusic.pause();
        if (this.editorMusic.paused) this.editorMusic.play().catch(console.error);
    }

    showLoading() {
        document.getElementById('loading').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loading').classList.remove('active');
    }

    onWindowResize() {
        const viewport = document.getElementById('viewport');
        this.camera.aspect = viewport.clientWidth / viewport.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const now = performance.now();
        const deltaTime = (now - (this.lastUpdateTime || now)) / 1000;
        this.lastUpdateTime = now;

        try {
            if (document.getElementById('editorScreen').classList.contains('active')) {

                if (this.flyModeActive) {
                    this.updateCameraMovement(deltaTime);
                } else {
                    this.controls.update();
                }
                
                // Update animation mixer
                if (this.mixer) {
                    this.mixer.update(deltaTime);
                    if(this.animationAction && this.animationAction.isRunning()) {
                        const timeline = document.getElementById('animationTimeline');
                        const duration = this.animationAction.getClip().duration;
                        if (duration > 0) {
                            timeline.value = this.mixer.time % duration;
                        }
                    }
                }
                
                // Update effect animations
                this.updateEffectAnimations();
                
                // Update rigging positions if in rigging mode
                if (this.riggingMode) {
                    this.updateRiggingPositions();
                }
                
                this.renderer.render(this.scene, this.camera);
            } else {
                 this.updateMenuAnimation(0.016); // Rough delta time
            }
        } catch (error) {
            console.error('Rendering error:', error);
            // Try to continue animation loop even if rendering fails
        }
    }

    toggleAllBones() {
        this.allBonesVisible = !this.allBonesVisible;
        
        if (this.skeletonHelper) {
            this.skeletonHelper.visible = this.allBonesVisible;
        }
        
        // Update button text and status
        const button = document.getElementById('showAllBonesButton');
        const status = document.getElementById('bonesVisibilityStatus');
        
        if (this.allBonesVisible) {
            button.textContent = 'Hide All Bones';
            status.textContent = 'Visible';
            status.style.color = 'rgba(102, 126, 234, 0.8)';
        } else {
            button.textContent = 'Show All Bones';
            status.textContent = 'Hidden';
            status.style.color = 'rgba(255, 255, 255, 0.7)';
        }
    }

    toggleGlobalWireframe(enabled) {
        this.globalWireframe = enabled;
        
        if (this.currentModel) {
            this.currentModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    try {
                        // Ensure material has all required properties
                        if (!child.material.color) {
                            child.material.color = new THREE.Color(0xffffff);
                        }
                        if (!child.material.emissive) {
                            child.material.emissive = new THREE.Color(0x000000);
                        }
                        if (child.material.opacity === undefined) {
                            child.material.opacity = 1.0;
                        }
                        
                        child.material.wireframe = enabled;
                        child.material.needsUpdate = true;
                    } catch (error) {
                        console.warn('Error applying wireframe to material:', error);
                    }
                }
            });
        }
    }

    handleTextureUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!this.selectedMesh) {
            alert('Please select a model part first before uploading a texture.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    // Create texture from uploaded image
                    const texture = new THREE.Texture(img);
                    texture.needsUpdate = true;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;

                    // Apply texture to selected mesh
                    if (this.selectedMesh.material) {
                        // Clone the material to avoid affecting other meshes
                        const newMaterial = this.selectedMesh.material.clone();
                        
                        // Ensure all required properties exist
                        if (!newMaterial.color) {
                            newMaterial.color = new THREE.Color(0xffffff);
                        }
                        if (!newMaterial.emissive) {
                            newMaterial.emissive = new THREE.Color(0x000000);
                        }
                        if (newMaterial.opacity === undefined) {
                            newMaterial.opacity = 1.0;
                        }
                        if (newMaterial.metalness === undefined) {
                            newMaterial.metalness = 0.0;
                        }
                        if (newMaterial.roughness === undefined) {
                            newMaterial.roughness = 0.5;
                        }
                        
                        newMaterial.map = texture;
                        newMaterial.needsUpdate = true;
                        this.selectedMesh.material = newMaterial;

                        console.log('Texture applied to:', this.selectedMesh.name || 'Unnamed Part');
                    }
                } catch (error) {
                    console.error('Error applying texture:', error);
                    alert('Error applying texture. Please try again.');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Clear the file input
        event.target.value = '';
    }

    toggleRiggingMode() {
        this.riggingMode = !this.riggingMode;
        
        const button = document.getElementById('toggleRiggingButton');
        const status = document.getElementById('riggingModeStatus');
        const overlay = document.getElementById('riggingOverlay');
        const aiPanel = document.getElementById('aiAnimationPanel');
        
        if (this.riggingMode) {
            button.textContent = 'Disable Rigging Mode';
            status.textContent = 'Enabled';
            status.style.color = 'rgba(102, 126, 234, 0.8)';
            overlay.classList.add('active');
            aiPanel.style.display = 'block';
            
            if (this.currentModel) {
                this.setupRiggingPoints();
            }
        } else {
            button.textContent = 'Enable Rigging Mode';
            status.textContent = 'Disabled';
            status.style.color = 'rgba(255, 255, 255, 0.7)';
            overlay.classList.remove('active');
            aiPanel.style.display = 'none';
            this.clearRiggingPoints();

            // Stop AI animation when leaving rigging mode
            if (this.animationAction) {
                this.animationAction.stop();
                this.mixer.setTime(0);
                document.getElementById('animationTimeline').value = 0;
                // Restore bones to original state after stopping
                this.bones.forEach(bone => {
                    const originalTransform = this.originalBoneTransforms.get(bone.uuid);
                    if (originalTransform) {
                        bone.position.copy(originalTransform.position);
                        bone.rotation.copy(originalTransform.rotation);
                        bone.scale.copy(originalTransform.scale);
                    }
                });
            }
        }
    }

    setupRiggingPoints() {
        if (!this.currentModel) {
            return;
        }

        this.clearRiggingPoints();

        // Define common rigging points with their bone name patterns
        const riggingTargets = [
            // Head and Torso
            { patterns: ['head', 'skull', 'cranium'], label: 'Head' },
            { patterns: ['neck'], label: 'Neck' },
            { patterns: ['chest', 'upper_spine', 'spine2', 'spine_02'], label: 'Chest' },
            { patterns: ['spine', 'mid_spine', 'spine1', 'spine_01'], label: 'Spine' },
            { patterns: ['hip', 'pelvis', 'hips', 'root', 'waist'], label: 'Pelvis' },

            // Left Arm
            { patterns: ['shoulder.l', 'left.shoulder', 'l.shoulder', 'shoulder_l', 'shoulderl', 'clavicle.l', 'left.clavicle', 'l.clavicle', 'upperarm_twist.l'], label: 'Left Shoulder' },
            { patterns: ['wrist.l', 'left.wrist', 'l.wrist', 'wrist_l', 'wristl'], label: 'Left Wrist' },

            // Right Arm
            { patterns: ['shoulder.r', 'right.shoulder', 'r.shoulder', 'shoulder_r', 'shoulderr', 'clavicle.r', 'right.clavicle', 'r.clavicle', 'upperarm_twist.r'], label: 'Right Shoulder' },
            { patterns: ['wrist.r', 'right.wrist', 'r.wrist', 'wrist_r', 'wristr'], label: 'Right Wrist' },

            // Left Leg
            { patterns: ['ankle.l', 'left.ankle', 'l.ankle', 'ankle_l'], label: 'Left Ankle' },
            { patterns: ['foot.l', 'left.foot', 'l.foot'], label: 'Left Foot' },
            
            // Right Leg
            { patterns: ['ankle.r', 'right.ankle', 'r.ankle', 'ankle_r'], label: 'Right Ankle' },
            { patterns: ['foot.r', 'right.foot', 'r.foot'], label: 'Right Foot' }
        ];

        // Find matching bones for each rigging target
        riggingTargets.forEach(target => {
            const bone = this.bones ? this.findBoneByPatterns(target.patterns) : null;
            this.riggingPoints.push({
                bone: bone,
                label: target.label,
                worldPosition: new THREE.Vector3(),
                isDummy: !bone
            });
        });

        // Set initial positions for dummy points by guessing from model geometry
        this.guessDummyPositionsFromGeometry();

        // Create rigging circles
        this.createRiggingCircles();
    }

    guessDummyPositionsFromGeometry() {
        if (!this.currentModel) return;

        // Get all vertices from the model
        const vertices = [];
        this.currentModel.traverse(child => {
            if (child.isMesh && child.geometry) {
                const worldPos = new THREE.Vector3();
                const positions = child.geometry.attributes.position;
                for (let i = 0; i < positions.count; i++) {
                    worldPos.fromBufferAttribute(positions, i);
                    child.localToWorld(worldPos);
                    vertices.push(worldPos.clone());
                }
            }
        });

        if (vertices.length === 0) {
            this.setDefaultDummyPositions(); // Fallback
            return;
        }

        // Bounding box for dimensions
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Guess logic
        const guesses = {
            'Head': vertices.reduce((a, b) => a.y > b.y ? a : b),
            'Pelvis': vertices.reduce((a, b) => (Math.abs(a.y - (center.y - size.y * 0.1)) < Math.abs(b.y - (center.y - size.y * 0.1))) ? a : b),
            'Left Wrist': vertices.reduce((a, b) => a.x < b.x ? a : b),
            'Right Wrist': vertices.reduce((a, b) => a.x > b.x ? a : b),
            'Left Foot': vertices.filter(v => v.y < center.y - size.y * 0.4).reduce((a, b) => a.x < b.x ? a : b, new THREE.Vector3(Infinity, 0, 0)),
            'Right Foot': vertices.filter(v => v.y < center.y - size.y * 0.4).reduce((a, b) => a.x > b.x ? a : b, new THREE.Vector3(-Infinity, 0, 0))
        };
        // Refine foot guesses to be at the bottom
        if(guesses['Left Foot'].x !== Infinity) guesses['Left Foot'].y = box.min.y;
        if(guesses['Right Foot'].x !== -Infinity) guesses['Right Foot'].y = box.min.y;

        this.riggingPoints.forEach(point => {
            if (point.isDummy && guesses[point.label]) {
                 point.worldPosition.copy(guesses[point.label]);
            } else if (point.isDummy) {
                // Fallback for points we couldn't guess
                this.setDefaultDummyPositions();
            }
        });
    }

    setDefaultDummyPositions() {
        if (!this.currentModel) return;

        const defaultPose = {
            'Head': new THREE.Vector3(0, 1.8, 0),
            'Neck': new THREE.Vector3(0, 1.6, 0),
            'Chest': new THREE.Vector3(0, 1.4, 0),
            'Spine': new THREE.Vector3(0, 1.1, 0),
            'Pelvis': new THREE.Vector3(0, 0.9, 0),

            'Left Shoulder': new THREE.Vector3(-0.2, 1.5, 0),
            'Left Wrist': new THREE.Vector3(-1.2, 1.5, 0),
            
            'Right Shoulder': new THREE.Vector3(0.2, 1.5, 0),
            'Right Wrist': new THREE.Vector3(1.2, 1.5, 0),

            'Left Ankle': new THREE.Vector3(-0.2, 0.1, 0),
            'Left Foot': new THREE.Vector3(-0.2, 0, 0.1),

            'Right Ankle': new THREE.Vector3(0.2, 0.1, 0),
            'Right Foot': new THREE.Vector3(0.2, 0, 0.1),
        };

        // Find scale factor based on model size
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = Math.max(size.x, size.y, size.z) / 2.0; // T-pose is approx 2 units high

        this.riggingPoints.forEach(point => {
            if (point.isDummy) {
                const pos = defaultPose[point.label];
                if (pos) {
                    point.worldPosition.copy(pos).multiplyScalar(scale).add(this.currentModel.position);
                }
            }
        });
    }

    findBoneByPatterns(patterns) {
        if (!this.bones) return null;
        for (const pattern of patterns) {
            const bone = this.bones.find(b => 
                b.name && b.name.toLowerCase().includes(pattern.toLowerCase())
            );
            if (bone) return bone;
        }
        return null;
    }

    createRiggingCircles() {
        const overlay = document.getElementById('riggingOverlay');
        
        this.riggingPoints.forEach((point, index) => {
            const circle = document.createElement('div');
            circle.className = 'rigging-circle';
            circle.dataset.boneIndex = index;
            
            const label = document.createElement('div');
            label.className = 'rigging-label';
            label.textContent = point.label;
            circle.appendChild(label);
            
            // Add event listeners
            circle.addEventListener('mouseenter', () => {
                this.highlightRiggingPoint(point);
            });
            
            circle.addEventListener('mouseleave', () => {
                this.unhighlightRiggingPoint(point);
            });
            
            circle.addEventListener('click', () => {
                this.selectRiggingPoint(point, circle);
            });

            // Add drag functionality for both mouse and touch
            circle.addEventListener('mousedown', (e) => {
                this.startDrag(e, point, index);
            });
            circle.addEventListener('touchstart', (e) => {
                this.startDrag(e, point, index);
            }, { passive: false });
            
            overlay.appendChild(circle);
            this.riggingCircles.push(circle);
        });

        // Add global mouse/touch event listeners for dragging
        document.addEventListener('mousemove', (e) => {
            this.handleDrag(e);
        });
        document.addEventListener('touchmove', (e) => {
            this.handleDrag(e);
        }, { passive: false });

        document.addEventListener('mouseup', () => {
            this.endDrag();
        });
        document.addEventListener('touchend', () => {
            this.endDrag();
        });
    }

    highlightRiggingPoint(point) {
        if (point.bone && this.skeletonHelper) {
            // Highlight the bone in the skeleton helper
            this.skeletonHelper.material.color.setHex(0x00ff00);
            this.skeletonHelper.material.needsUpdate = true;
        }
    }

    unhighlightRiggingPoint(point) {
        if (this.skeletonHelper) {
            // Reset skeleton helper color
            this.skeletonHelper.material.color.setHex(0xffffff);
            this.skeletonHelper.material.needsUpdate = true;
        }
    }

    selectRiggingPoint(point, circle) {
        // Remove previous selection
        this.riggingCircles.forEach(c => c.classList.remove('selected'));
        
        // Select new point
        circle.classList.add('selected');
        if (point.bone) {
            this.selectBone(point.bone);
        } else {
            this.selectBone(null);
        }
    }

    updateRiggingPositions() {
        if (!this.riggingMode || !this.currentModel || this.riggingPoints.length === 0) {
            return;
        }

        const viewport = document.getElementById('viewport');
        const rect = viewport.getBoundingClientRect();
        
        this.riggingPoints.forEach((point, index) => {
            const circle = this.riggingCircles[index];
            if (!circle) return;

            if (point.bone) {
                // Get world position of the bone
                point.bone.getWorldPosition(point.worldPosition);
            }
            // For dummy points, worldPosition is updated on drag and initialized once.
            
            // Project to screen coordinates
            const screenPosition = point.worldPosition.clone();
            screenPosition.project(this.camera);
            
            // Convert to viewport coordinates
            const x = (screenPosition.x + 1) / 2 * rect.width;
            const y = (-screenPosition.y + 1) / 2 * rect.height;
            
            // Update circle position
            circle.style.left = `${x}px`;
            circle.style.top = `${y}px`;
            
            // Hide circles that are behind the camera or too far
            const distance = this.camera.position.distanceTo(point.worldPosition);
            const isVisible = screenPosition.z < 1 && distance < 50;
            circle.style.display = isVisible ? 'block' : 'none';
        });
    }

    startDrag(event, point, index) {
        event.preventDefault();
        event.stopPropagation();
        
        this.isDragging = true;
        this.dragTarget = {
            point: point,
            index: index,
            bone: point.bone
        };

        const eventCoord = event.touches ? event.touches[0] : event;
        
        const worldPos = new THREE.Vector3();
        if (point.bone) {
            point.bone.getWorldPosition(worldPos);
        } else {
            worldPos.copy(point.worldPosition);
        }
        
        // Create a plane that is facing the camera and passes through the drag point
        this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), worldPos);
        
        // Store initial positions
        this.dragStartPosition.set(eventCoord.clientX, eventCoord.clientY);
        
        // For bones, we need to convert its world position to local position of its parent.
        const parent = point.bone ? point.bone.parent : null;

        if (parent) {
            this.dragStartBonePosition.copy(parent.worldToLocal(worldPos));
        } else if (point.bone) {
            this.dragStartBonePosition.copy(point.bone.position);
        } else {
            // For dummy points, we drag in world space
            this.dragStartBonePosition.copy(point.worldPosition);
        }
        
        // Disable orbit controls while dragging
        this.controls.enabled = false;
        
        // Select the bone/point
        this.selectRiggingPoint(point, this.riggingCircles[index]);
        
        // Add dragging class for visual feedback
        this.riggingCircles[index].classList.add('dragging');
    }

    handleDrag(event) {
        if (!this.isDragging || !this.dragTarget) return;

        // Stop page from scrolling on touch devices
        event.preventDefault();

        const viewport = document.getElementById('viewport');
        const rect = viewport.getBoundingClientRect();
        const eventCoord = event.touches ? event.touches[0] : event;

        // Update mouse coordinates
        this.mouse.x = ((eventCoord.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((eventCoord.clientY - rect.top) / rect.height) * 2 + 1;

        // Create a ray from the camera through the mouse position
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Find intersection with the drag plane
        const newPosition = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.dragPlane, newPosition)) {
             // Update bone or dummy point position
            if (this.dragTarget.bone) {
                const bone = this.dragTarget.bone;
                const parent = bone.parent;
                
                if(parent){
                    // Convert world position to parent's local space
                    const localPos = parent.worldToLocal(newPosition.clone());
                    bone.position.copy(localPos);
                } else {
                    bone.position.copy(newPosition);
                }

                // Update the bone controls UI if this bone is selected
                if (this.selectedBone === this.dragTarget.bone) {
                    this.updateBoneControlsFromBone(this.dragTarget.bone);
                }
            } else {
                // Update dummy point's world position directly
                this.dragTarget.point.worldPosition.copy(newPosition);
            }
        }
    }

    endDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        
        // Re-enable orbit controls
        this.controls.enabled = true;
        
        // Remove dragging class
        if (this.dragTarget) {
            this.riggingCircles[this.dragTarget.index].classList.remove('dragging');
        }
        
        this.dragTarget = null;
    }

    clearRiggingPoints() {
        const overlay = document.getElementById('riggingOverlay');
        overlay.innerHTML = '';
        this.riggingPoints = [];
        this.riggingCircles = [];
        
        // Reset drag state
        this.isDragging = false;
        this.dragTarget = null;
    }

    async generateAIAnimation() {
        const promptText = document.getElementById('animationPrompt').value;
        if (!promptText) {
            alert('Please enter an animation description.');
            return;
        }

        if (!this.bones || this.bones.length === 0) {
            alert('The current model has no rig/bones to animate.');
            return;
        }

        const aiLoading = document.getElementById('aiLoading');
        aiLoading.style.display = 'flex';

        try {
            const boneNames = this.bones.map(b => b.name || 'Unnamed Bone');
            const systemPrompt = `You are an expert 3D animator. Your task is to generate animation keyframes for a 3D model based on a user's prompt.
The model has the following bones: ${JSON.stringify(boneNames)}.
You must respond with a JSON object containing keyframes for a 3-second animation.
The JSON format must be:
{
  "duration": 3,
  "keyframes": [
    {
      "boneName": "string",
      "trackType": "position" | "quaternion" | "scale",
      "times": [number], // array of time points in seconds
      "values": [number] // flat array of values (x,y,z for position/scale, x,y,z,w for quaternion)
    }
  ]
}
- Use "quaternion" for rotation.
- Include keyframes for all major bones involved in the animation.
- Start and end keyframes (at time 0 and 3) should represent a neutral pose for a smooth loop.
- Generate enough keyframes to create a fluid animation.
- Only output the JSON and no other text.
`;

            const completion = await websim.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Animation prompt: "${promptText}"` }
                ],
                json: true
            });

            const animationData = JSON.parse(completion.content);
            this.createAndApplyAnimation(animationData);

        } catch (error) {
            console.error('AI Animation generation failed:', error);
            alert('Failed to generate animation. The AI might be busy or the response was invalid. Please try again.');
        } finally {
            aiLoading.style.display = 'none';
        }
    }

    createAndApplyAnimation(data) {
        if (!this.currentModel || !data.keyframes || data.keyframes.length === 0) {
            console.warn('Invalid animation data received from AI.');
            return;
        }
        
        // Stop any previous animation
        if (this.mixer) {
            this.mixer.stopAllAction();
        }

        const tracks = [];
        data.keyframes.forEach(kf => {
            const bone = this.bones.find(b => b.name === kf.boneName);
            if (bone) {
                const nodeName = `${bone.name}.${kf.trackType}`;
                const times = new Float32Array(kf.times);
                const values = new Float32Array(kf.values);

                let track;
                if (kf.trackType === 'position' || kf.trackType === 'scale') {
                    track = new THREE.VectorKeyframeTrack(nodeName, times, values);
                } else if (kf.trackType === 'quaternion') {
                    track = new THREE.QuaternionKeyframeTrack(nodeName, times, values);
                }
                
                if (track) {
                    tracks.push(track);
                }
            }
        });
        
        if (tracks.length === 0) {
            alert("The AI didn't return any valid keyframes for the model's bones.");
            return;
        }

        const clip = new THREE.AnimationClip('ai-animation', data.duration, tracks);
        
        this.mixer = new THREE.AnimationMixer(this.currentModel);
        this.animationAction = this.mixer.clipAction(clip);
        
        document.getElementById('animationControls').style.display = 'block';
        document.getElementById('animationTimeline').max = clip.duration;
        document.getElementById('animationTimeline').value = 0;
        this.playAnimation();
    }

    playAnimation() {
        if (this.animationAction) {
            this.animationAction.paused = false;
            if (!this.animationAction.isRunning()) {
                this.animationAction.play();
            }
        }
    }

    pauseAnimation() {
        if (this.animationAction) {
            this.animationAction.paused = true;
        }
    }
    
    stopAnimation() {
        if (this.animationAction) {
            this.animationAction.stop();
            this.mixer.setTime(0);
            document.getElementById('animationTimeline').value = 0;
            // Restore bones to original state after stopping
            this.bones.forEach(bone => {
                const originalTransform = this.originalBoneTransforms.get(bone.uuid);
                if (originalTransform) {
                    bone.position.copy(originalTransform.position);
                    bone.rotation.copy(originalTransform.rotation);
                    bone.scale.copy(originalTransform.scale);
                }
            });
        }
    }

    setAnimationTime(value) {
        if(this.mixer && this.animationAction) {
            this.animationAction.paused = true;
            this.mixer.setTime(value);
        }
    }

    addEffect() {
        const effectType = document.getElementById('effectType').value;
        const target = this.effectsTarget;
        
        if (!target) {
            alert('Please select a model part or the whole model first.');
            return;
        }

        const effect = this.createEffect(effectType, target);
        if (effect) {
            this.effects.push(effect);
            this.updateEffectsList();
            this.selectEffect(effect);
        }
    }

    createEffect(type, target) {
        const effect = {
            id: Date.now().toString(),
            type: type,
            target: target,
            active: true,
            properties: {}
        };

        switch (type) {
            case 'particles':
                effect.system = this.createParticleSystem(target);
                effect.properties = {
                    count: 1000,
                    size: 0.1,
                    color: '#ffffff',
                    speed: 1.0,
                    spread: 1.0,
                    particleType: 'fire'
                };
                break;
                
            case 'glow':
                effect.properties = {
                    intensity: 0.5,
                    color: '#00ff00',
                    size: 1.2
                };
                this.applyGlowEffect(target, effect.properties);
                break;
                
            case 'rotation':
                effect.properties = {
                    speed: 1.0,
                    axis: 'y'
                };
                this.startRotationAnimation(target, effect.properties);
                break;
                
            case 'bobbing':
                effect.properties = {
                    amplitude: 0.5,
                    speed: 1.0
                };
                this.startBobbingAnimation(target, effect.properties);
                break;
                
            case 'pulsing':
                effect.properties = {
                    minScale: 0.8,
                    maxScale: 1.2,
                    speed: 1.0
                };
                this.startPulsingAnimation(target, effect.properties);
                break;
            
            case 'colorCycle':
                effect.properties = {
                    speed: 1.0,
                    saturation: 1.0,
                    lightness: 0.5
                };
                this.startColorCycleAnimation(target, effect.properties, effect.id);
                break;

            case 'shake':
                effect.properties = {
                    intensity: 0.1,
                    speed: 5.0
                };
                this.startShakeAnimation(target, effect.properties, effect.id);
                break;

            case 'ghost':
                effect.properties = {
                    trailLength: 10,
                    fadeSpeed: 0.05
                };
                this.startGhostEffect(target, effect.properties, effect.id);
                break;
        }

        return effect;
    }

    createParticleSystem(target) {
        const particleCount = 1000;
        const particles = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);

        // Get target position for particle origin
        const targetPos = new THREE.Vector3();
        if (target === this.currentModel) {
            targetPos.set(0, 0, 0);
        } else {
            target.getWorldPosition(targetPos);
        }

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = targetPos.x + (Math.random() - 0.5) * 2;
            positions[i * 3 + 1] = targetPos.y + Math.random() * 3;
            positions[i * 3 + 2] = targetPos.z + (Math.random() - 0.5) * 2;

            colors[i * 3] = Math.random();
            colors[i * 3 + 1] = Math.random() * 0.5;
            colors[i * 3 + 2] = 0;

            sizes[i] = Math.random() * 0.2 + 0.05;
        }

        particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particles.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.8
        });

        const particleSystem = new THREE.Points(particles, material);
        this.scene.add(particleSystem);

        return particleSystem;
    }

    applyGlowEffect(target, properties) {
        if (target.isMesh && target.material) {
            const originalMaterial = target.material;
            const glowMaterial = originalMaterial.clone();
            
            glowMaterial.emissive = new THREE.Color(properties.color);
            glowMaterial.emissiveIntensity = properties.intensity;
            
            target.material = glowMaterial;
            target.scale.multiplyScalar(properties.size);
        }
    }

    startColorCycleAnimation(target, properties, effectId) {
        if (!target.userData.animations) {
            target.userData.animations = [];
        }
        
        target.userData.animations.push({
            type: 'colorCycle',
            effectId: effectId,
            data: {
                ...properties,
                time: 0
            }
        });
    }

    startShakeAnimation(target, properties, effectId) {
        if (!target.userData.animations) {
            target.userData.animations = [];
        }

        target.userData.animations.push({
            type: 'shake',
            effectId: effectId,
            data: {
                ...properties,
                originalPosition: target.position.clone(),
                time: 0
            }
        });
    }

    startGhostEffect(target, properties, effectId) {
        const trail = [];
        for (let i = 0; i < properties.trailLength; i++) {
            const ghost = target.clone();
            
            // Handle material cloning for both single mesh and group
            if (ghost.isMesh) {
                if (ghost.material) {
                    ghost.material = ghost.material.clone();
                    ghost.material.transparent = true;
                    ghost.material.opacity = 0;
                }
            } else { // It's a group (the whole model)
                ghost.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material = child.material.clone();
                        child.material.transparent = true;
                        child.material.opacity = 0;
                    }
                });
            }

            this.scene.add(ghost);
            trail.push(ghost);
        }

        if (!target.userData.animations) {
            target.userData.animations = [];
        }

        target.userData.animations.push({
            type: 'ghost',
            effectId: effectId,
            data: {
                ...properties,
                trail: trail,
                trailIndex: 0
            }
        });
    }

    startRotationAnimation(target, properties) {
        const rotationData = {
            target: target,
            speed: properties.speed,
            axis: properties.axis
        };
        
        // Store animation data for update loop
        if (!target.userData.animations) {
            target.userData.animations = [];
        }
        target.userData.animations.push({
            type: 'rotation',
            data: rotationData
        });
    }

    startBobbingAnimation(target, properties) {
        const bobbingData = {
            target: target,
            amplitude: properties.amplitude,
            speed: properties.speed,
            startY: target.position.y,
            time: 0
        };
        
        if (!target.userData.animations) {
            target.userData.animations = [];
        }
        target.userData.animations.push({
            type: 'bobbing',
            data: bobbingData
        });
    }

    startPulsingAnimation(target, properties) {
        const pulsingData = {
            target: target,
            minScale: properties.minScale,
            maxScale: properties.maxScale,
            speed: properties.speed,
            originalScale: target.scale.clone(),
            time: 0
        };
        
        if (!target.userData.animations) {
            target.userData.animations = [];
        }
        target.userData.animations.push({
            type: 'pulsing',
            data: pulsingData
        });
    }

    updateEffectAnimations() {
        if (!this.currentModel) return;

        const currentTime = Date.now() * 0.001;
        const deltaTime = 0.016; // Simplified delta time

        this.currentModel.traverse((child) => {
            if (child.userData.animations) {
                // Before processing animations, reset any additive changes from last frame
                const shakeAnim = child.userData.animations.find(a => a.type === 'shake');
                if (shakeAnim) {
                    child.position.copy(shakeAnim.data.originalPosition);
                }

                child.userData.animations.forEach((animation) => {
                    switch (animation.type) {
                        case 'rotation':
                            const rotData = animation.data;
                            if (rotData.axis === 'x') {
                                child.rotation.x += rotData.speed * 0.01;
                            } else if (rotData.axis === 'y') {
                                child.rotation.y += rotData.speed * 0.01;
                            } else if (rotData.axis === 'z') {
                                child.rotation.z += rotData.speed * 0.01;
                            }
                            break;
                            
                        case 'bobbing':
                            const bobData = animation.data;
                            bobData.time += 0.016;
                            child.position.y = bobData.startY + Math.sin(bobData.time * bobData.speed) * bobData.amplitude;
                            break;
                            
                        case 'pulsing':
                            const pulseData = animation.data;
                            pulseData.time += 0.016;
                            const scale = pulseData.minScale + (pulseData.maxScale - pulseData.minScale) * 
                                         (Math.sin(pulseData.time * pulseData.speed) + 1) * 0.5;
                            child.scale.copy(pulseData.originalScale);
                            child.scale.multiplyScalar(scale);
                            break;
                        
                        case 'colorCycle':
                            const colorData = animation.data;
                            colorData.time += deltaTime;
                            const hue = (colorData.time * colorData.speed * 0.1) % 1;
                            if (child.material && child.material.color) {
                                child.material.color.setHSL(hue, colorData.saturation, colorData.lightness);
                            }
                            break;
                        
                        case 'shake':
                            const shakeData = animation.data;
                            shakeData.time += deltaTime;
                            const shakeX = (Math.random() - 0.5) * shakeData.intensity;
                            const shakeY = (Math.random() - 0.5) * shakeData.intensity;
                            const shakeZ = (Math.random() - 0.5) * shakeData.intensity;
                            child.position.add(new THREE.Vector3(shakeX, shakeY, shakeZ));
                            break;
                        
                        case 'ghost':
                            const ghostData = animation.data;
                            const { trail, trailIndex, trailLength } = ghostData;
                            
                            // Update current ghost
                            const currentGhost = trail[trailIndex];
                            currentGhost.position.copy(child.position);
                            currentGhost.rotation.copy(child.rotation);
                            currentGhost.scale.copy(child.scale);
                            currentGhost.material.opacity = 1.0;
                            
                            // Update trail index
                            ghostData.trailIndex = (trailIndex + 1) % trailLength;

                            // Fade out all ghosts
                            trail.forEach(ghost => {
                                ghost.material.opacity = Math.max(0, ghost.material.opacity - ghostData.fadeSpeed);
                            });
                            break;
                    }
                });
            }
        });

        // Update particle systems
        this.effects.forEach(effect => {
            if (effect.type === 'particles' && effect.system && effect.active) {
                this.updateParticleSystem(effect.system, effect.properties);
            }
            if (effect.type === 'ghost') {
                const anim = effect.target?.userData?.animations?.find(a => a.effectId === effect.id);
                if (anim && anim.data.trail) {
                    this.updateGhostTrail(anim.data.trail, anim.data.trailIndex, anim.data.trailLength, anim.data.fadeSpeed);
                }
            }
        });
    }

    updateParticleSystem(system, properties) {
        const positions = system.geometry.attributes.position.array;
        const colors = system.geometry.attributes.color.array;

        const particleType = properties.particleType || 'fire';

        for (let i = 0; i < positions.length; i += 3) {
            // Movement logic based on particle type
            if (particleType === 'water' || particleType === 'snow') {
                // Falling particles
                positions[i + 1] -= properties.speed * 0.01;
                // Add some horizontal drift for snow
                if (particleType === 'snow') {
                    positions[i] += (Math.random() - 0.5) * 0.01;
                }
                
                // Reset particles that go too low
                if (positions[i + 1] < -5) {
                    positions[i + 1] = 5; // Reset to top
                    positions[i] = (Math.random() - 0.5) * properties.spread;
                    positions[i + 2] = (Math.random() - 0.5) * properties.spread;
                }
            } else {
                // Rising particles (default)
                positions[i + 1] += properties.speed * 0.01;
            
                // Reset particles that go too high
                if (positions[i + 1] > 5) {
                    positions[i + 1] = 0;
                    positions[i] = (Math.random() - 0.5) * properties.spread;
                    positions[i + 2] = (Math.random() - 0.5) * properties.spread;
                }
            }

            // Update colors based on particle type
            if (particleType === 'fire') {
                colors[i] = 1.0;
                colors[i + 1] = Math.random() * 0.5;
                colors[i + 2] = 0;
            } else if (particleType === 'smoke') {
                const gray = Math.random() * 0.3 + 0.1;
                colors[i] = gray;
                colors[i + 1] = gray;
                colors[i + 2] = gray;
            } else if (particleType === 'sparkles') {
                const c = new THREE.Color();
                c.setHSL(Math.random(), 1.0, 0.7);
                colors[i] = c.r;
                colors[i + 1] = c.g;
                colors[i + 2] = c.b;
            } else if (particleType === 'water') {
                colors[i] = 0.1;
                colors[i + 1] = 0.4;
                colors[i + 2] = 1.0;
            } else if (particleType === 'magic') {
                const c = new THREE.Color();
                const hue = (performance.now() * 0.0002 + i / positions.length) % 1;
                c.setHSL(hue, 0.8, 0.6);
                colors[i] = c.r;
                colors[i + 1] = c.g;
                colors[i + 2] = c.b;
            } else if (particleType === 'snow') {
                colors[i] = 1.0;
                colors[i + 1] = 1.0;
                colors[i + 2] = 1.0;
            }
        }

        system.geometry.attributes.position.needsUpdate = true;
        system.geometry.attributes.color.needsUpdate = true;
        system.material.size = properties.size;
    }

    updateGhostTrail(trail, trailIndex, trailLength, fadeSpeed) {
        const currentGhost = trail[trailIndex];
        currentGhost.position.copy(this.currentModel.position);
        currentGhost.rotation.copy(this.currentModel.rotation);
        currentGhost.scale.copy(this.currentModel.scale);
        currentGhost.material.opacity = 1.0;
        
        // Update trail index
        trailIndex = (trailIndex + 1) % trailLength;

        // Fade out all ghosts
        trail.forEach(ghost => {
            ghost.material.opacity = Math.max(0, ghost.material.opacity - fadeSpeed);
        });
    }

    updateEffectsList() {
        const effectsList = document.getElementById('effectsList');
        
        if (this.effects.length === 0) {
            effectsList.innerHTML = '<p class="no-effects">No effects added</p>';
            return;
        }

        effectsList.innerHTML = '';
        
        this.effects.forEach((effect, index) => {
            const effectItem = document.createElement('div');
            effectItem.className = 'effect-item';
            effectItem.innerHTML = `
                <div class="effect-info">
                    <span class="effect-name">${this.getEffectDisplayName(effect.type)}</span>
                    <span class="effect-target">${this.getTargetDisplayName(effect.target)}</span>
                </div>
                <div class="effect-actions">
                    <button class="toggle-effect-btn ${effect.active ? 'active' : ''}" data-index="${index}">
                        ${effect.active ? 'On' : 'Off'}
                    </button>
                    <button class="remove-effect-btn" data-index="${index}">×</button>
                </div>
            `;
            
            effectItem.addEventListener('click', (e) => {
                if (!e.target.closest('.effect-actions')) {
                    this.selectEffect(effect);
                }
            });
            
            effectsList.appendChild(effectItem);
        });

        // Add event listeners for action buttons
        document.querySelectorAll('.toggle-effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.target.dataset.index);
                this.toggleEffect(index);
            });
        });

        document.querySelectorAll('.remove-effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.target.dataset.index);
                this.removeEffect(index);
            });
        });
    }

    selectEffect(effect) {
        this.selectedEffect = effect;
        this.updateEffectProperties();
        
        // Update UI selection
        document.querySelectorAll('.effect-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const effectItems = document.querySelectorAll('.effect-item');
        const effectIndex = this.effects.indexOf(effect);
        if (effectItems[effectIndex]) {
            effectItems[effectIndex].classList.add('selected');
        }
    }

    toggleEffect(index) {
        const effect = this.effects[index];
        if (!effect) return;

        effect.active = !effect.active;
        
        if (effect.type === 'particles' && effect.system) {
            effect.system.visible = effect.active;
        }
        if (effect.type === 'ghost') {
            const anim = effect.target?.userData?.animations?.find(a => a.effectId === effect.id);
            if (anim) {
                anim.data.trail.forEach(ghost => {
                    ghost.material.opacity = effect.active ? 1.0 : 0;
                });
            }
        }

        this.updateEffectsList();
    }

    removeEffect(index) {
        const effect = this.effects[index];
        if (!effect) return;

        // Clean up effect resources
        if (effect.type === 'particles' && effect.system) {
            this.scene.remove(effect.system);
            effect.system.geometry.dispose();
            effect.system.material.dispose();
        }
        if (effect.type === 'ghost') {
            const anim = effect.target?.userData?.animations?.find(a => a.effectId === effect.id);
            if (anim && anim.data.trail) {
                anim.data.trail.forEach(ghost => {
                    this.scene.remove(ghost);
                    ghost.geometry.dispose();
                    ghost.material.dispose();
                });
            }
        }

        // Remove animations
        if (effect.target && effect.target.userData.animations) {
            effect.target.userData.animations = effect.target.userData.animations.filter(
                anim => anim.effectId !== effect.id
            );
        }

        this.effects.splice(index, 1);
        this.updateEffectsList();
        
        if (this.selectedEffect === effect) {
            this.selectedEffect = null;
            this.updateEffectProperties();
        }
    }

    updateEffectProperties() {
        const propertiesPanel = document.getElementById('effectProperties');
        
        if (!this.selectedEffect) {
            propertiesPanel.innerHTML = '<p class="no-selection">Select an effect to edit properties</p>';
            return;
        }

        const effect = this.selectedEffect;
        const properties = effect.properties;
        
        let html = `<h4>Edit ${this.getEffectDisplayName(effect.type)}</h4>`;

        switch (effect.type) {
            case 'particles':
                html += `
                    <div class="property-group">
                        <label>Particle Type</label>
                        <select id="particleType" data-property="particleType">
                            <option value="fire" ${properties.particleType === 'fire' ? 'selected' : ''}>Fire</option>
                            <option value="smoke" ${properties.particleType === 'smoke' ? 'selected' : ''}>Smoke</option>
                            <option value="sparkles" ${properties.particleType === 'sparkles' ? 'selected' : ''}>Sparkles</option>
                            <option value="water" ${properties.particleType === 'water' ? 'selected' : ''}>Water</option>
                            <option value="magic" ${properties.particleType === 'magic' ? 'selected' : ''}>Magic</option>
                            <option value="snow" ${properties.particleType === 'snow' ? 'selected' : ''}>Snow</option>
                        </select>
                    </div>
                    <div class="property-group">
                        <label>Particle Count</label>
                        <input type="range" id="particleCount" min="100" max="2000" value="${properties.count}" data-property="count">
                    </div>
                    <div class="property-group">
                        <label>Size</label>
                        <input type="range" id="particleSize" min="0.01" max="0.5" step="0.01" value="${properties.size}" data-property="size">
                    </div>
                    <div class="property-group">
                        <label>Speed</label>
                        <input type="range" id="particleSpeed" min="0.1" max="3" step="0.1" value="${properties.speed}" data-property="speed">
                    </div>
                    <div class="property-group">
                        <label>Spread</label>
                        <input type="range" id="particleSpread" min="0.1" max="5" step="0.1" value="${properties.spread}" data-property="spread">
                    </div>
                `;
                break;
                
            case 'glow':
                html += `
                    <div class="property-group">
                        <label>Intensity</label>
                        <input type="range" id="glowIntensity" min="0" max="2" step="0.1" value="${properties.intensity}" data-property="intensity">
                    </div>
                    <div class="property-group">
                        <label>Color</label>
                        <input type="color" id="glowColor" value="${properties.color}" data-property="color">
                    </div>
                    <div class="property-group">
                        <label>Size Multiplier</label>
                        <input type="range" id="glowSize" min="0.5" max="2" step="0.1" value="${properties.size}" data-property="size">
                    </div>
                `;
                break;
                
            case 'rotation':
                html += `
                    <div class="property-group">
                        <label>Speed</label>
                        <input type="range" id="rotationSpeed" min="0.1" max="5" step="0.1" value="${properties.speed}" data-property="speed">
                    </div>
                    <div class="property-group">
                        <label>Axis</label>
                        <select id="rotationAxis" data-property="axis">
                            <option value="x" ${properties.axis === 'x' ? 'selected' : ''}>X-Axis</option>
                            <option value="y" ${properties.axis === 'y' ? 'selected' : ''}>Y-Axis</option>
                            <option value="z" ${properties.axis === 'z' ? 'selected' : ''}>Z-Axis</option>
                        </select>
                    </div>
                `;
                break;
                
            case 'bobbing':
                html += `
                    <div class="property-group">
                        <label>Amplitude</label>
                        <input type="range" id="bobbingAmplitude" min="0.1" max="2" step="0.1" value="${properties.amplitude}" data-property="amplitude">
                    </div>
                    <div class="property-group">
                        <label>Speed</label>
                        <input type="range" id="bobbingSpeed" min="0.1" max="5" step="0.1" value="${properties.speed}" data-property="speed">
                    </div>
                `;
                break;
                
            case 'pulsing':
                html += `
                    <div class="property-group">
                        <label>Min Scale</label>
                        <input type="range" id="pulsingMinScale" min="0.1" max="1" step="0.1" value="${properties.minScale}" data-property="minScale">
                    </div>
                    <div class="property-group">
                        <label>Max Scale</label>
                        <input type="range" id="pulsingMaxScale" min="1" max="3" step="0.1" value="${properties.maxScale}" data-property="maxScale">
                    </div>
                    <div class="property-group">
                        <label>Speed</label>
                        <input type="range" id="pulsingSpeed" min="0.1" max="5" step="0.1" value="${properties.speed}" data-property="speed">
                    </div>
                `;
                break;
            
            case 'colorCycle':
                html += `
                    <div class="property-group">
                        <label>Speed</label>
                        <input type="range" id="colorCycleSpeed" min="0.1" max="10" step="0.1" value="${properties.speed}" data-property="speed">
                    </div>
                    <div class="property-group">
                        <label>Saturation</label>
                        <input type="range" id="colorCycleSaturation" min="0" max="1" step="0.05" value="${properties.saturation}" data-property="saturation">
                    </div>
                    <div class="property-group">
                        <label>Lightness</label>
                        <input type="range" id="colorCycleLightness" min="0" max="1" step="0.05" value="${properties.lightness}" data-property="lightness">
                    </div>
                `;
                break;

            case 'shake':
                html += `
                    <div class="property-group">
                        <label>Intensity</label>
                        <input type="range" id="shakeIntensity" min="0.01" max="1" step="0.01" value="${properties.intensity}" data-property="intensity">
                    </div>
                    <div class="property-group">
                        <label>Speed</label>
                        <input type="range" id="shakeSpeed" min="1" max="20" step="1" value="${properties.speed}" data-property="speed">
                    </div>
                `;
                break;
            
            case 'ghost':
                html += `
                    <div class="property-group">
                        <label>Trail Length</label>
                        <input type="range" id="ghostTrailLength" min="1" max="30" step="1" value="${properties.trailLength}" data-property="trailLength" disabled>
                    </div>
                    <div class="property-group">
                        <label>Fade Speed</label>
                        <input type="range" id="ghostFadeSpeed" min="0.01" max="0.2" step="0.01" value="${properties.fadeSpeed}" data-property="fadeSpeed">
                    </div>
                `;
                break;
        }

        propertiesPanel.innerHTML = html;

        // Add event listeners for property controls
        propertiesPanel.querySelectorAll('input, select').forEach(control => {
            control.addEventListener('input', (e) => {
                this.updateEffectProperty(e.target);
            });
        });
    }

    updateEffectProperty(control) {
        if (!this.selectedEffect) return;

        const property = control.dataset.property;
        const value = control.type === 'range' ? parseFloat(control.value) : control.value;
        
        this.selectedEffect.properties[property] = value;

        const anim = this.selectedEffect.target?.userData?.animations?.find(a => a.effectId === this.selectedEffect.id);
        if (anim) {
            anim.data[property] = value;
        }
        
        // Apply the property change
        this.applyEffectPropertyChange(this.selectedEffect, property, value);
    }

    applyEffectPropertyChange(effect, property, value) {
        switch (effect.type) {
            case 'particles':
                if (effect.system) {
                    if (property === 'size') {
                        effect.system.material.size = value;
                    }
                }
                break;
                
            case 'glow':
                if (effect.target && effect.target.material) {
                    if (property === 'intensity') {
                        effect.target.material.emissiveIntensity = value;
                    } else if (property === 'color') {
                        effect.target.material.emissive.setHex(value.replace('#', '0x'));
                    }
                    effect.target.material.needsUpdate = true;
                }
                break;
        }
    }

    getEffectDisplayName(type) {
        const names = {
            particles: 'Particle System',
            glow: 'Glow Effect',
            rotation: 'Rotation',
            bobbing: 'Bobbing',
            pulsing: 'Pulsing',
            colorCycle: 'Color Cycle',
            shake: 'Shake',
            ghost: 'Ghost Trail'
        };
        return names[type] || type;
    }

    getTargetDisplayName(target) {
        if (target === this.currentModel) {
            return 'Whole Model';
        } else if (target && target.name) {
            return target.name;
        } else {
            return 'Unknown';
        }
    }

    updateEffectsTarget() {
        if (this.selectedMesh) {
            this.effectsTarget = this.selectedMesh;
            document.getElementById('effectsTargetName').textContent = this.getTargetDisplayName(this.selectedMesh);
        } else if (this.currentModel) {
            this.effectsTarget = this.currentModel;
            document.getElementById('effectsTargetName').textContent = 'Whole Model';
        } else {
            this.effectsTarget = null;
            document.getElementById('effectsTargetName').textContent = 'None selected';
        }
    }

    clearAllEffects() {
        this.effects.forEach(effect => {
            if (effect.type === 'particles' && effect.system) {
                this.scene.remove(effect.system);
                effect.system.geometry.dispose();
                effect.system.material.dispose();
            }
            if (effect.type === 'ghost') {
                const anim = effect.target?.userData?.animations?.find(a => a.effectId === effect.id);
                if (anim && anim.data.trail) {
                    anim.data.trail.forEach(ghost => {
                        this.scene.remove(ghost);
                        ghost.geometry.dispose();
                        ghost.material.dispose();
                    });
                }
            }
        });
        
        this.effects = [];
        this.selectedEffect = null;
        this.effectsTarget = null;
        
        this.updateEffectsList();
        this.updateEffectProperties();
        this.updateEffectsTarget();
        
        // Clear animations from all objects
        if (this.currentModel) {
            this.currentModel.traverse((child) => {
                if (child.userData.animations) {
                    child.userData.animations = [];
                }
            });
        }
    }

    removeSelectedMesh() {
        if (!this.selectedMesh) return;

        this.selectedMesh.visible = false;

        const hierarchyItem = document.querySelector(`.hierarchy-item[data-uuid="${this.selectedMesh.uuid}"]`);
        if (hierarchyItem) {
            hierarchyItem.classList.add('removed');
        }

        this.selectMesh(null);
    }

    setTransformMode(mode) {
        if (!this.transformControls) return;
        this.transformControls.setMode(mode);

        document.querySelectorAll('.transform-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ModelEditor();
});