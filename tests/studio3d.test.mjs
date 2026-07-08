import { describe, it, expect } from 'vitest';

describe('Studio 3D — project structure', () => {
  it('should have essential entry points', async () => {
    const { existsSync } = await import('fs');
    const entries = [
      'kamakazii_studio3D/app/studio.js',
      'kamakazii_studio3D/app/engine.js',
      'kamakazii_studio3D/app/puter-client.js',
      'kamakazii_studio3D/app/simple.js',
      'kamakazii_studio3D/serve_local.js',
    ];
    for (const f of entries) {
      expect(existsSync(f), `${f} should exist`).toBe(true);
    }
  });

  it('should have CloudSystem and PluginRegistry classes', async () => {
    const { readFileSync } = await import('fs');
    const cloud = readFileSync('kamakazii_studio3D/systems/CloudSystem.js', 'utf8');
    expect(cloud).toContain('class CloudSystem');

    const plugins = readFileSync('kamakazii_studio3D/marketplace/PluginRegistry.js', 'utf8');
    expect(plugins).toContain('class PluginRegistry');
  });

  it('should export puter-client API surface', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('kamakazii_studio3D/app/puter-client.js', 'utf8');
    expect(content).toContain('export');
    expect(content).toContain('generateImage');
    expect(content).toContain('speak');
    expect(content).toContain('initPuter');
    expect(content).toContain('getUsername');
  });

  it('should have tools entry points', async () => {
    const { existsSync } = await import('fs');
    const tools = [
      'kamakazii_studio3D/tools/pose/index.html',
      'kamakazii_studio3D/tools/map-maker/index.html',
      'kamakazii_studio3D/tools/blender/script.js',
    ];
    for (const f of tools) {
      expect(existsSync(f), `${f} should exist`).toBe(true);
    }
  });
});
