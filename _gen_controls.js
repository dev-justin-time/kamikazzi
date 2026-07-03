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
        
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        window.addEventListener('wheel', (e) => {
            // Prevent zoom/scroll when hovering over interactive UI elements
            if (e.target.closest('#controls-panel') || e.target.closest('#minimap-container') || e.target.closest('#fullscreen-btn')) {
                return;
            }

            const viewModeSelector = document.getElementById('view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            
            if (viewMode === 'fly') {
                // In Fly mode, wheel acts as altitude zoom
                const zoomSpeed = this.app.terrainParams.size * 0.05;
                this.camera.position.y = Math.max(20, Math.min(this.app.terrainParams.size * 3, this.camera.position.y + e.deltaY * (zoomSpeed / 100)));
            } else {
                this.targetFov = Math.max(10, Math.min(100, this.targetFov + e.deltaY * 0.05));
            }
        }, { passive: true });
        
        this.initJoystick();
        this.initMouseLook(domElement);
    }

    initJoystick() {
        const zone = document.getElementById('joystick-zone');
        if (!zone) return;
        const manager = nipplejs.create({
            zone: zone,
            mode: 'static',
            position: { left: '50px', bottom: '50px' },
            color: 'white',
            size: 80
        });
        manager.on('move', (evt, data) => {
            this.joystickData.x = data.vector.x;
            this.joystickData.y = data.vector.y;
        });
        manager.on('end', () => {
            this.joystickData.x = 0;
            this.joystickData.y = 0;
        });
    }

    initMouseLook(domElement) {
        let isPanning = false;
        domElement.addEventListener('mousedown', (e) => {
            const viewModeSelector = document.getElementById('view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            // Only block rotation if in Fly mode
            if (viewMode === 'fly') return;
            if (e.button === 0) isPanning = true;
        });
        window.addEventListener('mouseup', () => isPanning = false);
        window.addEventListener('mousemove', (e) => {
            const viewModeSelector = document.getElementById('view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            if (!isPanning || viewMode === 'fly') return;
            const sensitivity = 0.0025;
            this.rotation.y -= e.movementX * sensitivity;
            this.rotation.x -= e.movementY * sensitivity;
            this.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.rotation.x));
            this.camera.quaternion.setFromEuler(this.rotation);
        });

        // Touch support for rotation
        let lastTouchX = 0, lastTouchY = 0;
        domElement.addEventListener('touchstart', (e) => {
            const viewModeSelector = document.getElementById('view-mode-select');
            const viewMode = viewModeSelector ? viewModeSelector.value : 'player';
            if (viewMode === 'fly') return;
            lastTouchX = e.touches[0].pageX;
            lastTouchY = e.touches[0].pageY;
        });
        domElement.addEventListener('touchmove', (e) => {
            const editModeSelector = document.getElementById('edit-view-mode');
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
        });
    }

    update(dt) {
        const viewModeSelector = document.getElementById('view-mode-select');
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
}