/*
CameraManager - provides comprehensive camera features and presets.
Wired to UI controls to allow projection switching, FOV/near/far adjustments,
preset views, framing selection, reset, and an orbit lock toggle.
*/
import * as THREE from 'three';

export class CameraManager {
  constructor(editor, camera, orbitControls, renderer) {
    this.editor = editor;
    this.camera = camera;
    this.controls = orbitControls;
    this.renderer = renderer;

    // store initial camera state to allow reset
    this._initialState = {
      position: camera.position.clone(),
      target: this.controls.target ? this.controls.target.clone() : new THREE.Vector3(0,0,0),
      up: camera.up.clone(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      isPerspective: (camera.isPerspectiveCamera !== false)
    };

    // create an orthographic camera for quick switch (keeps aspect updated)
    this.orthoCamera = null;
    this._createOrthoForCurrent();

    this.lockOrbit = false;
  }

  _createOrthoForCurrent() {
    const aspect = (this.renderer && this.renderer.domElement) ? (this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight) : (window.innerWidth / window.innerHeight);
    const frustumSize = 10;
    const half = frustumSize / 2;
    this.orthoCamera = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, this.camera.near, this.camera.far);
    this.orthoCamera.position.copy(this.camera.position);
    this.orthoCamera.up.copy(this.camera.up);
    this.orthoCamera.lookAt(this.controls.target || new THREE.Vector3(0,0,0));
  }

  setPerspective() {
    if (this.camera.isPerspectiveCamera) return;
    // migrate params from orthographic to perspective
    const pos = this.orthoCamera.position.clone();
    const up = this.orthoCamera.up.clone();
    this.camera = new THREE.PerspectiveCamera(this._initialState.fov || 75, this._getAspect(), this._initialState.near || 0.1, this._initialState.far || 1000);
    this.camera.position.copy(pos);
    this.camera.up.copy(up);
    this._applyCameraToEditor();
  }

  setOrthographic() {
    // replace main camera reference with orthographic clone
    if (!this.orthoCamera) this._createOrthoForCurrent();
    if (this.camera.isOrthographicCamera) return;
    // keep camera variable pointing to an orthographic camera for UI purposes
    this.camera = this.orthoCamera;
    this._applyCameraToEditor();
  }

  setFov(fov) {
    if (this.camera.isPerspectiveCamera) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    } else {
      // approximate by adjusting orthographic size inversely
      const aspect = this._getAspect();
      const frustumSize = Math.max(1, 10 * (75 / fov));
      const half = frustumSize / 2;
      this.camera.left = -half * aspect;
      this.camera.right = half * aspect;
      this.camera.top = half;
      this.camera.bottom = -half;
      if (this.camera.updateProjectionMatrix) this.camera.updateProjectionMatrix();
    }
  }

  setNearFar(near, far) {
    this.camera.near = near;
    this.camera.far = far;
    if (this.camera.updateProjectionMatrix) this.camera.updateProjectionMatrix();
  }

  applyPresetView(name) {
    // compute bounding center to orbit around if selection exists
    const selection = this.editor.selectedObject;
    const center = new THREE.Vector3(0,0,0);
    if (selection) {
      const box = new THREE.Box3().setFromObject(selection);
      box.getCenter(center);
    }

    const distance = 5; // default distance from center
    const up = new THREE.Vector3(0,1,0);
    let pos = new THREE.Vector3(0,0,0);

    switch (name) {
      case 'front':
        pos.set(center.x, center.y, center.z + distance);
        break;
      case 'back':
        pos.set(center.x, center.y, center.z - distance);
        break;
      case 'left':
        pos.set(center.x - distance, center.y, center.z);
        break;
      case 'right':
        pos.set(center.x + distance, center.y, center.z);
        break;
      default:
        pos.set(center.x + distance, center.y + distance, center.z + distance);
    }

    this.camera.position.copy(pos);
    if (this.controls && this.controls.target) this.controls.target.copy(center);
    if (this.camera.lookAt) this.camera.lookAt(center);
    if (this.camera.updateProjectionMatrix) this.camera.updateProjectionMatrix();
    if (this.controls && this.controls.update) this.controls.update();
  }

  frameSelection(padding = 1.2) {
    const selection = this.editor.selectedObject;
    const box = new THREE.Box3();
    if (selection) {
      box.setFromObject(selection);
    } else {
      // if no selection, frame whole scene's editable objects
      this.editor.scene.traverse((c) => {
        if (c.userData && c.userData.isEditable) box.expandByObject(c);
      });
    }

    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (this.camera.isPerspectiveCamera && this.camera.fov) ? this.camera.fov : 50;
    const distance = (maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target || new THREE.Vector3()).normalize();
    const newPos = center.clone().add(dir.multiplyScalar(distance * padding));
    this.camera.position.copy(newPos);
    if (this.controls && this.controls.target) this.controls.target.copy(center);
    if (this.camera.updateProjectionMatrix) this.camera.updateProjectionMatrix();
    if (this.controls && this.controls.update) this.controls.update();
  }

  resetCamera() {
    const s = this._initialState;
    this.camera.position.copy(s.position);
    if (this.controls && this.controls.target) this.controls.target.copy(s.target);
    if (this.camera.isPerspectiveCamera && s.fov) {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.near = s.near;
    this.camera.far = s.far;
    if (this.camera.updateProjectionMatrix) this.camera.updateProjectionMatrix();
    if (this.controls && this.controls.update) this.controls.update();
  }

  toggleLockOrbit(enabled) {
    this.lockOrbit = !!enabled;
    if (this.controls) {
      this.controls.enableRotate = !this.lockOrbit;
    }
  }

  focusOnSelection() {
    if (!this.editor.selectedObject) return;
    const box = new THREE.Box3().setFromObject(this.editor.selectedObject);
    const center = box.getCenter(new THREE.Vector3());
    if (this.controls && this.controls.target) this.controls.target.copy(center);
    this.frameSelection();
  }

  _getAspect() {
    if (this.renderer && this.renderer.domElement) {
      return this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
    }
    return window.innerWidth / window.innerHeight;
  }

  _applyCameraToEditor() {
    // Ensure editor's camera reference is updated (if editor uses it directly)
    if (this.editor) {
      this.editor.camera = this.camera;
    }
    // update controls to target current camera (OrbitControls hold reference externally; we trust existing controls)
    if (this.controls && this.controls.object) {
      this.controls.object = this.camera;
      if (typeof this.controls.update === 'function') this.controls.update();
    }
  }
}