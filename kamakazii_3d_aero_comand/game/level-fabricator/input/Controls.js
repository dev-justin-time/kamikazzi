import * as THREE from 'three';
import nipplejs from 'nipplejs';

export class SetupControls {
    constructor(camera, domElement, terrain, app) {
        this.camera = camera;
        this.terrain = terrain;
        this.app = app;
        this.worldSize = 512;
        this.moveSpeed = 80;
        this.playerHeight = 10;
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        
        this.keys = {};
        this.joystickData = { x: 0, y: 0 };
        this.targetFov = 60;
        
        // Store bound handler references for proper cleanup in dispose()
        this._onKeyDown = (e) => { this.keys[e.code] = true; };
        this._onKeyUp = (e) => { this.keys[e.code] = false; };
        this._onWheel = (e) => {
            // Prevent zoom/scroll when hovering over interactive UI elements
            if (e.target.closest('#controls-panel') || e.target.closest('#minimap-container') || e.target.closest('#fullscreen-btn')) {
                return;
            }

            const viewModeSelector = document.getElementById('sg-view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            
            if (viewMode === 'fly') {
                // In Fly mode, wheel acts as altitude zoom
                const zoomSpeed = this.app.terrainParams.size * 0.05;
                this.camera.position.y = Math.max(20, Math.min(this.app.terrainParams.size * 3, this.camera.position.y + e.deltaY * (zoomSpeed / 100)));
            } else {
                this.targetFov = Math.max(10, Math.min(100, this.targetFov + e.deltaY * 0.05));
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('wheel', this._onWheel, { passive: true });
        
        this.initJoystick();
        this.initMouseLook(domElement);
    }

    initJoystick() {
        const zone = document.getElementById('sg-joystick-zone');
        if (!zone) return;
        this._joystickManager = nipplejs.create({
            zone: zone,
            mode: 'static',
            position: { left: '50px', bottom: '50px' },
            color: 'white',
            size: 80
        });
        this._joystickManager.on('move', (evt, data) => {
            this.joystickData.x = data.vector.x;
            this.joystickData.y = data.vector.y;
        });
        this._joystickManager.on('end', () => {
            this.joystickData.x = 0;
            this.joystickData.y = 0;
        });
    }

    initMouseLook(domElement) {
        this._domElement = domElement;
        let isPanning = false;

        this._onMouseDown = (e) => {
            const viewModeSelector = document.getElementById('sg-view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            if (viewMode === 'fly') return;
            if (e.button === 0) isPanning = true;
        };
        this._onMouseUp = () => { isPanning = false; };
        this._onMouseMove = (e) => {
            const viewModeSelector = document.getElementById('sg-view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            if (!isPanning || viewMode === 'fly') return;
            const sensitivity = 0.0025;
            this.rotation.y -= e.movementX * sensitivity;
            this.rotation.x -= e.movementY * sensitivity;
            this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x));
            this.camera.quaternion.setFromEuler(this.rotation);
        };

        domElement.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
        window.addEventListener('mousemove', this._onMouseMove);

        // Touch support for rotation
        let lastTouchX = 0, lastTouchY = 0;
        this._onTouchStart = (e) => {
            const viewModeSelector = document.getElementById('sg-view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            if (viewMode === 'fly') return;
            lastTouchX = e.touches[0].pageX;
            lastTouchY = e.touches[0].pageY;
        };
        this._onTouchMove = (e) => {
            const editModeSelector = document.getElementById('sg-edit-view-mode');
            const editViewMode = editModeSelector ? editModeSelector.value : 'fly';
            if (this.app.uiManager.isEditTabActive() && editViewMode === 'fly') return;
            const touchX = e.touches[0].pageX;
            const touchY = e.touches[0].pageY;
            const dx = touchX - lastTouchX;
            const dy = touchY - lastTouchY;
            lastTouchX = touchX;
            lastTouchY = touchY;
            
            const sensitivity = 0.005;
            this.rotation.y -= dx * sensitivity;
            this.rotation.x -= dy * sensitivity;
            this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x));
            this.camera.quaternion.setFromEuler(this.rotation);
        };

        domElement.addEventListener('touchstart', this._onTouchStart);
        domElement.addEventListener('touchmove', this._onTouchMove);
    }

    update(dt) {
        const viewModeSelector = document.getElementById('sg-view-mode-select');
        const viewMode = viewModeSelector ? viewModeSelector.value : 'player';

        if (viewMode === 'fly') {
            // Fly View
            const targetRot = new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ');
            this.camera.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRot), 0.1);
            
            // Allow WASD in fly view
            const flySpeed = this.camera.position.y * 1.5;
            if (this.keys['KeyW']) this.camera.position.z -= flySpeed * dt;
            if (this.keys['KeyS']) this.camera.position.z += flySpeed * dt;
            if (this.keys['KeyA']) this.camera.position.x -= flySpeed * dt;
            if (this.keys['KeyD']) this.camera.position.x += flySpeed * dt;

            // Mobile joystick support in fly mode
            if (Math.abs(this.joystickData.x) > 0.1 || Math.abs(this.joystickData.y) > 0.1) {
                this.camera.position.x += this.joystickData.x * flySpeed * dt;
                this.camera.position.z -= this.joystickData.y * flySpeed * dt;
            }

            const halfSize = this.worldSize / 2;
            this.camera.position.x = Math.max(-halfSize, Math.min(halfSize, this.camera.position.x));
            this.camera.position.z = Math.max(-halfSize, Math.min(halfSize, this.camera.position.z));
            return;
        }

        this.direction.set(0, 0, 0);

        if (this.keys['KeyW']) this.direction.z -= 1;
        if (this.keys['KeyS']) this.direction.z += 1;
        if (this.keys['KeyA']) this.direction.x -= 1;
        if (this.keys['KeyD']) this.direction.x += 1;

        if (Math.abs(this.joystickData.x) > 0.1 || Math.abs(this.joystickData.y) > 0.1) {
            this.direction.x = this.joystickData.x;
            this.direction.z = -this.joystickData.y;
        }

        if (this.direction.length() > 0) {
            this.direction.normalize();
            const moveVector = new THREE.Vector3(this.direction.x, 0, this.direction.z);
            moveVector.applyQuaternion(this.camera.quaternion);
            moveVector.y = 0;
            moveVector.normalize();
            this.camera.position.addScaledVector(moveVector, this.moveSpeed * dt);
        }

        if (this.terrain) {
            const terrainHeight = this.terrain.getHeight(this.camera.position.x, this.camera.position.z);
            const floor = terrainHeight;
            const targetY = floor + this.playerHeight;
            this.camera.position.y += (targetY - this.camera.position.y) * 0.15;
        }

        // Apply zoom
        this.camera.fov += (this.targetFov - this.camera.fov) * 0.1;
        this.camera.updateProjectionMatrix();
        
        const halfSize = this.worldSize / 2;
        this.camera.position.x = Math.max(-halfSize, Math.min(halfSize, this.camera.position.x));
        this.camera.position.z = Math.max(-halfSize, Math.min(halfSize, this.camera.position.z));
    }

    dispose() {
        // Remove keyboard listeners
        if (this._onKeyDown) {
            window.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        if (this._onKeyUp) {
            window.removeEventListener('keyup', this._onKeyUp);
            this._onKeyUp = null;
        }
        if (this._onWheel) {
            window.removeEventListener('wheel', this._onWheel);
            this._onWheel = null;
        }

        // Remove mouse listeners
        if (this._onMouseDown && this._domElement) {
            this._domElement.removeEventListener('mousedown', this._onMouseDown);
            this._onMouseDown = null;
        }
        if (this._onMouseUp) {
            window.removeEventListener('mouseup', this._onMouseUp);
            this._onMouseUp = null;
        }
        if (this._onMouseMove) {
            window.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }

        // Remove touch listeners
        if (this._onTouchStart && this._domElement) {
            this._domElement.removeEventListener('touchstart', this._onTouchStart);
            this._onTouchStart = null;
        }
        if (this._onTouchMove && this._domElement) {
            this._domElement.removeEventListener('touchmove', this._onTouchMove);
            this._onTouchMove = null;
        }

        // Destroy nipplejs joystick instance
        if (this._joystickManager) {
            this._joystickManager.destroy();
            this._joystickManager = null;
        }

        this._domElement = null;
    }
}