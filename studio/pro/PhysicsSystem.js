import * as THREE from 'three';

export class PhysicsSystem {
    constructor(studio) {
        this.studio = studio;
        this.enabled = false;
        this.world = null;
        this.meshes = []; // Array of { mesh: THREE.Mesh, body: CANNON.Body }
        this.cloths = []; // Array of { mesh: THREE.Mesh, particles: [], ... }
        this.CANNON = null; // Will hold the loaded cannon-es module or null if unavailable
        
        // Do not auto-start heavy initialization during module import/construct;
        // caller should invoke init() when studio core (scene/renderer) is ready.
        this._inited = false;
    }

    async init() {
        // Idempotent guard
        if (this._inited) return;
        this._inited = true;

        // Defensive dependency checks: ensure studio and scene exist before heavy init
        if (!this.studio || !this.studio.scene) {
            // Retry later if studio/scene not available yet
            this._inited = false;
            setTimeout(() => { try { this.init(); } catch(e){ console.warn('PhysicsSystem retry failed', e); } }, 500);
            console.warn('PhysicsSystem: studio.scene not ready, retrying init shortly.');
            return;
        }

        // If a shim explicitly indicates physics should be used as a placeholder, skip attempting dynamic import.
        if (typeof window !== 'undefined' && window.ProModelerShims && window.ProModelerShims.PhysicsPlaceholder && window.ProModelerShims.PhysicsPlaceholder.forceShim) {
            console.info('PhysicsSystem: PhysicsPlaceholder forced; skipping dynamic cannon-es import.');
            this.CANNON = null;
        } else {
            try {
                // Dynamic import via CDN so module specifier resolution is explicit (avoids bare specifier issue)
                const mod = await import('https://esm.sh/cannon-es@0.20.0');
                // Some esm builds export default, normalize to object with expected constructors
                this.CANNON = mod && (mod.default ? mod.default : mod);
                if (!this.CANNON) throw new Error('Loaded cannon-es had no exports');
            } catch (err) {
                console.warn('cannon-es dynamic import failed, using PhysicsPlaceholder shim:', err);
                // Use provided shim if available
                this.CANNON = null;
            }
        }

        if (!this.CANNON) {
            // Initialize shim placeholder to keep API surface minimal and avoid runtime throws.
            // The placeholder exposes methods used below as no-op or simple stubs.
            this.CANNON = {
                World: function() { return { step: () => {}, addBody: () => {}, removeBody: () => {}, addContactMaterial: () => {}, broadphase: null, solver: { iterations: 1 }, gravity: { set: () => {} } }; },
                SAPBroadphase: function() { return null; },
                Material: function() { return {}; },
                ContactMaterial: function() { return {}; },
                Body: function() { return function(){ }; },
                Plane: function() { return function(){ }; },
                Sphere: function() { return function(){ }; },
                Cylinder: function() { return function(){ }; },
                Box: function() { return function(){ }; },
                Particle: function() { return function(){ }; },
                DistanceConstraint: function() { return function(){ }; },
                Vec3: function(x=0,y=0,z=0){ return { x, y, z }; }
            };
            // Inform user via UI if available
            if (window && window.ProModelerShims && window.ProModelerShims.PhysicsPlaceholder) {
                try { window.ProModelerShims.PhysicsPlaceholder.init(); } catch(e){}
            }
        }

        // Initialize Cannon World (real or shim)
        try {
            this.world = new this.CANNON.World();
            if (this.world && this.world.gravity && typeof this.world.gravity.set === 'function') {
                this.world.gravity.set(0, -9.82, 0); // m/s²
            } else if (this.world && this.world.gravity) {
                this.world.gravity = { x: 0, y: -9.82, z: 0 };
            }

            // Use SAPBroadphase when available (real CANNON), otherwise ignore
            if (this.CANNON.SAPBroadphase) {
                try {
                    this.world.broadphase = new this.CANNON.SAPBroadphase(this.world);
                } catch (e) { /* ignore if shim */ }
            }

            if (this.world.solver) this.world.solver.iterations = this.world.solver.iterations || 10;

            // Materials
            this.defaultMaterial = new (this.CANNON.Material)('default');
            const ContactMaterialCtor = this.CANNON.ContactMaterial || this.CANNON.ContactMaterialReplacement || this.CANNON.ContactMaterial;
            try {
                const contactMaterial = new ContactMaterialCtor(
                    this.defaultMaterial,
                    this.defaultMaterial,
                    { friction: 0.3, restitution: 0.5 }
                );
                if (this.world.addContactMaterial) this.world.addContactMaterial(contactMaterial);
            } catch (e) {
                // ignore if placeholder
            }

            console.log('PhysicsSystem initialized', !!this.CANNON && this.CANNON !== null);
        } catch (e) {
            console.warn('PhysicsSystem init encountered an error:', e);
        }
    }

