import * as THREE from 'three';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 64;

export const BLOCK_TYPES = {
    AIR: 0,
    GRASS_BLOCK: 1,
    DIRT: 2,
    STONE: 3,
    COBBLESTONE: 4,
    OAK_LOG: 5,
    OAK_PLANKS: 6,
    OAK_LEAVES: 7,
    CRAFTING_TABLE: 8,
    FURNACE: 9,
    DEEPSLATE: 10,
    SAND: 11,
    WOODEN_AXE: 12,
    WOODEN_PICKAXE: 13,
    WOODEN_SHOVEL: 14,
    WOODEN_HOE: 15,
    WOODEN_SWORD: 16,
    STICK: 17,

    STONE_AXE: 18,
    STONE_PICKAXE: 19,
    STONE_SHOVEL: 20,
    STONE_HOE: 21,
    STONE_SWORD: 22,

    IRON_AXE: 23,
    IRON_PICKAXE: 24,
    IRON_SHOVEL: 25,
    IRON_HOE: 26,
    IRON_SWORD: 27,

    GOLDEN_AXE: 28,
    GOLDEN_PICKAXE: 29,
    GOLDEN_SHOVEL: 30,
    GOLDEN_HOE: 31,
    GOLDEN_SWORD: 32,

    DIAMOND_AXE: 33,
    DIAMOND_PICKAXE: 34,
    DIAMOND_SHOVEL: 35,
    DIAMOND_HOE: 36,
    DIAMOND_SWORD: 37,

    NETHERITE_AXE: 38,
    NETHERITE_PICKAXE: 39,
    NETHERITE_SHOVEL: 40,
    NETHERITE_HOE: 41,
    NETHERITE_SWORD: 42,

    RAW_IRON: 43,
    IRON_INGOT: 44,
    RAW_GOLD: 45,
    GOLD_INGOT: 46,
    COAL: 47,
    DIAMOND: 48,
    STRUCTURE_WAND: 49,
    PLACE_WAND: 50,
    WATER_BUCKET: 51,
    BUCKET: 52,
    GRASS: 53,
    TALL_GRASS: 54,
    TALL_GRASS_TOP: 55,
    BIRCH_LOG: 56,
    BIRCH_PLANKS: 57,
    BIRCH_LEAVES: 58,
    DANDELION: 59,
    POPPY: 60,
    OXEYE_DAISY: 61,
    CORNFLOWER: 62,
    RED_TULIP: 63,
    ORANGE_TULIP: 64,
    WHITE_TULIP: 65,
    PINK_TULIP: 66,
    FIRE: 67
};

class Chunk {
    constructor() {
        const size = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
        this.blocks = new Uint8Array(size);
        this.waterLevels = new Uint8Array(size);
        this.waterSources = new Uint8Array(size);
    }

    getIndex(lx, ly, lz) {
        return lx + lz * CHUNK_SIZE + ly * CHUNK_SIZE * CHUNK_SIZE;
    }

    getBlock(lx, ly, lz) {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return 0;
        return this.blocks[this.getIndex(lx, ly, lz)];
    }

    setBlock(lx, ly, lz, type) {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return;
        this.blocks[this.getIndex(lx, ly, lz)] = type;
    }

    getWaterLevel(lx, ly, lz) {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return 0;
        return this.waterLevels[this.getIndex(lx, ly, lz)];
    }

    setWaterLevel(lx, ly, lz, level) {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return;
        this.waterLevels[this.getIndex(lx, ly, lz)] = level;
    }

    isWaterSource(lx, ly, lz) {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return false;
        return this.waterSources[this.getIndex(lx, ly, lz)] === 1;
    }

    setWaterSource(lx, ly, lz, isSource) {
        if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_HEIGHT) return;
        this.waterSources[this.getIndex(lx, ly, lz)] = isSource ? 1 : 0;
    }
}

class Particle {
    constructor(scene, x, y, z, texture, color = 0xffffff, options = {}) {
        this.scene = scene;
        const size = options.size || (0.1 + Math.random() * 0.15);
        this.isSprite = options.type === 'sprite';

        if (this.isSprite) {
            const material = new THREE.SpriteMaterial({
                map: texture,
                color: color,
                transparent: true,
                opacity: 0.8
            });
            this.mesh = new THREE.Sprite(material);
            this.mesh.scale.set(size, size, size);
        } else {
            const geometry = new THREE.BoxGeometry(size, size, size);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                color: color,
                transparent: true
            });
            this.mesh = new THREE.Mesh(geometry, material);
        }

        const offset = options.spread || 0.5;
        this.mesh.position.set(
            x + 0.5 + (Math.random() - 0.5) * offset,
            y + 0.5 + (Math.random() - 0.5) * offset,
            z + 0.5 + (Math.random() - 0.5) * offset
        );

        const speed = options.speed || 5;
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * speed,
            Math.random() * (speed * 0.8),
            (Math.random() - 0.5) * speed
        );

        if (options.velocity) {
            this.velocity.copy(options.velocity);
        }

        this.rotationAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
        this.rotationSpeed = Math.random() * 10;

        this.life = options.life || (0.5 + Math.random() * 0.5);
        this.initialScale = size;
        this.scene.add(this.mesh);
    }

    update(delta, world) {
        this.life -= delta;
        this.velocity.y -= 25.0 * delta;

        const nextPos = this.mesh.position.clone().add(this.velocity.clone().multiplyScalar(delta));

        const b = world.getBlock(Math.floor(nextPos.x), Math.floor(nextPos.y), Math.floor(nextPos.z));
        if (b !== BLOCK_TYPES.AIR && b !== BLOCK_TYPES.WATER_BUCKET &&
            b !== BLOCK_TYPES.SHORT_GRASS && b !== BLOCK_TYPES.TALL_GRASS_BOTTOM && b !== BLOCK_TYPES.TALL_GRASS_TOP) {
            this.velocity.multiplyScalar(0.5);
            this.velocity.y = 0;
        } else {
            this.mesh.position.copy(nextPos);
        }

        if (!this.isSprite) {
            this.mesh.rotateOnAxis(this.rotationAxis, this.rotationSpeed * delta);
        }

        if (this.life < 0.2) {
            const scale = this.initialScale * (this.life / 0.2);
            this.mesh.scale.set(scale, scale, scale);
        }

        return this.life > 0;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

class DroppedItem {
    constructor(scene, position, blockType, material, velocity = new THREE.Vector3(), pickupDelay = 0, count = 1) {
        this.scene = scene;
        this.blockType = blockType;
        this.count = count;
        this.position = position.clone();

        const isBlock = (blockType >= 1 && blockType <= 11) || (blockType >= 56 && blockType <= 58);
        let geometry;
        let itemMaterial = material;

        if (isBlock) {
            geometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
        } else {
            geometry = new THREE.PlaneGeometry(0.4, 0.4);
            if (Array.isArray(material)) itemMaterial = material[0];
            if (itemMaterial.side !== THREE.DoubleSide) {
                itemMaterial = itemMaterial.clone();
                itemMaterial.side = THREE.DoubleSide;
            }
        }

        const vertexCount = geometry.attributes.position.count;
        geometry.setAttribute('aLight', new THREE.Float32BufferAttribute(new Float32Array(vertexCount).fill(1.0), 1));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 3).fill(1.0), 3));

        this.mesh = new THREE.Mesh(geometry, itemMaterial);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;

        this.mesh.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(this.mesh);

        this.velocity = velocity;
        this.time = Math.random() * 100;
        this.baseY = this.position.y;
        this.isMagnetized = false;
        this.rotationSpeed = 1.0;
        this.pickupDelay = pickupDelay;
        this.onGround = false;
    }

    update(delta, playerPos, onPickup, world) {
        this.time += delta;
        if (this.pickupDelay > 0) this.pickupDelay -= delta;

        const dist = this.mesh.position.distanceTo(playerPos);

        if (this.isMagnetized) {
            const target = new THREE.Vector3(playerPos.x, playerPos.y - 0.5, playerPos.z);
            const direction = target.sub(this.mesh.position).normalize();
            const speed = 10.0;

            this.mesh.position.add(direction.multiplyScalar(speed * delta));

            if (this.mesh.position.distanceTo(playerPos) < 1.0 || dist < 1.0) {
                const result = onPickup(this.blockType, this);
                return result !== false;
            }
        } else {
            if (!this.onGround) {
                this.velocity.y -= 25.0 * delta;

                const nextPos = this.mesh.position.clone().add(this.velocity.clone().multiplyScalar(delta));

                const blockX = Math.floor(nextPos.x);
                const blockY = Math.floor(nextPos.y);
                const blockZ = Math.floor(nextPos.z);

                const b = world.getBlock(blockX, blockY, blockZ);
                if (b !== BLOCK_TYPES.AIR && b !== BLOCK_TYPES.WATER_BUCKET &&
                    b !== BLOCK_TYPES.SHORT_GRASS && b !== BLOCK_TYPES.TALL_GRASS_BOTTOM && b !== BLOCK_TYPES.TALL_GRASS_TOP) {
                    this.onGround = true;
                    this.velocity.set(0, 0, 0);
                    this.mesh.position.y = blockY + 1 + 0.2;
                    this.baseY = this.mesh.position.y;
                } else {
                    this.mesh.position.copy(nextPos);
                }

                if (this.mesh.position.y < -30) return true;
            } else {
                this.mesh.position.y = this.baseY + Math.sin(this.time * 1.5) * 0.2;

                const blockBelowX = Math.floor(this.mesh.position.x);
                const blockBelowY = Math.floor(this.mesh.position.y - 0.5);
                const blockBelowZ = Math.floor(this.mesh.position.z);

                const bBelow = world.getBlock(blockBelowX, blockBelowY, blockBelowZ);
                if (bBelow === BLOCK_TYPES.AIR || bBelow === BLOCK_TYPES.GRASS ||
                    bBelow === BLOCK_TYPES.TALL_GRASS || bBelow === BLOCK_TYPES.TALL_GRASS_TOP ||
                    bBelow === BLOCK_TYPES.WATER_BUCKET || (bBelow >= 59 && bBelow <= 66)) {
                    this.onGround = false;
                }
            }

            if (this.pickupDelay <= 0 && dist < 3.0) {
                this.isMagnetized = true;
            }
        }

        const bx = Math.floor(this.mesh.position.x);
        const by = Math.floor(this.mesh.position.y);
        const bz = Math.floor(this.mesh.position.z);

        if (bx !== this.lastBx || by !== this.lastBy || bz !== this.lastBz) {
            this.lastBx = bx;
            this.lastBy = by;
            this.lastBz = bz;

            const lightLevel = world.getSkyLight(bx, by, bz);
            const lightValue = lightLevel / 15.0;

            const lightAttr = this.mesh.geometry.attributes.aLight;
            if (lightAttr) {
                const count = lightAttr.count;
                for (let i = 0; i < count; i++) {
                    lightAttr.setX(i, lightValue);
                }
                lightAttr.needsUpdate = true;
            }
        }

        this.mesh.rotation.y += this.rotationSpeed * delta;

        return false;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
    }
}

