/*
  model_importers.js
  Title: Model Importers
  Purpose: Small utilities to register additional importers or file-preprocessing hooks.
*/

export function registerImporter(name, handler) {
  if (!window._customImporters) window._customImporters = {};
  window._customImporters[name] = handler;
  return true;
}

export function listImporters() {
  return Object.keys(window._customImporters || {});
}