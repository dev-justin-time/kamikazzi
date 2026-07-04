/*
mod-editor.js (replacement)
Lightweight, safe mod-editor facade to provide import/export helpers and avoid
the previous merge-conflict import markers. Exposes minimal API used by the app.
*/
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const gltfExporter = new GLTFExporter();
const objExporter = new OBJExporter();
const stlExporter = new STLExporter();

export class ModelEditor {
  constructor(scene, camera, renderer, controls, transformControls) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.transformControls = transformControls;
    this.objects = [];
    this.animations = [];
    this.mixer = null;
    this.selectedObject = null;
  }

  // Basic import for ArrayBuffer/File/url - uses GLTF loader when possible
  importGltfModel(source) {
    return new Promise((resolve, reject) => {
      try {
        if (source instanceof File) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const loader = new GLTFLoader();
            loader.parse(e.target.result, '', (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
              this._finalizeImported(root, source.name);
              resolve(root);
            }, reject);
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(source);
          return;
        }

        if (typeof source === 'string') {
          const loader = new GLTFLoader();
          loader.load(source, (gltf) => {
            const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
            this._finalizeImported(root, source.split('/').pop());
            resolve(root);
          }, undefined, reject);
          return;
        }

        // support multi-file descriptor { url, files, name } with URLModifier
        if (source && typeof source === 'object' && source.url) {
          // If files map provided, use URLModifier to resolve external resources
          if (source.files && typeof source.files === 'object' && Object.keys(source.files).length >= 1) {
            // Isolated manager so URLModifier doesn't leak to DefaultLoadingManager
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
              const filename = url.split('/').pop().split('?')[0];
              if (source.files[filename]) return source.files[filename];
              if (url.startsWith('data:')) return url;
              const decoded = decodeURIComponent(filename);
              if (source.files[decoded]) return source.files[decoded];
              return url;
            });

            const loader = new GLTFLoader(manager);
            const draco = new DRACOLoader();
            draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
            loader.setDRACOLoader(draco);

            const nameHint = source.name || source.url.split('/').pop() || 'Imported';
            const revokeAll = () => {
              Object.values(source.files).forEach(u => URL.revokeObjectURL(u));
            };

            loader.load(source.url, (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
              this._finalizeImported(root, nameHint);
              revokeAll();
              resolve(root);
            }, undefined, (err) => {
              revokeAll();
              reject(err);
            });
          } else {
            // Single URL — use instance gltfLoader directly
            const gltfLoader = new GLTFLoader();
            gltfLoader.load(source.url, (gltf) => {
              const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
              this._finalizeImported(root, source.name || source.url.split('/').pop());
              resolve(root);
            }, undefined, reject);
          }
          return;
        }

        reject(new Error('Unsupported GLTF source'));
      } catch (err) {
        reject(err);
      }
    });
  }

  // Small helper used by ImportExportManager fallback
  importModel(source) {
    const name = (source && source.name) || (typeof source === 'string' && source.split('/').pop()) || '';
    const ext = (name.split('.').pop() || '').toLowerCase();

    if (ext === 'gltf' || ext === 'glb' || typeof source === 'string' || (source && source.url)) {
      return this.importGltfModel(source);
    }
    // For OBJ/STL File, try to use GLTF loader fallback or fail gracefully
    return Promise.reject(new Error('No importer for this format in lightweight mod-editor'));
  }

  exportSelectedModel(format = 'glb') {
    return new Promise((resolve, reject) => {
      try {
        const obj = this._getSelectedOrScene();
        if (!obj) return reject(new Error('No object to export'));

        if (format === 'obj') {
          const data = objExporter.parse(obj);
          const blob = new Blob([data], { type: 'text/plain' });
          const name = 'export.obj';
          this._downloadBlob(blob, name);
          return resolve(name);
        }

        if (format === 'stl') {
          const data = stlExporter.parse(obj);
          const blob = new Blob([data], { type: 'application/sla' });
          const name = 'export.stl';
          this._downloadBlob(blob, name);
          return resolve(name);
        }

        // default to glb/gltf via GLTFExporter
        const binary = (format === 'glb');
        gltfExporter.parse(obj, (result) => {
          let blob;
          let name;
          if (binary) {
            blob = new Blob([result], { type: 'model/gltf-binary' });
            name = 'export.glb';
          } else {
            blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
            name = 'export.gltf';
          }
          this._downloadBlob(blob, name);
          resolve(name);
        }, { binary, onlyVisible: true });
      } catch (err) {
        reject(err);
      }
    });
  }

  exportSceneAsFormat(format = 'json') {
    return new Promise((resolve, reject) => {
      try {
        if (format === 'json') {
          const data = { objects: this.scene.children.map(c => ({ name: c.name })) };
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          const name = 'scene.json';
          this._downloadBlob(blob, name);
          return resolve(name);
        }
        // fallback route to exportSelectedModel for other formats
        this.exportSelectedModel(format).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  // Minimal scene export used by UI save
  exportScene() {
    try {
      const data = {
        objects: this.scene.children.filter(c => c.userData && c.userData.isEditable).map(o => ({
          name: o.name || '',
          position: o.position ? o.position.toArray() : [0,0,0],
          scale: o.scale ? o.scale.toArray() : [1,1,1]
        }))
      };
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return '{}';
    }
  }

  // New: update method used by animation loop (advance mixer & provide hook)
  update(delta) {
    try {
      if (this.mixer && typeof this.mixer.update === 'function') {
        this.mixer.update(delta);
      }
      // Placeholder for future per-frame editor updates (animations, plugins, etc.)
    } catch (e) {
      // Swallow to avoid breaking the main loop
      console.warn('ModelEditor.update error:', e);
    }
  }

  // Helpers
  _finalizeImported(root, nameHint) {
    root.name = nameHint || (root.name || 'Imported');
    root.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        c.userData.isEditable = true;
      }
    });
    this.scene.add(root);
    this.objects.push(root);
    // auto-select imported root when possible
    try { if (typeof this.selectObject === 'function') this.selectObject(root); } catch (e) {}
  }

  _getSelectedOrScene() {
    // Attempt to find a meaningful export target: selectedObject, else scene
    if (this.selectedObject) return this.selectedObject;
    return this.scene;
  }

  _downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Stubbed selection API used by other modules
  selectObject(obj) { this.selectedObject = obj; }
  deleteSelectedObject() { if (this.selectedObject && this.selectedObject.parent) this.selectedObject.parent.remove(this.selectedObject); this.selectedObject = null; }
  duplicateSelectedObject() { if (!this.selectedObject) return null; const c = this.selectedObject.clone(); this.scene.add(c); this.objects.push(c); this.selectObject(c); return c; }
}