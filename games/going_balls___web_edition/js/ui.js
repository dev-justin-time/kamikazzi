import * as THREE from 'three';

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
                // If opening builder, render builder UI; else render grids
                if (modalId === 'builder-modal') {
                    game.renderBuilder();
                } else {
                    game.renderGrids();
                }
                modal.style.display = 'flex';
                // Ensure pointer lock is released when menu opens
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
            });
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.style.display = 'none';
                // clear preview objects when closing builder
                if (modalId === 'builder-modal') game.clearBuilderPreview();
            });
        };

        setupModal('help-btn-open', 'help-modal');
        setupModal('store-btn-open', 'store-modal');
        setupModal('skins-btn-open', 'skins-modal');
        setupModal('skies-btn-open', 'skies-modal');
        setupModal('builder-btn-open', 'builder-modal');
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
                game.ballMesh.material = game.getBallMaterial();
            } else {
                // Allow buying with Wallet OR Session coins combined
                if (tryPay(price)) {
                    game.saveData.unlockedBalls.push(key);
                    game.saveData.selectedBall = key;
                    game.ballMesh.material = game.getBallMaterial();
                } else {
                    // Not enough combined funds — simple feedback: flash the shop (re-render will show unchanged funds)
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
                    // insufficient funds
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

