// /game/world/plane/factory.js
// Plane factory: builds a procedural WW1-style plane OR loads a GLB model.
// Module-scope SHARED/GEO objects are reused across every plane instance.
// The propeller is named so PlaneController can find and spin it.
import * as THREE from 'https://esm.sh/three@0.128.0';
import { GLTFLoader } from 'https://esm.sh/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

// Shared materials (reused across every plane instance).
export const SHARED = {
  body:    new THREE.MeshLambertMaterial({ color: 0xe53935 }),
  wing:    new THREE.MeshLambertMaterial({ color: 0xfdd835 }),
  accent:  new THREE.MeshLambertMaterial({ color: 0x37474f }),
  cockpit: new THREE.MeshLambertMaterial({ color: 0x80deea, transparent: true, opacity: 0.85 }),
  prop:    new THREE.MeshLambertMaterial({ color: 0x222222 }),
};

// Shared geometries (one set, reused).
export const GEO = {
  body:     new THREE.CylinderGeometry(0.8, 0.5, 5, 12),
  nose:     new THREE.ConeGeometry(0.8, 1.4, 12),
  wing:     new THREE.BoxGeometry(7, 0.25, 1.6),
  tailWing: new THREE.BoxGeometry(3, 0.2, 1),
  fin:      new THREE.BoxGeometry(0.2, 1.4, 1.2),
  cockpit:  new THREE.SphereGeometry(0.6, 10, 10),
  blade:    new THREE.BoxGeometry(0.1, 2.2, 0.3),
};

function makePropeller() {
  const prop = new THREE.Group();
  prop.name = 'propeller';
  const b1 = new THREE.Mesh(GEO.blade, SHARED.prop);
  const b2 = new THREE.Mesh(GEO.blade, SHARED.prop);
  b2.rotation.z = Math.PI / 2;
  prop.add(b1, b2);
  prop.position.set(0, 0, 3.75);
  return prop;
}

/**
 * Procedurally builds a stylised WW1 plane using shared geometry/material.
 * Returns a THREE.Group with a child named 'propeller'.
 */
export function buildPlane() {
  const g = new THREE.Group();
  g.name = 'plane';

  const body = new THREE.Mesh(GEO.body, SHARED.body);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  g.add(body);

  const nose = new THREE.Mesh(GEO.nose, SHARED.accent);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 3.0;
  nose.castShadow = true;
  g.add(nose);

  const wing = new THREE.Mesh(GEO.wing, SHARED.wing);
  wing.position.set(0, 0, 0.2);
  wing.castShadow = true;
  g.add(wing);

  const tailWing = new THREE.Mesh(GEO.tailWing, SHARED.wing);
  tailWing.position.set(0, 0, -2.2);
  tailWing.castShadow = true;
  g.add(tailWing);

  const fin = new THREE.Mesh(GEO.fin, SHARED.accent);
  fin.position.set(0, 0.7, -2.2);
  fin.castShadow = true;
  g.add(fin);

  const cockpit = new THREE.Mesh(GEO.cockpit, SHARED.cockpit);
  cockpit.position.set(0, 0.5, 0.6);
  cockpit.scale.set(1, 0.8, 1.4);
  g.add(cockpit);

  g.add(makePropeller());
  return g;
}

/**
 * Loads a GLB plane from `url`. Wraps it in a Group with a propeller fallback.
 * @param {string} url
 * @param {{scale?:number, castShadow?:boolean, receiveShadow?:boolean, onProgress?:Function}} options
 */
export async function loadPlaneFromGLB(url, options = {}) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, gltf => {
      const wrapper = new THREE.Group();
      wrapper.name = 'plane';
      const model = gltf.scene || (gltf.scenes && gltf.scenes[0]) || gltf;
      wrapper.add(model);

      // Camera expects plane flying toward -Z — add a 180° without clobbering
      if (wrapper.rotation) wrapper.rotation.y += Math.PI;

      const scale = options.scale || 1.0;
      wrapper.scale.set(scale, scale, scale);

      wrapper.traverse(node => {
        if (node.isMesh) {
          node.castShadow = !!options.castShadow;
          node.receiveShadow = !!options.receiveShadow;
          if (node.material && node.material.emissiveIntensity == null) {
            node.material.emissiveIntensity = 0.6;
          }
        }
      });

      if (!wrapper.getObjectByName('propeller')) {
        wrapper.add(makePropeller());
      }

      resolve(wrapper);
    }, progress => { if (options.onProgress) options.onProgress(progress); },
       err => { console.warn('loadPlaneFromGLB failed', err); reject(err); });
  });
}
