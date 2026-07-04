import * as THREE from 'three';

export class DecorationManager {
    constructor(app) {
        this.app = app;
        this.treeInstances = [];
        this.manualTrees = [];
    }

    clear(keepManual = false) {
        this.treeInstances.forEach(inst => {
            this.app.sceneManager.scene.remove(inst);
            inst.geometry.dispose();
            inst.material.dispose();
        });
        this.treeInstances = [];

        if (!keepManual) {
            this.manualTrees.forEach(t => this.app.sceneManager.scene.remove(t));
            this.manualTrees = [];
        }
    }

    addInstances(instances) {
        this.treeInstances = instances || [];
        this.treeInstances.forEach(inst => this.app.sceneManager.scene.add(inst));
    }

    addManual(object) {
        this.manualTrees.push(object);
        this.app.sceneManager.scene.add(object);
    }

    removeManual(object) {
        const idx = this.manualTrees.indexOf(object);
        if (idx !== -1) {
            this.app.sceneManager.scene.remove(object);
            this.manualTrees.splice(idx, 1);
        }
    }

    updateY(brushPoint = null, radius = 0) {
        const checkDist = brushPoint !== null && radius > 0;
        const waterLevelY = this.app.terrainParams.showWater ? (this.app.terrainParams.height * 0.3) : -1000;
        
        this.manualTrees.forEach(tree => {
            if (checkDist) {
                const dx = tree.position.x - brushPoint.x;
                const dz = tree.position.z - brushPoint.z;
                if (dx*dx + dz*dz > radius*radius) return;
            }
            const h = this.app.terrain.getHeight(tree.position.x, tree.position.z);
            tree.position.y = h;
            tree.visible = (h >= waterLevelY);
        });
        
        const dummy = new THREE.Object3D();
        this.treeInstances.forEach(instMesh => {
            let updatedAny = false;
            for (let i = 0; i < instMesh.count; i++) {
                instMesh.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                
                if (checkDist) {
                    const dx = dummy.position.x - brushPoint.x;
                    const dz = dummy.position.z - brushPoint.z;
                    if (dx*dx + dz*dz > radius*radius) continue;
                }
                
                const h = this.app.terrain.getHeight(dummy.position.x, dummy.position.z);
                dummy.position.y = (h >= waterLevelY) ? h : -10000;
                dummy.updateMatrix();
                instMesh.setMatrixAt(i, dummy.matrix);
                updatedAny = true;
            }
            if (updatedAny) instMesh.instanceMatrix.needsUpdate = true;
        });
    }
}