// /game/world/buildings.js
// Building manager with proper caching + cleanup.
// Was creating N×BoxGeometry, N×MeshLambertMaterial, fresh TextureLoader per face.
// Now: shared per-size geometries, shared per-color materials, single texture cache,
// dispose+remove on reap (no GPU buffer leak). Supports multiple building shapes +
// themed skins from shared.js (BUILDING_SKINS).
import * as THREE from 'three';
import {
  TUNING, WINDOW_FILL_COLORS, GRAFFITI_ASSETS,
  WINDOW_GEOMETRY, WINDOW_FRAME_MATERIAL, getWindowPaneMaterial,
  WINDOW_PANE_W, WINDOW_PANE_H, WINDOW_GAP,
  loadTexture, removeAndDispose,
  BUILDING_SHAPE_WEIGHTS, BUILDING_SKINS, getActiveBuildingSkin,
} from './shared.js';

const FACE_MARGIN = 1.2;
// Weighted random shape selection
function pickShape() {
  const entries = Object.entries(BUILDING_SHAPE_WEIGHTS);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [shape, weight] of entries) {
    r -= weight;
    if (r <= 0) return shape;
  }
  return 'box';
}

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

  if (Math.random() >= 0.75) return;
  const pic = GRAFFITI_ASSETS[Math.floor(Math.random() * GRAFFITI_ASSETS.length)];
  loadTexture(pic).then(tex => {
    const desiredW = faceW * 0.70;
    const maxW = Math.max(0.1, usableW * 0.95);
    const decalW = Math.min(desiredW, maxW);
    const aspect = 0.6 + Math.random() * 1.0;
    const decalH = Math.min(decalW * aspect, Math.max(0.1, usableH * 0.92));

    const decalMat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: true, depthWrite: false,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(decalW, decalH), decalMat);
    decalMat.opacity = 0.75 + Math.random() * 0.20;

    const px = (Math.random() - 0.5) * Math.max(0, usableW - decalW);
    const py = (Math.random() - 0.5) * Math.max(0, usableH - decalH);
    if (normalAxis === 'z') {
      const z = sign * (faceDepth / 2 + 0.025);
      decal.position.set(px, py, z);
      decal.rotation.set(0, 0, (Math.random() - 0.5) * 0.12);
    } else {
      const x = sign * (faceDepth / 2 + 0.025);
      decal.position.set(x, py, px);
      decal.rotation.set(0, Math.PI / 2, (Math.random() - 0.5) * 0.12);
    }
    mesh.add(decal);
  }).catch(() => {});
}

/** Pick a random color from the active skin palette. */
function skinColor(skin) {
  return skin.palette[Math.floor(Math.random() * skin.palette.length)];
}

// ---- Shape builders ----

/** Standard rectangular box building (existing design). */
function makeBox(scene, z, skin) {
  const h = 8 + Math.random() * 34;
  const w = 6 + Math.random() * 8;
  const d = 6 + Math.random() * 8;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: skinColor(skin) })
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

/** Cylindrical tower with windows around the circumference. */
function makeCylinder(scene, z, skin) {
  const h = 12 + Math.random() * 30;
  const radius = 3 + Math.random() * 4;
  const segments = 16;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, h, segments),
    new THREE.MeshLambertMaterial({ color: skinColor(skin) })
  );
  mesh.position.set((Math.random() - 0.5) * 70, -8 + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Approximate collision as a box (keep existing collision logic working)
  mesh.userData = { w: radius * 2, h, d: radius * 2, passed: false };
  // Windows on curved surface: place panes around circumference at 2-3 heights
  const paneMat = getWindowPaneMaterial(
    WINDOW_FILL_COLORS[Math.floor(Math.random() * WINDOW_FILL_COLORS.length)]
  );
  const count = Math.min(segments - 2, 8);
  const rows = Math.min(3, Math.floor(h / 8));
  for (let r = 0; r < rows; r++) {
    const y = -h / 2 + 3 + r * (h / (rows + 1));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;
      const frame = new THREE.Mesh(WINDOW_GEOMETRY.frame, WINDOW_FRAME_MATERIAL);
      const pane = new THREE.Mesh(WINDOW_GEOMETRY.pane, paneMat);
      frame.position.set(px, y, pz);
      pane.position.set(px, y, pz);
      frame.lookAt(0, y, 0);
      pane.lookAt(0, y, 0);
      frame.translateZ(-0.01);
      pane.translateZ(0.01);
      mesh.add(frame);
      mesh.add(pane);
    }
  }
  scene.add(mesh);
  return mesh;
}

