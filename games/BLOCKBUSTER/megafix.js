/*
  MegaFix patch:
  - Watches the scene for the airplane mesh created by Game.changeSeedFlow.
  - Removes/neutralizes invisible barrier children so the plane cannot act as collision geometry.
  - Prevents plane from being raycast-hit (so sign/plane aren't treated as breakable target).
  - Adds a 3D sign-on-a-stick mesh (not a 2D canvas plane) on the plane that triggers a friendly confirmation overlay.
  - Uses PLANE_COLLISION_ACTIVE flag on the plane to control collision handling.
*/

import * as THREE from 'three';

(function () {
  // Utility: find Game instance on page (there may be one created by main.js)
  function findGameInstance() {
    for (const key in window) {
      try {
        const v = window[key];
        if (v && typeof v === 'object' && v.constructor && v.constructor.name === 'Game') return v;
      } catch (e) {}
    }
    if (window.game instanceof Object) return window.game;
    return null;
  }

  // Create overlay UI
  function ensureOverlay() {
    let overlay = document.getElementById('megafix-confirm');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'megafix-confirm';
    overlay.innerHTML = `
      <div id="megafix-msg"></div>
      <div style="margin-top:10px;">
        <div class="btn no">No</div>
        <div class="btn yes">Yes</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.no').addEventListener('click', () => hideOverlay());
    overlay.querySelector('.yes').addEventListener('click', () => proceedSeed());
    return overlay;
  }

  function showOverlay(text) {
    const overlay = ensureOverlay();
    overlay.querySelector('#megafix-msg').innerText = text;
    overlay.style.display = 'block';
  }
  function hideOverlay() {
    const overlay = document.getElementById('megafix-confirm');
    if (overlay) overlay.style.display = 'none';
  }

  // Proceed flow when user confirms via our sign UI
  function proceedSeed() {
    hideOverlay();
    const game = findGameInstance();
    if (!game) return;
    if (!game.inSeedTransition) {
      const plane = findPlaneInScene(game.scene);
      if (!plane) return;
      // animate plane away
      const outTo = plane.position.clone().add(new THREE.Vector3(0, 50, 200));
      const start = performance.now();
      const dur = 900;
      const initial = plane.position.clone();
      const animate = () => {
        const t = Math.min(1, (performance.now() - start) / dur);
        plane.position.lerpVectors(initial, outTo, t);
        if (t < 1) requestAnimationFrame(animate);
        else {
          if (plane.parent) plane.parent.remove(plane);
        }
      };
      animate();
      const loading = document.getElementById('loading-screen');
      if (loading) {
        loading.style.display = 'flex';
        setTimeout(() => loading.style.display = 'none', 1200);
      }
    }
  }

  function findPlaneInScene(scene) {
    if (!scene) return null;
    let found = null;
    scene.traverse(obj => {
      if (found) return;
      // detect plane by box geometry approx size or explicit marker
      if (obj.isMesh && obj.geometry && obj.geometry.parameters) {
        const p = obj.geometry.parameters;
        if (Math.abs((p.width||0) - 6) < 0.6 && Math.abs((p.height||0) - 1.5) < 0.6 && Math.abs((p.depth||0) - 10) < 2) {
          found = obj;
        }
      }
      if (!found && obj.userData && obj.userData.__isPlaneMarker) {
        found = obj;
      }
    });
    return found;
  }

  // Remove invisible barriers and neutralize collision; mark plane with PLANE_COLLISION_ACTIVE flag
  function neutralizePlane(plane) {
    if (!plane || plane.__megafix_neutralized) return;
    // remove invisible walls
    if (plane.children && plane.children.length > 0) {
      const toRemove = [];
      for (const c of plane.children) {
        if ((c.material && c.material.visible === false) || (c.geometry && c.geometry.parameters && (Math.abs(c.geometry.parameters.width - 0.2) < 0.01 || Math.abs(c.geometry.parameters.depth - 0.2) < 0.01))) {
          toRemove.push(c);
        }
      }
      toRemove.forEach(r => { if (r.parent) r.parent.remove(r); });
    }

    // Set a flag that other systems may consult; also ensure raycasts ignore plane by overriding raycast
    plane.userData.PLANE_COLLISION_ACTIVE = false;
    plane.raycast = function () { return []; };

    plane.__megafix_neutralized = true;
  }

  // Build a 3D sign-on-stick instead of a flat canvas textured plane.
  function build3DSign(text) {
    const group = new THREE.Group();

    // Post
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a3b21 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(0, 0.5, 0);
    group.add(post);

    // Signboard: simple box with rounded look via scale
    const boardGeo = new THREE.BoxGeometry(1.4, 0.45, 0.08);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x4b2f1f });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 0.95, 0);
    group.add(board);

    // Create a canvas for the text but use it as a texture applied to a thin plane embedded on the board face,
    // this ensures the sign is a 3D object (board + stick) but with crisp text.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4b2f1f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 12);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipMapLinearFilter;

    const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.42), textMat);
    textPlane.position.set(0, 0.95, 0.0451); // slightly above front face
    group.add(textPlane);

    // Make sign non-pickable by overriding raycast for the group children (so click handling uses our custom raycast)
    group.traverse(o => { if (o.isMesh) o.raycast = function() { return []; }; });

    // For click detection we will add a separate invisible pickable plane with custom userData
    const pickGeo = new THREE.PlaneGeometry(1.4, 0.45);
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    const pick = new THREE.Mesh(pickGeo, pickMat);
    pick.position.copy(textPlane.position);
    pick.userData.isMegafixSign = true;
    group.add(pick);

    return group;
  }

  // Replace old 2D sign with 3D sign on stick attached to plane
  function addSignToPlane(plane) {
    if (!plane || plane.__megafix_signAdded) return;

    // build 3D sign
    const sign = build3DSign('Are you sure to travel to this seed?');

    // place sign on top center of plane with small offset forward
    sign.position.set(0, 0.9, 0);
    sign.rotation.y = 0;
    plane.add(sign);

    // Keep a quick reference for raycasting since we disabled plane.raycast previously
    if (!plane.userData.pickables) plane.userData.pickables = [];
    plane.userData.pickables.push(sign);

    // Mark added
    plane.__megafix_signAdded = true;
  }

  // handle click by doing our own raycast against pickable children (because plane.raycast is disabled)
  function handleCanvasClickForSign(evt) {
    const game = findGameInstance();
    if (!game || !game.scene || !game.camera) return;

    const plane = findPlaneInScene(game.scene);
    if (!plane || !plane.userData || !plane.userData.pickables) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0,0), game.camera);

    const pickList = [];
    plane.userData.pickables.forEach(g => {
      g.traverse(o => { if (o.userData && o.userData.isMegafixSign) pickList.push(o); });
    });

    if (pickList.length === 0) return;

    const intersects = raycaster.intersectObjects(pickList, true);
    if (intersects.length > 0) {
      showOverlay(`Are you sure to travel to this seed?`);
      evt.preventDefault && evt.preventDefault();
      evt.stopPropagation && evt.stopPropagation();
    }
  }

  // Monitor scene periodically to find planes, neutralize collision, and add 3D sign
  function monitorScene() {
    const game = findGameInstance();
    if (!game || !game.scene) {
      setTimeout(monitorScene, 700);
      return;
    }

    // Listen for canvas clicks to intercept sign interaction
    const canvas = document.getElementById('game-canvas');
    if (canvas && !canvas.__megafix_clickAdded) {
      canvas.addEventListener('click', handleCanvasClickForSign, true);
      canvas.__megafix_clickAdded = true;
    }

    // Scan for plane
    const plane = findPlaneInScene(game.scene);
    if (plane) {
      neutralizePlane(plane);
      addSignToPlane(plane);
    }

    setTimeout(monitorScene, 1200);
  }

  // Start
  setTimeout(() => {
    ensureOverlay();
    monitorScene();
  }, 800);
})();