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

  const renderer = new THREE.WebGLRenderer({ antialias: true });
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