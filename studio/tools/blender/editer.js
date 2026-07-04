import * as THREE from 'three';
import { playSound } from './audio-manager.js'; // Import playSound

// UV Editor variables
let uvScene, uvCamera, uvRenderer, uvCanvas;
let uvBackgroundImageMesh = null;
let uvWireframeMesh = null;
let uvTargetZoom = 1;
let uvCurrentZoom = 1;
const uvZoomLerpFactor = 0.1;

// UV Editor DOM elements (initialized in initializeUVSettings)
let uvNewButton, uvOpenButton;
let uvImageFileInput;
let uvImageInfoDiv;
let uvImageNameDisplay;
let uvClearImageButton;
let currentUVImageName = null;

// New Image Dialog elements (initialized in initializeUVSettings)
let newImageDialog;
let newImageNameInput, newImageWidthInput, newImageHeightInput, newImageColorInput;
let newImageColorRow; 
let newImageTypeBlankRadio, newImageTypeUVGridRadio, newImageTypePromptRadio; 
let newImagePromptInput; 
let createNewImageBtn, cancelNewImageBtn;
let newImageTypeRadios; 

// Callbacks/References from script.js
let _addMessageToChatHistory;
let _languageConfig;
let _selectedObjectRef; 
let _updatePropertiesPanel; 
let _onShaderMaterialTextureChangeCallback; 
let _onMaterialPropertyInputChangeCallback; 
let _currentMaterialRef; 
let _addImageDataToStore; 
let _getImageDataStore; 

// Shader Editor variables
let shaderEditorPanelDiv;
let shaderNodeGraphArea;
let isNodeDragging = false;
let draggedNode = null;
let initialMouseX, initialMouseY;
let initialNodeX, initialNodeY;
let selectedShaderNode = null; 

// Shader Node Material Inputs (internal to editors.js)
let principledBSDFNodeBaseColorInput;
let principledBSDFNodeMetallicInput;
let principledBSDFNodeRoughnessInput;
let principledBSDFNodeIORInput;
let principledBSDFNodeAlphaInput;
let principledBSDFNodeNormalInputPort; 
let materialOutputNodeElement = null; 
let principledBSDFOutputPort = null; 
let principledBSDFBaseColorInputPort = null; 
let materialOutputNodeSurfacePort = null; 
let materialOutputNodeVolumePort = null; 
let materialOutputNodeDisplacementPort = null; 

// Shader Node Wire Drawing variables
let isWireDrawing = false;
let startPortElement = null;
let tempConnectionLine; 
let shaderNodeGraphAreaRect; 

// New variables for connections
let shaderConnections = []; 

// New: Connection status for Principled BSDF to Material Output (Surface)
export let isPrincipledBSDFConnected = false;

// Export uvCamera for use in script.js's onWindowResize
export { uvCamera };

export function createDefaultShaderConnection() {
    if (principledBSDFOutputPort && materialOutputNodeSurfacePort) {
        // Check if a connection already exists to prevent duplicates.
        const connectionExists = shaderConnections.some(
            conn => conn.outputPort === principledBSDFOutputPort && conn.inputPort === materialOutputNodeSurfacePort
        );
        if (!connectionExists) {
            createPermanentConnection(principledBSDFOutputPort, materialOutputNodeSurfacePort);
        }
    } else {
        console.warn("Could not create default shader connection: port elements not found.");
    }
}

export function initializeUVSettings(
    canvasElementId,
    editorPanelId, 
    newButtonId,
    openButtonId,
    fileInputId,
    infoDivId,
    nameDisplayId,
    clearButtonId,
    newDialogId,
    nameInputId,
    widthInputId,
    heightInputId,
    colorInputId,
    createButtonId,
    cancelButtonId,
    addMessageToChatHistoryFunc,
    selectedObjectGetter, 
    languageConfigObj,
    updatePropertiesPanelFunc, 
    onShaderMaterialTextureChangeCallback, 
    addImageDataToStoreCallback 
) {
    _addMessageToChatHistory = addMessageToChatHistoryFunc;
    _selectedObjectRef = selectedObjectGetter;
    _languageConfig = languageConfigObj;
    _updatePropertiesPanel = updatePropertiesPanelFunc; 
    _onShaderMaterialTextureChangeCallback = onShaderMaterialTextureChangeCallback; 
    _addImageDataToStore = addImageDataToStoreCallback; 

    uvCanvas = document.getElementById(canvasElementId);
    uvRenderer = new THREE.WebGLRenderer({ canvas: uvCanvas, antialias: true, alpha: true });
    uvRenderer.setPixelRatio(window.devicePixelRatio);
    uvRenderer.setClearColor(0x3a3a3a, 1);

    uvScene = new THREE.Scene();
    uvScene.background = null;

    uvCamera = new THREE.OrthographicCamera(-0.1, 1.1, 1.1, -0.1, 0.1, 100);
    uvCamera.position.z = 1;
    uvCamera.zoom = 1;
    uvTargetZoom = 1;
    uvCurrentZoom = 1;

    uvNewButton = document.getElementById(newButtonId);
    uvOpenButton = document.getElementById(openButtonId);
    uvImageFileInput = document.getElementById(fileInputId);
    uvImageInfoDiv = document.getElementById(infoDivId);
    uvImageNameDisplay = document.getElementById(nameDisplayId);
    uvClearImageButton = document.getElementById(clearButtonId);

    newImageDialog = document.getElementById(newDialogId);
    newImageNameInput = document.getElementById(nameInputId);
    newImageWidthInput = document.getElementById(widthInputId);
    newImageHeightInput = document.getElementById(heightInputId);
    newImageColorInput = document.getElementById(colorInputId);
    newImageColorRow = document.getElementById('new-image-color-row'); 
    newImageTypeBlankRadio = document.querySelector('input[name="new-image-type"][value="blank"]');
    newImageTypeUVGridRadio = document.querySelector('input[name="new-image-type"][value="uv_grid"]');
    newImageTypePromptRadio = document.querySelector('input[name="new-image-type"][value="prompt"]'); 
    newImagePromptInput = document.getElementById('new-image-prompt-input'); 
    newImageTypeRadios = document.querySelectorAll('input[name="new-image-type"]'); 
    createNewImageBtn = document.getElementById(createButtonId);
    cancelNewImageBtn = document.getElementById(cancelButtonId);

    uvNewButton.addEventListener('click', showNewImageDialog);
    uvOpenButton.addEventListener('click', () => uvImageFileInput.click());
    uvImageFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) loadUVImageFromFile(file);
        event.target.value = '';
    });
    uvClearImageButton.addEventListener('click', clearUVImage);

    createNewImageBtn.addEventListener('click', createNewUVImage);
    cancelNewImageBtn.addEventListener('click', hideNewImageDialog);

    uvCanvas.addEventListener('wheel', onUVEditorWheel, { passive: false });

    newImageTypeRadios.forEach(radio => {
        radio.addEventListener('change', updateNewImageDialogUI);
    });

    // Initial image setup
    generateBlankOrGridUVImage({
        name: "DefaultUVGrid",
        width: 1024,
        height: 1024,
        color: "#808080",
        type: "uv_grid"
    });
}

function onUVEditorWheel(event) {
    event.preventDefault();
    const zoomAmount = 0.01;
    let newTargetZoom = uvTargetZoom - (event.deltaY * zoomAmount * 0.1);
    newTargetZoom = Math.max(0.2, Math.min(newTargetZoom, 10));
    uvTargetZoom = newTargetZoom;
}

function generateBlankOrGridUVImage(params) {
    const { name, width, height, color, type } = params;

    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = width;
    imgCanvas.height = height;
    const ctx = imgCanvas.getContext('2d');

    if (type === 'blank') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
    } else if (type === 'uv_grid') {
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, width, height);

        const checkerSize = Math.floor(Math.max(1, Math.min(width, height) / 8));
        for (let y = 0; y < height; y += checkerSize) {
            for (let x = 0; x < width; x += checkerSize) {
                if ((Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0) {
                    ctx.fillStyle = '#444444';
                } else {
                    ctx.fillStyle = '#555555';
                }
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }

        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        const divisions = 10;
        for (let i = 0; i <= divisions; i++) {
            ctx.beginPath();
            ctx.moveTo(i * width / divisions, 0);
            ctx.lineTo(i * width / divisions, height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * height / divisions);
            ctx.lineTo(width, i * height / divisions);
            ctx.stroke();
        }
    }

    const texture = new THREE.CanvasTexture(imgCanvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;

    // Add the new image to the central data store
    if (_addImageDataToStore) {
        _addImageDataToStore(name, texture, width, height, imgCanvas.toDataURL());
    }

    updateUVBackgroundImage(texture, name, width, height);
    _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageCreated(name, width, height), 'ai');
}

function loadUVImageFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
            const texture = new THREE.Texture(img);
            texture.needsUpdate = true;
            texture.colorSpace = THREE.SRGBColorSpace;
            updateUVBackgroundImage(texture, file.name, img.width, img.height);
            _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageLoaded(file.name, img.width, img.height), 'ai');

            // Add the new image to the central data store
            if (_addImageDataToStore) {
                _addImageDataToStore(file.name, texture, img.width, img.height, imageUrl);
            }
        };
        img.onerror = () => {
            console.error(`Error loading image: ${file.name}`);
            _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageLoadError(file.name), 'ai');
        };
        img.src = imageUrl;
    };
    reader.readAsDataURL(file);
}

function updateUVBackgroundImage(texture, name, width, height) {
    if (uvBackgroundImageMesh) {
        uvScene.remove(uvBackgroundImageMesh);
        uvBackgroundImageMesh.geometry.dispose();
        if (uvBackgroundImageMesh.material.map) {
            uvBackgroundImageMesh.material.map.dispose();
        }
        uvBackgroundImageMesh.material.dispose();
    }

    const uvPlaneGeometry = new THREE.PlaneGeometry(1, 1);
    const uvPlaneMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    uvBackgroundImageMesh = new THREE.Mesh(uvPlaneGeometry, uvPlaneMaterial);
    uvBackgroundImageMesh.position.set(0.5, 0.5, -0.01);
    uvBackgroundImageMesh.renderOrder = -2;
    uvScene.add(uvBackgroundImageMesh);

    currentUVImageName = name;
    updateUVImageInfoUI();

    updateUVEditor(_selectedObjectRef());
}

function updateUVImageInfoUI() {
    if (currentUVImageName) {
        uvImageNameDisplay.textContent = currentUVImageName;
        uvImageInfoDiv.style.display = 'flex';
    } else {
        uvImageNameDisplay.textContent = '';
        uvImageInfoDiv.style.display = 'none';
    }
}

function clearUVImage() {
    if (uvBackgroundImageMesh) {
        uvScene.remove(uvBackgroundImageMesh);
        uvBackgroundImageMesh.geometry.dispose();
        if (uvBackgroundImageMesh.material.map) {
            uvBackgroundImageMesh.material.map.dispose();
        }
        uvBackgroundImageMesh.material.dispose();
        uvBackgroundImageMesh = null;
    }
    currentUVImageName = null;
    updateUVImageInfoUI();

    generateBlankOrGridUVImage({
        name: "DefaultUVGrid",
        width: 1024,
        height: 1024,
        color: "#808080",
        type: "uv_grid"
    });
    _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageCleared, 'ai');
}

function showNewImageDialog() {
    newImageDialog.style.display = 'flex';

    newImageNameInput.value = "Untitled";
    newImageWidthInput.value = 1024;
    newImageHeightInput.value = 1024;
    newImageColorInput.value = "#808080";
    newImageTypeBlankRadio.checked = true;
    newImagePromptInput.value = ""; 

    updateNewImageDialogUI(); 
}

function hideNewImageDialog() {
    newImageDialog.style.display = 'none';
}

function updateNewImageDialogUI() {
    const selectedType = document.querySelector('input[name="new-image-type"]:checked').value;

    if (selectedType === 'prompt') {
        newImageColorRow.style.display = 'none';
        newImagePromptInput.style.display = 'block';
    } else {
        newImageColorRow.style.display = 'flex';
        newImagePromptInput.style.display = 'none';
    }
}

async function createNewUVImage() {
    const name = newImageNameInput.value || "Untitled";
    const width = parseInt(newImageWidthInput.value, 10);
    const height = parseInt(newImageHeightInput.value, 10);
    const selectedType = document.querySelector('input[name="new-image-type"]:checked').value;

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        alert("Please enter valid width and height for the new image.");
        return;
    }

    if (selectedType === 'prompt') {
        const prompt = newImagePromptInput.value.trim();
        if (!prompt) {
            _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImagePromptEmpty, 'ai');
            return;
        }
        await generateImageFromPrompt({ name, width, height, prompt });
    } else {
        const color = newImageColorInput.value;
        generateBlankOrGridUVImage({ name, width, height, color, type: selectedType }); 
    }
    hideNewImageDialog();
}

async function generateImageFromPrompt(params) {
    const { name, width, height, prompt } = params;
    _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageGenerating(prompt), 'ai');
    playSound("/screw_apply.mp3");

    try {
        const fullPrompt = "A texture image that is seamless vertically and horizontally, " + prompt;
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${width}&height=${height}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.crossOrigin = 'anonymous'; 
        img.src = imageUrl;

        await new Promise((resolve, reject) => {
            img.onload = () => {
                const texture = new THREE.Texture(img);
                texture.needsUpdate = true;
                texture.colorSpace = THREE.SRGBColorSpace;
                
                if (_addImageDataToStore) {
                    _addImageDataToStore(name, texture, width, height, imageUrl);
                }

                updateUVBackgroundImage(texture, name, width, height);
                _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageGenerated("AI", name, width, height), 'ai');
                playSound("/screw_apply.mp3"); 
                URL.revokeObjectURL(imageUrl); 
                resolve();
            };
            img.onerror = () => {
                URL.revokeObjectURL(imageUrl); 
                reject(new Error("Image failed to load from Pollinations AI."));
            };
        });

    } catch (error) {
        console.error("Error generating image from prompt:", error);
        _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.uvImageGenerateError, 'ai');
        generateBlankOrGridUVImage({ name, width, height, color: getRandomColorHex(), type: "blank" });
    }
}

// Shader Editor functions

export function initializeShaderEditor(
    panelElementId,
    graphAreaElementId,
    onMaterialPropertyInputChangeCallback,
    currentMaterialGetter, 
    updatePropertiesPanelFunc, 
    onShaderMaterialTextureChangeCallback, 
    getImageDataStoreCallback 
) {
    shaderEditorPanelDiv = document.getElementById(panelElementId);
    shaderNodeGraphArea = document.getElementById(graphAreaElementId);
    _onMaterialPropertyInputChangeCallback = onMaterialPropertyInputChangeCallback;
    _currentMaterialRef = currentMaterialGetter;
    _updatePropertiesPanel = updatePropertiesPanelFunc; 
    _onShaderMaterialTextureChangeCallback = onShaderMaterialTextureChangeCallback; 
    _getImageDataStore = getImageDataStoreCallback; 

    tempConnectionLine = document.getElementById('temp-connection-line');

    // Set up dragging for existing nodes initially
    shaderNodeGraphArea.querySelectorAll('.shader-node').forEach(setupNodeControls);

    // Get references to the Principled BSDF node's inputs and Material Output node
    const allShaderNodes = shaderNodeGraphArea.querySelectorAll('.shader-node');
    let principledBSDFNodeElement = null;
    for (let i = 0; i < allShaderNodes.length; i++) {
        const headerText = allShaderNodes[i].querySelector('.node-header span').textContent.trim();
        if (headerText === 'Principled BSDF') {
            principledBSDFNodeElement = allShaderNodes[i];
            principledBSDFNodeElement.dataset.nodeType = "PrincipledBSDFNode"; 
        } else if (headerText === 'Material Output') {
            materialOutputNodeElement = allShaderNodes[i]; 
            materialOutputNodeElement.dataset.nodeType = "MaterialOutputNode"; 
        }
    }

    if (principledBSDFNodeElement) {
        // Attach listeners to input ports
        principledBSDFNodeElement.querySelectorAll('.node-input-row').forEach(row => {
            const label = row.querySelector('label');
            const input = row.querySelector('.node-input-field');
            const port = row.querySelector('.node-port.input-port'); 
            if (!label || !port) return; 

            const labelText = label.textContent.trim();
            switch (labelText) {
                case 'Base Color':
                    principledBSDFNodeBaseColorInput = input;
                    principledBSDFBaseColorInputPort = port; 
                    break;
                case 'Metallic':
                    principledBSDFNodeMetallicInput = input;
                    break;
                case 'Roughness':
                    principledBSDFNodeRoughnessInput = input;
                    break;
                case 'IOR':
                    principledBSDFNodeIORInput = input;
                    break;
                case 'Alpha':
                    principledBSDFNodeAlphaInput = input;
                    break;
                case 'Normal': 
                    principledBSDFNodeNormalInputPort = port;
                    break;
            }
            // Add mousedown listener to the input port
            port.addEventListener('mousedown', handlePortMousedown);
        });

        // Attach listener to the output port of Principled BSDF
        principledBSDFOutputPort = principledBSDFNodeElement.querySelector('.node-output-row .node-port.output-port.shader-port');
        if (principledBSDFOutputPort) {
            principledBSDFOutputPort.addEventListener('mousedown', handlePortMousedown);
        }

        // Add event listeners to the shader node inputs (for value changes)
        if (principledBSDFNodeBaseColorInput) principledBSDFNodeBaseColorInput.addEventListener('input', (e) => onShaderNodeMaterialInputChange(e, 'color'));
        if (principledBSDFNodeMetallicInput) principledBSDFNodeMetallicInput.addEventListener('input', (e) => onShaderNodeMaterialInputChange(e, 'metalness'));
        if (principledBSDFNodeRoughnessInput) principledBSDFNodeRoughnessInput.addEventListener('input', (e) => onShaderNodeMaterialInputChange(e, 'roughness'));
        if (principledBSDFNodeIORInput) principledBSDFNodeIORInput.addEventListener('input', (e) => onShaderNodeMaterialInputChange(e, 'ior'));
        if (principledBSDFNodeAlphaInput) principledBSDFNodeAlphaInput.addEventListener('input', (e) => onShaderNodeMaterialInputChange(e, 'alpha'));
    }

    // Attach listeners to Material Output node's input ports
    if (materialOutputNodeElement) {
        materialOutputNodeElement.querySelectorAll('.node-input-row').forEach(row => {
            const label = row.querySelector('label');
            const port = row.querySelector('.node-port.input-port');
            if (!label || !port) return;

            const labelText = label.textContent.trim();
            switch (labelText) {
                case 'Surface':
                    materialOutputNodeSurfacePort = port;
                    break;
                case 'Volume':
                    materialOutputNodeVolumePort = port;
                    break;
                case 'Displacement':
                    materialOutputNodeDisplacementPort = port;
                    break;
            }
            port.addEventListener('mousedown', handlePortMousedown);
        });
    }

    // Event listener for node selection/deselection on the graph area
    shaderNodeGraphArea.addEventListener('mousedown', (e) => {
        if (isWireDrawing || isNodeDragging) {
            return;
        }

        const target = e.target;
        const clickedNode = target.closest('.shader-node'); 

        if (clickedNode) {
            if (target.classList.contains('node-port')) {
                return;
            }

            if (selectedShaderNode && selectedShaderNode !== clickedNode) {
                selectedShaderNode.classList.remove('selected');
            }
            clickedNode.classList.add('selected');
            selectedShaderNode = clickedNode;
        } else {
            if (selectedShaderNode) {
                selectedShaderNode.classList.remove('selected');
                selectedShaderNode = null;
            }
        }
    });

    // Initial update of shader node inputs based on current material
    const initialMaterial = _currentMaterialRef();
    updateShaderNodeMaterialInputs(initialMaterial); 
    createDefaultShaderConnection(); 
}

