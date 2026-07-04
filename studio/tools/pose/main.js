import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Placeholder standalone 3D topic modules (lightweight stubs wired into the app)
import './scene_helpers.js';
import './model_importers.js';
import './animation_tools.js';
import './physics_bridge.js';
import './vr_support.js';

// Additional refactor/topic placeholders added for future structure and wiring:
import './maim.js';
import './roundbox.js';
import './lighting_presets.js';
import './physics_integration.js';
import './vr_interactions.js';

const room = new WebsimSocket(); // Persistent DB for animations
let scene, camera, renderer, controls;
let transformControls; // For editing parts
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let ground, wallMaterial; // Make these global to update them

let modelParts = {};
let humanoidModel; // Reference to the entire model group
let initialPose = {
    position: new THREE.Vector3(),
    rotations: {}
};
let defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8, metalness: 0.0 });
let faceMaterial;
let currentFaceMaterial; // To store the current face material across model recreations
let keyframes = [];
let currentFrame = 0;
let animationProgress = 0;
let isAnimating = false;
const BASE_ANIMATION_SPEED = 2; // determines how fast we move between keyframes
let animationSpeedMultiplier = 1.0;

// Audio variables
let audioContext;
let isAudioInitialized = false;
let isAudioEnabled = true;
let masterGain; // To control overall volume
let ambienceSource;
const hitBuffers = [];
const hitSoundUrls = [
    '/cave_hit1.wav', '/cave_hit2.wav', '/cave_hit3.wav',
    '/cave_hit4.wav', '/cave_hit5.wav', '/cave_hit6.wav'
];
let lastHitTime = 0;
let nextHitDelay = 0;

const animationPromptInput = document.getElementById('animation-prompt');
const iterationsInput = document.getElementById('iterations');
const animateButton = document.getElementById('animate-button');
const resetButton = document.getElementById('reset-button');
const loadingIndicator = document.getElementById('loading');
const jsonOutputContainer = document.getElementById('json-output-container');
const jsonOutputElement = document.getElementById('json-output');
const audioToggleButton = document.getElementById('audio-toggle');
const animationSpeedSlider = document.getElementById('animation-speed');
const animationSpeedValue = document.getElementById('animation-speed-value');

// JSON Import UI elements
const importJsonButton = document.getElementById('import-json-button');
const exportButton = document.getElementById('export-button');
const jsonImportModal = document.getElementById('json-import-modal');
const jsonImportTextarea = document.getElementById('json-import-textarea');
const loadJsonButton = document.getElementById('load-json-button');
const cancelJsonImportButton = document.getElementById('cancel-json-import-button');

// Model import UI elements
const importModelInput = document.getElementById('import-model-input');
const importModelButton = document.getElementById('import-model-button');
const removeImportedModelButton = document.getElementById('remove-imported-model-button');

// Customization UI elements
const bodyColorInput = document.getElementById('body-color');
const bodyTextureInput = document.getElementById('body-texture');
const removeTextureButton = document.getElementById('remove-texture-button');
const faceTextureInput = document.getElementById('face-texture');
const removeFaceTextureButton = document.getElementById('remove-face-texture-button');
const armLengthSlider = document.getElementById('arm-length');
const legLengthSlider = document.getElementById('leg-length');
const torsoHeightSlider = document.getElementById('torso-height');
const armLengthValue = document.getElementById('arm-length-value');
const legLengthValue = document.getElementById('leg-length-value');
const torsoHeightValue = document.getElementById('torso-height-value');

// Pose select element
const poseSelect = document.getElementById('pose-select');

// Shader Editor UI elements
const editShaderButton = document.getElementById('edit-shader-button');
const shaderEditorPanel = document.getElementById('shader-editor-panel');
const roughnessSlider = document.getElementById('roughness-slider');
const metalnessSlider = document.getElementById('metalness-slider');
const emissiveColorInput = document.getElementById('emissive-color');
const emissiveIntensitySlider = document.getElementById('emissive-intensity');
const roughnessValue = document.getElementById('roughness-value');
const metalnessValue = document.getElementById('metalness-value');
const emissiveIntensityValue = document.getElementById('emissive-intensity-value');

// Face Shader Editor UI elements
const editFaceShaderButton = document.getElementById('edit-face-shader-button');
const faceShaderEditorPanel = document.getElementById('face-shader-editor-panel');
const faceRoughnessSlider = document.getElementById('face-roughness-slider');
const faceMetalnessSlider = document.getElementById('face-metalness-slider');
const faceEmissiveColorInput = document.getElementById('face-emissive-color');
const faceEmissiveIntensitySlider = document.getElementById('face-emissive-intensity');
const faceRoughnessValue = document.getElementById('face-roughness-value');
const faceMetalnessValue = document.getElementById('face-metalness-value');
const faceEmissiveIntensityValue = document.getElementById('face-emissive-intensity-value');

// Simple Edit Mode UI elements
const editModeToggle = document.getElementById('edit-mode-toggle');
const editPanel = document.getElementById('edit-panel');
const selectedPartNameEl = document.getElementById('selected-part-name');
const rotXSlider = document.getElementById('rot-x');
const rotYSlider = document.getElementById('rot-y');
const rotZSlider = document.getElementById('rot-z');
const rotXValue = document.getElementById('rot-x-value');
const rotYValue = document.getElementById('rot-y-value');
const rotZValue = document.getElementById('rot-z-value');
const partList = document.getElementById('part-list');

// Environment UI elements
const groundTextureSelect = document.getElementById('ground-texture');
const customGroundTextureInput = document.getElementById('custom-ground-texture');
const wallTextureSelect = document.getElementById('wall-texture');
const customWallTextureInput = document.getElementById('custom-wall-texture');
const fogColorInput = document.getElementById('fog-color');
const backgroundColorInput = document.getElementById('background-color');
const fogNearSlider = document.getElementById('fog-near');
const fogFarSlider = document.getElementById('fog-far');
const fogNearValue = document.getElementById('fog-near-value');
const fogFarValue = document.getElementById('fog-far-value');

// Panel visibility UI elements
const openCustomizePanelBtn = document.getElementById('open-customize-panel');
const closeCustomizePanelBtn = document.getElementById('close-customize-panel');
const customizePanel = document.getElementById('customization-panel');
const openEnvironmentPanelBtn = document.getElementById('open-environment-panel');
const closeEnvironmentPanelBtn = document.getElementById('close-environment-panel');
const environmentPanel = document.getElementById('environment-panel');
const openJsonPanelBtn = document.getElementById('open-json-panel');
const closeJsonPanelBtn = document.getElementById('close-json-panel');

