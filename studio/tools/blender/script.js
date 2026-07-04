import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js'; 
import { 
    SphereGeometry, IcosahedronGeometry, ConeGeometry, TorusGeometry, CapsuleGeometry, PlaneGeometry, CircleGeometry, CylinderGeometry 
} from 'three'; 
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'; 
import { FontLoader } from 'three/addons/loaders/FontLoader.js'; 
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'; 
import { 
    initializeUVSettings, updateUVEditor, 
    initializeShaderEditor, updateShaderNodeMaterialInputs, updateMaterialOutputNodeMaterial, 
    uvCamera, createDefaultShaderConnection, updateAllConnections, isPrincipledBSDFConnected,
    createImageTextureNodeDOM, createBrickTextureNodeDOM, createCheckerTextureNodeDOM, createGradientTextureNodeDOM, createNoiseTextureNodeDOM, createAddShaderNodeDOM
} from './editors.js'; 

import { 
    Command, 
    ApplyBevelModifierCommand, 
    RemoveBevelModifierCommand, 
    ApplyArrayModifierCommand, 
    RemoveArrayModifierCommand, 
    ApplyScrewModifierCommand, 
    RemoveScrewModifierCommand, 
    ApplyBendModifierCommand, 
    RemoveBendModifierCommand, 
    generateScrewGeometry,
    generateBendGeometry 
} from './modifiers.js';

import{
    createCube,
    createUVSphere,
    createIcoSphere,
    createCone,
    createTorus,
    createCapsule,
    createCircle,
    createTriangle,
    createGridPlane,
    createSquarePyramid,
    createCylinder
} from './object-utils.js';

import{
    initializeChatManager, addMessageToChatHistory, currentLanguage, languageConfig
} from './chat-manager.js';

import { playSound } from './audio-manager.js'; 

let scene, camera, renderer, controls;
let gltfLoader;
let currentModel = null; 
let objectCount = 0; 
let memoryUsageSpan;
let gridHelper; 

let commandHistory = [];
let redoStack = [];
const MAX_HISTORY_SIZE = 50; 
let isUndoingRedoing = false; 

let currentMaterial = null; 

let raycaster;
let mouse;
let activeObject = null; 
let selectedObjects = []; 
let transformControls; 
let isModelingModeActive = false; 
let activeTool = 'select'; 
let currentEditorMode = '3d-viewport'; 
let isBoxSelecting = false; 

let composer;
let outlinePass;

let contextMenu;
let deleteMenuItem;
let hideContextMenuListener = null;

let addMeshMenu;
let lastMouseX = 0; 
let lastMouseY = 0;
let hideAddMeshMenuListener = null; 

let sceneCollectionContextMenu;
let renameObjectMenuItem, copyObjectMenuItem, pasteObjectMenuItem, deleteObjectFromSceneCollectionMenuItem;
let copiedObjectData = null; 
let hideSceneCollectionContextMenuListener = null;

let addModifierBtn;
let addModifierMenu;
let hideAddModifierMenuListener = null;
let addModifierBevelItem; 
let addModifierArrayItem; 
let addModifierScrewItem; 
let addModifierBendItem; 
let addShaderNodeMenu; 
let hideAddShaderNodeMenuListener = null; 
let addShaderNodeImageTextureItem; 
let addShaderNodeBrickTextureItem; 
let addShaderNodeCheckerTextureItem; 
let addShaderNodeGradientTextureItem; 
let addShaderNodeNoiseTextureItem; 
let addShaderNodeAddShaderItem;

let addIcoSphereMenuItem; 
let addPyramidMenuItem;

let bevelModifierSettingsPanel;
let bevelAffectTypeSelect, bevelWidthTypeSelect, bevelAmountInput, bevelSegmentsInput, bevelLimitMethodSelect;
let arrayModifierSettingsPanel;
let arrayFitTypeSelect, arrayCountInput;
let arrayRelOffsetXInput, arrayRelOffsetYInput, arrayRelOffsetZInput;
let arrayConstOffsetXInput, arrayConstOffsetYInput, arrayConstOffsetZInput;
let screwModifierSettingsPanel;
let screwAxisInput, screwAngleInput, screwOffsetInput, screwIterationsInput, screwStepsInput;
let bendModifierSettingsPanel; 
let bendAxisSelect, bendAngleInput; 

let propsArrayHeader = document.getElementById('props-array-header');
let propsArrayBody = document.getElementById('props-array-body');
let collapseButtonArray = propsArrayHeader.querySelector('.pref-collapse-button');

let propsBevelHeader = document.getElementById('props-bevel-header');
let propsBevelBody = document.getElementById('props-bevel-body');
let collapseButtonBevel = propsBevelHeader.querySelector('.pref-collapse-button');

let propsScrewHeader = document.getElementById('props-screw-header');
let propsScrewBody = document.getElementById('props-screw-body');
let collapseButtonScrew = propsScrewHeader.querySelector('.pref-collapse-button');

let propsBendHeader = document.getElementById('props-bend-header'); 
let propsBendBody = document.getElementById('props-bend-body'); 
let collapseButtonBend = document.getElementById('props-bend-header').querySelector('.pref-collapse-button'); 

let appliedModifiersList;
let noModifiersMessage;

let modelingMenuItem;
let modelingGizmoToggleBtn;
let toolSelectBtn, toolMoveBtn, toolRotateBtn, toolScaleBtn, toolAddCubeBtn; 
let toolBoxSelectBtn;
let modelingToolButtons = []; 
let toolAddText3dBtn;

let objectCountSpan; 

let sceneCollectionPanel;
let sceneCollectionPanelHeader;
let collapseSceneCollectionButton;
let sceneCollectionList;
let objectUIElements = new Map(); 

let propertiesPanel;
let propertiesPanelHeader;
let collapsePropertiesButton;
let selectedObjectNameDisplay; 
let isUpdatingPropertiesPanel = false; 

let materialListSelect, addMaterialBtn, removeMaterialBtn;
let materialColorInput, materialMetallicInput, materialRoughnessInput, materialIORInput, materialAlphaInput;
let propsSurfaceHeader, propsSurfaceBody, collapseButtonSurface;

let materialNameCounter = 1; 

let ambientLight;
let directionalLight;
const initialBrightness = 1.0;

let initialTransformState = null;

let editorType3DViewportMenuItem;
let editorTypeUVEditingMenuItem;
let editorTypeShaderEditorMenuItem; 
let editorTypePrompt3dEditorMenuItem;

let uvEditorPanel;
let shaderEditorPanelDiv; 
let prompt3dEditorPanel;

let shaderNodeGraphArea; 
let shaderAddNodeButton;

let exportGlbButton;

let newTextDialog;
let textContentInput, textSizeInput, textDepthInput;
let create3dTextBtn, cancel3dTextBtn;
let fonts = {}; 
let textFontSelect; 

let promptInput;
let submitPromptBtn;

let commandContext;

let viewportContainer; 
let boxSelectOverlay;
let startMousePosition = new THREE.Vector2();
let endMousePosition = new THREE.Vector2();

let objectJoinSelectedMenuItem;

class AddObjectCommand extends Command {
    constructor(object) {
        super("AddObject");
        this.object = object;
        this.parent = object.parent; 
        this.originalPosition = object.position.clone();
        this.originalRotation = object.rotation.clone();
        this.originalScale = object.scale.clone();
    }
    execute(context) {
        context.scene.add(this.object);
        this.object.traverse(child => { if (child.isMesh) child.visible = true; });
        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updateSelectionUI(); 
    }
    undo(context) {
        if (context.activeObject === this.object) {
            context.setActiveObject(null); 
        }
        const indexInSelected = context.selectedObjects.indexOf(this.object);
        if (indexInSelected !== -1) {
            context.selectedObjects.splice(indexInSelected, 1);
        }
        
        if (this.parent) { 
            this.parent.remove(this.object);
        } else {
            context.scene.remove(this.object); 
        }
        
        context.disposeObject(this.object); 
        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updateSelectionUI(); 
    }
}

class DeleteObjectCommand extends Command {
    constructor(object) {
        super("DeleteObject");
        this.object = object;
        this.parent = object.parent; 
        this.originalPosition = object.position.clone();
        this.originalRotation = object.rotation.clone();
        this.originalScale = object.scale.clone();
        this.prevActiveObject = activeObject; 
        this.prevSelectedObjects = [...selectedObjects]; 
    }
    execute(context) {
        const indexInSelected = context.selectedObjects.indexOf(this.object);
        if (indexInSelected !== -1) {
            context.selectedObjects.splice(indexInSelected, 1);
        }
        if (context.activeObject === this.object) {
            context.activeObject = context.selectedObjects.length > 0 ? context.selectedObjects[0] : null; 
        }

        if (this.parent) { 
            this.parent.remove(this.object);
        } else {
            context.scene.remove(this.object); 
        }
        
        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updateSelectionUI(); 
    }
    undo(context) {
        if (this.parent) {
            this.parent.add(this.object);
        } else {
            context.scene.add(this.object);
        }
        
        this.object.position.copy(this.originalPosition);
        this.object.rotation.copy(this.originalRotation);
        this.object.scale.copy(this.originalScale);

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.selectedObjects = [...this.prevSelectedObjects];
        context.activeObject = this.prevActiveObject;
        context.updateSelectionUI();
    }
}

class LoadMultipleGLBCommand extends Command {
    constructor(fileDataArray) {
        super("LoadGLB"); 
        this.fileDataArray = fileDataArray;
        this.loadedModels = []; 
    }

    async execute(context) {
        const sceneIsEmpty = context.scene.children.filter(obj => obj.userData.isManagedObject).length === 0;

        const loadPromises = this.fileDataArray.map(fileData => {
            return new Promise((resolve, reject) => {
                gltfLoader.load(fileData.url, (gltf) => {
                    const modelGroup = gltf.scene;
                    modelGroup.name = fileData.filename; 
                    modelGroup.userData.isManagedObject = true; 
                    
                    context.scene.add(modelGroup);
                    this.loadedModels.push(modelGroup);

                    context.addMessageToChatHistory(context.languageConfig[context.currentLanguage].ui.modelLoaded(fileData.filename), 'ai');
                    resolve(modelGroup);
                }, undefined, (error) => {
                    console.error(`An error happened while loading GLB ${fileData.filename}:`, error);
                    context.addMessageToChatHistory(context.languageConfig[context.currentLanguage].ui.modelLoadError(error.message), 'ai');
                    reject(error);
                });
            });
        });

        try {
            const loadedGroups = await Promise.all(loadPromises);

            if (loadedGroups.length > 0) {
                if (sceneIsEmpty) {
                    const overallBox = new THREE.Box3();
                    loadedGroups.forEach(group => {
                        overallBox.expandByObject(group);
                    });

                    if (!overallBox.isEmpty()) {
                        const center = overallBox.getCenter(new THREE.Vector3());
                        const size = overallBox.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        const fov = camera.fov * (Math.PI / 180);
                        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                        cameraZ *= 1.5;
                        camera.position.set(center.x, center.y, center.z + cameraZ);
                        controls.target.copy(center);
                        controls.update();
                    }
                }

                context.updateObjectCountUI();
                context.updateSceneCollectionUI(); 
                context.setActiveObject(loadedGroups[loadedGroups.length - 1]); 
            }
        } catch (error) {
            console.error("One or more models failed to load.", error);
            context.updateObjectCountUI();
            context.updateSceneCollectionUI();
            const lastSuccessful = this.loadedModels.length > 0 ? this.loadedModels[this.loadedModels.length - 1] : null;
            context.setActiveObject(lastSuccessful);
        }
    }

    undo(context) {
        this.loadedModels.forEach(model => {
            if (context.activeObject === model) {
                context.setActiveObject(null);
            }
            context.scene.remove(model);
            context.disposeObject(model);
        });
        
        this.loadedModels = [];
        context.updateObjectCountUI();
        context.updateSceneCollectionUI();
        context.updateSelectionUI();
        context.addMessageToChatHistory(languageConfig[currentLanguage].ui.sceneRestored, 'ai');
    }
}

class TransformObjectCommand extends Command {
    constructor(object, startState) { 
        super("TransformObject");
        this.object = object;
        this.startState = startState;
        this.endState = {
            position: object.position.clone(),
            rotation: object.rotation.clone(),
            scale: object.scale.clone()
        };
    }
    execute(context) {
        this.object.position.copy(this.endState.position);
        this.object.rotation.copy(this.endState.rotation);
        this.object.scale.copy(this.endState.scale);
        context.updateSelectionUI(); 
    }
    undo(context) {
        this.object.position.copy(this.startState.position);
        this.object.rotation.copy(this.startState.rotation);
        this.object.scale.copy(this.startState.scale);
        context.updateSelectionUI(); 
    }
}

class MaterialCommand extends Command {
    constructor(object, action, materialData) { 
        super("MaterialCommand");
        this.object = object;
        this.action = action;
        this.materialData = materialData; 
    }

    execute(context) {
        if (!this.object) return;
        if (!Array.isArray(this.object.material)) {
            this.object.material = [this.object.material];
        }
        if (this.action === 'add') {
            this.object.material.push(this.materialData.material);
        } else if (this.action === 'remove') {
            this.object.material.splice(this.materialData.index, 1);
            if (this.object.material.length === 1) {
                this.object.material = this.object.material[0];
            }
        }
        context.updateSelectionUI(); 
    }

    undo(context) {
        if (!this.object) return;
        if (!Array.isArray(this.object.material)) {
            this.object.material = [this.object.material];
        }
        if (this.action === 'add') {
            const indexToRemove = this.object.material.length - 1;
            this.object.material.splice(indexToRemove, 1);
            if (this.object.material.length === 1) {
                this.object.material = this.object.material[0];
            }
        } else if (this.action === 'remove') {
            this.object.material.splice(this.materialData.index, 0, this.materialData.material);
        }
        context.updateSelectionUI(); 
    }
}

class RenameObjectCommand extends Command {
    constructor(object, newName, oldName) {
        super("RenameObject");
        this.object = object;
        this.newName = newName;
        this.oldName = oldName;
    }
    execute(context) {
        if (!this.object) return;
        this.object.name = this.newName;
        context.updateSceneCollectionUI();
        context.updateSelectionUI(); 
    }
    undo(context) {
        if (!this.object) return;
        this.object.name = this.oldName;
        context.updateSceneCollectionUI();
        context.updateSelectionUI(); 
    }
}

class JoinObjectsCommand extends Command {
    constructor(objectsToJoin) {
        super("JoinObjects");
        this.objectsToJoin = [...objectsToJoin]; 
        this.newGroup = null; 
        this.originalStates = []; 

        this.objectsToJoin.forEach(obj => {
            this.originalStates.push({
                object: obj,
                parent: obj.parent,
                position: obj.position.clone(),
                rotation: obj.rotation.clone(),
                scale: obj.scale.clone(),
                uuid: obj.uuid 
            });
        });
    }

    execute(context) {
        if (this.objectsToJoin.length < 2) {
            console.warn("JoinObjectsCommand: Requires at least two objects to join.");
            context.addMessageToChatHistory(context.languageConfig[context.currentLanguage].ui.joinNotEnoughObjects, 'ai'); 
            return; 
        }

        this.newGroup = new THREE.Group();
        this.newGroup.name = "Joined_Object";
        this.newGroup.uuid = THREE.MathUtils.generateUUID(); 
        this.newGroup.userData.isManagedObject = true;
        this.newGroup.userData.isJoinedGroup = true; 
        
        context.scene.add(this.newGroup);

        this.objectsToJoin.forEach(obj => {
            if (obj.parent) {
                this.newGroup.attach(obj); 
                obj.userData.isJoinedChild = true;
                obj.userData.joinedParentUUID = this.newGroup.uuid;
            } else {
                console.warn(`Object ${obj.name} (UUID: ${obj.uuid}) was not in scene when attempting to join.`);
            }
        });
        
        context.setActiveObject(this.newGroup); 
        context.updateObjectCountUI();
        context.updateSceneCollectionUI();
        context.playSound("/screw_apply.mp3");
        context.addMessageToChatHistory(context.languageConfig[context.currentLanguage].ui.objectJoined(this.objectsToJoin.length, this.newGroup.name), 'ai');
    }

