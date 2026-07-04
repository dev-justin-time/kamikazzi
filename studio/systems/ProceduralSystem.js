import * as THREE from 'three';

export class ProceduralSystem {
    constructor(studio) {
        this.studio = studio;
        this.noise = {
            perlin: (x, y, z) => {
                // Simple pseudo-random noise for demonstration
                return Math.sin(x) * Math.cos(y) * Math.sin(z * 0.5 + x * 0.5); 
            },
            simplex: (x, y, z) => Math.random(),
            worley: (x, y, z) => Math.random()
        };
    }

    init() {
        // Idempotent init guard
        if (this._inited) return;
        this._inited = true;

        // Defensive check: studio and scene required for procedural additions
        if (!this.studio || !this.studio.scene) {
            this._inited = false;
            setTimeout(() => { try { this.init(); } catch(e){ console.warn('ProceduralSystem retry failed', e); } }, 250);
            console.warn('ProceduralSystem: studio.scene not ready, retrying init shortly.');
            return;
        }

        console.log('Procedural generation system initialized');
    }

    generateTerrain(size, resolution, scale, height) {
        const heightmap = this.generateHeightmap(resolution, scale, 4);
        const geometry = new THREE.PlaneGeometry(size, size, resolution - 1, resolution - 1);
        
        const vertices = geometry.attributes.position.array;
        for (let i = 0; i < heightmap.length; i++) {
            // PlaneGeometry vertices are x, y, z. We displace z (which becomes y after rotation)
            vertices[i * 3 + 2] = heightmap[i] * height;
        }
        
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({
            color: 0x8B7355,
            roughness: 0.8,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        
        const terrain = new THREE.Mesh(geometry, material);
        terrain.rotation.x = -Math.PI / 2;
        terrain.name = 'Generated Terrain';
        terrain.castShadow = false;
        terrain.receiveShadow = true;
        
        this.studio.scene.add(terrain);
        this.studio.objects.push(terrain);
        
        console.log(`Generated terrain (${resolution}x${resolution})`);
        return terrain;
    }

    generateHeightmap(size, scale, octaves) {
        const heightmap = new Float32Array(size * size);
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let height = 0;
                let frequency = 1;
                let amplitude = 1;
                let maxValue = 0;
                
                for (let i = 0; i < octaves; i++) {
                    height += this.noise.perlin(
                        x * frequency * scale,
                        0,
                        y * frequency * scale
                    ) * amplitude;
                    
                    maxValue += amplitude;
                    amplitude *= 0.5;
                    frequency *= 2;
                }
                
                heightmap[y * size + x] = height / maxValue;
            }
        }
        
        return heightmap;
    }

    generateTree(height, branches) {
        const group = new THREE.Group();
        group.name = 'Generated Tree';

        // Trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.2, height, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = height / 2;
        trunk.castShadow = true;
        group.add(trunk);

        // Foliage
        const foliageGeometry = new THREE.SphereGeometry(height * 0.3, 16, 12);
        const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = height * 0.8;
        foliage.castShadow = true;
        group.add(foliage);

        this.studio.scene.add(group);
        this.studio.objects.push(group);

        console.log('Generated tree');
        return group;
    }