/** Stepped / terraced building (ziggurat style). */
function makeStepped(scene, z, skin) {
  const baseH = 14 + Math.random() * 20;
  const baseW = 8 + Math.random() * 6;
  const baseD = 8 + Math.random() * 6;
  const steps = 3 + Math.floor(Math.random() * 3);
  const group = new THREE.Group();
  let totalH = 0;
  let prevW = baseW;
  let prevD = baseD;
  for (let i = 0; i < steps; i++) {
    const stepH = baseH / steps + (Math.random() - 0.5) * 2;
    const w = prevW * (0.65 + Math.random() * 0.1);
    const d = prevD * (0.65 + Math.random() * 0.1);
    // Roof cap on each step (accent color for the top)
    const isTop = i === steps - 1;
    const matColor = isTop ? skin.roofColor : skinColor(skin);
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(w, stepH, d),
      new THREE.MeshLambertMaterial({ color: matColor })
    );
    step.position.y = totalH + stepH / 2;
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
    totalH += stepH;
    prevW = w;
    prevD = d;
  }
  group.position.set((Math.random() - 0.5) * 70, -8, z);
  group.userData = { w: baseW, h: totalH, d: baseD, passed: false };
  scene.add(group);
  return group;
}

/** Box building with a triangular prism / sloped roof. */
function makeSlopedRoof(scene, z, skin) {
  const h = 8 + Math.random() * 20;
  const w = 6 + Math.random() * 8;
  const d = 6 + Math.random() * 6;
  const roofH = 3 + Math.random() * 5;
  const group = new THREE.Group();
  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: skinColor(skin) })
  );
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  // Windows on body faces
  buildFace(body, w, h, 'z',  1, d);
  buildFace(body, w, h, 'z', -1, d);
  buildFace(body, d, h, 'x',  1, w);
  buildFace(body, d, h, 'x', -1, w);
  // Triangular roof (a low-height box rotated/positioned, or use ExtrudeGeometry)
  // Simple approach: two angled planes forming a tent
  const roofMat = new THREE.MeshLambertMaterial({ color: skin.roofColor });
  const roofTri = new THREE.Mesh(
    new THREE.CylinderGeometry(0, Math.min(w, d) * 0.45, roofH, 3),
    roofMat
  );
  roofTri.position.y = h + roofH / 2;
  roofTri.rotation.y = Math.random() * Math.PI;
  roofTri.scale.x = w / (Math.min(w, d) * 0.9);
  roofTri.scale.z = d / (Math.min(w, d) * 0.9);
  roofTri.castShadow = true;
  roofTri.receiveShadow = true;
  group.add(roofTri);

  group.position.set((Math.random() - 0.5) * 70, -8, z);
  group.userData = { w, h: h + roofH, d, passed: false };
  scene.add(group);
  return group;
}

/** Tall thin communication tower with crossbars. */
function makeTower(scene, z, skin) {
  const h = 25 + Math.random() * 30;
  const w = 2.5 + Math.random() * 1.5;
  const d = 2.5 + Math.random() * 1.5;
  const group = new THREE.Group();
  // Main mast
  const mast = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: skin.accentColor })
  );
  mast.position.y = h / 2;
  mast.castShadow = true;
  mast.receiveShadow = true;
  group.add(mast);
  // Crossbars at intervals
  const barMat = new THREE.MeshLambertMaterial({ color: skinColor(skin) });
  const levels = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < levels; i++) {
    const y = (i + 1) * (h / (levels + 1));
    const span = 2 + Math.random() * 3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(span, 0.3, 0.3), barMat);
    bar.position.set(0, y, span / 2 + d / 2);
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, span), barMat);
    bar2.position.set(span / 2 + w / 2, y, 0);
    group.add(bar2);
    // Small light at crossbar tips
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const light1 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 4, 4), lightMat);
    light1.position.set(0, y, span / 2 + d / 2 + 0.2);
    group.add(light1);
    const light2 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 4, 4), lightMat);
    light2.position.set(span / 2 + w / 2 + 0.2, y, 0);
    group.add(light2);
  }
  group.position.set((Math.random() - 0.5) * 70, -8, z);
  group.userData = { w: w + 6, h, d: d + 6, passed: false };
  scene.add(group);
  return group;
}

/** Dispatch to the right shape builder based on weighted random. */
function makeBuilding(scene, z) {
  const shape = pickShape();
  const skin = getActiveBuildingSkin();
  switch (shape) {
    case 'cylinder': return makeCylinder(scene, z, skin);
    case 'stepped':  return makeStepped(scene, z, skin);
    case 'slopedRoof': return makeSlopedRoof(scene, z, skin);
    case 'tower':    return makeTower(scene, z, skin);
    default:         return makeBox(scene, z, skin);
  }
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
