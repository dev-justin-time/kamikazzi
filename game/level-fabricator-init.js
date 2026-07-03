// game/level-fabricator-init.js
// Integration wrapper that manages the Level Fabricator lifecycle within the game

let _lfApp = null;
let _lfPausedWorld = null;
let _lfRendererObj = null;

export async function mountLevelFabricator(worldObj, rendererObj) {
    if (_lfApp) return;

    _lfPausedWorld = worldObj;
    _lfRendererObj = rendererObj;

    if (worldObj && worldObj.state) {
        worldObj.state.paused = true;
    }
    if (worldObj && worldObj.stopLoop) {
        worldObj.stopLoop();
    }

    const overlay = document.getElementById('levelFabricatorOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }

    try {
        const { LevelFabricatorApp } = await import('./level-fabricator/core/App.js');
        _lfApp = new LevelFabricatorApp('sg-container');
        // Apply DOM translations for the dynamically-mounted overlay
        try {
            const { applyDOMTranslations } = await import('./locale.js');
            applyDOMTranslations();
        } catch (_) {}
    } catch (err) {
        console.error('Failed to mount Level Fabricator:', err);
        const container = document.getElementById('sg-container');
        if (container) {
            container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ffb4ab;font-family:'JetBrains Mono',monospace;font-size:14px;text-align:center;padding:20px;">
                <div><div role="alert" aria-live="assertive">Failed to initialize Level Fabricator.<br/><span style="font-size:11px;color:rgba(152,203,255,0.6);">${err.message || 'Unknown error'}</span></div>
            </div>`;
        }
    }
}

export function destroyLevelFabricator() {
    if (!_lfApp) return;

    try {
        _lfApp.destroy();
    } catch (e) {
        console.warn('Error destroying Level Fabricator:', e);
    }
    _lfApp = null;

    const overlay = document.getElementById('levelFabricatorOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }

    if (_lfPausedWorld) {
        const w = _lfPausedWorld;
        if (w.state) {
            w.state.paused = false;
        }
        if (w.startLoop && _lfRendererObj) {
            w.startLoop(_lfRendererObj);
        }
    }

    const startScreen = document.getElementById('startScreen');
    if (startScreen && startScreen.classList.contains('hidden')) {
        if (_lfPausedWorld && _lfPausedWorld.state) {
            _lfPausedWorld.state.running = true;
        }
    }
    _lfPausedWorld = null;
}
