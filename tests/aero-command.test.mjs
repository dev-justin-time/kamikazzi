import { describe, it, expect } from 'vitest';

// These tests validate the structure and internal consistency of key
// Aero Command modules. Full runtime testing requires the browser
// (canvas, WebGL, audio) and is done via Playwright E2E.

describe('Aero Command — project structure', () => {
  it('should have valid HTML entry points', async () => {
    const { readFileSync } = await import('fs');
    const index = readFileSync('kamakazii_3d_aero_comand/index.html', 'utf8');
    expect(index).toContain('<!DOCTYPE html>');
    expect(index).toContain('<html');
    expect(index).toContain('</html>');
  });

  it('should have essential CSS and config files', async () => {
    const { existsSync } = await import('fs');
    const files = [
      'kamakazii_3d_aero_comand/styles/main.css',
      'kamakazii_3d_aero_comand/manifest.json',
      'kamakazii_3d_aero_comand/sw.js',
      'kamakazii_3d_aero_comand/serve_local.js',
    ];
    for (const f of files) {
      expect(existsSync(f), `${f} should exist`).toBe(true);
    }
  });

  it('should have game/puter/kv.js module', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('kamakazii_3d_aero_comand/game/puter/kv.js', 'utf8');
    expect(content).toContain('export');
    expect(content).toContain('function');
  });

  it('should have game/world.js with exports', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('kamakazii_3d_aero_comand/game/world.js', 'utf8');
    expect(content).toContain('export');
  });
});

describe('Aero Command — serve_local.js', () => {
  it('should exist and be valid', async () => {
    const { readFileSync, existsSync } = await import('fs');
    expect(existsSync('kamakazii_3d_aero_comand/serve_local.js')).toBe(true);
    const content = readFileSync('kamakazii_3d_aero_comand/serve_local.js', 'utf8');
    expect(content).toContain('http');
  });
});