function setupNodeControls(nodeElement) {
    const header = nodeElement.querySelector('.node-header');
    if (header) {
        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; 
            if (e.target.classList.contains('node-delete-button')) {
                return;
            }
            if (isWireDrawing) return; 

            isNodeDragging = true;
            draggedNode = nodeElement;

            nodeElement.style.cursor = 'grabbing';
            header.style.cursor = 'grabbing';

            initialMouseX = e.clientX;
            initialMouseY = e.clientY;

            const computedStyle = window.getComputedStyle(nodeElement);
            initialNodeX = parseFloat(computedStyle.left);
            initialNodeY = parseFloat(computedStyle.top);

            e.preventDefault();

            document.addEventListener('mousemove', onNodeMouseMove);
            document.addEventListener('mouseup', onNodeMouseUp);
        });
    }

    const deleteButton = nodeElement.querySelector('.node-delete-button');
    if (deleteButton) {
        deleteButton.addEventListener('click', (e) => {
            e.stopPropagation(); 
            deleteShaderNode(nodeElement);
        });
    }
}

function onNodeMouseMove(e) {
    if (!isNodeDragging) return;

    const deltaX = e.clientX - initialMouseX;
    const deltaY = e.clientY - initialMouseY;

    let newX = initialNodeX + deltaX;
    let newY = initialNodeY + deltaY;

    draggedNode.style.left = `${newX}px`;
    draggedNode.style.top = `${newY}px`;

    updateAllConnections();
}

function onNodeMouseUp() {
    if (!isNodeDragging) return;
    isNodeDragging = false;
    draggedNode.style.cursor = 'grab';
    const header = draggedNode.querySelector('.node-header');
    if (header) {
        header.style.cursor = 'grab';
    }
    draggedNode = null;
    document.removeEventListener('mousemove', onNodeMouseMove);
    document.removeEventListener('mouseup', onNodeMouseUp);
}

function onShaderNodeMaterialInputChange(e, propertyType) {
    if (_onMaterialPropertyInputChangeCallback) {
        _onMaterialPropertyInputChangeCallback(e, propertyType, 'shader-editor');
    }
}

export function updateShaderNodeMaterialInputs(material) {
    if (!principledBSDFNodeBaseColorInput || !principledBSDFNodeMetallicInput || !principledBSDFNodeRoughnessInput || !principledBSDFNodeIORInput || !principledBSDFNodeAlphaInput || !principledBSDFNodeNormalInputPort) {
        updateMaterialOutputNodeMaterial(material); 
        return;
    }

    if (!material || !(material instanceof THREE.MeshStandardMaterial)) {
        principledBSDFNodeBaseColorInput.value = '#808080';
        principledBSDFNodeMetallicInput.value = 0.0;
        principledBSDFNodeRoughnessInput.value = 1.0;
        principledBSDFNodeIORInput.value = 1.5;
        principledBSDFNodeAlphaInput.value = 1.0;

        [principledBSDFNodeBaseColorInput, principledBSDFNodeMetallicInput, principledBSDFNodeRoughnessInput, principledBSDFNodeIORInput, principledBSDFNodeAlphaInput]
            .filter(Boolean).forEach(input => input.disabled = true);
        
        principledBSDFNodeBaseColorInput.disabled = true; 
    } else {
        const isBaseColorConnectedToTextureNode = shaderConnections.some(conn => 
            conn.inputPort === principledBSDFBaseColorInputPort && 
            (getParentNode(conn.outputPort).dataset.nodeType === 'ImageTextureNode' ||
             getParentNode(conn.outputPort).dataset.nodeType === 'BrickTextureNode' ||
             getParentNode(conn.outputPort).dataset.nodeType === 'CheckerTextureNode' ||
             getParentNode(conn.outputPort).dataset.nodeType === 'GradientTextureNode' ||
             getParentNode(conn.outputPort).dataset.nodeType === 'NoiseTextureNode')
        );

        principledBSDFNodeBaseColorInput.value = '#' + material.color.getHexString();
        principledBSDFNodeMetallicInput.value = material.metalness !== undefined ? material.metalness : 0.0;
        principledBSDFNodeRoughnessInput.value = material.roughness !== undefined ? material.roughness : 1.0;
        principledBSDFNodeIORInput.value = material.ior !== undefined ? material.ior : 1.5;
        principledBSDFNodeAlphaInput.value = material.opacity !== undefined ? material.opacity : 1.0;

        [principledBSDFNodeMetallicInput, principledBSDFNodeRoughnessInput, principledBSDFNodeIORInput, principledBSDFNodeAlphaInput]
            .filter(Boolean).forEach(input => input.disabled = false);
        
        if (isBaseColorConnectedToTextureNode) {
            principledBSDFNodeBaseColorInput.disabled = true;
        } else {
            principledBSDFNodeBaseColorInput.disabled = false;
        }
    }

    updateMaterialOutputNodeMaterial(material);
}

export function updateMaterialOutputNodeMaterial(material) {
    if (!materialOutputNodeElement) {
        console.warn("Material Output node element not found in shader editor. Cannot set material reference.");
        return;
    }
    materialOutputNodeElement.materialRef = material;
}

function getElementCenter(element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
    };
}

function getRelativeCoordinates(globalX, globalY, containerRect) {
    return {
        x: globalX - containerRect.left,
        y: globalY - containerRect.top
    };
}

function handlePortMousedown(e) {
    if (e.button !== 0) return; 
    if (isNodeDragging) return; 

    startPortElement = e.target;
    const startPortIsInput = startPortElement.classList.contains('input-port');

    if (startPortIsInput) {
        const existingConnectionIndex = shaderConnections.findIndex(conn => conn.inputPort === startPortElement);
        if (existingConnectionIndex !== -1) {
            const existingConnection = shaderConnections[existingConnectionIndex];
            removePermanentConnection(existingConnection); 
        }
    }

    isWireDrawing = true;
    shaderNodeGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect();

    const startPointGlobal = getElementCenter(startPortElement);
    const startPointRelative = getRelativeCoordinates(startPointGlobal.x, startPointGlobal.y, shaderNodeGraphAreaRect);

    const portColor = window.getComputedStyle(startPortElement).backgroundColor;
    tempConnectionLine.style.stroke = portColor;

    const pathData = `M ${startPointRelative.x} ${startPointRelative.y} C ${startPointRelative.x},${startPointRelative.y} ${startPointRelative.x},${startPointRelative.y} ${startPointRelative.x},${startPointRelative.y}`;
    tempConnectionLine.setAttribute('d', pathData);
    tempConnectionLine.style.display = 'block';

    e.preventDefault(); 

    document.addEventListener('mousemove', handleGraphAreaMousemove);
    document.addEventListener('mouseup', handleDocumentMouseup);
}

