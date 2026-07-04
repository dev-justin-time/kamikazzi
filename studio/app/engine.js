import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import JSZip from 'jszip';
// nipplejs is now used inside InputManager, not here directly
// import nipplejs from 'nipplejs'; 

// Import Systems
import { ProceduralSystem } from './modules/ProceduralSystem.js';
import { PhysicsSystem } from './modules/PhysicsSystem.js';
import { SculptSystem } from './modules/SculptSystem.js';
import { TexturePaintSystem } from './modules/TexturePaintSystem.js';
import { VertexPaintSystem } from './modules/VertexPaintSystem.js';
import { NodeEditorSystem } from './modules/NodeEditorSystem.js';
import { UIManager } from './UIManager.js';
import { InputManager } from './modules/InputManager.js';
import { AudioSystem } from './modules/AudioSystem.js';
import { CloudSystem } from './modules/CloudSystem.js';

// Import Marketplace
import { MarketplaceAPI } from './modules/marketplace/index.js';
import { MarketplaceUI } from './modules/marketplace/marketplace-ui.js';

class ProModelerStudio {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControls = null;
        
        this.objects = [];
        this.selectedObject = null;
        this.currentTool = 'select';
        this.viewMode = 'solid';
        
        this.materials = new Map();
        this.lights = [];
        this.animations = [];
        
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSize = 50;
        this.clipboardObject = null;
        this.isAnimationPlaying = false;
        this.currentFrame = 1;
        this.totalFrames = 250;
        this.keyframes = new Map();
        this.plugins = new Map();
        this.sculptMode = false;
        this.sculptBrush = {
            size: 1.0,
            strength: 0.5,
            type: 'grab'
        };
        
        this.texturePaintMode = false;
        this.vertexPaintMode = false;
        
        // Initialize Core Three.js (Scene, Camera, Renderer) before systems
        this.initCore();
        
        // Initialize Systems
        this.ui = new UIManager(this);
        this.inputManager = new InputManager(this);
        this.physicsSystem = new PhysicsSystem(this);
        this.proceduralSystem = new ProceduralSystem(this);
        this.sculptSystem = new SculptSystem(this);
        this.nodeEditorSystem = new NodeEditorSystem(this);
        this.texturePaintSystem = new TexturePaintSystem(this);
        this.vertexPaintSystem = new VertexPaintSystem(this);
        this.audioSystem = new AudioSystem(this);
        this.cloudSystem = new CloudSystem(this);
        
        this.volumetricFog = null;
        this.textureLibrary = new Map();
        this.hdriLibrary = new Map();
        this.cameraManager = null;
        this.performanceProfiler = null;
        this.customShaders = new Map();
        this.importExport = null;
        this.advancedLighting = null;
        this.marketplaceAPI = null;
        this.marketplaceUI = null;
        this._marketplaceInited = false;
        this.morphTargets = null;
        this.audioReactive = null;
        
        this.moveSpeed = 3.0;
        this.isTransforming = false;
        this.lastTransformEnd = 0;
        
        this.gltfLoader = new GLTFLoader();
        const draco = new DRACOLoader();
        draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        this.gltfLoader.setDRACOLoader(draco);
        
        this.finishInit();
        this.setupAdvancedFeatures();
        
        // Initialize Input Manager explicitly
        if (this.inputManager) this.inputManager.init();
        
