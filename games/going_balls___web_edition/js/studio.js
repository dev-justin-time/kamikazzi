import * as THREE from 'three';

// ─── Studio: in-game item editor adapted from Scene.JS ModelEditor ───

let _studioActive = false;
let _studioScene = null;
let _studioCamera = null;
let _studioRenderer = null;
let _studioRaycaster = new THREE.Raycaster();
let _studioMouse = new THREE.Vector2();
let _selectedObject = null;
let _originalMaterials = new Map();
let _gridHelper = null;
let _gameRef = null;
let _orbitListenersBound = false;
let _studioAnimId = null;
let _studioOrbitAngle = 0;
let _studioOrbitPitch = 0.5;
let _studioOrbitDist = 20;
let _studioOrbiting = false;
let _studioOrbitLastX = 0;
let _studioOrbitLastY = 0;
let _orbitTarget = new THREE.Vector3(); // camera looks at this
let _hierarchyItems = []; // { name, mesh, uuid, type }

// ─── Named handlers to prevent duplicate bindings ───
function _onStudioMouseMove(e) {
    if (!_studioOrbiting) return;
    const dx = e.clientX - _studioOrbitLastX;
    const dy = e.clientY - _studioOrbitLastY;
    _studioOrbitAngle -= dx * 0.005;
    _studioOrbitPitch = Math.max(0.1, Math.min(1.4, _studioOrbitPitch + dy * 0.005));
    _studioOrbitLastX = e.clientX;
    _studioOrbitLastY = e.clientY;
}
function _onStudioMouseUp() { _studioOrbiting = false; }

/**
 * initStudio — called once from Game constructor.
 */
export function initStudio(game) {
    _gameRef = game;

    const gearBtn = document.getElementById('studio-gear-btn');
    if (gearBtn) {
        gearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_studioActive) {
                closeStudio();
            } else {
                openStudio();
            }
        });
    }

    const closeBtn = document.getElementById('studio-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeStudio());
    }

    // Escape to close
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _studioActive) closeStudio();
    });

    wireMaterialControls();
    wireTransformControls();
    wireUtilityButtons();
}

// ─── Open / Close ───

function openStudio() {
    if (!_gameRef || !_gameRef.scene) return;
    _studioActive = true;

    const overlay = document.getElementById('studio-overlay');
    if (overlay) overlay.classList.add('active');

    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    const viewport = document.getElementById('studio-viewport');
    if (!viewport) return;

    // First-time renderer setup
    if (!_studioRenderer) {
        _studioScene = new THREE.Scene();
        _studioScene.background = new THREE.Color(0x1a1a2e);

        _studioCamera = new THREE.PerspectiveCamera(60, viewport.clientWidth / viewport.clientHeight, 0.01, 2000);
        _studioCamera.position.set(0, 8, 15);

        _studioRenderer = new THREE.WebGLRenderer({ antialias: true });
        _studioRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
        _studioRenderer.shadowMap.enabled = true;
        _studioRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        viewport.appendChild(_studioRenderer.domElement);

        setupStudioOrbit(viewport);

        // Lighting
        _studioScene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        _studioScene.add(dirLight);
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight2.position.set(-5, 5, -5);
        _studioScene.add(dirLight2);

        // Ground grid
        _gridHelper = new THREE.GridHelper(200, 200, 0x444466, 0x222233);
        _studioScene.add(_gridHelper);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(200, 200),
            new THREE.MeshStandardMaterial({ color: 0x16213e, side: THREE.DoubleSide })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        ground.receiveShadow = true;
        ground.userData.__studioGround = true;
        _studioScene.add(ground);

        // Resize handler
        window.addEventListener('resize', _onStudioResize);
    }

    // Resize viewport to fill available space
    _onStudioResize();

    // Clone and re-center game objects
    populateStudioScene();

    // Build hierarchy browser
    buildHierarchyPanel();

    // Start render loop
    _studioAnimId = requestAnimationFrame(studioAnimate);
}

function closeStudio() {
    _studioActive = false;
    if (_studioAnimId) cancelAnimationFrame(_studioAnimId);
    const overlay = document.getElementById('studio-overlay');
    if (overlay) overlay.classList.remove('active');
    selectStudioObject(null);
}

