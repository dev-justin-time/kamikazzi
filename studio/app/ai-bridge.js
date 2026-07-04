/**
 * AI Bridge — WebSim.ai + Puter.js dual-platform.
 * Runs requests in parallel across both, returns fastest response.
 * Falls through if both fail.
 */
export class AIBridge {
  constructor() {
    this._ready = false;
    this._models = [];
  }

  async init() {
    // Detect available platforms
    const available = [];
    if (typeof websim !== 'undefined' && websim.ai) available.push('websim');
    if (typeof puter !== 'undefined' && puter.ai) available.push('puter');
    this._models = available;
    this._ready = true;
    console.log(`[AI Bridge] Ready — platforms: ${available.join(', ') || 'none'}`);
  }

  isReady() { return this._ready; }
  hasModel(name) { return this._models.includes(name); }

  async request({ prompt, system, platforms = ['websim', 'puter'], timeout = 15000, fallback = null }) {
    const promises = platforms
      .filter(p => this._models.includes(p))
      .map(p => this._call(p, prompt, system, timeout));

    if (promises.length === 0) {
      return fallback ? fallback() : { error: 'No AI platform available', content: null };
    }

    // Race all platforms — first response wins
    try {
      const winner = await Promise.race(promises);
      return winner;
    } catch (err) {
      // All failed — try fallback
      if (fallback) return fallback();
      return { error: err.message, content: null };
    }
  }

  async _call(platform, prompt, system, timeout) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);

    try {
      let result;
      if (platform === 'websim') {
        result = await websim.ai.complete(prompt, { system, signal: ac.signal });
      } else if (platform === 'puter') {
        result = await puter.ai.complete(prompt, { system, signal: ac.signal });
      }
      return { platform, content: result?.content || result, error: null };
    } catch (err) {
      return { platform, content: null, error: err.message };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const aiBridge = new AIBridge();
