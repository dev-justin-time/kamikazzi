import * as THREE from 'three';

export class InputManager {
    constructor(studio) {
        this.studio = studio;
        this.keys = {};
        this.joyVelocity = new THREE.Vector3(0, 0, 0);
        this.isMobile = ('ontouchstart' in window);
        this._mouseDownPos = null;
        this._hasDragged = false;
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        
        // Configuration
        this.moveSpeed = 3.0;
        this.domElement = null;
    }

    init() {
        // Idempotent guard
        if (this._inited) return;
        this._inited = true;

        // Defensive: ensure studio.renderer.domElement exists before attaching DOM listeners.
        if (!this.studio || !this.studio.renderer || !this.studio.renderer.domElement) {
            console.warn('InputManager.init: renderer.domElement not ready, retrying shortly.');
            this._inited = false;
            setTimeout(() => {
                try { this.init(); } catch (e) { console.warn('InputManager retry failed', e); }
            }, 250);
            return;
        }

        this.domElement = this.studio.renderer.domElement;
        this.setupKeyboard();
        this.setupMouse();
        this.setupTouch();
        this.setupDragDrop();
        console.log('InputManager initialized');
    }

    setupKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            // Transform Snapping
            if (e.ctrlKey && this.studio.transformControls) {
                this.studio.transformControls.setTranslationSnap(0.5);
                this.studio.transformControls.setRotationSnap(THREE.MathUtils.degToRad(15));
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            
            // Reset Snapping
            if (this.studio.transformControls) {
                this.studio.transformControls.setTranslationSnap(null);
                this.studio.transformControls.setRotationSnap(null);
            }
        });
    }

    setupMouse() {
        // Track mouse down for drag detection
        this.domElement.addEventListener('mousemove', (e) => {
            this.updateMousePosition(e);
            
            if (this._mouseDownPos && !this._hasDragged) {
                if (Math.hypot(e.clientX - this._mouseDownPos.x, e.clientY - this._mouseDownPos.y) > 3) {
                    this._hasDragged = true;
                }
            }
            
            this.handleRaycasting(e);
        });

        // Click Selection
        this.domElement.addEventListener('click', (event) => {
            // Only select if we haven't been dragging (orbiting) and aren't actively transforming
            if (this.studio.currentTool === 'select' && !this.studio.isTransforming && !this._hasDragged) {
                this.handleSelectionClick();
            }
        });
    }

    updateMousePosition(event) {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    handleRaycasting(event) {
        // Update Raycaster
        this.raycaster.setFromCamera(this.mouse, this.studio.camera);

        // Handle Sculpt Mode
        if (this.studio.sculptMode && this.studio.sculptSystem) {
            // Check if left mouse is down (buttons === 1) or touches
            const isDown = (event.buttons === 1); 
            
            // Disable orbit controls while sculpting to prevent conflict
            if (isDown) {
                this.studio.controls.enabled = false;
            } else if (!this.studio.isTransforming) {
                // Restore controls if not transforming (and not sculpting)
                this.studio.controls.enabled = true;
            }

            // Don't sculpt if we are rotating view (usually handled by controls, but good to check)
            this.studio.sculptSystem.update(this.raycaster, isDown && this.studio.currentTool !== 'rotate');
            return;
        }

        // Handle Texture Paint Mode
        if (this.studio.texturePaintMode && this.studio.texturePaintSystem) {
            const isDown = (event.buttons === 1);
            
            // Disable orbit controls while painting
            if (isDown) {
                this.studio.controls.enabled = false;
            } else if (!this.studio.isTransforming) {
                this.studio.controls.enabled = true;
            }

            this.studio.texturePaintSystem.update(this.raycaster, isDown);
            return;
        }

        // Handle Vertex Paint Mode
        if (this.studio.vertexPaintMode && this.studio.vertexPaintSystem) {
            const isDown = (event.buttons === 1);
            if (isDown) {
                this.studio.controls.enabled = false;
            } else if (!this.studio.isTransforming) {
                this.studio.controls.enabled = true;
            }
            this.studio.vertexPaintSystem.update(this.raycaster, isDown);
            return;
        }

        // Handle Hover Effects (Only in select mode)
        if (this.studio.currentTool === 'select') {
            const intersects = this.raycaster.intersectObjects(this.studio.objects, true);
            const target = intersects.length > 0 ? this.studio.getSelectableFromObject(intersects[0].object) : null;
            
            if (target && this.studio.hoveredObject !== target) {
                if (this.studio.hoveredObject) this.studio.setObjectHover(this.studio.hoveredObject, false);
                this.studio.setObjectHover(target, true);
                this.studio.hoveredObject = target;
            } else if (!target && this.studio.hoveredObject) {
                this.studio.setObjectHover(this.studio.hoveredObject, false);
                this.studio.hoveredObject = null;
            }
        } else {
            // Clear hover if not in select mode
            if (this.studio.hoveredObject) {
                this.studio.setObjectHover(this.studio.hoveredObject, false);
                this.studio.hoveredObject = null;
            }
        }
    }

    handleSelectionClick() {
        this.raycaster.setFromCamera(this.mouse, this.studio.camera);
        const intersects = this.raycaster.intersectObjects(this.studio.objects, true);
        
        if (intersects.length > 0) {
            const selected = this.studio.getSelectableFromObject(intersects[0].object);
            this.studio.selectObject(selected);
        } else {
            this.studio.selectObject(null);
        }
    }

    setupTouch() {
        if (this.isMobile) {
            const joystickZone = document.getElementById('joystick');
            if (joystickZone) {
                // Ensure nipplejs is available
                if (typeof nipplejs !== 'undefined' && nipplejs.create) {
                    const manager = nipplejs.create({ 
                        zone: joystickZone, 
                        mode: 'static', 
                        position: { left: '50%', top: '50%' }, 
                        size: 100,
                        color: 'white'
                    });
                    
                    manager.on('move', (evt, data) => {
                        if (data && data.angle) {
                            const rad = data.angle.radian;
                            const f = Math.min(data.force, 1.0);
                            // Map joystick to WASD: Up (90deg) = Forward, Right (0deg) = Right
                            // In 3D: Forward is Camera Dir, Right is Camera Right
                            // We return a vector where Z is forward/back, X is right/left
                            // Joystick Up (90deg/1.57rad) -> sin=1 (Z), cos=0 (X) ? 
                            // Usually: Up is Y+ on screen.
                            
                            // Let's map: 
                            // Up (90deg) -> Forward (+Z in our movement vector logic)
                            // Right (0deg) -> Right (+X)
                            
                            this.joyVelocity.x = Math.cos(rad) * f;
                            this.joyVelocity.z = Math.sin(rad) * f; 
                        }
                    });
                    
                    manager.on('end', () => {
                        this.joyVelocity.set(0, 0, 0);
                    });
                } else {
                    console.warn('nipplejs not loaded');
                }
            }
        }
    }

    setupDragDrop() {
        // Centralize drag/drop to the #viewport element only
        const vp = document.getElementById('viewport');
        if (!vp) return;

        // Prevent default to allow drop
        const onDragOver = (e) => {
            e.preventDefault();
        };

        // Handle drop: prefer centralized ImportExport manager; otherwise show import popup as a fallback
        const onDrop = async (e) => {
            e.preventDefault();
            const file = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) ? e.dataTransfer.files[0] : null;
            if (!file) return;

            // If an import/export facade exists, use it for robust handling (supports multi-file etc.)
            if (this.studio && this.studio.importExport && typeof this.studio.importExport.importModel === 'function') {
                try {
                    this.studio.ui && this.studio.ui.showLoading && this.studio.ui.showLoading(`Importing ${file.name}...`);
                    // allow UI to update
                    await new Promise(r => setTimeout(r, 50));
                    await this.studio.importExport.importModel(file);
                    this.studio.ui && this.studio.ui.showStatus && this.studio.ui.showStatus(`Imported ${file.name}`, 3000);
                } catch (err) {
                    console.error('Drag-drop import failed', err);
                    this.studio.ui && this.studio.ui.showStatus && this.studio.ui.showStatus(`Import failed: ${err.message || 'unknown'}`, 5000);
                } finally {
                    this.studio.ui && this.studio.ui.hideLoading && this.studio.ui.hideLoading();
                }
                return;
            }

            // Fallback: if no centralized importer is available, open the Import popup so the user can send files manually.
            // Provide a helpful status and open the import dialog to guide the user.
            if (this.studio && this.studio.ui && typeof this.studio.ui.openImportWindow === 'function') {
                this.studio.ui.showStatus('Import manager not available: opening Import Window — please select the file to import.', 5000);
                this.studio.ui.openImportWindow();
            } else {
                // As a last resort, create a temporary file input so user can pick the dropped file (can't auto-wire cross-window reliably)
                try {
                    const blobUrl = URL.createObjectURL(file);
                    const promptMsg = `Dropped file available at temporary URL (will be revoked shortly). Open Import Window and use this URL if supported: ${blobUrl}`;
                    console.warn(promptMsg);
                    alert(promptMsg);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                } catch (err) {
                    console.warn('Fallback import handling failed', err);
                    alert('No import handler available. Please use the Import window from the File menu.');
                }
            }
        };

        // Attach handlers idempotently
        vp.removeEventListener('dragover', onDragOver);
        vp.removeEventListener('drop', onDrop);
        vp.addEventListener('dragover', onDragOver);
        vp.addEventListener('drop', onDrop);
    }

    getMovementVector(cameraDirection) {
        // WASD + Joystick Logic
        const dir = cameraDirection.clone();
        dir.y = 0; 
        dir.normalize();

        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).negate();
        const mv = new THREE.Vector3();
        
        // Keyboard
        if (this.keys['w']) mv.add(dir);
        if (this.keys['s']) mv.sub(dir);
        if (this.keys['a']) mv.sub(right);
        if (this.keys['d']) mv.add(right);

        // Joystick
        mv.add(dir.clone().multiplyScalar(this.joyVelocity.z));
        mv.add(right.clone().multiplyScalar(this.joyVelocity.x));
        
        return mv;
    }
}