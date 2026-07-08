/* game/world/multiplayer.js
   Extracted from world.js — Puter KV-based multiplayer presence and
   peer marker rendering.
*/

import { removeAndDispose } from './shared.js';

const PEER_LERP = 0.2;
const PEER_BASE_SCALE = 0.8;
const PEER_SCORE_DIVISOR = 200;

/**
 * Create the multiplayer manager for a world scene.
 * @param {object} deps
 * @param {THREE.Scene} deps.scene
 * @param {object} deps.state  - world game state (needs plane.position, state.score, state.running)
 * @param {THREE.Object3D} deps.plane
 * @param {Function} deps.createMultiplayerRoom - from puter-client.js
 * @param {THREE} deps.THREE - Three.js module
 * @returns {{ initMultiplayer: Function, pushPresence: Function, dispose: Function, peersMeshes: object, room: object|null, presenceAccumulator: number }}
 */
export function createMultiplayerManager(deps) {
  const { scene, state, plane, createMultiplayerRoom, THREE } = deps;

  // Use a plain object so that `room` is a live mutable property
  // (returned by reference, not copied by value at construction time).
  const mgr = {
    room: null,
    peersMeshes: {},
    presenceAccumulator: 0,

    initMultiplayer: null,
    pushPresence: null,
    dispose: null,
  };

  function makePeerMarker() {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 8), mat);
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), mat);
    head.position.set(0, 0.2, 0.6);
    g.add(head);
    return g;
  }

  mgr.pushPresence = function pushPresence(force = false) {
    if (!mgr.room || typeof mgr.room.updatePresence !== 'function') return;
    mgr.room.updatePresence({
      x: plane.position.x, y: plane.position.y, z: plane.position.z,
      score: Math.floor(state.score), running: !!state.running,
    }).then(() => {
      mgr.presenceAccumulator = 0;
    }).catch(e => {
      if (force) console.warn('pushPresence failed', e);
    });
  };

  mgr.initMultiplayer = async function initMultiplayer() {
    try {
      mgr.room = await createMultiplayerRoom('kamikazzi-lobby');
      if (!mgr.room) return;
      mgr.pushPresence(true);
      mgr.room.startHeartbeat();

      mgr.room.subscribePresence(currentPresence => {
        Object.keys(currentPresence).forEach(clientId => {
          if (clientId === mgr.room.clientId) return;
          const p = currentPresence[clientId];
          if (!p) return;
          if (!mgr.peersMeshes[clientId]) {
            const m = makePeerMarker();
            const peerUsername = p.username;
            if (peerUsername) {
              let h = 0;
              for (let i = 0; i < peerUsername.length; i++) h = (h << 5) - h + peerUsername.charCodeAt(i);
              const col = 0x444444 + (Math.abs(h) % 0xdddddd);
              m.traverse(n => { if (n.isMesh) n.material.color.setHex(col); });
            }
            scene.add(m);
            mgr.peersMeshes[clientId] = m;
          }
          const marker = mgr.peersMeshes[clientId];
          marker.position.x += (p.x - marker.position.x) * PEER_LERP;
          marker.position.y += (p.y - marker.position.y) * PEER_LERP;
          marker.position.z += (p.z - marker.position.z) * PEER_LERP;
          const s = PEER_BASE_SCALE + Math.min(1.5, (p.score || 0) / PEER_SCORE_DIVISOR);
          marker.scale.setScalar(s);
        });

        Object.keys(mgr.peersMeshes).forEach(clientId => {
          if (!currentPresence[clientId]) {
            removeAndDispose(mgr.peersMeshes[clientId]);
            delete mgr.peersMeshes[clientId];
          }
        });
      });
    } catch (e) {
      console.warn('initMultiplayer failed', e);
      mgr.room = null;
    }
  };

  mgr.dispose = function dispose() {
    if (mgr.room && typeof mgr.room.dispose === 'function') {
      try { mgr.room.dispose(); } catch (_) {}
    }
    Object.values(mgr.peersMeshes).forEach(m => removeAndDispose(m));
    for (const key in mgr.peersMeshes) delete mgr.peersMeshes[key];
  };

  return mgr;
}
