import * as THREE from 'three';

/**
 * ObjectsManager - centralizes creation and basic management of scene objects.
 * Exported as a named export so other modules can import { ObjectsManager }.
 */
export class ObjectsManager {
  constructor(editor, scene) {
    this.editor = editor;
    this.scene = scene;
    this.defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  }

  // Create common primitives and a simple light
  addObject(type, color = '#ffffff') {
    let mesh = null;
    const material = this.defaultMaterial.clone();
    material.color = new THREE.Color(color);

    switch ((type || '').toLowerCase()) {
      case 'cube':
      case 'box':
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
        break;

      case 'sphere':
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), material);
        break;

      case 'cylinder':
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), material);
        break;

      case 'plane':
      case 'ground':
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.rotation.x = -Math.PI / 2;
        break;

      case 'light':
      case 'pointlight': {
        const light = new THREE.PointLight(0xffffff, 1, 20);
        light.position.set(0, 2, 0);
        light.name = 'PointLight';
        light.userData.isEditable = true;
        this.scene.add(light);
        // Select the light in editor if available
        if (this.editor && typeof this.editor.selectObject === 'function') {
          this.editor.selectObject(light);
        }
        return light;
      }

      default:
        console.warn('ObjectsManager: unknown type', type);
        return null;
    }

    if (!mesh) return null;

    mesh.position.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
    mesh.userData.isEditable = true;
    mesh.name = (type || 'object').toString();

    this.scene.add(mesh);

    // If the editor exposes selection, select the new object
    if (this.editor && typeof this.editor.selectObject === 'function') {
      this.editor.selectObject(mesh);
    }

    return mesh;
  }

  // Very small helper: remove an object safely
  removeObject(object) {
    if (!object) return;
    // detach editor selection if it's the same
    if (this.editor && this.editor.selectedObject === object && typeof this.editor.deselectObject === 'function') {
      this.editor.deselectObject();
    }
    // dispose geometries/materials for meshes
    object.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    if (object.parent) object.parent.remove(object);
  }
}