import * as THREE from 'three';
import { BLOCK_TYPES } from './world.js';

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    
    // Position tracks the player's feet
    this.position = new THREE.Vector3(0, 32, 0);
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    
    // Physical Dimensions (AABB)
    this.width = 0.6;
    this.height = 1.8;
    
    // Eye heights relative to feet
    this.eyeHeight = 1.62;
    this.crouchEyeHeight = 1.42;
    
    this.isSprinting = false;
    this.isCrouching = false;
    this.wasInWater = false;
    this.lastVelocityY = 0;
    this.highestY = this.position.y;

    // Movement Parameters
    this.walkSpeed = 4.317;
    this.sprintSpeed = 5.612;
    this.crouchSpeed = 1.3;
    this.speed = this.walkSpeed;
    
    this.jumpForce = 9.0;
    this.gravity = -30.0;
    
    this.onGround = false;
    this.bodyYaw = 0;
    
    this.hurtTimer = 0;
    this.stepTimer = 0;
    this.stepInterval = 0.5;
    
    this.soundVolume = 1.0;
    this.masterVolume = 1.0;
    
    this.initAudio();

    this.bobTimer = 0;
    this.bobAmplitude = 0;

    this.cameraMode = 0; // 0: First, 1: Third Back, 2: Third Front
    this.controls = null;
    this.mesh = null;
    this.parts = {};

    // First Person Hand
    this.fpHandGroup = new THREE.Group();
    this.camera.add(this.fpHandGroup);
    this.fpHandSettings = {
       pos: { x: 0.69, y: -0.28, z: -1.32 },
       rot: { x: -1.93, y: 1.87, z: -2.22 },
       scale: 0.88
    };

    // Load hand settings from file if possible
    fetch('/hand_settings.json')
       .then(r => r.json())
       .then(data => {
          this.fpHandSettings = data;
          this.updateFPHandTransform();
       })
       .catch(() => console.log("Using default hand settings"));

    const defaultAnim = {
       pos: { x: -0.4, y: -0.09, z: 0.06 },
       rot: { x: 0.18, y: 0.42, z: 0.18 },
       speed: 5.0
    };

    this.anims = {
       hand: JSON.parse(JSON.stringify(defaultAnim)),
       block: JSON.parse(JSON.stringify(defaultAnim)),
       item: JSON.parse(JSON.stringify(defaultAnim)),
       tool: JSON.parse(JSON.stringify(defaultAnim))
    };

    this.activeSwingAnim = this.anims.hand;

    // Load specific animations from files
    const loadAnim = (url, targetKey) => {
       fetch(url).then(r => r.json()).then(data => {
          Object.assign(this.anims[targetKey], data);
       }).catch(() => console.log(`No ${url} found, using default for ${targetKey}`));
    };

    loadAnim('/hand_animation.json', 'hand');
    loadAnim('/block_animation (1).json', 'block');
    loadAnim('/item_animation (1).json', 'item');
    loadAnim('/tool_animation (1).json', 'tool');

    this.swingProgress = 0;
    this.isSwinging = false;

    this.heldItemMesh = null;
    this.armMeshGroup = null;

    const defaultTransform = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: 1.0 };
    this.heldBlockSettings = JSON.parse(JSON.stringify(defaultTransform));
    this.heldItemSettings = JSON.parse(JSON.stringify(defaultTransform));
    this.heldToolSettings = JSON.parse(JSON.stringify(defaultTransform));
    this.currentHeldType = null;

    // Load held settings
    const loadSettings = (url, target) => {
      fetch(url).then(r => r.json()).then(data => {
        Object.assign(target, data);
        this.applyHeldItemTransform();
      }).catch(() => console.log(`No ${url} found, using default`));
    };

    loadSettings('/held_block_settings (1).json', this.heldBlockSettings);
    loadSettings('/held_item_settings (2).json', this.heldItemSettings);
    loadSettings('/held_tool_settings (1).json', this.heldToolSettings);
  }

  getHeldCategory(blockType) {
    if (!blockType || blockType === BLOCK_TYPES.AIR) return 'hand';
    // Tools are pickaxes, axes, shovels, hoes, swords, buckets, and wands
    const isTool = (blockType >= BLOCK_TYPES.WOODEN_AXE && blockType <= BLOCK_TYPES.NETHERITE_SWORD) || 
                   (blockType >= BLOCK_TYPES.STRUCTURE_WAND && blockType <= BLOCK_TYPES.BUCKET);
    // Items are raw ores, ingots, coal, diamonds, sticks, and vegetation (flowers/grass)
    const isItem = (blockType >= BLOCK_TYPES.RAW_IRON && blockType <= BLOCK_TYPES.DIAMOND) || 
                   blockType === BLOCK_TYPES.STICK ||
                   blockType === BLOCK_TYPES.GRASS ||
                   blockType === BLOCK_TYPES.TALL_GRASS ||
                   blockType === BLOCK_TYPES.TALL_GRASS_TOP ||
                   (blockType >= 59 && blockType <= 66);
    
    if (isTool) return 'tool';
    if (isItem) return 'item';
    return 'block';
  }

  getCurrentHeldSettings() {
    const cat = this.getHeldCategory(this.currentHeldType);
    if (cat === 'tool') return this.heldToolSettings;
    if (cat === 'item') return this.heldItemSettings;
    return this.heldBlockSettings;
  }

  applyHeldItemTransform() {
    if (this.heldItemMesh) {
       const settings = this.getCurrentHeldSettings();
       this.heldItemMesh.position.set(settings.pos.x, settings.pos.y, settings.pos.z);
       this.heldItemMesh.rotation.set(settings.rot.x, settings.rot.y, settings.rot.z);
       this.heldItemMesh.scale.set(settings.scale, settings.scale, settings.scale);
    }
  }

  updateFPHandTransform() {
     if (!this.fpHandGroup) return;
     this.fpHandGroup.position.set(this.fpHandSettings.pos.x, this.fpHandSettings.pos.y, this.fpHandSettings.pos.z);
     this.fpHandGroup.rotation.set(this.fpHandSettings.rot.x, this.fpHandSettings.rot.y, this.fpHandSettings.rot.z);
     this.fpHandGroup.scale.set(this.fpHandSettings.scale, this.fpHandSettings.scale, this.fpHandSettings.scale);
  }

  swingHand() {
     if (this.isSwinging) return;
     
     // Determine which animation to use based on current category
     const cat = this.getHeldCategory(this.currentHeldType);
     this.activeSwingAnim = this.anims[cat] || this.anims.hand;
     
     this.isSwinging = true;
     this.swingProgress = 0;
  }

  updateHeldItem(blockType) {
    if (!this.fpHandGroup) return;
    this.currentHeldType = blockType;

    // Remove existing held item mesh
    if (this.heldItemMesh) {
       this.fpHandGroup.remove(this.heldItemMesh);
       this.heldItemMesh = null;
    }

    if (!blockType || blockType === BLOCK_TYPES.AIR) {
       // Show arm, no item
       if (this.armMeshGroup) this.armMeshGroup.visible = true;
    } else {
       // Hide arm, show block/item
       if (this.armMeshGroup) this.armMeshGroup.visible = false;

       let material = this.world.itemMaterials[blockType] || this.world.materials[blockType];

       if (material) {
          const cat = this.getHeldCategory(blockType);
          const isToolOrItem = (cat === 'tool' || cat === 'item');
          
          let geometry;
          if (isToolOrItem) {
             // Plane for 2D items/tools
             geometry = new THREE.PlaneGeometry(0.8, 0.8);
          } else {
             // Cube for blocks
             geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
          }

          // Add lighting attributes for the custom shader compatibility
          const count = geometry.attributes.position.count;
          geometry.setAttribute('aLight', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1.0), 1));
          geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1.0), 3));

          // If block has multiple materials (like grass), apply them to the mesh
          if (Array.isArray(material)) {
             this.heldItemMesh = new THREE.Mesh(geometry, material);
          } else {
             this.heldItemMesh = new THREE.Mesh(geometry, material);
          }
          
          // Adjust 2D tool/item orientation
          if (isToolOrItem) {
             this.heldItemMesh.rotation.y = Math.PI / 4;
          }

          this.fpHandGroup.add(this.heldItemMesh);
          this.applyHeldItemTransform();
       } else {
          // Fallback to arm if no material found
          if (this.armMeshGroup) this.armMeshGroup.visible = true;
       }
    }
  }

  setMesh(mesh) {
    if (this.mesh) {
      this.world.scene.remove(this.mesh);
    }
    this.mesh = mesh;
    this.world.scene.add(this.mesh);
    this.mesh.visible = this.cameraMode !== 0;

    // Create First Person Hand from Mesh
    this.fpHandGroup.clear();
    this.armMeshGroup = null;
    
    const armParts = [];
    mesh.traverse(child => {
       if (child.isMesh) {
          const name = child.name.toLowerCase();
          const isRightArm = (name.includes('arm') && name.includes('right')) || 
                             (name.includes('sleeve') && name.includes('right'));
          if (isRightArm) {
             armParts.push(child);
          }
       }
    });

    if (armParts.length > 0) {
       this.armMeshGroup = new THREE.Group();
       armParts.forEach(p => {
          const clone = p.clone();
          clone.position.set(0, 0, 0); 
          
          if (clone.material) {
             const sourceTex = p.material.map;
             clone.material = clone.material.clone();
             if (sourceTex) clone.material.map = sourceTex;
             
             clone.material.depthTest = true;
             clone.material.depthWrite = true;
             clone.material.transparent = true;
             clone.material.alphaTest = 0.5;
          }
          clone.renderOrder = 100;
          this.armMeshGroup.add(clone);
       });
       this.fpHandGroup.add(this.armMeshGroup);
       this.updateFPHandTransform();
    }
    
    // Setup parts for animation
    this.parts = {};
    mesh.traverse((child) => {
       const name = child.name.toLowerCase();
       if (name.includes('pivot')) child.visible = false;

       // Ignore layers
       if (name.includes('layer') || name.includes('hat') || name.includes('jacket') || name.includes('sleeve') || name.includes('pant')) return;

       if (!this.parts.head && name.includes('head')) {
          this.parts.head = child;
          this.parts.head.rotation.order = 'YXZ';
       }
       else if (!this.parts.armL && ((name.includes('arm') && name.includes('left')) || name.includes('leftarm'))) this.parts.armL = child;
       else if (!this.parts.armR && ((name.includes('arm') && name.includes('right')) || name.includes('rightarm'))) this.parts.armR = child;
       else if (!this.parts.legL && ((name.includes('leg') && name.includes('left')) || name.includes('leftleg'))) this.parts.legL = child;
       else if (!this.parts.legR && ((name.includes('leg') && name.includes('right')) || name.includes('rightleg'))) this.parts.legR = child;
    });
  }

  toggleCameraMode() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    if (this.mesh) {
      this.mesh.visible = this.cameraMode !== 0;
    }
    if (this.fpHandGroup) {
      const hudVisible = this.controls ? this.controls.hudVisible : true;
      this.fpHandGroup.visible = hudVisible && (this.cameraMode === 0);
    }
  }

  // Get Axis Aligned Bounding Box at specific position
  getBox(pos) {
    const half = this.width / 2;
    return new THREE.Box3(
      new THREE.Vector3(pos.x - half, pos.y, pos.z - half),
      new THREE.Vector3(pos.x + half, pos.y + this.height, pos.z + half)
    );
  }

  setVolume(master, sound) {
    this.masterVolume = master;
    this.soundVolume = sound;
  }

  setCrouching(isCrouching) {
    this.isCrouching = isCrouching;
    this.updateSpeed();
  }

  setSprinting(isSprinting) {
    this.isSprinting = isSprinting;
    this.updateSpeed();
  }

  updateSpeed() {
    if (this.isCrouching) {
      this.speed = this.crouchSpeed;
    } else if (this.isSprinting) {
      this.speed = this.sprintSpeed;
    } else {
      this.speed = this.walkSpeed;
    }
  }

  initAudio() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.soundBuffers = {
      grass: [],
      stone: [],
      wood: [],
      sand: [],
      break_grass: [],
      break_stone: [],
      break_wood: [],
      break_sand: [],
      pop: [],
      splash: [],
      hit: [],
      attack: [],
      fall_small: [],
      fall_big: [],
      death_fall: []
    };
    
    const loadSound = async (category, i, isBreak = false) => {
      try {
        const prefix = isBreak ? 'break' : '';
        const key = isBreak ? `break_${category}` : category;
        const response = await fetch(`/${prefix}${category}${i}.ogg`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers[key].push(audioBuffer);
      } catch (e) {
        console.warn(`Failed to load sound ${isBreak ? 'break' : ''}${category}${i}`, e);
      }
    };

    ['grass', 'stone', 'wood', 'sand'].forEach(category => {
      for (let i = 1; i <= 3; i++) {
        loadSound(category, i, false);
        loadSound(category, i, true);
      }
    });

    const loadPop = async () => {
      try {
        const response = await fetch('/pop.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['pop'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load pop sound', e);
      }
    };
    loadPop();

    const loadSplash = async () => {
      try {
        const response = await fetch('/splash.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['splash'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load splash sound', e);
      }
    };
    loadSplash();

    const loadHit = async () => {
      try {
        const response = await fetch('/hit3.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['hit'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load hit sound', e);
      }
    };
    loadHit();

    const loadAttack = async () => {
      try {
        const response = await fetch('/knockback1.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['attack'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load attack sound', e);
      }
    };
    loadAttack();

    const loadFallSmall = async () => {
      try {
        const response = await fetch('/fallsmall.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['fall_small'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load fallsmall sound', e);
      }
    };
    loadFallSmall();

    const loadFallBig = async () => {
      try {
        const response = await fetch('/fallbig.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['fall_big'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load fallbig sound', e);
      }
    };
    loadFallBig();

    const loadDeathFall = async () => {
      try {
        const response = await fetch('/hit3.ogg');
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.soundBuffers['death_fall'].push(audioBuffer);
      } catch (e) {
        console.warn('Failed to load death fall sound', e);
      }
    };
    loadDeathFall();
  }

  getSoundCategory(blockType) {
    switch (blockType) {
      case BLOCK_TYPES.GRASS_BLOCK:
      case BLOCK_TYPES.DIRT:
      case BLOCK_TYPES.OAK_LEAVES:
      case BLOCK_TYPES.BIRCH_LEAVES:
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
        return 'grass';
      case BLOCK_TYPES.STONE:
      case BLOCK_TYPES.COBBLESTONE:
      case BLOCK_TYPES.DEEPSLATE:
      case BLOCK_TYPES.FURNACE:
        return 'stone';
      case BLOCK_TYPES.OAK_LOG:
      case BLOCK_TYPES.OAK_PLANKS:
      case BLOCK_TYPES.BIRCH_LOG:
      case BLOCK_TYPES.BIRCH_PLANKS:
      case BLOCK_TYPES.CRAFTING_TABLE:
        return 'wood';
      case BLOCK_TYPES.SAND:
        return 'sand';
      default:
        return 'stone';
    }
  }

  playSound(category, isBreak = false, volume = null) {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const key = isBreak ? `break_${category}` : category;
    const buffers = this.soundBuffers[key];
    
    if (buffers && buffers.length > 0) {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
      source.playbackRate.value = 0.9 + Math.random() * 0.2;
      
      const gainNode = this.audioContext.createGain();
      const baseVol = volume !== null ? volume : (isBreak ? 0.5 : 0.3);
      gainNode.gain.value = baseVol * this.soundVolume * this.masterVolume;
      
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      source.start(0);
    }
  }

  playPlaceSound(blockType) {
    if (blockType === BLOCK_TYPES.AIR) return;
    const category = this.getSoundCategory(blockType);
    this.playSound(category, true, 0.8);
  }

  playFootstep() {
    if (!this.onGround || this.blockBelow === BLOCK_TYPES.AIR) return;
    const category = this.getSoundCategory(this.blockBelow);
    this.playSound(category, false);
  }

  playBreakSound(blockType) {
    if (blockType === BLOCK_TYPES.AIR) return;
    const category = this.getSoundCategory(blockType);
    this.playSound(category, true);
  }
  
  update(delta) {
    // Check Water Status
    const blockFeet = this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
    const isInWater = blockFeet === BLOCK_TYPES.WATER_BUCKET;

    if (isInWater && !this.wasInWater) {
      // Just entered water
      if (this.velocity.y < -2.5) {
        this.playSound('splash', false, 0.8);
        this.world.createSplashParticles(this.position.x, this.position.y, this.position.z);
      }
    }
    this.wasInWater = isInWater;

    // Track highest Y for fall damage
    if (this.onGround || isInWater) {
      this.highestY = this.position.y;
    } else if (this.position.y > this.highestY) {
      this.highestY = this.position.y;
    }
    this.lastVelocityY = this.velocity.y;

    // 1. Apply Gravity
    // Reduced gravity in water by 20%
    const effectiveGravity = isInWater ? this.gravity * 0.8 : this.gravity;
    this.velocity.y += effectiveGravity * delta;
    
    // 2. Determine Movement Vector
    const moveDir = this.direction.clone();
    if (moveDir.lengthSq() > 1) moveDir.normalize();
    
    const isMoving = moveDir.lengthSq() > 0.001;
    
    // Calculate movement steps
    let dx = moveDir.x * this.speed * delta;
    let dz = moveDir.z * this.speed * delta;
    let dy = this.velocity.y * delta;
    
    // 3. Resolve Y Collision (Vertical)
    this.position.y += dy;
    this.resolveCollision('y');
    
    // 4. Resolve X Collision (Horizontal)
    const originalX = this.position.x;
    this.position.x += dx;
    // Sneak Logic: If on ground, sneaking, and about to fall -> Cancel Move
    if (this.onGround && this.isCrouching && !this.checkGroundSupport()) {
      this.position.x = originalX;
    }
    this.resolveCollision('x');
    
    // 5. Resolve Z Collision (Horizontal)
    const originalZ = this.position.z;
    this.position.z += dz;
    // Sneak Logic
    if (this.onGround && this.isCrouching && !this.checkGroundSupport()) {
      this.position.z = originalZ;
    }
    this.resolveCollision('z');

    // Apply water drag/physics
    if (isInWater) {
       // Drag
       const drag = Math.pow(0.8, delta * 20);
       this.velocity.x *= drag;
       this.velocity.z *= drag;
       this.velocity.y *= drag;
       
       // Buoyancy (counteract gravity)
       // Gravity is ~ -24. We want slight sinking, so add ~15 to offset it partially.
       this.velocity.y += 15.0 * delta; 
       
       // Swimming up (Space)
       if (this.controls && this.controls.keys[' ']) {
          this.velocity.y += 15.0 * delta;
       }
       
       // Sinking terminal velocity
       if (this.velocity.y < -4) this.velocity.y = -4;
       // Rising terminal velocity
       if (this.velocity.y > 4) this.velocity.y = 4;
    }

    // 6. World Bounds Reset
    if (this.position.y < -30) {
      this.position.set(0, 40, 0);
      this.velocity.set(0, 0, 0);
    }

    // 7. Update Camera & Player Model
    const currentEyeY = this.isCrouching ? this.crouchEyeHeight : this.eyeHeight;
    const eyePos = this.position.clone().add(new THREE.Vector3(0, currentEyeY, 0));
    
    // Default rotation from controls
    let viewRot = this.camera.rotation;
    if (this.controls) {
      viewRot = this.controls.rotation;
    }

    // Update Mesh
    if (this.mesh && this.mesh.visible) {
      this.mesh.position.copy(this.position);
      
      // Decouple head and body rotation
      let viewYaw = viewRot.y;
      let diff = viewYaw - this.bodyYaw;
      // Normalize difference to -PI to PI
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const limit = Math.PI / 4; // 45 degrees
      const isMoving = this.direction.lengthSq() > 0.001;

      if (isMoving) {
        // If moving, the body snaps to the view direction
        this.bodyYaw = viewYaw;
      } else {
        // If stationary, the body only turns when the head reaches 45 degrees
        if (Math.abs(diff) > limit) {
          this.bodyYaw = viewYaw - Math.sign(diff) * limit;
        }
      }

      this.mesh.rotation.y = this.bodyYaw;

      // Animate parts
      const time = performance.now() / 150;
      const speed = isMoving ? (this.isSprinting ? 1.5 : 1.0) : 0;
      
      if (this.parts.legL) this.parts.legL.rotation.x = Math.sin(time) * speed;
      if (this.parts.legR) this.parts.legR.rotation.x = -Math.sin(time) * speed;
      if (this.parts.armL) this.parts.armL.rotation.x = -Math.sin(time) * speed;
      if (this.parts.armR) this.parts.armR.rotation.x = Math.sin(time) * speed;
      
      if (this.parts.head) {
        // Head horizontal rotation is relative to body
        let relHeadYaw = viewYaw - this.bodyYaw;
        while (relHeadYaw > Math.PI) relHeadYaw -= Math.PI * 2;
        while (relHeadYaw < -Math.PI) relHeadYaw += Math.PI * 2;
        
        this.parts.head.rotation.y = relHeadYaw;
        this.parts.head.rotation.x = viewRot.x;
      }
    }

    if (this.cameraMode === 0) {
      // First Person
      this.camera.position.copy(eyePos);
      // Rotation handled by controls
    } else {
      // Third Person
      let dist = 4;
      const dir = new THREE.Vector3(0, 0, 1).applyEuler(viewRot); // Backwards relative to view
      
      if (this.cameraMode === 2) {
        dir.negate(); // Front view
      }

      // Simple Block Raymarch for Camera Collision
      const rayDir = dir.clone().normalize();
      const maxDist = 4;
      let actualDist = maxDist;
      
      for (let d = 0; d < maxDist; d += 0.2) {
        const p = eyePos.clone().add(rayDir.clone().multiplyScalar(d));
        if (this.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) !== BLOCK_TYPES.AIR) {
           actualDist = Math.max(0.5, d - 0.2); // Back off slightly
           break;
        }
      }
      
      this.camera.position.copy(eyePos).add(rayDir.multiplyScalar(actualDist));
      
      if (this.cameraMode === 2) {
         this.camera.lookAt(eyePos);
      } else {
         // Mode 1: Back view, look same direction as player
         this.camera.rotation.copy(viewRot);
      }
    }

    // 8. Footsteps and Bobbing
    if (this.onGround) {
      const y = Math.floor(this.position.y - 0.1);
      let type = this.world.getBlock(Math.floor(this.position.x), y, Math.floor(this.position.z));
      
      // If center is air (hanging off edge), check corners to find what we are standing on
      if (type === BLOCK_TYPES.AIR) {
        const half = this.width / 2;
        const corners = [
          [this.position.x - half, this.position.z - half],
          [this.position.x + half, this.position.z - half],
          [this.position.x - half, this.position.z + half],
          [this.position.x + half, this.position.z + half]
        ];
        for (const c of corners) {
          const t = this.world.getBlock(Math.floor(c[0]), y, Math.floor(c[1]));
          if (t !== BLOCK_TYPES.AIR) {
            type = t;
            break;
          }
        }
      }
      this.blockBelow = type;
    } else {
      this.blockBelow = BLOCK_TYPES.AIR;
    }
    
    if (this.onGround && isMoving) {
      this.stepTimer += delta;
      if (this.stepTimer >= this.stepInterval) {
        this.playFootstep();
        this.stepTimer = 0;
      }
      
      const targetAmplitude = 0.06;
      this.bobAmplitude = THREE.MathUtils.lerp(this.bobAmplitude, targetAmplitude, delta * 10);
    } else {
      this.stepTimer = this.stepInterval;
      this.bobAmplitude = THREE.MathUtils.lerp(this.bobAmplitude, 0, delta * 10);
    }
    
    if (this.bobAmplitude > 0.001) {
      this.bobTimer += delta * this.speed * 2.5;
      const bobY = Math.sin(this.bobTimer) * this.bobAmplitude;
      const bobX = Math.cos(this.bobTimer * 0.5) * this.bobAmplitude * 0.5;
      
      this.camera.position.y += bobY;
      
      // Apply bobbing to hand too
      if (this.cameraMode === 0 && this.fpHandGroup) {
         this.fpHandGroup.position.y = this.fpHandSettings.pos.y + bobY * 0.5;
         this.fpHandGroup.position.x = this.fpHandSettings.pos.x + bobX;
      }
    } else if (this.cameraMode === 0 && this.fpHandGroup) {
       this.fpHandGroup.position.y = this.fpHandSettings.pos.y;
       this.fpHandGroup.position.x = this.fpHandSettings.pos.x;
    }

    // Handle Hand Swing Animation
    if (this.isSwinging && this.fpHandGroup) {
       const anim = this.activeSwingAnim;
       this.swingProgress += delta * anim.speed;
       if (this.swingProgress >= 1.0) {
          this.swingProgress = 0;
          this.isSwinging = false;
          this.updateFPHandTransform();
       } else {
          // Sine-based swing arc
          const swingAmount = Math.sin(this.swingProgress * Math.PI);
          
          this.fpHandGroup.position.x = this.fpHandSettings.pos.x + (swingAmount * anim.pos.x);
          this.fpHandGroup.position.y = this.fpHandSettings.pos.y + (swingAmount * anim.pos.y);
          this.fpHandGroup.position.z = this.fpHandSettings.pos.z + (swingAmount * anim.pos.z);
          
          this.fpHandGroup.rotation.x = this.fpHandSettings.rot.x + (swingAmount * anim.rot.x);
          this.fpHandGroup.rotation.y = this.fpHandSettings.rot.y + (swingAmount * anim.rot.y);
          this.fpHandGroup.rotation.z = this.fpHandSettings.rot.z + (swingAmount * anim.rot.z);
       }
    }
    
    if (this.hurtTimer > 0) {
      this.hurtTimer -= delta;
      if (this.mesh) {
        this.mesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.color.setRGB(1, 0.5, 0.5); // Reddish tint
          }
        });
      }
    } else {
      if (this.mesh) {
        this.mesh.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.color.set(0xffffff);
          }
        });
      }
    }
    
    this.direction.set(0, 0, 0);
  }
  
  // Returns true if the player's bounding box is resting on something solid
  checkGroundSupport() {
    const box = this.getBox(this.position);
    // Check slightly below feet
    const minX = Math.floor(box.min.x);
    const maxX = Math.floor(box.max.x);
    const minZ = Math.floor(box.min.z);
    const maxZ = Math.floor(box.max.z);
    const y = Math.floor(this.position.y - 0.01);
    
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const b = this.world.getBlock(x, y, z);
        if (b !== BLOCK_TYPES.AIR && b !== BLOCK_TYPES.WATER_BUCKET &&
            b !== BLOCK_TYPES.GRASS && b !== BLOCK_TYPES.TALL_GRASS && b !== BLOCK_TYPES.TALL_GRASS_TOP &&
            !(b >= 59 && b <= 66)) {
          return true;
        }
      }
    }
    return false;
  }
  
  resolveCollision(axis) {
    const box = this.getBox(this.position);
    const minX = Math.floor(box.min.x);
    const maxX = Math.floor(box.max.x);
    const minY = Math.floor(box.min.y);
    const maxY = Math.floor(box.max.y);
    const minZ = Math.floor(box.min.z);
    const maxZ = Math.floor(box.max.z);
    
    let collisionFound = false;
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = this.world.getBlock(x, y, z);
          if (b !== BLOCK_TYPES.AIR && b !== BLOCK_TYPES.WATER_BUCKET &&
              b !== BLOCK_TYPES.GRASS && b !== BLOCK_TYPES.TALL_GRASS && b !== BLOCK_TYPES.TALL_GRASS_TOP &&
              !(b >= 59 && b <= 66)) {
            collisionFound = true;
            
            if (axis === 'y') {
              if (this.velocity.y < 0) { // Falling
                // Minecraft-style Fall Damage (Distance based)
                const landingHeight = y + 1;
                const fallDistance = this.highestY - landingHeight;
                
                if (fallDistance > 3.0) {
                   const damage = Math.floor(fallDistance - 3.0);
                   if (damage > 0) {
                      // Play fall sound based on damage magnitude
                      if (damage >= 4) {
                         this.playSound('fall_big', false, 1.0);
                      } else {
                         this.playSound('fall_small', false, 1.0);
                      }
                      if (this.onDamage) this.onDamage(damage, 'fall');
                   }
                }

                this.position.y = landingHeight; // Land on top
                this.velocity.y = 0;
                this.onGround = true;
              } else if (this.velocity.y > 0) { // Jumping
                this.position.y = y - this.height; // Hit head
                this.velocity.y = 0;
              }
            } else if (axis === 'x') {
              const dx = this.position.x - (x + 0.5);
              if (dx > 0) {
                 this.position.x = x + 1 + this.width/2 + 0.001;
              } else {
                 this.position.x = x - this.width/2 - 0.001;
              }
            } else if (axis === 'z') {
              const dz = this.position.z - (z + 0.5);
              if (dz > 0) {
                 this.position.z = z + 1 + this.width/2 + 0.001;
              } else {
                 this.position.z = z - this.width/2 - 0.001;
              }
            }
            return; // Resolve one collision per axis step is usually enough for simple physics
          }
        }
      }
    }
    
    if (axis === 'y' && !collisionFound && this.onGround) {
       // Check if we just walked off a ledge or gravity started
       // We keep onGround true only if we are actually supported
       if (this.velocity.y <= 0) {
          // If we are not moving up, check if we are supported
          this.onGround = this.checkGroundSupport();
       } else {
          this.onGround = false;
       }
    }
  }
  
  move(forward, right) {
    const angle = this.camera.rotation.y;
    this.direction.x -= Math.sin(angle) * forward - Math.cos(angle) * right;
    this.direction.z -= Math.cos(angle) * forward + Math.sin(angle) * right;
  }
  
  jump() {
    if (this.onGround) {
      this.velocity.y = this.jumpForce;
      this.onGround = false;
    }
  }

  dispose() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}