function handleGraphAreaMousemove(e) {
    if (!isWireDrawing) return;

    const startPointGlobal = getElementCenter(startPortElement);
    const startPointRelative = getRelativeCoordinates(startPointGlobal.x, startPointGlobal.y, shaderNodeGraphAreaRect);
    
    const endPointRelative = getRelativeCoordinates(e.clientX, e.clientY, shaderNodeGraphAreaRect);

    const midX = (startPointRelative.x + endPointRelative.x) / 2;
    const cp1x = midX;
    const cp1y = startPointRelative.y;
    const cp2x = midX;
    const cp2y = endPointRelative.y;

    const pathData = `M ${startPointRelative.x} ${startPointRelative.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endPointRelative.x} ${endPointRelative.y}`;
    tempConnectionLine.setAttribute('d', pathData);
}

function handleDocumentMouseup(e) {
    if (!isWireDrawing) return;

    const endPortElement = document.elementFromPoint(e.clientX, e.clientY);
    const connectionResult = isValidConnection(startPortElement, endPortElement);

    if (connectionResult.isValid) {
        createPermanentConnection(connectionResult.output, connectionResult.input);
    }

    isWireDrawing = false;
    tempConnectionLine.style.display = 'none'; 
    tempConnectionLine.style.stroke = ''; 
    startPortElement = null; 

    document.removeEventListener('mousemove', handleGraphAreaMousemove);
    document.removeEventListener('mouseup', handleDocumentMouseup);
}

function getPortType(portElement) {
    if (portElement.classList.contains('shader-port')) return 'shader'; 
    if (portElement.classList.contains('displacement-port')) return 'displacement';
    if (portElement.classList.contains('vector-port')) return 'vector'; 
    if (portElement.classList.contains('image-texture-color-output')) return 'image-color'; 
    if (portElement.classList.contains('brick-texture-color-output')) return 'brick-color'; 
    if (portElement.classList.contains('checker-texture-color-output')) return 'checker-color'; 
    if (portElement.classList.contains('gradient-texture-color-output')) return 'gradient-color'; 
    if (portElement.classList.contains('noise-texture-color-output')) return 'noise-color'; 
    return 'generic'; 
}

function getParentNode(portElement) {
    let current = portElement;
    while (current && !current.classList.contains('shader-node')) {
        current = current.parentElement;
    }
    return current;
}

function isValidConnection(startPort, endPort) {
    if (!startPort || !endPort) return { isValid: false }; 

    const startPortIsOutput = startPort.classList.contains('output-port');
    const startPortIsInput = startPort.classList.contains('input-port');
    const endPortIsOutput = endPort.classList.contains('output-port');
    const endPortIsInput = endPort.classList.contains('input-port');

    let actualOutputPort = null;
    let actualInputPort = null;

    if (startPortIsOutput && endPortIsInput) {
        actualOutputPort = startPort;
        actualInputPort = endPort;
    } else if (startPortIsInput && endPortIsOutput) {
        actualOutputPort = endPort;
        actualInputPort = startPort;
    } else {
        return { isValid: false }; 
    }

    const startNode = getParentNode(actualOutputPort);
    const endNode = getParentNode(actualInputPort);

    if (!startNode || !endNode || startNode === endNode) return { isValid: false }; 

    const outputPortType = getPortType(actualOutputPort);
    const inputPortType = getPortType(actualInputPort);

    if (outputPortType === 'shader' && inputPortType === 'shader') {
        const startNodeHeader = startNode.querySelector('.node-header span').textContent.trim();
        const endNodeHeader = endNode.querySelector('.node-header span').textContent.trim();
        if (startNodeHeader === 'Principled BSDF' && actualOutputPort === principledBSDFOutputPort &&
            endNodeHeader === 'Material Output' && actualInputPort === materialOutputNodeSurfacePort) {
            return { isValid: true, output: actualOutputPort, input: actualInputPort };
        }
    }
    if (['image-color', 'brick-color', 'checker-color', 'gradient-color', 'noise-color'].includes(outputPortType) && actualInputPort === principledBSDFBaseColorInputPort) {
        return { isValid: true, output: actualOutputPort, input: actualInputPort };
    }
    
    if (inputPortType === 'vector') {
        return { isValid: true, output: actualOutputPort, input: actualInputPort };
    }

    if (outputPortType === 'shader' && inputPortType === 'shader') {
        return { isValid: true, output: actualOutputPort, input: actualInputPort };
    }

    return { isValid: false };
}

export function createAddShaderNodeDOM(x, y) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('shader-node');
    nodeElement.dataset.nodeType = 'AddShaderNode';
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;

    nodeElement.innerHTML = `
        <div class="node-header">
            <span>Add Shader</span>
            <button class="node-delete-button" title="Delete Node">x</button>
        </div>
        <div class="node-content">
            <div class="node-input-row">
                <span class="node-port input-port shader-port"></span><label>Shader</label>
            </div>
            <div class="node-input-row">
                <span class="node-port input-port shader-port"></span><label>Shader</label>
            </div>
            <div class="node-output-row">
                <label>Shader</label><span class="node-port output-port shader-port"></span>
            </div>
        </div>
    `;

    setupNodeControls(nodeElement);

    nodeElement.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', handlePortMousedown);
    });

    return nodeElement;
}

