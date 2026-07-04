import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

/* Basic scene + renderer */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0xffffff, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.add(new THREE.AxesHelper(1));

const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
camera.position.set(5, 5, 8);

const grid = new THREE.GridHelper(50, 50, 0xdddddd, 0xeeeeee);
scene.add(grid);

/* Lights */
const hemi = new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 0.9);
scene.add(hemi);

/* Controls */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.07;
orbit.screenSpacePanning = false;

const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(1.1);
scene.add(transform);

// add flag to track transform (gizmo) interaction
let isTransformDragging = false;
transform.addEventListener('dragging-changed', (event) => {
  isTransformDragging = event.value;
  orbit.enabled = !event.value;
});

// load player glb (preload)
let playerGLTF = null;
const gltfLoader = new GLTFLoader();
gltfLoader.load('/player.glb', (g) => {
  playerGLTF = g;
}, undefined, (err) => {
  console.warn('player.glb failed to load', err);
});

/* State */
let objects = []; // tracked editable meshes
let selected = null;
let mode = 'edit'; // edit | play

// player state for play mode
let player = null;
let playerColliderHeight = 1.6;
let playerSpeed = 4.5;

/* Helpers */
function addPrimitive(type, params = {}) {
  let geo;
  if (type === 'box') geo = new THREE.BoxGeometry(1,1,1);
  if (type === 'sphere') geo = new THREE.SphereGeometry(0.6, 24, 16);
  if (type === 'cylinder') geo = new THREE.CylinderGeometry(0.5,0.5,1,20);
  if (type === 'plane') geo = new THREE.PlaneGeometry(2,2);
  const mat = new THREE.MeshStandardMaterial({ color: params.color ?? 0x8fb2ff });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set( (Math.random()-0.5)*2, 1, (Math.random()-0.5)*2 );
  mesh.userData.type = type;
  scene.add(mesh);
  objects.push(mesh);
  selectObject(mesh);
  refreshHierarchy();
  return mesh;
}

function refreshHierarchy() {
  const ul = document.getElementById('hierarchy');
  ul.innerHTML = '';
  objects.forEach((o, i) => {
    const li = document.createElement('li');
    li.textContent = o.userData.type || 'object';
    li.dataset.index = i;
    if (o === selected) li.style.background = '#eef6ff';
    li.addEventListener('click', (e) => {
      selectObject(o);
    });
    ul.appendChild(li);
  });
}

/* Selection & props */
function selectObject(obj) {
  if (selected === obj) return;
  selected = obj;
  transform.detach();
  if (obj) transform.attach(obj);
  updatePropsPanel();
  refreshHierarchy();
}

function updatePropsPanel() {
  const pos = selected ? selected.position : new THREE.Vector3();
  const rot = selected ? selected.rotation : new THREE.Euler();
  const scl = selected ? selected.scale : new THREE.Vector3(1,1,1);
  document.getElementById('pos-x').value = pos.x.toFixed(2);
  document.getElementById('pos-y').value = pos.y.toFixed(2);
  document.getElementById('pos-z').value = pos.z.toFixed(2);
  document.getElementById('rot-x').value = THREE.MathUtils.radToDeg(rot.x).toFixed(1);
  document.getElementById('rot-y').value = THREE.MathUtils.radToDeg(rot.y).toFixed(1);
  document.getElementById('rot-z').value = THREE.MathUtils.radToDeg(rot.z).toFixed(1);
  document.getElementById('scl-x').value = scl.x.toFixed(2);
  document.getElementById('scl-y').value = scl.y.toFixed(2);
  document.getElementById('scl-z').value = scl.z.toFixed(2);
  const colorInput = document.getElementById('color');
  colorInput.value = selected ? '#'+selected.material.color.getHexString() : '#ffffff';
  
  // scripts UI
  const scriptsSelect = document.getElementById('script-list');
  const scriptEditor = document.getElementById('script-editor');
  scriptsSelect.innerHTML = '';
  scriptEditor.value = '';
  if (selected) {
    selected.userData.scripts = selected.userData.scripts || [];
    selected.userData.scripts.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.name || `script_${i}`;
      scriptsSelect.appendChild(opt);
    });
    // show anchor state in UI
    selected.userData.anchored = selected.userData.anchored || false;
    updateAnchorUIFor(selected);
  } else {
    updateAnchorUIFor(null);
    scriptsSelect.innerHTML = '';
    scriptEditor.value = '';
  }
}

