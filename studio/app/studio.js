/**
 * Studio — Slim 3D engine that mounts into the shell's #viewport.
 * Reuses logic from engine.js but without depending on old HTML layout/UIManager.
 * Feature pages interact via window.ProModelerApp.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

// ── Log helper ──
const log = (msg, type = 'info') => {
  console.log(`[Studio] ${msg}`);
  const el = document.getElementById('statusLeft');
  if (el) el.textContent = msg;
};

export class Studio {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.transformControls = null;
    this.objects = [];
    this.selectedObject = null;
    this.lights = [];
    this.animations = [];
    this.keyframes = new Map();
    this.currentFrame = 1;
    this.totalFrames = 250;
    this.isAnimationPlaying = false;
    this.animationSpeed = 1;
    this.loopAnimation = true;
    this.undoStack = [];
    this.redoStack = [];
    this._undoCapturePending = null;  // pre-drag state snapshot, null = no pending undo
    this._transformDragHappened = false;
    this.clipboardObject = null;
    this.viewMode = 'solid';
    this._lightHelpers = new Map();
    this._showLightHelpers = true;
    this.currentTool = 'select';

    this._initCore();
    this._finishInit();
  }

  _initCore() {
    const viewport = document.getElementById('viewport');
    if (!viewport) throw new Error('#viewport not found');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    this.camera = new THREE.PerspectiveCamera(75, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
    this.camera.position.set(5, 5, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    viewport.appendChild(this.renderer.domElement);
  }

  _finishInit() {
    const viewport = document.getElementById('viewport');

    // Orbit controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    this.controls.enableKeys = false;

    // Transform controls
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      // Drag START — capture pre-drag state (use a fresh snapshot that we'll push later)
      if (event.value) {
        this._undoCapturePending = {
          snapshot: this._captureState(),
          hadTransform: false,
        };
        this._transformDragHappened = false;
      }
      // Drag END — push the pre-drag snapshot if a transform actually occurred
      if (!event.value && this._undoCapturePending) {
        if (this._undoCapturePending.hadTransform || this._transformDragHappened) {
          this.redoStack = [];
          this.undoStack.push(this._undoCapturePending.snapshot);
          if (this.undoStack.length > 50) this.undoStack.shift();
          log('Transformed');
        }
        this._undoCapturePending = null;
        this._transformDragHappened = false;
      }
    });
    this.transformControls.addEventListener('objectChange', () => {
      // A transform actually happened during this drag
      if (this._undoCapturePending) {
        this._undoCapturePending.hadTransform = true;
      }
      this._transformDragHappened = true;
    });
    this.scene.add(this.transformControls);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
    this.scene.add(grid);

    // Ground plane — receives shadows, gives objects a surface to sit on
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    ground.name = '__ground';
    this.scene.add(ground);

    // Lights
    const ambient = new THREE.AmbientLight(0x404040, 0.4);
    this.scene.add(ambient);
    this.lights.push(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(512, 512);
    directional.name = 'Default Directional';
    this.scene.add(directional);
    this.lights.push(directional);

    const point = new THREE.PointLight(0x4a9eff, 0.5, 100);
    point.position.set(-5, 5, -5);
    point.name = 'Default Point';
    this.scene.add(point);
    this.lights.push(point);

    this._updateLightHelpers();

    // Default cube
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.1 });
    const cube = new THREE.Mesh(geo, mat);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.name = 'Cube';
    this.scene.add(cube);
    this.objects.push(cube);
    this.selectObject(cube);

    // Resize handler
    window.addEventListener('resize', () => {
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Click to select
    this.renderer.domElement.addEventListener('click', (e) => this._onClick(e));

    // Double-click to frame selected object
    this.renderer.domElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.frameSelected();
    });

    // Keyboard shortcuts (on document so they work when focus is in popups/sidebar)
    document.addEventListener('keydown', (e) => {
      // Ignore when typing in input/textarea/select elements
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      // Ctrl+Z → Undo
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }
      // Ctrl+Shift+Z or Ctrl+Y → Redo
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
        return;
      }
    });

    // Nav-cube overlay
    this._createNavCube();

    // Start loop
    this._animate();
  }

  _onClick(event) {
    if (this.transformControls.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const meshes = this.objects.filter(o => o.isMesh);
    const intersects = raycaster.intersectObjects(meshes, true);
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !this.objects.includes(obj)) obj = obj.parent;
      if (this.objects.includes(obj)) this.selectObject(obj);
    } else {
      this.selectObject(null);
    }
  }

  selectObject(object) {
    if (this.selectedObject && this.selectedObject !== object) {
      this._removeOutline(this.selectedObject);
    }
    this.selectedObject = object;
    if (object) {
      this._addOutline(object);
      this.transformControls.attach(object);
    } else {
      this.transformControls.detach();
    }
  }

  _addOutline(object) {
    this._removeOutline(object);
    if (object.isMesh && object.geometry) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x4a9eff, side: THREE.BackSide });
      const outline = new THREE.Mesh(object.geometry, mat);
      outline.scale.copy(object.scale).multiplyScalar(1.06);
      outline.name = '__outline';
      object.add(outline);
    } else {
      const box = new THREE.BoxHelper(object, 0x4a9eff);
      box.name = '__boxHelper';
      this.scene.add(box);
      object.userData.__boxHelper = box;
    }
  }

  _removeOutline(object) {
    if (!object) return;
    const o = object.getObjectByName('__outline');
    if (o) object.remove(o);
    if (object.userData.__boxHelper) {
      this.scene.remove(object.userData.__boxHelper);
      delete object.userData.__boxHelper;
    }
  }

  // ── Primitive creation ──
  addPrimitive(type) {
    this.pushUndo();
    let geom;
    const color = Math.random() * 0xffffff;
    switch (type) {
      case 'cube': geom = new THREE.BoxGeometry(1, 1, 1); break;
      case 'sphere': geom = new THREE.SphereGeometry(0.5, 32, 16); break;
      case 'cylinder': geom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
      case 'plane': geom = new THREE.PlaneGeometry(2, 2); break;
      case 'torus': geom = new THREE.TorusGeometry(0.5, 0.2, 16, 32); break;
      default: geom = new THREE.BoxGeometry(1, 1, 1);
    }
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 }));
    mesh.name = type.charAt(0).toUpperCase() + type.slice(1);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.objects.push(mesh);
    this.selectObject(mesh);
    log(`Added ${mesh.name}`);
  }

  addLight(type) {
    this.pushUndo();
    const light = type === 'point'
      ? new THREE.PointLight(0xffffff, 1, 100)
      : new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 5, 0);
    light.name = type + ' Light';
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    if (light.isDirectionalLight) {
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 50;
      light.shadow.camera.left = -10;
      light.shadow.camera.right = 10;
      light.shadow.camera.top = 10;
      light.shadow.camera.bottom = -10;
    }
    this.scene.add(light);
    this.lights.push(light);
    this._updateLightHelpers();
    log(`Added ${light.name}`);
  }

  removeLight(index) {
    if (index < 0 || index >= this.lights.length) return;
    this.pushUndo();
    const light = this.lights[index];
    if (light.parent) light.parent.remove(light);
    this.lights.splice(index, 1);
    this._updateLightHelpers();
    log('Light removed');
  }

  setLightIntensity(index, val) {
    if (index >= 0 && index < this.lights.length) {
      this.lights[index].intensity = val;
      this.render();
    }
  }

  setLightColor(index, hex) {
    if (index >= 0 && index < this.lights.length) {
      this.lights[index].color.set(hex);
      this.render();
    }
  }

  toggleLightShadow(index) {
    if (index >= 0 && index < this.lights.length) {
      const light = this.lights[index];
      if (typeof light.castShadow !== 'undefined') {
        this.pushUndo();
        light.castShadow = !light.castShadow;
        this.render();
        log(`Shadow ${light.castShadow ? 'ON' : 'OFF'} for ${light.name}`);
      }
    }
  }

  duplicateSelected() {
    if (!this.selectedObject) return;
    this.pushUndo();
    const clone = this.selectedObject.clone();
    clone.position.x += 1;
    this.scene.add(clone);
    this.objects.push(clone);
    this.selectObject(clone);
    log('Duplicated');
  }

  deleteSelected() {
    if (!this.selectedObject) return;
    this.pushUndo();
    this.scene.remove(this.selectedObject);
    this.objects = this.objects.filter(o => o !== this.selectedObject);
    this.transformControls.detach();
    this.selectedObject = null;
    log('Deleted');
  }

  setTransformMode(mode) {
    this.currentTool = mode;
    if (mode === 'move') this.transformControls.setMode('translate');
    else if (mode === 'rotate') this.transformControls.setMode('rotate');
    else if (mode === 'scale') this.transformControls.setMode('scale');
    else this.transformControls.detach();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.objects.forEach(o => { if (o.material) o.material.wireframe = mode === 'wireframe'; });
    this.render();
  }

  frameSelected() {
    if (!this.selectedObject) return;
    const box = new THREE.Box3().setFromObject(this.selectedObject);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(center).add(new THREE.Vector3(size, size, size));
    this.controls.target.copy(center);
    this.controls.update();
  }

  frameAll() {
    const box = new THREE.Box3();
    this.objects.forEach(o => box.expandByObject(o));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.camera.position.copy(center).add(new THREE.Vector3(size, size, size));
    this.controls.target.copy(center);
    this.controls.update();
  }

  setCameraView(view) {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const dirs = { front: [0,0,1], back: [0,0,-1], left: [-1,0,0], right: [1,0,0], top: [0,1,0], bottom: [0,-1,0] };
    if (dirs[view]) {
      const target = this.controls.target.clone();
      const pos = target.clone().add(new THREE.Vector3(...dirs[view]).multiplyScalar(dist));
      this.camera.position.copy(pos);
      this.camera.lookAt(target);
      this.controls.update();
    }
  }

  // ── Nav-Cube Overlay ──
  _createNavCube() {
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    // Container
    const container = document.createElement('div');
    container.id = 'navCube';
    container.style.cssText = 'position:absolute;bottom:12px;right:12px;width:72px;height:72px;pointer-events:none;z-index:10;';
    viewport.appendChild(container);

    // Inner rotating group
    const inner = document.createElement('div');
    inner.id = 'navCubeInner';
    inner.style.cssText = 'width:100%;height:100%;transform-style:preserve-3d;transition:transform .15s;';
    container.appendChild(inner);

    // Face labels on 3D cube
    const faces = [
      { label: 'F', dir: 'front',  color: '#4a9eff', transform: 'translateZ(36px)' },
      { label: 'B', dir: 'back',   color: '#e74c3c', transform: 'rotateY(180deg) translateZ(36px)' },
      { label: 'L', dir: 'left',   color: '#2ecc71', transform: 'rotateY(-90deg) translateZ(36px)' },
      { label: 'R', dir: 'right',  color: '#f39c12', transform: 'rotateY(90deg) translateZ(36px)' },
      { label: 'T', dir: 'top',    color: '#9b59b6', transform: 'rotateX(90deg) translateZ(36px)' },
      { label: 'Bo', dir: 'bottom', color: '#1abc9c', transform: 'rotateX(-90deg) translateZ(36px)' },
    ];

    faces.forEach(({ label, dir, color, transform }) => {
      const face = document.createElement('div');
      face.className = 'nav-face';
      face.textContent = label;
      face.style.cssText = `
        position:absolute;width:36px;height:36px;
        left:18px;top:18px;
        background:${color};
        color:#fff;font:bold 11px/36px sans-serif;text-align:center;
        border-radius:3px;
        backface-visibility:visible;
        transform:${transform};
        user-select:none;
      `;
      inner.appendChild(face);
    });

    // Also store the inner element for rotation updates
    this._navCubeInner = inner;
  }

  _updateNavCube() {
    if (!this._navCubeInner || !this.controls) return;
    const az = this.controls.getAzimuthalAngle();
    const pol = this.controls.getPolarAngle();
    const rx = THREE.MathUtils.radToDeg(pol - Math.PI / 2);
    const ry = THREE.MathUtils.radToDeg(-az);
    this._navCubeInner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // ── Light Helpers ──
  _updateLightHelpers() {
    // Remove old helpers
    this._lightHelpers.forEach(helper => {
      if (helper.parent) helper.parent.remove(helper);
      if (helper.dispose) helper.dispose();
    });
    this._lightHelpers.clear();

    if (!this._showLightHelpers) return;

    this.lights.forEach(light => {
      if (light.isAmbientLight) return; // no visual representation
      let helper;
      if (light.isDirectionalLight) {
        helper = new THREE.DirectionalLightHelper(light, 2);
      } else if (light.isPointLight) {
        helper = new THREE.PointLightHelper(light, 1);
      }
      if (helper) {
        this.scene.add(helper);
        this._lightHelpers.set(light.uuid, helper);
      }
    });
  }

  toggleLightHelpersVisible() {
    this._showLightHelpers = !this._showLightHelpers;
    if (this._showLightHelpers) {
      this._updateLightHelpers();
    } else {
      this._lightHelpers.forEach(helper => {
        if (helper.parent) helper.parent.remove(helper);
      });
      this._lightHelpers.clear();
    }
    log(`Light helpers ${this._showLightHelpers ? 'ON' : 'OFF'}`);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    if (this.isAnimationPlaying) this._tickAnimation();
    this.render();
    const fps = Math.round(1 / 0.016);
    const el = document.getElementById('statusRight');
    if (el) el.textContent = `FPS: ${fps} | Objects: ${this.objects.length}`;

    // Update nav-cube orientation
    this._updateNavCube();
  }

  // ── Animation ──
  addKeyframe() {
    if (!this.selectedObject) return;
    this.pushUndo();
    const id = this.selectedObject.uuid;
    if (!this.keyframes.has(id)) this.keyframes.set(id, []);
    this.keyframes.get(id).push({
      frame: this.currentFrame,
      position: this.selectedObject.position.clone(),
      rotation: this.selectedObject.rotation.clone(),
      scale: this.selectedObject.scale.clone(),
    });
    log(`Keyframe at ${this.currentFrame}`);
  }

  _applyKeyframesAtFrame(frame) {
    this.objects.forEach(obj => {
      if (!this.keyframes.has(obj.uuid)) return;
      const kfs = this.keyframes.get(obj.uuid).sort((a, b) => a.frame - b.frame);
      let prev, next;
      for (const k of kfs) {
        if (k.frame <= frame) prev = k;
        if (k.frame >= frame && !next) next = k;
      }
      if (prev && next) {
        const t = (frame - prev.frame) / (next.frame - prev.frame || 1);
        obj.position.lerpVectors(prev.position, next.position, t);
        obj.scale.lerpVectors(prev.scale, next.scale, t);
        obj.rotation.x = THREE.MathUtils.lerp(prev.rotation.x, next.rotation.x, t);
        obj.rotation.y = THREE.MathUtils.lerp(prev.rotation.y, next.rotation.y, t);
        obj.rotation.z = THREE.MathUtils.lerp(prev.rotation.z, next.rotation.z, t);
      } else if (prev) {
        obj.position.copy(prev.position);
        obj.scale.copy(prev.scale);
        obj.rotation.copy(prev.rotation);
      }
    });
  }

  setCurrentFrame(val) {
    this.currentFrame = Math.max(1, Math.min(Math.round(val), this.totalFrames));
    this._applyKeyframesAtFrame(this.currentFrame);
    this.render();
  }

  stepFrame(delta) {
    this.setCurrentFrame(this.currentFrame + delta);
  }

  playAnimation() { this.isAnimationPlaying = true; log('Play'); }
  pauseAnimation() { this.isAnimationPlaying = false; log('Pause'); }

  setAnimationSpeed(val) {
    this.animationSpeed = Math.max(0.1, Math.min(val, 10));
    log(`Speed: ${this.animationSpeed.toFixed(1)}x`);
  }

  toggleLoop() {
    this.loopAnimation = !this.loopAnimation;
    log(`Loop ${this.loopAnimation ? 'ON' : 'OFF'}`);
  }

  _tickAnimation() {
    const next = this.currentFrame + this.animationSpeed;
    if (next > this.totalFrames) {
      if (this.loopAnimation) {
        this.currentFrame = 1;
        this._applyKeyframesAtFrame(1);
      } else {
        this.currentFrame = this.totalFrames;
        this._applyKeyframesAtFrame(this.totalFrames);
        this.pauseAnimation();
      }
    } else {
      this.currentFrame = Math.round(next);
      this._applyKeyframesAtFrame(this.currentFrame);
    }

    // Live-update timeline UI if the Animate popup is open
    const scrubber = document.querySelector('#popupContent [data-key="timeline-scrub"] input');
    if (scrubber) {
      scrubber.value = this.currentFrame;
      const fl = document.querySelector('#popupContent [data-key="frame-label"] .ctrl-label');
      if (fl) {
        const totalKfs = Array.from(this.keyframes.values()).reduce((s, kfs) => s + kfs.length, 0);
        fl.textContent = `Frame ${this.currentFrame} / ${this.totalFrames}  ·  ${totalKfs} keyframes total`;
      }
    }
  }

  // ── Import/Export ──
  async importModel(source) {
    // Support multi-file packages: { url, files: { filename -> objectURL }, name }
    if (source && typeof source === 'object' && source.url && source.files) {
      return this._importGLTFMulti(source);
    }
    // Single File object
    if (source instanceof File) {
      const ext = source.name.toLowerCase().split('.').pop();
      if (ext === 'gltf' || ext === 'glb') return this._importGLTF(source);
      log(`Unsupported: .${ext}`, 'error');
      return;
    }
    // Single URL string
    if (typeof source === 'string') {
      return this._importGLTF(source);
    }
    log('Unrecognized import source', 'error');
  }

  /** Import a multi-file glTF package (.gltf + .bin + textures) */
  _importGLTFMulti(pkg) {
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
        this.frameSelected();
        this.pushUndo();
        log(`Imported ${nameHint} (${Object.keys(pkg.files).length} files)`);
        revokeAll();
        resolve(root);
      }, undefined, (err) => {
        log(`Import failed: ${err.message}`, 'error');
        revokeAll();
        reject(err);
      });
    });
  }

  _importGLTF(file) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      loader.setDRACOLoader(draco);

      const reader = new FileReader();
      reader.onload = (e) => {
        loader.parse(e.target.result, '', (gltf) => {
          const root = gltf.scene || gltf.scenes[0];
          root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
          root.name = file.name.replace(/\.[^/.]+$/, '');
          this.scene.add(root);
          this.objects.push(root);
          this.selectObject(root);
          this.frameSelected();
          this.pushUndo();
          log(`Imported ${file.name}`);
          resolve(root);
        }, reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  exportModel(format) {
    const obj = this.selectedObject || this.scene;
    if (format === 'glb') this._exportGLTF(obj, true);
    else if (format === 'gltf') this._exportGLTF(obj, false);
    else if (format === 'obj') this._exportOBJ(obj);
    else if (format === 'stl') this._exportSTL(obj);
  }

  _exportGLTF(object, binary) {
    const exporter = new GLTFExporter();
    exporter.parse(object, (result) => {
      const blob = new Blob([binary ? result : JSON.stringify(result)], { type: binary ? 'model/gltf-binary' : 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = binary ? 'export.glb' : 'export.gltf';
      a.click();
      log('Exported');
    }, { binary, onlyVisible: true });
  }

  _exportOBJ(object) {
    const exporter = new OBJExporter();
    const data = exporter.parse(object);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'text/plain' }));
    a.download = 'export.obj';
    a.click();
    log('Exported OBJ');
  }

  _exportSTL(object) {
    const exporter = new STLExporter();
    const data = exporter.parse(object);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/sla' }));
    a.download = 'export.stl';
    a.click();
    log('Exported STL');
  }

  // ── Undo / Redo ──
  _captureState() {
    return {
      objects: this.objects.map(obj => ({
        uuid: obj.uuid,
        name: obj.name,
        type: obj.type,
        isLight: !!obj.isLight,
        position: obj.position.toArray(),
        rotation: obj.rotation.toArray(),
        scale: obj.scale.toArray(),
        material: obj.material ? {
          color: obj.material.color.getHex(),
          metalness: obj.material.metalness,
          roughness: obj.material.roughness,
          transparent: obj.material.transparent,
          opacity: obj.material.opacity,
        } : null,
        geometryType: obj.geometry ? obj.geometry.type : null,
        castShadow: !!obj.castShadow,
        receiveShadow: !!obj.receiveShadow,
        children: obj.children.filter(c => c.name !== '__outline').map(c => ({
          uuid: c.uuid, name: c.name, type: c.type,
          position: c.position.toArray(), rotation: c.rotation.toArray(), scale: c.scale.toArray(),
        })),
      })),
      keyframes: Array.from(this.keyframes.entries()).map(([uuid, kfs]) => [
        uuid,
        kfs.map(kf => ({ frame: kf.frame, position: kf.position.toArray(), rotation: kf.rotation.toArray(), scale: kf.scale.toArray() }))
      ]),
      selectedUuid: this.selectedObject ? this.selectedObject.uuid : null,
    };
  }

  _restoreState(snapshot) {
    // Remove all current user objects from scene and clear tracked arrays
    this.transformControls.detach();
    this.objects.forEach(obj => {
      if (obj.parent) obj.parent.remove(obj);
    });
    this.objects = [];
    this.lights = [];  // will be repopulated by the restore loop below
    this.keyframes.clear();

    // Rebuild objects from snapshot
    snapshot.objects.forEach(data => {
      let obj;
      if (data.isLight) {
        // Reconstruct light
        if (data.type === 'DirectionalLight') obj = new THREE.DirectionalLight(0xffffff, 1);
        else if (data.type === 'PointLight') obj = new THREE.PointLight(0xffffff, 1, 100);
        else if (data.type === 'AmbientLight') obj = new THREE.AmbientLight(0xffffff, 0.4);
        else obj = new THREE.PointLight(0xffffff, 1, 100);
        this.lights.push(obj);
      } else if (data.type === 'Group') {
        // Reconstruct Group (imported models, etc.) — add children
        obj = new THREE.Group();
        (data.children || []).forEach(cdata => {
          const child = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, 0.5),
            new THREE.MeshStandardMaterial({ color: 0xcccccc })
          );
          child.name = cdata.name || 'Part';
          child.position.fromArray(cdata.position);
          child.rotation.fromArray(cdata.rotation);
          child.scale.fromArray(cdata.scale);
          child.castShadow = true;
          child.receiveShadow = true;
          obj.add(child);
        });
      } else {
        // Reconstruct mesh
        let geo;
        const gt = data.geometryType;
        if (gt === 'BoxGeometry') geo = new THREE.BoxGeometry(1, 1, 1);
        else if (gt === 'SphereGeometry') geo = new THREE.SphereGeometry(0.5, 32, 16);
        else if (gt === 'CylinderGeometry') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        else if (gt === 'PlaneGeometry') geo = new THREE.PlaneGeometry(2, 2);
        else if (gt === 'TorusGeometry') geo = new THREE.TorusGeometry(0.5, 0.2, 16, 32);
        else geo = new THREE.BoxGeometry(1, 1, 1);

        let mat;
        if (data.material) {
          mat = new THREE.MeshStandardMaterial({
            color: data.material.color,
            metalness: data.material.metalness,
            roughness: data.material.roughness,
            transparent: data.material.transparent,
            opacity: data.material.opacity,
          });
        } else {
          mat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        }

        obj = new THREE.Mesh(geo, mat);
        obj.castShadow = data.castShadow;
        obj.receiveShadow = data.receiveShadow;
      }

      obj.name = data.name;
      obj.position.fromArray(data.position);
      obj.rotation.fromArray(data.rotation);
      obj.scale.fromArray(data.scale);

      this.scene.add(obj);
      this.objects.push(obj);
    });

    // Restore keyframes
    snapshot.keyframes.forEach(([uuid, kfs]) => {
      this.keyframes.set(uuid, kfs.map(kf => ({
        frame: kf.frame,
        position: new THREE.Vector3().fromArray(kf.position),
        rotation: new THREE.Euler(kf.rotation[0], kf.rotation[1], kf.rotation[2]),
        scale: new THREE.Vector3().fromArray(kf.scale),
      })));
    });

    // Restore selection
    if (snapshot.selectedUuid) {
      const obj = this.objects.find(o => o.uuid === snapshot.selectedUuid);
      if (obj) this.selectObject(obj);
      else this.selectObject(null);
    } else {
      this.selectObject(null);
    }

    this.render();
    log('Undo/Redo restored');
  }

  pushUndo() {
    this.redoStack = [];
    this.undoStack.push(this._captureState());
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const current = this._captureState();
    this.redoStack.push(current);
    const prev = this.undoStack.pop();
    this._restoreState(prev);
    log('Undo');
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const current = this._captureState();
    this.undoStack.push(current);
    const next = this.redoStack.pop();
    this._restoreState(next);
    log('Redo');
  }

  // ── Snap / Mirror / etc ──
  snapToGrid() {
    if (!this.selectedObject) return;
    this.pushUndo();
    this.selectedObject.position.x = Math.round(this.selectedObject.position.x);
    this.selectedObject.position.y = Math.round(this.selectedObject.position.y);
    this.selectedObject.position.z = Math.round(this.selectedObject.position.z);
    log('Snapped to grid');
  }

  mirror(axis) {
    if (!this.selectedObject) return;
    this.pushUndo();
    this.selectedObject.scale[axis] *= -1;
    log(`Mirrored ${axis}`);
  }

  // ── Preset material ──
  applyMaterial(preset) {
    if (!this.selectedObject) return;
    this.pushUndo();
    const presets = {
      chrome: { color: 0xffffff, metalness: 1.0, roughness: 0.1 },
      gold: { color: 0xffd700, metalness: 1.0, roughness: 0.15 },
      plastic: { color: 0xff4444, metalness: 0.0, roughness: 0.5 },
      rubber: { color: 0x333333, metalness: 0.0, roughness: 0.9 },
      wood: { color: 0x8b4513, metalness: 0.0, roughness: 0.8 },
      glass: { color: 0xffffff, metalness: 0.0, roughness: 0.0, transparent: true, opacity: 0.6 },
    };
    const p = presets[preset];
    if (!p) return;
    const mat = new THREE.MeshStandardMaterial(p);
    if (this.selectedObject.material) {
      mat.color.copy(this.selectedObject.material.color);
      Object.assign(mat, p);
    }
    this.selectedObject.material = mat;
    mat.needsUpdate = true;
    log(`Applied ${preset}`);
  }

  saveProject() {
    const data = {
      objects: this.objects.map(o => ({
        name: o.name,
        position: o.position.toArray(),
        rotation: o.rotation.toArray(),
        scale: o.scale.toArray(),
        color: o.material?.color?.getHex() || 0xcccccc,
      }))
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'project.json';
    a.click();
    log('Project saved');
  }

  loadProject(data) {
    this.pushUndo();
    this.objects.forEach(o => this.scene.remove(o));
    this.objects = [];
    data.objects.forEach(d => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial({ color: d.color || 0xcccccc })
      );
      mesh.name = d.name;
      mesh.position.fromArray(d.position);
      mesh.rotation.fromArray(d.rotation.slice(0, 3));
      mesh.scale.fromArray(d.scale);
      this.scene.add(mesh);
      this.objects.push(mesh);
    });
    log('Project loaded');
  }

  newProject() {
    this.pushUndo();
    this.objects.forEach(o => this.scene.remove(o));
    this.objects = [];
    this.keyframes.clear();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.3, metalness: 0.1 });
    const cube = new THREE.Mesh(geo, mat);
    cube.castShadow = true;
    cube.receiveShadow = true;
    cube.name = 'Cube';
    this.scene.add(cube);
    this.objects.push(cube);
    this.selectObject(cube);
    log('New project');
  }
}