let isEditMode = false;
let selectedPart = null;

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 0, 60);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 8);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();

    // Transform Controls (for editing)
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('rotate');
    transformControls.setSize(0.8);
    transformControls.showX = true;
    transformControls.showY = true;
    transformControls.showZ = true;
    transformControls.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value;
    });
    transformControls.addEventListener('objectChange', updateRotationSlidersFromGizmo);
    scene.add(transformControls);

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 5, 5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 4;
    dirLight.shadow.camera.bottom = -4;
    dirLight.shadow.camera.left = -4;
    dirLight.shadow.camera.right = 4;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    scene.add(dirLight);

    // Texture Loader
    const textureLoader = new THREE.TextureLoader();

    // Ground
    const groundTexture = textureLoader.load('/concretefloor038b.png');
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(10, 10);
    ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ map: groundTexture })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Walls
    const wallTexture = textureLoader.load('/concretewall004a.png');
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(10, 4);
    wallMaterial = new THREE.MeshPhongMaterial({ map: wallTexture });
    const wallSize = 100;
    const wallHeight = 25;

    // Back wall
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallHeight), wallMaterial);
    backWall.position.set(0, wallHeight / 2, -wallSize / 2);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallHeight), wallMaterial);
    leftWall.position.set(-wallSize / 2, wallHeight / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(wallSize, wallHeight), wallMaterial);
    rightWall.position.set(wallSize / 2, wallHeight / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ map: groundTexture })
    );
    ceiling.position.y = wallHeight;
    ceiling.rotation.x = Math.PI / 2;
    ceiling.receiveShadow = true;
    scene.add(ceiling);

    // Humanoid Model
    recreateHumanoid();

    // Store initial pose
    storeInitialPose();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onCanvasClick);
    animateButton.addEventListener('click', onAnimateClick);
    resetButton.addEventListener('click', resetModelToInitialPose);
    audioToggleButton.addEventListener('click', toggleAudio);
    importJsonButton.addEventListener('click', openJsonImportModal);
    exportButton.addEventListener('click', exportToGLB);
    loadJsonButton.addEventListener('click', loadAnimationFromJson);
    cancelJsonImportButton.addEventListener('click', closeJsonImportModal);

    // Model import listeners
    importModelButton.addEventListener('click', () => importModelInput.click());
    importModelInput.addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        await loadModelFromFile(e.target.files[0]);
        // clear input so same file can be reselected later
        importModelInput.value = '';
    });
    removeImportedModelButton.addEventListener('click', () => {
        // Remove any imported model group kept on scene.userData.importedModel
        const imported = scene.userData.importedModel;
        if (imported) {
            scene.remove(imported);
            disposeHierarchy(imported);
            scene.userData.importedModel = null;
            removeImportedModelButton.style.display = 'none';
        }
    });
    animationPromptInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            onAnimateClick();
        }
    });
    animationSpeedSlider.addEventListener('input', () => {
        animationSpeedMultiplier = parseFloat(animationSpeedSlider.value);
        animationSpeedValue.textContent = animationSpeedMultiplier.toFixed(1);
    });

    // Customization event listeners
    bodyColorInput.addEventListener('input', onColorChange);
    bodyTextureInput.addEventListener('change', onTextureChange);
    removeTextureButton.addEventListener('click', onRemoveTexture);
    faceTextureInput.addEventListener('change', onFaceTextureChange);
    removeFaceTextureButton.addEventListener('click', onRemoveFaceTexture);
    armLengthSlider.addEventListener('input', () => {
        armLengthValue.textContent = armLengthSlider.value;
        updateModelProportions();
    });
    legLengthSlider.addEventListener('input', () => {
        legLengthValue.textContent = legLengthSlider.value;
        updateModelProportions();
    });
    torsoHeightSlider.addEventListener('input', () => {
        torsoHeightValue.textContent = torsoHeightSlider.value;
        updateModelProportions();
    });
    
    // Pose select listener
    poseSelect.addEventListener('change', onPoseSelectChange);

    // Shader editor listeners
    editShaderButton.addEventListener('click', () => {
        const isVisible = shaderEditorPanel.style.display === 'flex';
        shaderEditorPanel.style.display = isVisible ? 'none' : 'flex';
    });
    roughnessSlider.addEventListener('input', onShaderPropertyChange);
    metalnessSlider.addEventListener('input', onShaderPropertyChange);
    emissiveColorInput.addEventListener('input', onShaderPropertyChange);
    emissiveIntensitySlider.addEventListener('input', onShaderPropertyChange);

    // Face shader editor listeners
    editFaceShaderButton.addEventListener('click', () => {
        const isVisible = faceShaderEditorPanel.style.display === 'flex';
        faceShaderEditorPanel.style.display = isVisible ? 'none' : 'flex';
    });
    faceRoughnessSlider.addEventListener('input', onFaceShaderPropertyChange);
    faceMetalnessSlider.addEventListener('input', onFaceShaderPropertyChange);
    faceEmissiveColorInput.addEventListener('input', onFaceShaderPropertyChange);
    faceEmissiveIntensitySlider.addEventListener('input', onFaceShaderPropertyChange);

    // Edit mode listeners
    editModeToggle.addEventListener('change', toggleEditMode);
    partList.addEventListener('click', onPartListClick);
    rotXSlider.addEventListener('input', updateRotationFromSliders);
    rotYSlider.addEventListener('input', updateRotationFromSliders);
    rotZSlider.addEventListener('input', updateRotationFromSliders);

    // Environment listeners
    groundTextureSelect.addEventListener('change', onGroundTextureSelectChange);
    customGroundTextureInput.addEventListener('change', (e) => onCustomTextureChange(e, 'ground'));
    wallTextureSelect.addEventListener('change', onWallTextureSelectChange);
    customWallTextureInput.addEventListener('change', (e) => onCustomTextureChange(e, 'wall'));
    fogColorInput.addEventListener('input', onFogChange);
    backgroundColorInput.addEventListener('input', onBackgroundChange);
    fogNearSlider.addEventListener('input', onFogChange);
    fogFarSlider.addEventListener('input', onFogChange);

    // Panel visibility listeners
    closeCustomizePanelBtn.addEventListener('click', () => {
        customizePanel.style.display = 'none';
        openCustomizePanelBtn.style.display = 'block';
    });
    openCustomizePanelBtn.addEventListener('click', () => {
        customizePanel.style.display = 'flex';
        openCustomizePanelBtn.style.display = 'none';
    });

    closeEnvironmentPanelBtn.addEventListener('click', () => {
        environmentPanel.style.display = 'none';
        openEnvironmentPanelBtn.style.display = 'block';
    });
    openEnvironmentPanelBtn.addEventListener('click', () => {
        environmentPanel.style.display = 'flex';
        openEnvironmentPanelBtn.style.display = 'none';
    });

    // JSON panel visibility
    closeJsonPanelBtn.addEventListener('click', () => {
        jsonOutputContainer.style.display = 'none';
        openJsonPanelBtn.style.display = 'block';
    });
    openJsonPanelBtn.addEventListener('click', () => {
        jsonOutputContainer.style.display = 'flex';
        openJsonPanelBtn.style.display = 'none';
    });

    // Attempt to start audio on page load. It will likely be suspended
    // and will require a user gesture (e.g., click) to actually start playing.
    initAudio();

    // A one-time event listener to resume audio on the first user interaction anywhere on the page.
    const resumeAudio = () => {
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    };
    document.body.addEventListener('click', resumeAudio, { once: true });
    document.body.addEventListener('keydown', resumeAudio, { once: true });

    // Load saved animations from persistent DB
    loadSavedAnimations().catch(err => {
        console.warn('Failed to load saved animations:', err);
    });

    // Start animation loop
    animate();
}

// --- Audio Functions ---

function initAudio() {
    if (isAudioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create a master gain node to control all audio
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.25; // Set volume to 25%
        masterGain.connect(audioContext.destination);

        loadSounds();
        isAudioInitialized = true;
        setNextRandomHitTime();
    } catch (e) {
        console.error("Web Audio API is not supported in this browser");
        isAudioEnabled = false; // Disable audio features if not supported
        audioToggleButton.style.display = 'none';
    }
}

async function loadSound(url) {
    if (!audioContext) return null;
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.error(`Failed to load sound: ${url}`, error);
        return null;
    }
}

