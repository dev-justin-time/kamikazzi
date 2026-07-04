/**
 * LRU cache with optional TTL for expensive operations.
 */
export class StudioCache {
  constructor(maxSize = 100) {
    this._max = maxSize;
    this._map = new Map();
    this._stats = { hits: 0, misses: 0, evictions: 0 };
  }

  get(key) {
    if (!this._map.has(key)) { this._stats.misses++; return undefined; }
    const entry = this._map.get(key);
    if (entry.ttl && Date.now() > entry.ttl) {
      this._map.delete(key);
      this._stats.misses++;
      return undefined;
    }
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, entry);
    this._stats.hits++;
    return entry.value;
  }

  set(key, value, ttlMs = 0) {
    if (this._map.has(key)) this._map.delete(key);
    else if (this._map.size >= this._max) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
      this._stats.evictions++;
    }
    this._map.set(key, { value, ttl: ttlMs ? Date.now() + ttlMs : 0 });
  }

  has(key) { return this._map.has(key) && (!this._map.get(key).ttl || Date.now() <= this._map.get(key).ttl); }

  invalidate(pattern) {
    if (!pattern) { this._map.clear(); return; }
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    for (const key of this._map.keys()) {
      if (regex.test(key)) this._map.delete(key);
    }
  }

  get size() { return this._map.size; }
  get stats() { return { ...this._stats, size: this._map.size }; }
}

export const cache = new StudioCache(200);
