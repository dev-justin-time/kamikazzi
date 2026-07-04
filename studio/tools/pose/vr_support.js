/*
  vr_support.js
  Title: VR Support
  Purpose: Minimal helpers to detect WebXR availability and expose a toggle hook.
*/

export function isWebXRAvailable() {
  return !!(navigator.xr && navigator.xr.isSessionSupported);
}

export function attachVrToggleButton(parentEl = document.body) {
  const btn = document.createElement('button');
  btn.textContent = 'Enter VR';
  btn.style.position = 'fixed';
  btn.style.bottom = '80px';
  btn.style.right = '20px';
  btn.style.zIndex = 1000;
  btn.addEventListener('click', async () => {
    if (!navigator.xr) {
      alert('WebXR not available in this browser.');
      return;
    }
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (!supported) {
        alert('Immersive VR not supported on this device.');
        return;
      }
      // This module does not start a session; it only exposes the hook.
      alert('VR support detected — implement session start in your app.');
    } catch (e) {
      console.error('VR check failed', e);
    }
  });
  parentEl.appendChild(btn);
  return btn;
}