async function loadSounds() {
    // Load ambience
    const ambienceBuffer = await loadSound('/ambience_base.wav');
    if (ambienceBuffer) {
        ambienceSource = audioContext.createBufferSource();
        ambienceSource.buffer = ambienceBuffer;
        ambienceSource.loop = true;
        ambienceSource.connect(masterGain); // Connect to master gain instead of destination
        ambienceSource.start(0);
        if (!isAudioEnabled) {
             audioContext.suspend();
        }
    }

    // Load hit sounds
    for (const url of hitSoundUrls) {
        const buffer = await loadSound(url);
        if (buffer) {
            hitBuffers.push(buffer);
        }
    }
}

function playRandomHitSound() {
    if (hitBuffers.length === 0 || !audioContext || !isAudioEnabled) return;

    const source = audioContext.createBufferSource();
    const randomIndex = Math.floor(Math.random() * hitBuffers.length);
    source.buffer = hitBuffers[randomIndex];
    source.connect(masterGain); // Connect to master gain instead of destination
    source.start(0);
}

function setNextRandomHitTime() {
    // Set a delay between 20 and 45 seconds for the next sound, making it rarer.
    nextHitDelay = (Math.random() * 25 + 20) * 1000;
    lastHitTime = performance.now();
}

function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    if (audioContext) {
        if (isAudioEnabled && audioContext.state === 'suspended') {
            audioContext.resume();
        } else if (!isAudioEnabled && audioContext.state === 'running') {
            audioContext.suspend();
        }
    }
    audioToggleButton.textContent = isAudioEnabled ? '🔊' : '🔇';
    audioToggleButton.classList.toggle('enabled', isAudioEnabled);
    audioToggleButton.classList.toggle('disabled', !isAudioEnabled);
}

// --- Export Function ---
function exportToGLB() {
    if (!humanoidModel) {
        alert("No model to export.");
        return;
    }
    if (keyframes.length === 0) {
        if(!confirm("No animation keyframes found. Do you want to export the static model?")) {
            return;
        }
    }

    const exporter = new GLTFExporter();
    const options = {
        binary: true, // Export as .glb
        animations: [],
        embedImages: true,
    };
    
    // Convert keyframes to a THREE.AnimationClip
    if (keyframes.length > 0) {
        const tracks = [];
        const partNames = Object.keys(modelParts);
        // Assuming 1 step per keyframe for timing.
        // This can be adjusted to control animation speed in the exported file.
        const times = keyframes.map((_, index) => index); 
        const duration = times.length > 0 ? times[times.length - 1] : 0;

        partNames.forEach(partName => {
            if (!modelParts[partName]) return;

            const rotationValues = [];
            const quaternion = new THREE.Quaternion();
            const euler = new THREE.Euler();

            keyframes.forEach(frame => {
                const rotation = frame.rotations[partName];
                if (rotation) {
                    euler.set(
                        THREE.MathUtils.degToRad(rotation.x),
                        THREE.MathUtils.degToRad(rotation.y),
                        THREE.MathUtils.degToRad(rotation.z),
                        'XYZ' // Explicitly set Euler order
                    );
                    quaternion.setFromEuler(euler);
                    rotationValues.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                } else {
                    // Fallback to initial pose if keyframe is missing data for this part
                    const initialRotation = initialPose.rotations[partName] || new THREE.Euler();
                    quaternion.setFromEuler(initialRotation);
                    rotationValues.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
                }
            });

            // The node name in glTF is derived from the Object3D's name property
            const trackName = `${partName}.quaternion`;
            tracks.push(new THREE.QuaternionKeyframeTrack(trackName, times, rotationValues));
        });
        
        // Handle pelvis/model position animation
        const positionValues = [];
        let hasPositionAnimation = false;
        
        keyframes.forEach(frame => {
             const pos = (frame.rotations.pelvis && frame.rotations.pelvis.position) 
                 ? frame.rotations.pelvis.position 
                 : initialPose.position;
             
             // The position track applies to the root of the rig, which is the 'pelvis'.
             // We are animating its position relative to its parent group (humanoidModel).
             positionValues.push(pos.x, pos.y, pos.z);
             if (pos.x !== initialPose.position.x || pos.y !== initialPose.position.y || pos.z !== initialPose.position.z) {
                hasPositionAnimation = true;
             }
        });

        if(hasPositionAnimation) {
             tracks.push(new THREE.VectorKeyframeTrack('humanoidModel.position', times, positionValues));
        }
        
        if (tracks.length > 0) {
            const animationClip = new THREE.AnimationClip('animation', duration, tracks);
            options.animations.push(animationClip);
        }
    }

    // Set a name for the root object for cleaner animation targeting in other software
    humanoidModel.name = 'humanoidModel';

    // The exporter works on a callback basis.
    exporter.parse(
        humanoidModel,
        function (result) {
            // result is an ArrayBuffer
            saveArrayBuffer(result, 'humanoid-animation.glb');
        },
        function (error) {
            console.error('An error happened during GLTF export:', error);
            alert("Export failed. See console for details.");
        },
        options
    );
}

function saveArrayBuffer(buffer, filename) {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Model import helpers ---

// Dispose utility to free geometries and materials
function disposeHierarchy(node) {
    node.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose && m.dispose());
                } else {
                    child.material.dispose && child.material.dispose();
                }
            }
        }
    });
}

async function loadModelFromFile(file) {
    const name = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    try {
        let model;
        if (name.endsWith('.glb')) {
            const loader = new GLTFLoader();
            const gltf = await new Promise((resolve, reject) => {
                loader.parse(arrayBuffer, '', resolve, reject);
            });
            model = gltf.scene || gltf.scenes?.[0];
        } else if (name.endsWith('.gltf')) {
            // glTF (JSON) typically requires a string plus external resources; try parse from text
            const text = new TextDecoder().decode(arrayBuffer);
            const loader = new GLTFLoader();
            const gltf = await new Promise((resolve, reject) => {
                loader.parse(text, '', resolve, reject);
            });
            model = gltf.scene || gltf.scenes?.[0];
        } else if (name.endsWith('.obj')) {
            const text = new TextDecoder().decode(arrayBuffer);
            const loader = new OBJLoader();
            model = loader.parse(text);
        } else {
            alert('Unsupported file type. Supported: .glb .gltf .obj');
            return;
        }

        if (!model) {
            alert('Failed to parse model file.');
            return;
        }

        addImportedModelToScene(model, file.name);
    } catch (err) {
        console.error('Error loading model:', err);
        alert('Failed to load model. See console for details.');
    }
}

/*
  Helpers to prepare arbitrary imported models for the scene:
  - computeBoundingBox: returns size/center for a given Object3D
  - centerAndNormalize: centers model at origin and scales it to fit a target height
  - ensureMaterials: make sure meshes have a standard material (so lighting/shadows work)
  - prepareModelForScene: runs the above and positions the wrapper near the humanoid root
*/
function computeBoundingBox(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { box, size, center };
}

function centerAndNormalize(object, targetHeight = 2.0) {
    // Compute bounding box and center the geometry
    const { size, center } = computeBoundingBox(object);
    // Avoid zero-size models
    const height = Math.max(size.y, size.length() * 0.5, 0.001);
    const scale = targetHeight / height;
    // Apply a group wrapper transform so original object transforms are preserved
    const wrapper = new THREE.Group();
    wrapper.add(object);
    // Center the model so its center becomes local origin
    object.position.sub(center);
    wrapper.scale.setScalar(scale);
    return { wrapper, scale, originalCenter: center };
}

