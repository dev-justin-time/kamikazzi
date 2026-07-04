import * as THREE from 'three';

export class TexturePaintSystem {
    constructor(studio) {
        this.studio = studio;
        this.enabled = false;

        this.width = 1024;
        this.height = 1024;

        // Composite Canvas (The one used as texture)
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;

        // Layers Management
        this.layers = [];
        this.activeLayerIndex = -1;

        // Initialize Base Layer
        this.addLayer('Base Layer');
        
        // Fill base layer with white
        const base = this.layers[0];
        base.ctx.fillStyle = '#ffffff';
        base.ctx.fillRect(0, 0, this.width, this.height);
        this.compose();

        this.brush = {
            color: '#ff4444',
            size: 15,
            opacity: 1.0
        };

        this.cursor = null;
        this.initCursor();
    }

    addLayer(name = 'New Layer') {
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = this.width;
        layerCanvas.height = this.height;
        
        const layer = {
            id: Date.now() + Math.random(),
            name: name,
            canvas: layerCanvas,
            ctx: layerCanvas.getContext('2d'),
            visible: true,
            opacity: 1.0
        };
        
        this.layers.push(layer);
        this.activeLayerIndex = this.layers.length - 1;
        
        // Trigger UI update if available
        if (this.studio.ui && this.studio.ui.updatePaintLayersList) {
            this.studio.ui.updatePaintLayersList();
        }
        
        return layer;
    }

    removeLayer(index) {
        if (this.layers.length <= 1) return; // Keep at least one layer
        this.layers.splice(index, 1);
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.compose();
        if (this.studio.ui) this.studio.ui.updatePaintLayersList();
    }

    setActiveLayer(index) {
        if (index >= 0 && index < this.layers.length) {
            this.activeLayerIndex = index;
            if (this.studio.ui) this.studio.ui.updatePaintLayersList();
        }
    }

    toggleLayerVisibility(index) {
        if (index >= 0 && index < this.layers.length) {
            this.layers[index].visible = !this.layers[index].visible;
            this.compose();
            if (this.studio.ui) this.studio.ui.updatePaintLayersList();
        }
    }

    initCursor() {
        // Visual cursor for the brush
        const geometry = new THREE.RingGeometry(0.02, 0.025, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, 
            transparent: true, 
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.cursor = new THREE.Mesh(geometry, material);
        this.cursor.renderOrder = 999;
        this.cursor.visible = false;
        // Safely attach cursor only if studio.scene is available; otherwise defer
        if (this.studio && this.studio.scene && typeof this.studio.scene.add === 'function') {
            this.studio.scene.add(this.cursor);
        } else {
            this._deferredCursorAdd = true;
        }
    }

    setEnabled(active) {
        this.enabled = active;
        this.cursor.visible = active;

        if (active && this.studio.selectedObject) {
             this.prepareObject(this.studio.selectedObject);
             if (this.studio.ui) this.studio.ui.updatePaintLayersList();
        } else {
            this.cursor.visible = false;
        }

        console.log(`Texture painting ${active ? 'enabled' : 'disabled'}`);
    }

    prepareObject(mesh) {
        if (!mesh.material) return;

        // If the object doesn't have our canvas texture yet, assign it
        // In a real app, we would copy the existing texture to the canvas first
        if (mesh.material.map !== this.texture) {
            mesh.material.map = this.texture;
            mesh.material.needsUpdate = true;
        }
    }

    update(raycaster, isDown) {
        if (!this.enabled || !this.studio.selectedObject) {
            this.cursor.visible = false;
            return;
        }

        // Raycast specifically against the selected object
        const intersects = raycaster.intersectObject(this.studio.selectedObject, false);

        if (intersects.length > 0) {
            const hit = intersects[0];

            // Update 3D cursor
            this.updateCursor(hit.point, hit.face.normal);

            // Paint if mouse is down and we have UVs
            if (hit.uv) {
                if (isDown) {
                    this.paint(hit.uv);
                }
            }
        } else {
            this.cursor.visible = false;
        }
    }

    updateCursor(point, normal) {
        this.cursor.visible = true;
        // Offset slightly to prevent Z-fighting
        this.cursor.position.copy(point).add(normal.clone().multiplyScalar(0.01));
        this.cursor.lookAt(point.clone().add(normal));

        // Scale cursor based on brush size (approximate mapping)
        const s = this.brush.size / 100; 
        this.cursor.scale.set(s, s, s);
    }

    paint(uv) {
        if (this.activeLayerIndex < 0) return;
        const layer = this.layers[this.activeLayerIndex];
        if (!layer.visible) return;

        const x = uv.x * this.width;
        const y = (1 - uv.y) * this.height; // UV y is typically inverted relative to canvas

        layer.ctx.beginPath();
        layer.ctx.arc(x, y, this.brush.size, 0, Math.PI * 2);
        layer.ctx.fillStyle = this.brush.color;
        layer.ctx.globalAlpha = this.brush.opacity;
        layer.ctx.fill();

        this.compose();
    }

    compose() {
        // Clear composite
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Draw all layers in order
        this.layers.forEach(layer => {
            if (layer.visible) {
                this.ctx.globalAlpha = layer.opacity;
                this.ctx.drawImage(layer.canvas, 0, 0);
            }
        });

        if (this.texture) this.texture.needsUpdate = true;
    }

    setBrushColor(color) {
        this.brush.color = color;
    }

    setBrushSize(size) {
        this.brush.size = size;
    }
}