    undo(context) {
        if (!this.newGroup) return;

        if (context.activeObject === this.newGroup) {
            context.setActiveObject(null);
        }

        this.originalStates.forEach(state => {
            const { object, parent, position, rotation, scale } = state;
            
            const objInScene = context.scene.getObjectByProperty('uuid', object.uuid);
            if (objInScene) { 
                if (parent) {
                    parent.attach(objInScene); 
                } else {
                    context.scene.attach(objInScene); 
                }
                
                objInScene.position.copy(position);
                objInScene.rotation.copy(rotation);
                objInScene.scale.copy(scale);
                
                delete objInScene.userData.isJoinedChild;
                delete objInScene.userData.joinedParentUUID;
            } else {
                console.warn(`Object ${object.name} (UUID: ${object.uuid}) not found in scene during undo of join operation.`);
            }
        });

        context.scene.remove(this.newGroup);
        this.newGroup = null; 

        context.selectedObjects = [...this.objectsToJoin];
        if (this.objectsToJoin.length > 0) {
            context.activeObject = this.objectsToJoin[0];
        } else {
            context.activeObject = null;
        }

        context.updateObjectCountUI();
        context.updateSceneCollectionUI();
        context.updateSelectionUI();
        context.addMessageToChatHistory(context.languageConfig[currentLanguage].ui.undoJoin, 'ai');
    }
}

function disposeObject(object) {
    if (!object) return;

    object.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                for (const material of child.material) material.dispose();
            } else {
                child.material.dispose();
            }
        }
    });
}

function executeCommand(command) {
    if (isUndoingRedoing) return; 

    redoStack = [];

    commandContext = {
        scene,
        activeObject, 
        selectedObjects,
        addMessageToChatHistory,
        languageConfig,
        currentLanguage,
        playSound,
        updatePropertiesPanel,
        updateAppliedModifiersListUI,
        updateObjectCountUI,
        updateSceneCollectionUI,
        setActiveObject, 
        updateSelectionUI, 
        currentEditorMode,
        updateUVEditor,
        updateShaderNodeMaterialInputs, 
        currentMaterial, 
        disposeObject,
        transformControls 
    };

    command.execute(commandContext); 

    commandHistory.push(command);
    if (commandHistory.length > MAX_HISTORY_SIZE) {
        const oldestCommand = commandHistory.shift();
    }
    console.log(`Executed command: ${command.name}. History size: ${commandHistory.length}, Redo size: ${redoStack.length}`);
}

function undoLastCommand() {
    if (commandHistory.length === 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.undoNoHistory, 'ai');
        return;
    }
    isUndoingRedoing = true;
    const command = commandHistory.pop();
    
    commandContext = {
        scene,
        activeObject,
        selectedObjects,
        addMessageToChatHistory,
        languageConfig,
        currentLanguage,
        playSound,
        updatePropertiesPanel,
        updateAppliedModifiersListUI,
        updateObjectCountUI,
        updateSceneCollectionUI,
        setActiveObject,
        updateSelectionUI,
        currentEditorMode,
        updateUVEditor,
        updateShaderNodeMaterialInputs,
        currentMaterial,
        disposeObject,
        transformControls 
    };

    command.undo(commandContext);
    redoStack.push(command);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.undoSuccess(command.name), 'ai');
    console.log(`Undone command: ${command.name}. History size: ${commandHistory.length}, Redo size: ${redoStack.length}`);
    isUndoingRedoing = false;
}

function redoLastCommand() {
    if (redoStack.length === 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.redoNoHistory, 'ai');
        return;
    }
    isUndoingRedoing = true;
    const command = redoStack.pop();

    commandContext = {
        scene,
        activeObject,
        selectedObjects,
        addMessageToChatHistory,
        languageConfig,
        currentLanguage,
        playSound,
        updatePropertiesPanel,
        updateAppliedModifiersListUI,
        updateObjectCountUI,
        updateSceneCollectionUI,
        setActiveObject,
        updateSelectionUI,
        currentEditorMode,
        updateUVEditor,
        updateShaderNodeMaterialInputs,
        currentMaterial,
        disposeObject,
        transformControls 
    };

    command.execute(commandContext);
    commandHistory.push(command);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.redoSuccess(command.name), 'ai');
    console.log(`Redone command: ${command.name}. History size: ${commandHistory.length}, Redo size: ${redoStack.length}`);
    isUndoingRedoing = false;
}

export function init() { 
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 3); 

    const canvas = document.getElementById('renderCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true }); 
    renderer.setPixelRatio(window.devicePixelRatio);
    viewportContainer = document.getElementById('viewport-container');
    renderer.setSize(viewportContainer.clientWidth, viewportContainer.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; 

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.01;
    controls.maxDistance = 500;

    ambientLight = new THREE.AmbientLight(0xffffff, 0.6 * initialBrightness);
    scene.add(ambientLight);

    directionalLight = new THREE.DirectionalLight(0xffffff, 0.8 * initialBrightness);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);

    gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x888888); 
    scene.add(gridHelper);

    gltfLoader = new GLTFLoader();

    memoryUsageSpan = document.getElementById('memory-usage');
    const fontLoader = new FontLoader();
    let loadedFontsCount = 0;
    const totalFontsToLoad = 4;

    const onFontLoaded = (fontData, fontName) => {
        fonts[fontName] = fontData;
        loadedFontsCount++;
        if (loadedFontsCount === totalFontsToLoad) {
            addMessageToChatHistory(languageConfig[currentLanguage].ui.fontLoaded, 'ai');
        }
    };

    const onFontLoadError = (error, fontName) => {
        console.error(`An error occurred loading ${fontName} font:`, error);
        addMessageToChatHistory(languageConfig[currentLanguage].ui.fontLoadError(fontName, error.message), 'ai');
        loadedFontsCount++; 
        if (loadedFontsCount === totalFontsToLoad) {
            addMessageToChatHistory(languageConfig[currentLanguage].ui.fontLoaded, 'ai');
        }
    };

    fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json', 
        (loadedFont) => onFontLoaded(loadedFont, 'Helvetiker Regular'), 
        undefined, 
        (error) => onFontLoadError(error, 'Helvetiker Regular')
    );
    fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', 
        (loadedFont) => onFontLoaded(loadedFont, 'Helvetiker Bold'), 
        undefined, 
        (error) => onFontLoadError(error, 'Helvetiker Bold')
    );
    fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/gentilis_regular.typeface.json',
        (loadedFont) => onFontLoaded(loadedFont, 'Gentilis Regular'),
        undefined,
        (error) => onFontLoadError(error, 'Gentilis Regular')
    );
    fontLoader.load('https://unpkg.com/three@0.160.0/examples/fonts/gentilis_bold.typeface.json',
        (loadedFont) => onFontLoaded(loadedFont, 'Gentilis Bold'),
        undefined,
        (error) => onFontLoadError(error, 'Gentilis Bold')
    );

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value; 
        if (activeObject) {
            if (event.value === true) { 
                initialTransformState = {
                    position: activeObject.position.clone(),
                    rotation: activeObject.rotation.clone(),
                    scale: activeObject.scale.clone()
                };
            } else { 
                if (initialTransformState) {
                    if (!initialTransformState.position.equals(activeObject.position) ||
                        !initialTransformState.rotation.equals(activeObject.rotation) ||
                        !initialTransformState.scale.equals(activeObject.scale)) {
                        const command = new TransformObjectCommand(activeObject, initialTransformState);
                        executeCommand(command);
                    }
                    initialTransformState = null; 
                }
            }
        }
    });
    transformControls.addEventListener('change', animate); 
    scene.add(transformControls);
    transformControls.detach(); 
    transformControls.visible = false; 

    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    outlinePass = new OutlinePass(new THREE.Vector2(viewportContainer.clientWidth, viewportContainer.clientHeight), scene, camera);
    outlinePass.edgeStrength = 3;
    outlinePass.edgeGlow = 0;
    outlinePass.edgeThickness = 1;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.set('#00ff00'); 
    outlinePass.hiddenEdgeColor.set('#000000'); 
    composer.addPass(outlinePass);

    contextMenu = document.getElementById('context-menu');
    deleteMenuItem = document.getElementById('delete-object-menu-item');
    deleteMenuItem.addEventListener('click', deleteSelectedObjects);

    addMeshMenu = document.getElementById('add-mesh-menu');
    document.getElementById('add-mesh-cube-item').addEventListener('click', () => addCubeToScene(true));
    document.getElementById('add-mesh-uvsphere-item').addEventListener('click', addUVSphereToScene);
    document.getElementById('add-mesh-icosphere-item').addEventListener('click', addIcoSphereToScene);
    document.getElementById('add-mesh-cone-item').addEventListener('click', addConeToScene);
    document.getElementById('add-mesh-torus-item').addEventListener('click', addTorusToScene);
    document.getElementById('add-mesh-capsule-item').addEventListener('click', addCapsuleToScene);
    document.getElementById('add-mesh-circle-item').addEventListener('click', addCircleToScene); 
    document.getElementById('add-mesh-triangle-item').addEventListener('click', addTriangleToScene); 
    document.getElementById('add-mesh-grid-item').addEventListener('click', addGridToScene);
    document.getElementById('add-mesh-pyramid-item').addEventListener('click', addSquarePyramidToScene);
    document.getElementById('add-mesh-cylinder-item').addEventListener('click', addCylinderToScene);

    sceneCollectionContextMenu = document.getElementById('scene-collection-context-menu');
    renameObjectMenuItem = document.getElementById('rename-object-menu-item');
    copyObjectMenuItem = document.getElementById('copy-object-menu-item');
    pasteObjectMenuItem = document.getElementById('paste-object-menu-item');
    deleteObjectFromSceneCollectionMenuItem = document.getElementById('delete-object-from-collection-menu-item');

    renameObjectMenuItem.addEventListener('click', startRenameOnActiveObject);
    copyObjectMenuItem.addEventListener('click', copyActiveObject);
    pasteObjectMenuItem.addEventListener('click', pasteObject);
    deleteObjectFromSceneCollectionMenuItem.addEventListener('click', deleteSelectedObjects); 

    addModifierBtn = document.getElementById('add-modifier-btn');
    addModifierMenu = document.getElementById('add-modifier-menu');
    addModifierBtn.addEventListener('click', onAddModifierBtnClick);

    addModifierBevelItem = document.getElementById('add-modifier-bevel'); 
    addModifierBevelItem.addEventListener('click', () => applyBevelModifier(true)); 

    addModifierArrayItem = document.getElementById('add-modifier-array'); 
    addModifierArrayItem.addEventListener('click', () => applyArrayModifier(true)); 
    
    addModifierScrewItem = document.getElementById('add-modifier-screw');
    addModifierScrewItem.addEventListener('click', () => applyScrewModifier(true));

    addModifierBendItem = document.getElementById('add-modifier-bend'); 
    addModifierBendItem.addEventListener('click', () => applyBendModifier(true)); 

    addShaderNodeMenu = document.getElementById('add-shader-node-menu'); 
    addShaderNodeImageTextureItem = document.getElementById('add-shader-node-image-texture'); 
    addShaderNodeBrickTextureItem = document.getElementById('add-shader-node-brick-texture'); 
    addShaderNodeCheckerTextureItem = document.getElementById('add-shader-node-checker-texture'); 
    addShaderNodeGradientTextureItem = document.getElementById('add-shader-node-gradient-texture'); 
    addShaderNodeNoiseTextureItem = document.getElementById('add-shader-node-noise-texture'); 
    addShaderNodeAddShaderItem = document.getElementById('add-shader-node-add-shader');
    addShaderNodeImageTextureItem.addEventListener('click', addImageTextureNodeToGraph); 
    addShaderNodeBrickTextureItem.addEventListener('click', addBrickTextureNodeToGraph); 
    addShaderNodeCheckerTextureItem.addEventListener('click', addCheckerTextureNodeToGraph); 
    addShaderNodeGradientTextureItem.addEventListener('click', addGradientTextureNodeToGraph); 
    addShaderNodeNoiseTextureItem.addEventListener('click', addNoiseTextureNodeToGraph); 
    addShaderNodeAddShaderItem.addEventListener('click', addAddShaderNodeToGraph);

    const shaderNodeCategoryTexture = document.getElementById('shader-node-category-texture');
    if (shaderNodeCategoryTexture) {
        shaderNodeCategoryTexture.addEventListener('click', (e) => {
            e.stopPropagation(); 

            const submenu = e.currentTarget.querySelector('.add-shader-node-submenu');
            if (submenu) {
                addShaderNodeMenu.querySelectorAll('.add-shader-node-submenu').forEach(otherSubmenu => {
                    if (otherSubmenu !== submenu && otherSubmenu.style.display === 'block') {
                        otherSubmenu.style.display = 'none';
                    }
                });

                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    }

    const shaderNodeCategoryShader = document.getElementById('shader-node-category-shader');
    if (shaderNodeCategoryShader) {
        shaderNodeCategoryShader.addEventListener('click', (e) => {
            e.stopPropagation(); 

            const submenu = e.currentTarget.querySelector('.add-shader-node-submenu');
            if (submenu) {
                addShaderNodeMenu.querySelectorAll('.add-shader-node-submenu').forEach(otherSubmenu => {
                    if (otherSubmenu !== submenu && otherSubmenu.style.display === 'block') {
                        otherSubmenu.style.display = 'none';
                    }
                });

                submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
            }
        });
    }

    bevelModifierSettingsPanel = document.getElementById('bevel-modifier-settings');
    bevelAffectTypeSelect = document.getElementById('bevel-affect-type');
    bevelWidthTypeSelect = document.getElementById('bevel-width-type');
    bevelAmountInput = document.getElementById('bevel-amount');
    bevelSegmentsInput = document.getElementById('bevel-segments');
    bevelLimitMethodSelect = document.getElementById('bevel-limit-method');

    arrayModifierSettingsPanel = document.getElementById('array-modifier-settings');
    arrayFitTypeSelect = document.getElementById('array-fit-type');
    arrayCountInput = document.getElementById('array-count');
    arrayRelOffsetXInput = document.getElementById('array-rel-offset-x');
    arrayRelOffsetYInput = document.getElementById('array-rel-offset-y');
    arrayRelOffsetZInput = document.getElementById('array-rel-offset-z');
    arrayConstOffsetXInput = document.getElementById('array-const-offset-x');
    arrayConstOffsetYInput = document.getElementById('array-const-offset-y');
    arrayConstOffsetZInput = document.getElementById('array-const-offset-z');

    screwModifierSettingsPanel = document.getElementById('screw-modifier-settings');
    screwAxisInput = document.getElementById('screw-axis');
    screwAngleInput = document.getElementById('screw-angle');
    screwOffsetInput = document.getElementById('screw-offset');
    screwIterationsInput = document.getElementById('screw-iterations');
    screwStepsInput = document.getElementById('screw-steps');

    bendModifierSettingsPanel = document.getElementById('bend-modifier-settings'); 
    bendAxisSelect = document.getElementById('bend-axis'); 
    bendAngleInput = document.getElementById('bend-angle'); 

    propsArrayHeader = document.getElementById('props-array-header');
    propsArrayBody = document.getElementById('props-array-body');
    collapseButtonArray = propsArrayHeader.querySelector('.pref-collapse-button');

    propsBevelHeader = document.getElementById('props-bevel-header');
    propsBevelBody = document.getElementById('props-bevel-body');
    collapseButtonBevel = propsBevelHeader.querySelector('.pref-collapse-button');

    propsScrewHeader = document.getElementById('props-screw-header');
    propsScrewBody = document.getElementById('props-screw-body');
    collapseButtonScrew = propsScrewHeader.querySelector('.pref-collapse-button');

    propsBendHeader = document.getElementById('props-bend-header'); 
    propsBendBody = document.getElementById('props-bend-body'); 
    collapseButtonBend = document.getElementById('props-bend-header').querySelector('.pref-collapse-button'); 

    appliedModifiersList = document.getElementById('applied-modifiers-list');
    noModifiersMessage = document.getElementById('no-modifiers-message');

    modelingMenuItem = document.getElementById('modeling-menu-item');
    modelingGizmoToggleBtn = document.getElementById('modeling-gizmo-toggle');
    toolSelectBtn = document.getElementById('tool-select');
    toolMoveBtn = document.getElementById('tool-move');
    toolRotateBtn = document.getElementById('tool-rotate');
    toolScaleBtn = document.getElementById('tool-scale');
    toolAddCubeBtn = document.getElementById('tool-add-cube'); 
    toolBoxSelectBtn = document.getElementById('tool-box-select');
    toolAddText3dBtn = document.getElementById('tool-add-text3d'); 
    modelingToolButtons = [toolMoveBtn, toolRotateBtn, toolScaleBtn, toolAddCubeBtn, toolAddText3dBtn]; 

    objectCountSpan = document.getElementById('object-count'); 
    updateObjectCountUI(); 

    sceneCollectionPanel = document.getElementById('scene-collection-panel');
    sceneCollectionPanelHeader = document.getElementById('scene-collection-panel-header');
    collapseSceneCollectionButton = document.getElementById('collapse-scene-collection-button');
    sceneCollectionList = document.getElementById('scene-collection-list');

    propertiesPanel = document.getElementById('properties-panel');
    propertiesPanelHeader = document.getElementById('properties-panel-header');
    collapsePropertiesButton = document.getElementById('collapse-properties-button');
    selectedObjectNameDisplay = document.getElementById('selected-object-name-display'); 

    materialListSelect = document.getElementById('material-list');
    addMaterialBtn = document.getElementById('add-material-btn');
    removeMaterialBtn = document.getElementById('remove-material-btn');
    materialColorInput = document.getElementById('material-color');
    materialMetallicInput = document.getElementById('material-metallic');
    materialRoughnessInput = document.getElementById('material-roughness');
    materialIORInput = document.getElementById('material-ior');
    materialAlphaInput = document.getElementById('material-alpha');

    propsSurfaceHeader = document.getElementById('props-surface-header');
    propsSurfaceBody = document.getElementById('props-surface-body');
    collapseButtonSurface = propsSurfaceHeader.querySelector('.pref-collapse-button');

    propsArrayHeader.addEventListener('click', () => {
        const isCollapsed = propsArrayBody.classList.toggle('collapsed');
        collapseButtonArray.textContent = isCollapsed ? '►' : '▼';
    });

    propsBevelHeader.addEventListener('click', () => {
        const isCollapsed = propsBevelBody.classList.toggle('collapsed');
        collapseButtonBevel.textContent = isCollapsed ? '►' : '▼';
    });

    propsScrewHeader.addEventListener('click', () => {
        const isCollapsed = propsScrewBody.classList.toggle('collapsed');
        collapseButtonScrew.textContent = isCollapsed ? '►' : '▼';
    });

    propsBendHeader.addEventListener('click', () => { 
        const isCollapsed = propsBendBody.classList.toggle('collapsed');
        collapseButtonBend.textContent = isCollapsed ? '►' : '▼';
    });

    bevelAffectTypeSelect.addEventListener('change', () => applyBevelModifier());
    bevelWidthTypeSelect.addEventListener('change', () => applyBevelModifier());
    bevelAmountInput.addEventListener('input', () => applyBevelModifier()); 
    bevelSegmentsInput.addEventListener('input', () => applyBevelModifier()); 
    bevelLimitMethodSelect.addEventListener('change', () => applyBevelModifier());

    arrayFitTypeSelect.addEventListener('change', () => applyArrayModifier());
    arrayCountInput.addEventListener('input', () => applyArrayModifier());
    arrayRelOffsetXInput.addEventListener('input', () => applyArrayModifier());
    arrayRelOffsetYInput.addEventListener('input', () => applyArrayModifier());
    arrayRelOffsetZInput.addEventListener('input', () => applyArrayModifier());
    arrayConstOffsetXInput.addEventListener('input', () => applyArrayModifier());
    arrayConstOffsetYInput.addEventListener('input', () => applyArrayModifier());
    arrayConstOffsetZInput.addEventListener('input', () => applyArrayModifier());

    screwAxisInput.addEventListener('change', () => applyScrewModifier());
    screwAngleInput.addEventListener('input', () => applyScrewModifier());
    screwOffsetInput.addEventListener('input', () => applyScrewModifier());
    screwIterationsInput.addEventListener('input', () => applyScrewModifier());
    screwStepsInput.addEventListener('input', () => applyScrewModifier());

    bendAxisSelect.addEventListener('change', () => applyBendModifier());
    bendAngleInput.addEventListener('input', () => applyBendModifier());

    modelingMenuItem.addEventListener('click', toggleModelingMode);
    modelingGizmoToggleBtn.addEventListener('click', toggleGizmoVisibility);
    toolSelectBtn.addEventListener('click', () => setTool('select'));
    toolMoveBtn.addEventListener('click', () => setTool('translate'));
    toolRotateBtn.addEventListener('click', () => setTool('rotate'));
    toolScaleBtn.addEventListener('click', () => setTool('scale'));
    toolAddCubeBtn.addEventListener('click', () => addCubeToScene()); 
    toolAddText3dBtn.addEventListener('click', showNewTextDialog);
    toolBoxSelectBtn.addEventListener('click', () => setTool('box-select'));

    document.getElementById('add-cube-menu-item').addEventListener('click', () => addCubeToScene());
    document.getElementById('add-sphere-menu-item').addEventListener('click', addUVSphereToScene); 
    document.getElementById('add-cone-menu-item').addEventListener('click', addConeToScene);
    document.getElementById('add-torus-menu-item').addEventListener('click', addTorusToScene);
    document.getElementById('add-capsule-menu-item').addEventListener('click', addCapsuleToScene);
    document.getElementById('add-grid-menu-item').addEventListener('click', addGridToScene);
    document.getElementById('add-circle-menu-item').addEventListener('click', addCircleToScene); 
    document.getElementById('add-triangle-menu-item').addEventListener('click', addTriangleToScene); 
    document.getElementById('add-pyramid-menu-item').addEventListener('click', addSquarePyramidToScene);
    document.getElementById('add-cylinder-menu-item').addEventListener('click', addCylinderToScene);

    addIcoSphereMenuItem = document.getElementById('add-icosphere-menu-item');
    addIcoSphereMenuItem.addEventListener('click', addIcoSphereToScene);

    document.getElementById('undo-menu-item').addEventListener('click', (e) => {
        e.preventDefault();
        if (e.shiftKey) { 
            redoLastCommand();
        } else { 
            undoLastCommand();
        }
    });
    document.getElementById('redo-menu-item').addEventListener('click', (e) => {
        e.preventDefault();
        redoLastCommand();
    });

    objectJoinSelectedMenuItem = document.getElementById('object-join-selected');
    objectJoinSelectedMenuItem.addEventListener('click', joinSelectedObjects);
    document.getElementById('object-delete').addEventListener('click', deleteSelectedObjects); 

    editorType3DViewportMenuItem = document.getElementById('editor-type-3d-viewport');
    editorTypeUVEditingMenuItem = document.getElementById('editor-type-uv-editing');
    editorTypeShaderEditorMenuItem = document.getElementById('editor-type-shader-editor'); 
    editorTypePrompt3dEditorMenuItem = document.getElementById('editor-type-prompt-3d-editor');

    uvEditorPanel = document.getElementById('uv-editor-panel');
    shaderEditorPanelDiv = document.getElementById('shader-editor-panel'); 
    prompt3dEditorPanel = document.getElementById('prompt-3d-editor-panel');

    shaderNodeGraphArea = document.getElementById('shader-node-graph-area'); 
    shaderAddNodeButton = document.getElementById('shader-add-node-button');
    shaderAddNodeButton.addEventListener('click', onShaderAddNodeButtonClick); 

    editorType3DViewportMenuItem.addEventListener('click', (e) => {
        e.preventDefault();
        setEditorMode('3d-viewport');
    });

    editorTypeUVEditingMenuItem.addEventListener('click', (e) => {
        e.preventDefault();
        setEditorMode('uv-editing');
    });

    editorTypeShaderEditorMenuItem.addEventListener('click', (e) => { 
        e.preventDefault();
        setEditorMode('shader-editor');
    });

    editorTypePrompt3dEditorMenuItem.addEventListener('click', (e) => {
        e.preventDefault();
        setEditorMode('prompt-3d-editor');
    });

    exportGlbButton = document.getElementById('export-glb');
    exportGlbButton.addEventListener('click', exportGLBModel);

    newTextDialog = document.getElementById('new-text-dialog');
    textContentInput = document.getElementById('text-content');
    textSizeInput = document.getElementById('text-size');
    textDepthInput = document.getElementById('text-depth');
    textFontSelect = document.getElementById('text-font'); 
    create3dTextBtn = document.getElementById('create-3d-text-btn');
    cancel3dTextBtn = document.getElementById('cancel-3d-text-btn');

    create3dTextBtn.addEventListener('click', create3DTextObject);
    cancel3dTextBtn.addEventListener('click', hideNewTextDialog);

    promptInput = document.getElementById('prompt-input');
    submitPromptBtn = document.getElementById('submit-prompt-btn');
    submitPromptBtn.addEventListener('click', handleSubmitPrompt);

    window.addEventListener('resize', onWindowResize, false);

    initializeChatManager(websim);

    setupMenuAndFileInput(); 

    setupSceneCollectionPanel();

    setupPropertiesPanel();

    canvas.addEventListener('mousedown', onCanvasMouseDown, false);
    document.addEventListener('mousemove', onCanvasDrag, false);
    document.addEventListener('mouseup', onCanvasMouseUp, false);
    canvas.addEventListener('contextmenu', onCanvasRightClick, false); 
    document.addEventListener('keydown', onKeyDown, false); 

    boxSelectOverlay = document.getElementById('box-select-overlay');

    updateModelingToolsUI();

    addCubeToScene();

    let imageDataStore = new Map();

    function addImageDataToStore(name, texture, width, height, url) {
        // Simple name collision handling
        let finalName = name;
        if (imageDataStore.has(name)) {
            let counter = 2;
            const nameParts = name.split('.');
            let baseName = name;
            let extension = '';
            if (nameParts.length > 1) {
                extension = nameParts.pop();
                baseName = nameParts.join('.');
            }

            do {
                finalName = extension ? `${baseName}.${counter}.${extension}` : `${name}.${counter}`;
                counter++;
            } while (imageDataStore.has(finalName));
        }

        imageDataStore.set(finalName, {
            name: finalName,
            texture: texture,
            width: width,
            height: height,
            url: url
        });
        console.log(`Image "${finalName}" added to data store.`);
        
        // The texture name in the object should be the final, unique name
        if (texture.name !== finalName) {
            texture.name = finalName;
        }
    }

    initializeUVSettings(
        'uvCanvas', 'uv-editor-panel', 'uv-new-button', 'uv-open-button', 'uv-image-file-input',
        'uv-image-info', 'uv-image-name-display', 'uv-clear-image-btn',
        'new-image-dialog', 'new-image-name', 'new-image-width', 'new-image-height',
        'new-image-color',
        'create-new-image-btn', 'cancel-new-image-btn',
        addMessageToChatHistory, () => activeObject, languageConfig, updatePropertiesPanel, 
        onShaderMaterialTextureChange,
        addImageDataToStore
    );
    initializeShaderEditor(
        'shader-editor-panel', 'shader-node-graph-area',
        onMaterialPropertyInputChange, 
        () => currentMaterial,
        updatePropertiesPanel, 
        onShaderMaterialTextureChange,
        () => imageDataStore
    );

    animate();
}

function onWindowResize() {
    const viewportContainer = document.getElementById('viewport-container');
    camera.aspect = viewportContainer.clientWidth / viewportContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewportContainer.clientWidth, viewportContainer.clientHeight);
    composer.setSize(viewportContainer.clientWidth, viewportContainer.clientHeight); 

    if (currentEditorMode === 'uv-editing' && uvCamera) { 
        updateUVEditor(activeObject); 
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    composer.render(); 
    updateMemoryUsageUI();
}

function updateMemoryUsageUI() {
    const memory = renderer.info.memory;
    const memoryMB = (memory.geometries * 4 + memory.textures * 4) / (1024 * 1024); // A very rough estimate
    if (memoryUsageSpan) {
        memoryUsageSpan.textContent = `${memoryMB.toFixed(2)} MB`;
    }
}

function setupMenuAndFileInput() {
    const importGlbButton = document.getElementById('import-glb');
    const fileInput = document.getElementById('file-input');

    importGlbButton.addEventListener('click', (event) => {
        event.preventDefault(); 
        fileInput.click(); 
    });

    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) {
            return;
        }

        const fileDataPromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve({ url: e.target.result, filename: file.name });
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        });

        Promise.all(fileDataPromises)
            .then(fileDataArray => {
                const command = new LoadMultipleGLBCommand(fileDataArray);
                executeCommand(command);
            })
            .catch(error => {
                console.error("Error reading files:", error);
                addMessageToChatHistory(languageConfig[currentLanguage].ui.modelLoadError("Error reading one or more files."), 'ai');
            });
        
        event.target.value = '';
    });
}