    setEnabled(enabled) {
        const was = !!this.enabled;
        this.enabled = !!enabled;

        // If enabling, ensure the system has been initialized (attempt lazy init)
        if (this.enabled && !this._inited) {
            // fire-and-forget init but don't block caller
            this.init().catch(err => console.warn('PhysicsSystem.init on enable failed', err));
        }

        // When toggling from off->on, ensure the scene is synced into the physics world
        if (this.enabled && !was) {
            if (this.meshes.length === 0 && this.cloths.length === 0) {
                // syncScene is safe to call even if the world/shim is not fully present
                try { this.syncScene(); } catch (e) { console.warn('PhysicsSystem.syncScene failed on enable', e); }
            }
        }

        console.log(`Physics simulation ${this.enabled ? 'enabled' : 'disabled'}`);
    }

    syncScene() {
        if (!this.world) return;
        // Clear existing
        try {
            this.meshes.forEach(item => {
                if (item && item.body && this.world.removeBody) this.world.removeBody(item.body);
            });
        } catch (e) { /* ignore */ }
        this.meshes = [];

        // Add Ground Plane (infinite) using CANNON if available
        try {
            const PlaneCtor = this.CANNON && this.CANNON.Plane ? this.CANNON.Plane : null;
            const BodyCtor = this.CANNON && this.CANNON.Body ? this.CANNON.Body : null;
            if (PlaneCtor && BodyCtor) {
                const groundBody = new BodyCtor({
                    mass: 0, // static
                    shape: new PlaneCtor(),
                    material: this.defaultMaterial
                });
                if (groundBody.quaternion && typeof groundBody.quaternion.setFromEuler === 'function') {
                    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
                }
                if (this.world.addBody) this.world.addBody(groundBody);
            }
        } catch (e) {
            // ignore if placeholder
        }

        // Convert existing meshes to rigid bodies
        (this.studio.objects || []).forEach(obj => {
            if (obj && obj.isMesh && obj.name !== 'Plane' && obj.name !== 'outline' && obj.name !== '__hoverOutline' && !obj.userData.isCloth) {
                this.addBody(obj);
            }
        });
    }