function _onStudioResize() {
    if (!_studioRenderer || !_studioCamera) return;
    const viewport = document.getElementById('studio-viewport');
    if (!viewport) return;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (w === 0 || h === 0) return;
    _studioCamera.aspect = w / h;
    _studioCamera.updateProjectionMatrix();
    _studioRenderer.setSize(w, h);
}

// ─── Orbit ───

function setupStudioOrbit(viewport) {
    viewport.addEventListener('mousedown', (e) => {
        if (e.target === _studioRenderer?.domElement) {
            if (e.button === 2 || e.button === 0) {
                _studioOrbiting = true;
                _studioOrbitLastX = e.clientX;
                _studioOrbitLastY = e.clientY;
            }
        }
    });
    viewport.addEventListener('contextmenu', (e) => e.preventDefault());

    if (!_orbitListenersBound) {
        window.addEventListener('mousemove', _onStudioMouseMove);
        window.addEventListener('mouseup', _onStudioMouseUp);
        _orbitListenersBound = true;
    }

    viewport.addEventListener('wheel', (e) => {
        _studioOrbitDist = Math.max(1, Math.min(500, _studioOrbitDist + e.deltaY * 0.05));
    }, { passive: true });

    // Click to select
    viewport.addEventListener('click', (e) => {
        if (!_studioRenderer || !_studioCamera) return;
        const rect = _studioRenderer.domElement.getBoundingClientRect();
        _studioMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _studioMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        _studioRaycaster.setFromCamera(_studioMouse, _studioCamera);
        const meshes = [];
        _studioScene.traverse((child) => {
            if (child.isMesh && child !== _gridHelper && !child.userData.__studioGround) {
                meshes.push(child);
            }
        });
        const hits = _studioRaycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
            selectStudioObject(hits[0].object);
        } else {
            selectStudioObject(null);
        }
    });
}

// ─── Populate scene with re-centered clones ───

