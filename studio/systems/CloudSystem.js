import * as THREE from 'three';

export class CloudSystem {
    constructor(studio) {
        this.studio = studio;
        // Simulated remote asset database
        this.assets = [
            { id: 'c_bldg_01', name: 'Cyberpunk Tower', type: 'model', icon: 'fa-building', generator: 'gen-building', cost: 'Free' },
            { id: 'c_tree_01', name: 'Elder Oak', type: 'model', icon: 'fa-tree', generator: 'gen-tree', cost: 'Free' },
            { id: 'c_rock_01', name: 'Moon Rock', type: 'model', icon: 'fa-cube', generator: 'gen-rock', cost: 'Free' },
            { id: 'c_terrain_01', name: 'Alpine Terrain', type: 'model', icon: 'fa-mountain', generator: 'gen-terrain', cost: 'Free' },
            { id: 'c_cloth_01', name: 'Silk Curtain', type: 'physics', icon: 'fa-layer-group', generator: 'add-cloth', cost: 'Premium' },
            // Premium Voxel Assets
            { id: 'v_hero_01', name: 'Voxel Hero', type: 'voxel', icon: 'fa-user-astronaut', generator: 'gen-voxel-hero', cost: 'Premium' },
            { id: 'v_castle_01', name: 'Voxel Keep', type: 'voxel', icon: 'fa-chess-rook', generator: 'gen-voxel-castle', cost: 'Premium' },
            { id: 'v_mech_01', name: 'Voxel Mech', type: 'voxel', icon: 'fa-robot', generator: 'gen-voxel-mech', cost: 'Premium' },
            { id: 'v_ship_01', name: 'Space Cruiser', type: 'voxel', icon: 'fa-space-shuttle', generator: 'gen-voxel-ship', cost: 'Premium' },
            { id: 'v_tree_01', name: 'Voxel Pine', type: 'voxel', icon: 'fa-tree', generator: 'gen-voxel-tree', cost: 'Premium' }
        ];
    }

    async fetchAssets() {
        // Idempotent guard
        if (this._fetching) return this._fetching;
        this._fetching = new Promise((resolve) => {
            // Simulate network latency and allow retry semantics
            console.log('Fetching assets from cloud...');
            setTimeout(() => resolve(this.assets.slice()), 800);
        }).finally(() => { this._fetching = null; });
        return this._fetching;
    }

    async downloadAndImport(assetId) {
        const asset = this.assets.find(a => a.id === assetId);
        if (!asset) throw new Error('Asset not found');

        console.log(`Downloading ${asset.name}...`);
        
        // Simulate download time
        await new Promise(r => setTimeout(r, 1000));

        if (asset.type === 'voxel') {
            this.generateVoxelAsset(asset.generator);
        } else {
            this.studio.handleMenuAction(asset.generator);
        }
        
        return asset;
    }

    generateVoxelAsset(type) {
        const group = new THREE.Group();
        const voxelSize = 0.1;
        const geometry = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
        
        // Optimize by reusing materials
        const materials = new Map();
        const getMat = (color) => {
            if (!materials.has(color)) {
                materials.set(color, new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 }));
            }
            return materials.get(color);
        };

        const addVoxel = (x, y, z, color) => {
            const mesh = new THREE.Mesh(geometry, getMat(color));
            mesh.position.set(x * voxelSize, y * voxelSize, z * voxelSize);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
        };

        if (type === 'gen-voxel-hero') {
            group.name = 'Voxel Hero';
            // Legs
            for(let y=0; y<4; y++) { addVoxel(-1, y, 0, 0x3333cc); addVoxel(1, y, 0, 0x3333cc); }
            // Torso
            for(let x=-1; x<=1; x++) for(let y=4; y<7; y++) addVoxel(x, y, 0, 0xcc3333);
            // Head
            for(let x=-1; x<=1; x++) for(let y=7; y<9; y++) for(let z=-1; z<=0; z++) addVoxel(x, y, z, 0xffccaa);
        } else if (type === 'gen-voxel-castle') {
            group.name = 'Voxel Keep';
            // Base
            for(let x=-4; x<=4; x++) for(let z=-4; z<=4; z++) addVoxel(x, 0, z, 0x888888);
            // Walls
            for(let x=-4; x<=4; x++) for(let y=1; y<4; y++) {
                addVoxel(x, y, -4, 0x999999); addVoxel(x, y, 4, 0x999999);
                addVoxel(-4, y, x, 0x999999); addVoxel(4, y, x, 0x999999);
            }
            // Towers
            [[-4,-4], [-4,4], [4,-4], [4,4]].forEach(c => {
                for(let y=0; y<7; y++) {
                    addVoxel(c[0], y, c[1], 0x666666);
                    addVoxel(c[0]+(c[0]>0?-1:1), y, c[1], 0x666666);
                    addVoxel(c[0], y, c[1]+(c[1]>0?-1:1), 0x666666);
                }
            });
        } else if (type === 'gen-voxel-mech') {
            group.name = 'Voxel Mech';
            for(let i=0; i<60; i++) {
                const x = Math.round((Math.random()-0.5)*6);
                const y = Math.round(Math.random()*10);
                const z = Math.round((Math.random()-0.5)*6);
                // Mirror x
                addVoxel(x, y, z, 0x444444);
                addVoxel(-x, y, z, 0x444444);
            }
        } else if (type === 'gen-voxel-ship') {
            group.name = 'Space Cruiser';
            for(let z=-10; z<=10; z++) {
                const w = Math.max(1, 4 - Math.abs(z*0.3));
                for(let x=-w; x<=w; x++) {
                    addVoxel(x, 0, z, 0xeeeeee);
                    if (Math.abs(x)===Math.floor(w)) addVoxel(x, 1, z, 0x33aaff); // engines
                }
            }
        } else if (type === 'gen-voxel-tree') {
             group.name = 'Voxel Pine';
             for(let y=0; y<5; y++) addVoxel(0,y,0, 0x8b4513);
             for(let y=3; y<12; y++) {
                 const r = Math.max(1, (12-y)*0.5);
                 for(let x=-r; x<=r; x++) for(let z=-r; z<=r; z++) {
                     if(Math.random()>0.3) addVoxel(x,y,z, 0x228b22);
                 }
             }
        }

        this.studio.scene.add(group);
        this.studio.objects.push(group);
        this.studio.selectObject(group);
        this.studio.ui.updateOutliner();
    }
}