async function exportGLBModel() {
    const exporter = new GLTFExporter();

    let objectToExport = new THREE.Group();
    let fileName = "scene.glb";

    const exportableObjects = scene.children.filter(obj => 
        obj.userData.isManagedObject && 
        !(obj instanceof THREE.Light) && 
        !(obj instanceof TransformControls) && 
        !(obj === gridHelper) &&
        !obj.userData.isJoinedChild 
    );

    if (selectedObjects.length > 0) {
        selectedObjects.forEach(obj => {
            if (obj.userData.isManagedObject && !obj.userData.isJoinedChild) { 
                objectToExport.add(obj.clone()); 
                if (obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
                    obj.userData.arrayClones.forEach(uuid => {
                        const clone = scene.getObjectByProperty('uuid', uuid);
                        if (clone) objectToExport.add(clone.clone()); 
                    });
                }
            }
        });
        fileName = "selected_objects.glb"; 
        if (selectedObjects.length === 1) {
            fileName = `${selectedObjects[0].name || 'selected_object'}.glb`;
        }
    } else {
        exportableObjects.forEach(obj => {
            objectToExport.add(obj.clone()); 
            if (obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
                obj.userData.arrayClones.forEach(uuid => {
                    const clone = scene.getObjectByProperty('uuid', uuid);
                    if (clone) objectToExport.add(clone.clone()); 
                });
            }
        });
    }

    if (objectToExport.children.length === 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.exportError("No exportable objects found in the scene."), 'ai');
        return;
    }

    exporter.parse(objectToExport, (gltf) => {
        const blob = new Blob([gltf], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addMessageToChatHistory(languageConfig[currentLanguage].ui.exportSuccess(fileName), 'ai');
    }, (error) => {
        console.error('An error occurred during GLB export:', error);
        addMessageToChatHistory(languageConfig[currentLanguage].ui.exportError(error.message), 'ai');
    }, { binary: true }); 
}

function onCanvasMouseDown(event) {
    if (transformControls.dragging) return;

    if (event.button !== 0) return; 

    if (activeTool === 'box-select') {
        isBoxSelecting = true;
        startMousePosition.set(event.clientX - viewportContainer.offsetLeft, event.clientY - viewportContainer.offsetTop);
        boxSelectOverlay.style.left = `${startMousePosition.x}px`;
        boxSelectOverlay.style.top = `${startMousePosition.y}px`;
        boxSelectOverlay.style.width = '0px';
        boxSelectOverlay.style.height = '0px';
        boxSelectOverlay.style.display = 'block';
        controls.enabled = false; 
        event.preventDefault(); 
    } else {
        handleSingleClickSelection(event);
    }
}

function onCanvasDrag(event) {
    if (transformControls.dragging) return;

    if (!isBoxSelecting) return;
    
    endMousePosition.set(event.clientX - viewportContainer.offsetLeft, event.clientY - viewportContainer.offsetTop);

    const x = Math.min(startMousePosition.x, endMousePosition.x);
    const y = Math.min(startMousePosition.y, endMousePosition.y);
    const width = Math.abs(startMousePosition.x - endMousePosition.x);
    const height = Math.abs(startMousePosition.y - endMousePosition.y);

    boxSelectOverlay.style.left = `${x}px`;
    boxSelectOverlay.style.top = `${y}px`;
    boxSelectOverlay.style.width = `${width}px`;
    boxSelectOverlay.style.height = `${height}px`;
    event.preventDefault(); 
}

function onCanvasMouseUp(event) {
    if (transformControls.dragging) return;
    
    if (!isBoxSelecting) return;

    isBoxSelecting = false;
    boxSelectOverlay.style.display = 'none';
    controls.enabled = true; 

    const selectionRect = {
        x: Math.min(startMousePosition.x, endMousePosition.x),
        y: Math.min(startMousePosition.y, endMousePosition.y),
        width: Math.abs(startMousePosition.x - endMousePosition.x),
        height: Math.abs(startMousePosition.y - endMousePosition.y)
    };

    if (selectionRect.width > 1 || selectionRect.height > 1) { 
        performBoxSelection(selectionRect);
    } else {
        setActiveObject(null); 
    }

    event.preventDefault(); 
}