function createPermanentConnection(outputPort, inputPort) {
    const existingConnectionIndex = shaderConnections.findIndex(conn => conn.inputPort === inputPort);
    if (existingConnectionIndex !== -1) {
        const existingConnection = shaderConnections[existingConnectionIndex];
        removePermanentConnection(existingConnection); 
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('shader-connection-line');
    path.style.stroke = window.getComputedStyle(outputPort).backgroundColor; 
    shaderNodeGraphArea.querySelector('#shader-connections-svg').appendChild(path);

    const connection = {
        outputPort: outputPort,
        inputPort: inputPort,
        pathElement: path
    };
    shaderConnections.push(connection);

    updateConnectionPath(connection);

    if (outputPort === principledBSDFOutputPort && inputPort === materialOutputNodeSurfacePort) {
        isPrincipledBSDFConnected = true; 
        playSound("/screw_apply.mp3"); 
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
        updateShaderNodeMaterialInputs(_currentMaterialRef());

    } else if (getParentNode(outputPort).dataset.nodeType === 'ImageTextureNode' && inputPort === principledBSDFBaseColorInputPort) {
        const imageTextureNode = getParentNode(outputPort);
        const texture = imageTextureNode.nodeTexture; 
        if (_onShaderMaterialTextureChangeCallback && texture) {
            _onShaderMaterialTextureChangeCallback(texture); 
            principledBSDFNodeBaseColorInput.disabled = true; 
            playSound("/screw_apply.mp3");
        }
        if (_updatePropertiesPanel && _selectedObjectRef()) { 
             _updatePropertiesPanel(_selectedObjectRef());
        }
        updateShaderNodeMaterialInputs(_currentMaterialRef());

    } else if (getParentNode(outputPort).dataset.nodeType === 'BrickTextureNode' && inputPort === principledBSDFBaseColorInputPort) {
        const brickTextureNode = getParentNode(outputPort);
        const texture = brickTextureNode.nodeTexture; 
        if (_onShaderMaterialTextureChangeCallback && texture) {
            _onShaderMaterialTextureChangeCallback(texture); 
            principledBSDFNodeBaseColorInput.disabled = true; 
            playSound("/screw_apply.mp3");
        }
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
        updateShaderNodeMaterialInputs(_currentMaterialRef());

    } else if (getParentNode(outputPort).dataset.nodeType === 'CheckerTextureNode' && inputPort === principledBSDFBaseColorInputPort) {
        const checkerTextureNode = getParentNode(outputPort);
        const texture = checkerTextureNode.nodeTexture;
        if (_onShaderMaterialTextureChangeCallback && texture) {
            _onShaderMaterialTextureChangeCallback(texture); 
            principledBSDFNodeBaseColorInput.disabled = true;
            playSound("/screw_apply.mp3");
        }
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
        updateShaderNodeMaterialInputs(_currentMaterialRef());

    } else if (getPortType(outputPort) === 'gradient-color' && inputPort === principledBSDFBaseColorInputPort) {
        const gradientTextureNode = getParentNode(outputPort);
        const texture = gradientTextureNode.nodeTexture;
        if (_onShaderMaterialTextureChangeCallback && texture) {
            _onShaderMaterialTextureChangeCallback(texture); 
            principledBSDFNodeBaseColorInput.disabled = true;
            playSound("/screw_apply.mp3");
        }
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
        updateShaderNodeMaterialInputs(_currentMaterialRef());

    } else if (getPortType(outputPort) === 'noise-color' && inputPort === principledBSDFBaseColorInputPort) {
        const noiseTextureNode = getParentNode(outputPort);
        const texture = noiseTextureNode.nodeTexture;
        if (_onShaderMaterialTextureChangeCallback && texture) {
            _onShaderMaterialTextureChangeCallback(texture); 
            principledBSDFNodeBaseColorInput.disabled = true;
            playSound("/screw_apply.mp3");
        }
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
        updateShaderNodeMaterialInputs(_currentMaterialRef());
    }
}

function removePermanentConnection(connection) {
    if (!connection) return;

    if (connection.outputPort === principledBSDFOutputPort && connection.inputPort === materialOutputNodeSurfacePort) {
        isPrincipledBSDFConnected = false; 
        playSound("/screw_apply.mp3"); 
    } else if (getParentNode(connection.outputPort).dataset.nodeType === 'ImageTextureNode' && connection.inputPort === principledBSDFBaseColorInputPort) {
        if (_onShaderMaterialTextureChangeCallback) {
            _onShaderMaterialTextureChangeCallback(null); 
            principledBSDFNodeBaseColorInput.disabled = false; 
            playSound("/screw_apply.mp3");
        }
    } else if (getParentNode(connection.outputPort).dataset.nodeType === 'BrickTextureNode' && connection.inputPort === principledBSDFBaseColorInputPort) {
        if (_onShaderMaterialTextureChangeCallback) {
            _onShaderMaterialTextureChangeCallback(null); 
            principledBSDFNodeBaseColorInput.disabled = false; 
            playSound("/screw_apply.mp3");
        }
    } else if (getParentNode(connection.outputPort).dataset.nodeType === 'CheckerTextureNode' && connection.inputPort === principledBSDFBaseColorInputPort) {
        if (_onShaderMaterialTextureChangeCallback) {
            _onShaderMaterialTextureChangeCallback(null); 
            principledBSDFNodeBaseColorInput.disabled = false;
            playSound("/screw_apply.mp3");
        }
    } else if (getParentNode(connection.outputPort).dataset.nodeType === 'GradientTextureNode' && connection.inputPort === principledBSDFBaseColorInputPort) {
        if (_onShaderMaterialTextureChangeCallback) {
            _onShaderMaterialTextureChangeCallback(null); 
            principledBSDFNodeBaseColorInput.disabled = false;
            playSound("/screw_apply.mp3");
        }
    } else if (getParentNode(connection.outputPort).dataset.nodeType === 'NoiseTextureNode' && connection.inputPort === principledBSDFBaseColorInputPort) {
        if (_onShaderMaterialTextureChangeCallback) {
            _onShaderMaterialTextureChangeCallback(null); 
            principledBSDFNodeBaseColorInput.disabled = false;
            playSound("/screw_apply.mp3");
        }
    }

    connection.pathElement.remove(); 
    const index = shaderConnections.indexOf(connection);
    if (index !== -1) {
        shaderConnections.splice(index, 1); 
    }

    if (_updatePropertiesPanel && _selectedObjectRef()) {
        _updatePropertiesPanel(_selectedObjectRef());
    }
    updateShaderNodeMaterialInputs(_currentMaterialRef()); 
}

function updateConnectionPath(connection) {
    if (!connection || !connection.pathElement || !connection.outputPort || !connection.inputPort) return;

    const startPointGlobal = getElementCenter(connection.outputPort);
    const endPointGlobal = getElementCenter(connection.inputPort);
    
    shaderNodeGraphAreaRect = shaderNodeGraphArea.getBoundingClientRect(); 

    const startPointRelative = getRelativeCoordinates(startPointGlobal.x, startPointGlobal.y, shaderNodeGraphAreaRect);
    const endPointRelative = getRelativeCoordinates(endPointGlobal.x, endPointGlobal.y, shaderNodeGraphAreaRect);

    const midX = (startPointRelative.x + endPointRelative.x) / 2;
    const cp1x = midX;
    const cp1y = startPointRelative.y;
    const cp2x = midX;
    const cp2y = endPointRelative.y;

    const pathData = `M ${startPointRelative.x} ${startPointRelative.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endPointRelative.x} ${endPointRelative.y}`;
    connection.pathElement.setAttribute('d', pathData);
}

export function updateAllConnections() {
    shaderConnections.forEach(updateConnectionPath);
}

export function createImageTextureNodeDOM(x, y) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('shader-node');
    nodeElement.dataset.nodeType = 'ImageTextureNode'; 
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;

    nodeElement.innerHTML = `
        <div class="node-header">
            <span>Image Texture</span>
            <button class="node-delete-button" title="Delete Node">x</button>
        </div>
        <div class="node-content">
            <div class="node-input-row">
                <span class="node-port input-port vector-port"></span><label>Vector</label>
            </div>
            <div class="node-image-preview-container" style="text-align: center; margin: 5px 0;">
                <img class="node-image-preview" src="" alt="Texture Preview" style="max-width: 100px; max-height: 100px; border: 1px solid #555; display: none;">
                <span class="node-image-name" style="font-size: 0.75em; color: #afafaf; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">No Image</span>
                <button class="node-image-open-button" style="background-color: #505050; color: white; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 0.8em; margin-top: 5px;">Browse...</button>
                <input type="file" class="node-image-file-input" accept="image/*" style="display: none;">
            </div>
            <div class="node-output-row">
                <label>Color</label><span class="node-port output-port image-texture-color-output" style="background-color: yellow;"></span>
            </div>
            <div class="node-output-row">
                <label>Alpha</label><span class="node-port output-port" style="background-color: grey;"></span>
            </div>
        </div>
    `;

    setupNodeControls(nodeElement);

    nodeElement.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', handlePortMousedown);
    });

    const openButton = nodeElement.querySelector('.node-image-open-button');
    const fileInput = nodeElement.querySelector('.node-image-file-input');
    const previewImg = nodeElement.querySelector('.node-image-preview');
    const nameDisplay = nodeElement.querySelector('.node-image-name');

    openButton.addEventListener('click', (e) => {
        e.stopPropagation();
        showImageSelectorMenu(e.currentTarget, nodeElement);
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target.result;
                const img = new Image();
                img.onload = () => {
                    const texture = new THREE.Texture(img);
                    texture.needsUpdate = true;
                    texture.colorSpace = THREE.SRGBColorSpace;
                    
                    if (_addImageDataToStore) {
                        _addImageDataToStore(file.name, texture, img.width, img.height, imageUrl);
                    }

                    const imageData = { name: file.name, texture };
                    applyImageToNode(nodeElement, imageData);
                    
                    _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.shaderImageLoaded(file.name), 'ai');
                };
                img.onerror = () => {
                    console.error(`Error loading image for node: ${file.name}`);
                    _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.shaderImageLoadError(file.name), 'ai');
                };
                img.src = imageUrl;
            };
            reader.readAsDataURL(file);
        }
        event.target.value = ''; 
    });

    return nodeElement;
}