function ensureMaterials(object) {
    object.traverse((c) => {
        if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
            // If mesh has no material or uses a non-standard material, replace with MeshStandardMaterial while preserving map/colors
            if (!c.material) {
                c.material = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 });
            } else if (Array.isArray(c.material)) {
                c.material = c.material.map(m => {
                    if (m && (m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) {
                        return m;
                    }
                    // preserve map and color if present
                    const props = {};
                    if (m && m.map) props.map = m.map;
                    if (m && m.color) props.color = m.color;
                    return new THREE.MeshStandardMaterial({ ...props, roughness: 0.8 });
                });
            } else if (!(c.material.isMeshStandardMaterial)) {
                const old = c.material;
                const props = {};
                if (old.map) props.map = old.map;
                if (old.color) props.color = old.color;
                c.material = new THREE.MeshStandardMaterial({ ...props, roughness: 0.8 });
            }
        }
    });
}

/*
  Main import helper: wraps, normalizes, ensures materials, and places the imported model near the humanoid.
  options:
    - targetHeight: desired model height in scene units
    - attachToHumanoid: if true, add imported model as a child of humanoidModel for combined export
*/
function prepareModelForScene(model, displayName, options = {}) {
    const targetHeight = options.targetHeight || 2.0;
    // If model is already a Group with multiple children, clone to avoid mutating original parse result
    const modelClone = model.clone(true);

    // Ensure materials and shadows are configured
    ensureMaterials(modelClone);

    // Center and normalize scale
    const { wrapper, scale } = centerAndNormalize(modelClone, targetHeight);

    // Create a named wrapper for scene management
    wrapper.name = `imported_${displayName || 'model'}`;
    wrapper.userData.originalScale = scale;
    return wrapper;
}

function addImportedModelToScene(model, displayName) {
    // Remove previous imported model if present
    if (scene.userData.importedModel) {
        scene.remove(scene.userData.importedModel);
        disposeHierarchy(scene.userData.importedModel);
        scene.userData.importedModel = null;
    }

    // Prepare the model for the scene: center, normalize, ensure materials
    const prepared = prepareModelForScene(model, displayName, { targetHeight: 2.0 });

    // Position the imported model near the humanoid root if available
    const offset = new THREE.Vector3(2.5, 0, 0); // place it to the right of the humanoid by default
    if (humanoidModel) {
        // Compute a conservative ground offset so imported model sits on ground
        const pelvisHeight = modelParts.pelvis ? modelParts.pelvis.geometry.parameters.height : 0.5;
        prepared.position.copy(humanoidModel.position).add(offset);
        prepared.position.y = Math.max(humanoidModel.position.y - pelvisHeight, 0);
    } else {
        prepared.position.set(0, 0, 0);
    }

    // Add to scene and keep reference for later removal/export
    scene.add(prepared);
    scene.userData.importedModel = prepared;
    removeImportedModelButton.style.display = 'inline-block';

    // Convenience: when exporting, users may want the imported model included.
    // We do NOT automatically parent it under humanoidModel to avoid surprising reparenting,
    // but provide a small utility to attach it when exporting if needed.
    prepared.userData.canBeAttachedToHumanoid = true;
}

// --- Model and Animation Functions ---

