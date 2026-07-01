// /game.js — application bootstrap.
// index.html loads this as <script type="module">. Missing previously and was a silent boot breaker.
import { createRenderer } from './game/renderer.js';
import { createWorld } from './game/world.js';
import { setupInput } from './game/input.js';
import { setupUI } from './game/ui.js';

async function boot() {
  const container = document.getElementById('game');
  if (!container) {
    console.error('boot: #game container missing from DOM');
    return;
  }

  // 1) WebGL renderer + scene/camera
  const rendererObj = createRenderer(container);

  // 2) World: lighting, ground, clouds, plane, managers, state
  const worldObj = await createWorld({
    scene: rendererObj.scene,
    camera: rendererObj.camera,
    domElement: rendererObj.domElement,
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