function handleSingleClickSelection(event) {
    hideContextMenu();
    hideAddMeshMenu(); 
    hideSceneCollectionContextMenu(); 
    hideAddModifierMenu(); 
    hideAddShaderNodeMenu();
    hideNewTextDialog();

    const rect = viewportContainer.getBoundingClientRect();

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const selectableObjects = scene.children.filter(obj => 
        obj.userData.isManagedObject && 
        !(obj instanceof THREE.Light) &&
        !(obj instanceof TransformControls) &&
        !(obj === gridHelper)
    );

    const intersects = raycaster.intersectObjects(selectableObjects, true); 

    let newActiveObject = null;
    if (intersects.length > 0) {
        for (let i = 0; i < intersects.length; i++) {
            let object = intersects[i].object;
            while (object && object !== scene) {
                if (object.userData.isManagedObject) {
                    if (object.userData.isJoinedChild) {
                        const parentGroup = scene.getObjectByProperty('uuid', object.userData.joinedParentUUID);
                        if (parentGroup && parentGroup.userData.isJoinedGroup) {
                            newActiveObject = parentGroup;
                        } else {
                            newActiveObject = object;
                        }
                    } else {
                        newActiveObject = object; 
                    }
                    break;
                }
                object = object.parent;
            }
            if (newActiveObject) break;
        }
    }

    if (newActiveObject && newActiveObject !== activeObject) {
        setActiveObject(newActiveObject); 
    } else if (!newActiveObject && activeObject) {
        setActiveObject(null); 
        console.log(languageConfig[currentLanguage].ui.selectCleared);
    } else if (newActiveObject && newActiveObject === activeObject) {
        if (!isModelingModeActive || activeTool === 'select' || activeTool === 'add-cube' || activeTool === 'add-text3d' || activeTool === 'box-select') {
            setActiveObject(null); 
            console.log(languageConfig[currentLanguage].ui.objectDeselected);
        }
    }
}

function performBoxSelection(selectionRect) {
    const managedObjects = [];
    scene.children.forEach(obj => {
        if (obj.userData.isManagedObject && !obj.userData.isJoinedChild && !(obj instanceof THREE.Light) && !(obj instanceof TransformControls) && !(obj === gridHelper)) {
            managedObjects.push(obj);
        }
    });

    const newlySelected = new Set();

    const viewportRect = viewportContainer.getBoundingClientRect(); 

    managedObjects.forEach(object => {
        const screenBbox = getScreenBoundingBox(object, camera, renderer, viewportRect);

        if (screenBbox && checkRectIntersection(selectionRect, screenBbox)) {
            newlySelected.add(object);
        }
    });

    selectMultiple(newlySelected);
}

function getScreenBoundingBox(object, camera, renderer, viewportRect) {
    if (!object.visible) return null;

    const box = new THREE.Box3();

    box.setFromObject(object);

    if (box.isEmpty()) {
        return null; 
    }

    const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ];

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    const width = viewportRect.width;
    const height = viewportRect.height;
    const tempVec = new THREE.Vector3(); 

    for (let i = 0; i < 8; i++) {
        tempVec.copy(corners[i]).project(camera);

        const x = (tempVec.x + 1) / 2 * width;
        const y = (-(tempVec.y - 1) / 2) * height;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function checkRectIntersection(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function onCanvasRightClick(event) {
    event.preventDefault(); 
    hideAddMeshMenu(); 
    hideAddModifierMenu(); 
    hideAddShaderNodeMenu();
    hideNewTextDialog();

    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    contextMenu.style.display = 'block';

    if (activeObject && activeObject.userData.isManagedObject && !activeObject.userData.isJoinedChild) { 
        deleteMenuItem.classList.remove('disabled');
        deleteMenuItem.style.pointerEvents = 'auto'; 
    } else {
        deleteMenuItem.classList.add('disabled');
        deleteMenuItem.style.pointerEvents = 'none'; 
    }

    if (hideContextMenuListener) {
        document.removeEventListener('mousedown', hideContextMenuListener, true);
    }

    hideContextMenuListener = (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', hideContextMenuListener, true);
    }, 0);
}

function hideContextMenu() {
    contextMenu.style.display = 'none';
    if (hideContextMenuListener) {
        document.removeEventListener('mousedown', hideContextMenuListener, true);
        hideContextMenuListener = null;
    }
}

function deleteSelectedObjects() {
    hideContextMenu(); 
    hideSceneCollectionContextMenu(); 

    if (selectedObjects.length === 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectToDelete, 'ai');
        return;
    }

    const objectsToDelete = selectedObjects.filter(obj => !obj.userData.isJoinedChild);

    if (objectsToDelete.length === 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectToDelete, 'ai');
        return;
    }

    const allObjectsToRemoveQueue = new Set();
    objectsToDelete.forEach(obj => {
        allObjectsToRemoveQueue.add(obj); 
        if (obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
            obj.userData.arrayClones.forEach(uuid => {
                const clone = scene.getObjectByProperty('uuid', uuid);
                if (clone) allObjectsToRemoveQueue.add(clone); 
            });
        }
    });

    allObjectsToRemoveQueue.forEach(obj => {
        if (obj) { 
            const command = new DeleteObjectCommand(obj);
            executeCommand(command); 
        }
    });
    
    setActiveObject(null); 

    addMessageToChatHistory(languageConfig[currentLanguage].ui.objectDeleted, 'ai');
    console.log('Selected object(s) deleted.');
}

function onKeyDown(event) {
    if (event.ctrlKey && event.key === 'z') {
        event.preventDefault(); 
        if (event.shiftKey) { 
            redoLastCommand();
        } else { 
            undoLastCommand();
        }
    }
    
    if (event.shiftKey && event.key === 'A') {
        event.preventDefault();
        hideContextMenu(); 
        hideAddMeshMenu(); 
        hideAddModifierMenu(); 
        hideAddShaderNodeMenu();
        hideNewTextDialog();
        showAddMeshMenu(lastMouseX, lastMouseY);
    }

    if (event.ctrlKey && event.key === 'j') { 
        event.preventDefault();
        joinSelectedObjects();
    }

    if (event.shiftKey && event.key === 'F5') {
        event.preventDefault();
        setEditorMode('uv-editing');
    }
    if (event.shiftKey && event.key === 'F6') { 
        event.preventDefault();
        setEditorMode('shader-editor');
    }
}

function showAddMeshMenu(x, y) {
    const menuWidth = addMeshMenu.offsetWidth;
    const menuHeight = addMeshMenu.offsetHeight;
    let adjustedX = Math.min(x, window.innerWidth - menuWidth - 10); 
    let adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

    addMeshMenu.style.left = `${adjustedX}px`;
    addMeshMenu.style.top = `${adjustedY}px`;
    addMeshMenu.style.display = 'block';

    if (hideAddMeshMenuListener) {
        document.removeEventListener('mousedown', hideAddMeshMenuListener, true);
    }

    hideAddMeshMenuListener = (e) => {
        if (!addMeshMenu.contains(e.target)) {
            hideAddMeshMenu();
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', hideAddMeshMenuListener, true);
    }, 0);
}

function hideAddMeshMenu() {
    addMeshMenu.style.display = 'none';
    if (hideAddMeshMenuListener) {
        document.removeEventListener('mousedown', hideAddMeshMenuListener, true);
        hideAddMeshMenuListener = null;
    }
}

function onSceneCollectionItemRightClick(event, object) {
    event.preventDefault(); 
    hideContextMenu(); 
    hideAddMeshMenu(); 
    hideAddModifierMenu(); 
    hideAddShaderNodeMenu();
    hideNewTextDialog();

    setActiveObject(object); 

    sceneCollectionContextMenu.style.left = `${event.clientX}px`;
    sceneCollectionContextMenu.style.top = `${event.clientY}px`;
    sceneCollectionContextMenu.style.display = 'block';

    if (contextMenu) {
        contextMenu.style.display = 'none';
    }

    if (copiedObjectData) {
        pasteObjectMenuItem.classList.remove('disabled'); 
        pasteObjectMenuItem.style.pointerEvents = 'auto';
    } else {
        pasteObjectMenuItem.classList.add('disabled'); 
        pasteObjectMenuItem.style.pointerEvents = 'none';
    }

    if (hideSceneCollectionContextMenuListener) {
        document.removeEventListener('mousedown', hideSceneCollectionContextMenuListener, true);
    }

    hideSceneCollectionContextMenuListener = (e) => {
        if (!sceneCollectionContextMenu.contains(e.target)) {
            hideSceneCollectionContextMenu();
        }
    };
    setTimeout(() => {
        document.removeEventListener('mousedown', hideSceneCollectionContextMenuListener, true);
    }, 0);
}

function hideSceneCollectionContextMenu() {
    sceneCollectionContextMenu.style.display = 'none';
    if (hideSceneCollectionContextMenuListener) {
        document.removeEventListener('mousedown', hideSceneCollectionContextMenuListener, true);
        hideSceneCollectionContextMenuListener = null;
    }
}

function copyActiveObject() {
    hideSceneCollectionContextMenu();
    if (activeObject && activeObject.userData.isManagedObject && !activeObject.userData.isJoinedChild) { 
        copiedObjectData = {
            object: activeObject, 
            bevelParams: activeObject.userData.modifiers && activeObject.userData.modifiers.bevel ? { ...activeObject.userData.modifiers.bevel } : null,
            arrayParams: activeObject.userData.modifiers && activeObject.userData.modifiers.array ? { ...activeObject.userData.modifiers.array } : null,
            screwParams: activeObject.userData.modifiers && activeObject.userData.modifiers.screw ? { ...activeObject.userData.modifiers.screw } : null, 
            bendParams: activeObject.userData.modifiers && activeObject.userData.modifiers.bend ? { ...activeObject.userData.modifiers.bend } : null, 
            isJoinedGroup: activeObject.userData.isJoinedGroup || false, 
            childrenData: [] 
        };

        if (copiedObjectData.isJoinedGroup && activeObject.isGroup) {
            activeObject.children.forEach(child => {
                copiedObjectData.childrenData.push({
                    uuid: child.uuid, 
                    name: child.name,
                    type: child.type, 
                    geometry: child.isMesh && child.geometry ? child.geometry.toJSON() : null, 
                    material: child.isMesh && child.material ? (Array.isArray(child.material) ? child.material.map(m => m.toJSON()) : child.material.toJSON()) : null,
                    position: child.position.clone(),
                    rotation: child.rotation.clone(),
                    scale: child.scale.clone(),
                    userData: { ...child.userData } 
                });
            });
        }

        pasteObjectMenuItem.classList.remove('disabled'); 
        pasteObjectMenuItem.style.pointerEvents = 'auto';
        addMessageToChatHistory(languageConfig[currentLanguage].ui.objectCopied(activeObject.name || "Unnamed Object"), 'ai');
        console.log(`Copied object: ${activeObject.name}`);
    } else {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectToCopy, 'ai');
        console.log('No object selected to copy.');
    }
}

function pasteObject() {
    hideSceneCollectionContextMenu();
    if (copiedObjectData && copiedObjectData.object) {
        const originalSource = copiedObjectData.object;
        
        let newObject;
        if (copiedObjectData.isJoinedGroup) {
            newObject = new THREE.Group();
            newObject.name = `${originalSource.name || "Unnamed Group"} (Copy)`;
            newObject.uuid = THREE.MathUtils.generateUUID();
            newObject.userData.isManagedObject = true;
            newObject.userData.isJoinedGroup = true;

            const loader = new THREE.ObjectLoader(); 

            copiedObjectData.childrenData.forEach(childData => {
                let newChild;
                if (childData.type === 'Mesh' && childData.geometry && childData.material) {
                    const geom = new THREE.BufferGeometryLoader().parse(childData.geometry);
                    let mat;
                    if (Array.isArray(childData.material)) {
                        mat = childData.material.map(m => new THREE.MaterialLoader().parse(m));
                    } else {
                        mat = new THREE.MaterialLoader().parse(childData.material);
                    }
                    newChild = new THREE.Mesh(geom, mat);
                } else if (childData.type === 'Group') {
                    newChild = new THREE.Group(); 
                } else {
                    console.warn(`Unsupported child type for copy/paste: ${childData.type}`);
                    return;
                }

                newChild.name = `${childData.name || "Unnamed Child"} (Copy)`;
                newChild.uuid = THREE.MathUtils.generateUUID();
                newChild.position.copy(childData.position);
                newChild.rotation.copy(childData.rotation);
                newChild.scale.copy(childData.scale);
                
                newChild.userData = { ...childData.userData };
                newChild.userData.isJoinedChild = true;
                newChild.userData.joinedParentUUID = newObject.uuid;
                newObject.add(newChild);
            });
            newObject.position.x += 0.2; 

            newObject.userData.childrenData = copiedObjectData.childrenData.map(childData => ({...childData}));
        } else {
            newObject = originalSource.clone();
            newObject.position.x += 0.2;
            newObject.position.y += 0.2;
            newObject.position.z += 0.2;

            newObject.name = `${originalSource.name || "Unnamed Object"} (Copy)`;
            newObject.uuid = THREE.MathUtils.generateUUID(); 

            newObject.userData = { 
                isManagedObject: true, 
                modifiers: {}, 
                originalBaseGeometryForBevel: originalSource.userData.originalBaseGeometryForBevel, 
                originalBaseGeometryForScrew: originalSource.userData.originalBaseGeometryForScrew, 
                originalBaseGeometryForBend: originalSource.userData.originalBaseGeometryForBend, 
                arrayClones: [] 
            };
        }

        const command = new AddObjectCommand(newObject);
        executeCommand(command);

        if (!copiedObjectData.isJoinedGroup) {
            if (copiedObjectData.bevelParams) {
                const bevelCommand = new ApplyBevelModifierCommand(newObject, copiedObjectData.bevelParams, null);
                executeCommand(bevelCommand);
            }
            if (copiedObjectData.arrayParams) {
                const arrayCommand = new ApplyArrayModifierCommand(newObject, copiedObjectData.arrayParams, null);
                executeCommand(arrayCommand);
            }
            if (copiedObjectData.screwParams) {
                const screwCommand = new ApplyScrewModifierCommand(newObject, copiedObjectData.screwParams, null);
                executeCommand(screwCommand);
            }
            if (copiedObjectData.bendParams) { 
                const bendCommand = new ApplyBendModifierCommand(newObject, copiedObjectData.bendParams, null);
                executeCommand(bendCommand);
            }
        }
        
        setActiveObject(newObject);
        addMessageToChatHistory(languageConfig[currentLanguage].ui.objectPasted(newObject.name), 'ai');
        console.log(`Pasted new object: ${newObject.name}`);
    } else {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectToPaste, 'ai');
        console.log('Nothing to paste.');
    }
}

function setActiveObject(newObj) {
    selectedObjects.forEach(obj => {
        const listItem = objectUIElements.get(obj.uuid);
        if (listItem) {
            listItem.classList.remove('active');
            listItem.classList.remove('primary-selected');
        }
    });

    selectedObjects = []; 
    activeObject = null;

    if (newObj) {
        activeObject = newObj;
        selectedObjects.push(newObj);
    }
    
    updateSelectionUI();
}

function selectMultiple(newlySelectedSet) {
    selectedObjects.forEach(obj => {
        const listItem = objectUIElements.get(obj.uuid);
        if (listItem) {
            listItem.classList.remove('active');
            listItem.classList.remove('primary-selected');
        }
    });

    selectedObjects = Array.from(newlySelectedSet).filter(obj => 
        obj.userData.isManagedObject && 
        !(obj instanceof THREE.Light) && 
        !(obj instanceof TransformControls) &&
        !(obj === gridHelper) &&
        !obj.userData.isArrayCloneOf &&
        !obj.userData.isJoinedChild 
    );

    activeObject = selectedObjects.length > 0 ? selectedObjects[selectedObjects.length - 1] : null;

    updateSelectionUI();
}

function updateSelectionUI() {
    const objectsForOutline = [];
    selectedObjects.forEach(obj => {
        if (obj.isGroup && obj.userData.isJoinedGroup) {
            obj.traverse(child => {
                if (child.isMesh) {
                    objectsForOutline.push(child);
                }
            });
        } else {
            objectsForOutline.push(obj);
            if (obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
                obj.userData.arrayClones.forEach(uuid => {
                    const clone = scene.getObjectByProperty('uuid', uuid);
                    if (clone) objectsForOutline.push(clone);
                });
            }
        }
    });
    outlinePass.selectedObjects = objectsForOutline;

    if (activeObject && isModelingModeActive && (activeTool === 'translate' || activeTool === 'rotate' || activeTool === 'scale')) {
        transformControls.attach(activeObject);
        transformControls.visible = true;
        modelingGizmoToggleBtn.classList.add('active');
    } else {
        transformControls.detach();
        transformControls.visible = false;
        modelingGizmoToggleBtn.classList.remove('active');
    }

    updateSceneCollectionUI();

    updatePropertiesPanel(activeObject);

    if (currentEditorMode === 'uv-editing') {
        updateUVEditor(activeObject);
    }
    updateShaderNodeMaterialInputs(activeObject ? (Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material) : null);
}

