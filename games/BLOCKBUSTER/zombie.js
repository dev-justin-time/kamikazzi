import * as THREE from 'three';
import { BLOCK_TYPES } from './world.js';

export class Zombie {
  constructor(scene, position, world, playerModelTemplate) {
    this.scene = scene;
    this.world = world;
    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.width = 0.6;
    this.height = 1.8;
    this.speed = 2.28;
    this.gravity = -30.0;
    this.onGround = false;
    this.dead = false;
    this.health = 20;
    this.despawnTimer = 0;
    this.attackCooldown = 0;
    this.invulnerabilityTimer = 0;
    
    this.mesh = new THREE.Group();
    this.parts = {};
    
    if (playerModelTemplate) {
        const model = playerModelTemplate.clone();
        this.mesh.add(model);
        
        const img = new Image();
        img.src = '/zombie.png';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Standardize to 64x64
            canvas.width = 64;
            canvas.height = 64;
            
            // Draw original
            ctx.drawImage(img, 0, 0);
            
            // Copy Right Leg to Left Leg (x=16, y=48)
            ctx.drawImage(img, 0, 16, 16, 16, 16, 48, 16, 16);
            
            // Copy Right Arm to Left Arm (x=32, y=48)
            ctx.drawImage(img, 40, 16, 16, 16, 32, 48, 16, 16);

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.flipY = false;

            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mat = child.material.clone();
                    mat.map = tex;
                    child.material = mat;
                    child.material.needsUpdate = true;
                }
            });
        };

        model.traverse((child) => {
            if (child.name.toLowerCase().includes('pivot')) child.visible = false;
            
            const name = child.name.toLowerCase();
            if (!this.parts.head && name.includes('head')) {
                this.parts.head = child;
                child.rotation.order = 'YXZ';
            }
            else if (!this.parts.armL && ((name.includes('arm') && name.includes('left')) || name.includes('leftarm'))) this.parts.armL = child;
            else if (!this.parts.armR && ((name.includes('arm') && name.includes('right')) || name.includes('rightarm'))) this.parts.armR = child;
            else if (!this.parts.legL && ((name.includes('leg') && name.includes('left')) || name.includes('leftleg'))) this.parts.legL = child;
            else if (!this.parts.legR && ((name.includes('leg') && name.includes('right')) || name.includes('rightleg'))) this.parts.legR = child;
        });
        
        // Zombie pose
        if (this.parts.armL) this.parts.armL.rotation.x = Math.PI / 2;
        if (this.parts.armR) this.parts.armR.rotation.x = Math.PI / 2;
    }

    // Fire Visuals
    if (this.world.textures && this.world.textures.fire) {
        const fireTex = this.world.textures.fire;
        const fireMat = new THREE.MeshBasicMaterial({
            map: fireTex,
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true
        });
        const fireGeo = new THREE.PlaneGeometry(1.2, 1.8);
        this.fireMesh = new THREE.Group();
        
        const p1 = new THREE.Mesh(fireGeo, fireMat);
        p1.rotation.y = Math.PI / 4;
        this.fireMesh.add(p1);
        
        const p2 = new THREE.Mesh(fireGeo, fireMat);
        p2.rotation.y = -Math.PI / 4;
        this.fireMesh.add(p2);
        
        this.fireMesh.position.y = 1.4;
        this.fireMesh.visible = false;
        this.mesh.add(this.fireMesh);
    }
    
    this.scene.add(this.mesh);
  }
  
  update(delta, playerPos, isDay) {
      if (this.dead) return;

      if (this.attackCooldown > 0) this.attackCooldown -= delta;
      if (this.invulnerabilityTimer > 0) this.invulnerabilityTimer -= delta;
      
      // Burning logic
      let isBurning = false;
      if (isDay) {
          // Check sky light
          const x = Math.floor(this.position.x);
          const y = Math.floor(this.position.y + 1);
          const z = Math.floor(this.position.z);
          const light = this.world.getSkyLight(x, y, z);
          if (light > 14) {
              isBurning = true;
              this.despawnTimer += delta;
              // Take damage every second
              if (this.despawnTimer > 1.0) {
                  this.despawnTimer = 0;
                  this.takeDamage(2, null);
              }
          } else {
              this.despawnTimer = 0;
          }
      } else {
          this.despawnTimer = 0;
      }

      if (this.fireMesh) {
          this.fireMesh.visible = isBurning;
      }
      this.mesh.visible = true;

      // Movement Logic
      const dist = this.position.distanceTo(playerPos);
      let targetVx = 0;
      let targetVz = 0;

      if (dist < 35 && dist > 0.8) {
          const dx = playerPos.x - this.position.x;
          const dz = playerPos.z - this.position.z;
          const angle = Math.atan2(dx, dz);
          
          targetVx = Math.sin(angle) * this.speed;
          targetVz = Math.cos(angle) * this.speed;
          
          // Rotate 180 degrees if texture appears backwards
          this.mesh.rotation.y = angle + Math.PI;
      }

      // Check for knockback (high velocity)
      const currentSpeedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
      if (currentSpeedSq > this.speed * this.speed * 2.0) {
          // Apply friction to knockback
          const friction = Math.pow(0.001, delta); 
          this.velocity.x *= friction;
          this.velocity.z *= friction;
      } else {
          // AI Movement
          this.velocity.x = targetVx;
          this.velocity.z = targetVz;
      }
      
      this.velocity.y += this.gravity * delta;
      
      this.position.x += this.velocity.x * delta;
      this.resolveCollision('x');
      this.position.z += this.velocity.z * delta;
      this.resolveCollision('z');
      this.position.y += this.velocity.y * delta;
      this.resolveCollision('y');
      
      if (this.position.y < -30) this.dead = true;
      
      this.mesh.position.copy(this.position);
      
      // Animation
      if (this.parts.legL && this.parts.legR) {
          const t = performance.now() / 150;
          const moving = Math.abs(this.velocity.x) > 0.1 || Math.abs(this.velocity.z) > 0.1;
          const amp = moving ? 0.6 : 0;
          this.parts.legL.rotation.x = Math.sin(t) * amp;
          this.parts.legR.rotation.x = -Math.sin(t) * amp;
          
          if (this.parts.armL) this.parts.armL.rotation.x = Math.PI / 2 + Math.cos(t) * (amp * 0.2);
          if (this.parts.armR) this.parts.armR.rotation.x = Math.PI / 2 + Math.cos(t) * (amp * 0.2);
      }
  }
  
  getBox(pos) {
    const half = this.width / 2;
    return new THREE.Box3(
      new THREE.Vector3(pos.x - half, pos.y, pos.z - half),
      new THREE.Vector3(pos.x + half, pos.y + this.height, pos.z + half)
    );
  }
  
  resolveCollision(axis) {
    const box = this.getBox(this.position);
    const minX = Math.floor(box.min.x);
    const maxX = Math.floor(box.max.x);
    const minY = Math.floor(box.min.y);
    const maxY = Math.floor(box.max.y);
    const minZ = Math.floor(box.min.z);
    const maxZ = Math.floor(box.max.z);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = this.world.getBlock(x, y, z);
          if (b !== BLOCK_TYPES.AIR && b !== BLOCK_TYPES.WATER_BUCKET &&
              b !== BLOCK_TYPES.GRASS && b !== BLOCK_TYPES.TALL_GRASS && 
              b !== BLOCK_TYPES.TALL_GRASS_TOP && !(b >= 59 && b <= 66)) {
            
            if (axis === 'y') {
              if (this.velocity.y < 0) {
                this.position.y = y + 1;
                this.velocity.y = 0;
                this.onGround = true;
              } else {
                this.position.y = y - this.height;
                this.velocity.y = 0;
              }
            } else if (axis === 'x') {
              if (this.velocity.x > 0) this.position.x = x - this.width/2 - 0.001;
              else this.position.x = x + 1 + this.width/2 + 0.001;
              
              if (this.onGround && y === Math.floor(this.position.y)) {
                  // Only auto-jump if the block above is passable (not a wall)
                  const upperB = this.world.getBlock(x, y + 1, z);
                  const isPassable = upperB === BLOCK_TYPES.AIR || upperB === BLOCK_TYPES.WATER_BUCKET ||
                                     upperB === BLOCK_TYPES.GRASS || upperB === BLOCK_TYPES.TALL_GRASS || 
                                     upperB === BLOCK_TYPES.TALL_GRASS_TOP || (upperB >= 59 && upperB <= 66);
                  if (isPassable) this.velocity.y = 6;
              }
            } else if (axis === 'z') {
              if (this.velocity.z > 0) this.position.z = z - this.width/2 - 0.001;
              else this.position.z = z + 1 + this.width/2 + 0.001;
              
              if (this.onGround && y === Math.floor(this.position.y)) {
                  // Only auto-jump if the block above is passable (not a wall)
                  const upperB = this.world.getBlock(x, y + 1, z);
                  const isPassable = upperB === BLOCK_TYPES.AIR || upperB === BLOCK_TYPES.WATER_BUCKET ||
                                     upperB === BLOCK_TYPES.GRASS || upperB === BLOCK_TYPES.TALL_GRASS || 
                                     upperB === BLOCK_TYPES.TALL_GRASS_TOP || (upperB >= 59 && upperB <= 66);
                  if (isPassable) this.velocity.y = 6;
              }
            }
            return;
          }
        }
      }
    }
  }
  
  takeDamage(amount, knockback) {
      if (this.invulnerabilityTimer > 0) return;
      this.invulnerabilityTimer = 0.5;

      this.health -= amount;
      
      // Visual feedback
      if (this.mesh) {
          this.mesh.traverse(c => {
              if (c.isMesh && c.material) {
                  c.material.color.setRGB(1, 0.5, 0.5);
              }
          });
          setTimeout(() => {
              if (!this.dead && this.mesh) {
                 this.mesh.traverse(c => {
                     if (c.isMesh && c.material) {
                         c.material.color.setRGB(1, 1, 1);
                     }
                 });
              }
          }, 200);
      }

      if (knockback) {
          this.velocity.x = knockback.x;
          this.velocity.y = knockback.y;
          this.velocity.z = knockback.z;
          this.onGround = false;
      }

      if (this.health <= 0) {
          this.dead = true;
      }
  }

  dispose() {
      this.scene.remove(this.mesh);
  }
}