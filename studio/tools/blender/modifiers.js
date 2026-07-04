import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Base Command class - expects execute and undo methods to be defined by subclasses.
 * These methods will receive a 'context' object containing necessary external dependencies.
 */
class Command {
    constructor(name) {
        this.name = name;
    }
    execute(context) {
        throw new Error("Execute method must be implemented by subclass.");
    }
    undo(context) {
        throw new Error("Undo method must be implemented by subclass.");
    }
}

export class ApplyBevelModifierCommand extends Command {
    constructor(object, newBevelParams, oldBevelParams = null) {
        super("ApplyBevelModifier");
        this.object = object;
        this.newBevelParams = { ...newBevelParams }; 
        this.oldBevelParams = oldBevelParams ? { ...oldBevelParams } : null; 

        // Store original base geometry only if it's the first time bevel is applied
        if (!object.userData.originalBaseGeometryForBevel) {
            object.userData.originalBaseGeometryForBevel = object.geometry;
        }
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBevel; 
        
        this.prevAppliedGeometry = object.geometry; // Store current geometry to dispose if it changes
    }

    execute(context) {
        if (!(this.object instanceof THREE.Mesh) || !((this.originalBaseGeometry || this.object.geometry) instanceof THREE.BoxGeometry)) {
            console.warn(`Bevel modifier can only be applied to Mesh objects with BoxGeometry. Object: ${this.object.name} has ${this.object.geometry.type}`);
            return;
        }

        const parameters = this.originalBaseGeometry.parameters;
        const width = parameters.width || 1;
        const height = parameters.height || 1;
        const depth = parameters.depth || 1;
        const radius = this.newBevelParams.amount;
        const segments = Math.floor(this.newBevelParams.segments);

        const newGeometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
        
        if (this.object.geometry && this.object.geometry !== this.prevAppliedGeometry) {
             this.object.geometry.dispose();
        }
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bevel = this.newBevelParams; 
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object); 
        context.updateAppliedModifiersListUI(this.object); 
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }

        if (this.oldBevelParams) {
            const parameters = this.originalBaseGeometry.parameters;
            const width = parameters.width || 1;
            const height = parameters.height || 1;
            const depth = parameters.depth || 1;
            const radius = this.oldBevelParams.amount;
            const segments = Math.floor(this.oldBevelParams.segments);
            const prevGeometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
            this.object.geometry = prevGeometry;
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.bevel = this.oldBevelParams;
        } else {
            this.object.geometry = this.originalBaseGeometry;
            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.bevel;
            }
            delete this.object.userData.originalBaseGeometryForBevel; // Clear original reference if back to non-beveled state
            this.object.updateMatrixWorld(true);
        }
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveBevelModifierCommand extends Command {
    constructor(object, bevelParams) {
        super("RemoveBevelModifier");
        this.object = object;
        this.removedBevelParams = { ...bevelParams }; 
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBevel; 
        this.prevAppliedGeometry = object.geometry; 
    }

    execute(context) {
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = this.originalBaseGeometry; 
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.bevel; 
        }
        delete this.object.userData.originalBaseGeometryForBevel; // Clear original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        
        const parameters = this.originalBaseGeometry.parameters;
        const width = parameters.width || 1;
        const height = parameters.height || 1;
        const depth = parameters.depth || 1;
        const radius = this.removedBevelParams.amount;
        const segments = Math.floor(this.removedBevelParams.segments);

        const newGeometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bevel = this.removedBevelParams; 
        this.object.userData.originalBaseGeometryForBevel = this.originalBaseGeometry; // Restore original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class ApplyArrayModifierCommand extends Command {
    constructor(object, newArrayParams, oldArrayParams = null, prevArrayClonesUUIDs = []) {
        super("ApplyArrayModifier");
        this.object = object;
        this.newArrayParams = { ...newArrayParams };
        this.oldArrayParams = oldArrayParams ? { ...oldArrayParams } : null;
        this.prevArrayClonesUUIDs = [...prevArrayClonesUUIDs]; 

        this.clonesCreatedByThisExecution = []; 
        this.removedClones = []; // Used for undo
    }

    execute(context) {
        if (!this.object) return;

        // Remove previous clones if they exist
        // Note: The previous clones UUIDs are stored in prevArrayClonesUUIDs
        // which might have been from a previous state before this command was executed.
        // It's crucial for undo/redo consistency.
        const currentClonesToRemove = this.object.userData.arrayClones ? [...this.object.userData.arrayClones] : [];
        currentClonesToRemove.forEach(uuid => {
            const clone = context.scene.getObjectByProperty('uuid', uuid);
            if (clone) {
                if (context.selectedObject === clone) { 
                    context.selectNewObject(null);
                }
                context.scene.remove(clone);
                context.disposeObject(clone); // Dispose of the removed clone's resources
                // No need to store in this.removedClones here, as this is for the *current* execute
                // and the undo will handle restoring the *old* state or the scene before this execute.
            }
        });
        
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.array = this.newArrayParams;
        this.object.userData.arrayClones = []; 
        this.clonesCreatedByThisExecution = []; 

        const originalObject = this.object;
        const count = Math.max(1, this.newArrayParams.count); 
        const relativeOffset = new THREE.Vector3(
            this.newArrayParams.relativeOffset.x,
            this.newArrayParams.relativeOffset.y,
            this.newArrayParams.relativeOffset.z
        );
        const constantOffset = new THREE.Vector3(
            this.newArrayParams.constantOffset.x,
            this.newArrayParams.constantOffset.y,
            this.newArrayParams.constantOffset.z
        );

        let objectSize = new THREE.Vector3(1,1,1); 
        if (originalObject.geometry) {
            originalObject.geometry.computeBoundingBox();
            const bbox = originalObject.geometry.boundingBox;
            objectSize = bbox.getSize(new THREE.Vector3());
        }

        for (let i = 1; i < count; i++) {
            const clone = originalObject.clone();
            clone.uuid = THREE.MathUtils.generateUUID(); 
            clone.name = `${originalObject.name || "Object"} Array.${String(i).padStart(3, '0')}`;
            clone.userData = {
                isManagedObject: true,
                isArrayCloneOf: originalObject.uuid, 
                modifiers: {} 
            };
            
            const scaledRelOffsetX = relativeOffset.x * objectSize.x * originalObject.scale.x;
            const scaledRelOffsetY = relativeOffset.y * objectSize.y * originalObject.scale.y;
            const scaledRelOffsetZ = relativeOffset.z * objectSize.z * originalObject.scale.z;

            clone.position.set(
                originalObject.position.x + (scaledRelOffsetX * i) + (constantOffset.x * i),
                originalObject.position.y + (scaledRelOffsetY * i) + (constantOffset.y * i),
                originalObject.position.z + (scaledRelOffsetZ * i) + (constantOffset.z * i)
            );
            clone.rotation.copy(originalObject.rotation);
            clone.scale.copy(originalObject.scale);

            context.scene.add(clone);
            this.object.userData.arrayClones.push(clone.uuid); 
            this.clonesCreatedByThisExecution.push(clone.uuid); 
        }

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object); 
        context.updateAppliedModifiersListUI(this.object); 
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        
        // Remove clones created by this specific execution
        this.clonesCreatedByThisExecution.forEach(cloneUUID => {
            const cloneObject = context.scene.getObjectByProperty('uuid', cloneUUID);
            if (cloneObject) {
                if (context.selectedObject === cloneObject) { 
                    context.selectNewObject(null);
                }
                context.scene.remove(cloneObject);
                context.disposeObject(cloneObject);
            }
        });
        this.clonesCreatedByThisExecution = []; 

        if (this.oldArrayParams) {
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.array = this.oldArrayParams;
            this.object.userData.arrayClones = []; 

            const originalObject = this.object;
            const count = Math.max(1, this.oldArrayParams.count);
            const relativeOffset = new THREE.Vector3(
                this.oldArrayParams.relativeOffset.x,
                this.oldArrayParams.relativeOffset.y,
                this.oldArrayParams.relativeOffset.z
            );
            const constantOffset = new THREE.Vector3(
                this.oldArrayParams.constantOffset.x,
                this.oldArrayParams.constantOffset.y,
                this.oldArrayParams.constantOffset.z
            );

            let objectSize = new THREE.Vector3(1,1,1);
            if (originalObject.geometry) {
                originalObject.geometry.computeBoundingBox();
                const bbox = originalObject.geometry.boundingBox;
                objectSize = bbox.getSize(new THREE.Vector3());
            }

            for (let i = 1; i < count; i++) {
                const clone = originalObject.clone();
                clone.uuid = THREE.MathUtils.generateUUID(); 
                clone.name = `${originalObject.name || "Object"} Array.${String(i).padStart(3, '0')}`;
                clone.userData = {
                    isManagedObject: true,
                    isArrayCloneOf: originalObject.uuid,
                    modifiers: {}
                };
                
                const scaledRelOffsetX = relativeOffset.x * objectSize.x * originalObject.scale.x;
                const scaledRelOffsetY = relativeOffset.y * objectSize.y * originalObject.scale.y;
                const scaledRelOffsetZ = relativeOffset.z * objectSize.z * originalObject.scale.z;

                clone.position.set(
                    originalObject.position.x + (scaledRelOffsetX * i) + (constantOffset.x * i),
                    originalObject.position.y + (scaledRelOffsetY * i) + (constantOffset.y * i),
                    originalObject.position.z + (scaledRelOffsetZ * i) + (constantOffset.z * i)
                );
                clone.rotation.copy(originalObject.rotation);
                clone.scale.copy(originalObject.scale);

                context.scene.add(clone);
                this.object.userData.arrayClones.push(clone.uuid); 
            }
        } else {
            // If there was no previous array modifier, restore previously removed clones (if any)
            // The `prevArrayClonesUUIDs` capture the state *before* this command executed.
            // It's crucial for undo/redo consistency.
            this.prevArrayClonesUUIDs.forEach(uuid => {
                const clone = context.scene.getObjectByProperty('uuid', uuid);
                if (!clone) { // Only re-add if it's not already in the scene (e.g. from an earlier command's undo)
                    const originalCloneObject = this.removedCloneObjects.find(obj => obj.uuid === uuid);
                    if (originalCloneObject) {
                        context.scene.add(originalCloneObject);
                    }
                }
            });

            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.array;
            }
            delete this.object.userData.arrayClones;
        }
        
        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveArrayModifierCommand extends Command {
    constructor(object, removedArrayParams, removedClonesUUIDs) {
        super("RemoveArrayModifier");
        this.object = object;
        this.removedArrayParams = { ...removedArrayParams };
        this.removedClonesUUIDs = removedClonesUUIDs ? [...removedClonesUUIDs] : [];
        this.removedCloneObjects = []; // Will be populated in execute/undo
    }
    
    execute(context) {
        if (!this.object) return;
        // Capture clones to be removed at execution time
        this.removedCloneObjects = this.removedClonesUUIDs.map(uuid => context.scene.getObjectByProperty('uuid', uuid)).filter(Boolean);
        
        this.removedCloneObjects.forEach(clone => {
            if (context.selectedObject === clone) {
                context.selectNewObject(null);
            }
            context.scene.remove(clone);
            context.disposeObject(clone);
        });
        
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.array;
        }
        delete this.object.userData.arrayClones;

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        this.removedCloneObjects.forEach(clone => {
            context.scene.add(clone);
        });
        
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.array = this.removedArrayParams;
        this.object.userData.arrayClones = this.removedClonesUUIDs;

        context.updateObjectCountUI();
        context.updateSceneCollectionUI(); 
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object); 
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class ApplyScrewModifierCommand extends Command {
    constructor(object, newScrewParams, oldScrewParams = null) {
        super("ApplyScrewModifier");
        this.object = object;
        this.newScrewParams = { ...newScrewParams };
        this.oldScrewParams = oldScrewParams ? { ...oldScrewParams } : null;

        // Store original base geometry only if it's the first time screw is applied
        if (!object.userData.originalBaseGeometryForScrew) {
            object.userData.originalBaseGeometryForScrew = object.geometry;
        }
        this.originalBaseGeometry = object.userData.originalBaseGeometryForScrew;

        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        const newGeometry = generateScrewGeometry(this.originalBaseGeometry, this.newScrewParams);
        
        if (this.object.geometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.screw = this.newScrewParams;
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }

        if (this.oldScrewParams) {
            const prevGeometry = generateScrewGeometry(this.originalBaseGeometry, this.oldScrewParams);
            this.object.geometry = prevGeometry;
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.screw = this.oldScrewParams;
            this.object.userData.originalBaseGeometryForScrew = this.originalBaseGeometry; // Restore reference
        } else {
            this.object.geometry = this.originalBaseGeometry;
            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.screw;
            }
            delete this.object.userData.originalBaseGeometryForScrew; // Clear original reference if back to non-screwed state
            this.object.updateMatrixWorld(true);
        }
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveScrewModifierCommand extends Command {
    constructor(object, screwParams) {
        super("RemoveScrewModifier");
        this.object = object;
        this.removedScrewParams = { ...screwParams };
        this.originalBaseGeometry = object.userData.originalBaseGeometryForScrew;
        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = this.originalBaseGeometry;
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.screw;
        }
        delete this.object.userData.originalBaseGeometryForScrew; // Clear original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        
        const newGeometry = generateScrewGeometry(this.originalBaseGeometry, this.removedScrewParams);
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.screw = this.removedScrewParams;
        this.object.userData.originalBaseGeometryForScrew = this.originalBaseGeometry; // Restore reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class ApplyBendModifierCommand extends Command {
    constructor(object, newBendParams, oldBendParams = null) {
        super("ApplyBendModifier");
        this.object = object;
        this.newBendParams = { ...newBendParams };
        this.oldBendParams = oldBendParams ? { ...oldBendParams } : null;

        if (!object.userData.originalBaseGeometryForBend) {
            object.userData.originalBaseGeometryForBend = object.geometry;
        }
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBend;

        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        const newGeometry = generateBendGeometry(this.originalBaseGeometry, this.newBendParams);
        
        if (this.object.geometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bend = this.newBendParams;
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry && this.object.geometry !== this.prevAppliedGeometry) {
            this.object.geometry.dispose();
        }

        if (this.oldBendParams) {
            const prevGeometry = generateBendGeometry(this.originalBaseGeometry, this.oldBendParams);
            this.object.geometry = prevGeometry;
            if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
            this.object.userData.modifiers.bend = this.oldBendParams;
            this.object.userData.originalBaseGeometryForBend = this.originalBaseGeometry; // Restore reference
        } else {
            this.object.geometry = this.originalBaseGeometry;
            if (this.object.userData.modifiers) {
                delete this.object.userData.modifiers.bend;
            }
            delete this.object.userData.originalBaseGeometryForBend; // Clear original reference if back to non-bent state
            this.object.updateMatrixWorld(true);
        }
        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}

export class RemoveBendModifierCommand extends Command {
    constructor(object, bendParams) {
        super("RemoveBendModifier");
        this.object = object;
        this.removedBendParams = { ...bendParams };
        this.originalBaseGeometry = object.userData.originalBaseGeometryForBend;
        this.prevAppliedGeometry = object.geometry;
    }

    execute(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        this.object.geometry = this.originalBaseGeometry;
        if (this.object.userData.modifiers) {
            delete this.object.userData.modifiers.bend;
        }
        delete this.object.userData.originalBaseGeometryForBend; // Clear original reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing') {
            context.updateUVEditor(context.selectedObject);
        }
    }

    undo(context) {
        if (!this.object) return;
        if (this.object.geometry && this.object.geometry !== this.originalBaseGeometry) {
            this.object.geometry.dispose();
        }
        
        const newGeometry = generateBendGeometry(this.originalBaseGeometry, this.removedBendParams);
        this.object.geometry = newGeometry;
        if (!this.object.userData.modifiers) this.object.userData.modifiers = {};
        this.object.userData.modifiers.bend = this.removedBendParams;
        this.object.userData.originalBaseGeometryForBend = this.originalBaseGeometry; // Restore reference
        this.object.updateMatrixWorld(true);

        context.updatePropertiesPanel(this.object);
        context.updateAppliedModifiersListUI(this.object);
        if (context.currentEditorMode === 'uv-editing' && context.selectedObject === this.object) {
            context.updateUVEditor(context.selectedObject);
        }
    }
}


export function generateScrewGeometry(sourceGeometry, params) {
    const { angle, screw, iterations, steps, axis } = params;
    const totalAngle = THREE.MathUtils.degToRad(angle);
    const totalScrewOffset = screw;

    const rotationAxis = new THREE.Vector3(
        axis === 'X' ? 1 : 0,
        axis === 'Y' ? 1 : 0,
        axis === 'Z' ? 1 : 0
    );

    const sourcePositionAttribute = sourceGeometry.attributes.position;
    const sourceVertices = [];
    if (!sourcePositionAttribute) return new THREE.BufferGeometry(); // Handle empty geometry
    
    for (let i = 0; i < sourcePositionAttribute.count; i++) {
        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(sourcePositionAttribute, i);
        sourceVertices.push(vertex);
    }
    const numSourceVertices = sourceVertices.length;
    if (numSourceVertices === 0) return new THREE.BufferGeometry();

    const newPositions = [];
    const newIndices = [];
    const newUvs = [];
    const rotationMatrix = new THREE.Matrix4();
    
    // Total steps for a single iteration
    const segmentSteps = Math.max(1, Math.floor(steps)); 

    for (let iter = 0; iter < iterations; iter++) {
        for (let s = 0; s <= segmentSteps; s++) {
            const currentIterationAngle = totalAngle * iter;
            const currentIterationOffset = totalScrewOffset * iter;

            const angleProgress = (s / segmentSteps);
            const currentSegmentAngle = angleProgress * totalAngle;
            const currentSegmentOffset = angleProgress * totalScrewOffset;

            rotationMatrix.makeRotationAxis(rotationAxis, currentIterationAngle + currentSegmentAngle);
            const translation = rotationAxis.clone().multiplyScalar(currentIterationOffset + currentSegmentOffset);
            
            for(let i = 0; i < numSourceVertices; i++) {
                const newVertex = sourceVertices[i].clone().applyMatrix4(rotationMatrix);
                newVertex.add(translation);
                newPositions.push(newVertex.x, newVertex.y, newVertex.z);
                // Simple UV generation for now - could be more complex
                // Assuming original UVs, if any, are 2D
                if (sourceGeometry.attributes.uv) {
                    newUvs.push(sourceGeometry.attributes.uv.getX(i), sourceGeometry.attributes.uv.getY(i));
                } else {
                    newUvs.push(newVertex.x, newVertex.y); // Fallback if no UVs
                }
            }

            // Create faces from segments, forming a ribbon
            if (s < segmentSteps) {
                const baseIndex = (iter * (segmentSteps + 1) + s) * numSourceVertices;
                const nextBaseIndex = (iter * (segmentSteps + 1) + s + 1) * numSourceVertices;

                const sourceIndex = sourceGeometry.index;
                if (sourceIndex) {
                    // Connect vertices forming quads between current and next segment
                    for (let i = 0; i < sourceIndex.count; i += 3) {
                        const v0 = sourceIndex.getX(i);
                        const v1 = sourceIndex.getX(i + 1);
                        const v2 = sourceIndex.getX(i + 2);

                        // Edges of the source triangle
                        const edges = [[v0, v1], [v1, v2], [v2, v0]];

                        edges.forEach(([idxA, idxB]) => {
                            // Triangle 1
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(baseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxB);
                            
                            // Triangle 2
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(nextBaseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxA);
                        });
                    }
                } else { // Handle non-indexed geometry (simple triangles)
                    for (let i = 0; i < numSourceVertices; i += 3) {
                        const v0 = i;
                        const v1 = i + 1;
                        const v2 = i + 2;

                        if (v2 >= numSourceVertices) continue; // Ensure valid triangle

                        // Edges of the source triangle
                        const edges = [[v0, v1], [v1, v2], [v2, v0]];

                        edges.forEach(([idxA, idxB]) => {
                            // Triangle 1
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(baseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxB);
                            
                            // Triangle 2
                            newIndices.push(baseIndex + idxA);
                            newIndices.push(nextBaseIndex + idxB);
                            newIndices.push(nextBaseIndex + idxA);
                        });
                    }
                }
            }
        }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newUvs.length > 0 && newUvs.length === newPositions.length / 3 * 2) {
        newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    newGeometry.setIndex(newIndices);
    newGeometry.computeVertexNormals();

    return newGeometry;
}

export function generateBendGeometry(sourceGeometry, params) {
    const { angle, axis } = params; // angle in degrees, axis: 'X', 'Y', 'Z' (the axis along which the object extends and is bent)
    const bendAngleRad = THREE.MathUtils.degToRad(angle);

    const sourcePositions = sourceGeometry.attributes.position;
    const newPositions = [];
    const newUvs = [];

    if (!sourcePositions) return new THREE.BufferGeometry();

    sourceGeometry.computeBoundingBox();
    const bbox = sourceGeometry.boundingBox;
    
    // Determine the primary axis for bending and the plane where curvature occurs
    let primaryAxis, tangentAxis, normalAxis;
    let primaryMin, primaryMax;

    if (axis === 'X') {
        primaryAxis = 'x'; tangentAxis = 'y'; normalAxis = 'z';
        primaryMin = bbox.min.x; primaryMax = bbox.max.x;
    } else if (axis === 'Y') {
        primaryAxis = 'y'; tangentAxis = 'x'; normalAxis = 'z';
        primaryMin = bbox.min.y; primaryMax = bbox.max.y;
    } else { // axis === 'Z'
        primaryAxis = 'z'; tangentAxis = 'x'; normalAxis = 'y'; // Bending along Z, curving in XZ plane (Y remains unchanged)
        primaryMin = bbox.min.z; primaryMax = bbox.max.z;
    }

    const lengthAlongPrimaryAxis = primaryMax - primaryMin;
    if (lengthAlongPrimaryAxis === 0 || bendAngleRad === 0) {
        // If no length along the axis or no bend angle, return original geometry
        return sourceGeometry.clone(); 
    }

    // Calculate the radius of the bend
    const radius = lengthAlongPrimaryAxis / bendAngleRad;
    const offset = radius; // Offset to ensure bend starts from a flat plane (tangent)

    for (let i = 0; i < sourcePositions.count; i++) {
        const x_orig = sourcePositions.getX(i);
        const y_orig = sourcePositions.getY(i);
        const z_orig = sourcePositions.getZ(i);

        let p_primary, p_tangent, p_normal;
        
        // Map original coordinates to bending system
        if (axis === 'X') {
            p_primary = x_orig; p_tangent = y_orig; p_normal = z_orig;
        } else if (axis === 'Y') {
            p_primary = y_orig; p_tangent = x_orig; p_normal = z_orig;
        } else { // axis === 'Z'
            p_primary = z_orig; p_tangent = x_orig; p_normal = y_orig;
        }

        // Normalize primary coordinate relative to min/max
        const normalizedPrimary = (p_primary - primaryMin) / lengthAlongPrimaryAxis;
        const currentAngle = normalizedPrimary * bendAngleRad;

        // Apply cylindrical bend transformation
        // new primary coord becomes part of arc, new normal coord becomes distance from arc
        const new_p_primary = radius * Math.sin(currentAngle);
        const new_p_normal = radius * Math.cos(currentAngle) - offset + p_normal;
        
        // Reconstruct coordinates and translate back to original min/max bounds
        if (axis === 'X') {
            newPositions.push(new_p_primary + primaryMin, p_tangent, new_p_normal);
        } else if (axis === 'Y') {
            newPositions.push(p_tangent, new_p_primary + primaryMin, new_p_normal);
        } else { // axis === 'Z'
            newPositions.push(new_p_normal, p_tangent, new_p_primary + primaryMin);
        }
        
        if (sourceGeometry.attributes.uv) {
            newUvs.push(sourceGeometry.attributes.uv.getX(i), sourceGeometry.attributes.uv.getY(i));
        }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newUvs.length > 0) {
        newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    if (sourceGeometry.index) {
        newGeometry.setIndex(sourceGeometry.index);
    }
    newGeometry.computeVertexNormals();
    return newGeometry;
}

// Export the base Command class so other commands in script.js can extend it.
export { Command };