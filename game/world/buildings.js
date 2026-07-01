// /game/world/buildings.js
// Building manager with proper caching + cleanup.
// Was creating N×BoxGeometry, N×MeshLambertMaterial, fresh TextureLoader per face.
// Now: shared per-size geometries, shared per-color materials, single texture cache,
// dispose+remove on reap (no GPU buffer leak).
import * as THREE from 'https://esm.sh/three@0.128.0';
import {
  TUNING, BUILDING_COLORS, WINDOW_FILL_COLORS, GRAFFITI_ASSETS,
  WINDOW_GEOMETRY, WINDOW_FRAME_MATERIAL, getWindowPaneMaterial,
  WINDOW_PANE_W, WINDOW_PANE_H, WINDOW_GAP,
  loadTexture, removeAndDispose,
} from './shared.js';

const FACE_MARGIN = 1.2;

/**
 * Build a single face (front/back or left/right) of windows + optional graf decal.
 * Re-uses cached geometries + materials.
 */
function buildFace(mesh, faceW, faceH, normalAxis, sign, faceDepth) {
  const usableW = faceW - FACE_MARGIN * 2;
  const usableH = faceH - FACE_MARGIN * 2;
  if (usableW < WINDOW_PANE_W || usableH < WINDOW_PANE_H) return;

  const cols = Math.max(1, Math.floor((usableW + WINDOW_GAP) / (WINDOW_PANE_W + WINDOW_GAP)));
  const rows = Math.max(1, Math.floor((usableH + WINDOW_GAP) / (WINDOW_PANE_H + WINDOW_GAP)));

  const totalW = cols * WINDOW_PANE_W + (cols - 1) * WINDOW_GAP;
  const totalH = rows * WINDOW_PANE_H + (rows - 1) * WINDOW_GAP;
  const startX = -totalW / 2 + WINDOW_PANE_W / 2;
  const startY = -totalH / 2 + WINDOW_PANE_H / 2;

  // Pick a glow color for this face once
  const fillHex = WINDOW_FILL_COLORS[Math.floor(Math.random() * WINDOW_FILL_COLORS.length)];
  const paneMat = getWindowPaneMaterial(fillHex);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = startX + c * (WINDOW_PANE_W + WINDOW_GAP);
      const v = startY + r * (WINDOW_PANE_H + WINDOW_GAP);

      const frame = new THREE.Mesh(WINDOW_GEOMETRY.frame, WINDOW_FRAME_MATERIAL);
      const pane  = new THREE.Mesh(WINDOW_GEOMETRY.pane,  paneMat);

      if (normalAxis === 'z') {
        const z = sign * (faceDepth / 2 + 0.02);
        frame.position.set(u, v, z);
        pane.position.set(u, v, z + sign * 0.03);
      } else {
        const x = sign * (faceDepth / 2 + 0.02);
        frame.rotation.y = Math.PI / 2;
        pane.rotation.y  = Math.PI / 2;
        frame.position.set(x, v, u);
        pane.position.set(x + sign * 0.03, v, u);
      }
      mesh.add(frame);
      mesh.add(pane);
    }
  }

  // 75% chance per face: slap a random graffiti decal on this wall. Decal
  // geometry stays unique (varies in size per face) but the underlying
  // texture is shared via loadTexture() so 9 decals × N buildings doesn't
  // pull 9N PNG fetches.
  if (Math.random() >= 0.75) return;
  const pic = GRAFFITI_ASSETS[Math.floor(Math.random() * GRAFFITI_ASSETS.length)];
  loadTexture(pic).then(tex => {
    // ~70% of face width (was 40%): each sticker covers at least 70% MIN
    // of the face (within usableW clamp at 0.95 × faceW, so the upper bound
    // is ~95% if face is wider than decal). Aspect 0.6–1.6 keeps decals
    // mostly square-to-portrait so they feel like posters, not banners.
    const desiredW = faceW * 0.70;
    const maxW = Math.max(0.1, usableW * 0.95);
    const decalW = Math.min(desiredW, maxW);
    const aspect = 0.6 + Math.random() * 1.0;
    const decalH = Math.min(decalW * aspect, Math.max(0.1, usableH * 0.92));

    // depthTest ON + depthWrite OFF is the trick that satisfies 'cover
    // buildings with images but not windows': the decal draws in FRONT of
    // the wall (visible everywhere on the face) but BEHIND frames/panes
    // (windows occlude the decal wherever they overlap). We don't have to
    // compute where the window grid lies — windows over-draw the decal
    // naturally at every pixel they cover.
    const decalMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: true, depthWrite: false,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(decalW, decalH), decalMat);
    decalMat.opacity = 0.75 + Math.random() * 0.20;             // mostly opaque — wall art, not a ghost

    const px = (Math.random() - 0.5) * Math.max(0, usableW - decalW);
    const py = (Math.random() - 0.5) * Math.max(0, usableH - decalH);
    if (normalAxis === 'z') {
      // #decal-z — z = +/- (faceDepth/2 + 0.025):
      //   +0      = wall front surface (decal here would z-fight with wall)
      //   +0.025  = just OUTSIDE wall, INSIDE frame inner extent (frame span [-0.02, +0.06])
      //              — so windows occlude it
      //   +0.05   = pane center (decal here would sit roughly atop windows)
      //   +0.051  = OLD value, slightly outside panes (decal OVERDREW windows — bug)
      // 0.025 lets the decal be in front of the wall but inside the windows' z
      // volume, so frame + pane fronts always win the depth test wherever they
      // exist.
      const z = sign * (faceDepth / 2 + 0.025);
      decal.position.set(px, py, z);
      decal.rotation.set(0, 0, (Math.random() - 0.5) * 0.12);
    } else {
      const x = sign * (faceDepth / 2 + 0.025);
      decal.position.set(x, py, px);
      decal.rotation.set(0, Math.PI / 2, (Math.random() - 0.5) * 0.12);
    }
    mesh.add(decal);
  }).catch(() => { /* texture failed — building lives without decal */ });
}