function populateStudioScene() {
    // Clear previous clones
    const toRemove = [];
    _studioScene.traverse((child) => {
        if (child.userData.__studioClone) toRemove.push(child);
    });
    toRemove.forEach(c => {
        _studioScene.remove(c);
        if (c.geometry) c.geometry.dispose();
    });

    _originalMaterials.clear();
    _hierarchyItems = [];

    if (!_gameRef) return;

    let index = 0;

    // --- Clone ball ---
    if (_gameRef.ballMesh) {
        const ballGroup = new THREE.Group();
        ballGroup.name = 'Ball (Wolf)';
        ballGroup.userData.__studioClone = true;
        ballGroup.userData.__studioType = 'ball';
        ballGroup.userData.__studioIndex = index++;

        _gameRef.ballMesh.traverse((child) => {
            if (child.isMesh) {
                const clone = child.clone();
                clone.material = clone.material ? clone.material.clone() : new THREE.MeshPhongMaterial({ color: 0x888888 });
                clone.material.needsUpdate = true;
                _originalMaterials.set(clone.uuid, clone.material.clone());
                clone.userData.__studioClone = true;
                clone.userData.__studioType = 'ball_part';
                ballGroup.add(clone);
            }
        });

        // If wolf model didn't load, just show the fallback sphere
        if (ballGroup.children.length === 0) {
            const geo = new THREE.SphereGeometry(0.5, 24, 24);
            const mat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 });
            const sphere = new THREE.Mesh(geo, mat);
            sphere.userData.__studioClone = true;
            sphere.userData.__studioType = 'ball_part';
            _originalMaterials.set(sphere.uuid, mat.clone());
            ballGroup.add(sphere);
        }

        ballGroup.position.set(0, 1, 0);
        _studioScene.add(ballGroup);
        _hierarchyItems.push({ name: 'Ball (Wolf)', mesh: ballGroup, uuid: ballGroup.uuid, type: 'ball' });
    }

    // --- Clone level objects (platforms, walls, etc.) ---
    _gameRef.levelObjects.forEach((obj, i) => {
        if (!obj.mesh) return;
        const clone = obj.mesh.clone();
        clone.userData.__studioClone = true;
        clone.userData.__studioType = 'level';
        clone.userData.__studioIndex = index++;

        // Properly clone materials (the originals share references to sharedMaterials)
        clone.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material ? child.material.clone() : new THREE.MeshPhongMaterial({ color: 0x888888 });
                child.material.needsUpdate = true;
                _originalMaterials.set(child.uuid, child.material.clone());
                child.userData.__studioClone = true;
                child.userData.__studioType = 'level_part';
            }
        });

        // Copy world transform from game scene
        clone.position.copy(obj.mesh.position);
        clone.quaternion.copy(obj.mesh.quaternion);
        clone.scale.copy(obj.mesh.scale);

        _studioScene.add(clone);

        const typeLabel = obj.body ? 'Platform' : 'Visual';
        _hierarchyItems.push({
            name: `${typeLabel} #${i + 1}`,
            mesh: clone,
            uuid: clone.uuid,
            type: typeLabel.toLowerCase()
        });
    });

    // --- Clone pendulums ---
    _gameRef.pendulums.forEach((p, i) => {
        if (p.mesh) {
            const clone = p.mesh.clone();
            clone.position.copy(p.mesh.position);
            clone.material = clone.material ? clone.material.clone() : new THREE.MeshPhongMaterial({ color: 0xaa0000 });
            clone.material.needsUpdate = true;
            clone.userData.__studioClone = true;
            clone.userData.__studioType = 'hazard';
            _originalMaterials.set(clone.uuid, clone.material.clone());
            _studioScene.add(clone);
            _hierarchyItems.push({ name: `Pendulum #${i + 1}`, mesh: clone, uuid: clone.uuid, type: 'hazard' });
        }
    });

    // --- Clone spinners ---
    _gameRef.spinners.forEach((s, i) => {
        if (s.mesh) {
            const clone = s.mesh.clone();
            clone.position.copy(s.mesh.position);
            clone.quaternion.copy(s.mesh.quaternion);
            clone.material = clone.material ? clone.material.clone() : new THREE.MeshPhongMaterial({ color: 0x0000ff });
            clone.material.needsUpdate = true;
            clone.userData.__studioClone = true;
            clone.userData.__studioType = 'hazard';
            _originalMaterials.set(clone.uuid, clone.material.clone());
            _studioScene.add(clone);
            _hierarchyItems.push({ name: `Spinner #${i + 1}`, mesh: clone, uuid: clone.uuid, type: 'hazard' });
        }
    });

    // --- Clone movers ---
    _gameRef.movers.forEach((m, i) => {
        if (m.mesh) {
            const clone = m.mesh.clone();
            clone.position.copy(m.mesh.position);
            clone.quaternion.copy(m.mesh.quaternion);
            clone.material = clone.material ? clone.material.clone() : new THREE.MeshPhongMaterial({ color: 0x0000ff });
            clone.material.needsUpdate = true;
            clone.userData.__studioClone = true;
            clone.userData.__studioType = 'hazard';
            _originalMaterials.set(clone.uuid, clone.material.clone());
            _studioScene.add(clone);
            _hierarchyItems.push({ name: `Mover #${i + 1}`, mesh: clone, uuid: clone.uuid, type: 'mover' });
        }
    });

    // --- Clone coins (limit to 50 for performance) ---
    const coinSample = _gameRef.coins.filter(c => c.visible).slice(0, 50);
    coinSample.forEach((coin, i) => {
        const clone = coin.clone();
        clone.position.copy(coin.position);
        clone.material = clone.material ? clone.material.clone() : new THREE.MeshPhongMaterial({ color: 0xffd700 });
        clone.material.needsUpdate = true;
        clone.userData.__studioClone = true;
        clone.userData.__studioType = 'coin';
        _originalMaterials.set(clone.uuid, clone.material.clone());
        _studioScene.add(clone);
        if (i < 5) {
            _hierarchyItems.push({ name: `Coin #${i + 1}`, mesh: clone, uuid: clone.uuid, type: 'coin' });
        }
    });
    if (coinSample.length > 5) {
        _hierarchyItems.push({ name: `... +${coinSample.length - 5} more coins`, mesh: null, uuid: null, type: 'info' });
    }

    // --- Compute bounding box from clones only (setFromObject filter not supported in r160) ---
    const box = new THREE.Box3();
    let hasContent = false;
    _studioScene.traverse((child) => {
        if (child.userData.__studioClone && !(child.parent?.userData?.__studioClone)) {
            const childBox = new THREE.Box3().setFromObject(child);
            if (!hasContent) {
                box.copy(childBox);
                hasContent = true;
            } else {
                box.union(childBox);
            }
        }
    });
    if (!hasContent) {
        // Fallback: nothing to frame
        _orbitTarget.set(0, 0, 0);
        _studioOrbitDist = 20;
        return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    // Move all clones so center is at origin
    _studioScene.traverse((child) => {
        if (child.userData.__studioClone && !child.parent?.userData?.__studioClone) {
            child.position.sub(center);
        }
    });

    // Position grid and ground at re-centered origin
    if (_gridHelper) _gridHelper.position.set(0, -0.5, 0);

    // Set orbit target and distance to frame the scene
    _orbitTarget.set(0, 0, 0);
    _studioOrbitDist = Math.max(maxDim * 0.8, 5);
    _studioOrbitAngle = 0;
    _studioOrbitPitch = 0.5;
}