function createPart(geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function assignNameToParts(part, name) {
    part.name = name;
    part.userData.partName = name; // Store name for raycasting and selection
    part.traverse((child) => {
        if (child.isMesh) {
            child.userData.partName = name; // Store name for raycasting
            child.userData.isJoint = name.toLowerCase().includes('joint');
        }
    });
}

function recreateHumanoid() {
    // If a model already exists, remove it from the scene
    if (humanoidModel) {
        scene.remove(humanoidModel);
        // Dispose of old geometry and materials if necessary to free up memory
    }

    // Get current customization values
    const armLength = parseFloat(armLengthSlider.value);
    const legLength = parseFloat(legLengthSlider.value);
    const torsoHeight = parseFloat(torsoHeightSlider.value);

    // Create a new model with the specified parameters
    humanoidModel = createHumanoid(
        defaultMaterial,
        { arm: armLength, leg: legLength, torso: torsoHeight }
    );
    scene.add(humanoidModel);

    // After creating the model, reset animation and store the new initial pose
    isAnimating = false;
    keyframes = [];
    storeInitialPose();
    updatePartListUI(); // Populate part list after initial creation
    poseSelect.value = 'default';
}

function createHumanoid(material, sizes) {
    const modelGroup = new THREE.Group();
    const textureLoader = new THREE.TextureLoader();

    modelParts = {}; // Clear previous parts

    // Constants for body proportions
    const torsoHeight = sizes.torso;
    const torsoWidth = 1.2;
    const torsoDepth = 0.6;
    const headRadius = 0.5;
    const armLength = sizes.arm;
    const armWidth = 0.4;
    const legLength = sizes.leg;
    const legWidth = 0.5;
    const jointRadius = 0.2;
    const pelvisHeight = 0.5;
    const pelvisWidth = 1.0;
    const spineHeight = 0.7;

    // Pelvis (the new root of the body)
    const pelvisGeo = new THREE.BoxGeometry(pelvisWidth, pelvisHeight, pelvisWidth * 0.8);
    const pelvis = createPart(pelvisGeo, material);
    modelGroup.add(pelvis);
    assignNameToParts(pelvis, 'pelvis');
    modelParts.pelvis = pelvis;

    // Spine
    const spineGeo = new THREE.BoxGeometry(torsoWidth * 0.6, spineHeight, torsoDepth * 0.8);
    const spine = createPart(spineGeo, material);
    spine.position.y = pelvisHeight / 2 + spineHeight / 2;
    pelvis.add(spine);
    assignNameToParts(spine, 'spine');
    modelParts.spine = spine;

    // Torso
    const torsoGeo = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torso = createPart(torsoGeo, material);
    torso.position.y = spineHeight / 2 + torsoHeight / 2;
    spine.add(torso);
    assignNameToParts(torso, 'torso');
    modelParts.torso = torso;

    // Head
    const headGeo = new THREE.SphereGeometry(headRadius, 32, 16);
    const head = createPart(headGeo, material);
    head.position.y = torsoHeight / 2 + headRadius;
    torso.add(head);
    assignNameToParts(head, 'head');
    modelParts.head = head;
    
    // Add face texture from Munch.gif or the currently loaded one
    if (!currentFaceMaterial) {
        const faceTexture = textureLoader.load('/Munch.gif');
        faceMaterial = new THREE.MeshStandardMaterial({ 
            map: faceTexture, 
            transparent: true,
            roughness: 0.8,
            metalness: 0.0
        });
        currentFaceMaterial = faceMaterial;
    }
    const faceGeometry = new THREE.PlaneGeometry(headRadius * 1.2, headRadius * 1.2);
    const facePlane = new THREE.Mesh(faceGeometry, currentFaceMaterial);
    facePlane.name = "facePlane"; // Give it a name to find it later
    facePlane.userData.partName = 'face';
    
    // Position it on the front of the head
    facePlane.position.z = headRadius + 0.01; // Slightly in front to avoid z-fighting
    head.add(facePlane);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(headRadius * 0.6, headRadius * 0.7, 0.3, 16);
    const neck = createPart(neckGeo, material);
    neck.position.y = -headRadius;
    head.add(neck); // Attach neck to head for simpler rotation

    // Create limbs with joints
    const createLimb = (isArm, isLeft) => {
        // Returns an object: { upper: Group, lower: Group }
        const side = isLeft ? 1 : -1;
        
        const totalLimbLength = isArm ? armLength : legLength;
        const limbWidth = isArm ? armWidth : legWidth;
        const upperLimbLength = totalLimbLength * 0.5;
        const lowerLimbLength = totalLimbLength * 0.5;

        // Upper limb group (e.g., from shoulder to elbow)
        const upperLimb = new THREE.Group();
        const upperGeo = new THREE.BoxGeometry(limbWidth, upperLimbLength, limbWidth);
        const upperMesh = createPart(upperGeo, material);
        upperLimb.add(upperMesh);
        upperMesh.position.y = -upperLimbLength / 2; // Center the mesh along the group's local Y axis
        upperMesh.name = 'upperLimbMesh';

        // Joint sphere (Elbow/Knee)
        const jointGeo = new THREE.SphereGeometry(jointRadius, 16, 16);
        const jointMesh = createPart(jointGeo, material);
        jointMesh.position.y = -upperLimbLength; // Position at the end of the upper limb
        upperLimb.add(jointMesh);
        jointMesh.name = 'joint';

        // Lower limb group (e.g., from elbow to wrist)
        const lowerLimb = new THREE.Group();
        const lowerGeo = new THREE.BoxGeometry(limbWidth * 0.9, lowerLimbLength, limbWidth * 0.9);
        const lowerMesh = createPart(lowerGeo, material);
        lowerLimb.add(lowerMesh);
        lowerMesh.position.y = -lowerLimbLength / 2; // Center the mesh
        lowerMesh.name = 'lowerLimbMesh';
        
        // Attach lower limb to the end of the upper limb
        lowerLimb.position.y = -upperLimbLength;
        upperLimb.add(lowerLimb);

        // Position the entire limb relative to the parent (torso/pelvis)
        const a_pose_angle = Math.PI / 8;
        if (isArm) {
            upperLimb.position.set(side * (torsoWidth / 2), torsoHeight / 2 - jointRadius, 0);
            upperLimb.rotation.z = side * a_pose_angle;
        } else { // It's a leg
            upperLimb.position.set(side * (pelvisWidth / 3), -pelvisHeight / 2, 0);
            upperLimb.rotation.z = side * (a_pose_angle / 4);
        }

        return { upper: upperLimb, lower: lowerLimb };
    };
    
    // Create and add limbs
    const leftArmLimb = createLimb(true, true);
    const rightArmLimb = createLimb(true, false);
    torso.add(leftArmLimb.upper, rightArmLimb.upper);
    assignNameToParts(leftArmLimb.upper, 'leftUpperArm');
    assignNameToParts(leftArmLimb.lower, 'leftLowerArm');
    assignNameToParts(rightArmLimb.upper, 'rightUpperArm');
    assignNameToParts(rightArmLimb.lower, 'rightLowerArm');

    const leftLegLimb = createLimb(false, true);
    const rightLegLimb = createLimb(false, false);
    pelvis.add(leftLegLimb.upper, rightLegLimb.upper);
    assignNameToParts(leftLegLimb.upper, 'leftUpperLeg');
    assignNameToParts(leftLegLimb.lower, 'leftLowerLeg');
    assignNameToParts(rightLegLimb.upper, 'rightUpperLeg');
    assignNameToParts(rightLegLimb.lower, 'rightLowerLeg');
    
    modelParts.leftUpperArm = leftArmLimb.upper;
    modelParts.leftLowerArm = leftArmLimb.lower;
    modelParts.rightUpperArm = rightArmLimb.upper;
    modelParts.rightLowerArm = rightArmLimb.lower;
    modelParts.leftUpperLeg = leftLegLimb.upper;
    modelParts.leftLowerLeg = leftLegLimb.lower;
    modelParts.rightUpperLeg = rightLegLimb.upper;
    modelParts.rightLowerLeg = rightLegLimb.lower;

    // Set initial model position
    modelGroup.position.y = legLength + pelvisHeight;
    return modelGroup;
}

function updateModelProportions() {
    if (!humanoidModel) return;

    const armLength = parseFloat(armLengthSlider.value);
    const legLength = parseFloat(legLengthSlider.value);
    const torsoHeight = parseFloat(torsoHeightSlider.value);

    // Update Torso
    const torso = modelParts.torso;
    const head = modelParts.head;
    const leftUpperArm = modelParts.leftUpperArm;
    const rightUpperArm = modelParts.rightUpperArm;

    const initialTorsoHeight = torso.geometry.parameters.height;
    torso.scale.y = torsoHeight / initialTorsoHeight;
    
    // Reposition parts attached to torso
    const headRadius = head.geometry.parameters.radius;
    head.position.y = (torsoHeight / 2) + headRadius;

    const jointRadius = leftUpperArm.getObjectByName('joint').geometry.parameters.radius;
    leftUpperArm.position.y = torsoHeight / 2 - jointRadius;
    rightUpperArm.position.y = torsoHeight / 2 - jointRadius;

    // Update Limbs
    const updateLimb = (upperLimbPart, lowerLimbPart, newTotalLength, isArm) => {
        const upperLimbLength = newTotalLength * 0.5;
        const lowerLimbLength = newTotalLength * 0.5;

        const upperMesh = upperLimbPart.getObjectByName('upperLimbMesh');
        const joint = upperLimbPart.getObjectByName('joint');
        
        const initialUpperLength = upperMesh.geometry.parameters.height;
        upperMesh.scale.y = upperLimbLength / initialUpperLength;
        upperMesh.position.y = -upperLimbLength / 2;
        
        joint.position.y = -upperLimbLength;
        lowerLimbPart.position.y = -upperLimbLength;

        const lowerMesh = lowerLimbPart.getObjectByName('lowerLimbMesh');
        const initialLowerLength = lowerMesh.geometry.parameters.height;
        lowerMesh.scale.y = lowerLimbLength / initialLowerLength;
        lowerMesh.position.y = -lowerLimbLength / 2;
    };
    
    updateLimb(modelParts.leftUpperArm, modelParts.leftLowerArm, armLength, true);
    updateLimb(modelParts.rightUpperArm, modelParts.rightLowerArm, armLength, true);
    updateLimb(modelParts.leftUpperLeg, modelParts.leftLowerLeg, legLength, false);
    updateLimb(modelParts.rightUpperLeg, modelParts.rightLowerLeg, legLength, false);

    // Update model's overall height based on leg length
    const pelvisHeight = modelParts.pelvis.geometry.parameters.height;
    humanoidModel.position.y = legLength + pelvisHeight;
}

function updatePartListUI() {
    partList.innerHTML = ''; // Clear existing list
    const partNames = Object.keys(modelParts).sort(); // Sort for consistent order
    
    partNames.forEach(partName => {
        const li = document.createElement('li');
        li.textContent = partName;
        li.dataset.partname = partName;
        li.title = `Select ${partName}`;
        partList.appendChild(li);
    });
}

function storeInitialPose() {
    initialPose.position.copy(humanoidModel.position);
    for (const partName in modelParts) {
        initialPose.rotations[partName] = modelParts[partName].rotation.clone();
    }
}

function resetModelToInitialPose() {
    isAnimating = false;
    keyframes = [];
    
    // Reset animation speed slider
    animationSpeedSlider.value = 1.0;
    animationSpeedMultiplier = 1.0;
    animationSpeedValue.textContent = '1.0';

    // Instead of just setting rotation, we recreate the model with default sizes
    // This ensures consistency if the user changed sizes then hits reset.
    armLengthSlider.value = 2.0;
    legLengthSlider.value = 2.0;
    torsoHeightSlider.value = 1.0;
    armLengthValue.textContent = '2.0';
    legLengthValue.textContent = '2.0';
    torsoHeightValue.textContent = '1.0';
    
    recreateHumanoid();
    poseSelect.value = 'default';
}

// --- Pose Functions ---
const poses = {
    't-pose': {
        rotations: {
            pelvis: { x: 0, y: 0, z: 0 },
            spine: { x: 0, y: 0, z: 0 },
            torso: { x: 0, y: 0, z: 0 },
            head: { x: 0, y: 0, z: 0 },
            leftUpperArm: { x: 0, y: 0, z: 90 },
            rightUpperArm: { x: 0, y: 0, z: -90 },
            leftLowerArm: { x: 0, y: 0, z: 0 },
            rightLowerArm: { x: 0, y: 0, z: 0 },
            leftUpperLeg: { x: 0, y: 0, z: 0 },
            rightUpperLeg: { x: 0, y: 0, z: 0 },
            leftLowerLeg: { x: 0, y: 0, z: 0 },
            rightLowerLeg: { x: 0, y: 0, z: 0 },
        }
    },
    'sitting': {
        rotations: {
            pelvis: { x: 0, y: 0, z: 0 },
            spine: { x: 10, y: 0, z: 0 },
            torso: { x: 0, y: 0, z: 0 },
            head: { x: 0, y: 0, z: 0 },
            leftUpperArm: { x: -10, y: 0, z: 15 },
            rightUpperArm: { x: -10, y: 0, z: -15 },
            leftLowerArm: { x: -15, y: 0, z: 0 },
            rightLowerArm: { x: -15, y: 0, z: 0 },
            leftUpperLeg: { x: -90, y: 0, z: 5 },
            rightUpperLeg: { x: -90, y: 0, z: -5 },
            leftLowerLeg: { x: 90, y: 0, z: 0 },
            rightLowerLeg: { x: 90, y: 0, z: 0 },
        },
        positionYMultiplier: 0.5,
    },
    'dog-pose': {
        rotations: {
            pelvis: { x: 90, y: 0, z: 0 },
            spine: { x: 0, y: 0, z: 0 },
            torso: { x: -15, y: 0, z: 0 },
            head: { x: -75, y: 0, z: 0 },
            leftUpperArm: { x: 90, y: 0, z: 15 },
            rightUpperArm: { x: 90, y: 0, z: -15 },
            leftLowerArm: { x: -90, y: 0, z: 0 },
            rightLowerArm: { x: -90, y: 0, z: 0 },
            leftUpperLeg: { x: -90, y: 0, z: 10 },
            rightUpperLeg: { x: -90, y: 0, z: -10 },
            leftLowerLeg: { x: 90, y: 0, z: 0 },
            rightLowerLeg: { x: 90, y: 0, z: 0 },
        },
        positionYMultiplier: 0.5,
    }
};

function applyPose(poseName) {
    const pose = poses[poseName];
    if (!pose) return;

    // Stop any animation
    isAnimating = false;
    keyframes = [];

    // First reset all rotations to 0 before applying the new pose, to avoid leftover rotations
    for (const partName in modelParts) {
        modelParts[partName].rotation.set(0, 0, 0);
    }

    // Apply rotations from the pose definition
    for (const partName in pose.rotations) {
        if (modelParts[partName]) {
            const rot = pose.rotations[partName];
            modelParts[partName].rotation.set(
                THREE.MathUtils.degToRad(rot.x),
                THREE.MathUtils.degToRad(rot.y),
                THREE.MathUtils.degToRad(rot.z)
            );
        }
    }
    
    // Apply position
    const legLength = parseFloat(legLengthSlider.value);
    const pelvisHeight = modelParts.pelvis.geometry.parameters.height;

    if (pose.positionYMultiplier) {
        humanoidModel.position.y = legLength * pose.positionYMultiplier;
    } else {
        // Default positioning
        humanoidModel.position.y = legLength + pelvisHeight;
    }
    humanoidModel.position.x = 0;
    humanoidModel.position.z = 0;

    // If in edit mode and a part is selected, update sliders to reflect the new pose
    if (isEditMode && selectedPart) {
        updateRotationSlidersFromGizmo();
    }
}

function onPoseSelectChange(event) {
    const poseName = event.target.value;
    if (poseName === 'default') {
        resetModelToInitialPose();
    } else {
        applyPose(poseName);
    }
}

// --- Edit Mode and Part Selection ---

function onPartListClick(event) {
    if (event.target && event.target.tagName === 'LI') {
        const partName = event.target.dataset.partname;
        if (partName && modelParts[partName]) {
            selectPart(modelParts[partName]);
        }
    }
}

function onCanvasClick(event) {
    if (!isEditMode) return;

    event.preventDefault();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(humanoidModel.children, true);

    if (intersects.length > 0) {
        // Find the root part group from the intersected mesh
        let clickedObject = intersects[0].object;
        let partGroup = clickedObject;
        
        // Traverse up to find the object that is a direct key in modelParts
        while (partGroup && !modelParts[partGroup.name]) {
             partGroup = partGroup.parent;
        }

        if (partGroup && modelParts[partGroup.name]) {
            selectPart(partGroup);
        }
    } else {
        deselectPart();
    }
}

function selectPart(part) {
    if (selectedPart === part) return;

    selectedPart = part;
    transformControls.attach(part);
    
    selectedPartNameEl.textContent = part.name;
    updateRotationSlidersFromGizmo(); // Sync sliders

    // Highlight in list
    const partListItems = document.querySelectorAll('#part-list li');
    partListItems.forEach(li => {
        li.classList.toggle('selected', li.dataset.partname === part.name);
    });
}

function deselectPart() {
    if (selectedPart) {
        transformControls.detach();
        selectedPart = null;
        selectedPartNameEl.textContent = 'No part selected';

        // Remove all highlights from list
        const partListItems = document.querySelectorAll('#part-list li');
        partListItems.forEach(li => li.classList.remove('selected'));
    }
}

function toggleEditMode(event) {
    isEditMode = event.target.checked;
    editPanel.style.display = isEditMode ? 'flex' : 'none';
    
    // Disable animation UI while in edit mode
    animateButton.disabled = isEditMode;
    importJsonButton.disabled = isEditMode;
    animationPromptInput.disabled = isEditMode;
    iterationsInput.disabled = isEditMode;

    if (!isEditMode) {
        deselectPart();
    }
}

function updateRotationSlidersFromGizmo() {
    if (!selectedPart) return;
    const euler = selectedPart.rotation;
    rotXSlider.value = THREE.MathUtils.radToDeg(euler.x);
    rotYSlider.value = THREE.MathUtils.radToDeg(euler.y);
    rotZSlider.value = THREE.MathUtils.radToDeg(euler.z);
    updateRotationValueSpans();
}

function updateRotationFromSliders() {
    if (!selectedPart) return;
    selectedPart.rotation.set(
        THREE.MathUtils.degToRad(rotXSlider.value),
        THREE.MathUtils.degToRad(rotYSlider.value),
        THREE.MathUtils.degToRad(rotZSlider.value)
    );
    updateRotationValueSpans();
}

function updateRotationValueSpans() {
    rotXValue.textContent = rotXSlider.value;
    rotYValue.textContent = rotYSlider.value;
    rotZValue.textContent = rotZSlider.value;
}

// --- Environment Customization ---

function updateTexture(meshOrMaterial, textureUrl) {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(textureUrl, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        
        let material;
        if(meshOrMaterial.isMaterial) {
            material = meshOrMaterial;
        } else {
            material = meshOrMaterial.material;
        }

        if (material.map) {
            material.map.dispose();
        }
        material.map = texture;

        if(meshOrMaterial === ground) {
             material.map.repeat.set(10, 10);
        } else { // Wall
             material.map.repeat.set(10, 4);
        }
       
        material.needsUpdate = true;
    });
}

