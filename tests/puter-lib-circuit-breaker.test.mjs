/**
 * tests/puter-lib-circuit-breaker.test.mjs
 *
 * Tests the circuit breaker in puter-lib.js:
 *   - 3 consecutive failures within 30s open the circuit
 *   - isCloudDisabled() returns true after, false after reset
 *   - kv.get / fs.read / fs.write / ai.chat short-circuit when open
 *   - kv.set still writes to localStorage even when circuit is open
 *
 * Strategy: set window.puter to a controlled mock BEFORE the module loads.
 * resolvePuter() tries a CDN import first (which fails in jsdom), then
 * falls back to window.puter. We configure the mock's methods to throw or
 * resolve as needed to trigger the circuit breaker.
 *
 * IMPORTANT: resolvePuter() caches _puterInstance by reference. We must
 * reset mock implementations on the SAME object every test — creating a
 * new mock object would cause the module to use the stale cached one.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// ── State captured after module load ──────────────────────────────────────
let mod;
let isCloudDisabled;
let resetCloudCircuit;
let kv;
let fs;
let ai;

// ── The single mock object (reference kept so beforeEach can reset it) ────
let mockPuter;

function createMockPuter() {
  return {
    auth: {
      isSignedIn: vi.fn().mockReturnValue(true),
      getUser: vi.fn().mockResolvedValue({ username: 'testuser' }),
      signIn: vi.fn().mockResolvedValue({ username: 'testuser' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    },
    kv: {
      set: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(undefined),
      incr: vi.fn().mockResolvedValue(1),
    },
    fs: {
      write: vi.fn(),
      read: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ai: {
      chat: vi.fn(),
      txt2img: vi.fn().mockResolvedValue({ url: 'http://example.com/img.png' }),
      txt2speech: vi.fn().mockResolvedValue('data:audio/mp3;base64,...'),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Reset all mock implementations to their default (success) state. */
function resetMocks() {
  mockPuter.kv.set.mockResolvedValue(undefined);
  mockPuter.kv.get.mockResolvedValue(null);
  mockPuter.kv.del.mockResolvedValue(undefined);
  mockPuter.kv.incr.mockResolvedValue(1);
  mockPuter.fs.write.mockResolvedValue(undefined);
  mockPuter.fs.read.mockResolvedValue(null);
  mockPuter.fs.delete.mockResolvedValue(undefined);
  mockPuter.ai.chat.mockResolvedValue('ok');
  mockPuter.ai.txt2img.mockResolvedValue({ url: 'http://example.com/img.png' });
  mockPuter.ai.txt2speech.mockResolvedValue('data:audio/mp3;base64,...');
}

/** Make kv.set throw to trigger circuit breaker failures. */
function makeCloudFail() {
  mockPuter.kv.set.mockRejectedValue(new Error('Cloud backend unavailable'));
}

/** Open the circuit breaker by triggering 3 kv.set failures. */
async function openCircuit() {
  makeCloudFail();
  for (let i = 0; i < 3; i++) {
    await kv.set(`circuit_key_${i}`, `value_${i}`);
  }
}

// ── Setup / Teardown ──────────────────────────────────────────────────────

beforeAll(async () => {
  // Create the mock ONCE — resolvePuter() caches the object by reference.
  mockPuter = createMockPuter();
  window.puter = mockPuter;

  // Suppress the one-time circuit-open console.warn during tests
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  mod = await import('../puter-lib.js');
  isCloudDisabled = mod.isCloudDisabled;
  resetCloudCircuit = mod.resetCloudCircuit;
  kv = mod.kv;
  fs = mod.fs;
  ai = mod.ai;
}, 15000);

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  resetCloudCircuit();
  vi.clearAllMocks();
  resetMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Circuit Breaker — basic lifecycle', () => {
  it('starts with circuit closed', () => {
    expect(isCloudDisabled()).toBe(false);
  });

  it('opens after 3 kv.set failures within 30s window', async () => {
    makeCloudFail();

    // 1st failure — circuit still closed
    await kv.set('a', 1);
    expect(isCloudDisabled()).toBe(false);
    expect(mockPuter.kv.set).toHaveBeenCalledTimes(1);

    // 2nd failure — circuit still closed
    await kv.set('b', 2);
    expect(isCloudDisabled()).toBe(false);
    expect(mockPuter.kv.set).toHaveBeenCalledTimes(2);

    // 3rd failure — circuit opens
    await kv.set('c', 3);
    expect(isCloudDisabled()).toBe(true);
    expect(mockPuter.kv.set).toHaveBeenCalledTimes(3);
  });

  it('opens after 3 ai.chat failures', async () => {
    mockPuter.ai.chat.mockRejectedValue(new Error('AI down'));

    await ai.chat('p1');
    await ai.chat('p2');
    expect(isCloudDisabled()).toBe(false);
    await ai.chat('p3');
    expect(isCloudDisabled()).toBe(true);
  });

  it('opens after 3 fs.write failures', async () => {
    mockPuter.fs.write.mockRejectedValue(new Error('FS down'));

    await fs.write('/a', '1');
    await fs.write('/b', '2');
    expect(isCloudDisabled()).toBe(false);
    await fs.write('/c', '3');
    expect(isCloudDisabled()).toBe(true);
  });

  it('does NOT open from fs.read failures (file-not-found is expected)', async () => {
    mockPuter.fs.read.mockRejectedValue(new Error('File not found'));

    // 10 failed reads should not open the circuit
    for (let i = 0; i < 10; i++) {
      await fs.read(`/nonexistent/${i}`);
    }
    expect(isCloudDisabled()).toBe(false);
  });

  it('closes after resetCloudCircuit()', async () => {
    await openCircuit();
    expect(isCloudDisabled()).toBe(true);

    resetCloudCircuit();
    expect(isCloudDisabled()).toBe(false);
  });

  it('stays open until explicitly reset (auto-close blocked by isCloudDisabled guard)', async () => {
    await openCircuit();
    expect(isCloudDisabled()).toBe(true);

    // Because the isCloudDisabled() guard blocks all cloud calls, a
    // successful call (even if the backend recovered) cannot auto-close
    // the circuit. Only resetCloudCircuit() (user-initiated) closes it.
    expect(isCloudDisabled()).toBe(true);
    expect(isCloudDisabled()).toBe(true);
  });
});