// ─── Hierarchy panel ───

function buildHierarchyPanel() {
    const container = document.getElementById('studio-hierarchy');
    if (!container) return;
    container.innerHTML = '';

    // Group by type
    const groups = {};
    _hierarchyItems.forEach(item => {
        const group = item.type || 'other';
        if (!groups[group]) groups[group] = [];
        groups[group].push(item);
    });

    Object.keys(groups).sort().forEach(groupName => {
        const header = document.createElement('div');
        header.className = 'studio-hierarchy-group';
        header.textContent = groupName.toUpperCase() + ' (' + groups[groupName].length + ')';
        container.appendChild(header);

        groups[groupName].forEach(item => {
            if (!item.mesh) return; // skip info items
            const el = document.createElement('div');
            el.className = 'studio-hierarchy-item';
            el.textContent = item.name;
            el.dataset.uuid = item.uuid;
            el.addEventListener('click', () => {
                selectStudioObject(item.mesh);
                // Highlight in hierarchy
                container.querySelectorAll('.studio-hierarchy-item').forEach(e => e.classList.remove('selected'));
                el.classList.add('selected');
                // Orbit to the selected object
                if (item.mesh.position) {
                    _orbitTarget.copy(item.mesh.position);
                }
            });
            container.appendChild(el);
        });
    });

    if (_hierarchyItems.length === 0) {
        container.innerHTML = '<p style="color:#666;font-size:12px;padding:8px;">No objects in scene. Start a level first.</p>';
    }
}

// ─── Animation loop ───

function studioAnimate() {
    if (!_studioActive) return;
    _studioAnimId = requestAnimationFrame(studioAnimate);

    if (_studioRenderer && _studioScene && _studioCamera) {
        const x = _orbitTarget.x + Math.sin(_studioOrbitAngle) * Math.cos(_studioOrbitPitch) * _studioOrbitDist;
        const y = _orbitTarget.y + Math.sin(_studioOrbitPitch) * _studioOrbitDist;
        const z = _orbitTarget.z + Math.cos(_studioOrbitAngle) * Math.cos(_studioOrbitPitch) * _studioOrbitDist;
        _studioCamera.position.set(x, y, z);
        _studioCamera.lookAt(_orbitTarget);

        _studioRenderer.render(_studioScene, _studioCamera);
    }

    if (_selectedObject) {
        updateTransformReadout();
    }
}

// ─── Object selection ───