function onGroundTextureSelectChange(event) {
    const value = event.target.value;
    if (value === 'custom') {
        customGroundTextureInput.style.display = 'block';
        customGroundTextureInput.click();
    } else {
        customGroundTextureInput.style.display = 'none';
        updateTexture(ground, value);
    }
}

function onWallTextureSelectChange(event) {
    const value = event.target.value;
    if (value === 'custom') {
        customWallTextureInput.style.display = 'block';
        customWallTextureInput.click();
    } else {
        customWallTextureInput.style.display = 'none';
        updateTexture(wallMaterial, value);
    }
}

function onCustomTextureChange(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        if (type === 'ground') {
            updateTexture(ground, dataUrl);
            // Reset select to 'custom' in case user uploads another file
            groundTextureSelect.value = 'custom';
        } else if (type === 'wall') {
            updateTexture(wallMaterial, dataUrl);
            wallTextureSelect.value = 'custom';
        }
    };
    reader.readAsDataURL(file);
}

function onFogChange() {
    const color = new THREE.Color(fogColorInput.value);
    const near = parseFloat(fogNearSlider.value);
    const far = parseFloat(fogFarSlider.value);
    
    if(scene.fog) {
        scene.fog.color.set(color);
        scene.fog.near = near;
        scene.fog.far = far;
    }

    fogNearValue.textContent = near;
    fogFarValue.textContent = far;
}