function toggleModelingMode() {
    isModelingModeActive = !isModelingModeActive;
    
    if (isModelingModeActive) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.enteredModelingMode, 'ai');
        setTool('select'); 
    } else {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.exitedModelingMode, 'ai');
        transformControls.detach();
        transformControls.visible = false;
        modelingGizmoToggleBtn.classList.remove('active');
        setTool('select'); 
    }
    updateModelingToolsUI();
}

function setEditorMode(newMode) {
    if (currentEditorMode === newMode) return; 

    document.body.classList.remove('uv-editing-active');
    document.body.classList.remove('shader-editing-active');
    document.body.classList.remove('prompt-3d-editing-active');

    if (newMode === 'uv-editing') {
        document.body.classList.add('uv-editing-active');
        addMessageToChatHistory(languageConfig[currentLanguage].ui.enteredUVEditingMode, 'ai');
    } else if (newMode === 'shader-editor') {
        document.body.classList.add('shader-editing-active');
        addMessageToChatHistory(languageConfig[currentLanguage].ui.enteredShaderEditingMode, 'ai');
        setTimeout(() => {
            if (currentEditorMode === 'shader-editor') { 
                updateAllConnections();
            }
        }, 10);
    } else if (newMode === 'prompt-3d-editor') { 
        document.body.classList.add('prompt-3d-editing-active');
        addMessageToChatHistory(languageConfig[currentLanguage].ui.enteredPrompt3dEditingMode, 'ai');
    }
    else { 
        if (currentEditorMode === 'uv-editing') {
            addMessageToChatHistory(languageConfig[currentLanguage].ui.exitedUVEditingMode, 'ai');
        } else if (currentEditorMode === 'shader-editor') {
            addMessageToChatHistory(languageConfig[currentLanguage].ui.exitedShaderEditingMode, 'ai');
        } else if (currentEditorMode === 'prompt-3d-editor') { 
            addMessageToChatHistory(languageConfig[currentLanguage].ui.exitedPrompt3dEditingMode, 'ai');
        }
    }

    currentEditorMode = newMode;

    if (currentEditorMode !== '3d-viewport') {
        if (transformControls) {
            transformControls.detach();
            transformControls.visible = false;
        }
        isModelingModeActive = false;
        updateModelingToolsUI();
    } else {
        if (activeObject && isModelingModeActive && activeTool !== 'select' && activeTool !== 'add-cube' && activeTool !== 'add-text3d' && activeTool !== 'box-select') { 
            transformControls.attach(activeObject);
            transformControls.visible = true;
        }
    }

    onWindowResize(); 
    if (currentEditorMode === 'uv-editing') {
        updateUVEditor(activeObject);
    } else if (currentEditorMode === 'shader-editor') { 
        updateShaderNodeMaterialInputs(activeObject ? (Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material) : null);
    }
}

function updateModelingToolsUI() {
    modelingGizmoToggleBtn.style.display = isModelingModeActive ? 'flex' : 'none';

    modelingToolButtons.forEach(button => {
        button.disabled = !isModelingModeActive;
    });

    toolSelectBtn.disabled = false;
    toolBoxSelectBtn.disabled = false; 

    toolSelectBtn.classList.remove('active');
    toolBoxSelectBtn.classList.remove('active');
    toolMoveBtn.classList.remove('active');
    toolRotateBtn.classList.remove('active');
    toolScaleBtn.classList.remove('active');
    toolAddCubeBtn.classList.remove('active'); 
    toolAddText3dBtn.classList.remove('active'); 

    if (isModelingModeActive) {
        if (activeTool === 'select') toolSelectBtn.classList.add('active');
        else if (activeTool === 'box-select') toolBoxSelectBtn.classList.add('active');
        else if (activeTool === 'translate') toolMoveBtn.classList.add('active');
        else if (activeTool === 'rotate') toolRotateBtn.classList.add('active');
        else if (activeTool === 'scale') toolScaleBtn.classList.add('active');
        else if (activeTool === 'add-cube') toolAddCubeBtn.classList.add('active'); 
        else if (activeTool === 'add-text3d') toolAddText3dBtn.classList.add('active'); 
    } else {
        toolSelectBtn.classList.add('active');
    }
}

function setTool(toolName) {
    activeTool = toolName;

    updateModelingToolsUI(); 

    let enableOrbitControls = true;

    if (activeTool === 'box-select') {
        enableOrbitControls = false; 
    }

    if (activeObject && (activeTool === 'translate' || activeTool === 'rotate' || activeTool === 'scale')) {
        transformControls.setMode(activeTool);
        if (!transformControls.object || transformControls.object.uuid !== activeObject.uuid || !transformControls.visible) { 
            transformControls.attach(activeObject);
            transformControls.visible = true;
            modelingGizmoToggleBtn.classList.add('active');
        }
        enableOrbitControls = false; 
    } else {
        transformControls.detach();
        transformControls.visible = false;
        modelingGizmoToggleBtn.classList.remove('active');
    }

    controls.enabled = enableOrbitControls;
}

function toggleGizmoVisibility() {
    if (!isModelingModeActive || !activeObject) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.gizmoToggleNoSelection, 'ai');
        return;
    }

    if (transformControls.visible) {
        transformControls.detach();
        transformControls.visible = false;
        modelingGizmoToggleBtn.classList.remove('active');
        addMessageToChatHistory(languageConfig[currentLanguage].ui.gizmoHidden, 'ai');
    } else {
        if (activeTool === 'select' || activeTool === 'add-cube' || activeTool === 'add-text3d' || activeTool === 'box-select') { 
            setTool('translate'); 
        }
        transformControls.attach(activeObject);
        transformControls.visible = true;
        modelingGizmoToggleBtn.classList.add('active');
        addMessageToChatHistory(languageConfig[currentLanguage].ui.gizmoShown, 'ai');
    }
}

function addCubeToScene(fromAddMenu = false) {
    const cube = createCube();
    
    const command = new AddObjectCommand(cube);
    executeCommand(command); 

    setActiveObject(cube); 

    addMessageToChatHistory(languageConfig[currentLanguage].ui.addCube, 'ai');
    console.log('New cube added to scene:', cube);

    if (isModelingModeActive) {
        setTool('translate');
    }

    if (fromAddMenu) {
        hideAddMeshMenu();
    }
}

function addUVSphereToScene() {
    const sphere = createUVSphere();
    
    const command = new AddObjectCommand(sphere);
    executeCommand(command);

    setActiveObject(sphere);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addUVSphere, 'ai');
    console.log('New UV Sphere added to scene:', sphere);
    hideAddMeshMenu();
}

function addIcoSphereToScene() {
    const icosphere = createIcoSphere();
    
    const command = new AddObjectCommand(icosphere);
    executeCommand(command);

    setActiveObject(icosphere);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addIcoSphere, 'ai');
    console.log('New Ico Sphere added to scene:', icosphere);
    hideAddMeshMenu();
}

function addConeToScene() {
    const cone = createCone();
    
    const command = new AddObjectCommand(cone);
    executeCommand(command);

    setActiveObject(cone);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addCone, 'ai');
    console.log('New Cone added to scene:', cone);
    hideAddMeshMenu();
}

function addTorusToScene() {
    const torus = createTorus();
    
    const command = new AddObjectCommand(torus);
    executeCommand(command);

    setActiveObject(torus);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addTorus, 'ai');
    console.log('New Torus added to scene:', torus);
    hideAddMeshMenu();
}

function addCapsuleToScene() {
    const capsule = createCapsule();
    
    const command = new AddObjectCommand(capsule);
    executeCommand(command);

    setActiveObject(capsule);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addCapsule, 'ai');
    console.log('New Capsule added to scene:', capsule);
    hideAddMeshMenu();
}

function addCircleToScene() {
    const circle = createCircle();
    
    const command = new AddObjectCommand(circle);
    executeCommand(command);

    setActiveObject(circle);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addCircle, 'ai');
    console.log('New Circle added to scene:', circle);
    hideAddMeshMenu();
}

function addTriangleToScene() {
    const trianglePrism = createTriangle();
    
    const command = new AddObjectCommand(trianglePrism);
    executeCommand(command);

    setActiveObject(trianglePrism);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addTriangle, 'ai');
    console.log('New Triangle (Prism) added to scene:', trianglePrism);
    hideAddMeshMenu();
}

function addGridToScene() {
    const gridPlane = createGridPlane();
    
    const command = new AddObjectCommand(gridPlane);
    executeCommand(command);

    setActiveObject(gridPlane);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addGrid, 'ai');
    console.log('New Grid (Plane) added to scene:', gridPlane);
    hideAddMeshMenu();
}

function addSquarePyramidToScene() {
    const pyramid = createSquarePyramid();
    
    const command = new AddObjectCommand(pyramid);
    executeCommand(command);

    setActiveObject(pyramid);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addSquarePyramid, 'ai');
    console.log('New Square Pyramid added to scene:', pyramid);
    hideAddMeshMenu();
}

function addCylinderToScene() {
    const cylinder = createCylinder();
    
    const command = new AddObjectCommand(cylinder);
    executeCommand(command);

    setActiveObject(cylinder);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addCylinder, 'ai');
    console.log('New Cylinder added to scene:', cylinder);
    hideAddMeshMenu();
}

function updateObjectCountUI() {
    let count = 0;
    scene.children.forEach(obj => {
        if (obj.userData.isManagedObject && !obj.userData.isJoinedChild) {
            count++;
            if (!obj.userData.isJoinedGroup && obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
                count += obj.userData.arrayClones.length;
            }
        }
    });

    objectCount = count;
    objectCountSpan.textContent = objectCount;
}

