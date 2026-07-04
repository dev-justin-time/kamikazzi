/**
 * Shared reactive state — all features read/write through this.
 */
export class StudioState {
  constructor() {
    this._data = {};
    this._subscribers = {};
  }

  get(key) { return this._data[key]; }

  set(key, value) {
    this._data[key] = value;
    this._notify(key, value);
  }

  subscribe(key, fn) {
    (this._subscribers[key] = this._subscribers[key] || []).push(fn);
    return () => this._unsubscribe(key, fn);
  }

  has(key) { return key in this._data; }

  keys() { return Object.keys(this._data); }

  _notify(key, value) {
    (this._subscribers[key] || []).forEach(fn => fn(value, key));
  }

  _unsubscribe(key, fn) {
    const arr = this._subscribers[key];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }

  /** Bulk update without redundant notifications */
  patch(updates) {
    Object.entries(updates).forEach(([k, v]) => { this._data[k] = v; });
    Object.entries(updates).forEach(([k, v]) => this._notify(k, v));
  }
}

export const state = new StudioState();
