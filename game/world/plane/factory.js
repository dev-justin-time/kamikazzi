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
  // Propeller is now HUD-lock world-space (see game/world.js loop() and
  // factory contract below) — its world position is overwritten each frame
  // based on the camera + viewport. Starting at (0,0,0) so the very first
  // frame BEFORE world.js runs its sync lands at world origin (visible for
  // one frame during createWorld()'s plane composition, then immediately
  // snapped to the camera-bottom ray in the first loop() frame).
  prop.position.set(0, 0, 0);
  return prop;
}

/**
 * Procedurally builds a stylised WW1 plane using shared geometry/material.
 * Returns `{ plane, propeller }` — the plane group and the propeller Group
 * are kept SEPARATE so the propeller can be re-parented to scene for
 * HUD-style viewport lock (see world.js syncPropellerToViewport()).
 * PlaneController is given the propeller ref directly (sibling lookup is
 * no longer needed) and spins it the same way as before.
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

  return { plane: g, propeller: makePropeller() };
}

/**
 * Loads a GLB plane from `url`. Wraps it in a Group with a propeller fallback.
 * Returns `{ plane: wrapper, propeller }`. If the GLB ships its own
 * 'propeller'-named object we hand that back as the propeller ref so
 * PlaneController can spin it; otherwise we synthesise one and ALSO hand it
 * back (it is NOT added to the wrapper in either path — world.js re-parents
 * it to `scene` for HUD lock).
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

      // GLB-sourced propeller (if any) stays in the wrapper for the model
      // integrity, but we ALSO synthesise a world-space HUD propeller so
      // the screen-lock behavior is uniform across procedural and GLB
      // paths. The two are siblings in the scene tree (plane keeps the
      // GLB's, scene gets the synthesised one); PlaneController only
      // touches the HUD-locked one.
      const hudPropeller = makePropeller();

      resolve({ plane: wrapper, propeller: hudPropeller });
    }, progress => { if (options.onProgress) options.onProgress(progress); },
       err => { console.warn('loadPlaneFromGLB failed', err); reject(err); });
  });
}
