import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ModelEditor } from './model-editor.js';
import { UIManager } from './ui-manager.js';
import { ObjectsManager } from './objects-manager.js';
import { CameraManager } from './camera-manager.js';
import { AnimationManager } from './animations-manager.js';
import { ImportExportManager } from './import-export-manager.js';
import { getEl } from './safe-dom.js';

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas: getEl('renderCanvas','canvas'), antialias: true });
const uiPanelWidth = getEl('ui-panel','div').offsetWidth || 0;
renderer.setSize(window.innerWidth - uiPanelWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// enable local clipping so per-material clippingPlanes used by slice feature work
renderer.localClippingEnabled = true;

// Lights
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Ground plane
const planeGeometry = new THREE.PlaneGeometry(20, 20);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.5;
scene.add(plane);

// Grid Helper
const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
scene.add(gridHelper);

// --- Controls ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true; // Explicitly ensure zoom is enabled

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.addEventListener('dragging-changed', function (event) {
    controls.enabled = !event.value;
});
scene.add(transformControls);


 // --- Initialize Editor, UI, Input and Systems in enforced order ---
 // Core (ModelEditor) created earlier above controls; attach editor now
 const editor = new ModelEditor(scene, camera, renderer, controls, transformControls);

 // Objects manager can be attached early (doesn't require input/systems)
 const objectsManager = new ObjectsManager(editor, scene);
 editor.objectsManager = objectsManager;

 // Camera manager is core-ish but does not depend on systems; attach now
 const cameraManager = new CameraManager(editor, camera, controls, renderer);
 editor.cameraManager = cameraManager;

 // 1) UI - initialize UI early so it can provide elements/placeholders for systems
 const uiManager = new UIManager(editor);
 editor.ui = uiManager; // make available before init so systems can reference during init
 uiManager.init();

 // 2) InputManager - initialize after UI so input handlers can manipulate UI safely
 import { InputManager } from './InputManager.js';
 const inputManager = new InputManager(editor);
 editor.inputManager = inputManager;
 if (inputManager && typeof inputManager.init === 'function') inputManager.init();

 // 3) Systems - instantiate and init in defined order so they can rely on UI & Input
 import { PhysicsSystem } from './PhysicsSystem.js';
 import { ProceduralSystem } from './ProceduralSystem.js';
 import { SculptSystem } from './SculptSystem.js';
 import { TexturePaintSystem } from './TexturePaintSystem.js';
 import { VertexPaintSystem } from './VertexPaintSystem.js';
 import { NodeEditorSystem } from './NodeEditorSystem.js';
 import { AudioSystem } from './AudioSystem.js';
 import { CloudSystem } from './CloudSystem.js';
 import { SystemManager } from './SystemManager.js';

 // Instantiate systems (do not assume immediate init)
 const physicsSystem = new PhysicsSystem(editor);
 const proceduralSystem = new ProceduralSystem(editor);
 const sculptSystem = new SculptSystem(editor);
 const texturePaintSystem = new TexturePaintSystem(editor);
 const vertexPaintSystem = new VertexPaintSystem(editor);
 const nodeEditorSystem = new NodeEditorSystem(editor);
 const audioSystem = new AudioSystem(editor);
 const cloudSystem = new CloudSystem(editor);

 // Create a centralized manager to keep system init logic in one place
 const systemManager = new SystemManager(editor);

 systemManager.register('physicsSystem', physicsSystem);
 systemManager.register('proceduralSystem', proceduralSystem);
 systemManager.register('sculptSystem', sculptSystem);
 systemManager.register('texturePaintSystem', texturePaintSystem);
 systemManager.register('vertexPaintSystem', vertexPaintSystem);
 systemManager.register('nodeEditorSystem', nodeEditorSystem);
 systemManager.register('audioSystem', audioSystem);
 systemManager.register('cloudSystem', cloudSystem);

 // Expose manager and systems on editor for compatibility
 editor.systemManager = systemManager;
 editor.physicsSystem = physicsSystem;
 editor.proceduralSystem = proceduralSystem;
 editor.sculptSystem = sculptSystem;
 editor.texturePaintSystem = texturePaintSystem;
 editor.vertexPaintSystem = vertexPaintSystem;
 editor.nodeEditorSystem = nodeEditorSystem;
 editor.audioSystem = audioSystem;
 editor.cloudSystem = cloudSystem;

 // Perform ordered, safe initialization (fire-and-forget)
 (async () => {
   try {
     await systemManager.initAll();
   } catch (e) {
     console.warn('SystemManager.initAll error', e);
   }
 })();

 // 4) Import/Export - attach centralized facade after core systems are registered
 const importExportManager = new ImportExportManager(editor);
 editor.importExport = importExportManager;

 // expose ui manager again (already initialized) for consistency
 editor.ui = uiManager;

// --- Event Listeners ---
window.addEventListener('resize', () => {
    const newWidth = window.innerWidth - uiPanelWidth;
    const newHeight = window.innerHeight;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
});

 // Click listener for object selection
 renderer.domElement.addEventListener('click', (event) => {
     // Only select if transformControls is not actively dragging
     if (!transformControls.dragging) {
         editor.onCanvasClick(event);
     }
 });

 // Listen for messages from the import popup
 window.addEventListener('message', (evt) => {
     // Expect messages like { action: 'import', sourceType: 'url'|'file'|'file-multi', url: '...', files: { name: objectURL, ... } }
     if (!evt.data || evt.data.action !== 'import') return;
     const { sourceType, url, name, files } = evt.data;
     uiManager.showStatus(`Importing model ${name || ''}...`);

     if (!editor.importExport) {
         uiManager.showStatus('Import manager not available', 4000);
         return;
     }
     // Use the centralized import/export manager which supports multi-file packages
     editor.importExport.importModel((sourceType === 'file-multi' && files && typeof files === 'object') ? { url, files, name } : (url || { url, name }))
         .then(() => uiManager.showStatus(`Imported ${name || 'model'}.`))
         .catch((err) => {
             console.error('Import error from popup:', err);
             uiManager.showStatus(`Error importing model: ${err.message}`, 5000);
         });
 });

const clock = new THREE.Clock();
// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    controls.update(); // only required if controls.enableDamping is set to true
    editor.update(delta); // pass delta to advance animations

    renderer.render(scene, camera);
}

animate();