        this.animate();
    }

    initCore() {
        // Initialize Three.js scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(5, 5, 5);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        const viewport = document.getElementById('viewport');
        this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        
        viewport.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
    }

    finishInit() {
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minPolarAngle = 0.1;
        this.controls.maxPolarAngle = Math.PI - 0.1;
        this.controls.enableKeys = false;
        this.controls.addEventListener('change', () => this.updateNavCubeOrientation());
        
        // Transform controls
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('change', () => this.render());
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
            this.isTransforming = event.value;
        });
        this.transformControls.addEventListener('mouseDown', () => { this.isTransforming = true; });
        this.transformControls.addEventListener('mouseUp', () => { 
            this.isTransforming = false; 
            this.lastTransformEnd = performance.now();
        });
        this.transformControls.addEventListener('objectChange', () => {
            if (this.selectedObject) this.ui.updatePropertiesPanel(this.selectedObject);
        });
        this.scene.add(this.transformControls);
        
        // Grid
        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
        this.scene.add(gridHelper);
        
        this.setupDefaultLighting();
        this.addDefaultObjects();
        this.ui.init();
        
        this.render();
        this.updateNavCubeOrientation();
    }

    setupDefaultLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        this.lights.push(directionalLight);
        
        const pointLight = new THREE.PointLight(0x4a9eff, 0.5, 100);
        pointLight.position.set(-5, 5, -5);
        this.scene.add(pointLight);
        this.lights.push(pointLight);
    }

    addDefaultObjects() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x666666, roughness: 0.3, metalness: 0.1
        });
        const cube = new THREE.Mesh(geometry, material);
        cube.castShadow = true;
        cube.receiveShadow = true;
        cube.name = 'Cube';
        
        this.scene.add(cube);
        this.objects.push(cube);
        this.selectObject(cube);
    }

    selectObject(object) {
        if (this.selectedObject) {
            this.removeSelectionOutline();
        }
        
        this.selectedObject = object;
        
        if (object) {
            this.addSelectionOutline(object);
            this.transformControls.attach(object);
            this.ui.updatePropertiesPanel(object);
            this.ui.updateOutlinerSelection(object);
        } else {
            this.transformControls.detach();
            this.ui.updateOutlinerSelection({});
        }
    }

    addSelectionOutline(object) {
        this.removeSelectionOutline();
        if (object.isMesh && object.geometry) {
            const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x4a9eff, side: THREE.BackSide });
            const outlineMesh = new THREE.Mesh(object.geometry, outlineMaterial);
            outlineMesh.scale.copy(object.scale).multiplyScalar(1.06);
            outlineMesh.name = 'outline';
            object.add(outlineMesh);
        } else {
            const box = new THREE.BoxHelper(object, 0x4a9eff);
            box.name = '__boxHelper';
            this.scene.add(box);
            object.userData.__boxHelper = box;
        }
    }

    removeSelectionOutline() {
        if (this.selectedObject) {
            const outline = this.selectedObject.getObjectByName('outline');
            if (outline) this.selectedObject.remove(outline);
            if (this.selectedObject.userData.__boxHelper) {
                this.scene.remove(this.selectedObject.userData.__boxHelper);
                delete this.selectedObject.userData.__boxHelper;
            }
        }
    }

    setupAdvancedFeatures() {
        this.setupAdvancedRaycasting();
        this.nodeEditorSystem.init();
        this.setupAdvancedMaterials();
        this.initializeAnimationSystem();
        this.initializePluginSystem();
        this.setupAdvancedPrimitives();
        this.proceduralSystem.init();
        this.initializeVolumetricEffects();
        this.initializeAdvancedCamera();
        this.initializePerformanceProfiler();
        this.initializeCustomShaders();
        this.initializeImportExport();
        this.initializeAdvancedLighting();
        this.initializeMorphTargets();
        this.initializeMarketplace();
    }
    
    // ... Feature initialization methods ...

    initializeVolumetricEffects() {
        this.volumetricFog = {
            enabled: false,
            density: 0.1,
            color: new THREE.Color(0x404040),
            create: () => {
                this.scene.fog = new THREE.Fog(this.volumetricFog.color, 1, 100);
                this.ui.log('Volumetric fog enabled', 'success');
            },
            remove: () => {
                this.scene.fog = null;
                this.ui.log('Volumetric fog disabled', 'info');
            }
        };
    }

    initializeAdvancedCamera() {
        this.cameraManager = {
            cameras: [],
            activeCamera: this.camera,
            addCamera: (type, position) => {
                let camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
                if (position) camera.position.copy(position);
                camera.name = `${type} Camera`;
                this.scene.add(camera);
                this.cameraManager.cameras.push(camera);
                this.ui.log('Added camera', 'success');
                return camera;
            },
            switchCamera: (index) => {
                if (index < this.cameraManager.cameras.length) {
                    this.cameraManager.activeCamera = this.cameraManager.cameras[index];
                    this.camera = this.cameraManager.activeCamera;
                    this.controls.object = this.camera;
                    this.ui.log(`Switched to ${this.camera.name}`, 'info');
                }
            },
            animateCamera: (targetPosition, targetLookAt, duration) => {
                const start = this.camera.position.clone();
                const startTime = Date.now();
                const animate = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    this.camera.position.lerpVectors(start, targetPosition, eased);
                    if (targetLookAt) this.camera.lookAt(targetLookAt);
                    this.updateNavCubeOrientation();
                    if (progress < 1) requestAnimationFrame(animate);
                };
                animate();
            }
        };
    }

    initializePerformanceProfiler() {
        this.performanceProfiler = {
            enabled: false,
            frameCount: 0,
            lastTime: performance.now(),
            fps: 60,
            memory: { used: 0, total: 0 },
            drawCalls: 0,
            triangles: 0,
            
            update: () => {
                const now = performance.now();
                this.performanceProfiler.frameCount++;
                if (now - this.performanceProfiler.lastTime >= 1000) {
                    this.performanceProfiler.fps = Math.round((this.performanceProfiler.frameCount * 1000) / (now - this.performanceProfiler.lastTime));
                    this.performanceProfiler.frameCount = 0;
                    this.performanceProfiler.lastTime = now;
                    if (performance.memory) {
                        this.performanceProfiler.memory.used = Math.round(performance.memory.usedJSHeapSize / 1048576);
                    }
                    if (this.renderer.info) {
                        this.performanceProfiler.drawCalls = this.renderer.info.render.calls;
                        this.performanceProfiler.triangles = this.renderer.info.render.triangles;
                    }
                    this.ui.updatePerformanceUI(this.performanceProfiler);
                }
            },
            toggle: () => {
                this.performanceProfiler.enabled = !this.performanceProfiler.enabled;
                this.ui.togglePerfMonitor(this.performanceProfiler.enabled);
            }
        };
    }

    initializeCustomShaders() {
        this.customShaders.set('hologram', {
            vertexShader: `varying vec3 vN; void main() { vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `varying vec3 vN; uniform float time; void main() { gl_FragColor = vec4(0.0, 1.0, 1.0, 0.5 + 0.5 * sin(time * 5.0)); }`,
            uniforms: { time: { value: 0.0 } }
        });
    }

    initializeImportExport() {
        this.importExport = {
            importModel: (source) => {
                // Multi-file package
                if (source && typeof source === 'object' && source.url && source.files) {
                    return this.importGLTFMulti(source);
                }
                if (source instanceof File) {
                    const ext = source.name.toLowerCase().split('.').pop();
                    if (ext === 'gltf' || ext === 'glb') return this.importGLTF(source);
                    this.ui.log(`Unsupported: ${ext}`, 'error');
                    return;
                }
                if (typeof source === 'string') {
                    return this.importGLTF(source);
                }
                this.ui.log('Unrecognized import source', 'error');
            },
            exportModel: (format, object) => {
                if (format === 'gltf' || format === 'glb') this.exportGLTF(object, format === 'glb');
                else if (format === 'obj') this.exportOBJ(object);
                else if (format === 'stl') this.exportSTL(object);
            },
            exportImage: (width, height) => {
                const orig = this.renderer.getSize(new THREE.Vector2());
                this.renderer.setSize(width, height, false);
                this.camera.aspect = width / height;
                this.camera.updateProjectionMatrix();
                this.render();
                const link = document.createElement('a');
                link.download = `render_${Date.now()}.png`;
                link.href = this.renderer.domElement.toDataURL('image/png');
                link.click();
                this.renderer.setSize(orig.x, orig.y, false);
                this.camera.aspect = orig.x / orig.y;
                this.camera.updateProjectionMatrix();
                this.render();
                this.ui.log('Exported image', 'success');
            }
        };
    }

    importGLTF(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.gltfLoader.parse(e.target.result, '', (gltf) => {
                    const root = gltf.scene || gltf.scenes[0];
                    root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
                    root.name = file.name.replace(/\.[^/.]+$/, '');
                    this.scene.add(root);
                    this.objects.push(root);
                    this.selectObject(root);
                    this.ui.updateOutliner();
                    this.frameSelected();
                    this.ui.log(`Imported ${file.name}`, 'success');
                    resolve(root);
                }, (err) => {
                    this.ui.log(err.message, 'error');
                    reject(err);
                });
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    /** Import a multi-file glTF package (.gltf + .bin + textures) via URLModifier mapping */
    importGLTFMulti(pkg) {
        return new Promise((resolve, reject) => {
            // Isolated manager so URLModifier doesn't leak to DefaultLoadingManager
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
                const filename = url.split('/').pop().split('?')[0];
                if (pkg.files[filename]) return pkg.files[filename];
                if (url.startsWith('data:')) return url;
                const decoded = decodeURIComponent(filename);
                if (pkg.files[decoded]) return pkg.files[decoded];
                return url;
            });

            const loader = new GLTFLoader(manager);
            const draco = new DRACOLoader();
            draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
            loader.setDRACOLoader(draco);

            const nameHint = pkg.name || 'Imported';
            const revokeAll = () => {
                Object.values(pkg.files).forEach(u => URL.revokeObjectURL(u));
            };

            loader.load(pkg.url, (gltf) => {
                const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
                root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
                root.name = nameHint.replace(/\.[^/.]+$/, '');
                this.scene.add(root);
                this.objects.push(root);
                this.selectObject(root);
                this.ui.updateOutliner();
                this.frameSelected();
                this.ui.log(`Imported ${nameHint} (${Object.keys(pkg.files).length} files)`, 'success');
                revokeAll();
                resolve(root);
            }, undefined, (err) => {
                this.ui.log(`Import failed: ${err.message}`, 'error');
                revokeAll();
                reject(err);
            });
        });
    }

    exportGLTF(object, binary) {
        const exporter = new GLTFExporter();
        exporter.parse(object || this.scene, (result) => {
            const blob = new Blob([binary ? result : JSON.stringify(result)], { type: binary ? 'model/gltf-binary' : 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = binary ? 'export.glb' : 'export.gltf';
            a.click();
            this.ui.log('Exported GLTF', 'success');
        }, { binary, onlyVisible: true });
    }

    exportOBJ(object) {
        const exporter = new OBJExporter();
        const data = exporter.parse(object || this.scene);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain' }));
        a.download = 'export.obj';
        a.click();
        this.ui.log('Exported OBJ', 'success');
    }
    
    exportSTL(object) {
        const exporter = new STLExporter();
        const data = exporter.parse(object || this.scene);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'application/sla' }));
        a.download = 'export.stl';
        a.click();
        this.ui.log('Exported STL', 'success');
    }

    initializeAdvancedLighting() {
        this.advancedLighting = {
            generateLightmap: (object) => {
                return { bake: () => this.ui.log('Lightmap baking sim...', 'info') };
            }
        };
    }

    initializeMarketplace() {
        // Set up lazy initialization on marketplace tab click
        const bottomPanel = document.querySelector('.bottom-panel');
        if (!bottomPanel) return;

        const marketplaceTab = bottomPanel.querySelector('.tab[data-panel="marketplace"]');
        if (marketplaceTab) {
            marketplaceTab.addEventListener('click', () => {
                if (this._marketplaceInited) return;
                this._marketplaceInited = true;
                this._mountMarketplace();
            }, { once: true });
        }
    }

    _mountMarketplace() {
        const panel = document.querySelector('.marketplace-panel');
        if (!panel) {
            console.warn('[Marketplace] .marketplace-panel not found');
            return;
        }

        try {
            // Create MarketplaceAPI with the editor as the editorState
            this.marketplaceAPI = new MarketplaceAPI(this, {
                publishableKey: null, // Will be set via configureStripe() when ready
                checkoutEndpoint: null,
            });

            // Initialize
            this.marketplaceAPI.init();

            // Mount MarketplaceUI into the panel
            this.marketplaceUI = new MarketplaceUI(this.marketplaceAPI, panel);
            this.marketplaceUI.mount();

            this.ui.log('Marketplace loaded — browse, publish, and purchase assets.', 'success');
        } catch (err) {
            console.error('[Marketplace] Failed to initialize:', err);
            panel.innerHTML = `<div class="k3d-mkt-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to load Marketplace</h3>
                <p>${err.message || 'Unknown error'}</p>
            </div>`;
        }
    }

    /**
     * Import a .k3dasset file into the scene
     */
    async importK3dAsset(file) {
        // Delegate to the marketplace AssetBundler if available
        if (this.marketplaceAPI && this.marketplaceAPI.assets) {
            try {
                const bundle = await this.marketplaceAPI.assets.importBundle(file);
                if (bundle && bundle.items) {
                    this._reconstructBundleInScene(bundle);
                }
                return bundle;
            } catch (err) {
                this.ui.log(`K3dAsset import failed: ${err.message}`, 'error');
                throw err;
            }
        }

        // Fallback: try basic JSON parse + scene reconstruction
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const bundle = JSON.parse(e.target.result);
                    if (bundle.format !== 'k3dasset') {
                        reject(new Error('Invalid .k3dasset format'));
                        return;
                    }
                    this._reconstructBundleInScene(bundle);
                    resolve(bundle);
                } catch (err) {
                    reject(new Error(`Failed to parse .k3dasset: ${err.message}`));
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Reconstruct scene objects from a .k3dasset bundle's items
     */
    _reconstructBundleInScene(bundle) {
        const group = new THREE.Group();
        group.name = bundle.title || 'Imported Asset';

        for (const item of (bundle.items || [])) {
            const mesh = this._itemToMesh(item);
            if (mesh) group.add(mesh);
        }

        if (group.children.length > 0) {
            this.scene.add(group);
            this.objects.push(group);
            this.selectObject(group);
            this.frameSelected();
            this.ui.updateOutliner();
            this.ui.log(`Imported "${group.name}" (${group.children.length} objects)`, 'success');
        } else {
            this.ui.log('Bundle contained no reconstructable geometry', 'warning');
        }
    }

    /**
     * Convert a bundle item to a Three.js Mesh
     */
    _itemToMesh(item) {
        if (!item || item.type !== 'mesh') return null;

        // Try parametric geometry reconstruction
        let geometry = null;
        if (item.geometry?.parameters) {
            geometry = this._parametricGeometry(item.geometry.parameters);
        }

        if (!geometry) {
            // Use a placeholder box
            geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }

        // Build material
        let material = null;
        if (item.material) {
            const matData = Array.isArray(item.material) ? item.material[0] : item.material;
            if (matData) {
                material = new THREE.MeshStandardMaterial({
                    color: matData.color !== undefined ? matData.color : 0x60a5fa,
                    roughness: matData.roughness ?? 0.3,
                    metalness: matData.metalness ?? 0.1,
                });
            }
        }

        if (!material) {
            material = new THREE.MeshStandardMaterial({
                color: 0x60a5fa,
                roughness: 0.3,
                metalness: 0.1,
            });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = item.name || 'Asset Part';
        if (item.position) mesh.position.fromArray(item.position);
        if (item.rotation) mesh.rotation.fromArray(item.rotation);
        if (item.scale) mesh.scale.fromArray(item.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * Try to recreate a Three.js geometry from serialized parameters
     */
    _parametricGeometry(params) {
        if (!params) return null;
        try {
            if (params.radius !== undefined && params.radiusTop !== undefined) {
                return new THREE.CylinderGeometry(params.radiusTop, params.radiusBottom || params.radiusTop, params.height || 1, params.radialSegments || 16);
            }
            if (params.radius !== undefined) {
                return new THREE.SphereGeometry(params.radius, params.widthSegments || 24, params.heightSegments || 18);
            }
            if (params.width !== undefined && params.height !== undefined && params.depth !== undefined) {
                return new THREE.BoxGeometry(params.width, params.height, params.depth);
            }
            if (params.width !== undefined && params.height !== undefined) {
                return new THREE.PlaneGeometry(params.width, params.height);
            }
        } catch { /* ignore */ }
        return null;
    }

    initializeMorphTargets() {
        this.morphTargets = {
            createTarget: (object, name) => {
                if (!object.geometry) return;
                const pos = object.geometry.attributes.position;
                const target = pos.clone();
                for(let i=0; i<target.count; i++) target.setY(i, target.getY(i) + Math.random()*0.5);
                if (!object.geometry.morphAttributes.position) object.geometry.morphAttributes.position = [];
                object.geometry.morphAttributes.position.push(target);
                object.material.morphTargets = true;
                object.material.needsUpdate = true;
                this.ui.log(`Created morph ${name}`, 'success');
            },
            setWeight: (object, name, weight) => {
                if(object.morphTargetInfluences) object.morphTargetInfluences[0] = weight; // simplified
                this.render();
            }
        };
    }

    setupAdvancedRaycasting() {
        // Moved to InputManager
    }

    getSelectableFromObject(object) {
        let o = object;
        while (o && !o.isMesh) o = o.parent;
        return (o && o.isMesh) ? o : null;
    }

    setObjectHover(object, isHovered) {
        const mesh = this.getSelectableFromObject(object);
        if (!mesh) return;
        if (isHovered && mesh !== this.selectedObject) {
            if (!mesh.getObjectByName('__hoverOutline')) {
                const mat = new THREE.MeshBasicMaterial({ color: 0x4a9eff, side: THREE.BackSide });
                const outline = new THREE.Mesh(mesh.geometry, mat);
                outline.scale.copy(mesh.scale).multiplyScalar(1.04);
                outline.name = '__hoverOutline';
                mesh.add(outline);
            }
        } else {
            const existing = mesh.getObjectByName('__hoverOutline');
            if (existing) mesh.remove(existing);
        }
    }

    setupAdvancedMaterials() {
        this.materialPresets = {
            'Chrome': { metallic: 1.0, roughness: 0.1, color: 0xffffff },
            'Gold': { metallic: 1.0, roughness: 0.15, color: 0xffd700 },
            'Plastic': { metallic: 0.0, roughness: 0.5, color: 0xff4444 },
            'Glass': { metallic: 0.0, roughness: 0.0, color: 0xffffff, transmission: 1.0, thickness: 1.0, transparent: true },
            'Rubber': { metallic: 0.0, roughness: 0.9, color: 0x333333 },
            'Wood': { metallic: 0.0, roughness: 0.8, color: 0x8b4513 },
            // Advanced Presets
            'Holographic': { 
                metallic: 0.5, roughness: 0.2, color: 0x00ffff, 
                transparent: true, opacity: 0.6,
                emissive: 0x0044aa, emissiveIntensity: 0.5,
                transmission: 0.2
            },
            'Carbon Fiber': {
                metallic: 0.8, roughness: 0.4, color: 0x111111,
                clearcoat: 1.0, clearcoatRoughness: 0.1
            },
            'Iridescent': {
                metallic: 1.0, roughness: 0.1, color: 0xffffff,
                iridescence: 1.0, iridescenceIOR: 1.3
            },
            'Ceramic': {
                metallic: 0.0, roughness: 0.1, color: 0xffffff,
                clearcoat: 1.0, clearcoatRoughness: 0.05
            }
        };
    }

    applyMaterialPreset(presetName) {
        if (!this.selectedObject || !this.materialPresets[presetName]) return;
        const preset = this.materialPresets[presetName];
        let material = this.selectedObject.material;
        
        // Upgrade to MeshPhysicalMaterial if advanced properties are needed
        if (preset.transmission || preset.clearcoat || preset.iridescence || preset.sheen) {
            if (material.type !== 'MeshPhysicalMaterial') {
                const newMat = new THREE.MeshPhysicalMaterial();
                newMat.color.copy(material.color);
                newMat.map = material.map;
                this.selectedObject.material = newMat;
                material = newMat;
            }
        }

        material.color.setHex(preset.color);
        material.metalness = preset.metallic !== undefined ? preset.metallic : 0;
        material.roughness = preset.roughness !== undefined ? preset.roughness : 0.5;
        
        // Reset advanced props if it is physical material
        if(material.isMeshPhysicalMaterial) {
            material.transmission = 0;
            material.clearcoat = 0;
            material.iridescence = 0;
            material.emissiveIntensity = 0;
        }

        if (preset.transparent !== undefined) {
            material.transparent = preset.transparent;
            material.opacity = preset.opacity || 1.0;
        }
        
        // Apply Advanced
        if (preset.transmission) { material.transmission = preset.transmission; material.thickness = preset.thickness || 1; }
        if (preset.clearcoat) { material.clearcoat = preset.clearcoat; material.clearcoatRoughness = preset.clearcoatRoughness || 0; }
        if (preset.iridescence) { material.iridescence = preset.iridescence; material.iridescenceIOR = preset.iridescenceIOR || 1.3; }
        if (preset.emissive) { material.emissive.setHex(preset.emissive); material.emissiveIntensity = preset.emissiveIntensity || 1; }

        material.needsUpdate = true;
        this.render();
        this.ui.updateMaterialUI(preset);
    }

    initializeAnimationSystem() {
        this.animationMixer = null;
        this.animationClock = new THREE.Clock();
    }

    setCurrentFrame(frame) {
        this.currentFrame = Math.max(1, Math.min(frame, this.totalFrames));
        const frameInput = document.querySelector('.frame-input input');
        if (frameInput) frameInput.value = this.currentFrame;
        this.ui.updateTimelineScrubber();
    }

    addKeyframe(frame) {
        if (!this.selectedObject) return;
        const objectId = this.selectedObject.uuid;
        if (!this.keyframes.has(objectId)) this.keyframes.set(objectId, []);
        const keyframes = this.keyframes.get(objectId);
        keyframes.push({
            frame,
            position: this.selectedObject.position.clone(),
            rotation: this.selectedObject.rotation.clone(),
            scale: this.selectedObject.scale.clone()
        });
        this.ui.updateTimelineKeyframes();
        this.ui.log(`Keyframe added at ${frame}`, 'success');
    }

    playAnimation() {
        this.isAnimationPlaying = true;
        document.querySelector('[data-action="play"]').innerHTML = '<i class="fas fa-pause"></i>';
        this.animateToNextFrame();
    }

    pauseAnimation() {
        this.isAnimationPlaying = false;
        document.querySelector('[data-action="play"]').innerHTML = '<i class="fas fa-play"></i>';
    }

    animateToNextFrame() {
        if (!this.isAnimationPlaying) return;
        const fps = Math.max(1, parseInt(this.ui.frameRateInput?.value || '24'));
        const speed = Math.max(0.1, parseFloat(this.ui.animSpeedInput?.value || '1'));
        const interval = 1000 / (fps * speed);
        this.currentFrame = (this.currentFrame % this.totalFrames) + 1;
        this.setCurrentFrame(this.currentFrame);
        this.interpolateKeyframes();
        this.render();
        setTimeout(() => this.animateToNextFrame(), interval);
    }

    interpolateKeyframes() {
        this.objects.forEach(object => {
            if (this.keyframes.has(object.uuid)) {
                const kfs = this.keyframes.get(object.uuid).sort((a,b) => a.frame - b.frame);
                let prev, next;
                for (let k of kfs) {
                    if (k.frame <= this.currentFrame) prev = k;
                    if (k.frame >= this.currentFrame && !next) next = k;
                }
                if (prev && next) {
                    const t = (this.currentFrame - prev.frame) / (next.frame - prev.frame || 1);
                    object.position.lerpVectors(prev.position, next.position, t);
                    object.scale.lerpVectors(prev.scale, next.scale, t);
                    object.rotation.x = THREE.MathUtils.lerp(prev.rotation.x, next.rotation.x, t);
                    object.rotation.y = THREE.MathUtils.lerp(prev.rotation.y, next.rotation.y, t);
                    object.rotation.z = THREE.MathUtils.lerp(prev.rotation.z, next.rotation.z, t);
                }
            }
        });
    }

    initializePluginSystem() {
        this.plugins.set('auto-retopology', { execute: () => this.ui.log('Retopology simulated', 'success') });
    }

    setupAdvancedPrimitives() {
        this.advancedPrimitives = {
            'icosahedron': () => new THREE.IcosahedronGeometry(1, 0),
            'cone': () => new THREE.ConeGeometry(0.5, 1, 32),
            'tube': () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-1,0,0), new THREE.Vector3(1,0,0)]), 20, 0.2, 8, false)
        };
    }

    addAdvancedPrimitive(type) {
        if (!this.advancedPrimitives[type]) return;
        const mesh = new THREE.Mesh(this.advancedPrimitives[type](), new THREE.MeshStandardMaterial({color: Math.random()*0xffffff}));
        mesh.name = type;
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.objects.push(mesh);
        this.selectObject(mesh);
        this.ui.updateOutliner();
    }

    saveProject() {
        const data = {
            objects: this.objects.map(o => ({
                name: o.name, position: o.position.toArray(), rotation: o.rotation.toArray(), scale: o.scale.toArray(),
                material: o.material ? { color: o.material.color.getHex() } : null
            }))
        };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
        a.download = 'project.json';
        a.click();
        this.ui.log('Project saved', 'success');
    }

    loadProject(data) {
        this.objects.forEach(o => this.scene.remove(o));
        this.objects = [];
        data.objects.forEach(d => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({color: d.material?.color || 0xcccccc}));
            mesh.name = d.name;
            mesh.position.fromArray(d.position);
            mesh.rotation.fromArray(d.rotation.slice(0,3));
            mesh.scale.fromArray(d.scale);
            this.scene.add(mesh);
            this.objects.push(mesh);
        });
        this.ui.updateOutliner();
    }

    newProject() {
        this.objects.forEach(o => this.scene.remove(o));
        this.objects = [];
        this.addDefaultObjects();
        this.ui.updateOutliner();
        this.ui.log('New project created', 'info');
    }

    addPrimitive(type) {
        let geom;
        if (type === 'cube') geom = new THREE.BoxGeometry();
        else if (type === 'sphere') geom = new THREE.SphereGeometry(0.5, 32, 16);
        else if (type === 'cylinder') geom = new THREE.CylinderGeometry(0.5, 0.5, 1);
        else if (type === 'plane') geom = new THREE.PlaneGeometry(2,2);
        else if (type === 'torus') geom = new THREE.TorusGeometry(0.5, 0.2);
        
        if (geom) {
            const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({color: Math.random()*0xffffff}));
            mesh.name = type.charAt(0).toUpperCase() + type.slice(1);
            if(type === 'plane') mesh.rotation.x = -Math.PI/2;
            mesh.castShadow = true; mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);
            this.selectObject(mesh);
            this.ui.updateOutliner();
        }
    }

    addLight(type) {
        const light = (type === 'point') ? new THREE.PointLight(0xffffff, 1) : new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0,5,0);
        light.name = type + ' light';
        this.scene.add(light);
        this.lights.push(light);
        this.ui.updateOutliner();
    }

    setViewMode(mode) {
        this.viewMode = mode;
        this.objects.forEach(o => {
            if (o.material) o.material.wireframe = (mode === 'wireframe');
        });
        this.render();
    }

    setTransformMode(mode) {
        this.currentTool = mode;
        if (['move','rotate','scale'].includes(mode)) this.transformControls.setMode(mode === 'move' ? 'translate' : mode);
        else this.transformControls.detach();
    }

    updateNavCubeOrientation() {
        const nav = document.querySelector('.nav-cube');
        if (nav) {
            const az = this.controls.getAzimuthalAngle();
            const pol = this.controls.getPolarAngle();
            nav.style.transform = `rotateX(${THREE.MathUtils.radToDeg(pol - Math.PI/2)}deg) rotateY(${-THREE.MathUtils.radToDeg(az)}deg)`;
        }
    }
    
    setCameraView(view) {
        const dist = this.camera.position.distanceTo(this.controls.target);
        const map = { front: [0,0,1], back: [0,0,-1], left: [-1,0,0], right: [1,0,0], top: [0,1,0], bottom: [0,-1,0] };
        if (map[view]) {
            const v = new THREE.Vector3(...map[view]).multiplyScalar(dist);
            this.cameraManager.animateCamera(this.controls.target.clone().add(v), this.controls.target, 500);
        } else if (view === 'perspective') {
            const v = new THREE.Vector3(1,1,1).normalize().multiplyScalar(dist);
            this.cameraManager.animateCamera(this.controls.target.clone().add(v), this.controls.target, 500);
        }
    }

    handleMenuAction(action) {
        switch(action) {
            case 'add-cube': this.addPrimitive('cube'); break;
            case 'add-sphere': this.addPrimitive('sphere'); break;
            case 'add-cylinder': this.addPrimitive('cylinder'); break;
            case 'add-plane': this.addPrimitive('plane'); break;
            case 'add-torus': this.addPrimitive('torus'); break;
            case 'add-light': this.addLight('point'); break;
            
            // Procedural Generation Actions
            case 'gen-terrain': 
                const terrain = this.proceduralSystem.generateTerrain(20, 32, 2, 2);
                this.selectObject(terrain);
                this.ui.updateOutliner();
                break;
            case 'gen-tree':
                const tree = this.proceduralSystem.generateTree(3 + Math.random() * 2, 5);
                this.selectObject(tree);
                this.ui.updateOutliner();
                break;
            case 'gen-rock':
                const rock = this.proceduralSystem.generateRock(0.5 + Math.random() * 0.5, 0.4);
                this.selectObject(rock);
                this.ui.updateOutliner();
                break;
            case 'gen-building':
                const building = this.proceduralSystem.generateBuilding(Math.floor(3 + Math.random() * 5), 2, 2);
                this.selectObject(building);
                this.ui.updateOutliner();
                break;
            
            // New Actions for Physics/Audio
            case 'add-cloth':
                if (this.physicsSystem) {
                    this.physicsSystem.setEnabled(true);
                    const cloth = this.physicsSystem.createCloth(4, 4, 10);
                    this.selectObject(cloth);
                }
                break;
            case 'add-fluid':
                if (this.physicsSystem) {
                    this.physicsSystem.setEnabled(true);
                    this.physicsSystem.createFluid(new THREE.Vector3(0, 5, 0), 100);
                }
                break;
            case 'test-audio':
                if (this.audioSystem) {
                    this.audioSystem.init();
                    if (this.selectedObject) {
                        this.audioSystem.setTarget(this.selectedObject);
                        this.audioSystem.playTestTone();
                    } else {
                        this.ui.log('Select object for audio reaction', 'warning');
                    }
                }
                break;

            case 'delete': if(this.selectedObject) { this.scene.remove(this.selectedObject); this.objects = this.objects.filter(o=>o!==this.selectedObject); this.selectObject(null); this.ui.updateOutliner(); } break;
            case 'duplicate': if(this.selectedObject) { const c = this.selectedObject.clone(); this.scene.add(c); this.objects.push(c); this.selectObject(c); this.ui.updateOutliner(); } break;
            case 'frame-selected': this.frameSelected(); break;
            case 'frame-all': this.frameAll(); break;
            case 'sculpt': this.sculptMode = true; this.currentTool = 'sculpt'; this.ui.showSculptTools(); this.ui.log('Sculpt Mode', 'info'); break;
            case 'texture-paint': 
                this.texturePaintMode = !this.texturePaintMode;
                this.texturePaintSystem.setEnabled(this.texturePaintMode);
                this.ui.toggleTexturePaintUI(this.texturePaintMode);
                // Disable vertex paint if active
                if (this.texturePaintMode && this.vertexPaintMode) this.handleMenuAction('vertex-paint');
                this.ui.log(`Texture Paint Mode ${this.texturePaintMode ? 'ON' : 'OFF'}`, 'info');
                break;
            case 'vertex-paint':
                this.vertexPaintMode = !this.vertexPaintMode;
                this.vertexPaintSystem.setEnabled(this.vertexPaintMode);
                this.ui.toggleVertexPaintUI(this.vertexPaintMode);
                // Disable texture paint if active
                if (this.vertexPaintMode && this.texturePaintMode) this.handleMenuAction('texture-paint');
                this.ui.log(`Vertex Paint Mode ${this.vertexPaintMode ? 'ON' : 'OFF'}`, 'info');
                break;
            case 'animate': this.ui.log('Animation panel opened', 'info'); break;
            case 'physics': 
                this.physicsSystem.setEnabled(!this.physicsSystem.enabled);
                this.ui.log(`Physics ${this.physicsSystem.enabled ? 'Enabled' : 'Disabled'}`, 'info');
                break;
            case 'particles': this.ui.log('Particles system pending', 'warning'); break;
            case 'save': this.saveProject(); break;
            case 'new': this.newProject(); break;
            case 'import': document.getElementById('modelImport')?.click(); break;
            case 'open': document.getElementById('projectOpen')?.click(); break;
            // ... map other actions
        }
    }

    handleTimelineAction(action) {
        if (action === 'play') this.playAnimation();
        else if (action === 'pause') this.pauseAnimation();
        else if (action === 'stop') { this.pauseAnimation(); this.setCurrentFrame(1); }
    }

    updateObjectProperty(input) {
        if (!this.selectedObject) return;
        const row = input.closest('.property-row');
        const label = row.querySelector('label').textContent;
        const vals = [...row.querySelectorAll('input')].map(i => parseFloat(i.value));
        if (label === 'Location') this.selectedObject.position.set(...vals);
        else if (label === 'Rotation') this.selectedObject.rotation.set(vals[0]*Math.PI/180, vals[1]*Math.PI/180, vals[2]*Math.PI/180);
        else if (label === 'Scale') this.selectedObject.scale.set(...vals);
        this.render();
    }

    frameSelected() {
        if (!this.selectedObject) return;
        const box = new THREE.Box3().setFromObject(this.selectedObject);
        const center = box.getCenter(new THREE.Vector3());
        const sz = box.getSize(new THREE.Vector3()).length();
        this.camera.position.copy(center).add(new THREE.Vector3(sz, sz, sz));
        this.controls.target.copy(center);
        this.controls.update();
    }
    
    frameAll() {
        const box = new THREE.Box3();
        this.objects.forEach(o => box.expandByObject(o));
        if (box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const sz = box.getSize(new THREE.Vector3()).length();
        this.camera.position.copy(center).add(new THREE.Vector3(sz, sz, sz));
        this.controls.target.copy(center);
        this.controls.update();
    }

    renderImage() { this.importExport.exportImage(1920, 1080); }
    
    async renderAnimation() {
        this.ui.log('Starting render sequence...', 'info');
        if (this.totalFrames <= 0) return;

        // Pause animation to prevent conflict
        const wasPlaying = this.isAnimationPlaying;
        if (wasPlaying) this.pauseAnimation();

        // Capture settings
        const widthInput = document.querySelector('.render-panel .resolution-input input:nth-child(1)');
        const heightInput = document.querySelector('.render-panel .resolution-input input:nth-child(3)');
        const renderWidth = widthInput ? parseInt(widthInput.value) : 1920;
        const renderHeight = heightInput ? parseInt(heightInput.value) : 1080;

        // Zip setup
        const zip = new JSZip();
        const framesFolder = zip.folder("frames");

        // Save original view state
        const viewport = document.getElementById('viewport');
        const originalWidth = viewport.clientWidth;
        const originalHeight = viewport.clientHeight;
        const originalFrame = this.currentFrame;

        try {
            // Resize renderer for output
            this.renderer.setSize(renderWidth, renderHeight, false); // false = don't stretch canvas CSS
            this.camera.aspect = renderWidth / renderHeight;
            this.camera.updateProjectionMatrix();

            for (let i = 1; i <= this.totalFrames; i++) {
                this.ui.showLoading(`Rendering Frame ${i}/${this.totalFrames}`);
                
                this.setCurrentFrame(i);
                this.interpolateKeyframes();
                this.render();

                // Wait slightly to ensure render completes and allow UI update
                await new Promise(resolve => requestAnimationFrame(resolve));

                const blob = await new Promise(resolve => {
                    this.renderer.domElement.toBlob(resolve, 'image/png');
                });

                if (blob) {
                    framesFolder.file(`frame_${String(i).padStart(4, '0')}.png`, blob);
                }
            }

            this.ui.showLoading('Compressing...');
            const content = await zip.generateAsync({ type: "blob" });
            
            // Download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `render_${Date.now()}.zip`;
            link.click();

            this.ui.log(`Render complete! ${this.totalFrames} frames saved.`, 'success');

        } catch (err) {
            console.error('Render error:', err);
            this.ui.log('Render failed. Check console.', 'error');
        } finally {
            // Restore state
            this.renderer.setSize(originalWidth, originalHeight, true);
            this.camera.aspect = originalWidth / originalHeight;
            this.camera.updateProjectionMatrix();
            this.setCurrentFrame(originalFrame);
            this.ui.hideLoading();
            this.render();
            
            // if (wasPlaying) this.playAnimation(); // Optionally resume
        }
    }
    
    render() { this.renderer.render(this.scene, this.camera); }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        if (this.performanceProfiler) this.performanceProfiler.update();
        if (this.physicsSystem && this.physicsSystem.enabled) this.physicsSystem.update(0.016);
        if (this.audioSystem) this.audioSystem.update();
        
        // WASD & Joystick via InputManager
        if (this.inputManager) {
            const dt = 0.016;
            const dir = new THREE.Vector3(); 
            this.camera.getWorldDirection(dir); 
            
            const mv = this.inputManager.getMovementVector(dir);
            
            if (mv.lengthSq() > 0) { 
                mv.normalize().multiplyScalar(this.moveSpeed * dt); 
                this.camera.position.add(mv); 
                this.controls.target.add(mv); 
            }
        }
        
        this.render();
        this.ui.updateViewportStats();
    }
    
    executeConsoleCommand(cmd) {
         // Simplified command parser for basic tasks
         const parts = cmd.split(' ');
         if (parts[0] === 'add') this.addPrimitive(parts[1]);
         else if (parts[0] === 'delete') this.handleMenuAction('delete');
         else this.ui.log('Unknown command', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.ProModelerApp = new ProModelerStudio();
});