/* Anchor toggle handling */
const anchorToggle = document.getElementById('anchor-toggle');
anchorToggle.addEventListener('click', () => {
  if (!selected) return;
  selected.userData.anchored = !selected.userData.anchored;
  // store a floating height when anchored so it remains at that elevation
  if (selected.userData.anchored) {
    selected.userData._anchoredFloatY = selected.position.y + 0.5;
    selected.userData._velY = 0;
  } else {
    delete selected.userData._anchoredFloatY;
  }
  updateAnchorUIFor(selected);
});

function updateAnchorUIFor(obj) {
  if (!obj) {
    anchorToggle.textContent = 'Anchor: Off';
    anchorToggle.style.background = ''; anchorToggle.style.color = '';
    anchorToggle.setAttribute('aria-pressed','false');
    return;
  }
  const on = !!obj.userData.anchored;
  anchorToggle.textContent = `Anchor: ${on ? 'On' : 'Off'}`;
  anchorToggle.style.background = on ? '#d8f3dc' : '#ffe5e5';
  anchorToggle.style.borderColor = on ? '#b2e0b0' : '#f2b0b0';
  anchorToggle.style.color = '#111';
  anchorToggle.setAttribute('aria-pressed', String(on));
}

/* Prop input handlers */
function wirePropInputs() {
  ['pos-x','pos-y','pos-z'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (!selected) return;
      selected.position.setX(parseFloat(document.getElementById('pos-x').value));
      selected.position.setY(parseFloat(document.getElementById('pos-y').value));
      selected.position.setZ(parseFloat(document.getElementById('pos-z').value));
    });
  });
  ['rot-x','rot-y','rot-z'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (!selected) return;
      selected.rotation.set(
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-x').value)),
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-y').value)),
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-z').value))
      );
    });
  });
  ['scl-x','scl-y','scl-z'].forEach((id, idx) => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (!selected) return;
      selected.scale.set(
        parseFloat(document.getElementById('scl-x').value),
        parseFloat(document.getElementById('scl-y').value),
        parseFloat(document.getElementById('scl-z').value)
      );
    });
  });
  document.getElementById('color').addEventListener('input', (e) => {
    if (!selected) return;
    selected.material.color.set(e.target.value);
  });
}
wirePropInputs();

// wire scripts UI
document.getElementById('add-script').addEventListener('click', () => {
  if (!selected) return;
  selected.userData.scripts = selected.userData.scripts || [];
  selected.userData.scripts.push({ name: `script_${selected.userData.scripts.length}`, code: "// ctx.self.position.x += 0.01;\n" });
  updatePropsPanel();
});
document.getElementById('remove-script').addEventListener('click', () => {
  if (!selected) return;
  const sel = document.getElementById('script-list');
  const idx = parseInt(sel.value);
  if (isNaN(idx)) return;
  selected.userData.scripts.splice(idx,1);
  updatePropsPanel();
});
document.getElementById('script-list').addEventListener('change', (e) => {
  const idx = parseInt(e.target.value);
  const editor = document.getElementById('script-editor');
  if (!selected || isNaN(idx)) { editor.value = ''; return; }
  editor.value = selected.userData.scripts[idx].code || '';
});
document.getElementById('save-script').addEventListener('click', () => {
  if (!selected) return;
  const sel = document.getElementById('script-list');
  const idx = parseInt(sel.value);
  const editor = document.getElementById('script-editor');
  if (isNaN(idx)) return;
  selected.userData.scripts[idx].code = editor.value;
});

// update script editor placeholder text to mention Lua (UI hint only)
document.getElementById('script-editor').placeholder = "-- Lua script; function update(ctx) ... end\n-- ctx: { scene, player, self, time }\n";

/* Mouse picking */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (mode !== 'edit') return;
  if (isTransformDragging) return; // don't select while interacting with gizmo
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects, false);
  if (hits.length) {
    selectObject(hits[0].object);
  } else {
    selectObject(null);
  }
});
renderer.domElement.addEventListener('dblclick', (e) => {
  if (mode !== 'edit') return;
  if (isTransformDragging) return; // also ignore double-clicks when using gizmo
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects, false);
  if (hits.length) selectObject(hits[0].object);
});