    addBody(mesh, mass = 1) {
        if (!mesh || !mesh.geometry || !this.world) return;
        
        const geometry = mesh.geometry;
        try {
            geometry.computeBoundingBox && geometry.computeBoundingBox();
        } catch (e) {}

        const size = (geometry.boundingBox) ? geometry.boundingBox.getSize(new THREE.Vector3()) : new THREE.Vector3(1,1,1);

        let shape = null;
        try {
            if (geometry.type && geometry.type.toLowerCase().includes('sphere') && this.CANNON.Sphere) {
                shape = new this.CANNON.Sphere(size.x / 2);
            } else if (geometry.type && geometry.type.toLowerCase().includes('cylinder') && this.CANNON.Cylinder) {
                shape = new this.CANNON.Cylinder(size.x / 2, size.x / 2, size.y, 8);
            } else if (this.CANNON.Box && this.CANNON.Vec3) {
                shape = new this.CANNON.Box(new this.CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
            }
        } catch (e) {
            // fallback: leave shape null
            shape = null;
        }

        if (!shape) {
            console.warn('PhysicsSystem.addBody: could not create shape for mesh, skipping physics body for', mesh.name || mesh.uuid);
            return;
        }

        try {
            const BodyCtor = this.CANNON.Body || function(){};
            const Vec3Ctor = this.CANNON.Vec3 || function(x=0,y=0,z=0){ return { x,y,z }; };
            const body = new BodyCtor({
                mass: mass,
                position: new Vec3Ctor(mesh.position.x, mesh.position.y, mesh.position.z),
                shape: shape,
                material: this.defaultMaterial
            });

            if (body.quaternion && typeof body.quaternion.set === 'function') {
                body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
            }

            if (this.world.addBody) this.world.addBody(body);
            this.meshes.push({ mesh, body });
        } catch (e) {
            console.warn('PhysicsSystem.addBody failed:', e);
        }
    }

    createCloth(width, height, segments, pos = new THREE.Vector3(0, 5, 0)) {
        if (!this.world || !this.CANNON) {
            console.warn('createCloth skipped: physics backend not available');
            return null;
        }

        const gapX = width / segments;
        const gapY = height / segments;
        const particleMass = 0.5;
        const particles = [];
        const cols = segments + 1;
        const rows = segments + 1;

        try {
            // 1. Create Particles (Bodies)
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    // Pin the top row (mass = 0)
                    const mass = (j === rows - 1) ? 0 : particleMass;

                    const BodyCtor = this.CANNON.Body || function(){};
                    const ParticleCtor = this.CANNON.Particle || function(){};
                    const Vec3Ctor = this.CANNON.Vec3 || function(x=0,y=0,z=0){ return { x,y,z }; };

                    const body = new BodyCtor({
                        mass: mass,
                        shape: new ParticleCtor(),
                        position: new Vec3Ctor(
                            pos.x + (i - segments * 0.5) * gapX,
                            pos.y + (j - segments * 0.5) * gapY,
                            pos.z
                        ),
                        linearDamping: 0.5
                    });

                    particles.push(body);
                    if (this.world.addBody) this.world.addBody(body);
                }
            }

            // 2. Create Constraints
            const connect = (i1, j1, i2, j2) => {
                const idx1 = i1 * rows + j1;
                const idx2 = i2 * rows + j2;
                const p1 = particles[idx1];
                const p2 = particles[idx2];
                if (!p1 || !p2) return;
                const pos1 = p1.position || { x:0,y:0,z:0 };
                const pos2 = p2.position || { x:0,y:0,z:0 };
                const dx = pos1.x - pos2.x;
                const dy = pos1.y - pos2.y;
                const dz = pos1.z - pos2.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                try {
                    const DistConst = this.CANNON.DistanceConstraint || function(){};
                    const c = new DistConst(p1, p2, dist);
                    if (this.world.addConstraint) this.world.addConstraint(c);
                } catch (e) {
                    // ignore if not supported by placeholder
                }
            };

            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    if (i < cols - 1) connect(i, j, i + 1, j); // Right
                    if (j < rows - 1) connect(i, j, i, j + 1); // Up
                }
            }

            // 3. Create Visual Mesh
            const geometry = new THREE.PlaneGeometry(width, height, segments, segments);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0x4a9eff, 
                side: THREE.DoubleSide, 
                wireframe: false,
                roughness: 0.5
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.name = 'Cloth';
            mesh.userData.isCloth = true; // Flag to prevent auto-rigid body creation

            this.studio.scene.add(mesh);
            this.studio.objects.push(mesh);

            this.cloths.push({
                mesh,
                particles,
                cols,
                rows
            });

            console.log(`Cloth created: ${width}x${height}, ${segments} segs`);
            return mesh;
        } catch (e) {
            console.error('createCloth failed:', e);
            return null;
        }
    }

    createFluid(position, particleCount = 100) {
        if (!this.world || !this.CANNON) {
            console.warn('createFluid skipped: physics backend not available');
            return;
        }

        // "Fluid" simulation using a pile of small, slippery spheres (Ball Pit style)
        const radius = 0.15;
        const geometry = new THREE.SphereGeometry(radius, 8, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00aaff, 
            roughness: 0.1, 
            metalness: 0.8 
        });
        
        const group = new THREE.Group();
        group.name = 'Fluid Simulation';
        this.studio.scene.add(group);
        this.studio.objects.push(group);

        try {
            const MaterialCtor = this.CANNON.Material || function(){};
            const ContactMaterialCtor = this.CANNON.ContactMaterial || function(){};

            const fluidPhysMat = new MaterialCtor('fluid');
            const fluidContact = new ContactMaterialCtor(fluidPhysMat, fluidPhysMat, {
                friction: 0.0,
                restitution: 0.0
            });
            if (this.world.addContactMaterial) this.world.addContactMaterial(fluidContact);

            const groundContact = new ContactMaterialCtor(fluidPhysMat, this.defaultMaterial, {
                friction: 0.1,
                restitution: 0.2
            });
            if (this.world.addContactMaterial) this.world.addContactMaterial(groundContact);
        } catch (e) {
            // ignore if placeholder
        }

        for (let i = 0; i < particleCount; i++) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            const x = position.x + (Math.random() - 0.5) * 1.0;
            const z = position.z + (Math.random() - 0.5) * 1.0;
            const y = position.y + i * (radius * 1.5);
            
            mesh.position.set(x, y, z);
            
            // Add Physics Body
            try {
                const SphereCtor = this.CANNON.Sphere || function(){};
                const BodyCtor = this.CANNON.Body || function(){};
                const Vec3Ctor = this.CANNON.Vec3 || function(x=0,y=0,z=0){ return { x,y,z }; };

                const shape = new SphereCtor(radius);
                const body = new BodyCtor({
                    mass: 0.1,
                    shape: shape,
                    position: new Vec3Ctor(x, y, z),
                    material: undefined
                });
                body.linearDamping = 0.1;

                if (this.world.addBody) this.world.addBody(body);
                // Add mesh to scene root for simpler synchronization
                this.studio.scene.add(mesh);
                this.meshes.push({ mesh, body });
            } catch (e) {
                // If physics body creation failed, still add visual particle
                this.studio.scene.add(mesh);
            }
        }
        
        console.log(`Fluid simulated with ${particleCount} particles`);
    }

    update(deltaTime) {
        // Only run physics stepping/sync when explicitly enabled
        if (!this.enabled) return;
        if (!this.world) return;

        try {
            // Step physics world only if a concrete step function is present
            if (typeof this.world.step === 'function') {
                // Use a fixed time step with optional accumulator outside; keep the simple call safe
                this.world.step(1 / 60, deltaTime || (1 / 60), 3);
            } else {
                // If using a shim world without a step function, skip stepping silently
                // This avoids runtime TypeErrors in environments without cannon-es
            }
        } catch (e) {
            console.warn('Physics step failed:', e);
        }

        // Sync visual rigid bodies
        this.meshes.forEach(item => {
            try {
                if (item.body && item.mesh) {
                    if (item.body.position && typeof item.body.position.x !== 'undefined') {
                        if (item.mesh.position && typeof item.mesh.position.copy === 'function') {
                            // Some placeholder bodies expose plain objects for position; copy works for real bodies
                            item.mesh.position.copy(item.body.position);
                        } else if (item.mesh.position && typeof item.mesh.position.set === 'function') {
                            item.mesh.position.set(item.body.position.x, item.body.position.y, item.body.position.z);
                        }
                    }
                    if (item.body.quaternion && item.mesh.quaternion) {
                        if (typeof item.mesh.quaternion.copy === 'function') {
                            item.mesh.quaternion.copy(item.body.quaternion);
                        }
                    }
                }
            } catch (e) {
                // ignore sync errors for placeholder bodies
            }
        });

        // Sync Cloths
        this.cloths.forEach(cloth => {
            try {
                const positions = cloth.mesh.geometry.attributes.position.array;
                for (let i = 0; i < cloth.particles.length; i++) {
                    const body = cloth.particles[i];
                    if (!body || !positions) continue;
                    const bx = body.position ? (body.position.x || 0) : 0;
                    const by = body.position ? (body.position.y || 0) : 0;
                    const bz = body.position ? (body.position.z || 0) : 0;
                    positions[i * 3] = bx;
                    positions[i * 3 + 1] = by;
                    positions[i * 3 + 2] = bz;
                }
                cloth.mesh.geometry.attributes.position.needsUpdate = true;
                cloth.mesh.geometry.computeVertexNormals();
            } catch (e) {
                // ignore
            }
        });
    }
}