function selectStudioObject(mesh) {
    // Deselect previous
    if (_selectedObject) {
        _selectedObject.traverse?.((child) => {
            if (child.isMesh && child.material?.emissive) {
                child.material.emissive.setHex(child.userData.__origEmissive || 0x000000);
            }
        });
        if (_selectedObject.isMesh && _selectedObject.material?.emissive) {
            _selectedObject.material.emissive.setHex(_selectedObject.userData.__origEmissive || 0x000000);
        }
    }

    _selectedObject = mesh;

    // Highlight new selection
    if (mesh) {
        mesh.traverse?.((child) => {
            if (child.isMesh && child.material?.emissive) {
                child.userData.__origEmissive = child.material.emissive.getHex();
                child.material.emissive.setHex(0x333333);
            }
        });
        if (mesh.isMesh && mesh.material?.emissive) {
            mesh.userData.__origEmissive = mesh.material.emissive.getHex();
            mesh.material.emissive.setHex(0x333333);
        }
    }

    // For groups (like Ball Wolf), find first mesh child for material editing
    let editTarget = mesh;
    if (mesh && mesh.isGroup) {
        mesh.traverse((child) => {
            if (child.isMesh && !editTarget) editTarget = child;
        });
        if (editTarget === mesh) {
            // Find first mesh child
            mesh.traverse((child) => {
                if (child.isMesh) editTarget = child;
            });
        }
    }

    updateMaterialControlsUI(editTarget);
    updateTransformReadout();

    const nameEl = document.getElementById('studio-selected-name');
    if (nameEl) {
        nameEl.textContent = mesh ? (mesh.name || 'Unnamed Object') : 'None';
    }

    // Update hierarchy highlight
    const hierContainer = document.getElementById('studio-hierarchy');
    if (hierContainer) {
        hierContainer.querySelectorAll('.studio-hierarchy-item').forEach(el => {
            el.classList.toggle('selected', mesh && el.dataset.uuid === mesh.uuid);
        });
    }
}

// ─── Material controls ───

function wireMaterialControls() {
    const bind = (id, prop, isColor) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            if (!_selectedObject) return;
            // Find the actual mesh to edit
            let target = _selectedObject;
            if (target.isGroup) {
                target = null;
                _selectedObject.traverse((child) => { if (child.isMesh && !target) target = child; });
            }
            if (!target || !target.material) return;
            const val = isColor ? el.value : parseFloat(el.value);
            if (prop === 'emissive' && target.material.emissive) {
                target.material.emissive.set(val);
            } else if (target.material[prop] !== undefined) {
                if (prop === 'color' || prop === 'emissive') {
                    target.material[prop].set(val);
                } else {
                    target.material[prop] = val;
                }
            }
            if (prop === 'opacity') {
                target.material.transparent = val < 1;
                target.material.needsUpdate = true;
            }
        });
    };

    bind('studio-mat-color', 'color', true);
    bind('studio-mat-opacity', 'opacity', false);
    bind('studio-mat-metalness', 'metalness', false);
    bind('studio-mat-roughness', 'roughness', false);
    bind('studio-mat-emissive', 'emissive', true);

    const wireEl = document.getElementById('studio-mat-wireframe');
    if (wireEl) {
        wireEl.addEventListener('change', () => {
            if (!_selectedObject) return;
            let target = _selectedObject;
            if (target.isGroup) {
                target.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material.wireframe = wireEl.checked;
                        child.material.needsUpdate = true;
                    }
                });
            } else if (target.material) {
                target.material.wireframe = wireEl.checked;
                target.material.needsUpdate = true;
            }
        });
    }
}

function updateMaterialControlsUI(mesh) {
    const panel = document.getElementById('studio-material-panel');
    if (!panel) return;

    // Unwrap groups to get actual mesh
    let mat = null;
    if (mesh && mesh.material) {
        mat = mesh.material;
    } else if (mesh && mesh.isGroup) {
        mesh.traverse((child) => {
            if (child.isMesh && child.material && !mat) mat = child.material;
        });
    }

    if (!mat) {
        panel.classList.remove('active');
        return;
    }

    panel.classList.add('active');

    const colorEl = document.getElementById('studio-mat-color');
    if (colorEl && mat.color) colorEl.value = '#' + mat.color.getHexString();

    const opacityEl = document.getElementById('studio-mat-opacity');
    if (opacityEl) opacityEl.value = mat.opacity !== undefined ? mat.opacity : 1;

    const metalEl = document.getElementById('studio-mat-metalness');
    if (metalEl) metalEl.value = mat.metalness !== undefined ? mat.metalness : 0;

    const roughEl = document.getElementById('studio-mat-roughness');
    if (roughEl) roughEl.value = mat.roughness !== undefined ? mat.roughness : 0.5;

    const emissiveEl = document.getElementById('studio-mat-emissive');
    if (emissiveEl && mat.emissive) emissiveEl.value = '#' + mat.emissive.getHexString();

    const wireEl = document.getElementById('studio-mat-wireframe');
    if (wireEl) wireEl.checked = mat.wireframe || false;
}