function setupSceneCollectionPanel() {
    let isDragging = false;
    let offsetX, offsetY;

    const onMouseMove = (e) => {
        if (!isDragging) return;

        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        newLeft = Math.max(0, Math.min(window.innerWidth - sceneCollectionPanel.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - sceneCollectionPanel.offsetHeight, newTop));

        sceneCollectionPanel.style.left = newLeft + 'px';
        sceneCollectionPanel.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
        isDragging = false;
        sceneCollectionPanel.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    sceneCollectionPanelHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('#collapse-scene-collection-button')) {
            return;
        }
        isDragging = true;
        sceneCollectionPanel.style.cursor = 'grabbing';

        const panelRect = sceneCollectionPanel.getBoundingClientRect();
        offsetX = e.clientX - panelRect.left;
        offsetY = e.clientY - panelRect.top;

        if (sceneCollectionPanel.style.right) {
            sceneCollectionPanel.style.left = (window.innerWidth - panelRect.width - parseFloat(getComputedStyle(sceneCollectionPanel).right)) + 'px';
            sceneCollectionPanel.style.right = '';
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    collapseSceneCollectionButton.addEventListener('click', toggleSceneCollectionPanel);
    loadSceneCollectionPanelState();
    updateSceneCollectionUI(); 
}

function updateSceneCollectionUI() {
    sceneCollectionList.innerHTML = '';
    objectUIElements.clear(); 

    const managedObjects = scene.children.filter(obj => 
        obj.userData.isManagedObject && 
        !(obj instanceof THREE.Light) &&
        !(obj instanceof TransformControls) &&
        !(obj === gridHelper) &&
        !obj.userData.isJoinedChild 
    );

    managedObjects.forEach(obj => {
        const listItem = document.createElement('div');
        listItem.classList.add('scene-collection-item');
        if (selectedObjects.includes(obj)) { 
            listItem.classList.add('active'); 
        }
        if (obj === activeObject) { 
            listItem.classList.add('primary-selected'); 
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = obj.name || "Unnamed Object"; 
        nameSpan.classList.add('object-name');
        listItem.appendChild(nameSpan);

        const visibilityIcon = document.createElement('span');
        visibilityIcon.classList.add('visibility-icon');
        let effectiveVisibility = obj.visible;
        if (obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
            effectiveVisibility = obj.visible && obj.userData.arrayClones.every(uuid => {
                const clone = scene.getObjectByProperty('uuid', uuid);
                return clone ? clone.visible : true; 
            });
        }
        
        if (effectiveVisibility) {
            visibilityIcon.textContent = '👁'; 
            visibilityIcon.style.opacity = '1';
        } else {
            visibilityIcon.textContent = '👁'; 
            visibilityIcon.style.opacity = '0.3'; 
        }
        visibilityIcon.style.cursor = 'pointer';
        listItem.appendChild(visibilityIcon);

        visibilityIcon.addEventListener('click', (e) => {
            e.stopPropagation(); 
            toggleObjectVisibility(obj, visibilityIcon);
            if (obj.userData.modifiers && obj.userData.modifiers.array && obj.userData.arrayClones) {
                obj.userData.arrayClones.forEach(uuid => {
                    const clone = scene.getObjectByProperty('uuid', uuid);
                    if (clone) clone.visible = obj.visible; 
                });
            }
            if (obj.userData.isJoinedGroup && obj.isGroup) {
                obj.traverse(child => {
                    if (child !== obj) { 
                        child.visible = obj.visible;
                    }
                });
            }
        });

        listItem.addEventListener('click', () => {
            setActiveObject(obj); 
        });

        listItem.addEventListener('contextmenu', (e) => {
            onSceneCollectionItemRightClick(e, obj);
        }, false);

        sceneCollectionList.appendChild(listItem);
        objectUIElements.set(obj.uuid, listItem); 
    });
}

function toggleObjectVisibility(object, iconElement) {
    object.visible = !object.visible;
    if (object.visible) {
        if (object.userData.modifiers && object.userData.modifiers.array && object.userData.arrayClones) {
            object.userData.arrayClones.forEach(uuid => {
                const clone = scene.getObjectByProperty('uuid', uuid);
                if (clone) clone.visible = true; 
            });
        }
        iconElement.textContent = '👁'; 
        iconElement.style.opacity = '1';
    } else {
        if (object.userData.modifiers && object.userData.modifiers.array && object.userData.arrayClones) {
            object.userData.arrayClones.forEach(uuid => {
                const clone = scene.getObjectByProperty('uuid', uuid);
                if (clone) clone.visible = false; 
            });
        }
        iconElement.textContent = '👁'; 
        iconElement.style.opacity = '0.3'; 
    }
}

function toggleSceneCollectionPanel() {
    const isCollapsed = sceneCollectionPanel.classList.toggle('collapsed');
    collapseSceneCollectionButton.textContent = isCollapsed ? '▲' : '▼';
    localStorage.setItem('sceneCollectionPanelCollapsed', isCollapsed);
}

function loadSceneCollectionPanelState() {
    const savedState = localStorage.getItem('sceneCollectionPanelCollapsed');
    if (savedState === 'true') {
        sceneCollectionPanel.classList.add('collapsed');
        collapseSceneCollectionButton.textContent = '▲';
    } else {
        sceneCollectionPanel.classList.remove('collapsed');
        collapseSceneCollectionButton.textContent = '▼';
    }
}

function startRenameOnActiveObject() {
    hideSceneCollectionContextMenu();
    if (!activeObject) return;

    const listItem = objectUIElements.get(activeObject.uuid);
    if (!listItem) return;

    const nameSpan = listItem.querySelector('.object-name');
    const visibilityIcon = listItem.querySelector('.visibility-icon');
    if (!nameSpan) return;

    const oldName = activeObject.name;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.classList.add('object-name-input'); 

    listItem.insertBefore(input, visibilityIcon);
    nameSpan.style.display = 'none'; 

    input.focus();
    input.select();

    const finishRename = () => {
        const newName = input.value.trim();
        
        input.removeEventListener('blur', finishRename);
        input.removeEventListener('keydown', handleKey);
        listItem.removeChild(input);
        nameSpan.style.display = ''; 

        if (newName && newName !== oldName) {
            const command = new RenameObjectCommand(activeObject, newName, oldName);
            executeCommand(command);
            addMessageToChatHistory(languageConfig[currentLanguage].ui.objectRenamed(oldName, newName), 'ai');
        } else {
            updateSceneCollectionUI();
        }
    };

    const handleKey = (e) => {
        if (e.key === 'Enter') {
            finishRename();
        } else if (e.key === 'Escape') {
            input.removeEventListener('blur', finishRename);
            input.removeEventListener('keydown', handleKey);
            listItem.removeChild(input);
            nameSpan.style.display = '';
            updateSceneCollectionUI();
        }
    };

    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', handleKey);
}

function setupPropertiesPanel() {
    let isDragging = false;
    let offsetX, offsetY;

    const onMouseMove = (e) => {
        if (!isDragging) return;

        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        newLeft = Math.max(0, Math.min(window.innerWidth - propertiesPanel.offsetWidth, newLeft));
        newTop = Math.max(0, Math.min(window.innerHeight - propertiesPanel.offsetHeight, newTop));

        propertiesPanel.style.left = newLeft + 'px';
        propertiesPanel.style.top = newTop + 'px';
    };

    const onMouseUp = () => {
        isDragging = false;
        propertiesPanel.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    propertiesPanelHeader.addEventListener('mousedown', (e) => {
        if (e.target.closest('#collapse-properties-button')) {
            return;
        }
        isDragging = true;
        propertiesPanel.style.cursor = 'grabbing';

        const panelRect = propertiesPanel.getBoundingClientRect();
        offsetX = e.clientX - panelRect.left;
        offsetY = e.clientY - panelRect.top;

        if (propertiesPanel.style.right) {
            propertiesPanel.style.left = (window.innerWidth - panelRect.width - parseFloat(getComputedStyle(propertiesPanel).right)) + 'px';
            propertiesPanel.style.right = '';
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    collapsePropertiesButton.addEventListener('click', togglePropertiesPanel);
    loadPropertiesPanelState();

    const lightingBrightnessInput = document.getElementById('lighting-brightness');
    const lightingHeader = document.getElementById('pref-lighting-header');
    const lightingBody = document.getElementById('pref-lighting-body');
    const lightingCollapseButton = lightingHeader.querySelector('.pref-collapse-button');

    document.querySelectorAll('.properties-sidebar .props-category-button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.props-category-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.props-category-content').forEach(content => content.classList.remove('active'));

            const buttonEl = e.currentTarget;
            buttonEl.classList.add('active');
            const targetId = buttonEl.dataset.target;
            document.getElementById(targetId).classList.add('active');
        });
    });

    const savedBrightness = localStorage.getItem('lightingBrightness');
    if (savedBrightness !== null) {
        lightingBrightnessInput.value = parseFloat(savedBrightness);
    }
    adjustLightingBrightness(parseFloat(lightingBrightnessInput.value)); 

    lightingBrightnessInput.addEventListener('input', (e) => {
        const brightness = parseFloat(e.target.value);
        adjustLightingBrightness(brightness);
        localStorage.setItem('lightingBrightness', brightness); 
    });

    lightingHeader.addEventListener('click', () => {
        const isCollapsed = lightingBody.classList.toggle('collapsed');
        lightingCollapseButton.textContent = isCollapsed ? '►' : '▎';
    });

    const transformInputs = document.querySelectorAll('.transform-input');
    transformInputs.forEach(input => {
        input.addEventListener('change', onTransformInputChange);
        input.addEventListener('input', onTransformInputChange); 
    });

    bendAxisSelect.addEventListener('change', () => applyBendModifier());
    bendAngleInput.addEventListener('input', () => applyBendModifier());

    addMaterialBtn.addEventListener('click', addNewMaterial);
    removeMaterialBtn.addEventListener('click', removeSelectedMaterial);
    materialListSelect.addEventListener('change', onMaterialSelectionChange);
    
    materialColorInput.addEventListener('input', (e) => onMaterialPropertyInputChange(e, 'color'));
    materialMetallicInput.addEventListener('input', (e) => onMaterialPropertyInputChange(e, 'metalness'));
    materialRoughnessInput.addEventListener('input', (e) => onMaterialPropertyInputChange(e, 'roughness'));
    materialIORInput.addEventListener('input', (e) => onMaterialPropertyInputChange(e, 'ior'));
    materialAlphaInput.addEventListener('input', (e) => onMaterialPropertyInputChange(e, 'alpha'));

    propsSurfaceHeader.addEventListener('click', () => {
        const isCollapsed =! propsSurfaceBody.classList.toggle('collapsed');
        collapseButtonSurface.textContent = isCollapsed ? '►' : '▼';
    });
}

function onTransformInputChange(e) {
    if (!activeObject || isUpdatingPropertiesPanel) return;

    const input = e.target;
    const axis = input.dataset.axis ? input.dataset.axis : 'x';
    const type = input.dataset.type; 
    let value = parseFloat(input.value);

    if (isNaN(value)) return;

    if (type === 'rotation') {
        activeObject.rotation[axis] = THREE.MathUtils.degToRad(value);
    } else {
        activeObject[type][axis] = value;
    }
}

function onMaterialPropertyInputChange(e, propertyType, source = 'properties-panel') {
    if (selectedObjects.length === 0 || isUpdatingPropertiesPanel) return;

    let materialWasUpdated = false;
    const inputValue = (propertyType === 'color') ? e.target.value : parseFloat(e.target.value);
    if (isNaN(inputValue) && propertyType !== 'color') return; 

    isUpdatingPropertiesPanel = true;

    for (const obj of selectedObjects) {
        const objectsToUpdateMaterial = obj.userData.isJoinedGroup ? obj.children.filter(child => child.isMesh) : [obj];

        for (const targetObj of objectsToUpdateMaterial) {
            if (!targetObj || !targetObj.material) continue;

            const materialsToUpdate = Array.isArray(targetObj.material) ? targetObj.material : [targetObj.material];

            for (const mat of materialsToUpdate) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

                if (propertyType === 'color') {
                    if (source === 'properties-panel' && mat.map) {
                        continue; 
                    }
                    mat.color.set(inputValue);
                } else if (propertyType === 'alpha') {
                    mat.opacity = inputValue;
                    mat.transparent = inputValue < 1.0;
                } else {
                    mat[propertyType] = inputValue;
                }
                mat.needsUpdate = true;
                materialWasUpdated = true;
            }
        }
    }

    if (materialWasUpdated) {
        playSound("/screw_apply.mp3");
    }

    updateMaterialPropertiesUI(activeObject);
    updateShaderNodeMaterialInputs(activeObject ? (Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material) : null);
    
    isUpdatingPropertiesPanel = false;
}

function onShaderMaterialTextureChange(texture) {
    if (selectedObjects.length === 0) return;
    
    let textureApplied = false;

    for (const obj of selectedObjects) {
        const objectsToUpdateMaterial = obj.userData.isJoinedGroup ? obj.children.filter(child => child.isMesh) : [obj];

        for (const targetObj of objectsToUpdateMaterial) {
            if (!targetObj || !targetObj.material) continue;

            const materialsToUpdate = Array.isArray(targetObj.material) ? targetObj.material : [targetObj.material];

            for (const mat of materialsToUpdate) {
                if (!(mat instanceof THREE.MeshStandardMaterial)) continue;

                if (texture) {
                    mat.map = texture;
                } else {
                    mat.map = null;
                }
                mat.needsUpdate = true;
                textureApplied = true;
            }
        }
    }

    if (textureApplied) {
        playSound("/screw_apply.mp3"); 
    }

    updatePropertiesPanel(activeObject);
    updateShaderNodeMaterialInputs(activeObject ? (Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material) : null);
}

function updatePropertiesPanel(object) {
    isUpdatingPropertiesPanel = true;
    const panelContent = document.getElementById('properties-content');

    if (!object) {
        panelContent.style.opacity = '0.5';
        panelContent.style.pointerEvents = 'none';
        selectedObjectNameDisplay.textContent = "No Object Selected"; 
    } else {
        panelContent.style.opacity = '1';
        panelContent.style.pointerEvents = 'auto';
        selectedObjectNameDisplay.textContent = object.name || "Unnamed Object"; 

        document.getElementById('prop-loc-x').value = object.position.x.toFixed(3);
        document.getElementById('prop-loc-y').value = object.position.y.toFixed(3);
        document.getElementById('prop-loc-z').value = object.position.z.toFixed(3);

        document.getElementById('prop-rot-x').value = THREE.MathUtils.radToDeg(object.rotation.x).toFixed(2);
        document.getElementById('prop-rot-y').value = THREE.MathUtils.radToDeg(object.rotation.y).toFixed(2);
        document.getElementById('prop-rot-z').value = THREE.MathUtils.radToDeg(object.rotation.z).toFixed(2);
        
        document.getElementById('prop-scale-x').value = object.scale.x.toFixed(3);
        document.getElementById('prop-scale-y').value = object.scale.y.toFixed(3);
        document.getElementById('prop-scale-z').value = object.scale.z.toFixed(3);

        updateMaterialPropertiesUI(object);
    }

    if (object && !object.userData.isJoinedGroup) {
        updateBevelModifierUI(object); 
        updateArrayModifierUI(object); 
        updateScrewModifierUI(object);
        updateBendModifierUI(object); 
        updateAppliedModifiersListUI(object); 
        addModifierBtn.style.display = 'block';
    } else {
        bevelModifierSettingsPanel.style.display = 'none';
        arrayModifierSettingsPanel.style.display = 'none';
        screwModifierSettingsPanel.style.display = 'none';
        bendModifierSettingsPanel.style.display = 'none'; 
        appliedModifiersList.innerHTML = '';
        noModifiersMessage.style.display = 'block';
        addModifierBtn.style.display = 'none';
    }
    
    isUpdatingPropertiesPanel = false;
}

function updateMaterialPropertiesUI(object) {
    const materialList = document.getElementById('material-list');
    const materialBody = document.getElementById('props-material-body');
    
    materialList.innerHTML = ''; 

    let effectiveObject = object;
    if (object && object.userData.isJoinedGroup && object.isGroup && object.children.length > 0) {
        effectiveObject = object.children.find(child => child.isMesh) || null;
    }

    if (!effectiveObject || !effectiveObject.material) {
        materialBody.style.opacity = '0.5';
        materialBody.style.pointerEvents = 'none';
        currentMaterial = null; 
        updateShaderNodeMaterialInputs(null); 
        return;
    }

    materialBody.style.opacity = '1';
    materialBody.style.pointerEvents = 'auto';

    const materials = Array.isArray(effectiveObject.material) ? effectiveObject.material : [effectiveObject.material];
    
    materials.forEach((mat, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = mat.name || `Material.${String(index + 1).padStart(3, '0')}`;
        materialList.appendChild(option);
    });

    if (materialList.options.length > 0) {
        materialList.selectedIndex = 0; 
        if (Array.isArray(effectiveObject.material)) {
            currentMaterial = effectiveObject.material[0];
        } else {
            currentMaterial = effectiveObject.material;
        }
    } else {
        currentMaterial = null; 
    }

    onMaterialSelectionChange();
}

function onMaterialSelectionChange() {
    if (!activeObject) {
        currentMaterial = null; 
        updateShaderNodeMaterialInputs(null); 
        return;
    }

    let targetMaterial = null;
    if (activeObject.userData.isJoinedGroup && activeObject.isGroup && activeObject.children.length > 0) {
        targetMaterial = Array.isArray(activeObject.children.find(child => child.isMesh).material) ? activeObject.children.find(child => child.isMesh).material[0] : activeObject.children.find(child => child.isMesh).material;
    } else {
        targetMaterial = Array.isArray(activeObject.material) ? activeObject.material[0] : activeObject.material;
    }

    currentMaterial = targetMaterial;

    const materialInputs = [materialMetallicInput, materialRoughnessInput, materialIORInput, materialAlphaInput];

    if (currentMaterial && currentMaterial instanceof THREE.MeshStandardMaterial) {
        if (currentMaterial.map) {
            materialColorInput.disabled = true;
            materialColorInput.value = '#' + currentMaterial.color.getHexString(); 
        } else {
            materialColorInput.disabled = false;
            materialColorInput.value = '#' + currentMaterial.color.getHexString();
        }
        
        materialMetallicInput.value = currentMaterial.metalness !== undefined ? currentMaterial.metalness : 0.0;
        materialRoughnessInput.value = currentMaterial.roughness !== undefined ? currentMaterial.roughness : 1.0;
        materialIORInput.value = currentMaterial.ior !== undefined ? currentMaterial.ior : 1.5;
        materialAlphaInput.value = currentMaterial.opacity !== undefined ? currentMaterial.opacity : 1.0;

        materialInputs.forEach(input => input.disabled = false);

        updateShaderNodeMaterialInputs(currentMaterial);
        if (currentMaterial.userData.isNewMaterial) {
            createDefaultShaderConnection();
            delete currentMaterial.userData.isNewMaterial; 
        }
    } else {
        materialColorInput.value = '#808080'; 
        materialMetallicInput.value = 0.0;
        materialRoughnessInput.value = 1.0;
        materialIORInput.value = 1.5;
        materialAlphaInput.value = 1.0;
        materialColorInput.disabled = true; 
        materialInputs.forEach(input => input.disabled = true);

        updateShaderNodeMaterialInputs(null); 
    }
}

function addNewMaterial() {
    if (!activeObject) return;

    let targetObject = activeObject;
    if (activeObject.userData.isJoinedGroup && activeObject.isGroup && activeObject.children.length > 0) {
        targetObject = activeObject.children.find(child => child.isMesh) || null;
    }
    if (!targetObject) return;

    const newMaterial = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff, 
        name: `Material.${String(materialNameCounter++).padStart(3, '0')}`
    });
    newMaterial.userData.isNewMaterial = true; 
    
    const command = new MaterialCommand(targetObject, 'add', { material: newMaterial });
    executeCommand(command);

    setTimeout(() => {
        const materialList = document.getElementById('material-list');
        materialList.selectedIndex = materialList.options.length - 1;
        onMaterialSelectionChange();
    }, 0);
}

function removeSelectedMaterial() {
    if (!activeObject) return;

    let targetObject = activeObject;
    if (activeObject.userData.isJoinedGroup && activeObject.isGroup && activeObject.children.length > 0) {
        targetObject = activeObject.children.find(child => child.isMesh) || null;
    }
    if (!targetObject) return;

    const materialList = document.getElementById('material-list');
    const selectedIndex = materialList.selectedIndex;

    if (selectedIndex === -1) return; 
    
    const materials = Array.isArray(targetObject.material) ? targetObject.material : [targetObject.material];

    if (materials.length <= 1) {
        console.log("Cannot remove the last material.");
        return;
    }

    const materialToRemove = materials[selectedIndex];
    const command = new MaterialCommand(targetObject, 'remove', { material: materialToRemove, index: selectedIndex });
    executeCommand(command);
}

function togglePropertiesPanel() {
    const isCollapsed = propertiesPanel.classList.toggle('collapsed');
    collapsePropertiesButton.textContent = isCollapsed ? '▲' : '▼';
    localStorage.setItem('propertiesPanelCollapsed', isCollapsed);
}

function loadPropertiesPanelState() {
    const savedState = localStorage.getItem('propertiesPanelCollapsed');
    if (savedState === 'true') {
        propertiesPanel.classList.add('collapsed');
        collapsePropertiesButton.textContent = '▲';
    } else {
        propertiesPanel.classList.remove('collapsed');
        collapsePropertiesButton.textContent = '▼';
    }
}

function hidePropertiesPanel() {
}

function adjustLightingBrightness(brightness) {
    ambientLight.intensity = 0.6 * brightness;
    directionalLight.intensity = 0.8 * brightness;
}

function onAddModifierBtnClick(event) {
    event.preventDefault();
    hideContextMenu(); 
    hideAddMeshMenu();
    hideSceneCollectionContextMenu();
    hideAddShaderNodeMenu();
    hideNewTextDialog();

    const rect = addModifierBtn.getBoundingClientRect();
    showAddModifierMenu(rect.left, rect.bottom); 
}

function showAddModifierMenu(x, y) {
    const menuWidth = addModifierMenu.offsetWidth;
    const menuHeight = addModifierMenu.offsetHeight;
    let adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
    let adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

    addModifierMenu.style.left = `${adjustedX}px`;
    addModifierMenu.style.top = `${adjustedY}px`;

    addModifierMenu.style.display = 'block';

    if (hideAddModifierMenuListener) {
        document.removeEventListener('mousedown', hideAddModifierMenuListener, true);
    }

    hideAddModifierMenuListener = (e) => {
        if (!addModifierMenu.contains(e.target) && e.target !== addModifierBtn) {
            hideAddModifierMenu();
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', hideAddModifierMenuListener, true);
    }, 0);
}

