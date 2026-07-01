export function applyIdeasConfig({ scene, ground, state }) {
  try {
    const stored = localStorage.getItem('skyDodgerIdeas');
    const list = stored ? JSON.parse(stored) : [];
    const combined = list.map(i => (i.idea || '').toLowerCase()).join(' ');
    if (combined.includes('night') || combined.includes('dark')) {
      // night: set dark color background and fog
      try {
        scene.background = new (window.THREE || self.THREE).Color(0x03122b);
      } catch (e) {
        // noop - keep existing background if Color not available
      }
      scene.fog = new (window.THREE || self.THREE).Fog(0x03122b, 40, 200);
      if (ground && ground.material) ground.material.color.set(0x223322);
    } else {
      // day: prefer photographic background if it's been loaded, otherwise fallback to sky color
      try {
        if (window.__skyBackgroundTexture) {
          scene.background = window.__skyBackgroundTexture;
        } else {
          scene.background = new (window.THREE || self.THREE).Color(0x87ceeb);
        }
      } catch (e) {
        try { scene.background = new (window.THREE || self.THREE).Color(0x87ceeb); } catch (e2) {}
      }
      scene.fog = new (window.THREE || self.THREE).Fog(0x87ceeb, 60, 240);
      if (ground && ground.material) ground.material.color.set(0x43d65a);
    }
    state._ideas_enablePowerups = combined.includes('powerup') || combined.includes('shield') || combined.includes('speed boost');
  } catch (e) {
    state._ideas_enablePowerups = false;
  }
}