    generateRock(size, roughness) {
        const geometry = new THREE.SphereGeometry(size, 16, 12);
        const vertices = geometry.attributes.position.array;

        for (let i = 0; i < vertices.length; i += 3) {
            const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
            vertex.normalize();
            vertex.multiplyScalar(size + (Math.random() - 0.5) * roughness);
            vertices[i] = vertex.x;
            vertices[i + 1] = vertex.y;
            vertices[i + 2] = vertex.z;
        }

        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ 
            color: 0x777777,
            roughness: 0.9,
            flatShading: true
        });
        
        const rock = new THREE.Mesh(geometry, material);
        rock.name = 'Generated Rock';
        rock.castShadow = true;
        rock.receiveShadow = true;
        // Random rotation
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

        this.studio.scene.add(rock);
        this.studio.objects.push(rock);

        console.log('Generated rock');
        return rock;
    }

    generateBuilding(floors, width, depth) {
        const group = new THREE.Group();
        group.name = 'Generated Building';
        const floorHeight = 1.0; // Adjusted scale

        for (let i = 0; i < floors; i++) {
            const floorGeometry = new THREE.BoxGeometry(width, floorHeight, depth);
            const floorMaterial = new THREE.MeshStandardMaterial({ 
                color: new THREE.Color().setHSL(0.6, 0.1, 0.3 + Math.random() * 0.2) 
            });
            const floor = new THREE.Mesh(floorGeometry, floorMaterial);
            floor.position.y = i * floorHeight + floorHeight / 2;
            floor.castShadow = true;
            floor.receiveShadow = true;
            group.add(floor);
            
            // Windows
            if (i > 0) {
               // Simple window representation
               const windowGeo = new THREE.BoxGeometry(width + 0.05, floorHeight * 0.5, depth + 0.05);
               const windowMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0.9, roughness: 0.1 });
               const windows = new THREE.Mesh(windowGeo, windowMat);
               windows.position.copy(floor.position);
               group.add(windows);
            }
        }

        this.studio.scene.add(group);
        this.studio.objects.push(group);

        console.log(`Generated building (${floors} floors)`);
        return group;
    }

    // Generate a simple "game map" composed of terrain + scattered props (trees, rocks, small buildings)
    generateGameMap(size = 40, resolution = 64) {
        // Create base terrain
        const terrain = this.generateTerrain(size, Math.min(64, resolution), 0.8, 3);

        // Scatter a few trees and rocks across the terrain
        const props = new THREE.Group();
        props.name = 'GameMap_Props';

        const countTrees = 18;
        const countRocks = 14;
        const countBuildings = 4;

        const half = size / 2;

        for (let i = 0; i < countTrees; i++) {
            const x = (Math.random() - 0.5) * size * 0.9;
            const z = (Math.random() - 0.5) * size * 0.9;
            const tree = this.generateTree(1 + Math.random() * 2, 3);
            tree.position.x = x;
            tree.position.z = z;
            // try to project to terrain height (approximate sampling via raycast is heavy; just raise slightly)
            tree.position.y = 0.02;
            props.add(tree);
        }

        for (let i = 0; i < countRocks; i++) {
            const x = (Math.random() - 0.5) * size * 0.95;
            const z = (Math.random() - 0.5) * size * 0.95;
            const rock = this.generateRock(0.3 + Math.random() * 0.6, 0.2);
            rock.position.x = x;
            rock.position.z = z;
            rock.position.y = 0.02;
            props.add(rock);
        }

        for (let i = 0; i < countBuildings; i++) {
            const x = (Math.random() - 0.5) * size * 0.6;
            const z = (Math.random() - 0.5) * size * 0.6;
            const floors = Math.floor(1 + Math.random() * 4);
            const b = this.generateBuilding(floors, 1 + Math.random()*2, 1 + Math.random()*2);
            b.position.x = x;
            b.position.z = z;
            b.position.y = 0.01;
            props.add(b);
        }

        // Add a simple navigation grid (optional) as small markers
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        for (let gx = -half; gx <= half; gx += 10) {
            for (let gz = -half; gz <= half; gz += 10) {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.5), markerMat);
                m.rotation.x = -Math.PI/2;
                m.position.set(gx + (Math.random()-0.5)*2, 0.01, gz + (Math.random()-0.5)*2);
                props.add(m);
            }
        }

        const mapGroup = new THREE.Group();
        mapGroup.name = 'Game Map';
        mapGroup.add(terrain);
        mapGroup.add(props);

        this.studio.scene.add(mapGroup);
        this.studio.objects.push(mapGroup);

        console.log('Generated complete game map');
        return mapGroup;
    }
}