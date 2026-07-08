// /game.js — application bootstrap.
// index.html loads this as <script type="module">.
import { createRenderer } from './renderer.js';
import { createWorld } from './world.js';
import { setupInput } from './controls/index.js';
import { setupUI } from './ui.js';
import { screenLoader } from './screen-loader.js';

async function boot() {
  const container = document.getElementById('game');
  if (!container) {
    console.error('boot: #game container missing from DOM');
    return;
  }

  // 0) Initialize screen-loader: loads gui-states styles + starts auto-inject
  // MutationObserver. Overlays are automatically injected with their
  // gui-states Tailwind designs when they become visible.
  screenLoader.init().catch(() => {});

  // 1) WebGL renderer + scene/camera
  const rendererObj = createRenderer(container);

  // 2) World: lighting, ground, clouds, plane, managers, state
  const worldObj = await createWorld({
    scene: rendererObj.scene,
    camera: rendererObj.camera,
    domElement: rendererObj.domElement,
    planeModelUrl: '/assets/model/rain_1/scene.gltf',
  });

  // 3) Input
  setupInput({ domElement: rendererObj.domElement, world: worldObj });

  // 4) UI overlay wiring
  setupUI({ world: worldObj, rendererObj });

  // Resize hook
  window.addEventListener('resize', () => rendererObj.onResize());

  // Expose for debugging
  window.__missionLog = { rendererObj, worldObj };
}

boot().catch(err => console.error('Kamikazzi boot failed:', err));
