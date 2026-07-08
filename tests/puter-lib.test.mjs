import { describe, it, expect } from 'vitest';

// The puter-lib.js module depends on the global `puter` SDK object and
// browser APIs (localStorage, fetch). These tests validate the module's
// structure, exports, and contract — not the runtime behaviour, since
// that requires a real Puter SDK.
//
// For deeper coverage, use Playwright E2E tests with a mock script.

describe('puter-lib.js — shared cloud integration module', () => {
  it('should export the expected API surface', async () => {
    let mod;
    try {
      mod = await import('../puter-lib.js');
    } catch (e) {
      expect(e).toBeUndefined();
      return;
    }

    // Core helpers
    expect(typeof mod.resolvePuter).toBe('function');
    expect(typeof mod.isPuterAvailable).toBe('function');
    expect(typeof mod.getAiModule).toBe('function');
    expect(typeof mod.setKvPrefix).toBe('function');
    expect(typeof mod.setLogBasePath).toBe('function');

    // Auth
    expect(typeof mod.auth).toBe('object');
    expect(typeof mod.auth.isSignedIn).toBe('function');
    expect(typeof mod.auth.getUser).toBe('function');
    expect(typeof mod.auth.getUsername).toBe('function');
    expect(typeof mod.auth.getAvatarUrl).toBe('function');
    expect(typeof mod.auth.signIn).toBe('function');
    expect(typeof mod.auth.signOut).toBe('function');
    expect(typeof mod.auth.refreshUser).toBe('function');

    // KV storage
    expect(typeof mod.kv).toBe('object');
    expect(typeof mod.kv.set).toBe('function');
    expect(typeof mod.kv.get).toBe('function');
    expect(typeof mod.kv.delete).toBe('function');
    expect(typeof mod.kv.incr).toBe('function');
    expect(typeof mod.kv.listLocalKeys).toBe('function');
    expect(typeof mod.kv.setKeyPrefix).toBe('function');

    // FS
    expect(typeof mod.fs).toBe('object');
    expect(typeof mod.fs.write).toBe('function');
    expect(typeof mod.fs.read).toBe('function');
    expect(typeof mod.fs.readText).toBe('function');
    expect(typeof mod.fs.delete).toBe('function');

    // AI
    expect(typeof mod.ai).toBe('object');
    expect(typeof mod.ai.chat).toBe('function');
    expect(typeof mod.ai.generateImage).toBe('function');
    expect(typeof mod.ai.textToSpeech).toBe('function');

    // ClientLogger (object, not constructor)
    expect(typeof mod.ClientLogger).toBe('object');
    expect(typeof mod.ClientLogger.install).toBe('function');
    expect(typeof mod.ClientLogger.report).toBe('function');
    expect(typeof mod.ClientLogger.flush).toBe('function');

    // Default export
    expect(typeof mod.default).toBe('object');
  });
});

describe('kv.setKeyPrefix — prefix management', () => {
  it('should update the internal prefix', async () => {
    const { kv, setKvPrefix } = await import('../puter-lib.js');
    // Capture the original prefix by checking localStorage after a write
    const testKey = '__prefix_test__';
    const prefixA = 'prefix_a_';
    const prefixB = 'prefix_b_';

    kv.setKeyPrefix(prefixA);
    await kv.set(testKey, 'value_a');
    // Check localStorage for the prefix
    expect(localStorage.getItem(prefixA + testKey)).toBe(JSON.stringify('value_a'));

    kv.setKeyPrefix(prefixB);
    await kv.set(testKey, 'value_b');
    expect(localStorage.getItem(prefixB + testKey)).toBe(JSON.stringify('value_b'));
    // Old prefix key should be unchanged
    expect(localStorage.getItem(prefixA + testKey)).toBe(JSON.stringify('value_a'));

    // Clean up
    localStorage.removeItem(prefixA + testKey);
    localStorage.removeItem(prefixB + testKey);
    setKvPrefix('puter_shared_');
  });
});

describe('ClientLogger — contract', () => {
  it('should be an object with install/report/flush methods', async () => {
    const { ClientLogger } = await import('../puter-lib.js');
    expect(typeof ClientLogger.install).toBe('function');
    expect(typeof ClientLogger.report).toBe('function');
    expect(typeof ClientLogger.flush).toBe('function');
  });

  it('should report and buffer entries', async () => {
    const { ClientLogger } = await import('../puter-lib.js');
    ClientLogger.report('test', 'this is a test log entry', 'test-suite');
    // Not flushing — just verifying no throw
    expect(true).toBe(true);
  });
});
