import { describe, it, expect } from 'vitest';

describe('Vector Strike OMNI — project structure', () => {
  it('should have essential entry points', async () => {
    const { existsSync } = await import('fs');
    const entries = [
      'kamasazii_vecter_omega3d/index.html',
      'kamasazii_vecter_omega3d/serve_local.js',
      'kamasazii_vecter_omega3d/style.css',
      'kamasazii_vecter_omega3d/star_sparrow_builder.js',
    ];
    for (const f of entries) {
      expect(existsSync(f), `${f} should exist`).toBe(true);
    }
  });

  it('should have core game modules', async () => {
    const { existsSync } = await import('fs');
    const modules = [
      'kamasazii_vecter_omega3d/js/network.js',
      'kamasazii_vecter_omega3d/js/state.js',
      'kamasazii_vecter_omega3d/js/renderer.js',
      'kamasazii_vecter_omega3d/js/analytics.js',
      'kamasazii_vecter_omega3d/js/main.js',
    ];
    for (const f of modules) {
      expect(existsSync(f), `${f} should exist`).toBe(true);
    }
  });

  it('should expose auth and leaderboard functions in network.js', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('kamasazii_vecter_omega3d/js/network.js', 'utf8');
    expect(content).toContain('export async function signIn');
    expect(content).toContain('export async function signOut');
    expect(content).toContain('export async function submitScore');
    expect(content).toContain('export async function getLeaderboard');
    expect(content).toContain('export async function getBestScore');
  });

  it('should have build scripts in Cargo.toml', async () => {
    const { readFileSync, existsSync } = await import('fs');
    expect(existsSync('kamasazii_vecter_omega3d/Cargo.toml')).toBe(true);
    const cargo = readFileSync('kamasazii_vecter_omega3d/Cargo.toml', 'utf8');
    expect(cargo).toContain('[package]');
  });
});
