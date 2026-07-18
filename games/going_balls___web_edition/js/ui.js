import * as THREE from 'three';

// --- Focus trap helpers ---
const FOCUSABLE = 'button, [tabindex="0"], input, select, textarea, a[href]';

function trapFocus(modal) {
    // Focus first element on open
    const initial = modal.querySelectorAll(FOCUSABLE);
    if (initial.length > 0) initial[0].focus();

    modal._trapHandler = (e) => {
        if (e.key === 'Escape') {
            modal.querySelector('.close-modal').click();
            return;
        }
        if (e.key === 'Tab') {
            // Query dynamically so it stays correct after DOM changes (e.g., purchases re-render grid)
            const els = modal.querySelectorAll(FOCUSABLE);
            if (els.length === 0) return;
            const first = els[0];
            const last = els[els.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };
    modal.addEventListener('keydown', modal._trapHandler);
}

function untrapFocus(modal) {
    if (modal._trapHandler) {
        modal.removeEventListener('keydown', modal._trapHandler);
        modal._trapHandler = null;
    }
}

function makeCardFocusable(card) {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
}

/**
 * setupUI
 */
export function setupUI(game) {
        document.getElementById('next-btn').addEventListener('click', () => game.reset());

        const setupModal = (btnId, modalId) => {
            const btn = document.getElementById(btnId);
            const modal = document.getElementById(modalId);
            const close = modal.querySelector('.close-modal');
            btn.addEventListener('click', () => {
                if (modalId === 'builder-modal') {
                    game.renderBuilder();
                } else {
                    game.renderGrids();
                }
                modal.style.display = 'flex';
                trapFocus(modal);
                if (modalId === 'builder-modal') {
                    document.body.classList.add('builder-active');
                }
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            });
            const closeModal = (e) => {
                if (e) e.stopPropagation();
                modal.style.display = 'none';
                untrapFocus(modal);
                if (modalId === 'builder-modal') {
                    document.body.classList.remove('builder-active');
                    game.clearBuilderPreview();
                }
                // Refocus the button that opened the modal
                btn.focus();
            };
            close.addEventListener('click', closeModal);
        };

        setupModal('help-btn-open', 'help-modal');
        setupModal('store-btn-open', 'store-modal');
        setupModal('skins-btn-open', 'skins-modal');
        setupModal('skies-btn-open', 'skies-modal');
        setupModal('builder-btn-open', 'builder-modal');

        // Stats modal
        const statsBtn = document.getElementById('stats-btn-open');
        const statsModal = document.getElementById('stats-modal');
        if (statsBtn && statsModal) {
            statsBtn.addEventListener('click', () => {
                game.renderStats();
                statsModal.style.display = 'flex';
                trapFocus(statsModal);
                if (document.pointerLockElement) document.exitPointerLock();
            });
            statsModal.querySelector('.close-modal').addEventListener('click', (e) => {
                e.stopPropagation();
                statsModal.style.display = 'none';
                untrapFocus(statsModal);
                statsBtn.focus();
            });
        }

        // Settings modal
        const settingsBtn = document.getElementById('settings-btn-open');
        const settingsModal = document.getElementById('settings-modal');
        if (settingsBtn && settingsModal) {
            const sensSlider = document.getElementById('setting-sensitivity');
            const sensValue = document.getElementById('sensitivity-value');
            const invertCheck = document.getElementById('setting-invert-y');
            const shadowCheck = document.getElementById('setting-shadows');
            const toggleLabel = settingsModal.querySelector('.toggle-label');

            settingsBtn.addEventListener('click', () => {
                sensSlider.value = game.saveData.cameraSensitivity || 1;
                sensValue.textContent = parseFloat(sensSlider.value).toFixed(1) + '\u00D7';
                invertCheck.checked = game.saveData.invertY || false;
                shadowCheck.checked = (game.saveData.shadowQuality || 'high') === 'high';
                if (toggleLabel) toggleLabel.textContent = shadowCheck.checked ? 'High' : 'Low';
                settingsModal.style.display = 'flex';
                trapFocus(settingsModal);
                if (document.pointerLockElement) document.exitPointerLock();
            });

            sensSlider.addEventListener('input', () => {
                const val = parseFloat(sensSlider.value);
                game.saveData.cameraSensitivity = val;
                sensValue.textContent = val.toFixed(1) + '\u00D7';
                game.save();
            });
            invertCheck.addEventListener('change', () => {
                game.saveData.invertY = invertCheck.checked;
                game.save();
            });
            shadowCheck.addEventListener('change', () => {
                game.saveData.shadowQuality = shadowCheck.checked ? 'high' : 'low';
                if (toggleLabel) toggleLabel.textContent = shadowCheck.checked ? 'High' : 'Low';
                game.save();
                const res = shadowCheck.checked ? 2048 : 1024;
                if (game._sunLight && game._sunLight.shadow) {
                    game._sunLight.shadow.mapSize.width = res;
                    game._sunLight.shadow.mapSize.height = res;
                    if (game._sunLight.shadow.map) { game._sunLight.shadow.map.dispose(); game._sunLight.shadow.map = null; }
                    game.renderer.shadowMap.needsUpdate = true;
                }
            });

            settingsModal.querySelector('.close-modal').addEventListener('click', (e) => {
                e.stopPropagation();
                settingsModal.style.display = 'none';
                untrapFocus(settingsModal);
                settingsBtn.focus();
            });
        }
}

/**
 * renderGrids
 */
export function renderGrids(game) {
        // Primary skins grid (used by SKINS modal)
        const skinsGrid = document.getElementById('skins-grid');
        if (skinsGrid) {
            skinsGrid.innerHTML = '';
            Object.keys(game.ballConfigs).forEach(key => {
                const conf = game.ballConfigs[key];
                const isUnlocked = game.saveData.unlockedBalls.includes(key);
                const isSelected = game.saveData.selectedBall === key;
                
                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                
                let previewStyle = '';
                if (conf.tex) {
                    previewStyle = `background-image: url(${conf.tex});`;
                } else {
                    const colorHex = `#${conf.color.toString(16).padStart(6, '0')}`;
                    previewStyle = `background-color: ${colorHex};`;
                }

                card.innerHTML = `
                    <div class="item-preview ball-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => game.handlePurchase('ball', key, conf.price);
                makeCardFocusable(card);
                skinsGrid.appendChild(card);
            });
        }

        // Primary skies grid (used by SKIES modal)
        const skiesGrid = document.getElementById('skies-grid');
        if (skiesGrid) {
            skiesGrid.innerHTML = '';
            Object.keys(game.skyConfigs).forEach(key => {
                const conf = game.skyConfigs[key];
                const isUnlocked = game.saveData.unlockedSkies.includes(key);
                const isSelected = game.saveData.selectedSky === key;

                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                
                let previewStyle = '';
                if (conf.tex) {
                    previewStyle = `background-image: url(${conf.tex});`;
                } else {
                    const colorHex = `#${conf.color.toString(16).padStart(6, '0')}`;
                    previewStyle = `background-color: ${colorHex};`;
                }

                card.innerHTML = `
                    <div class="item-preview sky-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => game.handlePurchase('sky', key, conf.price);
                makeCardFocusable(card);
                skiesGrid.appendChild(card);
            });
        }

        // Store modal grids (combined shop)
        const storeSkins = document.getElementById('store-skins-grid');
        if (storeSkins) {
            storeSkins.innerHTML = '';
            Object.keys(game.ballConfigs).forEach(key => {
                const conf = game.ballConfigs[key];
                const isUnlocked = game.saveData.unlockedBalls.includes(key);
                const isSelected = game.saveData.selectedBall === key;
                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                let previewStyle = '';
                if (conf.tex) previewStyle = `background-image: url(${conf.tex});`; 
                else previewStyle = `background-color: #${conf.color.toString(16).padStart(6,'0')};`;
                card.innerHTML = `
                    <div class="item-preview ball-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => game.handlePurchase('ball', key, conf.price);
                makeCardFocusable(card);
                storeSkins.appendChild(card);
            });
        }

        const storeSkies = document.getElementById('store-skies-grid');
        if (storeSkies) {
            storeSkies.innerHTML = '';
            Object.keys(game.skyConfigs).forEach(key => {
                const conf = game.skyConfigs[key];
                const isUnlocked = game.saveData.unlockedSkies.includes(key);
                const isSelected = game.saveData.selectedSky === key;
                const card = document.createElement('div');
                card.className = `item-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`;
                let previewStyle = '';
                if (conf.tex) previewStyle = `background-image: url(${conf.tex});`; 
                else previewStyle = `background-color: #${conf.color.toString(16).padStart(6,'0')};`;
                card.innerHTML = `
                    <div class="item-preview sky-preview" style="${previewStyle}"></div>
                    <div style="font-size: 14px; margin-top: 5px;">${conf.name}</div>
                    <div class="price">${isUnlocked ? (isSelected ? 'EQUIPPED' : 'OWNED') : conf.price + ' 🪙'}</div>
                `;
                card.onclick = () => game.handlePurchase('sky', key, conf.price);
                makeCardFocusable(card);
                storeSkies.appendChild(card);
            });
        }
}

/**
 * handlePurchase
 */
export function handlePurchase(game, type, key, price) {
        // Helper to attempt payment from wallet (totalCoins) then session (score)
        const tryPay = (amount) => {
            let remaining = amount;
            // Use wallet first
            const fromWallet = Math.min(game.saveData.totalCoins, remaining);
            remaining -= fromWallet;
            game.saveData.totalCoins -= fromWallet;
            // If still needed, use session score
            if (remaining > 0) {
                const fromSession = Math.min(game.score, remaining);
                remaining -= fromSession;
                game.score -= fromSession;
            }
            // If fully paid remaining === 0 -> success; otherwise restore deducted amounts and fail
            if (remaining === 0) return true;
            // restore if failed
            game.saveData.totalCoins += (amount - remaining) - Math.max(0, amount - remaining - game.score);
            return false;
        };

        if (type === 'ball') {
            if (game.saveData.unlockedBalls.includes(key)) {
                game.saveData.selectedBall = key;
                game._soccerBall.material = game.getBallMaterial();
            } else {
                // Allow buying with Wallet OR Session coins combined
                if (tryPay(price)) {
                    game.saveData.unlockedBalls.push(key);
                    game.saveData.selectedBall = key;
                    game._soccerBall.material = game.getBallMaterial();
                } else {
                    showToast('Not enough coins!', 'error');
                }
            }
        } else {
            const updateSky = (skyKey) => {
                game.saveData.selectedSky = skyKey;
                const sky = game.skyConfigs[skyKey];
                if (sky.tex) {
                    game.textureLoader.load(sky.tex, (tex) => {
                        tex.mapping = THREE.EquirectangularReflectionMapping;
                        game.scene.background = tex;
                    });
                } else {
                    game.scene.background = new THREE.Color(sky.color);
                }
                game.scene.fog.color = new THREE.Color(sky.color);
            };

            if (game.saveData.unlockedSkies.includes(key)) {
                updateSky(key);
            } else {
                if (tryPay(price)) {
                    game.saveData.unlockedSkies.push(key);
                    updateSky(key);
                } else {
                    showToast('Not enough coins!', 'error');
                }
            }
        }
        game.save();
        game.updateWalletUI();
        game.renderGrids();
}

/**
 * updateWalletUI
 */
export function updateWalletUI(game) {
        document.getElementById('total-coins').innerText = `Wallet: ${game.saveData.totalCoins}`;
}

/**
 * Show a brief toast notification (success or error).
 */
let _toastTimeout = null;
export function showToast(msg, type = 'info') {
    let el = document.getElementById('game-toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'game-toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast toast-' + type;
    // Force reflow so the animation restarts
    void el.offsetWidth;
    el.classList.add('toast-show');
    if (_toastTimeout) clearTimeout(_toastTimeout);
    _toastTimeout = setTimeout(() => { el.classList.remove('toast-show'); }, 2000);
}