/* UI controls wiring */
document.getElementById('add-primitive').addEventListener('change', (e) => {
  const v = e.target.value;
  if (!v) return;
  addPrimitive(v);
  e.target.value = '';
});
document.getElementById('transform-mode').addEventListener('change', (e) => {
  transform.setMode(e.target.value);
});
document.getElementById('duplicate').addEventListener('click', () => {
  if (!selected) return;
  const clone = selected.clone();
  clone.position.x += 1;
  clone.userData = Object.assign({}, selected.userData);
  scene.add(clone);
  objects.push(clone);
  selectObject(clone);
  refreshHierarchy();
});
document.getElementById('delete').addEventListener('click', () => {
  if (!selected) return;
  scene.remove(selected);
  objects = objects.filter(o => o !== selected);
  selectObject(null);
  refreshHierarchy();
});

/* Export / Import */
document.getElementById('export').addEventListener('click', () => {
  const data = objects.map(o => ({
    type: o.userData.type || 'mesh',
    position: o.position.toArray(),
    rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
    scale: o.scale.toArray(),
    color: o.material.color.getHex()
  }));
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scene.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById('import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const text = await f.text();
  try {
    const arr = JSON.parse(text);
    // clear
    objects.forEach(o => scene.remove(o));
    objects = [];
    // add
    arr.forEach(it => {
      const m = addPrimitive(it.type || 'box', { color: it.color });
      if (it.position) m.position.fromArray(it.position);
      if (it.rotation) m.rotation.set(it.rotation[0], it.rotation[1], it.rotation[2]);
      if (it.scale) m.scale.fromArray(it.scale);
    });
  } catch (err) {
    console.error('import failed', err);
  }
  e.target.value = '';
});

/* Mode toggle */
const modeToggle = document.getElementById('mode-toggle');
const status = document.getElementById('status');

modeToggle.addEventListener('click', () => {
  if (mode === 'edit') enterPlayMode();
  else exitPlayMode();
});

function enterPlayMode() {
  mode = 'play';
  modeToggle.textContent = 'Stop';
  status.textContent = 'Mode: Play';
  document.body.classList.add('playing'); // hide UI
  transform.detach();
  orbit.enabled = false;
  transform.visible = false;
  objects.forEach(o => o.userData._vel = (Math.random()*0.02)+0.01);

  // request pointer lock for immersive controls
  if (renderer.domElement.requestPointerLock) renderer.domElement.requestPointerLock();

  // spawn player at camera position (if model loaded, clone it)
  const spawnPos = camera.position.clone();
  // Save previous camera state to restore later
  camera.userData._savedPos = camera.position.clone();
  camera.userData._savedTarget = orbit.target ? orbit.target.clone() : null;

  if (playerGLTF) {
    player = playerGLTF.scene.clone(true);
    // normalize scale if model huge - ensure camera sits at roughly player height
    player.scale.set(1,1,1);
    player.position.copy(spawnPos);
    scene.add(player);
  } else {
    // fallback simple capsule represented by a box
    const geo = new THREE.CapsuleGeometry(0.3, playerColliderHeight - 0.6, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    player = new THREE.Mesh(geo, mat);
    player.position.copy(spawnPos);
    scene.add(player);
  }

  // attach camera to player (camera follows player)
  camera.position.set(0, playerColliderHeight * 0.9, 0);
  player.add(camera);
  camera.lookAt(new THREE.Vector3(0, playerColliderHeight * 0.9, 1));

  // disable selection while playing (already guarded by mode) and reset selected
  selectObject(null);

  // prepare physics: mark dynamic/unanchored objects to be simulated
  objects.forEach(o => {
    // ensure anchor flag exists
    o.userData.anchored = !!o.userData.anchored;
    // store vertical velocity for physics (only used for non-anchored)
    o.userData._velY = o.userData._velY ?? 0;
    o.userData._dynamic = !o.userData.anchored;
    // if anchored, ensure a float height is recorded so it stays floating
    if (o.userData.anchored) {
      o.userData._anchoredFloatY = o.userData._anchoredFloatY ?? (o.position.y + 0.5);
      o.userData._velY = 0;
    } else {
      delete o.userData._anchoredFloatY;
    }
  });

  // compile scripts into functions on each object
  objects.forEach(o => {
    delete o.userData._scriptFns;
    if (!o.userData.scripts || !o.userData.scripts.length) return;
    o.userData._scriptFns = [];
    o.userData.scripts.forEach(s => {
      try {
        // Compile Lua script using Fengari if available
        if (window.fengari && window.fengari.lauxlib && window.fengari.lua) {
          const { lua, lauxlib, lualib, to_luastring, to_jsstring } = window.fengari;
          // create a new lua state for this script (lightweight per-script state)
          const L = lauxlib.luaL_newstate();
          lualib.luaL_openlibs(L);

          // Wrap user code in an update(ctx) function if not already present
          const code = typeof s.code === 'string' ? s.code : '';
          const wrapped = `
            local update = update
            if type(update) ~= "function" then
              function update(ctx)
                ${code}
              end
            end
          `;

          const status = lauxlib.luaL_loadstring(L, to_luastring(wrapped));
          if (status !== lua.LUA_OK) {
            const err = to_jsstring(lua.lua_tostring(L, -1));
            throw new Error('Lua compile error: ' + err);
          }
          // run the chunk (defines update)
          if (lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
            const err = to_jsstring(lua.lua_tostring(L, -1));
            throw new Error('Lua runtime error: ' + err);
          }
          // store the lua state and mark function name 'update' to be called
          o.userData._scriptFns.push({ type: 'lua', state: L });
        } else {
          // fallback: skip compilation but keep code for reference
          console.warn('Fengari not available; Lua scripts will not run');
        }
      } catch (err) {
        console.warn('script compile error', err);
      }
    });
  });
}

/* ensure exiting play mode when pointer unlocked */
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== renderer.domElement && mode === 'play') {
    exitPlayMode();
  }
});

