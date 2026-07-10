/*
  rigging_studio.js
  Title: Rigging Studio
  Purpose: Provides a lightweight, reusable RiggingStudio class to create a rigging UI panel,
           helpers for rigging point management, and utilities to attach/detach rigging interactions
           to an existing Three.js editor (ModelEditor).
  Usage:
    import { RiggingStudio } from './rigging_studio.js';
    const rigStudio = new RiggingStudio({ parent: document.body, editor: modelEditorInstance });
    rigStudio.show();
*/

import * as THREE from 'three';

export class RiggingStudio {
  constructor(options = {}) {
    this.parent = options.parent || document.body;
    this.editor = options.editor || null; // optional reference to the app/editor instance
    this.container = null;
    this.overlay = null;
    this.points = []; // { id, label, bone, worldPosition, element }
    this.dragging = null;
    this.camera = options.camera || null; // optionally pass camera for projection
    this.onPointSelected = options.onPointSelected || function () {};
    this._boundUpdate = this._update.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._visible = false;

    this._createUI();
  }

  _createUI() {
    // Container
    this.container = document.createElement('div');
    this.container.className = 'rigging-studio-panel';
    this.container.innerHTML = `
      <div class="rs-header">
        <span>Rigging Studio</span>
        <button class="rs-close" title="Close">✕</button>
      </div>
      <div class="rs-body">
        <div class="rs-controls">
          <button class="rs-toggle" data-mode="enable">Enable Rigging</button>
          <button class="rs-add-point">Add Point</button>
          <button class="rs-clear">Clear Points</button>
        </div>
        <div class="rs-list" role="list"></div>
      </div>
    `;
    this.parent.appendChild(this.container);

    // Overlay for visual handles
    this.overlay = document.createElement('div');
    this.overlay.className = 'rigging-studio-overlay';
    this.parent.appendChild(this.overlay);

    // Bind UI
    this.container.querySelector('.rs-close').addEventListener('click', () => this.hide());
    this.container.querySelector('.rs-toggle').addEventListener('click', (e) => this._toggleMode(e));
    this.container.querySelector('.rs-add-point').addEventListener('click', () => this.addPointAtCenter());
    this.container.querySelector('.rs-clear').addEventListener('click', () => this.clearPoints());
  }

  show() {
    this.container.classList.add('visible');
    this.overlay.classList.add('visible');
    this._visible = true;
    requestAnimationFrame(this._boundUpdate);
  }

  hide() {
    this.container.classList.remove('visible');
    this.overlay.classList.remove('visible');
    this._visible = false;
    this._stopDrag();
  }

  dispose() {
    this.hide();
    this.container.remove();
    this.overlay.remove();
    this.points = [];
    window.removeEventListener('pointermove', this._boundPointerMove);
    window.removeEventListener('pointerup', this._boundPointerUp);
  }

  addPoint({ label = 'Point', bone = null, worldPosition = new THREE.Vector3() } = {}) {
    const id = 'rs-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
    const el = document.createElement('div');
    el.className = 'rs-point';
    el.dataset.id = id;
    el.innerHTML = `<div class="rs-dot"></div><div class="rs-label">${label}</div>`;
    this.overlay.appendChild(el);

    const item = { id, label, bone, worldPosition: worldPosition.clone(), element: el };
    this.points.push(item);

    // add to side list
    const list = this.container.querySelector('.rs-list');
    const li = document.createElement('div');
    li.className = 'rs-list-item';
    li.dataset.id = id;
    li.textContent = label;
    li.addEventListener('click', () => this.selectPoint(id));
    list.appendChild(li);

    // pointer interactions
    el.addEventListener('pointerdown', (e) => this._onPointerDown(e, item));
    return item;
  }

  addPointAtCenter() {
    // Add point at camera forward center (best-effort): requires editor.camera & editor.currentModel
    if (this.editor && this.editor.camera && this.editor.currentModel) {
        const cam = this.editor.camera;
        const dir = new THREE.Vector3();
        cam.getWorldDirection(dir);
        const center = new THREE.Vector3().copy(cam.position).add(dir.multiplyScalar(2.0));
        this.addPoint({ label: 'Center', worldPosition: center });
    } else {
        // fallback: add at origin
        this.addPoint({ label: 'Origin', worldPosition: new THREE.Vector3() });
    }
  }