function onBackgroundChange() {
    scene.background.set(new THREE.Color(backgroundColorInput.value));
}

// --- Customization Handlers ---
function onColorChange(event) {
    const color = new THREE.Color(event.target.value);
    defaultMaterial.color.set(color);
}

function onTextureChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(e.target.result, (texture) => {
            // Dispose old map if it exists
            if (defaultMaterial.map) {
                defaultMaterial.map.dispose();
            }
            defaultMaterial.map = texture;
            defaultMaterial.needsUpdate = true;
        });
    };
    reader.readAsDataURL(file);
}

function onFaceTextureChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(e.target.result, (texture) => {
            // Dispose of the old texture map to free up memory
            if (currentFaceMaterial && currentFaceMaterial.map) {
                currentFaceMaterial.map.dispose();
            }
            
            // Re-use properties from the existing face material
            const oldProps = {
                roughness: currentFaceMaterial.roughness,
                metalness: currentFaceMaterial.metalness,
                emissive: currentFaceMaterial.emissive,
                emissiveIntensity: currentFaceMaterial.emissiveIntensity,
            };
            
            currentFaceMaterial = new THREE.MeshStandardMaterial({ 
                map: texture, 
                transparent: true,
                ...oldProps
            });

            const head = modelParts.head;
            if (head) {
                const facePlane = head.getObjectByName("facePlane");
                if (facePlane) {
                    facePlane.material = currentFaceMaterial;
                }
            }
        });
    };
    reader.readAsDataURL(file);
}

function onRemoveTexture() {
    bodyTextureInput.value = ''; // Clear file input
    if (defaultMaterial.map) {
        defaultMaterial.map.dispose();
        defaultMaterial.map = null;
        defaultMaterial.needsUpdate = true;
    }
}

function onRemoveFaceTexture() {
    faceTextureInput.value = ''; // Clear the file input

    // Dispose of the old texture map
    if (currentFaceMaterial && currentFaceMaterial.map) {
        currentFaceMaterial.map.dispose();
    }
    
    const oldProps = {
        roughness: currentFaceMaterial.roughness,
        metalness: currentFaceMaterial.metalness,
        emissive: currentFaceMaterial.emissive,
        emissiveIntensity: currentFaceMaterial.emissiveIntensity,
    };

    // Create new material with the default Munch.gif
    const textureLoader = new THREE.TextureLoader();
    const defaultFaceTexture = textureLoader.load('/Munch.gif');
    currentFaceMaterial = new THREE.MeshStandardMaterial({ 
        map: defaultFaceTexture, 
        transparent: true,
        ...oldProps
     });

    const head = modelParts.head;
    if (head) {
        const facePlane = head.getObjectByName("facePlane");
        if(facePlane) facePlane.material = currentFaceMaterial;
    }
}

function onShaderPropertyChange() {
    const roughness = parseFloat(roughnessSlider.value);
    const metalness = parseFloat(metalnessSlider.value);
    const emissiveIntensity = parseFloat(emissiveIntensitySlider.value);
    const emissiveColor = new THREE.Color(emissiveColorInput.value);

    defaultMaterial.roughness = roughness;
    defaultMaterial.metalness = metalness;
    defaultMaterial.emissiveIntensity = emissiveIntensity;
    defaultMaterial.emissive.set(emissiveColor);

    // Update UI display values
    roughnessValue.textContent = roughness.toFixed(2);
    metalnessValue.textContent = metalness.toFixed(2);
    emissiveIntensityValue.textContent = emissiveIntensity.toFixed(2);
}

function onFaceShaderPropertyChange() {
    if (!currentFaceMaterial) return;

    const roughness = parseFloat(faceRoughnessSlider.value);
    const metalness = parseFloat(faceMetalnessSlider.value);
    const emissiveIntensity = parseFloat(faceEmissiveIntensitySlider.value);
    const emissiveColor = new THREE.Color(faceEmissiveColorInput.value);

    currentFaceMaterial.roughness = roughness;
    currentFaceMaterial.metalness = metalness;
    currentFaceMaterial.emissiveIntensity = emissiveIntensity;
    currentFaceMaterial.emissive.set(emissiveColor);

    // Update UI display values
    faceRoughnessValue.textContent = roughness.toFixed(2);
    faceMetalnessValue.textContent = metalness.toFixed(2);
    faceEmissiveIntensityValue.textContent = emissiveIntensity.toFixed(2);
}

function updateModelMaterial(newMaterial) {
    defaultMaterial = newMaterial;
    for (const partName in modelParts) {
        const part = modelParts[partName];
        // The part itself might be a group, so we traverse its children
        part.traverse((child) => {
            if (child.isMesh && child.name !== "facePlane") { // Exclude the face
                child.material = newMaterial;
            }
        });
    }
    // Need to re-assign face material as it might get overwritten by traverse
    const head = modelParts.head;
    if (head) {
        const facePlane = head.getObjectByName("facePlane");
        if(facePlane) facePlane.material.needsUpdate = true; // Ensure it re-renders
    }
}

// --- JSON Import Functions ---
function openJsonImportModal() {
    jsonImportModal.style.display = 'flex';
}

function closeJsonImportModal() {
    jsonImportModal.style.display = 'none';
}

/* Persistent animation helpers */

// Load latest saved animations (top-level, newest first) and show a short console summary.
// This function is non-blocking for the UI and fails gracefully.
async function loadSavedAnimations() {
    try {
        const animations = room.collection('animation').getList() || [];
        // getList returns newest-to-oldest; we keep that but provide a small console summary for debugging.
        if (animations.length > 0) {
            console.log(`Loaded ${animations.length} saved animation(s) from DB. Most recent:`, animations[0].title || animations[0].id);
        } else {
            console.log('No saved animations found in DB.');
        }
        // Optionally you could populate a UI list here for users to pick saved animations.
    } catch (err) {
        console.warn('Error while fetching saved animations:', err);
    }
}