function exitPlayMode() {
  mode = 'edit';
  modeToggle.textContent = 'Play';
  status.textContent = 'Mode: Edit';
  document.body.classList.remove('playing'); // restore UI
  // exit pointer lock if still locked
  if (document.exitPointerLock && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  orbit.enabled = true;
  transform.visible = true;
  objects.forEach(o => { delete o.userData._vel; delete o.userData._velY; delete o.userData._dynamic; });

  // detach camera from player and restore previous camera pose
  if (player) {
    // compute world position for camera to restore near player
    const worldCamPos = new THREE.Vector3();
    camera.getWorldPosition(worldCamPos);
    scene.add(camera);
    camera.position.copy(worldCamPos);
    // restore orbit target if available
    if (camera.userData._savedTarget) orbit.target.copy(camera.userData._savedTarget);
    // remove player from scene
    scene.remove(player);
    player = null;
  }
  // ensure orbit target remains reasonable
  orbit.update();
}

// Keyboard state for WASD movement
const keys = { w:false, a:false, s:false, d:false, jump:false };
let prevTime = 0;
const moveSpeed = 4.0; // units per second
// add gravity/jump params
const GRAVITY = -9.8; // units/sec^2 (scaled in update)
const JUMP_SPEED = 5.0;

/* Keyboard shortcuts */
window.addEventListener('keydown', (e) => {
  if (e.key === 'w') transform.setMode('translate'), document.getElementById('transform-mode').value = 'translate';
  if (e.key === 'e') transform.setMode('rotate'), document.getElementById('transform-mode').value = 'rotate';
  if (e.key === 'r') transform.setMode('scale'), document.getElementById('transform-mode').value = 'scale';
  if (e.key === 'Delete' && selected) {
    scene.remove(selected);
    objects = objects.filter(o => o !== selected);
    selectObject(null);
    refreshHierarchy();
  }
  // WASD state
  if (e.key.toLowerCase() === 'w') keys.w = true;
  if (e.key.toLowerCase() === 'a') keys.a = true;
  if (e.key.toLowerCase() === 's') keys.s = true;
  if (e.key.toLowerCase() === 'd') keys.d = true;
  if (e.code === 'Space') {
    // trigger jump on keydown — set flag so we process jump in animate
    keys.jump = true;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'w') keys.w = false;
  if (e.key.toLowerCase() === 'a') keys.a = false;
  if (e.key.toLowerCase() === 's') keys.s = false;
  if (e.key.toLowerCase() === 'd') keys.d = false;
  if (e.code === 'Space') {
    keys.jump = false;
  }
});

/* Resize & animate */
function resize() {
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function animate(time) {
  time *= 0.001;
  const dt = Math.min(0.05, time - prevTime);
  prevTime = time;
  resize();
  orbit.update();

  // movement vector (for camera in edit, for player in play)
  if (keys.w || keys.a || keys.s || keys.d) {
    // compute forward on XZ plane from camera direction (camera is child of player in play)
    const forward = new THREE.Vector3();
    // when playing, derive forward from the camera's world direction so the player moves where the view is facing
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();
    const move = new THREE.Vector3();
    if (keys.w) move.add(forward);
    if (keys.s) move.sub(forward);
    if (keys.d) move.add(right);
    if (keys.a) move.sub(right);
    move.normalize().multiplyScalar((mode === 'play' ? playerSpeed : moveSpeed) * dt);

    if (mode === 'play' && player) {
      // move player and then raycast down to stand on top of objects
      player.position.add(move);

      // make the player model face movement direction when moving
      if (move.lengthSq() > 0.0001) {
        // movement direction in world XZ plane
        const dir = move.clone();
        dir.y = 0;
        dir.normalize();
        // compute yaw angle (player forward is -Z in three.js models often, adjust if needed)
        const yaw = Math.atan2(dir.x, dir.z);
        // smooth rotate towards target yaw
        const current = player.rotation.y || 0;
        // shortest angle lerp
        let delta = yaw - current;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        player.rotation.y = current + delta * 0.2;
      }

      // Initialize per-player physics storage
      player.userData._velY = player.userData._velY ?? 0;

      // simple collision with scene objects: raycast down from player to find highest intersect
      const downOrigin = new THREE.Vector3();
      player.getWorldPosition(downOrigin);
      const downRay = new THREE.Raycaster(downOrigin.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, -1, 0), 0, 5);
      const hits = downRay.intersectObjects(objects, true);

      // determine grounded state (touching something close below)
      let grounded = false;
      let groundY = null;
      if (hits.length) {
        groundY = hits[0].point.y;
        const dist = (downOrigin.y - groundY);
        grounded = dist <= (playerColliderHeight * 0.6 + 0.05); // small threshold
      }

      // handle jump input: only allow if grounded and jump pressed
      if (keys.jump && grounded) {
        player.userData._velY = JUMP_SPEED;
      }

      // apply gravity scaled by dt (we have dt earlier)
      player.userData._velY += GRAVITY * dt;
      player.position.y += player.userData._velY * dt;

      // resolve landing
      if (groundY !== null) {
        const desiredY = groundY + playerColliderHeight * 0.5; // stand on top
        if (player.position.y <= desiredY) {
          player.position.y = desiredY;
          player.userData._velY = 0;
          grounded = true;
        }
      } else {
        // if no ground, allow falling to a minimum
        const minY = 0.5 + playerColliderHeight * 0.5 - 0.5;
        if (player.position.y < minY) {
          player.position.y = minY;
          player.userData._velY = 0;
        }
      }
    } else {
      camera.position.add(move);
      if (orbit.target) orbit.target.add(move);
    }
  }

  // play mode simple physics
  if (mode === 'play') {
    objects.forEach(o => {
      if (!o.userData._vel) return;
      o.position.y -= o.userData._vel;
      o.userData._vel += 0.002;
      if (o.position.y < 0.5) { o.position.y = 0.5; o.userData._vel = 0; }
    });

    // per-object gravity for dynamic/unanchored objects (no inter-object collisions)
    objects.forEach(o => {
      // anchored objects are forced to their stored float height and do not move
      if (o.userData._anchoredFloatY !== undefined) {
        o.position.y = o.userData._anchoredFloatY;
        o.userData._velY = 0;
        return;
      }
      if (!o.userData._dynamic) return; // anchored objects do not move (fallback)
      // initialize velY if missing
      o.userData._velY = o.userData._velY ?? 0;
      // apply gravity
      o.userData._velY += GRAVITY * dt;
      o.position.y += o.userData._velY * dt;
      // simple ground at y = 0 (plane seeded in scene), settle to half-height approximated as 0.5
      const groundY = 0.5;
      if (o.position.y <= groundY) {
        o.position.y = groundY;
        o.userData._velY = 0;
      }
    });

    // execute scripts (safely minimal context)
    const now = time;
    objects.forEach(o => {
      if (!o.userData._scriptFns) return;
      const ctx = { scene, player, self: o, time: now, THREE };
      o.userData._scriptFns.forEach(fn => {
        try {
          if (fn.type === 'lua' && window.fengari && window.fengari.lua && window.fengari.to_luastring && window.fengari.to_jsstring) {
            const { lua, lauxlib, to_luastring, to_jsstring, interop } = window.fengari;
            const L = fn.state;
            // create a simple ctx table in Lua
            lua.lua_newtable(L); // push ctx table

            // ctx.time = now
            lua.lua_pushstring(L, to_luastring("time"));
            lua.lua_pushnumber(L, now);
            lua.lua_settable(L, -3);

            // ctx.self = { x, y, z } (expose basic transform; not full object)
            lua.lua_pushstring(L, to_luastring("self"));
            lua.lua_newtable(L);
            const pos = o.position;
            lua.lua_pushstring(L, to_luastring("x")); lua.lua_pushnumber(L, pos.x); lua.lua_settable(L, -3);
            lua.lua_pushstring(L, to_luastring("y")); lua.lua_pushnumber(L, pos.y); lua.lua_settable(L, -3);
            lua.lua_pushstring(L, to_luastring("z")); lua.lua_pushnumber(L, pos.z); lua.lua_settable(L, -3);
            lua.lua_settable(L, -3); // set ctx.self

            // push the update function onto stack
            lua.lua_getglobal(L, to_luastring("update"));
            if (lua.lua_isfunction(L, -1)) {
              // move ctx table to be argument
              lua.lua_pushvalue(L, -2); // duplicate ctx table
              // call update(ctx)
              if (lua.lua_pcall(L, 1, 0, 0) !== lua.LUA_OK) {
                const err = to_jsstring(lua.lua_tostring(L, -1));
                // consume error and continue
                lua.lua_pop(L, 1);
                // don't spam console, but log once
                console.warn('Lua script runtime error:', err);
              } else {
                // after successful run, attempt to read back ctx.self.x/y/z to update object position
                // fetch global ctx? We passed a table on the stack that was consumed; to read results,
                // the script should set a global 'out_self' table with new coords (best-effort)
                lua.lua_getglobal(L, to_luastring("out_self"));
                if (lua.lua_istable(L, -1)) {
                  lua.lua_getfield(L, -1, to_luastring("x")); const nx = lua.lua_isnumber(L, -1) ? lua.lua_tonumber(L, -1) : null; lua.lua_pop(L,1);
                  lua.lua_getfield(L, -1, to_luastring("y")); const ny = lua.lua_isnumber(L, -1) ? lua.lua_tonumber(L, -1) : null; lua.lua_pop(L,1);
                  lua.lua_getfield(L, -1, to_luastring("z")); const nz = lua.lua_isnumber(L, -1) ? lua.lua_tonumber(L, -1) : null; lua.lua_pop(L,1);
                  if (nx !== null && ny !== null && nz !== null) {
                    o.position.set(nx, ny, nz);
                  }
                }
                lua.lua_pop(L, 1); // pop out_self or nil
              }
            } else {
              lua.lua_pop(L, 1); // pop non-function
            }
            lua.lua_pop(L, 1); // pop ctx table
          } else {
            // non-lua or missing fengari: do nothing
          }
        } catch (err) { /* don't spam console */ }
      });
    });
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

/* Init with a ground plane and a couple objects */
(function seed() {
  const g = addPrimitive('plane'); g.scale.set(10,10,1); g.position.set(0,0,0); g.material.color.set(0xffffff); g.rotation.x = -Math.PI/2;
  addPrimitive('box'); addPrimitive('sphere');
})();