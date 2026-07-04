/*
ImportExportManager - centralizes import/export responsibilities and extends format handling.
It wraps existing ModelEditor import/export implementations when available and provides a
single place to add extra format support in future.

Supported formats:
- .gltf / .glb (via editor.importGltfModel)
- .k3dasset (Kamakazii Studio 3D asset bundles)
- .obj / .stl (via editor.importModel fallback)
- Multi-file glTF packages ({ url, files, name })
*/
import * as THREE from 'three';

export class ImportExportManager {
  constructor(editor) {
    this.editor = editor;
  }

  // Generic import entrypoint: accepts File, URL string, or { url, files, name } multi-file object.
  // Implements safe routing to editor import helpers to avoid circular delegation.
  async importModel(source) {
    if (!this.editor) throw new Error('No editor attached to ImportExportManager.');

    // Helper to determine extension/name hint
    const getNameHint = (src) => {
      if (typeof src === 'string') return src.split('/').pop();
      if (src instanceof File) return src.name;
      if (src && typeof src === 'object' && src.name) return src.name;
      return '';
    };

    const nameHint = getNameHint(source);
    const ext = (nameHint.split('.').pop() || '').toLowerCase();

    // Handle .k3dasset bundles
    if (ext === 'k3dasset') {
      return this._importK3dAsset(source);
    }

    // If it's a glTF/glb or a multi-file gltf package, prefer the editor.importGltfModel if available.
    const isGltfLike = () => {
      if (ext === 'gltf' || ext === 'glb') return true;
      if (source && typeof source === 'object' && source.files && source.url) {
        // multi-file packages are likely glTF with external resources
        return true;
      }
      return false;
    };

    try {
      if (isGltfLike() && typeof this.editor.importGltfModel === 'function') {
        return await this.editor.importGltfModel(source);
      }

      // Known other handlers (OBJ/STL) - delegate to editor.importModel implementation if it exists but avoid recursion.
      if (typeof this.editor.importModel === 'function' && this.editor.importModel !== this.importModel.bind(this)) {
        return await this.editor.importModel(source);
      }

      // Fallback: try basic handling for URL or File by using editor.importGltfModel when available,
      // or throw a friendly error if no importer exists.
      if (typeof source === 'string' && typeof this.editor.importGltfModel === 'function') {
        return await this.editor.importGltfModel(source);
      }

      throw new Error('Import not supported: editor has no suitable importer for this file type.');
    } catch (err) {
      // Normalize errors to provide clearer messages from the facade
      throw new Error(`ImportExportManager.importModel failed: ${err && err.message ? err.message : String(err)}`);
    }
  }

  /**
   * Import a .k3dasset bundle file.
   * Reads the JSON manifest and reconstructs scene objects from the serialized items.
   */
  async _importK3dAsset(source) {
    const readFile = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const bundle = JSON.parse(e.target.result);
          if (bundle.format !== 'k3dasset') {
            reject(new Error('Invalid .k3dasset format'));
            return;
          }
          resolve(bundle);
        } catch (err) {
          reject(new Error(`Failed to parse .k3dasset: ${err.message}`));
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });

    let bundle;
    if (source instanceof File) {
      bundle = await readFile(source);
    } else if (typeof source === 'string') {
      // Fetch from URL
      const response = await fetch(source);
      bundle = await response.json();
      if (bundle.format !== 'k3dasset') throw new Error('Invalid .k3dasset format');
    } else if (source && typeof source === 'object' && source.url) {
      const response = await fetch(source.url);
      bundle = await response.json();
      if (bundle.format !== 'k3dasset') throw new Error('Invalid .k3dasset format');
    } else if (source && typeof source === 'object' && source.items) {
      // Already-parsed bundle object
      bundle = source;
    } else {
      throw new Error('Unsupported .k3dasset source');
    }

    // Reconstruct into scene
    const group = new THREE.Group();
    group.name = bundle.title || 'Imported Asset';

    for (const item of (bundle.items || [])) {
      const mesh = this._itemToMesh(item);
      if (mesh) group.add(mesh);
    }

    if (group.children.length > 0) {
      this.editor.scene.add(group);
      if (Array.isArray(this.editor.objects)) {
        this.editor.objects.push(group);
      }
      // Auto-select if editor has selectObject
      if (typeof this.editor.selectObject === 'function') {
        this.editor.selectObject(group);
      }
      if (typeof this.editor.frameSelected === 'function') {
        this.editor.frameSelected();
      }
      // Update UI if available
      if (this.editor.ui && typeof this.editor.ui.updateOutliner === 'function') {
        this.editor.ui.updateOutliner();
        this.editor.ui.log(`Imported "${group.name}" (${group.children.length} objects)`, 'success');
      }
    }

    return { success: true, bundle, group };
  }

  /** Convert a bundle item to a Three.js Mesh */
  _itemToMesh(item) {
    if (!item || item.type !== 'mesh') return null;

    let geometry = null;
    if (item.geometry?.parameters) {
      geometry = this._parametricGeometry(item.geometry.parameters);
    }
    if (!geometry) {
      geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }

    let material = null;
    if (item.material) {
      const matData = Array.isArray(item.material) ? item.material[0] : item.material;
      if (matData) {
        material = new THREE.MeshStandardMaterial({
          color: matData.color !== undefined ? matData.color : 0x60a5fa,
          roughness: matData.roughness ?? 0.3,
          metalness: matData.metalness ?? 0.1,
        });
      }
    }
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.3, metalness: 0.1 });
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.name || 'Asset Part';
    if (item.position) mesh.position.fromArray(item.position);
    if (item.rotation) mesh.rotation.fromArray(item.rotation);
    if (item.scale) mesh.scale.fromArray(item.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /** Try parametric geometry reconstruction */
  _parametricGeometry(params) {
    if (!params) return null;
    try {
      if (params.radius !== undefined && params.radiusTop !== undefined) {
        return new THREE.CylinderGeometry(params.radiusTop, params.radiusBottom || params.radiusTop, params.height || 1, params.radialSegments || 16);
      }
      if (params.radius !== undefined) {
        return new THREE.SphereGeometry(params.radius, params.widthSegments || 24, params.heightSegments || 18);
      }
      if (params.width !== undefined && params.height !== undefined && params.depth !== undefined) {
        return new THREE.BoxGeometry(params.width, params.height, params.depth);
      }
      if (params.width !== undefined && params.height !== undefined) {
        return new THREE.PlaneGeometry(params.width, params.height);
      }
    } catch { /* ignore */ }
    return null;
  }

  // Export selected object in requested format (glb,gltf,obj,json). Delegates to editor when possible.
  async exportSelectedModel(format = 'glb') {
    if (!this.editor) throw new Error('No editor attached.');
    if (typeof this.editor.exportSelectedModel === 'function') {
      return this.editor.exportSelectedModel(format);
    }
    throw new Error('Editor does not provide exportSelectedModel.');
  }

  // Export whole scene helper. Delegates or falls back to editor.exportScene if available.
  async exportSceneAsFormat(format = 'glb') {
    if (!this.editor) throw new Error('No editor attached.');
    if (typeof this.editor.exportSceneAsFormat === 'function') {
      return this.editor.exportSceneAsFormat(format);
    }
    // fallback: if editor.exportScene returns a JSON, provide basic save
    if (typeof this.editor.exportScene === 'function') {
      const data = this.editor.exportScene();
      const blob = new Blob([data], { type: 'application/json' });
      const filename = `scene.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return filename;
    }
    throw new Error('Editor does not provide scene export functionality.');
  }
}