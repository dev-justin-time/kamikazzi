// /game.js — application bootstrap.
// index.html loads this as <script type="module">. Missing previously and was a silent boot breaker.
import { createRenderer } from './renderer.js';
import { createWorld } from './world.js';
import { setupInput } from './controls/index.js';
import { setupUI } from './ui.js';

async function boot() {
  const container = document.getElementById('game');
  if (!container) {
    console.error('boot: #game container missing from DOM');
    return;
  }

  // 1) WebGL renderer + scene/camera
  const rendererObj = createRenderer(container);

  // 2) World: lighting, ground, clouds, plane, managers, state
  // Pass `planeModelUrl` so the GLB at /assets/model/stylized_ww1_plane.glb is
  // attempted first; createWorld falls back to the procedural plane on failure.
  const worldObj = await createWorld({
    scene: rendererObj.scene,
    camera: rendererObj.camera,
    domElement: rendererObj.domElement,
    planeModelUrl: '/assets/model/stylized_ww1_plane.glb',
  });

  // 3) Input — keep game/state.plane reference for planeController bridge inside world.js
  setupInput({ domElement: rendererObj.domElement, world: worldObj });

  // 4) UI overlay wiring (start, retry, score, crash image)
  setupUI({ world: worldObj, rendererObj });

  // Resize hook — keep the canvas in sync with the viewport
  window.addEventListener('resize', () => rendererObj.onResize());

  // Expose for debugging / experimentation
  window.__missionLog = { rendererObj, worldObj };
}

boot().catch(err => console.error('Kamikazzi boot failed:', err));
