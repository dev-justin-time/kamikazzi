import * as THREE from 'https://esm.sh/three@0.128.0';

export function createPowerupManager(scene) {
  const powerups = [];

  function clear() {
    powerups.forEach(p => {
      scene.remove(p.mesh);
      // FIX: Dispose of geometry and material to prevent GPU memory leaks
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
    });
    powerups.length = 0;
  }

  function spawn(z, type = 'shield') {
    const color = type === 'shield' ? 0x66ffff : 0xfff176;
    const geo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 40, 2 + Math.random() * 10, z);
    mesh.userData = { type };
    scene.add(mesh);
    powerups.push({ mesh, type });
    return mesh;
  }

  // FIX: Added update method so powerups can spin/bob in the main game loop
  function update(delta) {
    powerups.forEach(p => {
      p.mesh.rotation.x += delta * 2;
      p.mesh.rotation.y += delta * 3;
    });
  }

  return { clear, spawn, update, powerups };
}