import * as THREE from 'https://esm.sh/three@0.128.0';

// FIX: Removed 'async' as there are no 'await' calls inside
export function createRenderer(container) {
  // FIX: Use container dimensions so it works if embedded in a div
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 600);
  
  // CRITICAL FIX: Set camera position so the scene isn't black!
  camera.position.set(0, 5, 15); 
  camera.lookAt(0, 0, 0);

  // alpha: true so the main scene renders transparent over the bg scene.
  // world.js renders an ortho background picture first, then the main scene
  // on top with autoClear=false; without alpha the main scene's color buffer
  // would overwrite the level photo.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x87ceeb, 0);   // sky-cyan pre-load color, alpha 0 (transparent)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // FIX: Correct color space for proper brightness (Three.js 0.128)
  renderer.outputEncoding = THREE.sRGBEncoding;

  container.appendChild(renderer.domElement);

  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return {
    renderer,
    scene,
    camera,
    domElement: renderer.domElement,
    onResize
  };
}