  clearPoints() {
    this.points.forEach(p => {
      if (p.element && p.element.parentElement) p.element.parentElement.removeChild(p.element);
    });
    this.points = [];
    const list = this.container.querySelector('.rs-list');
    list.innerHTML = '';
  }

  selectPoint(id) {
    const point = this.points.find(p => p.id === id);
    if (!point) return;
    // highlight selection
    this.points.forEach(p => p.element.classList.toggle('selected', p.id === id));
    this.onPointSelected(point);
  }

  _onPointerDown(event, point) {
    event.stopPropagation();
    event.preventDefault();
    this.dragging = { point, startEvent: event };
    window.addEventListener('pointermove', this._boundPointerMove);
    window.addEventListener('pointerup', this._boundPointerUp);
  }

  _onPointerMove(event) {
    if (!this.dragging) return;
    // Compute new world position based on ray from camera (editor required)
    if (!this.editor || !this.editor.camera || !this.editor.renderer) return;
    const rect = this.editor.renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.editor.camera);
    // Intersect with plane at point.worldPosition's approximate plane (facing camera)
    const plane = new THREE.Plane();
    const camDir = new THREE.Vector3();
    this.editor.camera.getWorldDirection(camDir);
    plane.setFromNormalAndCoplanarPoint(camDir, this.dragging.point.worldPosition);
    const newPos = new THREE.Vector3();
    ray.ray.intersectPlane(plane, newPos);
    if (newPos) {
        this.dragging.point.worldPosition.copy(newPos);
        this._updatePointElement(this.dragging.point);
        // If attached to bone, optionally update bone position (caller responsibility)
    }
  }

  _onPointerUp() {
    this._stopDrag();
  }

  _stopDrag() {
    if (this.dragging) {
      this.dragging = null;
      window.removeEventListener('pointermove', this._boundPointerMove);
      window.removeEventListener('pointerup', this._boundPointerUp);
    }
  }

  _updatePointElement(point) {
    // Update screen position of point.element using camera projection
    const cam = (this.editor && this.editor.camera) ? this.editor.camera : this.camera;
    const renderer = (this.editor && this.editor.renderer) ? this.editor.renderer : null;
    if (!cam || !renderer) return;
    const screenPos = point.worldPosition.clone().project(cam);
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screenPos.x + 1) / 2 * rect.width;
    const y = (-screenPos.y + 1) / 2 * rect.height;
    point.element.style.transform = `translate(${x}px, ${y}px)`;
    // show/hide depending on in-front
    point.element.style.display = screenPos.z < 1 ? 'block' : 'none';
  }

  _update() {
    if (!this._visible) return;
    // update all points
    this.points.forEach(p => {
      if (p.bone && typeof p.bone.getWorldPosition === 'function') {
        p.bone.getWorldPosition(p.worldPosition);
      }
      this._updatePointElement(p);
    });
    requestAnimationFrame(this._boundUpdate);
  }

  // Toggle a simple UI state; the actual editor rigging enable/disable should be handled by caller
  _toggleMode(e) {
    const btn = e.currentTarget;
    if (btn.dataset.mode === 'enable') {
      btn.dataset.mode = 'disable';
      btn.textContent = 'Disable Rigging';
      this.container.classList.add('enabled');
      if (this.editor) {
        // If editor exposes toggleRiggingMode, call it
        if (typeof this.editor.toggleRiggingMode === 'function') {
          this.editor.toggleRiggingMode();
        }
      }
    } else {
      btn.dataset.mode = 'enable';
      btn.textContent = 'Enable Rigging';
      this.container.classList.remove('enabled');
      if (this.editor) {
        if (typeof this.editor.toggleRiggingMode === 'function') {
          this.editor.toggleRiggingMode();
        }
      }
    }
  }

  // Helper to attach an existing bone by name to a rigging point
  attachBoneToPoint(pointId, bone) {
    const p = this.points.find(x => x.id === pointId);
    if (!p) return false;
    p.bone = bone;
    return true;
  }
}