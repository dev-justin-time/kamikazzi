import * as THREE from 'three';
import { VertexSpatialHash } from './SculptSystem.js';

export class VertexPaintSystem {
    constructor(studio) {
        this.studio = studio;
        this.enabled = false;
        this.brush = {
            color: new THREE.Color(0xffffff),
            size: 0.5,
            strength: 0.5
        };

        // Visual cursor
        const geometry = new THREE.RingGeometry(0.02, 0.03, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffff00, 
            transparent: true, 
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.cursor = new THREE.Mesh(geometry, material);
        this.cursor.renderOrder = 999;
        this.cursor.visible = false;
        // Guard against missing studio or scene during construction (deferred add)
        if (this.studio && this.studio.scene && typeof this.studio.scene.add === 'function') {
            this.studio.scene.add(this.cursor);
        } else {
            // Will be added later when system is enabled and studio.scene is present
            this._deferredCursorAdd = true;
        }

        this.lastMeshId = null;
        this.spatialHash = null;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        this.cursor.visible = enabled;

        if (enabled && this.studio.selectedObject) {
            this.prepareObject(this.studio.selectedObject);
        } else {
            this.cursor.visible = false;
        }

        console.log(`Vertex painting ${enabled ? 'enabled' : 'disabled'}`);
    }

    setBrushColor(hex) {
        this.brush.color.set(hex);
    }

    setBrushSize(size) {
        this.brush.size = size;
    }

    setBrushStrength(strength) {
        this.brush.strength = strength;
    }

    prepareObject(mesh) {
        if (!mesh.geometry) return;

        // Ensure vertex colors exist
        if (!mesh.geometry.attributes.color) {
            const count = mesh.geometry.attributes.position.count;
            const colors = new Float32Array(count * 3);
            // Fill with white (1,1,1) by default
            for (let i = 0; i < colors.length; i++) colors[i] = 1;
            mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }

        // Ensure material uses vertex colors
        if (mesh.material) {
            mesh.material.vertexColors = true;
            mesh.material.needsUpdate = true;
        }
    }

    update(raycaster, isDown) {
        if (!this.enabled || !this.studio.selectedObject) {
            this.cursor.visible = false;
            return;
        }

        const intersects = raycaster.intersectObject(this.studio.selectedObject, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            this.updateCursor(hit.point, hit.face.normal);

            if (isDown) {
                this.paint(hit.object, hit.point);
            }
        } else {
            this.cursor.visible = false;
        }
    }

    updateCursor(point, normal) {
        this.cursor.visible = true;
        this.cursor.position.copy(point).add(normal.clone().multiplyScalar(0.01));
        this.cursor.lookAt(point.clone().add(normal));
        const s = this.brush.size;
        this.cursor.scale.set(s, s, s);
    }

    paint(mesh, worldPoint) {
        if (!mesh.geometry || !mesh.geometry.attributes.color) return;

        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const colors = geometry.attributes.color;

        // Initialize or update spatial hash
        if (this.lastMeshId !== mesh.uuid || !this.spatialHash) {
            this.lastMeshId = mesh.uuid;
            this.spatialHash = new VertexSpatialHash(geometry, this.brush.size);
            this.spatialHash.build();
        }

        // Check hash cell size compatibility
        if (Math.abs(this.spatialHash.cellSize - this.brush.size) > this.brush.size * 0.5) {
            this.spatialHash.cellSize = this.brush.size;
            this.spatialHash.build();
        }

        const localPoint = mesh.worldToLocal(worldPoint.clone());
        const radiusSq = this.brush.size * this.brush.size;
        const targetColor = this.brush.color;
        const strength = this.brush.strength * 0.1; // Scale down for smoother blending

        const candidates = this.spatialHash.query(localPoint, this.brush.size);
        let modified = false;
        const v = new THREE.Vector3();

        for (const i of candidates) {
            v.fromBufferAttribute(positions, i);
            const distSq = v.distanceToSquared(localPoint);

            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const falloff = 0.5 * (1 + Math.cos(Math.PI * dist / this.brush.size));
                const factor = strength * falloff;

                if (factor > 0) {
                    // Blend current color with brush color
                    const r = colors.getX(i);
                    const g = colors.getY(i);
                    const b = colors.getZ(i);

                    colors.setXYZ(
                        i,
                        THREE.MathUtils.lerp(r, targetColor.r, factor),
                        THREE.MathUtils.lerp(g, targetColor.g, factor),
                        THREE.MathUtils.lerp(b, targetColor.b, factor)
                    );
                    modified = true;
                }
            }
        }

        if (modified) {
            colors.needsUpdate = true;
        }
    }
}