/** Build a brand-new building mesh + windows, add to scene, return it. */
function makeBuilding(scene, z) {
  const h = 8 + Math.random() * 34;
  const w = 6 + Math.random() * 8;
  const d = 6 + Math.random() * 8;
  const color = BUILDING_COLORS[Math.floor(Math.random() * BUILDING_COLORS.length)];

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.position.set((Math.random() - 0.5) * 70, -8 + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { w, h, d, passed: false };

  buildFace(mesh, w, h, 'z',  1, d);
  buildFace(mesh, w, h, 'z', -1, d);
  buildFace(mesh, d, h, 'x',  1, w);
  buildFace(mesh, d, h, 'x', -1, w);

  scene.add(mesh);
  return mesh;
}

/**
 * Buildings — spawn, drift+spiral, reap.
 * @param {THREE.Scene} scene
 */
export function createBuildingManager(scene) {
  const buildings = [];

  function spawn(z) {
    const mesh = makeBuilding(scene, z);
    buildings.push(mesh);
    return mesh;
  }

  function clear() {
    for (const b of buildings) removeAndDispose(b);
    buildings.length = 0;
  }

  function updateForSpeed(speed, dt, planeZ, perBuildingCallback) {
    const drift = speed * TUNING.BUILD_DRIFT_FACTOR * dt;
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      b.position.z += drift;

      if (!b.userData.passed && b.position.z > planeZ + 4) {
        b.userData.passed = true;
      }

      if (b.position.z > TUNING.GENERATION_END_Z) {
        removeAndDispose(b);
        buildings.splice(i, 1);
      } else if (perBuildingCallback) {
        perBuildingCallback(b);
      }
    }
  }

  return { spawn, clear, updateForSpeed, list: buildings };
}
