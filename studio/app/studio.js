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
    this.isPaintMode = false;
    this.isRecording = false;
    this._paintColor = '#ff4444';
    this._paintSize = 0.5;
    this._paintOpacity = 1;
    this._paintHardness = 1;
    this._currentEasing = 'linear';
    this._gridSnapEnabled = true;
    this._gizmoSize = 1;
    this._lastFrameTime = performance.now();
    this._frameDeltas = [];
    this._showProfiler = true;
    this._easingFunctions = {
      linear: t => t,
      'ease-in': t => t * t,
      'ease-out': t => 1 - (1 - t) * (1 - t),
      'ease-in-out': t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
      bounce: t => { const n1 = 7.5625, d1 = 2.75; return t < 1/d1 ? n1*t*t : t < 2/d1 ? n1*(t-=1.5/d1)*t+0.75 : t < 2.5/d1 ? n1*(t-=2.25/d1)*t+0.9375 : n1*(t-=2.625/d1)*t+0.984375; },
      elastic: t => t === 0 || t === 1 ? t : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3),
    };

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
    // Paint mode click (separate handler, takes priority when paint mode is active)
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (!this.isPaintMode) return;
      e.stopPropagation();
      this._paintClickHandler(e);
    });

    // Click to select (ignored in paint mode)
    this.renderer.domElement.addEventListener('click', (e) => {
      if (this.isPaintMode) return;
      this._onClick(e);
    });

    // Double-click to frame selected object
    this.renderer.domElement.addEventListener('dblclick', (e) => {
      if (this.isPaintMode) return;
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
    // Profiler overlay
    this._createProfiler();

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

  // ── Profiler Overlay ──
  _createProfiler() {
    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    const el = document.createElement('div');
    el.id = 'profiler';
    el.style.cssText = 'position:absolute;top:6px;left:6px;z-index:10;font:11px/1.4 monospace;color:#0f0;pointer-events:none;user-select:none;text-shadow:0 0 4px rgba(0,0,0,0.8),0 0 2px #000;background:rgba(0,0,0,0.35);padding:4px 8px;border-radius:4px;white-space:pre;';
    el.textContent = 'FPS: --\nDraw: --\nTri: --';
    viewport.appendChild(el);
    this._profilerEl = el;
  }

  _updateProfiler() {
    if (!this._showProfiler || !this._profilerEl) { this._profilerEl && (this._profilerEl.style.display = 'none'); return; }
    this._profilerEl.style.display = '';

    const info = this.renderer.info;
    const avgDelta = this._frameDeltas.length > 0
      ? this._frameDeltas.reduce((s, d) => s + d, 0) / this._frameDeltas.length
      : 16.67;
    const fps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 60;

    this._profilerEl.textContent =
      `FPS:  ${fps}` +
      `\nDraw: ${info.render?.calls ?? 0}` +
      `\nTri:  ${((info.render?.triangles ?? 0) / 1000).toFixed(1)}K`;
  }

  toggleProfiler() {
    this._showProfiler = !this._showProfiler;
    log(`Profiler overlay ${this._showProfiler ? 'ON' : 'OFF'}`);
  }

  /** Run a stress-test benchmark: duplicate selected object `count` times in RAF batches,
   *  record the performance curve, and download the results. Cleans up after itself. */
  runBenchmark(count = 100) {
    if (!this.selectedObject || !this.selectedObject.isMesh) {
      log('Select a mesh object to benchmark', 'error');
      return;
    }
    if (this._benchmarkRunning) {
      log('Benchmark already running', 'error');
      return;
    }

    const template = this.selectedObject;
    const origName = template.name;
    const batchSize = 10;
    const totalBatches = Math.ceil(count / batchSize);
    let batchesDone = 0;
    let totalAdded = 0;
    const created = [];
    const curve = [];
    this._benchmarkRunning = true;

    // Detach transform controls during benchmark to avoid interference
    this.transformControls.detach();
    this._wasPlaying = this.isAnimationPlaying;
    this.isAnimationPlaying = false;

    log(`Benchmark: duplicating "${origName}" × ${count} (${batchSize}/frame, ${totalBatches} batches)`);

    // ── Record a data point ──
    const record = () => {
      const info = this.renderer.info;
      const avgDelta = this._frameDeltas.length > 0
        ? this._frameDeltas.reduce((s, d) => s + d, 0) / this._frameDeltas.length
        : 16.67;
      curve.push({
        objects: this.objects.length,
        added: totalAdded,
        fps: avgDelta > 0 ? Math.round(1000 / avgDelta) : 60,
        frameTimeMs: Math.round(avgDelta * 10) / 10,
        drawCalls: info.render?.calls ?? 0,
        triangles: info.render?.triangles ?? 0,
        geometries: info.memory?.geometries ?? 0,
      });
    };

    // ── Record baseline ──
    // Wait 2 frames for the renderer to settle before recording baseline
    let settleFrames = 2;

    const tick = () => {
      if (settleFrames > 0) {
        settleFrames--;
        requestAnimationFrame(tick);
        return;
      }

      if (batchesDone === 0) {
        // Record baseline BEFORE adding anything
        record();
      }

      if (batchesDone >= totalBatches) {
        // Benchmark complete — download curve and clean up
        this._benchmarkRunning = false;
        this.isAnimationPlaying = this._wasPlaying;

        // Clean up: remove all created objects
        created.forEach(obj => {
          this.scene.remove(obj);
          this.objects = this.objects.filter(o => o !== obj);
        });

        // Re-select the original template
        this.selectObject(template);

        // Update benchmark info in the popup if open
        const benchInfo = document.getElementById('bench-result');
        if (benchInfo && curve.length >= 2) {
          const start = curve[0];
          const end = curve[curve.length - 1];
          benchInfo.textContent = `✔ Done: ${count} objects. FPS ${start.fps} → ${end.fps}  ·  Draw ${start.drawCalls} → ${end.drawCalls}  ·  File saved.`;
          benchInfo.style.color = '#4ade80';
        }

        // Download the curve
        const snapshot = {
          timestamp: new Date().toISOString(),
          config: { template: origName, count, batchSize, batches: totalBatches },
          curve,
        };
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `benchmark_${origName}_${date}.json`;
        a.click();
        URL.revokeObjectURL(a.href);

        const start = curve[0];
        const end = curve[curve.length - 1];
        log(`Benchmark done: ${count} objects added. FPS ${start.fps} → ${end.fps}, Draw ${start.drawCalls} → ${end.drawCalls}`);
        return;
      }

      // Add a batch of objects
      for (let i = 0; i < batchSize && totalAdded < count; i++) {
        const clone = template.clone();
        // Scatter them in a grid pattern so they don't overlap
        const row = Math.floor(totalAdded / 10);
        const col = totalAdded % 10;
        clone.position.x = (col - 4.5) * 1.5;
        clone.position.z = (row - 5) * 1.5;
        clone.name = template.name + '_bench_' + totalAdded;
        this.scene.add(clone);
        this.objects.push(clone);
        created.push(clone);
        totalAdded++;
      }

      batchesDone++;

      // Record after this batch (using next frame's render)
      requestAnimationFrame(() => {
        record();
        // Schedule next batch
        requestAnimationFrame(tick);
      });
    };

    // Start the benchmark loop
    requestAnimationFrame(tick);
  }

  /** Capture current performance data and download as a timestamped JSON snapshot */
  savePerformanceSnapshot() {
    const data = this.getPerformanceData();
    const snapshot = {
      timestamp: new Date().toISOString(),
      scene: {
        objects: data.objects,
        lights: data.lights,
        pixelRatio: data.pixelRatio,
      },
      renderer: {
        drawCalls: data.drawCalls,
        triangles: data.triangles,
        points: data.points,
        lines: data.lines,
        geometries: data.geometries,
        textures: data.textures,
        programs: data.programs,
      },
      frame: {
        fps: data.fps,
        frameTimeMs: data.frameTime,
      },
      memory: {
        jsHeapUsedMB: +(data.jsHeapUsed / (1024 * 1024)).toFixed(1),
        jsHeapTotalMB: +(data.jsHeapTotal / (1024 * 1024)).toFixed(1),
      },
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `perf-snapshot_${date}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    log('Performance snapshot saved');
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
    if (this.isRecording) this._recordFrame();
    // Track frame time
    const now = performance.now();
    const delta = now - this._lastFrameTime;
    this._lastFrameTime = now;
    this._frameDeltas.push(delta);
    if (this._frameDeltas.length > 30) this._frameDeltas.shift();
    this.render();
    const avgDelta = this._frameDeltas.reduce((s, d) => s + d, 0) / this._frameDeltas.length;
    const fps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 60;
    const el = document.getElementById('statusRight');
    if (el) el.textContent = `FPS: ${fps} | Objects: ${this.objects.length}`;

    // Update nav-cube orientation
    this._updateNavCube();

    // Update profiler overlay
    this._updateProfiler();
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
        let t = (frame - prev.frame) / (next.frame - prev.frame || 1);
        t = this._applyEasing(t);
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

  // ── Recording / Mocap ──
  toggleRecording() {
    if (this.isRecording) {
      this.isRecording = false;
      log('Recording stopped');
    } else {
      if (!this.selectedObject) { log('Select an object to record', 'error'); return; }
      this.isRecording = true;
      this.pushUndo();
      this.currentFrame = 1;
      // Clear existing keyframes for this object
      const id = this.selectedObject.uuid;
      this.keyframes.delete(id);
      this.keyframes.set(id, []);
      log('Recording started — move the object with gizmo');
    }
  }

  _recordFrame() {
    if (!this.selectedObject || !this.isRecording) return;
    const id = this.selectedObject.uuid;
    if (!this.keyframes.has(id)) return;
    const kfs = this.keyframes.get(id);
    // Only record if position/rotation/scale changed (avoid duplicate identical frames)
    const last = kfs[kfs.length - 1];
    const p = this.selectedObject.position;
    const r = this.selectedObject.rotation;
    const s = this.selectedObject.scale;
    if (last) {
      if (last.position.distanceTo(p) < 0.001 &&
          last.rotation.toArray().every((v, i) => Math.abs(v - r.toArray()[i]) < 0.001) &&
          last.scale.distanceTo(s) < 0.001) {
        // No change, don't add duplicate
        return;
      }
    }
    kfs.push({
      frame: this.currentFrame,
      position: p.clone(),
      rotation: r.clone(),
      scale: s.clone(),
    });
    this.currentFrame = Math.min(this.currentFrame + 1, this.totalFrames);
  }

  exportKeyframesAsJSON() {
    if (this.keyframes.size === 0) { log('No keyframes to export', 'error'); return; }
    const data = {
      version: 1,
      totalFrames: this.totalFrames,
      keyframes: Array.from(this.keyframes.entries()).map(([uuid, kfs]) => ({
        objectUuid: uuid,
        objectName: this.objects.find(o => o.uuid === uuid)?.name || 'unknown',
        frames: kfs.map(kf => ({
          frame: kf.frame,
          position: kf.position.toArray(),
          rotation: kf.rotation.toArray(),
          scale: kf.scale.toArray(),
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'keyframes.json';
    a.click();
    log('Keyframes exported');
  }

  importKeyframesFromJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.keyframes) { log('Invalid keyframe data', 'error'); return; }
        this.pushUndo();
        this.keyframes.clear();
        this.currentFrame = 1;
        if (data.totalFrames) this.totalFrames = data.totalFrames;
        data.keyframes.forEach(item => {
          const obj = this.objects.find(o => o.uuid === item.objectUuid || o.name === item.objectName);
          if (!obj) return;
          const kfs = item.frames.map(kf => ({
            frame: kf.frame,
            position: new THREE.Vector3().fromArray(kf.position),
            rotation: new THREE.Euler(kf.rotation[0], kf.rotation[1], kf.rotation[2]),
            scale: new THREE.Vector3().fromArray(kf.scale),
          }));
          this.keyframes.set(obj.uuid, kfs);
        });
        log(`Imported keyframes for ${this.keyframes.size} object(s)`);
        this.render();
      } catch (err) {
        log(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  }

  clearAllKeyframes() {
    if (this.keyframes.size === 0) return;
    this.pushUndo();
    this.keyframes.clear();
    this.currentFrame = 1;
    log('All keyframes cleared');
  }

  // ── Paint Mode ──
  togglePaintMode() {
    this.isPaintMode = !this.isPaintMode;
    if (this.isPaintMode) {
      this.transformControls.detach();
      this.renderer.domElement.style.cursor = 'crosshair';
      log('Paint mode ON — click on meshes to paint');
    } else {
      this.renderer.domElement.style.cursor = '';
      if (this.selectedObject) this.transformControls.attach(this.selectedObject);
      log('Paint mode OFF');
    }
  }

  setPaintColor(hex) { this._paintColor = hex; }
  setPaintSize(val) { this._paintSize = val; }
  setPaintOpacity(val) { this._paintOpacity = val; }
  setPaintHardness(val) { this._paintHardness = val; }

  _paintClickHandler(event) {
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
      const hit = intersects[0];
      this._applyPaint(hit, this._paintColor, this._paintSize, this._paintOpacity, this._paintHardness);
    }
  }

  _applyPaint(intersect, hex, radius, opacity, hardness) {
    const mesh = intersect.object;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;

    // Ensure the geometry has vertex colors
    if (!geo.attributes.color) {
      const colors = new Float32Array(geo.attributes.position.count * 3);
      // Initialize to white
      for (let i = 0; i < colors.length; i++) colors[i] = 1;
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      // Enable vertexColors on material
      if (mesh.material) {
        mesh.material.vertexColors = true;
        mesh.material.needsUpdate = true;
      }
    }

    const colorAttr = geo.attributes.color;
    const posAttr = geo.attributes.position;
    const targetColor = new THREE.Color(hex);
    const point = intersect.point;
    // Transform point to local space
    const localPoint = mesh.worldToLocal(point.clone());

    // Find vertices within radius and paint them
    const vertex = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      const dist = vertex.distanceTo(localPoint);
      if (dist <= radius) {
        const falloff = hardness === 1 ? 1 : Math.pow(1 - dist / radius, 2 * (1 - hardness) + 0.001);
        const strength = opacity * falloff;
        const r = colorAttr.getX(i);
        const g = colorAttr.getY(i);
        const b = colorAttr.getZ(i);
        colorAttr.setXYZ(i,
          r + (targetColor.r - r) * strength,
          g + (targetColor.g - g) * strength,
          b + (targetColor.b - b) * strength
        );
      }
    }
    colorAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // ── Rigging / Bones ──
  addBone() {
    if (!this.selectedObject) { log('Select an object to add a bone to', 'error'); return; }
    this.pushUndo();
    const boneGroup = new THREE.Group();
    boneGroup.name = 'Bone_' + (this.objects.filter(o => o.name.startsWith('Bone_')).length + 1);
    // Visual: small sphere at joint
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffaa44 })
    );
    sphere.name = '__joint';
    boneGroup.add(sphere);
    // Bone shaft (line from parent to this)
    const boneMat = new THREE.LineBasicMaterial({ color: 0xffaa44 });
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.5, 0)];
    const boneGeo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(boneGeo, boneMat);
    line.name = '__shaft';
    boneGroup.add(line);
    // Position relative to parent
    boneGroup.position.set(0, 1, 0);
    this.selectedObject.add(boneGroup);
    this.objects.push(boneGroup);
    this.selectObject(boneGroup);
    log(`Added ${boneGroup.name} under ${this.selectedObject.name}`);
  }

  addSkeleton() {
    this.pushUndo();
    const root = new THREE.Group();
    root.name = 'Skeleton Root';
    this.scene.add(root);
    this.objects.push(root);
    // Create 3 bones in a chain
    let parent = root;
    for (let i = 0; i < 3; i++) {
      const bone = new THREE.Group();
      bone.name = `Bone_${i + 1}`;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffaa44 })
      );
      sphere.name = '__joint';
      bone.add(sphere);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.5, 0)]),
        new THREE.LineBasicMaterial({ color: 0xffaa44 })
      );
      line.name = '__shaft';
      bone.add(line);
      bone.position.set(0, 0.6, 0);
      parent.add(bone);
      this.objects.push(bone);
      parent = bone;
    }
    this.selectObject(root);
    log('Skeleton created: 3 bones');
  }

  // ── Easing / Transitions ──
  setEasing(easing) {
    if (this._easingFunctions[easing]) {
      this._currentEasing = easing;
      log(`Easing: ${easing}`);
    }
  }

  _applyEasing(t) {
    const fn = this._easingFunctions[this._currentEasing] || this._easingFunctions.linear;
    return fn(t);
  }

  // ── Inventory / Info ──
  getObjectInfo() {
    const obj = this.selectedObject;
    if (!obj) return { message: 'No object selected' };
    const info = {
      name: obj.name || 'unnamed',
      type: obj.type,
      uuid: obj.uuid,
      position: obj.position.toArray().map(v => v.toFixed(3)),
      rotation: obj.rotation.toArray().map(v => v.toFixed(3)),
      scale: obj.scale.toArray().map(v => v.toFixed(3)),
    };
    if (obj.isMesh && obj.geometry) {
      const geo = obj.geometry;
      info.geometry = geo.type;
      info.vertices = geo.attributes.position?.count || 0;
      info.faces = geo.index ? (geo.index.count / 3) : (info.vertices / 3);
      info.uvs = !!geo.attributes.uv;
      info.vertexColors = !!geo.attributes.color;
    }
    if (obj.material) {
      info.material = {
        type: obj.material.type,
        color: '#' + obj.material.color.getHexString(),
        metalness: obj.material.metalness,
        roughness: obj.material.roughness,
        wireframe: !!obj.material.wireframe,
        transparent: !!obj.material.transparent,
      };
    }
    info.children = obj.children.filter(c => !c.name.startsWith('__')).length;
    return info;
  }

  // ── Seeded PRNG (mulberry32) ──
  _seededRandom(seed) {
    let a = seed | 0;
    return function() {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ── Profile / Preferences ──
  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
    this.render();
    log('Background color updated');
  }

  setGridSnapEnabled(val) {
    this._gridSnapEnabled = val;
    log(`Grid snap ${val ? 'ON' : 'OFF'}`);
  }

  setGizmoSize(val) {
    this._gizmoSize = Math.max(0.5, Math.min(val, 3));
    this.transformControls.size = this._gizmoSize;
    log(`Gizmo size: ${this._gizmoSize.toFixed(1)}`);
  }

  // ── Rigging & Animation Detection ──
  /** Inspect an imported GLTF scene for bones, skinned meshes, and animation clips */
  _detectRiggingAndAnimations(root, gltf) {
    const bones = [];
    const skinnedMeshes = [];

    root.traverse((c) => {
      if (c.isBone) bones.push(c);
      if (c.isSkinnedMesh) skinnedMeshes.push(c);
    });

    // Report rigging
    if (bones.length > 0) {
      const boneNames = bones.slice(0, 5).map(b => b.name).join(', ');
      log(`🦴 Rig detected: ${bones.length} bone(s) (${boneNames}${bones.length > 5 ? ', …' : ''})`, 'info');
    }
    if (skinnedMeshes.length > 0) {
      log(`🎭 ${skinnedMeshes.length} skinned mesh(es) found (weighted to skeleton)`, 'info');
    }

    // Report animation clips
    const clips = gltf.animations || [];
    if (clips.length > 0) {
      clips.forEach((clip, i) => {
        const dur = (clip.duration || 0).toFixed(2);
        const tracks = clip.tracks?.length || 0;
        log(`🎬 Anim [${i}]: "${clip.name}" — ${dur}s, ${tracks} track(s)`, 'info');
      });
      // Store clips on the root so they can be referenced later
      root.userData.animationClips = clips;
    }

    if (bones.length === 0 && clips.length === 0) {
      log('ℹ️  No rigging or animations found in imported model', 'info');
    }

    return { bones, skinnedMeshes, clips };
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
        this._detectRiggingAndAnimations(root, gltf);
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
          this._detectRiggingAndAnimations(root, gltf);
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

  // ── Performance Monitor ──
  getPerformanceData() {
    const info = this.renderer.info;
    const avgDelta = this._frameDeltas.length > 0
      ? this._frameDeltas.reduce((s, d) => s + d, 0) / this._frameDeltas.length
      : 16.67;
    const fps = avgDelta > 0 ? Math.round(1000 / avgDelta) : 60;
    const mem = performance.memory; // Chrome-only
    return {
      fps,
      frameTime: Math.round(avgDelta * 10) / 10,
      drawCalls: info.render?.calls ?? 0,
      triangles: info.render?.triangles ?? 0,
      points: info.render?.points ?? 0,
      lines: info.render?.lines ?? 0,
      geometries: info.memory?.geometries ?? 0,
      textures: info.memory?.textures ?? 0,
      programs: info.programs?.length ?? 0,
      objects: this.objects.length,
      lights: this.lights.length,
      jsHeapUsed: mem?.usedJSHeapSize ?? 0,
      jsHeapTotal: mem?.totalJSHeapSize ?? 0,
      jsHeapLimit: mem?.jsHeapSizeLimit ?? 0,
      pixelRatio: this.renderer.getPixelRatio(),
      renderer: this.renderer.info.render ? 'WebGL' : 'WebGPU',
    };
  }

  // ── Game / Optimization Tools ──
  _colliderHelpers = new Map();
  _showColliders = true;

  getSceneStats() {
    let vertices = 0, faces = 0, meshes = 0, groups = 0;
    this.objects.forEach(o => {
      if (o.isMesh && o.geometry) {
        meshes++;
        const pos = o.geometry.attributes.position;
        if (pos) vertices += pos.count;
        if (o.geometry.index) faces += o.geometry.index.count / 3;
        else if (pos) faces += pos.count / 3;
      } else if (o.isGroup || o.type === 'Group') {
        groups++;
      }
    });
    return { objects: this.objects.length, meshes, groups, vertices: Math.round(vertices), faces: Math.round(faces), lights: this.lights?.length || 0 };
  }

  groupSelected() {
    if (!this.selectedObject) { log('Select the parent object first', 'error'); return; }
    const children = this.objects.filter(o => o !== this.selectedObject && !o.isLight);
    if (children.length === 0) { log('No other objects to group under selected', 'error'); return; }
    this.pushUndo();
    children.forEach(child => {
      this.selectedObject.add(child);
    });
    log(`Grouped ${children.length} objects under ${this.selectedObject.name}`);
  }

  ungroupSelected() {
    const obj = this.selectedObject;
    if (!obj || obj.children.length === 0) { log('Selected object has no children to ungroup', 'error'); return; }
    this.pushUndo();
    const children = [...obj.children];
    children.forEach(child => {
      obj.remove(child);
      this.scene.add(child);
    });
    log(`Ungrouped ${children.length} children from ${obj.name}`);
  }

  generateLOD() {
    const obj = this.selectedObject;
    if (!obj?.isMesh || !obj.geometry) { log('Select a mesh to generate LOD for', 'error'); return; }
    this.pushUndo();
    const geo = obj.geometry;
    // Decimate by reducing segment count for primitives
    const origType = geo.type;
    let lodGeo;
    if (origType === 'BoxGeometry') lodGeo = new THREE.BoxGeometry(1, 1, 1);
    else if (origType === 'SphereGeometry') lodGeo = new THREE.SphereGeometry(0.5, 8, 6);
    else if (origType === 'CylinderGeometry') lodGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    else if (origType === 'TorusGeometry') lodGeo = new THREE.TorusGeometry(0.5, 0.2, 8, 12);
    else {
      // For other geometry types, create a simplified version by sampling fewer vertices
      log('LOD: creating simplified copy', 'info');
      lodGeo = geo.clone();
    }

    const mat = obj.material ? obj.material.clone() : new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const lodMesh = new THREE.Mesh(lodGeo, mat);
    lodMesh.position.copy(obj.position);
    lodMesh.rotation.copy(obj.rotation);
    lodMesh.scale.copy(obj.scale);
    lodMesh.name = obj.name + '_LOD';
    lodMesh.castShadow = true;
    lodMesh.receiveShadow = true;
    // Make semi-transparent so it's clear this is an LOD
    if (lodMesh.material) { lodMesh.material.transparent = true; lodMesh.material.opacity = 0.6; }
    this.scene.add(lodMesh);
    this.objects.push(lodMesh);
    this.selectObject(lodMesh);
    log(`LOD generated for ${obj.name}`);
  }

  addColliderHelper(type) {
    const obj = this.selectedObject;
    if (!obj) { log('Select an object first', 'error'); return; }
    this.pushUndo();
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    let helper;
    if (type === 'box') {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.5 });
      helper = new THREE.Mesh(geo, mat);
    } else if (type === 'sphere') {
      const radius = Math.max(size.x, size.y, size.z) / 2;
      const geo = new THREE.SphereGeometry(radius, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true, transparent: true, opacity: 0.5 });
      helper = new THREE.Mesh(geo, mat);
    }
    if (helper) {
      helper.position.copy(center);
      helper.name = '__collider_' + type + '_' + obj.uuid.slice(0, 6);
      this.scene.add(helper);
      this._colliderHelpers.set(helper.uuid, { helper, target: obj });
      log(`Added ${type} collider`);
    }
  }

  toggleColliderHelpers() {
    this._showColliders = !this._showColliders;
    this._colliderHelpers.forEach(({ helper }) => { helper.visible = this._showColliders; });
    log(`Colliders ${this._showColliders ? 'ON' : 'OFF'}`);
  }

  // ── Valley generator state ──
  _valleyParams = {
    seed: 0,
    amplitude: 2.5,
    ridgeCount: 3,
    segments: 48,
    noiseAmount: 0.3,
    buildingGap: 0,
    streetInterval: 0,
    streetWidth: 1,
  };

  setValleyParam(key, val) {
    if (key in this._valleyParams) {
      this._valleyParams[key] = val;
    }
  }

  // ── Wireframe Valley ──
  generateWireframeValley() {
    this.pushUndo();

    const params = this._valleyParams;
    const width = 20;
    const depth = 20;
    const segW = params.segments;
    const segD = params.segments;
    const geo = new THREE.PlaneGeometry(width, depth, segW, segD);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const vertex = new THREE.Vector3();
    const rng = this._seededRandom(params.seed);

    for (let i = 0; i < pos.count; i++) {
      vertex.fromBufferAttribute(pos, i);
      const distFromCenter = Math.abs(vertex.z) / (depth / 2);
      const distFromSide = Math.abs(vertex.x) / (width / 2);
      // Valley shape: lower in center, higher at edges
      const valley = Math.pow(distFromCenter, 1.5) * params.amplitude;
      // Ridges along the sides (number controlled by ridgeCount)
      const ridges = Math.sin(distFromSide * Math.PI * params.ridgeCount) * 0.3 * (1 - distFromSide);
      // Seeded noise for organic feel
      const noise = (rng() - 0.5) * params.noiseAmount;
      vertex.y = -valley + ridges + noise;
      pos.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geo.computeVertexNormals();

    // Wireframe material — cyan/green tech look
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -1.5, 0);
    mesh.name = 'Wireframe Valley';

    this.scene.add(mesh);
    this.objects.push(mesh);
    this.selectObject(mesh);
    this.frameSelected();
    log('Generated wireframe valley');
  }

  /** Export just the wireframe valley as a GLB/GLTF file */
  exportValleyAsGLTF() {
    const valley = this.scene.getObjectByName('Wireframe Valley');
    if (!valley) { log('No wireframe valley found — generate one first', 'error'); return; }
    // Temporarily select the valley so the exporter uses it as the root
    const prevSelection = this.selectedObject;
    this.selectObject(valley);
    this._exportGLTF(valley, false); // false = .gltf (text), true would be .glb
    // Restore previous selection
    this.selectObject(prevSelection);
    log('Exported valley as GLTF');
  }

  exportValleyAsGLB() {
    const valley = this.scene.getObjectByName('Wireframe Valley');
    if (!valley) { log('No wireframe valley found — generate one first', 'error'); return; }
    const prevSelection = this.selectedObject;
    this.selectObject(valley);
    this._exportGLTF(valley, true);
    this.selectObject(prevSelection);
    log('Exported valley as GLB');
  }

  /** Select all building meshes (named Building_*) and group them for batch editing */
  selectAllBuildings() {
    const buildings = this.objects.filter(o => o.name && o.name.startsWith('Building_'));
    if (buildings.length === 0) {
      log('No city buildings found — scatter a city first (Map page)', 'error');
      return;
    }

    this.pushUndo();

    // Create a group to hold all buildings
    const group = new THREE.Group();
    group.name = 'City Buildings (' + buildings.length + ')';

    buildings.forEach(b => {
      this.scene.remove(b);
      group.add(b);
    });

    this.scene.add(group);
    // Keep group in this.objects; individual buildings are still accessible via group.children
    // Replace building entries in objects with the group
    this.objects = this.objects.filter(o => !o.name || !o.name.startsWith('Building_'));
    this.objects.push(group);

    this.selectObject(group);
    this.frameSelected();
    log(`Selected ${buildings.length} building(s) grouped as "${group.name}"`);
  }

  /** Toggle a collision-heatmap overlay showing occupied grid cells from the city scatter */
  toggleCollisionGrid() {
    // If the grid already exists, remove it and toggle off
    if (this._collisionGridGroup) {
      // Dispose geometries and materials to prevent GPU memory leaks
      this._collisionGridGroup.traverse(c => {
        if (c.isMesh) {
          c.geometry?.dispose();
          c.material?.dispose();
        }
      });
      this.scene.remove(this._collisionGridGroup);
      this._collisionGridGroup = null;
      log('Collision grid OFF');
      return;
    }

    const buildings = this.objects.filter(o => o.name && o.name.startsWith('Building_'));
    if (buildings.length === 0) {
      log('No city buildings found — scatter a city first', 'error');
      return;
    }

    const cellSize = 0.5;
    // cell -> { count: number, occupied: boolean }
    const cellMap = new Map();
    function cellKey(cx, cz) { return cx + ',' + cz; }

    // Compute occupied cells from each building's footprint
    buildings.forEach(b => {
      const x = b.position.x;
      const z = b.position.z;
      // Approximate footprint from the geometry
      const geo = b.geometry;
      if (!geo) return;
      // BoxGeometry params: width, height, depth — we stored them at creation time
      // But we can't read them back from a BoxGeometry easily. Use bounding box instead.
      const box = new THREE.Box3().setFromObject(b);
      const size = box.getSize(new THREE.Vector3());
      const halfW = size.x / 2;
      const halfD = size.z / 2;

      const minCX = Math.floor((x - halfW) / cellSize);
      const maxCX = Math.floor((x + halfW) / cellSize);
      const minCZ = Math.floor((z - halfD) / cellSize);
      const maxCZ = Math.floor((z + halfD) / cellSize);

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          const key = cellKey(cx, cz);
          cellMap.set(key, (cellMap.get(key) || 0) + 1);
        }
      }
    });

    if (cellMap.size === 0) {
      log('No occupied cells found', 'error');
      return;
    }

    // Find max count for normalization
    let maxCount = 0;
    cellMap.forEach(c => { if (c > maxCount) maxCount = c; });
    maxCount = Math.max(maxCount, 1);

    // Create the overlay group
    const group = new THREE.Group();
    group.name = '__collisionGrid';

    const quadGeo = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9);
    quadGeo.rotateX(-Math.PI / 2); // lay flat
    const color = new THREE.Color();

    cellMap.forEach((count, key) => {
      const [cx, cz] = key.split(',').map(Number);
      const t = count / maxCount; // 0..1
      // Heatmap: green (0) -> yellow (0.5) -> red (1)
      color.setHSL(0.3 - t * 0.3, 1, 0.5 + t * 0.2);

      const mat = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: 0.35 + t * 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(quadGeo, mat);
      mesh.position.set(cx * cellSize + cellSize / 2, -0.45, cz * cellSize + cellSize / 2);
      group.add(mesh);
    });

    this.scene.add(group);
    this._collisionGridGroup = group;
    log(`Collision grid ON (${cellMap.size} occupied cells, max ${maxCount} overlaps)`);
  }

  /** Scatter primitive boxes on the valley floor to simulate a city with collision avoidance */
  scatterCity() {
    const valley = this.scene.getObjectByName('Wireframe Valley');
    if (!valley || !valley.geometry) {
      log('Generate a wireframe valley first (Map page)', 'error');
      return;
    }

    this.pushUndo();

    const posAttr = valley.geometry.attributes.position;
    const vertex = new THREE.Vector3();
    const localPoint = new THREE.Vector3();

    // ── Grid-based collision detection ──
    // Cell size = 0.5 units. Each cell can hold at most one building.
    const cellSize = 0.5;
    const grid = new Map();

    function gridKey(cx, cz) { return cx + ',' + cz; }

    function isCellBlocked(x, z, bw, bd) {
      // Compute the AABB of the building footprint
      const halfW = bw / 2;
      const halfD = bd / 2;
      const minCX = Math.floor((x - halfW) / cellSize);
      const maxCX = Math.floor((x + halfW) / cellSize);
      const minCZ = Math.floor((z - halfD) / cellSize);
      const maxCZ = Math.floor((z + halfD) / cellSize);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          if (grid.has(gridKey(cx, cz))) return true;
        }
      }
      return false;
    }

    function blockCells(x, z, bw, bd) {
      const halfW = bw / 2;
      const halfD = bd / 2;
      const minCX = Math.floor((x - halfW) / cellSize);
      const maxCX = Math.floor((x + halfW) / cellSize);
      const minCZ = Math.floor((z - halfD) / cellSize);
      const maxCZ = Math.floor((z + halfD) / cellSize);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          grid.set(gridKey(cx, cz), true);
        }
      }
    }

    // ── Carve streets: pre-block cells in a regular grid pattern ──
    const interval = params.streetInterval || 0;
    const sw = Math.max(1, Math.round(params.streetWidth || 1));
    if (interval > 0) {
      // Corrected modulo for negative numbers (JS % preserves sign)
      const mod = (n, m) => ((n % m) + m) % m;
      // Estimate grid bounds from the valley segments
      const halfW = 10; // valley is 20 wide
      const halfD = 10;
      const minCX = Math.floor(-halfW / cellSize);
      const maxCX = Math.ceil(halfW / cellSize);
      const minCZ = Math.floor(-halfD / cellSize);
      const maxCZ = Math.ceil(halfD / cellSize);
      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cz = minCZ; cz <= maxCZ; cz++) {
          // Check if this cell falls on a street row or column
          const inStreetX = mod(cx, interval) < sw;
          const inStreetZ = mod(cz, interval) < sw;
          if (inStreetX || inStreetZ) {
            grid.set(gridKey(cx, cz), true);
          }
        }
      }
    }

    // ── Sample buildings from vertex positions ──
    const step = 4; // sample every Nth vertex
    const buildings = [];
    const cityColors = [0x4a9eff, 0xf59e0b, 0xef4444, 0x22c55e, 0xa855f7, 0xec4899, 0x14b8a6, 0xf97316];

    let attempts = 0;

    for (let i = 0; i < posAttr.count; i += step) {
      vertex.fromBufferAttribute(posAttr, i);

      // Skip edge vertices (low height = outer edges are higher)
      const h = vertex.y;
      if (h > -0.5) continue; // skip ridges/edges, keep valley floor

      attempts++;

      // Add slight random jitter to position
      localPoint.copy(vertex);
      localPoint.x += (Math.random() - 0.5) * 0.4;
      localPoint.z += (Math.random() - 0.5) * 0.4;

      // Random building dimensions
      const bw = 0.25 + Math.random() * 0.45;
      const bd = 0.25 + Math.random() * 0.45;
      const bh = 0.3 + Math.random() * 3.5;

      // ── Collision check: skip if footprint (+ gap) overlaps an existing building ──
      const gap = params.buildingGap || 0;
      if (isCellBlocked(localPoint.x, localPoint.z, bw + gap, bd + gap)) {
        continue;
      }
      blockCells(localPoint.x, localPoint.z, bw + gap, bd + gap);

      const geo = new THREE.BoxGeometry(bw, bh, bd);
      const color = cityColors[Math.floor(Math.random() * cityColors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3 + Math.random() * 0.4,
        metalness: 0.1 + Math.random() * 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Position on the valley surface (valley is at y = -1.5, vertex.y is local Y)
      mesh.position.set(localPoint.x, -1.5 + localPoint.y + bh / 2, localPoint.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'Building_' + (i / step);

      this.scene.add(mesh);
      this.objects.push(mesh);
      buildings.push(mesh);
    }

    log(`Scattered ${buildings.length} buildings on valley (${attempts - buildings.length} rejected for overlap)`);
    this.frameAll();
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