async function loadAnimationFromJson() {
    const jsonString = jsonImportTextarea.value;
    if (!jsonString) {
        alert("Textarea is empty. Please paste your JSON.");
        return;
    }

    try {
        const result = JSON.parse(jsonString);

        // Basic schema validation: must be object with non-empty keyframes array and each keyframe must have rotations object
        if (!result || !Array.isArray(result.keyframes) || result.keyframes.length === 0) {
            throw new Error('Invalid JSON format. Expected an object with a non-empty "keyframes" array.');
        }
        for (let i = 0; i < result.keyframes.length; i++) {
            const k = result.keyframes[i];
            if (!k || typeof k !== 'object' || !k.rotations || typeof k.rotations !== 'object') {
                throw new Error(`Keyframe ${i} is missing a valid "rotations" object.`);
            }
        }

        // Stop any current animation
        isAnimating = false;
        keyframes = [];

        // Display imported JSON in the output container
        jsonOutputContainer.style.display = 'flex';
        openJsonPanelBtn.style.display = 'none'; // Hide open button
        jsonOutputElement.textContent = JSON.stringify(result, null, 2);

        // Load and start the new animation
        keyframes = result.keyframes;
        currentFrame = 0;
        animationProgress = 0;
        isAnimating = true;

        // Persist the imported animation to the database with some metadata (username auto-attached)
        try {
            await room.collection('animation').create({
                title: result.title || `Imported animation ${new Date().toISOString()}`,
                prompt: result.prompt || animationPromptInput.value || null,
                keyframe_count: result.keyframes.length,
                keyframes: result.keyframes,
                source: 'import',
            });
            console.log('Imported animation saved to DB.');
        } catch (dbErr) {
            console.warn('Failed to save imported animation to DB:', dbErr);
        }

        closeJsonImportModal(); // Close modal on success
    } catch (error) {
        console.error("Error parsing or loading animation from JSON:", error);
        alert(`Failed to load animation: ${error.message}`);
    }
}

async function onAnimateClick() {
    // Resume audio context if it's still suspended (e.g., if this is the first interaction)
    if (isAudioEnabled && audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    const prompt = animationPromptInput.value;
    const iterations = parseInt(iterationsInput.value, 10);
    if (!prompt || isNaN(iterations) || iterations < 2) {
        alert("Please enter a valid prompt and number of keyframes (at least 2).");
        return;
    }

    // Do not reset the pose, just clear animation data
    isAnimating = false;
    keyframes = [];

    loadingIndicator.style.display = 'block';
    animateButton.disabled = true;
    animationPromptInput.disabled = true;
    resetButton.disabled = true;
    importJsonButton.disabled = true;

    const initialPoseForLlm = {};
    // Get current pose for the LLM
    for (const partName in modelParts) {
        const part = modelParts[partName];
        const rotDeg = {
            x: THREE.MathUtils.radToDeg(part.rotation.x),
            y: THREE.MathUtils.radToDeg(part.rotation.y),
            z: THREE.MathUtils.radToDeg(part.rotation.z),
        };
        initialPoseForLlm[partName] = rotDeg;
    }
    // Set the pelvis position to the model's current position
    initialPoseForLlm.pelvis.position = {
        x: humanoidModel.position.x,
        y: humanoidModel.position.y,
        z: humanoidModel.position.z,
    };

    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a 3D animation assistant. Your task is to generate a sequence of keyframes to animate a humanoid model based on a user's prompt. 
The model has the following controllable parts: 'head', 'torso', 'spine', 'pelvis', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg'.
The animation will be generated for a specific number of keyframes. You must return a JSON object containing a "keyframes" array. Each element in the array is a keyframe and should contain a \`rotations\` object with rotations for every part. The keyframe can also optionally contain a \`position\` object for the 'pelvis' to move the entire model (x, y, z). The 'pelvis' is the root of the model.
Rotations should be provided in Euler angles (degrees).
- For arms and legs, rotation.z controls side-to-side movement (abduction/adduction). rotation.x controls forward/backward movement (flexion/extension).
- For lower arms/legs (elbows/knees), rotation.x is the primary axis for bending. Use small values for other axes.
- For the head, rotation.x is nodding, rotation.y is shaking 'no', rotation.z is tilting.
- For the torso and spine, use small rotations for bending or twisting.

The first keyframe should be the initial pose provided. The final keyframe should smoothly loop back to the first keyframe's pose (both rotation and position).
Respond ONLY with the JSON object.
Initial pose (in degrees and world units): ${JSON.stringify(initialPoseForLlm)}`
                },
                {
                    role: "user",
                    content: `Generate an animation for "${prompt}" with ${iterations} keyframes.`
                }
            ],
            json: true,
        });

        const result = JSON.parse(completion.content);
        
        jsonOutputContainer.style.display = 'flex';
        openJsonPanelBtn.style.display = 'none'; // Hide open button when new JSON is generated
        jsonOutputElement.textContent = JSON.stringify(result, null, 2);

        if (result && result.keyframes) {
            keyframes = result.keyframes;
            currentFrame = 0;
            animationProgress = 0;
            isAnimating = true;
        } else {
            throw new Error("Invalid response format from AI.");
        }
    } catch (error) {
        console.error("Error generating animation:", error);
        alert("Failed to generate animation. Please check the console for details.");
    } finally {
        loadingIndicator.style.display = 'none';
        animateButton.disabled = isEditMode; // Respect edit mode state
        animationPromptInput.disabled = isEditMode;
        resetButton.disabled = false;
        importJsonButton.disabled = isEditMode;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    const elapsedTime = performance.now();

    // Handle random sound playback
    if (isAudioInitialized && isAudioEnabled && hitBuffers.length > 0) {
        if (elapsedTime - lastHitTime > nextHitDelay) {
            playRandomHitSound();
            setNextRandomHitTime();
        }
    }

    if (isAnimating && keyframes.length > 0) {
        animationProgress += deltaTime * BASE_ANIMATION_SPEED * animationSpeedMultiplier;
        
        if (animationProgress >= 1.0) {
            animationProgress %= 1.0; // Use modulo to handle fast frame skips
            currentFrame = (currentFrame + 1) % keyframes.length;
        }
        
        const startFrame = keyframes[currentFrame];
        const endFrame = keyframes[(currentFrame + 1) % keyframes.length];

        if (startFrame && endFrame) {
            // Animate Rotations
            for (const partName in startFrame.rotations) {
                if (modelParts[partName] && startFrame.rotations[partName] && endFrame.rotations[partName]) {
                    const part = modelParts[partName];
                    const startRot = startFrame.rotations[partName];
                    const endRot = endFrame.rotations[partName];

                    part.rotation.x = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(startRot.x), THREE.MathUtils.degToRad(endRot.x), animationProgress);
                    part.rotation.y = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(startRot.y), THREE.MathUtils.degToRad(endRot.y), animationProgress);
                    part.rotation.z = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(startRot.z), THREE.MathUtils.degToRad(endRot.z), animationProgress);
                }
            }

            // Animate Position (optional, on pelvis)
            const startPos = (startFrame.rotations.pelvis && startFrame.rotations.pelvis.position) ? startFrame.rotations.pelvis.position : initialPose.position;
            const endPos = (endFrame.rotations.pelvis && endFrame.rotations.pelvis.position) ? endFrame.rotations.pelvis.position : initialPose.position;

            if (startPos && endPos && humanoidModel) {
                 humanoidModel.position.x = THREE.MathUtils.lerp(startPos.x, endPos.x, animationProgress);
                 humanoidModel.position.y = THREE.MathUtils.lerp(startPos.y, endPos.y, animationProgress);
                 humanoidModel.position.z = THREE.MathUtils.lerp(startPos.z, endPos.z, animationProgress);
            }
        }
    }

    renderer.render(scene, camera);
}

init();