function hideAddModifierMenu() {
    addModifierMenu.style.display = 'none';
    if (hideAddModifierMenuListener) {
        document.removeEventListener('mousedown', hideAddModifierMenuListener, true);
        hideAddModifierMenuListener = null;
    }
}

function showAddShaderNodeMenu(x, y) {
    const menuWidth = addShaderNodeMenu.offsetWidth;
    const menuHeight = addShaderNodeMenu.offsetHeight;
    let adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
    let adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);

    addShaderNodeMenu.style.left = `${adjustedX}px`;
    addShaderNodeMenu.style.top = `${adjustedY}px`;

    addShaderNodeMenu.querySelectorAll('.add-shader-node-submenu').forEach(submenu => {
        submenu.style.display = 'none';
    });

    addShaderNodeMenu.style.display = 'block';

    if (hideAddShaderNodeMenuListener) {
        document.removeEventListener('mousedown', hideAddShaderNodeMenuListener, true);
    }

    hideAddShaderNodeMenuListener = (e) => {
        if (!addShaderNodeMenu.contains(e.target)) {
            hideAddShaderNodeMenu();
        }
    };
    setTimeout(() => {
        document.addEventListener('mousedown', hideAddShaderNodeMenuListener, true);
    }, 0);
}

function hideAddShaderNodeMenu() {
    addShaderNodeMenu.style.display = 'none';
    if (hideAddShaderNodeMenuListener) {
        document.removeEventListener('mousedown', hideAddShaderNodeMenuListener, true);
        hideAddShaderNodeMenuListener = null;
    }
}

async function applyBevelModifier(isInitialApplication = false) {
    hideAddModifierMenu(); 

    if (!activeObject) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectSelected, 'ai');
        return;
    }

    if (activeObject.userData.isJoinedGroup) {
        addMessageToChatHistory("AI Assistant: Modifiers cannot be directly applied to joined groups. Please select a single object.", 'ai');
        return;
    }

    if (!(activeObject instanceof THREE.Mesh) || !((activeObject.userData.originalBaseGeometryForBevel || activeObject.geometry) instanceof THREE.BoxGeometry) || !activeObject.isMesh) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.bevelUnsupported(activeObject.name || "Unnamed Object"), 'ai');
        return;
    }

    const newBevelParams = {
        amount: parseFloat(bevelAmountInput.value),
        segments: parseInt(bevelSegmentsInput.value, 10),
        affect: bevelAffectTypeSelect.value, 
        widthType: bevelWidthTypeSelect.value,
        limitMethod: bevelLimitMethodSelect.value
    };

    const oldBevelParams = activeObject.userData.modifiers && activeObject.userData.modifiers.bevel ? { ...activeObject.userData.modifiers.bevel } : null;

    const command = new ApplyBevelModifierCommand(activeObject, newBevelParams, oldBevelParams);
    executeCommand(command);

    if (isInitialApplication) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.bevelApplied(activeObject.name || "Unnamed Object"), 'ai');
        playSound("/screw_apply.mp3"); 
    }
}

async function applyArrayModifier(isInitialApplication = false) {
    hideAddModifierMenu(); 

    if (!activeObject) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectSelected, 'ai');
        return;
    }

    if (activeObject.userData.isJoinedGroup) {
        addMessageToChatHistory("AI Assistant: Modifiers cannot be directly applied to joined groups. Please select a single object.", 'ai');
        return;
    }

    const oldArrayParams = activeObject.userData.modifiers && activeObject.userData.modifiers.array ? { ...activeObject.userData.modifiers.array } : null;
    const prevArrayClonesUUIDs = activeObject.userData.arrayClones ? [...activeObject.userData.arrayClones] : [];

    const newArrayParams = {
        fitType: arrayFitTypeSelect.value,
        count: parseInt(arrayCountInput.value, 10),
        relativeOffset: {
            x: parseFloat(arrayRelOffsetXInput.value),
            y: parseFloat(arrayRelOffsetYInput.value),
            z: parseFloat(arrayRelOffsetZInput.value)
        },
        constantOffset: {
            x: parseFloat(arrayConstOffsetXInput.value),
            y: parseFloat(arrayConstOffsetYInput.value),
            z: parseFloat(arrayConstOffsetZInput.value)
        }
    };
    
    const command = new ApplyArrayModifierCommand(activeObject, newArrayParams, oldArrayParams, prevArrayClonesUUIDs);
    executeCommand(command);

    if (isInitialApplication) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.arrayApplied(activeObject.name || "Unnamed Object"), 'ai');
        playSound("/screw_apply.mp3"); 
    }
}

async function applyScrewModifier(isInitialApplication = false) {
    hideAddModifierMenu();

    if (!activeObject) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectSelected, 'ai');
        return;
    }

    if (activeObject.userData.isJoinedGroup) {
        addMessageToChatHistory("AI Assistant: Modifiers cannot be directly applied to joined groups. Please select a single object.", 'ai');
        return;
    }
    
    const oldScrewParams = activeObject.userData.modifiers && activeObject.userData.modifiers.screw ? { ...activeObject.userData.modifiers.screw } : null;

    const newScrewParams = {
        axis: screwAxisInput.value,
        angle: parseFloat(screwAngleInput.value),
        screw: parseFloat(screwOffsetInput.value),
        iterations: parseInt(screwIterationsInput.value, 10),
        steps: parseInt(screwStepsInput.value, 10)
    };

    const command = new ApplyScrewModifierCommand(activeObject, newScrewParams, oldScrewParams);
    executeCommand(command);

    if (isInitialApplication) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.screwApplied(activeObject.name || "Unnamed Object"), 'ai');
        playSound("/screw_apply.mp3");
    }
}

async function applyBendModifier(isInitialApplication = false) { 
    hideAddModifierMenu();

    if (!activeObject) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.noObjectSelected, 'ai');
        return;
    }

    if (activeObject.userData.isJoinedGroup) {
        addMessageToChatHistory("AI Assistant: Modifiers cannot be directly applied to joined groups. Please select a single object.", 'ai');
        return;
    }
    
    const oldBendParams = activeObject.userData.modifiers && activeObject.userData.modifiers.bend ? { ...activeObject.userData.modifiers.bend } : null;

    const newBendParams = {
        axis: bendAxisSelect.value,
        angle: parseFloat(bendAngleInput.value),
    };

    const command = new ApplyBendModifierCommand(activeObject, newBendParams, oldBendParams);
    executeCommand(command);

    if (isInitialApplication) {
        addMessageToChatHistory(`AI Assistant: Applied ${newBendParams.angle} degree Bend Modifier to "${activeObject.name || "Unnamed Object"}".`, 'ai');
        playSound("/screw_apply.mp3");
    }
}

function updateBevelModifierUI(object) {
    if (object && object.userData.modifiers && object.userData.modifiers.bevel && !object.userData.isJoinedGroup) {
        bevelModifierSettingsPanel.style.display = 'block';
        noModifiersMessage.style.display = 'none';

        const params = object.userData.modifiers.bevel;
        bevelAmountInput.value = params.amount.toFixed(3);
        bevelSegmentsInput.value = params.segments;
        bevelAffectTypeSelect.value = params.affect || 'both';
        bevelWidthTypeSelect.value = params.widthType || 'offset';
        bevelLimitMethodSelect.value = params.limitMethod || 'none';
    } else {
        bevelModifierSettingsPanel.style.display = 'none';
    }
}

function updateArrayModifierUI(object) {
    if (object && object.userData.modifiers && object.userData.modifiers.array && !object.userData.isJoinedGroup) {
        arrayModifierSettingsPanel.style.display = 'block';
        noModifiersMessage.style.display = 'none';

        const params = object.userData.modifiers.array;
        arrayFitTypeSelect.value = params.fitType || 'FIXED_COUNT';
        arrayCountInput.value = params.count || 2;
        arrayRelOffsetXInput.value = (params.relativeOffset && params.relativeOffset.x !== undefined) ? params.relativeOffset.x.toFixed(3) : 1.0;
        arrayRelOffsetYInput.value = (params.relativeOffset && params.relativeOffset.y !== undefined) ? params.relativeOffset.y.toFixed(3) : 0.0;
        arrayRelOffsetZInput.value = (params.relativeOffset && params.relativeOffset.z !== undefined) ? params.relativeOffset.z.toFixed(3) : 0.0;
        arrayConstOffsetXInput.value = (params.constantOffset && params.constantOffset.x !== undefined) ? params.constantOffset.x.toFixed(3) : 0.0;
        arrayConstOffsetYInput.value = (params.constantOffset && params.constantOffset.y !== undefined) ? params.constantOffset.y.toFixed(3) : 0.0;
        arrayConstOffsetZInput.value = (params.constantOffset && params.constantOffset.z !== undefined) ? params.constantOffset.z.toFixed(3) : 0.0;
    } else {
        arrayModifierSettingsPanel.style.display = 'none';
    }
}

function updateScrewModifierUI(object) {
    if (object && object.userData.modifiers && object.userData.modifiers.screw && !object.userData.isJoinedGroup) {
        screwModifierSettingsPanel.style.display = 'block';
        noModifiersMessage.style.display = 'none';

        const params = object.userData.modifiers.screw;
        screwAxisInput.value = params.axis || 'Z';
        screwAngleInput.value = params.angle || 360;
        screwOffsetInput.value = params.screw || 1.0;
        screwIterationsInput.value = params.iterations || 1;
        screwStepsInput.value = params.steps || 16;
    } else {
        screwModifierSettingsPanel.style.display = 'none';
    }
}

function updateBendModifierUI(object) { 
    if (object && object.userData.modifiers && object.userData.modifiers.bend && !object.userData.isJoinedGroup) {
        bendModifierSettingsPanel.style.display = 'block';
        noModifiersMessage.style.display = 'none';

        const params = object.userData.modifiers.bend;
        bendAxisSelect.value = params.axis || 'Z';
        bendAngleInput.value = params.angle || 90;
    } else {
        bendModifierSettingsPanel.style.display = 'none';
    }
}

function updateAppliedModifiersListUI(object) {
    appliedModifiersList.innerHTML = ''; 

    let hasModifiers = false;

    if (object && !object.userData.isJoinedGroup) {
        if (object.userData.modifiers && object.userData.modifiers.bevel) {
            hasModifiers = true;
            const bevelItem = document.createElement('div');
            bevelItem.classList.add('applied-modifier-item');
            
            const modifierNameSpan = document.createElement('span');
            modifierNameSpan.textContent = 'Bevel';
            bevelItem.appendChild(modifierNameSpan);

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('modifier-delete-button');
            deleteButton.textContent = 'x';
            deleteButton.setAttribute('title', 'Remove Bevel Modifier');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); 
                removeModifier(object, 'bevel');
            });
            bevelItem.appendChild(deleteButton);

            bevelItem.addEventListener('click', () => {
                bevelModifierSettingsPanel.style.display = 'block';
                arrayModifierSettingsPanel.style.display = 'none'; 
                screwModifierSettingsPanel.style.display = 'none';
                bendModifierSettingsPanel.style.display = 'none'; 
                updateBevelModifierUI(object); 
            });
            appliedModifiersList.appendChild(bevelItem);
        }

        if (object.userData.modifiers && object.userData.modifiers.array) {
            hasModifiers = true;
            const arrayItem = document.createElement('div');
            arrayItem.classList.add('applied-modifier-item');
            
            const modifierNameSpan = document.createElement('span');
            modifierNameSpan.textContent = 'Array';
            arrayItem.appendChild(modifierNameSpan);

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('modifier-delete-button');
            deleteButton.textContent = 'x';
            deleteButton.setAttribute('title', 'Remove Array Modifier');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); 
                removeModifier(object, 'array');
            });
            arrayItem.appendChild(deleteButton);

            arrayItem.addEventListener('click', () => {
                arrayModifierSettingsPanel.style.display = 'block';
                bevelModifierSettingsPanel.style.display = 'none'; 
                screwModifierSettingsPanel.style.display = 'none';
                bendModifierSettingsPanel.style.display = 'none'; 
                updateArrayModifierUI(object); 
            });
            appliedModifiersList.appendChild(arrayItem);
        }
        
        if (object.userData.modifiers && object.userData.modifiers.screw) {
            hasModifiers = true;
            const screwItem = document.createElement('div');
            screwItem.classList.add('applied-modifier-item');
            
            const modifierNameSpan = document.createElement('span');
            modifierNameSpan.textContent = 'Screw';
            screwItem.appendChild(modifierNameSpan);

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('modifier-delete-button');
            deleteButton.textContent = 'x';
            deleteButton.setAttribute('title', 'Remove Screw Modifier');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); 
                removeModifier(object, 'screw');
            });
            screwItem.appendChild(deleteButton);

            screwItem.addEventListener('click', () => {
                screwModifierSettingsPanel.style.display = 'block';
                bevelModifierSettingsPanel.style.display = 'none';
                arrayModifierSettingsPanel.style.display = 'none';
                bendModifierSettingsPanel.style.display = 'none'; 
                updateScrewModifierUI(object); 
            });
            appliedModifiersList.appendChild(screwItem);
        }

        if (object.userData.modifiers && object.userData.modifiers.bend) {
            hasModifiers = true;
            const bendItem = document.createElement('div');
            bendItem.classList.add('applied-modifier-item');
            
            const modifierNameSpan = document.createElement('span');
            modifierNameSpan.textContent = 'Bend';
            bendItem.appendChild(modifierNameSpan);

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('modifier-delete-button');
            deleteButton.textContent = 'x';
            deleteButton.setAttribute('title', 'Remove Bend Modifier');
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation(); 
                removeModifier(object, 'bend');
            });
            bendItem.appendChild(deleteButton);

            bendItem.addEventListener('click', () => {
                bendModifierSettingsPanel.style.display = 'block';
                bevelModifierSettingsPanel.style.display = 'none';
                arrayModifierSettingsPanel.style.display = 'none';
                screwModifierSettingsPanel.style.display = 'none';
                updateBendModifierUI(object); 
            });
            appliedModifiersList.appendChild(bendItem);
        }
    }

    if (!hasModifiers) {
        noModifiersMessage.style.display = 'block';
        bevelModifierSettingsPanel.style.display = 'none';
        arrayModifierSettingsPanel.style.display = 'none';
        screwModifierSettingsPanel.style.display = 'none';
        bendModifierSettingsPanel.style.display = 'none'; 
    } else {
        noModifiersMessage.style.display = 'none';
    }
}

function onShaderAddNodeButtonClick(event) {
    event.preventDefault();
    event.stopPropagation(); 

    console.log("Add Shader Node button clicked!");
    hideContextMenu();
    hideAddMeshMenu();
    hideSceneCollectionContextMenu();
    hideAddModifierMenu();
    hideAddShaderNodeMenu();
    hideNewTextDialog();

    const rect = shaderAddNodeButton.getBoundingClientRect();
    showAddShaderNodeMenu(rect.left, rect.bottom + 5);
}

function addImageTextureNodeToGraph() {
    hideAddShaderNodeMenu();

    const shaderGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();
    
    const nodeX = shaderGraphAreaRect.width / 2;
    const nodeY = shaderGraphAreaRect.height / 2;

    const imageTextureNodeElement = createImageTextureNodeDOM(nodeX, nodeY);
    shaderNodeGraphArea.appendChild(imageTextureNodeElement);

    playSound("/screw_apply.mp3"); 
    addMessageToChatHistory("AI Assistant: Added Image Texture node.", 'ai');
}

function addBrickTextureNodeToGraph() {
    hideAddShaderNodeMenu();

    const shaderGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();
    
    const nodeX = shaderGraphAreaRect.width / 2;
    const nodeY = shaderGraphAreaRect.height / 2;

    const brickTextureNodeElement = createBrickTextureNodeDOM(nodeX, nodeY);
    shaderNodeGraphArea.appendChild(brickTextureNodeElement);

    playSound("/screw_apply.mp3");
    addMessageToChatHistory("AI Assistant: Added Brick Texture node.", 'ai');
}

function addCheckerTextureNodeToGraph() {
    hideAddShaderNodeMenu();

    const shaderGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();
    
    const nodeX = shaderGraphAreaRect.width / 2 - 75; 
    const nodeY = shaderGraphAreaRect.height / 2 - 100; 

    const checkerTextureNodeElement = createCheckerTextureNodeDOM(nodeX, nodeY);
    shaderNodeGraphArea.appendChild(checkerTextureNodeElement);

    playSound("/screw_apply.mp3");
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addCheckerTextureNode, 'ai');
}

