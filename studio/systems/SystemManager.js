export class SystemManager {
  constructor(editor) {
    this.editor = editor;
    this.systems = {};
    this.initOrder = [
      'physicsSystem',
      'proceduralSystem',
      'sculptSystem',
      'texturePaintSystem',
      'vertexPaintSystem',
      'nodeEditorSystem',
      'audioSystem',
      'cloudSystem'
    ];
  }

  // Register an instantiated system under a key
  register(key, instance) {
    if (!key || !instance) return;
    this.systems[key] = instance;
    // attach to editor for backward compatibility
    this.editor[key] = instance;
  }

  // Safe init helper used to call init() if exists, with try/catch
  async safeInit(key) {
    const s = this.systems[key];
    if (!s) return;
    try {
      if (typeof s.init === 'function') {
        await s.init();
      }
    } catch (e) {
      console.warn(`SystemManager.safeInit failed for ${key}:`, e);
    }
  }

  // Initialize all registered systems in the canonical order
  async initAll() {
    for (const key of this.initOrder) {
      if (this.systems[key]) {
        await this.safeInit(key);
      }
    }
  }

  // Optional: call update on systems that expose update(delta)
  updateAll(delta) {
    Object.keys(this.systems).forEach((k) => {
      const s = this.systems[k];
      try {
        if (s && typeof s.update === 'function') s.update(delta);
      } catch (e) {
        console.warn(`SystemManager.updateAll: update failed for ${k}`, e);
      }
    });
  }
}