export class World {
    constructor(scene, seed) {
        this.scene = scene;
        this.chunks = new Map();

        this.itemMaterials = {};
        this.droppedItems = [];
        this.particles = [];
        this.seed = seed || Math.random().toString();
        this.setupSeed();

        this.initWorker();

        this.textureLoader = new THREE.TextureLoader();
        this.materials = {};
        this.textures = {};
        this.blockColors = { grass: new THREE.Color(0xffffff), foliage: new THREE.Color(0xffffff) };

        this.waterFrameIndex = 0;
        this.waterFrameTimer = 0;
        this.waterMeta = { frametime: 2, frames: [] };

        this.fireFrameIndex = 0;
        this.fireFrameTimer = 0;
        this.fireMeta = { frametime: 2, frames: [] };
        // Fetch fire mcmeta
        fetch('/fire_0.png.mcmeta').then(r => r.json()).then(data => {
            if (data.animation) this.fireMeta = data.animation;
        }).catch(() => {});

        this.activeFluidBlocks = new Set();
        this.fluidTickTimer = 0;

        this.renderDistance = 6;
        this.chunkQueue = [];
        this.lastChunkUpdatePos = new THREE.Vector3();

        this.loadTextures();
    }

    initWorker() {
        const workerCode = `
      const BLOCK_TYPES = ${JSON.stringify(BLOCK_TYPES)};
      const CHUNK_SIZE = ${CHUNK_SIZE};
      const CHUNK_HEIGHT = ${CHUNK_HEIGHT};
      
      const IS_MULTI_MAT = new Set([
        BLOCK_TYPES.GRASS_BLOCK, BLOCK_TYPES.OAK_LOG, BLOCK_TYPES.BIRCH_LOG,
        BLOCK_TYPES.CRAFTING_TABLE, BLOCK_TYPES.FURNACE
      ]);

      const STRIDE_X = CHUNK_SIZE + 2;
      const STRIDE_Z = CHUNK_SIZE + 2;
      const STRIDE_Y = CHUNK_HEIGHT;

      function getBlock(x, y, z, data) {
         if (x < 0 || x >= STRIDE_X || z < 0 || z >= STRIDE_Z || y < 0 || y >= STRIDE_Y) return 0;
         return data[x + z * STRIDE_X + y * STRIDE_X * STRIDE_Z];
      }

      function getWaterLevel(x, y, z, levels) {
         if (!levels) return 8;
         if (x < 0 || x >= STRIDE_X || z < 0 || z >= STRIDE_Z || y < 0 || y >= STRIDE_Y) return 0;
         return levels[x + z * STRIDE_X + y * STRIDE_X * STRIDE_Z];
      }

      function getSkyLight(x, y, z, data) {
        const val = getBlock(x, y, z, data);
        const isTransparent = (val === 0 || val === BLOCK_TYPES.WATER_BUCKET || 
                               val === BLOCK_TYPES.GRASS || val === BLOCK_TYPES.TALL_GRASS || val === BLOCK_TYPES.TALL_GRASS_TOP ||
                               (val >= 59 && val <= 66) || val === BLOCK_TYPES.FIRE);
        if (!isTransparent) return 0;
        
        for (let cy = y + 1; cy < STRIDE_Y; cy++) {
          const t = getBlock(x, cy, z, data);
          const tIsTransparent = (t === 0 || t === BLOCK_TYPES.WATER_BUCKET ||
                                  t === BLOCK_TYPES.GRASS || t === BLOCK_TYPES.TALL_GRASS || t === BLOCK_TYPES.TALL_GRASS_TOP ||
                                  (t >= 59 && t <= 66) || t === BLOCK_TYPES.FIRE);
          if (!tIsTransparent) return 0;
        }
        return 15;
      }

      function getWaterHeight(x, y, z, data, levels) {
         const coords = [
           [x-1, z-1], [x, z-1],
           [x-1, z],   [x, z]
         ];
         
         let maxLevel = 0;
         
         for(const [nx, nz] of coords) {
             if (getBlock(nx, y + 1, nz, data) === BLOCK_TYPES.WATER_BUCKET) return 1.0;
             
             const type = getBlock(nx, y, nz, data);
             if (type === BLOCK_TYPES.WATER_BUCKET) {
                 const l = getWaterLevel(nx, y, nz, levels);
                 if (l > maxLevel) maxLevel = l;
             }
         }
         
         return maxLevel / 8.0;
      }

      self.onmessage = function(e) {
        const { chunkX, chunkZ, data, waterLevels } = e.data;
        const geometries = {};

        const faceShade = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
        const faces = [
          { dir: [1, 0, 0], matIndex: 0, shadeIndex: 0, corners: [ { pos: [1, 1, 1], u: 0, v: 1, ao: [0, 1, 1] }, { pos: [1, 0, 1], u: 0, v: 0, ao: [0, -1, 1] }, { pos: [1, 0, 0], u: 1, v: 0, ao: [0, -1, -1] }, { pos: [1, 1, 0], u: 1, v: 1, ao: [0, 1, -1] } ] },
          { dir: [-1, 0, 0], matIndex: 1, shadeIndex: 1, corners: [ { pos: [0, 1, 0], u: 0, v: 1, ao: [0, 1, -1] }, { pos: [0, 0, 0], u: 0, v: 0, ao: [0, -1, -1] }, { pos: [0, 0, 1], u: 1, v: 0, ao: [0, -1, 1] }, { pos: [0, 1, 1], u: 1, v: 1, ao: [0, 1, 1] } ] },
          { dir: [0, 1, 0], matIndex: 2, shadeIndex: 2, corners: [ { pos: [0, 1, 1], u: 0, v: 1, ao: [-1, 0, 1] }, { pos: [1, 1, 1], u: 1, v: 1, ao: [1, 0, 1] }, { pos: [1, 1, 0], u: 1, v: 0, ao: [1, 0, -1] }, { pos: [0, 1, 0], u: 0, v: 0, ao: [-1, 0, -1] } ] },
          { dir: [0, -1, 0], matIndex: 3, shadeIndex: 3, corners: [ { pos: [0, 0, 0], u: 0, v: 1, ao: [-1, 0, -1] }, { pos: [1, 0, 0], u: 1, v: 1, ao: [1, 0, -1] }, { pos: [1, 0, 1], u: 1, v: 0, ao: [1, 0, 1] }, { pos: [0, 0, 1], u: 0, v: 0, ao: [-1, 0, 1] } ] },
          { dir: [0, 0, 1], matIndex: 4, shadeIndex: 4, corners: [ { pos: [0, 1, 1], u: 0, v: 1, ao: [-1, 1, 0] }, { pos: [0, 0, 1], u: 0, v: 0, ao: [-1, -1, 0] }, { pos: [1, 0, 1], u: 1, v: 0, ao: [1, -1, 0] }, { pos: [1, 1, 1], u: 1, v: 1, ao: [1, 1, 0] } ] },
          { dir: [0, 0, -1], matIndex: 5, shadeIndex: 5, corners: [ { pos: [1, 1, 0], u: 0, v: 1, ao: [1, 1, 0] }, { pos: [1, 0, 0], u: 0, v: 0, ao: [1, -1, 0] }, { pos: [0, 0, 0], u: 1, v: 0, ao: [-1, -1, 0] }, { pos: [0, 1, 0], u: 1, v: 1, ao: [-1, 1, 0] } ] }
        ];

        for (let x = 1; x <= CHUNK_SIZE; x++) {
          for (let z = 1; z <= CHUNK_SIZE; z++) {
            for (let y = 0; y < CHUNK_HEIGHT; y++) {
               const blockType = getBlock(x, y, z, data);
               if (blockType === 0) continue;

               const wx = (chunkX * CHUNK_SIZE) + (x - 1);
               const wz = (chunkZ * CHUNK_SIZE) + (z - 1);
               const wy = y;

               if (blockType === BLOCK_TYPES.GRASS || blockType === BLOCK_TYPES.TALL_GRASS || blockType === BLOCK_TYPES.TALL_GRASS_TOP ||
                   (blockType >= 59 && blockType <= 66) || blockType === BLOCK_TYPES.FIRE) {
                  const matKey = blockType + "_0";
                  if (!geometries[matKey]) geometries[matKey] = { positions: [], uvs: [], colors: [], lights: [], indices: [] };
                  const geo = geometries[matKey];
                  const idx = geo.positions.length / 3;
                  
                  const light = blockType === BLOCK_TYPES.FIRE ? 1.0 : (getSkyLight(x, y, z, data) / 15.0);
                  
                  const offsets = [
                    { x1: 0.15, z1: 0.15, x2: 0.85, z2: 0.85 },
                    { x1: 0.15, z1: 0.85, x2: 0.85, z2: 0.15 }
                  ];
                  
                  offsets.forEach(o => {
                    geo.positions.push(wx + o.x1, wy, wz + o.z1, wx + o.x2, wy, wz + o.z2, wx + o.x1, wy + 1, wz + o.z1, wx + o.x2, wy + 1, wz + o.z2);
                    geo.uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
                    for(let i=0; i<4; i++) { geo.colors.push(1,1,1); geo.lights.push(light); }
                  });
                  
                  geo.indices.push(idx, idx+1, idx+2, idx+2, idx+1, idx+3, idx+4, idx+5, idx+6, idx+6, idx+5, idx+7);
                  continue;
               }

               for (const face of faces) {
                  const nx = x + face.dir[0];
                  const ny = y + face.dir[1];
                  const nz = z + face.dir[2];
                  
                  const neighborBlock = getBlock(nx, ny, nz, data);
                  
                  let shouldRender = neighborBlock === 0 || 
                                     neighborBlock === BLOCK_TYPES.OAK_LEAVES || 
                                     neighborBlock === BLOCK_TYPES.BIRCH_LEAVES || 
                                     neighborBlock === BLOCK_TYPES.WATER_BUCKET ||
                                     neighborBlock === BLOCK_TYPES.GRASS ||
                                     neighborBlock === BLOCK_TYPES.TALL_GRASS ||
                                     neighborBlock === BLOCK_TYPES.TALL_GRASS_TOP ||
                                     (neighborBlock >= 59 && neighborBlock <= 66) ||
                                     (neighborBlock >= BLOCK_TYPES.WOODEN_AXE && neighborBlock <= BLOCK_TYPES.PLACE_WAND) ||
                                     neighborBlock === BLOCK_TYPES.FIRE;

                  if (blockType === BLOCK_TYPES.WATER_BUCKET && neighborBlock === BLOCK_TYPES.WATER_BUCKET) shouldRender = false;
                  
                  if (shouldRender) {
                     const isMulti = IS_MULTI_MAT.has(blockType);
                     const matKey = isMulti ? blockType + "_" + face.matIndex : blockType + "_0";
                     
                     if (!geometries[matKey]) geometries[matKey] = { positions: [], uvs: [], colors: [], lights: [], indices: [] };
                     const geo = geometries[matKey];
                     const idx = geo.positions.length / 3;
                     const baseShade = faceShade[face.shadeIndex];
                     
                     const l0 = getSkyLight(nx, ny, nz, data);
                     
                     for (const corner of face.corners) {
                        let py = corner.pos[1];
                        let uvV = corner.v;
                        
                        if (blockType === BLOCK_TYPES.WATER_BUCKET) {
                           if (py === 1) py = getWaterHeight(x + corner.pos[0], y, z + corner.pos[2], data, waterLevels);
                           if (face.dir[1] === 0) uvV *= py;
                        }
                        
                        geo.positions.push(wx + corner.pos[0], wy + py, wz + corner.pos[2]);
                        geo.uvs.push(corner.u, uvV);
                        
                        const dx = corner.ao[0], dy = corner.ao[1], dz = corner.ao[2];
                        let p1x = nx, p1y = ny, p1z = nz;
                        let p2x = nx, p2y = ny, p2z = nz;
                        let p3x = nx, p3y = ny, p3z = nz;
                        
                        if (face.dir[0] !== 0) { p1y+=dy; p2z+=dz; p3y+=dy; p3z+=dz; }
                        else if (face.dir[1] !== 0) { p1x+=dx; p2z+=dz; p3x+=dx; p3z+=dz; }
                        else { p1x+=dx; p2y+=dy; p3x+=dx; p3y+=dy; }
                        
                        const l1 = getSkyLight(p1x, p1y, p1z, data);
                        const l2 = getSkyLight(p2x, p2y, p2z, data);
                        const l3 = getSkyLight(p3x, p3y, p3z, data);
                        const avgLight = (l0 + l1 + l2 + l3) / 4.0;
                        geo.lights.push(avgLight / 15.0);
                        
                        const c1 = getBlock(p1x, p1y, p1z, data) !== 0 ? 1 : 0;
                        const c2 = getBlock(p2x, p2y, p2z, data) !== 0 ? 1 : 0;
                        let ao = c1 + c2 + (getBlock(p3x, p3y, p3z, data) !== 0 ? 1 : 0);
                        if (c1 === 1 && c2 === 1) ao = 3;
                        const aoFactor = [1.0, 0.8, 0.6, 0.4][ao];
                        
                        const shade = aoFactor * baseShade;
                        geo.colors.push(shade, shade, shade);
                     }
                     geo.indices.push(idx, idx+1, idx+2, idx, idx+2, idx+3);
                  }
               }
            }
          }
        }
        
        const result = {};
        const transferables = [];
        for (const key in geometries) {
           const geo = geometries[key];
           result[key] = {
              positions: new Float32Array(geo.positions),
              uvs: new Float32Array(geo.uvs),
              colors: new Float32Array(geo.colors),
              lights: new Float32Array(geo.lights),
              indices: new Uint16Array(geo.indices)
           };
           transferables.push(result[key].positions.buffer);
           transferables.push(result[key].uvs.buffer);
           transferables.push(result[key].colors.buffer);
           transferables.push(result[key].lights.buffer);
           transferables.push(result[key].indices.buffer);
        }
        self.postMessage({ chunkX, chunkZ, geometries: result }, transferables);
      };
    `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
        this.worker.onmessage = this.handleChunkGenerated.bind(this);
    }

