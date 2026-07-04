import * as THREE from 'three';

// Spatial Hash for optimizing vertex lookups
export class VertexSpatialHash {
    constructor(geometry, cellSize) {
        this.geometry = geometry;
        this.cellSize = cellSize;
        this.cells = new Map();
        this.vertexToKey = new Map();
        this.v = new THREE.Vector3();
    }

    build() {
        this.cells.clear();
        this.vertexToKey.clear();
        const positions = this.geometry.attributes.position;
        
        for (let i = 0; i < positions.count; i++) {
            this.v.fromBufferAttribute(positions, i);
            this.add(i, this.v);
        }
    }

    getKey(v) {
        const x = Math.floor(v.x / this.cellSize);
        const y = Math.floor(v.y / this.cellSize);
        const z = Math.floor(v.z / this.cellSize);
        return `${x}:${y}:${z}`;
    }

    add(index, v) {
        const key = this.getKey(v);
        if (!this.cells.has(key)) {
            this.cells.set(key, []);
        }
        this.cells.get(key).push(index);
        this.vertexToKey.set(index, key);
    }

    update(index, v) {
        const oldKey = this.vertexToKey.get(index);
        const newKey = this.getKey(v);

        if (oldKey !== newKey) {
            const oldCell = this.cells.get(oldKey);
            if (oldCell) {
                const idx = oldCell.indexOf(index);
                if (idx !== -1) oldCell.splice(idx, 1);
                if (oldCell.length === 0) this.cells.delete(oldKey);
            }
            this.add(index, v);
        }
    }

    query(center, radius) {
        const result = [];
        const min = center.clone().subScalar(radius);
        const max = center.clone().addScalar(radius);

        const minX = Math.floor(min.x / this.cellSize);
        const maxX = Math.floor(max.x / this.cellSize);
        const minY = Math.floor(min.y / this.cellSize);
        const maxY = Math.floor(max.y / this.cellSize);
        const minZ = Math.floor(min.z / this.cellSize);
        const maxZ = Math.floor(max.z / this.cellSize);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const key = `${x}:${y}:${z}`;
                    const cell = this.cells.get(key);
                    if (cell) {
                        for (let i = 0; i < cell.length; i++) {
                            result.push(cell[i]);
                        }
                    }
                }
            }
        }
        return result;
    }
}

export class SculptSystem {
    constructor(studio) {
        this.studio = studio;
        this.brush = {
            size: 0.5,
            strength: 0.2,
            mode: 'brush'
        };
        // New explicit enabled flag to gate sculpt updates
        this.enabled = false;
        this.isSculpting = false;
        
        this.lastMeshId = null;
        this.spatialHash = null;

        // Cursor visualization
        const geometry = new THREE.RingGeometry(0.02, 0.03, 32);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xff4444, 
            transparent: true, 
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.cursor = new THREE.Mesh(geometry, material);
        this.cursor.renderOrder = 999;
        this.cursor.visible = false;
        
        if (this.studio && this.studio.scene && typeof this.studio.scene.add === 'function') {
            this.studio.scene.add(this.cursor);
        } else {
            this._deferredCursorAdd = true;
        }

        this.cursorNormal = new THREE.Vector3();
    }

    // New API to enable/disable sculpting safely
    setEnabled(flag) {
        this.enabled = !!flag;
        this.cursor.visible = this.enabled ? this.cursor.visible : false;

        // If cursor was deferred and we're enabling now, attach it to scene
        if (this.enabled && this._deferredCursorAdd && this.studio && this.studio.scene && typeof this.studio.scene.add === 'function') {
            this.studio.scene.add(this.cursor);
            this._deferredCursorAdd = false;
        }
    }

    setMode(mode) {
        this.brush.mode = mode;
    }

    update(raycaster, isDown) {
        // New guards: only perform raycast-driven sculpt updates when enabled and when a selection exists
        if (!this.enabled) return;
        if (!this.studio || !this.studio.selectedObject) {
            // Hide cursor if not applicable
            if (this.cursor) this.cursor.visible = false;
            return;
        }

        const validObjects = this.studio.objects ? this.studio.objects.filter(o => 
            o.isMesh && 
            o.visible && 
            !o.name.includes('outline') && 
            !o.name.includes('Helper')
        ) : [];

        if (validObjects.length === 0) {
            this.cursor.visible = false;
            return;
        }
        
        const intersects = raycaster.intersectObjects(validObjects, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const point = hit.point;
            
            if (!hit.face || !hit.object) return;
            if (!hit.object.geometry || !hit.object.geometry.attributes.position) return;

            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();

            this.updateCursor(point, normal);

            if (isDown) {
                this.sculpt(hit.object, point, normal);
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

    sculpt(mesh, worldPoint, worldNormal) {
        // Ensure sculpting is active and target is valid
        if (!this.enabled) return;
        if (!mesh || !this.studio.selectedObject) return;

        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;

        // Initialize or update spatial hash
        if (this.lastMeshId !== mesh.uuid || !this.spatialHash) {
            this.lastMeshId = mesh.uuid;
            this.spatialHash = new VertexSpatialHash(geometry, this.brush.size); 
            this.spatialHash.build();
        }

        if (!this.spatialHash) return;

        // Re-check bounds in case brush size changed significantly
        if (Math.abs(this.spatialHash.cellSize - this.brush.size) > this.brush.size * 0.5) {
             this.spatialHash.cellSize = this.brush.size;
             this.spatialHash.build();
        }

        const localPoint = mesh.worldToLocal(worldPoint.clone());
        const localNormal = worldNormal.clone().applyQuaternion(mesh.quaternion.clone().invert());

        const radiusSq = this.brush.size * this.brush.size;
        const strength = this.brush.strength * 0.1;

        let modified = false;
        const v = new THREE.Vector3();

        const candidates = this.spatialHash.query(localPoint, this.brush.size);

        for (const i of candidates) {
            v.fromBufferAttribute(positions, i);
            const distSq = v.distanceToSquared(localPoint);

            if (distSq < radiusSq) {
                const dist = Math.sqrt(distSq);
                const falloff = 0.5 * (1 + Math.cos(Math.PI * dist / this.brush.size));
                const factor = strength * falloff;

                if (factor > 0) {
                    this.applyBrushOperation(i, positions, v, localNormal, factor, localPoint);
                    this.spatialHash.update(i, v);
                    modified = true;
                }
            }
        }

        if (modified) {
            positions.needsUpdate = true;
            geometry.computeVertexNormals();
        }
    }

    applyBrushOperation(index, positions, vertex, normal, factor, center) {
        const currentMode = this.brush.mode;

        if (currentMode === 'brush' || currentMode === 'inflate') {
            positions.setXYZ(
                index,
                vertex.x + normal.x * factor,
                vertex.y + normal.y * factor,
                vertex.z + normal.z * factor
            );
        } else if (currentMode === 'pinch') {
            positions.setXYZ(
                index,
                vertex.x + (center.x - vertex.x) * factor,
                vertex.y + (center.y - vertex.y) * factor,
                vertex.z + (center.z - vertex.z) * factor
            );
        } else if (currentMode === 'smooth') {
             positions.setXYZ(
                index,
                vertex.x - normal.x * factor * 0.5,
                vertex.y - normal.y * factor * 0.5,
                vertex.z - normal.z * factor * 0.5
            );
        }
    }
}