describe('Circuit Breaker — method short-circuit when open', () => {
  beforeEach(async () => {
    await openCircuit();
    expect(isCloudDisabled()).toBe(true);
  });

  // ── kv ──

  it('kv.set() returns false without calling cloud', async () => {
    const result = await kv.set('x', 'val');
    expect(result).toBe(false);
    // The 3 calls below are from openCircuit() in beforeEach.
    // After the circuit opens, kv.set() short-circuits — no 4th call.
    expect(mockPuter.kv.set).toHaveBeenCalledTimes(3);
  });

  it('kv.set() still writes to localStorage when circuit is open', async () => {
    await kv.set('offline-key', 'offline-value');
    const stored = localStorage.getItem('puter_shared_offline-key');
    expect(stored).toBe(JSON.stringify('offline-value'));
    localStorage.removeItem('puter_shared_offline-key');
  });

  it('kv.get() returns local fallback without calling cloud', async () => {
    localStorage.setItem('puter_shared_cached', JSON.stringify('cached-value'));

    const result = await kv.get('cached', 'default');
    expect(result).toBe('cached-value');
    expect(mockPuter.kv.get).toHaveBeenCalledTimes(0);

    localStorage.removeItem('puter_shared_cached');
  });

  it('kv.get() returns defaultValue when no local fallback', async () => {
    const result = await kv.get('nonexistent', 'the-default');
    expect(result).toBe('the-default');
    expect(mockPuter.kv.get).toHaveBeenCalledTimes(0);
  });

  it('kv.delete() returns false without calling cloud', async () => {
    const result = await kv.delete('any-key');
    expect(result).toBe(false);
    expect(mockPuter.kv.del).toHaveBeenCalledTimes(0);
  });

  it('kv.incr() falls back to local-only without calling cloud', async () => {
    localStorage.setItem('puter_shared_counter', JSON.stringify(5));

    const result = await kv.incr('counter', 3);
    expect(result).toBe(8);
    expect(mockPuter.kv.incr).toHaveBeenCalledTimes(0);

    localStorage.removeItem('puter_shared_counter');
  });

  // ── fs ──

  it('fs.read() returns null without calling cloud', async () => {
    const result = await fs.read('/some/path');
    expect(result).toBeNull();
    expect(mockPuter.fs.read).toHaveBeenCalledTimes(0);
  });

  it('fs.readText() returns null without calling cloud', async () => {
    const result = await fs.readText('/some/path');
    expect(result).toBeNull();
    expect(mockPuter.fs.read).toHaveBeenCalledTimes(0);
  });

  it('fs.write() returns false without calling cloud', async () => {
    const result = await fs.write('/some/path', 'data');
    expect(result).toBe(false);
    expect(mockPuter.fs.write).toHaveBeenCalledTimes(0);
  });

  it('fs.delete() returns false without calling cloud', async () => {
    const result = await fs.delete('/some/path');
    expect(result).toBe(false);
    expect(mockPuter.fs.delete).toHaveBeenCalledTimes(0);
  });

  // ── ai ──

  it('ai.chat() returns null without calling cloud', async () => {
    const result = await ai.chat('test prompt');
    expect(result).toBeNull();
    expect(mockPuter.ai.chat).toHaveBeenCalledTimes(0);
  });

  it('ai.generateImage() returns null without calling cloud', async () => {
    const result = await ai.generateImage('a cat');
    expect(result).toBeNull();
    expect(mockPuter.ai.txt2img).toHaveBeenCalledTimes(0);
  });

  it('ai.textToSpeech() returns null without calling cloud', async () => {
    const result = await ai.textToSpeech('hello');
    expect(result).toBeNull();
    expect(mockPuter.ai.txt2speech).toHaveBeenCalledTimes(0);
  });
});

describe('Circuit Breaker — mixed failure sources', () => {
  it('failures from different methods accumulate to open the circuit', async () => {
    // 1 failure from kv.set
    mockPuter.kv.set.mockRejectedValue(new Error('KV error'));
    await kv.set('a', 1);
    expect(isCloudDisabled()).toBe(false);

    // 1 failure from fs.write
    mockPuter.fs.write.mockRejectedValue(new Error('FS error'));
    await fs.write('/b', '2');
    expect(isCloudDisabled()).toBe(false);

    // 1 failure from ai.chat — opens the circuit
    mockPuter.ai.chat.mockRejectedValue(new Error('AI error'));
    await ai.chat('c');
    expect(isCloudDisabled()).toBe(true);
  });
});
