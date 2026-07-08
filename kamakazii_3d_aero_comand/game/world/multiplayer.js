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
 * @returns {{ initMultiplayer: Function, pushPresence: Function, dispose: Function, peersMeshes: object, room: object|null }}
 */
export function createMultiplayerManager(deps) {
  const { scene, state, plane, createMultiplayerRoom, THREE } = deps;
  let room = null;
  const peersMeshes = {};
  let presenceAccumulator = 0;

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

  function pushPresence(force = false) {
    if (!room || typeof room.updatePresence !== 'function') return;
    room.updatePresence({
      x: plane.position.x, y: plane.position.y, z: plane.position.z,
      score: Math.floor(state.score), running: !!state.running,
    }).then(() => {
      presenceAccumulator = 0;
    }).catch(e => {
      if (force) console.warn('pushPresence failed', e);
    });
  }

  async function initMultiplayer() {
    try {
      room = await createMultiplayerRoom('kamikazzi-lobby');
      if (!room) return;
      pushPresence(true);
      room.startHeartbeat();

      room.subscribePresence(currentPresence => {
        Object.keys(currentPresence).forEach(clientId => {
          if (clientId === room.clientId) return;
          const p = currentPresence[clientId];
          if (!p) return;
          if (!peersMeshes[clientId]) {
            const m = makePeerMarker();
            const peerUsername = p.username;
            if (peerUsername) {
              let h = 0;
              for (let i = 0; i < peerUsername.length; i++) h = (h << 5) - h + peerUsername.charCodeAt(i);
              const col = 0x444444 + (Math.abs(h) % 0xdddddd);
              m.traverse(n => { if (n.isMesh) n.material.color.setHex(col); });
            }
            scene.add(m);
            peersMeshes[clientId] = m;
          }
          const marker = peersMeshes[clientId];
          marker.position.x += (p.x - marker.position.x) * PEER_LERP;
          marker.position.y += (p.y - marker.position.y) * PEER_LERP;
          marker.position.z += (p.z - marker.position.z) * PEER_LERP;
          const s = PEER_BASE_SCALE + Math.min(1.5, (p.score || 0) / PEER_SCORE_DIVISOR);
          marker.scale.setScalar(s);
        });

        Object.keys(peersMeshes).forEach(clientId => {
          if (!currentPresence[clientId]) {
            removeAndDispose(peersMeshes[clientId]);
            delete peersMeshes[clientId];
          }
        });
      });
    } catch (e) {
      console.warn('initMultiplayer failed', e);
      room = null;
    }
  }

  function dispose() {
    if (room && typeof room.dispose === 'function') {
      try { room.dispose(); } catch (_) {}
    }
    Object.values(peersMeshes).forEach(m => removeAndDispose(m));
    for (const key in peersMeshes) delete peersMeshes[key];
  }

  return {
    initMultiplayer,
    pushPresence,
    peersMeshes,
    room,
    presenceAccumulator,
    dispose,
  };
}