// ─── Transform controls ───

function wireTransformControls() {
    const axes = ['x', 'y', 'z'];
    const props = ['position', 'rotation', 'scale'];

    props.forEach((prop) => {
        axes.forEach((axis) => {
            const input = document.getElementById(`studio-${prop.slice(0, 3)}-${axis}`);
            if (!input) return;
            input.addEventListener('input', () => {
                if (!_selectedObject) return;
                const val = parseFloat(input.value) || 0;
                if (prop === 'rotation') {
                    _selectedObject.rotation[axis] = THREE.MathUtils.degToRad(val);
                } else {
                    _selectedObject[prop][axis] = val;
                }
            });
        });
    });
}

function updateTransformReadout() {
    if (!_selectedObject) return;
    const target = _selectedObject.isGroup ? _selectedObject : _selectedObject;
    const props = [
        { id: 'studio-pos', obj: target.position, toStr: (v) => v.toFixed(1) },
        { id: 'studio-rot', obj: target.rotation, toStr: (v) => THREE.MathUtils.radToDeg(v).toFixed(0) },
        { id: 'studio-scl', obj: target.scale, toStr: (v) => v.toFixed(2) }
    ];
    props.forEach(({ id, obj, toStr }) => {
        ['x', 'y', 'z'].forEach((axis) => {
            const el = document.getElementById(`${id}-${axis}`);
            if (el && !el.matches(':focus')) el.value = toStr(obj[axis]);
        });
    });
}

// ─── Utility buttons ───

function wireUtilityButtons() {
    // Wireframe all
    const wireAll = document.getElementById('studio-wireframe-all');
    if (wireAll) {
        wireAll.addEventListener('change', () => {
            if (!_studioScene) return;
            _studioScene.traverse((child) => {
                if (child.isMesh && child.material && !child.userData.__studioGround) {
                    child.material.wireframe = wireAll.checked;
                    child.material.needsUpdate = true;
                }
            });
        });
    }

    // Reset selection
    const resetBtn = document.getElementById('studio-reset-selection');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (!_selectedObject) return;
            const targets = [];
            if (_selectedObject.isGroup) {
                _selectedObject.traverse((child) => { if (child.isMesh) targets.push(child); });
            } else {
                targets.push(_selectedObject);
            }
            targets.forEach(t => {
                const orig = _originalMaterials.get(t.uuid);
                if (orig && t.material) {
                    t.material.copy(orig);
                    t.material.needsUpdate = true;
                }
            });
            updateMaterialControlsUI(_selectedObject);
        });
    }

    // Reset all
    const resetAll = document.getElementById('studio-reset-all');
    if (resetAll) {
        resetAll.addEventListener('click', () => {
            _studioScene.traverse((child) => {
                if (child.userData.__studioClone && child.material) {
                    const orig = _originalMaterials.get(child.uuid);
                    if (orig) {
                        child.material.copy(orig);
                        child.material.needsUpdate = true;
                    }
                }
            });
            selectStudioObject(null);
        });
    }

    // Texture upload
    const texUpload = document.getElementById('studio-texture-upload');
    if (texUpload) {
        texUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file || !_selectedObject) return;

            let target = _selectedObject;
            if (target.isGroup) {
                target.traverse((child) => { if (child.isMesh) target = child; });
            }
            if (!target || !target.material) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const texture = new THREE.Texture(img);
                    texture.needsUpdate = true;
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    const newMat = target.material.clone();
                    if (!newMat.color) newMat.color = new THREE.Color(0xffffff);
                    newMat.map = texture;
                    newMat.needsUpdate = true;
                    target.material = newMat;
                    _originalMaterials.set(target.uuid, newMat.clone());
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            texUpload.value = '';
        });
    }

    // Export screenshot
    const exportBtn = document.getElementById('studio-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!_studioRenderer || !_studioScene || !_studioCamera) return;
            _studioRenderer.render(_studioScene, _studioCamera);
            const link = document.createElement('a');
            link.download = 'studio_export.png';
            link.href = _studioRenderer.domElement.toDataURL();
            link.click();
        });
    }
}

/**
 * isStudioActive — returns true if the studio overlay is open.
 */
export function isStudioActive() {
    return _studioActive;
}