    setupSeed() {
        let h = 0;
        const s = this.seed.toString();
        for (let i = 0; i < s.length; i++) {
            h = Math.imul(31, h) + s.charCodeAt(i) | 0;
        }
        this.seedOffset = h;
    }

    pseudoRandom(x, z) {
        const v = Math.sin(x * 12.9898 + z * 78.233 + this.seedOffset) * 43758.5453;
        return v - Math.floor(v);
    }

    async loadColorMaps() {
        const grassColor = await this.sampleColorFromImage('/grass.png', 0.5, 0.5);
        const foliageColor = await this.sampleColorFromImage('/foliage.png', 0.5, 0.5);

        return {
            grass: grassColor,
            foliage: foliageColor
        };
    }

    sampleColorFromImage(url, u, v) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const x = Math.floor(u * img.width);
                const y = Math.floor(v * img.height);
                const pixel = ctx.getImageData(x, y, 1, 1).data;

                const color = new THREE.Color();
                color.setRGB(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255, THREE.SRGBColorSpace);
                resolve(color);
            };
            img.src = url;
        });
    }

    loadTextures() {
        this.textures = {
            grass_top: this.textureLoader.load('/grass_block_top_16x16.png'),
            grass_side: this.textureLoader.load('/grass_block_side_16x16.png'),
            dirt: this.textureLoader.load('/dirt_16x16 (2).png'),
            stone: this.textureLoader.load('/stone_16x16.png'),
            cobblestone: this.textureLoader.load('/cobblestone_16x16.png'),
            oak_log_top: this.textureLoader.load('/oak_log_top_16x16.png'),
            oak_log_side: this.textureLoader.load('/oak_log_16x16.png'),
            oak_planks: this.textureLoader.load('/oak_planks_16x16.png'),
            oak_leaves: this.textureLoader.load('/oak_leaves_16x16.png'),
            crafting_top: this.textureLoader.load('/crafting_table_top_16x16.png'),
            crafting_front: this.textureLoader.load('/crafting_table_front_16x16.png'),
            crafting_side: this.textureLoader.load('/crafting_table_side_16x16.png'),
            furnace_top: this.textureLoader.load('/furnace_top_16x16.png'),
            furnace_front: this.textureLoader.load('/furnace_front_16x16.png'),
            furnace_side: this.textureLoader.load('/furnace_side_16x16.png'),
            deepslate: this.textureLoader.load('/deepslate_16x16.png'),
            sand: this.textureLoader.load('/sand_16x16.png'),
            wooden_axe: this.textureLoader.load('/wooden_axe.png'),
            wooden_pickaxe: this.textureLoader.load('/wooden_pickaxe.png'),
            wooden_shovel: this.textureLoader.load('/wooden_shovel.png'),
            wooden_hoe: this.textureLoader.load('/wooden_hoe.png'),
            wooden_sword: this.textureLoader.load('/wooden_sword.png'),
            stick: this.textureLoader.load('/stick.png'),

            stone_axe: this.textureLoader.load('/stone_axe.png'),
            stone_pickaxe: this.textureLoader.load('/stone_pickaxe.png'),
            stone_shovel: this.textureLoader.load('/stone_shovel.png'),
            stone_hoe: this.textureLoader.load('/stone_hoe.png'),
            stone_sword: this.textureLoader.load('/stone_sword.png'),

            iron_axe: this.textureLoader.load('/iron_axe.png'),
            iron_pickaxe: this.textureLoader.load('/iron_pickaxe.png'),
            iron_shovel: this.textureLoader.load('/iron_shovel.png'),
            iron_hoe: this.textureLoader.load('/iron_hoe.png'),
            iron_sword: this.textureLoader.load('/iron_sword.png'),

            golden_axe: this.textureLoader.load('/golden_axe.png'),
            golden_pickaxe: this.textureLoader.load('/golden_pickaxe.png'),
            golden_shovel: this.textureLoader.load('/golden_shovel.png'),
            golden_hoe: this.textureLoader.load('/golden_hoe.png'),
            golden_sword: this.textureLoader.load('/golden_sword.png'),

            diamond_axe: this.textureLoader.load('/diamond_axe.png'),
            diamond_pickaxe: this.textureLoader.load('/diamond_pickaxe.png'),
            diamond_shovel: this.textureLoader.load('/diamond_shovel.png'),
            diamond_hoe: this.textureLoader.load('/diamond_hoe.png'),
            diamond_sword: this.textureLoader.load('/diamond_sword.png'),

            netherite_axe: this.textureLoader.load('/netherite_axe.png'),
            netherite_pickaxe: this.textureLoader.load('/netherite_pickaxe.png'),
            netherite_shovel: this.textureLoader.load('/netherite_shovel.png'),
            netherite_hoe: this.textureLoader.load('/netherite_hoe.png'),
            netherite_sword: this.textureLoader.load('/netherite_sword.png'),

            raw_iron: this.textureLoader.load('/raw_iron.png'),
            iron_ingot: this.textureLoader.load('/iron_ingot.png'),
            raw_gold: this.textureLoader.load('/raw_gold.png'),
            gold_ingot: this.textureLoader.load('/gold_ingot.png'),
            coal: this.textureLoader.load('/coal.png'),
            diamond: this.textureLoader.load('/diamond.png'),
            water_still: this.textureLoader.load('/water_still.png'),
            water_bucket: this.textureLoader.load('/water_bucket.png'),
            bucket: this.textureLoader.load('/bucket.png'),
            bubble: this.textureLoader.load('/bubble.png'),
            short_grass: this.textureLoader.load('/short_grass.png'),
            tall_grass_bottom: this.textureLoader.load('/tall_grass_bottom.png'),
            tall_grass_top: this.textureLoader.load('/tall_grass_top.png'),
            birch_log_side: this.textureLoader.load('/birch_log.png'),
            birch_log_top: this.textureLoader.load('/birch_log_top.png'),
            birch_planks: this.textureLoader.load('/birch_planks.png'),
            birch_leaves: this.textureLoader.load('/birch_leaves.png'),
            fire: this.textureLoader.load('/fire_0.png')
        };

        Object.values(this.textures).forEach(tex => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.colorSpace = THREE.SRGBColorSpace;
        });

        this.materialUniforms = [];

        const configureMaterial = (mat) => {
            mat.vertexColors = true;
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uAmbient = { value: 0.2 };
                shader.uniforms.uSunlight = { value: 1.0 };
                this.materialUniforms.push(shader.uniforms);

                shader.vertexShader = `attribute float aLight;\nvarying float vLight;\n` + shader.vertexShader;

                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
           vLight = aLight;`
                );

                shader.fragmentShader = `uniform float uAmbient;\nuniform float uSunlight;\nvarying float vLight;\n` + shader.fragmentShader;

                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <map_fragment>',
                    `#include <map_fragment>
           float t = vLight;
           float lightFactor = uAmbient + t * uSunlight;
           diffuseColor.rgb *= lightFactor;`
                );
            };
            return mat;
        };

        const setupMaterials = (mat) => {
            if (Array.isArray(mat)) {
                mat.forEach(m => configureMaterial(m));
            } else {
                configureMaterial(mat);
            }
            return mat;
        };

        this.textures.water_still.wrapS = THREE.RepeatWrapping;
        this.textures.water_still.wrapT = THREE.RepeatWrapping;
        this.textures.water_still.repeat.set(1, 1 / 32);

        this.loadColorMaps().then(async (colors) => {
            this.blockColors = colors;
            this.materials[BLOCK_TYPES.GRASS_BLOCK] = setupMaterials([
                new THREE.MeshBasicMaterial({ map: this.textures.grass_side }),
                new THREE.MeshBasicMaterial({ map: this.textures.grass_side }),
                new THREE.MeshBasicMaterial({ map: this.textures.grass_top, color: colors.grass }),
                new THREE.MeshBasicMaterial({ map: this.textures.dirt }),
                new THREE.MeshBasicMaterial({ map: this.textures.grass_side }),
                new THREE.MeshBasicMaterial({ map: this.textures.grass_side })
            ]);

            this.materials[BLOCK_TYPES.OAK_LEAVES] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.oak_leaves,
                color: colors.foliage,
                alphaTest: 0.5
            }));

            const grassTint = colors.grass;
            this.materials[BLOCK_TYPES.GRASS] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.short_grass,
                color: grassTint,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }));
            this.materials[BLOCK_TYPES.TALL_GRASS] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.tall_grass_bottom,
                color: grassTint,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }));
            this.materials[BLOCK_TYPES.TALL_GRASS_TOP] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.tall_grass_top,
                color: grassTint,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }));

            this.materials[BLOCK_TYPES.BIRCH_LEAVES] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.birch_leaves,
                color: colors.foliage,
                alphaTest: 0.5
            }));

            this.materials[BLOCK_TYPES.FIRE] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.fire,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.1,
                blending: THREE.AdditiveBlending
            }));

            this.itemMaterials[BLOCK_TYPES.WATER_BUCKET] = setupMaterials(new THREE.MeshBasicMaterial({
                map: this.textures.water_bucket,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }));

            await this.loadFlowerTextures(setupMaterials);

            this.updateChunks(new THREE.Vector3(0, 0, 0), true);
            this.generateClouds();
        });

        this.materials[BLOCK_TYPES.WATER_BUCKET] = setupMaterials(new THREE.MeshBasicMaterial({
            map: this.textures.water_still,
            color: 0x3F76E4,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        }));

        this.materials[BLOCK_TYPES.DIRT] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.dirt }));
        this.materials[BLOCK_TYPES.STONE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stone }));
        this.materials[BLOCK_TYPES.COBBLESTONE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.cobblestone }));
        this.materials[BLOCK_TYPES.OAK_PLANKS] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.oak_planks }));
        this.materials[BLOCK_TYPES.DEEPSLATE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.deepslate }));
        this.materials[BLOCK_TYPES.SAND] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.sand }));

        this.materials[BLOCK_TYPES.WOODEN_AXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.wooden_axe, transparent: true }));
        this.materials[BLOCK_TYPES.WOODEN_PICKAXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.wooden_pickaxe, transparent: true }));
        this.materials[BLOCK_TYPES.WOODEN_SHOVEL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.wooden_shovel, transparent: true }));
        this.materials[BLOCK_TYPES.WOODEN_HOE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.wooden_hoe, transparent: true }));
        this.materials[BLOCK_TYPES.WOODEN_SWORD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.wooden_sword, transparent: true }));
        this.materials[BLOCK_TYPES.STICK] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stick, transparent: true }));

        // Stone Tools
        this.materials[BLOCK_TYPES.STONE_AXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stone_axe, transparent: true }));
        this.materials[BLOCK_TYPES.STONE_PICKAXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stone_pickaxe, transparent: true }));
        this.materials[BLOCK_TYPES.STONE_SHOVEL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stone_shovel, transparent: true }));
        this.materials[BLOCK_TYPES.STONE_HOE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stone_hoe, transparent: true }));
        this.materials[BLOCK_TYPES.STONE_SWORD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.stone_sword, transparent: true }));

        // Iron Tools
        this.materials[BLOCK_TYPES.IRON_AXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.iron_axe, transparent: true }));
        this.materials[BLOCK_TYPES.IRON_PICKAXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.iron_pickaxe, transparent: true }));
        this.materials[BLOCK_TYPES.IRON_SHOVEL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.iron_shovel, transparent: true }));
        this.materials[BLOCK_TYPES.IRON_HOE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.iron_hoe, transparent: true }));
        this.materials[BLOCK_TYPES.IRON_SWORD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.iron_sword, transparent: true }));

        // Golden Tools
        this.materials[BLOCK_TYPES.GOLDEN_AXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.golden_axe, transparent: true }));
        this.materials[BLOCK_TYPES.GOLDEN_PICKAXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.golden_pickaxe, transparent: true }));
        this.materials[BLOCK_TYPES.GOLDEN_SHOVEL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.golden_shovel, transparent: true }));
        this.materials[BLOCK_TYPES.GOLDEN_HOE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.golden_hoe, transparent: true }));
        this.materials[BLOCK_TYPES.GOLDEN_SWORD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.golden_sword, transparent: true }));

        // Diamond Tools
        this.materials[BLOCK_TYPES.DIAMOND_AXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.diamond_axe, transparent: true }));
        this.materials[BLOCK_TYPES.DIAMOND_PICKAXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.diamond_pickaxe, transparent: true }));
        this.materials[BLOCK_TYPES.DIAMOND_SHOVEL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.diamond_shovel, transparent: true }));
        this.materials[BLOCK_TYPES.DIAMOND_HOE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.diamond_hoe, transparent: true }));
        this.materials[BLOCK_TYPES.DIAMOND_SWORD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.diamond_sword, transparent: true }));

        // Netherite Tools
        this.materials[BLOCK_TYPES.NETHERITE_AXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.netherite_axe, transparent: true }));
        this.materials[BLOCK_TYPES.NETHERITE_PICKAXE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.netherite_pickaxe, transparent: true }));
        this.materials[BLOCK_TYPES.NETHERITE_SHOVEL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.netherite_shovel, transparent: true }));
        this.materials[BLOCK_TYPES.NETHERITE_HOE] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.netherite_hoe, transparent: true }));
        this.materials[BLOCK_TYPES.NETHERITE_SWORD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.netherite_sword, transparent: true }));

        this.materials[BLOCK_TYPES.RAW_IRON] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.raw_iron, transparent: true }));
        this.materials[BLOCK_TYPES.IRON_INGOT] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.iron_ingot, transparent: true }));
        this.materials[BLOCK_TYPES.RAW_GOLD] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.raw_gold, transparent: true }));
        this.materials[BLOCK_TYPES.GOLD_INGOT] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.gold_ingot, transparent: true }));
        this.materials[BLOCK_TYPES.COAL] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.coal, transparent: true }));
        this.materials[BLOCK_TYPES.DIAMOND] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.diamond, transparent: true }));
        this.materials[BLOCK_TYPES.BUCKET] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.bucket, transparent: true }));

        this.materials[BLOCK_TYPES.OAK_LOG] = setupMaterials([
            new THREE.MeshBasicMaterial({ map: this.textures.oak_log_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.oak_log_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.oak_log_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.oak_log_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.oak_log_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.oak_log_side })
        ]);

        this.materials[BLOCK_TYPES.BIRCH_LOG] = setupMaterials([
            new THREE.MeshBasicMaterial({ map: this.textures.birch_log_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.birch_log_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.birch_log_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.birch_log_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.birch_log_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.birch_log_side })
        ]);

        this.materials[BLOCK_TYPES.BIRCH_PLANKS] = setupMaterials(new THREE.MeshBasicMaterial({ map: this.textures.birch_planks }));

        this.materials[BLOCK_TYPES.CRAFTING_TABLE] = setupMaterials([
            new THREE.MeshBasicMaterial({ map: this.textures.crafting_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.crafting_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.crafting_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.oak_planks }),
            new THREE.MeshBasicMaterial({ map: this.textures.crafting_front }),
            new THREE.MeshBasicMaterial({ map: this.textures.crafting_side })
        ]);

        this.materials[BLOCK_TYPES.FURNACE] = setupMaterials([
            new THREE.MeshBasicMaterial({ map: this.textures.furnace_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.furnace_side }),
            new THREE.MeshBasicMaterial({ map: this.textures.furnace_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.furnace_top }),
            new THREE.MeshBasicMaterial({ map: this.textures.furnace_front }),
            new THREE.MeshBasicMaterial({ map: this.textures.furnace_side })
        ]);
    }

    updateChunks(playerPos, force = false) {
        const cx = Math.floor(playerPos.x / CHUNK_SIZE);
        const cz = Math.floor(playerPos.z / CHUNK_SIZE);

        if (!force && Math.abs(cx - this.lastChunkUpdatePos.x) < 1 && Math.abs(cz - this.lastChunkUpdatePos.z) < 1) {
            this.processChunkQueue();
            return;
        }

        this.lastChunkUpdatePos.set(cx, 0, cz);

        const activeKeys = new Set();
        const range = this.renderDistance;

        for (let x = cx - range; x <= cx + range; x++) {
            for (let z = cz - range; z <= cz + range; z++) {
                const key = `${x},${z}`;
                activeKeys.add(key);

                if (!this.chunks.has(key)) {
                    if (!this.chunkQueue.find(item => item.x === x && item.z === z)) {
                        const dist = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
                        this.chunkQueue.push({ x, z, dist });
                    }
                }
            }
        }

        this.chunkQueue.sort((a, b) => a.dist - b.dist);

        for (const key of this.chunks.keys()) {
            if (!activeKeys.has(key)) {
                const [kx, kz] = key.split(',').map(Number);
                if (Math.abs(kx - cx) > range + 1 || Math.abs(kz - cz) > range + 1) {
                    this.unloadChunk(kx, kz);
                }
            }
        }

        if (force) {
            const immediate = 2;
            let i = this.chunkQueue.length;
            while (i--) {
                const item = this.chunkQueue[i];
                if (item.dist <= immediate) {
                    this.generateChunk(item.x, item.z);
                    this.chunkQueue.splice(i, 1);
                }
            }
        }

        this.processChunkQueue();
    }

    processChunkQueue() {
        // INCREASED: Faster chunk loading to prevent "void lines" when running
        const limit = 3;
        let count = 0;
        while (this.chunkQueue.length > 0 && count < limit) {
            const item = this.chunkQueue.shift();
            if (!this.chunks.has(`${item.x},${item.z}`)) {
                this.generateChunk(item.x, item.z);
                count++;
            }
        }
    }

    unloadChunk(cx, cz) {
        const key = `${cx},${cz}`;
        this.chunks.delete(key);

        const groupName = `chunk_${key}`;
        const group = this.scene.getObjectByName(groupName);
        if (group) {
            group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
            });
            this.scene.remove(group);
        }
    }

    noise(x, z) {
        // IMPROVED: More organic noise to prevent "Grid Lines" look
        const ox = x + this.seedOffset * 0.1;
        const oz = z + this.seedOffset * 0.1;

        // Breaking the grid alignment by rotating coordinates slightly
        const nx = ox * 0.8 + oz * 0.6;
        const nz = oz * 0.8 - ox * 0.6;

        return Math.sin(nx * 0.1) * Math.cos(nz * 0.1) * 2 +
            Math.sin(nx * 0.03 + nz * 0.03) * 4 +
            Math.sin(nx * 0.01) * 2;
    }

    biomeNoise(x, z) {
        const scale = 0.00625;
        const ox = x + this.seedOffset;
        const oz = z + this.seedOffset;
        return Math.sin(ox * scale) + Math.cos(oz * scale * 1.3) * 0.5;
    }

    getBiome(x, z) {
        const val = this.biomeNoise(x, z);
        if (val < -0.4) return 'FOREST';
        if (val > 0.4) return 'BIRCH_FOREST';
        return 'PLAINS';
    }

    setBlockGlobal(x, y, z, type) {
        this.setBlock(x, y, z, type);
    }

    generateTree(x, y, z) {
        const trunkHeight = Math.floor(Math.random() * 4) + 2;
        for (let i = 0; i < trunkHeight; i++) this.setBlockGlobal(x, y + i, z, BLOCK_TYPES.OAK_LOG);
        const leafStart = y + trunkHeight;
        for (let layer = 0; layer < 2; layer++) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    this.setBlockGlobal(x + dx, leafStart + layer, z + dz, BLOCK_TYPES.OAK_LEAVES);
                }
            }
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                this.setBlockGlobal(x + dx, leafStart + 2, z + dz, BLOCK_TYPES.OAK_LEAVES);
            }
        }
        this.setBlockGlobal(x, leafStart + 3, z, BLOCK_TYPES.OAK_LEAVES);
        this.setBlockGlobal(x + 1, leafStart + 3, z, BLOCK_TYPES.OAK_LEAVES);
        this.setBlockGlobal(x - 1, leafStart + 3, z, BLOCK_TYPES.OAK_LEAVES);
        this.setBlockGlobal(x, leafStart + 3, z + 1, BLOCK_TYPES.OAK_LEAVES);
        this.setBlockGlobal(x, leafStart + 3, z - 1, BLOCK_TYPES.OAK_LEAVES);
    }

    generateBirchTree(x, y, z) {
        const trunkHeight = Math.floor(Math.random() * 3) + 4;
        for (let i = 0; i < trunkHeight; i++) this.setBlockGlobal(x, y + i, z, BLOCK_TYPES.BIRCH_LOG);
        const leafStart = y + trunkHeight;
        for (let layer = 0; layer < 2; layer++) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    this.setBlockGlobal(x + dx, leafStart + layer, z + dz, BLOCK_TYPES.BIRCH_LEAVES);
                }
            }
        }
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                this.setBlockGlobal(x + dx, leafStart + 2, z + dz, BLOCK_TYPES.BIRCH_LEAVES);
            }
        }
        this.setBlockGlobal(x, leafStart + 3, z, BLOCK_TYPES.BIRCH_LEAVES);
        this.setBlockGlobal(x + 1, leafStart + 3, z, BLOCK_TYPES.BIRCH_LEAVES);
        this.setBlockGlobal(x - 1, leafStart + 3, z, BLOCK_TYPES.BIRCH_LEAVES);
        this.setBlockGlobal(x, leafStart + 3, z + 1, BLOCK_TYPES.BIRCH_LEAVES);
        this.setBlockGlobal(x, leafStart + 3, z - 1, BLOCK_TYPES.BIRCH_LEAVES);
    }

    generateChunk(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        if (this.chunks.has(key)) return;

        const chunk = new Chunk();
        this.chunks.set(key, chunk);

        const offsetX = chunkX * CHUNK_SIZE;
        const offsetZ = chunkZ * CHUNK_SIZE;

        const treePositions = [];

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const worldX = offsetX + x;
                const worldZ = offsetZ + z;
                const height = Math.floor(8 + this.noise(worldX, worldZ));

                for (let y = 0; y <= height; y++) {
                    let blockType;
                    if (y === height) {
                        blockType = BLOCK_TYPES.GRASS_BLOCK;
                    } else if (y >= height - 3) {
                        blockType = BLOCK_TYPES.DIRT;
                    } else {
                        blockType = BLOCK_TYPES.STONE;
                    }
                    chunk.setBlock(x, y, z, blockType);
                }

                const biome = this.getBiome(worldX, worldZ);

                if (biome === 'PLAINS') {
                    const vegRand = this.pseudoRandom(worldX, worldZ * 2 + 100);
                    if (vegRand < 0.08) {
                        if (vegRand < 0.008) {
                            chunk.setBlock(x, height + 1, z, BLOCK_TYPES.TALL_GRASS);
                            chunk.setBlock(x, height + 2, z, BLOCK_TYPES.TALL_GRASS_TOP);
                        } else if (vegRand < 0.02) {
                            const flowerRand = this.pseudoRandom(worldX * 0.5, worldZ * 0.5);
                            let flowerType = BLOCK_TYPES.GRASS;
                            if (flowerRand < 0.2) flowerType = BLOCK_TYPES.DANDELION;
                            else if (flowerRand < 0.4) flowerType = BLOCK_TYPES.POPPY;
                            else if (flowerRand < 0.6) flowerType = BLOCK_TYPES.OXEYE_DAISY;
                            else if (flowerRand < 0.8) flowerType = BLOCK_TYPES.CORNFLOWER;
                            else {
                                const patchNoise = this.pseudoRandom(Math.floor(worldX / 12), Math.floor(worldZ / 12));
                                if (patchNoise < 0.25) flowerType = BLOCK_TYPES.ORANGE_TULIP;
                                else if (patchNoise < 0.5) flowerType = BLOCK_TYPES.WHITE_TULIP;
                                else if (patchNoise < 0.75) flowerType = BLOCK_TYPES.PINK_TULIP;
                                else flowerType = BLOCK_TYPES.RED_TULIP;
                            }
                            chunk.setBlock(x, height + 1, z, flowerType);
                        } else {
                            chunk.setBlock(x, height + 1, z, BLOCK_TYPES.GRASS);
                        }
                    }
                }

                if (x >= 3 && x < CHUNK_SIZE - 3 && z >= 3 && z < CHUNK_SIZE - 3) {
                    const rand = this.pseudoRandom(worldX, worldZ);
                    if (biome === 'FOREST' && rand < 0.05) {
                        treePositions.push({ x: worldX, y: height + 1, z: worldZ, type: 'OAK' });
                    } else if (biome === 'BIRCH_FOREST' && rand < 0.05) {
                        treePositions.push({ x: worldX, y: height + 1, z: worldZ, type: 'BIRCH' });
                    }
                }
            }
        }

        treePositions.forEach(pos => {
            if (pos.type === 'OAK') this.generateTree(pos.x, pos.y, pos.z);
            else if (pos.type === 'BIRCH') this.generateBirchTree(pos.x, pos.y, pos.z);
        });

        this.rebuildChunkMesh(chunkX, chunkZ);

        // FIX: Update neighbors to fix seams/lighting gaps
        const neighbors = [
            [chunkX - 1, chunkZ], [chunkX + 1, chunkZ],
            [chunkX, chunkZ - 1], [chunkX, chunkZ + 1]
        ];
        for (const [nx, nz] of neighbors) {
            if (this.chunks.has(`${nx},${nz}`)) {
                this.rebuildChunkMesh(nx, nz);
            }
        }
    }

    setBlock(x, y, z, type) {
        if (y < 0 || y >= CHUNK_HEIGHT) return;

        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        const key = `${cx},${cz}`;
        let chunk = this.chunks.get(key);

        if (!chunk) return;

        if (type === BLOCK_TYPES.AIR) {
            chunk.setBlock(lx, y, lz, BLOCK_TYPES.AIR);
            chunk.setWaterLevel(lx, y, lz, 0);
            chunk.setWaterSource(lx, y, lz, false);
            this.activeFluidBlocks.delete(`${x},${y},${z}`);
        } else {
            if (type !== BLOCK_TYPES.WATER_BUCKET) {
                chunk.setWaterLevel(lx, y, lz, 0);
                chunk.setWaterSource(lx, y, lz, false);
                this.activeFluidBlocks.delete(`${x},${y},${z}`);
            }
            chunk.setBlock(lx, y, lz, type);
        }
    }

    getBlock(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK_TYPES.AIR;

        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        const chunk = this.chunks.get(`${cx},${cz}`);
        return chunk ? chunk.getBlock(lx, y, lz) : BLOCK_TYPES.AIR;
    }

    getWaterLevel(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return 0;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

        const chunk = this.chunks.get(`${cx},${cz}`);
        return chunk ? chunk.getWaterLevel(lx, y, lz) : 0;
    }

    rebuildChunkMesh(chunkX, chunkZ) {
        const offsetX = chunkX * CHUNK_SIZE;
        const offsetZ = chunkZ * CHUNK_SIZE;

        const strideX = CHUNK_SIZE + 2;
        const strideZ = CHUNK_SIZE + 2;
        const strideY = CHUNK_HEIGHT;
        const dataSize = strideX * strideY * strideZ;

        const data = new Uint8Array(dataSize);
        const waterLevels = new Uint8Array(dataSize);

        const neighbors = new Array(9);
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                neighbors[(dz + 1) * 3 + (dx + 1)] = this.chunks.get(`${chunkX + dx},${chunkZ + dz}`);
            }
        }

        const getLocalBlock = (nx, ny, nz) => {
            if (ny < 0 || ny >= CHUNK_HEIGHT) return { type: 0, water: 0 };

            let cxOffset = 0;
            let czOffset = 0;
            let lx = nx;
            let lz = nz;

            if (nx < 0) { cxOffset = -1; lx = CHUNK_SIZE - 1; }
            else if (nx >= CHUNK_SIZE) { cxOffset = 1; lx = 0; }

            if (nz < 0) { czOffset = -1; lz = CHUNK_SIZE - 1; }
            else if (nz >= CHUNK_SIZE) { czOffset = 1; lz = 0; }

            const chunk = neighbors[(czOffset + 1) * 3 + (cxOffset + 1)];
            // FIX: Return safe object to prevent crash if neighbor is missing
            if (!chunk) return { type: 0, water: 0 };

            return {
                type: chunk.getBlock(lx, ny, lz),
                water: chunk.getWaterLevel(lx, ny, lz)
            };
        };

        for (let x = -1; x <= CHUNK_SIZE; x++) {
            for (let z = -1; z <= CHUNK_SIZE; z++) {
                for (let y = 0; y < CHUNK_HEIGHT; y++) {
                    const info = getLocalBlock(x, y, z);

                    const idx = (x + 1) + (z + 1) * strideX + y * strideX * strideZ;
                    data[idx] = info.type;

                    if (info.type === BLOCK_TYPES.WATER_BUCKET) {
                        waterLevels[idx] = info.water || 8;
                    }
                }
            }
        }

        this.worker.postMessage({
            chunkX,
            chunkZ,
            data,
            waterLevels
        }, [data.buffer, waterLevels.buffer]);
    }

    handleChunkGenerated(e) {
        const { chunkX, chunkZ, geometries } = e.data;

        const key = `${chunkX},${chunkZ}`;
        const existingGroup = this.scene.getObjectByName(`chunk_${key}`);
        if (existingGroup) {
            existingGroup.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
            });
            this.scene.remove(existingGroup);
        }

        const group = new THREE.Group();
        group.name = `chunk_${key}`;
        group.matrixAutoUpdate = false;
        group.updateMatrix();

        for (const key of Object.keys(geometries)) {
            const geo = geometries[key];
            const geometry = new THREE.BufferGeometry();

            geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
            geometry.setAttribute('uv', new THREE.BufferAttribute(geo.uvs, 2));
            geometry.setAttribute('color', new THREE.BufferAttribute(geo.colors, 3));
            geometry.setAttribute('aLight', new THREE.BufferAttribute(geo.lights, 1));
            geometry.setIndex(new THREE.BufferAttribute(geo.indices, 1));

            geometry.computeBoundingSphere();

            const [typeStr, matIndexStr] = key.split('_');
            const blockType = parseInt(typeStr);
            const matIndex = parseInt(matIndexStr);

            let material = this.materials[blockType];
            if (Array.isArray(material)) {
                material = material[matIndex];
            }

            if (material) {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.matrixAutoUpdate = false;
                mesh.updateMatrix();
                group.add(mesh);
            }
        }

        this.scene.add(group);
    }

    getSkyLight(x, y, z) {
        let val = this.getBlock(x, y, z);
        if (val !== BLOCK_TYPES.AIR && val !== BLOCK_TYPES.WATER_BUCKET &&
            val !== BLOCK_TYPES.GRASS && val !== BLOCK_TYPES.TALL_GRASS && val !== BLOCK_TYPES.TALL_GRASS_TOP) {
            return 0;
        }

        for (let cy = y + 1; cy < CHUNK_HEIGHT + 16; cy++) {
            val = this.getBlock(x, cy, z);
            if (val !== BLOCK_TYPES.AIR && val !== BLOCK_TYPES.WATER_BUCKET &&
                val !== BLOCK_TYPES.GRASS && val !== BLOCK_TYPES.TALL_GRASS && val !== BLOCK_TYPES.TALL_GRASS_TOP) {
                return 0;
            }
        }
        return 15;
    }

    removeBlock(x, y, z, isLocal = true) {
        const type = this.getBlock(x, y, z);

        if (type === BLOCK_TYPES.TALL_GRASS) {
            if (this.getBlock(x, y + 1, z) === BLOCK_TYPES.TALL_GRASS_TOP) {
                this.setBlock(x, y + 1, z, BLOCK_TYPES.AIR);
            }
        } else if (type === BLOCK_TYPES.TALL_GRASS_TOP) {
            if (this.getBlock(x, y - 1, z) === BLOCK_TYPES.TALL_GRASS) {
                this.setBlock(x, y - 1, z, BLOCK_TYPES.AIR);
            }
        }

        this.setBlock(x, y, z, BLOCK_TYPES.AIR);
        this.wakeNeighbors(x, y, z);

        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        this.rebuildChunkMesh(chunkX, chunkZ);

        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        if (lx === 0) this.rebuildChunkMesh(chunkX - 1, chunkZ);
        if (lx === CHUNK_SIZE - 1) this.rebuildChunkMesh(chunkX + 1, chunkZ);
        if (lz === 0) this.rebuildChunkMesh(chunkX, chunkZ - 1);
        if (lz === CHUNK_SIZE - 1) this.rebuildChunkMesh(chunkX, chunkZ + 1);

        if (isLocal && this.onBlockUpdate) {
            this.onBlockUpdate(x, y, z, BLOCK_TYPES.AIR);
        }
    }

    wakeNeighbors(x, y, z) {
        const neighbors = [
            [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1], [x, y + 1, z], [x, y - 1, z]
        ];
        const key = `${x},${y},${z}`;
        const type = this.getBlock(x, y, z);
        if (type === BLOCK_TYPES.AIR || type === BLOCK_TYPES.WATER_BUCKET) {
            this.activeFluidBlocks.add(key);
        }

        for (const [nx, ny, nz] of neighbors) {
            const nKey = `${nx},${ny},${nz}`;
            const nType = this.getBlock(nx, ny, nz);
            if (nType === BLOCK_TYPES.WATER_BUCKET || nType === BLOCK_TYPES.AIR) {
                this.activeFluidBlocks.add(nKey);
            }
        }
    }

    addBlock(x, y, z, type = BLOCK_TYPES.DIRT, isLocal = true) {
        this.setBlock(x, y, z, type);

        if (type === BLOCK_TYPES.WATER_BUCKET) {
            const cx = Math.floor(x / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
            const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

            const chunk = this.chunks.get(`${cx},${cz}`);
            if (chunk) {
                chunk.setWaterLevel(lx, y, lz, 8);
                chunk.setWaterSource(lx, y, lz, true);
            }
            this.activeFluidBlocks.add(`${x},${y},${z}`);
        }

        this.wakeNeighbors(x, y, z);

        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        this.rebuildChunkMesh(chunkX, chunkZ);

        const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
        if (lx === 0) this.rebuildChunkMesh(chunkX - 1, chunkZ);
        if (lx === CHUNK_SIZE - 1) this.rebuildChunkMesh(chunkX + 1, chunkZ);
        if (lz === 0) this.rebuildChunkMesh(chunkX, chunkZ - 1);
        if (lz === CHUNK_SIZE - 1) this.rebuildChunkMesh(chunkX, chunkZ + 1);

        this.nudgeItemsFromBlock(x, y, z);
        if (isLocal && this.onBlockUpdate) {
            this.onBlockUpdate(x, y, z, type);
        }
    }

    nudgeItemsFromBlock(x, y, z) {
        const blockCenter = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);

        for (const item of this.droppedItems) {
            const dx = Math.abs(item.mesh.position.x - blockCenter.x);
            const dy = Math.abs(item.mesh.position.y - blockCenter.y);
            const dz = Math.abs(item.mesh.position.z - blockCenter.z);

            if (dx < 0.8 && dy < 0.8 && dz < 0.8) {
                const dir = new THREE.Vector3().subVectors(item.mesh.position, blockCenter);
                if (dir.lengthSq() < 0.01 || dir.y <= 0) {
                    dir.set((Math.random() - 0.5) * 0.2, 1, (Math.random() - 0.5) * 0.2);
                }
                dir.normalize();
                item.velocity.copy(dir).multiplyScalar(6.0);
                if (Math.abs(dir.y) > 0.2) item.velocity.y = Math.max(item.velocity.y, 5.0);
                if (dir.y > 0.4) {
                    item.mesh.position.y = Math.max(item.mesh.position.y, y + 1.25);
                } else {
                    item.mesh.position.add(dir.multiplyScalar(0.7));
                }
                item.onGround = false;
                item.isMagnetized = false;
                item.pickupDelay = 0.5;
            }
        }
    }

    spawnItem(x, y, z, vx, vy, vz, type, pickupDelay = 0.5, id = null, count = 1) {
        const material = this.itemMaterials[type] || this.materials[type];
        if (material) {
            const pos = new THREE.Vector3(x, y, z);
            const velocity = new THREE.Vector3(vx, vy, vz);
            const item = new DroppedItem(this.scene, pos, type, material, velocity, pickupDelay, count);
            item.dbId = id;
            this.droppedItems.push(item);
            return item;
        }
        return null;
    }

    dropItem(x, y, z, type) {
        if (type === BLOCK_TYPES.AIR) return;
        if (type === BLOCK_TYPES.GRASS_BLOCK) type = BLOCK_TYPES.DIRT;
        else if (type === BLOCK_TYPES.STONE) type = BLOCK_TYPES.COBBLESTONE;
        else if (type === BLOCK_TYPES.TALL_GRASS_TOP || type === BLOCK_TYPES.TALL_GRASS) type = BLOCK_TYPES.TALL_GRASS;
        else if (type === BLOCK_TYPES.OAK_LEAVES || type === BLOCK_TYPES.BIRCH_LEAVES) return;

        const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
        const velocity = new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);

        if (this.onItemDrop) {
            this.onItemDrop({
                x: pos.x, y: pos.y, z: pos.z,
                vx: velocity.x, vy: velocity.y, vz: velocity.z,
                type,
                pickupDelay: 0.5,
                count: 1
            });
            return;
        }

        this.spawnItem(pos.x, pos.y, pos.z, velocity.x, velocity.y, velocity.z, type, 0.5, null, 1);
    }

    throwItem(position, velocity, type) {
        if (type === BLOCK_TYPES.AIR) return;

        if (this.onItemDrop) {
            this.onItemDrop({
                x: position.x, y: position.y, z: position.z,
                vx: velocity.x, vy: velocity.y, vz: velocity.z,
                type,
                pickupDelay: 1.5,
                count: 1
            });
            return;
        }

        this.spawnItem(position.x, position.y, position.z, velocity.x, velocity.y, velocity.z, type, 1.5, null, 1);
    }

    dropStack(x, y, z, vx, vy, vz, type, count) {
        if (this.onItemDrop) {
            this.onItemDrop({
                x, y, z, vx, vy, vz, type, count, pickupDelay: 1.0
            });
            return;
        }
        this.spawnItem(x, y, z, vx, vy, vz, type, 1.0, null, count);
    }

    update(delta, player, onPickup) {
        this.updateChunks(player.position);

        this.fluidTickTimer += delta;
        if (this.fluidTickTimer > 0.25) {
            this.fluidTickTimer = 0;
            this.simulateFluids();
        }

        if (this.textures.water_still) {
            this.waterFrameTimer += delta * 20;
            const frameTime = this.waterMeta.frametime || 2;

            if (this.waterFrameTimer >= frameTime) {
                this.waterFrameTimer -= frameTime;
                this.waterFrameIndex++;
                const totalFrames = 32;
                let currentFrame = 0;
                if (this.waterMeta.frames && this.waterMeta.frames.length > 0) {
                    const f = this.waterMeta.frames[this.waterFrameIndex % this.waterMeta.frames.length];
                    currentFrame = (typeof f === 'object') ? f.index : f;
                } else {
                    currentFrame = this.waterFrameIndex % totalFrames;
                }
                this.textures.water_still.offset.y = 1 - (currentFrame + 1) / 32;
            }
        }

        if (this.textures.fire && this.textures.fire.image) {
            this.fireFrameTimer += delta * 20;
            const frameTime = this.fireMeta.frametime || 2;
            
            if (this.fireFrameTimer >= frameTime) {
                this.fireFrameTimer -= frameTime;
                this.fireFrameIndex++;
                
                const img = this.textures.fire.image;
                const numFrames = img.width > 0 ? Math.floor(img.height / img.width) : 32;
                
                if (this.textures.fire.repeat.y === 1) this.textures.fire.repeat.set(1, 1/numFrames);

                let currentFrame = 0;
                if (this.fireMeta.frames && this.fireMeta.frames.length > 0) {
                    const f = this.fireMeta.frames[this.fireFrameIndex % this.fireMeta.frames.length];
                    currentFrame = (typeof f === 'object') ? f.index : f;
                } else {
                    currentFrame = this.fireFrameIndex % numFrames;
                }
                this.textures.fire.offset.y = 1 - (currentFrame + 1) / numFrames;
            }
        }

        if (this.cloudMesh) {
            this.cloudMesh.position.x += delta * 1.5;
        }

        for (let i = this.droppedItems.length - 1; i >= 0; i--) {
            const item = this.droppedItems[i];
            const pickedUp = item.update(delta, player.position, onPickup, this);

            if (pickedUp) {
                item.dispose();
                this.droppedItems.splice(i, 1);
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const alive = p.update(delta, this);
            if (!alive) {
                p.dispose();
                this.particles.splice(i, 1);
            }
        }
    }

    getParticleTexture(blockType) {
        let texture = this.textures.stone;
        let color = 0xffffff;

        switch (blockType) {
            case BLOCK_TYPES.GRASS_BLOCK: texture = this.textures.dirt; break;
            case BLOCK_TYPES.DIRT: texture = this.textures.dirt; break;
            case BLOCK_TYPES.STONE: texture = this.textures.stone; break;
            case BLOCK_TYPES.COBBLESTONE: texture = this.textures.cobblestone; break;
            case BLOCK_TYPES.OAK_LOG: texture = this.textures.oak_log_side; break;
            case BLOCK_TYPES.OAK_PLANKS: texture = this.textures.oak_planks; break;
            case BLOCK_TYPES.OAK_LEAVES: texture = this.textures.oak_leaves; color = this.blockColors.foliage || 0x4CA64C; break;
            case BLOCK_TYPES.BIRCH_LOG: texture = this.textures.birch_log_side; break;
            case BLOCK_TYPES.BIRCH_PLANKS: texture = this.textures.birch_planks; break;
            case BLOCK_TYPES.BIRCH_LEAVES: texture = this.textures.birch_leaves; color = this.blockColors.foliage || 0x4CA64C; break;
            case BLOCK_TYPES.CRAFTING_TABLE: texture = this.textures.oak_planks; break;
            case BLOCK_TYPES.FURNACE: texture = this.textures.cobblestone; break;
            case BLOCK_TYPES.DEEPSLATE: texture = this.textures.deepslate; break;
            case BLOCK_TYPES.SAND: texture = this.textures.sand; break;
            case BLOCK_TYPES.GRASS:
            case BLOCK_TYPES.TALL_GRASS:
            case BLOCK_TYPES.TALL_GRASS_TOP:
            case BLOCK_TYPES.DANDELION:
            case BLOCK_TYPES.POPPY:
            case BLOCK_TYPES.OXEYE_DAISY:
            case BLOCK_TYPES.CORNFLOWER:
            case BLOCK_TYPES.RED_TULIP:
            case BLOCK_TYPES.ORANGE_TULIP:
            case BLOCK_TYPES.WHITE_TULIP:
            case BLOCK_TYPES.PINK_TULIP:
                texture = this.textures.short_grass;
                color = this.blockColors.grass;
                break;
            default: texture = this.textures.stone;
        }
        return { texture, color };
    }

    createExplosion(x, y, z, blockType) {
        if (blockType === BLOCK_TYPES.AIR) return;
        const { texture, color } = this.getParticleTexture(blockType);
        const count = 12;
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(this.scene, x, y, z, texture, color));
        }
    }

    simulateFluids() {
        if (this.activeFluidBlocks.size === 0) return;

        const changes = []; // Array of updates
        const nextActive = new Set();
        let updates = 0;
        const MAX_UPDATES = 2000;

        for (const key of this.activeFluidBlocks) {
            if (updates++ > MAX_UPDATES) {
                nextActive.add(key);
                continue;
            }

            const [x, y, z] = key.split(',').map(Number);
            const type = this.getBlock(x, y, z);

            if (type !== BLOCK_TYPES.AIR && type !== BLOCK_TYPES.WATER_BUCKET) continue;

            const cx = Math.floor(x / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
            const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

            const chunk = this.chunks.get(`${cx},${cz}`);
            if (!chunk) continue; // Should not happen if active

            const level = chunk.getWaterLevel(lx, y, lz);
            const isSource = chunk.isWaterSource(lx, y, lz);

            let maxInputLevel = 0;
            let inputIsFalling = false;

            const upType = this.getBlock(x, y + 1, z);
            if (upType === BLOCK_TYPES.WATER_BUCKET) {
                maxInputLevel = 8;
                inputIsFalling = true;
            }

            if (!inputIsFalling) {
                const neighbors = [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
                for (const [nx, ny, nz] of neighbors) {
                    const nType = this.getBlock(nx, ny, nz);
                    if (nType === BLOCK_TYPES.WATER_BUCKET) {
                        const ndType = this.getBlock(nx, ny - 1, nz);
                        let supported = false;

                        if (ndType !== BLOCK_TYPES.AIR && ndType !== BLOCK_TYPES.WATER_BUCKET &&
                            ndType !== BLOCK_TYPES.GRASS &&
                            ndType !== BLOCK_TYPES.TALL_GRASS &&
                            ndType !== BLOCK_TYPES.TALL_GRASS_TOP) {
                            supported = true;
                        } else if (ndType === BLOCK_TYPES.WATER_BUCKET) {
                            const ncx = Math.floor(nx / CHUNK_SIZE);
                            const ncz = Math.floor(nz / CHUNK_SIZE);
                            const nlx = (nx % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                            const nlz = (nz % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                            const nChunk = this.chunks.get(`${ncx},${ncz}`);
                            if (nChunk && nChunk.isWaterSource(nlx, ny - 1, nlz)) supported = true;
                        }

                        if (supported) {
                            const nLevel = this.getWaterLevel(nx, ny, nz);
                            if (nLevel - 1 > maxInputLevel) {
                                maxInputLevel = nLevel - 1;
                            }
                        }
                    }
                }
            }

            if (type === BLOCK_TYPES.WATER_BUCKET || type === BLOCK_TYPES.AIR) {
                if (!isSource && !inputIsFalling) {
                    const neighbors = [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
                    let sourceNeighbors = 0;
                    for (const [nx, ny, nz] of neighbors) {
                        if (this.getBlock(nx, ny, nz) === BLOCK_TYPES.WATER_BUCKET) {
                            const ncx = Math.floor(nx / CHUNK_SIZE);
                            const ncz = Math.floor(nz / CHUNK_SIZE);
                            const nlx = (nx % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                            const nlz = (nz % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                            const nChunk = this.chunks.get(`${ncx},${ncz}`);
                            if (nChunk && nChunk.isWaterSource(nlx, ny, nlz)) sourceNeighbors++;
                        }
                    }
                    const downType = this.getBlock(x, y - 1, z);
                    if (sourceNeighbors >= 2 && (downType !== BLOCK_TYPES.AIR)) {
                        maxInputLevel = 8;
                    }
                }
            }

            let newLevel = isSource ? 8 : maxInputLevel;
            let newType = newLevel > 0 ? BLOCK_TYPES.WATER_BUCKET : BLOCK_TYPES.AIR;
            let newIsSource = isSource || (newLevel === 8 && !inputIsFalling && !isSource);

            if (newType !== type || newLevel !== level || newIsSource !== isSource) {
                changes.push({ x, y, z, type: newType, level: newLevel, isSource: newIsSource });
                nextActive.add(`${x + 1},${y},${z}`);
                nextActive.add(`${x - 1},${y},${z}`);
                nextActive.add(`${x},${y + 1},${z}`);
                nextActive.add(`${x},${y},${z + 1}`);
                nextActive.add(`${x},${y},${z - 1}`);
                nextActive.add(`${x},${y - 1},${z}`);
                nextActive.add(key);
            }

            if (newType === BLOCK_TYPES.WATER_BUCKET) {
                const downKey = `${x},${y - 1},${z}`;
                const downType = this.getBlock(x, y - 1, z);

                const downCx = Math.floor(x / CHUNK_SIZE);
                const downCz = Math.floor(z / CHUNK_SIZE);
                const downLx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                const downLz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
                const downChunk = this.chunks.get(`${downCx},${downCz}`);
                const downIsSource = downChunk ? downChunk.isWaterSource(downLx, y - 1, downLz) : false;

                if (downType === BLOCK_TYPES.AIR || (downType === BLOCK_TYPES.WATER_BUCKET && !downIsSource)) {
                    const downLevel = this.getWaterLevel(x, y - 1, z);
                    if (downLevel !== newLevel) {
                        nextActive.add(downKey);
                    }
                } else if (downType !== BLOCK_TYPES.WATER_BUCKET && downType !== BLOCK_TYPES.AIR) {
                    const spreadLevel = newLevel - 1;
                    if (spreadLevel > 0) {
                        const neighbors = [[x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
                        for (const [tx, ty, tz] of neighbors) {
                            const tType = this.getBlock(tx, ty, tz);
                            if (tType === BLOCK_TYPES.AIR || tType === BLOCK_TYPES.WATER_BUCKET) {
                                nextActive.add(`${tx},${ty},${tz}`);
                            }
                        }
                    }
                }
            }
        }

        this.activeFluidBlocks = nextActive;
        const dirtyChunks = new Set();

        changes.forEach(c => {
            const cx = Math.floor(c.x / CHUNK_SIZE);
            const cz = Math.floor(c.z / CHUNK_SIZE);
            const lx = (c.x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
            const lz = (c.z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;

            const chunk = this.chunks.get(`${cx},${cz}`);
            if (chunk) {
                chunk.setBlock(lx, c.y, c.z, c.type);
                chunk.setWaterLevel(lx, c.y, c.z, c.level);
                chunk.setWaterSource(lx, c.y, c.z, c.isSource);
                dirtyChunks.add(`${cx},${cz}`);

                // If we changed a block on the edge, we need to update the neighbor chunk
                if (lx === 0) dirtyChunks.add(`${cx - 1},${cz}`);
                if (lx === CHUNK_SIZE - 1) dirtyChunks.add(`${cx + 1},${cz}`);
                if (lz === 0) dirtyChunks.add(`${cx},${cz - 1}`);
                if (lz === CHUNK_SIZE - 1) dirtyChunks.add(`${cx},${cz + 1}`);
            }
        });

        dirtyChunks.forEach(key => {
            const [cx, cz] = key.split(',').map(Number);
            this.rebuildChunkMesh(cx, cz);
        });
    }

    createMiningParticles(x, y, z, blockType) {
        if (blockType === BLOCK_TYPES.AIR) return;
        const { texture, color } = this.getParticleTexture(blockType);

        const count = 2;
        const options = {
            size: 0.04 + Math.random() * 0.04,
            life: 0.2 + Math.random() * 0.2,
            speed: 2,
            spread: 1.1
        };

        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(this.scene, x, y, z, texture, color, options));
        }
    }

    createSplashParticles(x, y, z) {
        const texture = this.textures.bubble;
        const count = 12;
        for (let i = 0; i < count; i++) {
            const options = {
                life: 0.5 + Math.random() * 0.5,
                speed: 1.5,
                spread: 0.8,
                type: 'sprite',
                size: 0.05 + Math.random() * 0.1,
                velocity: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.5,
                    Math.random() * 2 + 1,
                    (Math.random() - 0.5) * 1.5
                )
            };
            const p = new Particle(this.scene, x, y, z, texture, 0xffffff, options);
            this.particles.push(p);
        }
    }

    async loadFlowerTextures(setupMaterials) {
        const atlas = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = '/Flowers.png';
        });

        const atlasJson = await fetch('/Flowers.json').then(r => r.json());

        const flowerMappings = [
            { type: BLOCK_TYPES.DANDELION, frame: 'dandelion.png' },
            { type: BLOCK_TYPES.POPPY, frame: 'poppy.png' },
            { type: BLOCK_TYPES.OXEYE_DAISY, frame: 'oxeye_daisy.png' },
            { type: BLOCK_TYPES.CORNFLOWER, frame: 'cornflower.png' },
            { type: BLOCK_TYPES.RED_TULIP, frame: 'red_tulip.png' },
            { type: BLOCK_TYPES.ORANGE_TULIP, frame: 'orange_tulip.png' },
            { type: BLOCK_TYPES.WHITE_TULIP, frame: 'white_tulip.png' },
            { type: BLOCK_TYPES.PINK_TULIP, frame: 'pink_tulip.png' }
        ];

        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');

        for (const mapping of flowerMappings) {
            const frameData = atlasJson.frames[mapping.frame].frame;
            ctx.clearRect(0, 0, 16, 16);
            ctx.drawImage(atlas, frameData.x, frameData.y, frameData.w, frameData.h, 0, 0, 16, 16);

            const dataUrl = canvas.toDataURL();
            const tex = this.textureLoader.load(dataUrl);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;

            const key = mapping.frame.replace('.png', '');
            this.textures[key] = tex;
            this.textures[mapping.type] = dataUrl;

            this.materials[mapping.type] = setupMaterials(new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                side: THREE.DoubleSide,
                alphaTest: 0.5
            }));
        }
    }

    generateClouds() {
        const loader = new THREE.ImageLoader();
        loader.load('/clouds.png', (image) => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            const data = ctx.getImageData(0, 0, image.width, image.height).data;
            const width = image.width;
            const height = image.height;

            const instances = [];
            const stride = Math.max(1, Math.floor(width / 128));

            for (let y = 0; y < height; y += stride) {
                for (let x = 0; x < width; x += stride) {
                    const i = (y * width + x) * 4;
                    const r = data[i];
                    if (r > 128) {
                        instances.push({ x: x / stride, z: y / stride });
                    }
                }
            }

            if (instances.length === 0) return;

            const cloudGeo = new THREE.BoxGeometry(1, 1, 1);

            const count = cloudGeo.attributes.position.count;
            const colors = new Float32Array(count * 3);
            const normals = cloudGeo.attributes.normal;

            for (let i = 0; i < count; i++) {
                const ny = normals.getY(i);
                const shade = Math.abs(ny) > 0.5 ? 0.75 : 1.0;
                colors[i * 3] = shade;
                colors[i * 3 + 1] = shade;
                colors[i * 3 + 2] = shade;
            }
            cloudGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const cloudMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.8,
                fog: true,
                vertexColors: true
            });

            const patternWidth = Math.floor(width / stride);
            const patternHeight = Math.floor(height / stride);

            const repeatX = Math.ceil(256 / patternWidth);
            const repeatZ = Math.ceil(256 / patternHeight);

            const totalInstances = instances.length * repeatX * repeatZ;
            const maxInstances = 50000;
            const actualInstances = Math.min(totalInstances, maxInstances);

            const mesh = new THREE.InstancedMesh(cloudGeo, cloudMat, actualInstances);
            mesh.name = "clouds";

            const dummy = new THREE.Object3D();
            let idx = 0;

            const scale = 4;
            const centerX = (patternWidth * repeatX * scale) / 2;
            const centerZ = (patternHeight * repeatZ * scale) / 2;

            for (let rx = 0; rx < repeatX; rx++) {
                for (let rz = 0; rz < repeatZ; rz++) {
                    const offX = rx * patternWidth * scale - centerX;
                    const offZ = rz * patternHeight * scale - centerZ;

                    for (const pos of instances) {
                        if (idx >= actualInstances) break;
                        dummy.position.set(offX + pos.x * scale, 35, offZ + pos.z * scale);
                        dummy.scale.set(scale, 4, scale);
                        dummy.updateMatrix();
                        mesh.setMatrixAt(idx++, dummy.matrix);
                    }
                    if (idx >= actualInstances) break;
                }
            }

            mesh.instanceMatrix.needsUpdate = true;
            this.scene.add(mesh);
            this.cloudMesh = mesh;
        });
    }
}