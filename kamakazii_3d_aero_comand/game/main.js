// /game.js — application bootstrap.
// index.html loads this as <script type="module">.
import { createRenderer } from './renderer.js';
import { createWorld } from './world.js';
import { setupInput } from './controls/index.js';
import { setupUI } from './ui.js';
import { screenLoader } from './screen-loader.js';
import { dbg } from './dbg.js';

async function boot() {
  const container = document.getElementById('game');
  if (!container) {
    dbg.error('boot: #game container missing from DOM');
    return;
  }

  // 0) Preload ALL gui-states panel content synchronously before the game
  // starts. This hydrates each inlined panel shell with its visual design
  // AND functional elements from the gui-states/*.html files, so every
  // element ID the game code references exists in the DOM from the start.
  await screenLoader.preloadAll();
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

boot().catch(err => dbg.error('Kamikazzi boot failed:', err));