function addGradientTextureNodeToGraph() {
    hideAddShaderNodeMenu();

    const shaderGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();
    
    const nodeX = shaderGraphAreaRect.width / 2;
    const nodeY = shaderGraphAreaRect.height / 2;

    const gradientTextureNodeElement = createGradientTextureNodeDOM(nodeX, nodeY);
    shaderNodeGraphArea.appendChild(gradientTextureNodeElement);

    playSound("/screw_apply.mp3");
    addMessageToChatHistory("AI Assistant: Added Gradient Texture node.", 'ai');
}

function addNoiseTextureNodeToGraph() {
    hideAddShaderNodeMenu();

    const shaderGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();
    
    const nodeX = shaderGraphAreaRect.width / 2;
    const nodeY = shaderGraphAreaRect.height / 2;

    const noiseTextureNodeElement = createNoiseTextureNodeDOM(nodeX, nodeY);
    shaderNodeGraphArea.appendChild(noiseTextureNodeElement);

    playSound("/screw_apply.mp3");
    addMessageToChatHistory("AI Assistant: Added Noise Texture node.", 'ai');
}

function addAddShaderNodeToGraph() {
    hideAddShaderNodeMenu();

    const shaderGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();
    
    const nodeX = shaderGraphAreaRect.width / 2;
    const nodeY = shaderGraphAreaRect.height / 2;

    const addShaderNodeElement = createAddShaderNodeDOM(nodeX, nodeY);
    shaderNodeGraphArea.appendChild(addShaderNodeElement);

    playSound("/screw_apply.mp3");
    addMessageToChatHistory(languageConfig[currentLanguage].ui.addShaderNode, 'ai');
}

function handleSubmitPrompt() {
    const promptText = promptInput.value.trim();
    if (!promptText) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.promptEmptyWarning, 'ai');
        return;
    }

    addMessageToChatHistory(languageConfig[currentLanguage].ui.promptSubmittedFeedback(promptText), 'ai');
    
    generateModelFromPrompt(promptText);
    
    promptInput.value = ''; 
    playSound("/screw_apply.mp3"); 
}

async function generateModelFromPrompt(promptText) {
    const thinkingMessage = `AI Assistant: Analyzing prompt "${promptText}" and generating 3D model...`;
    addMessageToChatHistory(thinkingMessage, 'ai');
    
    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are an expert 3D artist and creative director, specializing in low-poly modeling. Your task is to interpret a user's text prompt and design a compelling 3D scene composition using only the available primitives. 

The Y-axis is UP. The ground plane is at Y=0. Objects should generally be placed on or above this plane.

Available primitives: cube, sphere, cone, torus, capsule, circle, triangle, grid, pyramid, cylinder.

Your response MUST be a JSON object with the following structure:
{
    "objects": [
        {
            "type": "primitive_name",
            "name": "descriptive_object_name",
            "position": {"x": 0, "y": 0, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 1, "y": 1, "z": 1},
            "color": "#hexcolor"
        }
    ],
    "description": "brief description of what was created"
}

Your thought process MUST be:
1. Deconstruct the Prompt: Identify the key objects, atmosphere, and setting from the user's request.
2. List All Scene Items: Create a comprehensive list of every single item required to build the scene.
3. Describe Each Item's Appearance: For each item, provide a detailed visual description. Explain how it can be built from the available primitives, its colors, its textures (e.g., woody, metallic, snowy), and its relationship to other objects.
4. Generate 3D Models: Based on your detailed descriptions, create the list of 3D objects.

Your final response MUST be ONLY a JSON object with the specified structure.

**Rules and Best Practices:**
- Decomposition: Break down complex objects into simpler primitive shapes. A car is not just one box. It has a body (cube), wheels (cylinders or spheres), windows (thin cubes), etc.
- Creativity & Detail: Be creative. For a "magical forest," don't just make one tree. Create a scene with trees of varying sizes, glowing orbs (spheres), a winding path (circles), and perhaps some whimsical mushrooms (capsules).
- Scale: Pay close attention to relative sizes. A car should be smaller than a house. A tree is taller than a person.
- Composition: Arrange objects thoughtfully. Don't just place everything at the origin (0,0,0). Spread them out to create a balanced and interesting composition. Use rotation to add variety.
- Color Palette: Choose a harmonious color palette that fits the mood of the prompt.

**Elaborate Example:**
User prompt: "a small, cozy cabin in a snowy forest"

*Deconstruction: The scene needs a cabin, a forest, and snow.*
*List Items: Cabin base, cabin roof, chimney, smoke, pine trees (multiple), snowy ground, pile of logs.*
*Description:*
    *- Cabin Base: A rectangular box, dark brown wood color. Made from a cube.*
    *- Cabin Roof: A triangular prism shape on top of the base, slightly larger. Darker brown. Covered in a layer of white snow. Made from a pyramid and a stretched sphere for snow.*
    *- Pine Trees: Conical shape, green color. Multiple trees of different sizes and positions. Made from cones.*
    *- Snowy Ground: A large, flat white plane. Made from a grid.*
*Generation:*
{
    "objects": [
        {
            "type": "cube",
            "name": "Cabin Base",
            "position": {"x": 0, "y": 0.5, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 2, "y": 1, "z": 2.5},
            "color": "#6B4226"
        },
        {
            "type": "pyramid",
            "name": "Cabin Roof",
            "position": {"x": 0, "y": 1.5, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 2.2, "y": 1, "z": 2.7},
            "color": "#452d1c"
        },
        {
            "type": "cone",
            "name": "Pine Tree 1",
            "position": {"x": 3, "y": 1.5, "z": -2},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 0.8, "y": 3, "z": 0.8},
            "color": "#2E8B57"
        },
        {
            "type": "cone",
            "name": "Pine Tree 2",
            "position": {"x": -2.5, "y": 1, "z": 1},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 0.6, "y": 2, "z": 0.6},
            "color": "#3CB371"
        },
        {
            "type": "sphere",
            "name": "Snow on Roof",
            "position": {"x": 0, "y": 2.0, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 2.3, "y": 0.4, "z": 2.8},
            "color": "#FFFFFF"
        },
        {
            "type": "grid",
            "name": "Snowy Ground",
            "position": {"x": 0, "y": 0, "z": 0},
            "rotation": {"x": 0, "y": 0, "z": 0},
            "scale": {"x": 10, "y": 1, "z": 10},
            "color": "#F0FFFF"
        }
    ],
    "description": "A cozy, snow-covered cabin nestled among pine trees."
}`
                },
                {
                    role: "user",
                    content: promptText
                }
            ],
        });
        
        const aiResponse = completion.content;
        let modelData;
        
        try {
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                modelData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        } catch (parseError) {
            modelData = generateFallbackModel(promptText);
        }
        
        const existingGenerated = scene.children.filter(obj => obj.userData.isAIGenerated && !obj.userData.isJoinedChild);
        existingGenerated.forEach(obj => {
            const command = new DeleteObjectCommand(obj);
            executeCommand(command);
        });
        
        const createdObjects = [];
        for (const objData of modelData.objects) {
            const newObject = createObjectFromData(objData);
            if (newObject) {
                newObject.userData.isAIGenerated = true;
                const command = new AddObjectCommand(newObject);
                executeCommand(command);
                createdObjects.push(newObject);
            }
        }
        
        if (createdObjects.length > 0) {
            setActiveObject(createdObjects[0]);
        }
        
        addMessageToChatHistory(`AI Assistant: Created ${modelData.description || 'a 3D model'} with ${createdObjects.length} objects.`, 'ai');
        playSound("/screw_apply.mp3");
        
    } catch (error) {
        console.error("Error generating 3D model:", error);
        addMessageToChatHistory("AI Assistant: Error generating 3D model. Creating a simple interpretation instead.", 'ai');
        
        const fallbackModel = generateFallbackModel(promptText);
        const newObject = createObjectFromData(fallbackModel.objects[0]);
        if (newObject) {
            newObject.userData.isAIGenerated = true;
            const command = new AddObjectCommand(newObject);
            executeCommand(command);
            setActiveObject(newObject);
            addMessageToChatHistory(`AI Assistant: Simple ${fallbackModel.description} created.`, 'ai');
        }
    }
}

function generateFallbackModel(promptText) {
    const lowerPrompt = promptText.toLowerCase();
    
    if (lowerPrompt.includes('car') || lowerPrompt.includes('vehicle')) {
        return {
            objects: [
                {
                    type: "cube",
                    name: "Car Body",
                    position: {x: 0, y: 0.5, z: 0},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 2, y: 0.8, z: 1},
                    color: "#ff0000"
                },
                {
                    type: "sphere",
                    name: "Wheel 1",
                    position: {x: -0.7, y: 0.2, z: 0.6},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 0.4, y: 0.4, z: 0.4},
                    color: "#333333"
                },
                {
                    type: "sphere",
                    name: "Wheel 2",
                    position: {x: 0.7, y: 0.2, z: 0.6},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 0.4, y: 0.4, z: 0.4},
                    color: "#333333"
                },
                {
                    type: "sphere",
                    name: "Wheel 3",
                    position: {x: -0.7, y: 0.2, z: -0.6},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 0.4, y: 0.4, z: 0.4},
                    color: "#333333"
                },
                {
                    type: "sphere",
                    name: "Wheel 4",
                    position: {x: 0.7, y: 0.2, z: -0.6},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 0.4, y: 0.4, z: 0.4},
                    color: "#333333"
                }
            ],
            description: "simple car model"
        };
    } else if (lowerPrompt.includes('house') || lowerPrompt.includes('building')) {
        return {
            objects: [
                {
                    type: "cube",
                    name: "House Base",
                    position: {x: 0, y: 0.5, z: 0},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 2, y: 1, z: 1.5},
                    color: "#8B4513"
                },
                {
                    type: "pyramid",
                    name: "Roof",
                    position: {x: 0, y: 1.3, z: 0},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 1.2, y: 0.5, z: 1.2},
                    color: "#654321"
                }
            ],
            description: "simple house model"
        };
    } else if (lowerPrompt.includes('tree')) {
        return {
            objects: [
                {
                    type: "cube",
                    name: "Tree Trunk",
                    position: {x: 0, y: 0.5, z: 0},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 0.3, y: 1, z: 0.3},
                    color: "#8B4513"
                },
                {
                    type: "sphere",
                    name: "Tree Leaves",
                    position: {x: 0, y: 1.2, z: 0},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 1, y: 1, z: 1},
                    color: "#228B22"
                }
            ],
            description: "simple tree model"
        };
    } else {
        return {
            objects: [
                {
                    type: "cube",
                    name: "Generated Object",
                    position: {x: 0, y: 0.5, z: 0},
                    rotation: {x: 0, y: 0, z: 0},
                    scale: {x: 1, y: 1, z: 1},
                    color: "#808080"
                }
            ],
            description: "simple object"
        };
    }
}

function createObjectFromData(objData) {
    let object;
    
    switch (objData.type) {
        case 'cube':
            object = createCube();
            break;
        case 'sphere':
            object = createUVSphere();
            break;
        case 'cone':
            object = createCone();
            break;
        case 'torus':
            object = createTorus();
            break;
        case 'capsule':
            object = createCapsule();
            break;
        case 'circle':
            object = createCircle();
            break;
        case 'triangle':
            object = createTriangle();
            break;
        case 'grid':
            object = createGridPlane();
            break;
        case 'pyramid':
            object = createSquarePyramid();
            break;
        case 'cylinder':
            object = createCylinder();
            break;
        default:
            object = createCube();
    }
    
    if (object) {
        object.name = objData.name || 'Generated Object';
        if (objData.position) object.position.set(objData.position.x, objData.position.y, objData.position.z);
        if (objData.rotation) object.rotation.set(
            THREE.MathUtils.degToRad(objData.rotation.x),
            THREE.MathUtils.degToRad(objData.rotation.y),
            THREE.MathUtils.degToRad(objData.rotation.z)
        );
        if (objData.scale) object.scale.set(objData.scale.x, objData.scale.y, objData.scale.z);
        
        if (objData.color && object.material) {
            object.material.color.set(objData.color);
        }
    }
    
    return object;
}

function showNewTextDialog() {
    newTextDialog.style.display = 'flex';
    setTool('add-text3d'); 
    textContentInput.value = "Hello World";
    textSizeInput.value = 0.5;
    textDepthInput.value = 0.1;
    textFontSelect.value = "Helvetiker Regular"; 
}

function hideNewTextDialog() {
    newTextDialog.style.display = 'none';
    if (activeTool === 'add-text3d') {
        setTool('select'); 
    }
}

function create3DTextObject() {
    const selectedFontName = textFontSelect.value;
    const selectedFont = fonts[selectedFontName];

    if (!selectedFont) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.fontNotLoadedError(selectedFontName), 'ai');
        console.error(`Font "${selectedFontName}" not loaded yet.`);
        return;
    }

    const text = textContentInput.value;
    const size = parseFloat(textSizeInput.value);
    const height = parseFloat(textDepthInput.value);

    if (!text) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.emptyTextError, 'ai');
        return;
    }
    if (isNaN(size) || size <= 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.invalidTextSize, 'ai');
        return;
    }
    if (isNaN(height) || height <= 0) {
        addMessageToChatHistory(languageConfig[currentLanguage].ui.invalidTextDepth, 'ai');
        return;
    }

    const geometry = new TextGeometry(text, {
        font: selectedFont, 
        size: size,
        height: height,
        curveSegments: 12,
        bevelEnabled: false, 
    });

    geometry.computeBoundingBox();
    const centerX = - 0.5 * ( geometry.boundingBox.max.x - geometry.boundingBox.min.x );
    const centerY = - 0.5 * ( geometry.boundingBox.max.y - geometry.boundingBox.min.y );
    const centerZ = - 0.5 * ( geometry.boundingBox.max.z - geometry.boundingBox.min.z ); 

    geometry.translate(centerX, centerY + (height/2), centerZ); 

    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    material.userData.isNewMaterial = true;
    const textMesh = new THREE.Mesh(geometry, material);
    textMesh.name = `Text_${text.substring(0, 10)}`; 
    textMesh.userData.isManagedObject = true;

    const command = new AddObjectCommand(textMesh);
    executeCommand(command);

    setActiveObject(textMesh);
    addMessageToChatHistory(languageConfig[currentLanguage].ui.add3DText(text), 'ai');
    playSound("/screw_apply.mp3");

    hideNewTextDialog();
}

function joinSelectedObjects() {
    hideContextMenu();
    hideAddMeshMenu();
    hideSceneCollectionContextMenu();
    hideAddModifierMenu();
    hideAddShaderNodeMenu();
    hideNewTextDialog();

    const objectsToJoin = selectedObjects.filter(obj => 
        obj.userData.isManagedObject && 
        !obj.userData.isJoinedChild && 
        !obj.userData.isJoinedGroup 
    );

    if (objectsToJoin.length < 2) {
        addMessageToChatHistory("AI Assistant: Please select at least two objects to join.", 'ai');
        return;
    }

    const command = new JoinObjectsCommand(objectsToJoin);
    executeCommand(command);
}

function removeModifier(object, modifierType) {
    if (!object || !object.userData.modifiers || !object.userData.modifiers[modifierType]) {
        console.warn(`Attempted to remove non-existent modifier: ${modifierType} from ${object.name}`);
        return;
    }

    let command;
    const currentModifierParams = { ...object.userData.modifiers[modifierType] }; // Clone params for undo

    switch (modifierType) {
        case 'bevel':
            command = new RemoveBevelModifierCommand(object, currentModifierParams);
            break;
        case 'array':
            const removedClonesUUIDs = object.userData.arrayClones ? [...object.userData.arrayClones] : [];
            command = new RemoveArrayModifierCommand(object, currentModifierParams, removedClonesUUIDs);
            break;
        case 'screw':
            command = new RemoveScrewModifierCommand(object, currentModifierParams);
            break;
        case 'bend':
            command = new RemoveBendModifierCommand(object, currentModifierParams);
            break;
        default:
            console.error(`Unknown modifier type: ${modifierType}`);
            return;
    }

    if (command) {
        executeCommand(command);
        let messageKey;
        switch (modifierType) {
            case 'bevel': messageKey = 'bevelRemoved'; break;
            case 'array': messageKey = 'arrayRemoved'; break;
            case 'screw': messageKey = 'screwRemoved'; break;
            case 'bend': messageKey = 'bendRemoved'; break;
        }
        addMessageToChatHistory(languageConfig[currentLanguage].ui[messageKey](object.name || "Unnamed Object"), 'ai');
        playSound("/screw_apply.mp3");
    }
}