function showImageSelectorMenu(buttonElement, nodeElement) {
    const existingMenu = document.getElementById('image-selector-menu');
    if (existingMenu) existingMenu.remove();

    const imageStore = _getImageDataStore();

    const menu = document.createElement('div');
    menu.id = 'image-selector-menu';

    const list = document.createElement('ul');
    
    if (imageStore.size > 0) {
        imageStore.forEach((imageData, name) => {
            const item = document.createElement('li');
            item.textContent = name;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                applyImageToNode(nodeElement, imageData);
                menu.remove();
            });
            list.appendChild(item);
        });
        const separator = document.createElement('li');
        separator.classList.add('separator');
        list.appendChild(separator);
    }

    const openNewItem = document.createElement('li');
    openNewItem.textContent = 'Open New...';
    openNewItem.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileInput = nodeElement.querySelector('.node-image-file-input');
        fileInput.click();
        menu.remove();
    });
    list.appendChild(openNewItem);

    menu.appendChild(list);

    const rect = buttonElement.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom}px`;
    
    document.body.appendChild(menu);

    const hideMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== buttonElement) {
            menu.remove();
            document.removeEventListener('mousedown', hideMenu, true);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', hideMenu, true), 0);
}

function applyImageToNode(nodeElement, imageData) {
    const { texture, name } = imageData;
    const previewImg = nodeElement.querySelector('.node-image-preview');
    const nameDisplay = nodeElement.querySelector('.node-image-name');
    
    nodeElement.nodeTexture = texture;
    nodeElement.nodeImageFileName = name;

    previewImg.src = texture.image.src; 
    previewImg.style.display = 'block';
    nameDisplay.textContent = name;
    
    shaderConnections.forEach(conn => {
        if (conn.outputPort === nodeElement.querySelector('.image-texture-color-output') && conn.inputPort === principledBSDFBaseColorInputPort) {
            if (_onShaderMaterialTextureChangeCallback) {
                _onShaderMaterialTextureChangeCallback(texture);
            }
        }
    });
    if (_updatePropertiesPanel && _selectedObjectRef()) { 
        _updatePropertiesPanel(_selectedObjectRef());
    }
}

function generateBrickTexture(params) {
    const { color1, color2, mortarColor, scale, resolution = 512 } = params;

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');

    const brickWidth = resolution / (scale * 2); 
    const brickHeight = resolution / scale; 
    const mortarThickness = brickWidth * 0.05; 

    const brickColor1 = new THREE.Color(color1);
    const brickColor2 = new THREE.Color(color2);
    const mortarHex = mortarColor;

    ctx.clearRect(0, 0, resolution, resolution);

    for (let y = 0; y < resolution; y += brickHeight + mortarThickness) {
        let offsetX = (Math.floor(y / (brickHeight + mortarThickness)) % 2 === 0) ? 0 : -(brickWidth / 2 + mortarThickness / 2);
        
        for (let x = -brickWidth; x < resolution + brickWidth; x += brickWidth + mortarThickness) {
            const currentX = x + offsetX;
            
            ctx.fillStyle = (Math.floor(y / (brickHeight + mortarThickness)) % 2 === 0) ? '#' + brickColor1.getHexString() : '#' + brickColor2.getHexString();
            ctx.fillRect(currentX, y, brickWidth, brickHeight);

            ctx.fillStyle = mortarHex;
            ctx.fillRect(currentX, y + brickHeight, brickWidth, mortarThickness);
        }
        ctx.fillStyle = mortarHex;
        for (let x = -brickWidth; x < resolution + brickWidth; x += brickWidth + mortarThickness) {
            const currentX = x + offsetX;
            ctx.fillRect(currentX + brickWidth, y, mortarThickness, brickHeight + mortarThickness);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace; 
    return texture;
}

function generateGradientTexture(params) {
    const { color1, color2, type, resolution = 512 } = params;

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');

    let gradient;
    if (type === 'linear') {
        gradient = ctx.createLinearGradient(0, 0, resolution, 0); 
    } else if (type === 'radial') {
        gradient = ctx.createRadialGradient(resolution / 2, resolution / 2, 0, resolution / 2, resolution / 2, resolution / 2);
    } else {
        gradient = ctx.createLinearGradient(0, 0, resolution, 0); 
    }

    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, resolution, resolution);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function randomizeBrickTextureParams(nodeElement) {
    const newParams = {
        color1: getRandomColorHex(),
        color2: getRandomColorHex(),
        mortarColor: getRandomColorHex(),
        scale: parseFloat((Math.random() * 8 + 2).toFixed(1)) 
    };

    nodeElement.querySelector('.color1-input').value = newParams.color1;
    nodeElement.querySelector('.color2-input').value = newParams.color2;
    nodeElement.querySelector('.mortar-input').value = newParams.mortarColor;
    nodeElement.querySelector('.scale-input').value = newParams.scale;

    nodeElement.dataset.params = JSON.stringify(newParams);

    if (nodeElement.nodeTexture) {
        nodeElement.nodeTexture.dispose(); 
    }
    nodeElement.nodeTexture = generateBrickTexture(newParams);

    shaderConnections.forEach(conn => {
        if (conn.outputPort === nodeElement.querySelector('.brick-texture-color-output') && conn.inputPort === principledBSDFBaseColorInputPort) {
            if (_onShaderMaterialTextureChangeCallback) {
                _onShaderMaterialTextureChangeCallback(nodeElement.nodeTexture);
            }
        }
    });
    if (_updatePropertiesPanel && _selectedObjectRef()) { 
        _updatePropertiesPanel(_selectedObjectRef());
    }
    _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.randomizedBrickTextureNode, 'ai');
    playSound("/screw_apply.mp3");
}

export function createBrickTextureNodeDOM(x, y) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('shader-node');
    nodeElement.dataset.nodeType = 'BrickTextureNode'; 
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;

    const defaultParams = {
        color1: "#8B4513", 
        color2: "#A0522D", 
        mortarColor: "#808080", 
        scale: 5.0
    };
    nodeElement.dataset.params = JSON.stringify(defaultParams);

    nodeElement.innerHTML = `
        <div class="node-header">
            <span>Brick Texture</span>
            <button class="node-delete-button" title="Delete Node">x</button>
        </div>
        <div class="node-content">
            <div class="node-input-row">
                <span class="node-port input-port vector-port"></span><label>Vector</label>
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Color1</label>
                <input type="color" class="node-input-field color1-input" value="${defaultParams.color1}">
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Color2</label>
                <input type="color" class="node-input-field color2-input" value="${defaultParams.color2}">
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Mortar</label>
                <input type="color" class="node-input-field mortar-input" value="${defaultParams.mortarColor}">
            </div>
            <div class="node-input-row">
                <span class="node-port input-port" style="background-color: grey;"></span><label>Scale</label>
                <input type="number" class="node-input-field scale-input" min="0.1" step="0.1" value="${defaultParams.scale}">
            </div>
            <button class="randomize-brick-button" style="background-color: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8em; margin-top: 10px; width: 100%;">Randomize</button>
            <div class="node-output-row">
                <label>Color</label><span class="node-port output-port brick-texture-color-output" style="background-color: yellow;"></span>
            </div>
            <div class="node-output-row">
                <label>Fac</label><span class="node-port output-port" style="background-color: grey;"></span>
            </div>
        </div>
    `;

    setupNodeControls(nodeElement);

    nodeElement.nodeTexture = generateBrickTexture(defaultParams);

    nodeElement.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', handlePortMousedown);
    });

    const updateBrickTexture = () => {
        const currentParams = JSON.parse(nodeElement.dataset.params);
        currentParams.color1 = nodeElement.querySelector('.color1-input').value;
        currentParams.color2 = nodeElement.querySelector('.color2-input').value;
        currentParams.mortarColor = nodeElement.querySelector('.mortar-input').value;
        currentParams.scale = parseFloat(nodeElement.querySelector('.scale-input').value);
        nodeElement.dataset.params = JSON.stringify(currentParams);

        const newTexture = generateBrickTexture(currentParams);
        if (nodeElement.nodeTexture) {
            nodeElement.nodeTexture.dispose();
        }
        nodeElement.nodeTexture = newTexture;

        shaderConnections.forEach(conn => {
            if (conn.outputPort === nodeElement.querySelector('.brick-texture-color-output') && conn.inputPort === principledBSDFBaseColorInputPort) {
                if (_onShaderMaterialTextureChangeCallback) {
                    _onShaderMaterialTextureChangeCallback(nodeElement.nodeTexture);
                }
            }
        });
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
    };

    nodeElement.querySelector('.color1-input').addEventListener('input', updateBrickTexture);
    nodeElement.querySelector('.color2-input').addEventListener('input', updateBrickTexture);
    nodeElement.querySelector('.mortar-input').addEventListener('input', updateBrickTexture);
    nodeElement.querySelector('.scale-input').addEventListener('input', updateBrickTexture);

    const randomizeButton = nodeElement.querySelector('.randomize-brick-button');
    if (randomizeButton) {
        randomizeButton.addEventListener('click', () => {
            randomizeBrickTextureParams(nodeElement);
        });
    }

    return nodeElement;
}

export function createCheckerTextureNodeDOM(x, y) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('shader-node');
    nodeElement.dataset.nodeType = 'CheckerTextureNode';
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;

    const defaultParams = {
        color1: "#FFFFFF",
        color2: "#000000",
        scale: 8.0
    };
    nodeElement.dataset.params = JSON.stringify(defaultParams);

    nodeElement.innerHTML = `
        <div class="node-header">
            <span>Checker Texture</span>
            <button class="node-delete-button" title="Delete Node">x</button>
        </div>
        <div class="node-content">
            <div class="node-input-row">
                <span class="node-port input-port vector-port"></span><label>Vector</label>
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Color1</label>
                <input type="color" class="node-input-field color1-input" value="${defaultParams.color1}">
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Color2</label>
                <input type="color" class="node-input-field color2-input" value="${defaultParams.color2}">
            </div>
            <div class="node-input-row">
                <span class="node-port input-port" style="background-color: grey;"></span><label>Scale</label>
                <input type="number" class="node-input-field scale-input" min="1" step="1" value="${defaultParams.scale}">
            </div>
            <div class="node-output-row">
                <label>Color</label><span class="node-port output-port checker-texture-color-output" style="background-color: yellow;"></span>
            </div>
            <div class="node-output-row">
                <label>Fac</label><span class="node-port output-port" style="background-color: grey;"></span>
            </div>
        </div>
    `;

    setupNodeControls(nodeElement);
    nodeElement.nodeTexture = generateCheckerTexture(defaultParams);

    nodeElement.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', handlePortMousedown);
    });

    const updateCheckerTexture = () => {
        const currentParams = JSON.parse(nodeElement.dataset.params);
        currentParams.color1 = nodeElement.querySelector('.color1-input').value;
        currentParams.color2 = nodeElement.querySelector('.color2-input').value;
        currentParams.scale = parseFloat(nodeElement.querySelector('.scale-input').value);
        nodeElement.dataset.params = JSON.stringify(currentParams);

        const newTexture = generateCheckerTexture(currentParams);
        if (nodeElement.nodeTexture) {
            nodeElement.nodeTexture.dispose();
        }
        nodeElement.nodeTexture = newTexture;

        shaderConnections.forEach(conn => {
            if (conn.outputPort === nodeElement.querySelector('.checker-texture-color-output') && conn.inputPort === principledBSDFBaseColorInputPort) {
                if (_onShaderMaterialTextureChangeCallback) {
                    _onShaderMaterialTextureChangeCallback(nodeElement.nodeTexture);
                }
            }
        });
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
    };

    nodeElement.querySelector('.color1-input').addEventListener('input', updateCheckerTexture);
    nodeElement.querySelector('.color2-input').addEventListener('input', updateCheckerTexture);
    nodeElement.querySelector('.scale-input').addEventListener('input', updateCheckerTexture);

    return nodeElement;
}

export function createGradientTextureNodeDOM(x, y) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('shader-node');
    nodeElement.dataset.nodeType = 'GradientTextureNode';
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;

    const defaultParams = {
        color1: "#ff0000",
        color2: "#0000ff",
        type: "linear"
    };
    nodeElement.dataset.params = JSON.stringify(defaultParams);

    nodeElement.innerHTML = `
        <div class="node-header">
            <span>Gradient Texture</span>
            <button class="node-delete-button" title="Delete Node">x</button>
        </div>
        <div class="node-content">
            <div class="node-input-row">
                <span class="node-port input-port vector-port"></span><label>Vector</label>
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Color1</label>
                <input type="color" class="node-input-field color1-input" value="${defaultParams.color1}">
            </div>
             <div class="node-input-row">
                <span class="node-port input-port" style="background-color: yellow;"></span><label>Color2</label>
                <input type="color" class="node-input-field color2-input" value="${defaultParams.color2}">
            </div>
            <div class="node-input-row">
                <label>Type</label>
                <select class="node-input-field gradient-type-select" style="width: auto;">
                    <option value="linear" selected>Linear</option>
                    <option value="radial">Radial</option>
                </select>
            </div>
            <div class="node-output-row">
                <label>Color</label><span class="node-port output-port gradient-texture-color-output" style="background-color: yellow;"></span>
            </div>
            <div class="node-output-row">
                <label>Fac</label><span class="node-port output-port" style="background-color: grey;"></span>
            </div>
        </div>
    `;

    setupNodeControls(nodeElement);
    nodeElement.nodeTexture = generateGradientTexture(defaultParams);

    nodeElement.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', handlePortMousedown);
    });

    const updateGradientTexture = () => {
        const currentParams = JSON.parse(nodeElement.dataset.params);
        currentParams.color1 = nodeElement.querySelector('.color1-input').value;
        currentParams.color2 = nodeElement.querySelector('.color2-input').value;
        currentParams.type = nodeElement.querySelector('.gradient-type-select').value;
        nodeElement.dataset.params = JSON.stringify(currentParams);

        const newTexture = generateGradientTexture(currentParams);
        if (nodeElement.nodeTexture) {
            nodeElement.nodeTexture.dispose();
        }
        nodeElement.nodeTexture = newTexture;

        shaderConnections.forEach(conn => {
            if (conn.outputPort === nodeElement.querySelector('.gradient-texture-color-output') && conn.inputPort === principledBSDFBaseColorInputPort) {
                if (_onShaderMaterialTextureChangeCallback) {
                    _onShaderMaterialTextureChangeCallback(nodeElement.nodeTexture);
                }
            }
        });
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
    };

    nodeElement.querySelector('.color1-input').addEventListener('input', updateGradientTexture);
    nodeElement.querySelector('.color2-input').addEventListener('input', updateGradientTexture);
    nodeElement.querySelector('.gradient-type-select').addEventListener('change', updateGradientTexture);

    return nodeElement;
}

export function createNoiseTextureNodeDOM(x, y) {
    const nodeElement = document.createElement('div');
    nodeElement.classList.add('shader-node');
    nodeElement.dataset.nodeType = 'NoiseTextureNode';
    nodeElement.style.left = `${x}px`;
    nodeElement.style.top = `${y}px`;

    const defaultParams = {
        scale: 5.0,
        detail: 2,
        roughness: 0.5,
        distortion: 0.0,
        seed: Math.random() * 1000,
    };
    nodeElement.dataset.params = JSON.stringify(defaultParams);

    nodeElement.innerHTML = `
        <div class="node-header">
            <span>Noise Texture</span>
            <button class="node-delete-button" title="Delete Node">x</button>
        </div>
        <div class="node-content">
            <div class="node-input-row">
                <span class="node-port input-port vector-port"></span><label>Vector</label>
            </div>
            <div class="node-input-row">
                <span class="node-port input-port" style="background-color: grey;"></span><label>Scale</label>
                <input type="number" class="node-input-field scale-input" min="0.1" step="0.1" value="${defaultParams.scale}">
            </div>
            <div class="node-input-row">
                <span class="node-port input-port" style="background-color: grey;"></span><label>Detail</label>
                <input type="number" class="node-input-field detail-input" min="0" max="10" step="1" value="${defaultParams.detail}">
            </div>
            <div class="node-input-row">
                <span class="node-port input-port" style="background-color: grey;"></span><label>Roughness</label>
                <input type="number" class="node-input-field roughness-input" min="0" max="1" step="0.05" value="${defaultParams.roughness}">
            </div>
            <div class="node-input-row">
                <span class="node-port input-port" style="background-color: grey;"></span><label>Distortion</label>
                <input type="number" class="node-input-field distortion-input" min="0" step="0.1" value="${defaultParams.distortion}">
            </div>
            <button class="randomize-noise-button" style="background-color: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8em; margin-top: 10px; width: 100%;">Randomize</button>
            <div class="node-output-row">
                <label>Color</label><span class="node-port output-port noise-texture-color-output" style="background-color: yellow;"></span>
            </div>
            <div class="node-output-row">
                <label>Fac</label><span class="node-port output-port" style="background-color: grey;"></span>
            </div>
        </div>
    `;

    setupNodeControls(nodeElement);
    nodeElement.nodeTexture = generateNoiseTexture(defaultParams);

    nodeElement.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', handlePortMousedown);
    });

    const updateNoiseTexture = () => {
        const currentParams = JSON.parse(nodeElement.dataset.params);
        currentParams.scale = parseFloat(nodeElement.querySelector('.scale-input').value);
        currentParams.detail = parseInt(nodeElement.querySelector('.detail-input').value, 10);
        currentParams.roughness = parseFloat(nodeElement.querySelector('.roughness-input').value);
        currentParams.distortion = parseFloat(nodeElement.querySelector('.distortion-input').value);
        nodeElement.dataset.params = JSON.stringify(currentParams);

        const newTexture = generateNoiseTexture(currentParams);
        if (nodeElement.nodeTexture) {
            nodeElement.nodeTexture.dispose();
        }
        nodeElement.nodeTexture = newTexture;

        shaderConnections.forEach(conn => {
            if (conn.outputPort === nodeElement.querySelector('.noise-texture-color-output') && conn.inputPort === principledBSDFBaseColorInputPort) {
                if (_onShaderMaterialTextureChangeCallback) {
                    _onShaderMaterialTextureChangeCallback(nodeElement.nodeTexture);
                }
            }
        });
        if (_updatePropertiesPanel && _selectedObjectRef()) {
            _updatePropertiesPanel(_selectedObjectRef());
        }
    };
    
    const randomizeNoiseTexture = () => {
         const currentParams = JSON.parse(nodeElement.dataset.params);
         currentParams.scale = parseFloat((Math.random() * 20 + 1).toFixed(1));
         currentParams.detail = Math.floor(Math.random() * 5) + 1;
         currentParams.roughness = parseFloat(Math.random().toFixed(2));
         currentParams.distortion = parseFloat((Math.random() * 2).toFixed(1));
         currentParams.seed = Math.random() * 1000;
         
         nodeElement.querySelector('.scale-input').value = currentParams.scale;
         nodeElement.querySelector('.detail-input').value = currentParams.detail;
         nodeElement.querySelector('.roughness-input').value = currentParams.roughness;
         nodeElement.querySelector('.distortion-input').value = currentParams.distortion;
         
         nodeElement.dataset.params = JSON.stringify(currentParams);
         updateNoiseTexture();
         _addMessageToChatHistory(_languageConfig[(_languageConfig.en ? 'en' : 'ja')].ui.randomizedNoiseTextureNode, 'ai');
         playSound("/screw_apply.mp3");
    };

    nodeElement.querySelector('.scale-input').addEventListener('input', updateNoiseTexture);
    nodeElement.querySelector('.detail-input').addEventListener('input', updateNoiseTexture);
    nodeElement.querySelector('.roughness-input').addEventListener('input', updateNoiseTexture);
    nodeElement.querySelector('.distortion-input').addEventListener('input', updateNoiseTexture);
    nodeElement.querySelector('.randomize-noise-button').addEventListener('click', randomizeNoiseTexture);

    return nodeElement;
}

function valueNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    const random = (ix, iy) => {
        let s = (ix * 12.9898 + iy * 78.233 + seed) * 43758.5453;
        return (s - Math.floor(s)) * 2.0 - 1.0; 
    };

    const v00 = random(ix, iy);
    const v10 = random(ix + 1, iy);
    const v01 = random(ix, iy + 1);
    const v11 = random(ix + 1, iy + 1);

    const sx = fx * fx * (3.0 - 2.0 * fx); 
    const sy = fy * fy * (3.0 - 2.0 * fy);

    const nx0 = v00 * (1.0 - sx) + v10 * sx;
    const nx1 = v01 * (1.0 - sx) + v11 * sx;

    return (nx0 * (1.0 - sy) + nx1 * sy);
}

function generateNoiseTexture(params) {
    const { scale, detail, roughness, distortion, resolution = 256, seed = 0 } = params;

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(resolution, resolution);
    const data = imageData.data;

    const lacunarity = 2.0;
    const gain = roughness; 

    for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
            let u = x / resolution;
            let v = y / resolution;

            let value = 0.0;
            let amplitude = 0.5;
            let frequency = scale;

            for (let i = 0; i < detail; i++) {
                const qx = u * frequency + value * distortion;
                const qy = v * frequency + value * distortion;

                value += amplitude * valueNoise(qx, qy, seed + i);
                amplitude *= gain;
                frequency *= lacunarity;
            }

            const color = Math.floor((value * 0.5 + 0.5) * 255);

            const index = (y * resolution + x) * 4;
            data[index] = color;
            data[index + 1] = color;
            data[index + 2] = color;
            data[index + 3] = 255; 
        }
    }

    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

export function updateUVEditor(selectedObject) {
    if (!uvRenderer || !uvCanvas) return; 

    const width = uvCanvas.clientWidth;
    const height = uvCanvas.clientHeight;

    if (width <= 0 || height <= 0) {
        return;
    }

    uvRenderer.setSize(width, height);

    const aspectRatio = width / height;

    const uvSpaceMinX = 0;
    const uvSpaceMaxX = 1;
    const uvSpaceMinY = 0;
    const uvSpaceMaxY = 1;
    const uvWidth = uvSpaceMaxX - uvSpaceMinX;
    const uvHeight = uvSpaceMaxY - uvSpaceMinY;

    const padding = 0.1;
    let frustumWidth = uvWidth * (1 + 2 * padding);
    let frustumHeight = uvHeight * (1 + 2 * padding);

    if (aspectRatio > (frustumWidth / frustumHeight)) {
        frustumWidth = frustumHeight * aspectRatio;
    } else {
        frustumHeight = frustumWidth / aspectRatio;
    }

    const centerU = uvSpaceMinX + uvWidth / 2;
    const centerV = uvSpaceMinY + uvHeight / 2;

    uvCamera.left = centerU - frustumWidth / 2;
    uvCamera.right = centerU + frustumWidth / 2;
    uvCamera.top = centerV + frustumHeight / 2;
    uvCamera.bottom = centerV - frustumHeight / 2;
    uvCamera.updateProjectionMatrix();

    if (uvWireframeMesh) {
        uvScene.remove(uvWireframeMesh);
        uvWireframeMesh.geometry.dispose();
        uvWireframeMesh = null;
    }

    if (selectedObject && selectedObject.geometry && selectedObject.geometry.attributes.uv) {
        const uvs = selectedObject.geometry.attributes.uv.array;
        const index = selectedObject.geometry.index;

        if (!index) {
             console.warn("UV Editor: Geometry does not have an index attribute, cannot draw UV wireframe from indices.");
        }

        const positions = [];
        const uniqueEdges = new Set();

        for (let i = 0; i < index.count; i += 3) {
            const i0 = index.getX(i);
            const i1 = index.getX(i + 1);
            const i2 = index.getX(i + 2);

            const uv0 = new THREE.Vector2(uvs[i0 * 2], uvs[i0 * 2 + 1]);
            const uv1 = new THREE.Vector2(uvs[i1 * 2], uvs[i1 * 2 + 1]);
            const uv2 = new THREE.Vector2(uvs[i2 * 2], uvs[i2 * 2 + 1]);

            const edges = [
                [uv0, uv1],
                [uv1, uv2],
                [uv2, uv0]
            ];

            edges.forEach(([pA, pB]) => {
                const sortedPoints = [pA, pB].sort((a, b) => a.x - b.x || a.y - b.y);
                const key = `${sortedPoints[0].x},${sortedPoints[0].y}-${sortedPoints[1].x},${sortedPoints[1].y}`;

                if (!uniqueEdges.has(key)) {
                    positions.push(pA.x, pA.y, 0, pB.x, pB.y, 0);
                    uniqueEdges.add(key);
                }
            });
        }

        const uvGeometry = new THREE.BufferGeometry();
        uvGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        uvWireframeMesh = new THREE.LineSegments(uvGeometry, new THREE.LineBasicMaterial({ color: 0xffff00 }));
        uvWireframeMesh.renderOrder = 1;
        uvScene.add(uvWireframeMesh);
    }
}

function animateUVEditor() {
    requestAnimationFrame(animateUVEditor);

    if (uvRenderer) {
        if (Math.abs(uvTargetZoom - uvCurrentZoom) > 0.001) {
            uvCurrentZoom += (uvTargetZoom - uvCurrentZoom) * uvZoomLerpFactor;
            uvCamera.zoom = uvCurrentZoom;
            uvCamera.updateProjectionMatrix();
        }
        uvRenderer.render(uvScene, uvCamera);
    }
}
animateUVEditor(); 

function deleteShaderNode(nodeElement) {
    if (!nodeElement) return;

    const headerSpan = nodeElement.querySelector('.node-header span');
    if (!headerSpan) {
        console.warn("Could not find header span in node to be deleted.");
        return;
    }
    const headerText = headerSpan.textContent.trim();
    if (headerText === 'Material Output') {
        _addMessageToChatHistory("Cannot delete the Material Output node.", 'ai');
        return;
    }

    const ports = Array.from(nodeElement.querySelectorAll('.node-port'));

    const connectionsToRemove = shaderConnections.filter(conn =>
        ports.includes(conn.inputPort) || ports.includes(conn.outputPort)
    );

    connectionsToRemove.forEach(conn => removePermanentConnection(conn));

    if (nodeElement.nodeTexture && nodeElement.nodeTexture.dispose) {
        nodeElement.nodeTexture.dispose();
    }

    nodeElement.remove();

    if (selectedShaderNode === nodeElement) {
        selectedShaderNode = null;
    }

    playSound("/screw_apply.mp3");
    _addMessageToChatHistory(`Deleted ${headerText} node.`, 'ai');
}

function generateCheckerTexture(params) {
    const { color1, color2, scale, resolution = 512 } = params;

    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    const ctx = canvas.getContext('2d');

    const checkerSize = resolution / scale;

    ctx.clearRect(0, 0, resolution, resolution);

    for (let y = 0; y < resolution; y += checkerSize) {
        for (let x = 0; x < resolution; x += checkerSize) {
            if ((Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0) {
                ctx.fillStyle = color1;
            } else {
                ctx.fillStyle = color2;
            }
            ctx.fillRect(x, y, checkerSize, checkerSize);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

function getRandomColorHex() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}