import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World, BLOCK_TYPES } from './world.js';
import { Player } from './player.js';
import { Controls } from './controls.js';
import { Chat } from './chat.js';
import { Zombie } from './zombie.js';

const room = new WebsimSocket();

const GAME_VERSION = "Minecraft with planes";

// Global context menu prevention
window.addEventListener('contextmenu', (e) => e.preventDefault());

const MUSIC_TRACKS = [];

const SETTINGS = {
  fov: 70,
  fog: true,
  difficulty: 2, // 0: Peaceful, 1: Easy, 2: Normal, 3: Hard
  debugMode: false,
  masterVolume: 1.0,
  musicVolume: 0.5,
  soundVolume: 1.0,
  renderDistance: 6
};

function loadSettings() {
  try {
    const saved = localStorage.getItem('mc_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(SETTINGS, parsed);
    }
  } catch (e) { console.error("Failed to load settings", e); }
}

function saveSettings() {
  localStorage.setItem('mc_settings', JSON.stringify(SETTINGS));
}

loadSettings();

const DIFFICULTIES = ['Peaceful', 'Easy', 'Normal', 'Hard'];

class Game {
  constructor(seed, bgm, onQuit, difficulty = 2, serverId = null) {
    this.active = true;
    this.paused = false;
    this.bgm = bgm;
    SETTINGS.difficulty = difficulty; // Sync settings
    this.onQuitCallback = onQuit;
    this.serverId = serverId;
    this.isMultiplayer = !!serverId;

    this.isUnderwater = false;
    this.underwaterColor = new THREE.Color(0x204080);
    this.skyColor = new THREE.Color(0x87CEEB);

    this.platform = 'PC';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 'ontouchstart' in window) {
      this.platform = 'Mobile';
    }
    if (/OculusBrowser|Wolvic|PicoBrowser/i.test(navigator.userAgent)) {
      this.platform = 'VR';
    }
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);
    
    this.camera = new THREE.PerspectiveCamera(SETTINGS.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.scene.add(this.camera);

    // Add lighting for non-block entities (players, mobs) which use standard materials
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    this.ambientLight = ambientLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    this.scene.add(dirLight);
    this.dirLight = dirLight;

    // Fog range adjusted to match world bounds so it hides the void
    this.scene.fog = new THREE.Fog(0x87CEEB, 20, 80); // Adjusted for new infinite look
    
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.id = 'game-canvas';
    document.body.appendChild(this.renderer.domElement);
    
    // Water ambience
    this.waterAmbience = new Audio('/water.ogg');
    this.waterAmbience.loop = true;

    this.version = GAME_VERSION;
    this.deathScreen = document.getElementById('death-screen');
    this.deathMsg = document.getElementById('death-msg');
    this.deathScore = document.getElementById('death-score');
    this.debugInfo = document.getElementById('debug-info');
    this.debugInfoRight = document.getElementById('debug-info-right');
    this.debugText = document.getElementById('debug-text');
    this.pauseMenu = document.getElementById('pause-menu');

    // GPU Info for Debug
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "Unknown GPU";
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
    this.fps = 0;
    
    this.gameTime = 6000; // 0 = Dawn, 6000 = Noon, 12000 = Dusk, 18000 = Midnight
    this.dayCount = 0;
    this.initSky();

    this.world = new World(this.scene, seed);
    this.player = new Player(this.camera, this.world);
    this.player.gameInstance = this;
    this.player.onDamage = (amt, source) => this.takeDamage(amt, source);

    this.remotePlayers = {};
    this.zombies = [];
    this.spawnTimer = 0;

    this.debugAids = new THREE.Group();
    this.scene.add(this.debugAids);
    this.setupDebugVisuals();
    this.chat = new Chat();

    this.invulnerabilityTimer = 8.0;
    this.chat.addMessage("Spawn protection active for 8 seconds.", null, '#55FF55');
    
    this.skinUrl = localStorage.getItem('mc_skin_url') || null;
    this.playerModelTemplate = null;
    this.loadPlayerModel();

    this.controls = new Controls(
      this.camera, 
      this.renderer.domElement, 
      this.player, 
      this.world, 
      this.chat,
      () => this.togglePause()
    );
    this.player.controls = this.controls;

    this.health = 20;
    this.initHearts();
    
    this.chat.setGameInterface({
      giveItem: (type, amount) => this.controls.addItem(type, amount),
      teleport: (x, y, z) => {
         this.player.position.set(x, y, z);
         this.player.velocity.set(0, 0, 0);
      },
      setTime: (time) => {
         this.gameTime = time % 24000;
      },
      getPlayerPosition: () => this.player.position,
      summon: (type, x, y, z) => this.summonMob(type, x, y, z)
    });

    if (this.isMultiplayer) {
      // Wait for username before networking
      const initNet = () => {
         if (this.chat.username && this.chat.username !== "Player") {
             this.setupNetworking();
             this.chat.initMultiplayer(this.serverId);
             return true;
         }
         return false;
      };

      if (!initNet()) {
          const checkUser = setInterval(() => {
              if (initNet()) clearInterval(checkUser);
          }, 100);
      }
    }

    this.boundOnResize = () => this.onResize();
    window.addEventListener('resize', this.boundOnResize);

    this.boundOnKeyDown = (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        this.player.toggleCameraMode();
      }
      if (e.key === 'F3') {
        e.preventDefault();
        const isVisible = this.debugInfo.style.display === 'block';
        const nextDisplay = isVisible ? 'none' : 'block';
        this.debugInfo.style.display = nextDisplay;
        if (this.debugInfoRight) this.debugInfoRight.style.display = nextDisplay;
      }
      if (e.key === 'Tab') {
         if (this.chat && this.chat.isOpen) return; // Let chat handle tab
         e.preventDefault();
         if (!this.tabPressed) {
            this.tabPressed = true;
            this.showPlayerList(true);
         }
      }
    };
    window.addEventListener('keydown', this.boundOnKeyDown);
    
    this.boundOnKeyUp = (e) => {
      if (e.key === 'Tab') {
         this.tabPressed = false;
         this.showPlayerList(false);
      }
    };
    window.addEventListener('keyup', this.boundOnKeyUp);
    
    this.boundOnBlur = () => {
      this.tabPressed = false;
      this.showPlayerList(false);
    };
    window.addEventListener('blur', this.boundOnBlur);

    // Fullscreen change listener
    this.boundOnFullscreenChange = () => {
      if (!document.fullscreenElement && this.active && !this.paused) {
        this.setPaused(true);
      }
    };
    document.addEventListener('fullscreenchange', this.boundOnFullscreenChange);

    // Setup Pause Menu Listeners
    document.getElementById('btn-resume').onclick = () => this.setPaused(false);
    document.getElementById('btn-quit').onclick = () => this.quitGame();
    document.getElementById('btn-respawn').onclick = () => this.respawn();
    document.getElementById('btn-death-quit').onclick = () => this.quitGame();
    
    const optBtn = document.getElementById('btn-pause-options');
    if (optBtn) {
      optBtn.onclick = () => {
         this.pauseMenu.style.display = 'none'; // Hide pause menu
         OptionsMenu.open(() => {
            this.pauseMenu.style.display = 'flex'; // Return to pause menu
         }, this); // Passing 'this' marks as in-game
      };
    }

    // Add "Change seed" button to pause menu
    const changeSeedBtn = document.createElement('div');
    changeSeedBtn.className = 'mc-button small';
    changeSeedBtn.style.marginTop = '10px';
    changeSeedBtn.style.width = '200px';
    changeSeedBtn.innerText = 'Change seed';
    changeSeedBtn.onclick = async () => {
       // Prompt for seed (simple UI)
       const input = prompt("Enter new seed (numeric or text):", "");
       if (input === null) return;
       // Ask "Go there" confirm
       const ok = confirm(`Go to seed: ${input}? An airplane will arrive.`);
       if (!ok) return;
       // Kick off seed change flow
       try {
         await this.changeSeedFlow(input);
       } catch (e) {
         console.error(e);
       }
    };
    // append to pause menu content area
    const pauseContent = this.pauseMenu.querySelector('.menu-content');
    if (pauseContent) pauseContent.appendChild(changeSeedBtn);

    this.setupDebugControls();
    this.initMusic();
    this.updateSettings(); // Apply initial volume

    this.clock = new THREE.Clock();
    this.animate();
  }

  applySkinToModel(model, url) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = url;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 64;
        canvas.height = 64;
        ctx.drawImage(img, 0, 0);
        
        // Handle 64x32 skins
        if (img.height === 32) {
            ctx.save();
            ctx.scale(-1, 1);
            // Leg
            ctx.drawImage(img, 0, 16, 16, 16, -32, 48, 16, 16);
            // Arm
            ctx.drawImage(img, 40, 16, 16, 16, -48, 48, 16, 16);
            ctx.restore();
        }
        
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

       if (this.player && model === this.player.mesh && this.player.fpHandGroup) {
          this.player.fpHandGroup.traverse((child) => {
             if (child.isMesh && child.material) {
                const mat = child.material.clone();
                mat.map = tex;
                child.material = mat;
                child.material.needsUpdate = true;
             }
          });
       }
    };
  }

  loadPlayerModel() {
    const loader = new GLTFLoader();
    loader.load('player with pivots.gltf', (gltf) => {
       this.playerModelTemplate = gltf.scene;
       
       this.playerModelTemplate.traverse((child) => {
          if (child.isMesh) {
             child.castShadow = true;
             child.receiveShadow = true;
             
             if (child.material) {
                child.material.transparent = true;
                child.material.alphaTest = 0.5;
                child.material.side = THREE.DoubleSide;
             }
          }
          if (child.name.toLowerCase().includes('pivot')) {
             child.visible = false;
          }
       });

       // Create local player mesh
       const localMesh = this.playerModelTemplate.clone();
       
       // Apply current skin or default
       const skinUrl = this.skinUrl || '/steve.png';
       this.applySkinToModel(localMesh, skinUrl);
       
       this.player.setMesh(localMesh);

       // Update any remote players that are currently using fallback
       if (this.remotePlayers) {
         Object.values(this.remotePlayers).forEach(mesh => {
            if (mesh.userData.isFallback) {
               // Remove box
               for (let i = mesh.children.length - 1; i >= 0; i--) {
                  const child = mesh.children[i];
                  if (child.isMesh && child.geometry && child.geometry.type === 'BoxGeometry') {
                     mesh.remove(child);
                  }
               }
               
               // Add model
               const model = this.playerModelTemplate.clone();
               mesh.add(model);
               mesh.userData.isFallback = false;
               
               // Apply skin
               const skinUrl = mesh.userData.skinUrl || '/steve.png';
               this.applySkinToModel(model, skinUrl);
               
               // Setup parts references
               mesh.userData.parts = {};
               model.traverse((child) => {
                  const name = child.name.toLowerCase();
                  if (name.includes('pivot')) child.visible = false;
                  if (name.includes('layer') || name.includes('hat') || name.includes('jacket') || name.includes('sleeve') || name.includes('pant')) return;
                  if (!mesh.userData.parts.head && name.includes('head')) {
                     mesh.userData.parts.head = child;
                     mesh.userData.parts.head.rotation.order = 'YXZ';
                  }
                  else if (!mesh.userData.parts.armL && ((name.includes('arm') && name.includes('left')) || name.includes('leftarm'))) mesh.userData.parts.armL = child;
                  else if (!mesh.userData.parts.armR && ((name.includes('arm') && name.includes('right')) || name.includes('rightarm'))) mesh.userData.parts.armR = child;
                  else if (!mesh.userData.parts.legL && ((name.includes('leg') && name.includes('left')) || name.includes('leftleg'))) mesh.userData.parts.legL = child;
                  else if (!mesh.userData.parts.legR && ((name.includes('leg') && name.includes('right')) || name.includes('rightleg'))) mesh.userData.parts.legR = child;
               });
            }
         });
       }

    }, undefined, (err) => console.error("Error loading player model", err));
  }

  setupNetworking() {
    this.remotePlayers = {}; // id -> mesh
    this.lastPresenceUpdate = 0;
    this.playerDataId = null;
    this.initialLoadComplete = false;

    // Load Player Data (Position, Inventory) from LocalStorage
    try {
        const key = `mc_player_data_${this.serverId}_${this.chat.username}`;
        const savedData = localStorage.getItem(key);
        if (savedData) {
            const data = JSON.parse(savedData);
            
            if (data.x !== undefined && data.y !== undefined && data.z !== undefined) {
                this.player.position.set(data.x, data.y, data.z);
            }
            
            if (data.rotX !== undefined && data.rotY !== undefined) {
                this.controls.rotation.set(data.rotX, data.rotY, data.rotZ || 0);
                this.camera.rotation.copy(this.controls.rotation);
            }
            
            if (data.inventory) {
                this.controls.setInventoryData(data.inventory);
            }
            
            this.chat.addMessage("Loaded saved data from this device.");
        }
    } catch(e) { console.error("Failed to load local save", e); }

    // Start auto-save loop
    this.saveInterval = setInterval(() => this.savePlayerState(), 10000); // Save every 10s

    this.lastAppliedBlockId = null;

    // Load initial world state and subscribe
    // Note: We do this via subscribe to handle race conditions better, 
    // but the initial getList is useful to establish a baseline if needed.
    // However, subscribe returns the current list immediately, so we can just use subscribe.
    
    this.unsubscribeBlocks = room.collection('world_blocks').filter({ server_id: this.serverId }).subscribe((records) => {
       const newBlocks = [];
       
       // Collect all new blocks since our last sync
       for (const r of records) {
          if (r.id === this.lastAppliedBlockId) break;
          newBlocks.push(r);
       }
       
       if (newBlocks.length > 0) {
          // Update tracking ID to the absolute newest
          this.lastAppliedBlockId = newBlocks[0].id;
          
          // Apply changes from oldest to newest to ensure correct state sequence
          newBlocks.reverse().forEach(r => {
             // If we placed it, we already updated locally. 
             // Note: 'username' is automatically added by Websim to records.
             if (r.username !== this.chat.username) {
                if (r.type === 0) { // AIR
                  this.world.removeBlock(r.x, r.y, r.z, false);
                } else {
                  this.world.addBlock(r.x, r.y, r.z, r.type, false);
                }
             } else {
                // It's our own block. 
                // We could verify it matches local state, but for now we trust local prediction.
             }
          });
       }
    });

    // Subscribe to presence
    this.unsubscribePresence = room.subscribePresence((peers) => {
      const now = performance.now();
      
      // Filter for this server
      Object.keys(peers).forEach(clientId => {
        if (clientId === room.clientId) return; // Skip self

        const p = peers[clientId];
        if (p.serverId !== this.serverId) {
           // If they were here, remove them (User switched server)
           if (this.remotePlayers[clientId]) {
             const username = this.remotePlayers[clientId].userData.username || 'Player';
             this.chat.addMessage(`${username} left the game`, null, '#ffff55');
             
             this.scene.remove(this.remotePlayers[clientId]);
             delete this.remotePlayers[clientId];
           }
           return;
        }

        // Create or update mesh
        if (!this.remotePlayers[clientId]) {
           const username = room.peers[clientId]?.username || 'Player';
           if (this.initialLoadComplete) {
              this.chat.addMessage(`${username} joined the game`, null, '#ffff55');
           }

           const mesh = new THREE.Group();
           mesh.userData.username = username;
           
           // Model
           let model = null;
           if (this.playerModelTemplate) {
              model = this.playerModelTemplate.clone();
              mesh.add(model);
              
              // Apply skin or default
              const skinUrl = p.skinUrl || '/steve.png';
              this.applySkinToModel(model, skinUrl);
              mesh.userData.skinUrl = skinUrl;
              
              // Setup animation parts references
              mesh.userData.parts = {};
              model.traverse((child) => {
                 const name = child.name.toLowerCase();
                 if (name.includes('pivot')) child.visible = false;
                 
                 // Ignore layers
                 if (name.includes('layer') || name.includes('hat') || name.includes('jacket') || name.includes('sleeve') || name.includes('pant')) return;

                 if (!mesh.userData.parts.head && name.includes('head')) {
                    mesh.userData.parts.head = child;
                    mesh.userData.parts.head.rotation.order = 'YXZ';
                 }
                 
                 else if (!mesh.userData.parts.armL && ((name.includes('arm') && name.includes('left')) || name.includes('leftarm'))) mesh.userData.parts.armL = child;
                 else if (!mesh.userData.parts.armR && ((name.includes('arm') && name.includes('right')) || name.includes('rightarm'))) mesh.userData.parts.armR = child;
                 
                 else if (!mesh.userData.parts.legL && ((name.includes('leg') && name.includes('left')) || name.includes('leftleg'))) mesh.userData.parts.legL = child;
                 else if (!mesh.userData.parts.legR && ((name.includes('leg') && name.includes('right')) || name.includes('rightleg'))) mesh.userData.parts.legR = child;
              });
              
           } else {
              // Fallback box
              const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
              const material = new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff });
              const box = new THREE.Mesh(geometry, material);
              box.position.y = 0.9;
              mesh.add(box);
              mesh.userData.isFallback = true;
           }

           // Name tag
           const canvas = document.createElement('canvas');
           canvas.width = 256; 
           canvas.height = 64;
           const ctx = canvas.getContext('2d');
           ctx.fillStyle = 'rgba(0,0,0,0.5)';
           ctx.fillRect(0,0,256,64);
           ctx.fillStyle = 'white';
           ctx.font = '30px Minecraft';
           ctx.textAlign = 'center';
           ctx.fillText(p.username || 'Player', 128, 42);
           
           const tex = new THREE.CanvasTexture(canvas);
           const labelMat = new THREE.SpriteMaterial({ 
             map: tex,
             depthTest: false,
             depthWrite: false
           });
           const label = new THREE.Sprite(labelMat);
           label.position.y = 2.1;
           label.scale.set(1.5, 0.375, 1);
           label.renderOrder = 100; // Ensure it renders on top of world
           mesh.add(label);

           this.scene.add(mesh);
           this.remotePlayers[clientId] = mesh;
           mesh.userData.velocity = new THREE.Vector3();
           mesh.userData.lastPos = new THREE.Vector3();
        }

        const mesh = this.remotePlayers[clientId];

        // Check for skin update
        const currentSkin = p.skinUrl || '/steve.png';
        if (mesh.userData.skinUrl !== currentSkin) {
            mesh.userData.skinUrl = currentSkin;
            const model = mesh.children.find(c => c.type === 'Group' || c.type === 'Scene');
            if (model) {
               this.applySkinToModel(model, currentSkin);
            }
        }

        const targetPos = new THREE.Vector3();
        
        if (p.position) {
           const tx = p.position.x || 0;
           const ty = p.position.y || 0;
           const tz = p.position.z || 0;
           targetPos.set(tx, ty, tz);
           
           // Calculate velocity for animation
           const dist = targetPos.distanceTo(mesh.position);
           if (dist > 0.01) {
              const vel = targetPos.clone().sub(mesh.position).multiplyScalar(10); // Approx speed
              mesh.userData.velocity.lerp(vel, 0.5);
           } else {
              mesh.userData.velocity.multiplyScalar(0.8);
           }
           
           mesh.position.lerp(targetPos, 0.2);
        }
        
        if (p.rotation) {
           const viewYaw = p.rotation.y !== undefined ? p.rotation.y : (p.rotation._y !== undefined ? p.rotation._y : 0);
           const viewPitch = p.rotation.x !== undefined ? p.rotation.x : (p.rotation._x !== undefined ? p.rotation._x : 0);
           const bodyYaw = p.bodyYaw !== undefined ? p.bodyYaw : viewYaw;
           
           // Interpolate Body Rotation
           const curBodyY = mesh.rotation.y;
           let bodyDiff = bodyYaw - curBodyY;
           while (bodyDiff > Math.PI) bodyDiff -= Math.PI * 2;
           while (bodyDiff < -Math.PI) bodyDiff += Math.PI * 2;
           mesh.rotation.y = curBodyY + bodyDiff * 0.2;
           
           // Store values for head animation
           mesh.userData.viewYaw = viewYaw;
           mesh.userData.viewPitch = viewPitch;
        }

        // Animate Parts
        if (mesh.userData.parts) {
           const time = performance.now() / 150;
           const parts = mesh.userData.parts;
           const speed = Math.min(mesh.userData.velocity.length(), 1.0);
           
           // Walk Cycle
           if (parts.legL) parts.legL.rotation.x = Math.sin(time) * speed;
           if (parts.legR) parts.legR.rotation.x = -Math.sin(time) * speed;
           if (parts.armL) parts.armL.rotation.x = -Math.sin(time) * speed;
           if (parts.armR) parts.armR.rotation.x = Math.sin(time) * speed;
           
           // Head Look (Horizontal and Vertical)
           if (parts.head) {
              let relHeadYaw = (mesh.userData.viewYaw || 0) - mesh.rotation.y;
              while (relHeadYaw > Math.PI) relHeadYaw -= Math.PI * 2;
              while (relHeadYaw < -Math.PI) relHeadYaw += Math.PI * 2;

              parts.head.rotation.y = relHeadYaw;
              parts.head.rotation.x = mesh.userData.viewPitch || 0;
           }
        }
      });

      // Cleanup disconnected
      Object.keys(this.remotePlayers).forEach(id => {
         if (!this.remotePlayers[id]) return; // Already handled
         if (!peers[id]) {
             const username = this.remotePlayers[id].userData.username || 'Player';
             this.chat.addMessage(`${username} left the game`, null, '#ffff55');
             
             this.scene.remove(this.remotePlayers[id]);
             delete this.remotePlayers[id];
         }
      });
      
      this.initialLoadComplete = true;
    });

    // Hook up world modification to DB
    this.world.onBlockUpdate = (x, y, z, type) => {
       // Persist to DB
       room.collection('world_blocks').create({
         server_id: this.serverId,
         x, y, z, type
       });
    };
    
    // Log join (Local only)
    console.log(`Joined server ${this.serverId} as ${this.chat.username}`);

    // Item Sync
    this.world.onItemDrop = (data) => {
       room.collection('world_items').create({
         server_id: this.serverId,
         ...data
       }).catch(console.error);
    };

    this.unsubscribeItems = room.collection('world_items').filter({ server_id: this.serverId }).subscribe((records) => {
       const currentIds = new Set(records.map(r => r.id));
       
       // Sync Add
       records.forEach(r => {
          if (!this.world.droppedItems.find(i => i.dbId === r.id)) {
             this.world.spawnItem(r.x, r.y, r.z, r.vx, r.vy, r.vz, r.type, r.pickupDelay || 0.5, r.id, r.count || 1);
          }
       });

       // Sync Remove
       for (let i = this.world.droppedItems.length - 1; i >= 0; i--) {
          const item = this.world.droppedItems[i];
          if (item.dbId && !currentIds.has(item.dbId)) {
             item.dispose();
             this.world.droppedItems.splice(i, 1);
          }
       }
    });

    // Listen for requests (from admins or other players)
    room.subscribePresenceUpdateRequests((req, fromClientId) => {
       if (req.type === 'teleport') {
          this.player.position.set(req.x, req.y, req.z);
          this.player.velocity.set(0, 0, 0);
          this.chat.addMessage(`Teleported to ${req.x.toFixed(1)}, ${req.y.toFixed(1)}, ${req.z.toFixed(1)}`, "System", "#ffff55");
       } else if (req.type === 'give') {
          this.controls.addItem(req.item, req.amount);
          const name = this.controls.getDisplayName(req.item);
          this.chat.addMessage(`Received ${req.amount} ${name} from Admin`, "System", "#ffff55");
       } else if (req.type === 'damage') {
          // Apply knockback if provided
          if (req.kb) {
             this.player.velocity.set(req.kb.x, req.kb.y, req.kb.z);
             this.player.onGround = false;
          }
          this.takeDamage(req.amount, req.from || fromClientId);
       }
    });
  }

  togglePause() {
    // If options menu is open, don't toggle pause state, allow ESC to close options via its own listener or handle here
    if (document.getElementById('options-menu').style.display === 'flex') {
       // Let the options menu handle closing or do nothing
       return;
    }
    this.setPaused(!this.paused);
  }

  setPaused(paused) {
    this.paused = paused;
    if (this.paused) {
      this.pauseMenu.style.display = 'flex';
      this.renderer.domElement.classList.add('blurred');
      document.exitPointerLock();
    } else {
      this.pauseMenu.style.display = 'none';
      this.renderer.domElement.classList.remove('blurred');
      this.renderer.domElement.requestPointerLock();
      
      // Attempt to restore fullscreen
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
  }

  initSky() {
    const loader = new THREE.TextureLoader();
    
    // Sun
    const sunTex = loader.load('/sun.png');
    sunTex.colorSpace = THREE.SRGBColorSpace;
    sunTex.magFilter = THREE.NearestFilter;
    
    const sunMat = new THREE.MeshBasicMaterial({
       map: sunTex,
       transparent: true,
       blending: THREE.AdditiveBlending,
       side: THREE.DoubleSide,
       depthWrite: false,
       fog: false
    });
    
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sunMat);
    this.sunMesh.position.set(100, 0, 0);
    this.sunMesh.rotation.y = -Math.PI / 2;
    
    // Moon
    const moonTex = loader.load('/moon_phases.png');
    moonTex.colorSpace = THREE.SRGBColorSpace;
    moonTex.magFilter = THREE.NearestFilter;
    
    const moonMat = new THREE.MeshBasicMaterial({
       map: moonTex,
       transparent: true,
       blending: THREE.AdditiveBlending,
       side: THREE.DoubleSide,
       depthWrite: false,
       fog: false
    });
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), moonMat);
    this.moonMesh.position.set(-100, 0, 0);
    this.moonMesh.rotation.y = Math.PI / 2;
    
    this.celestialGroup = new THREE.Group();
    this.celestialGroup.add(this.sunMesh);
    this.celestialGroup.add(this.moonMesh);
    
    // Stars
    const starGeo = new THREE.BufferGeometry();
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for(let i=0; i<count; i++) {
        const r = 400; 
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        positions[i*3] = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.0,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        fog: false 
    });
    
    this.stars = new THREE.Points(starGeo, starMat);
    this.celestialGroup.add(this.stars);

    this.scene.add(this.celestialGroup);
    
    this.updateMoonPhase(0);
  }

  updateMoonPhase(phaseIndex) {
     const geo = this.moonMesh.geometry;
     const uv = geo.attributes.uv;
     
     // 4x2 grid
     const col = phaseIndex % 4;
     const row = Math.floor(phaseIndex / 4); // 0 = top, 1 = bottom
     
     // U: Left to Right
     const uMin = col * 0.25;
     const uMax = (col + 1) * 0.25;
     
     // V: Bottom to Top (0.0 is bottom)
     // Row 0 (Top visual) -> V [0.5, 1.0]
     // Row 1 (Bottom visual) -> V [0.0, 0.5]
     const vMin = (1 - row) * 0.5; 
     const vMax = vMin + 0.5;

     // UV mapping for PlaneGeometry (TL, TR, BL, BR order: 0, 1, 2, 3)
     uv.setXY(0, uMin, vMax); 
     uv.setXY(1, uMax, vMax);
     uv.setXY(2, uMin, vMin);
     uv.setXY(3, uMax, vMin);
     uv.needsUpdate = true;
  }

  updateTime(delta) {
     this.gameTime += delta * 20; // 20 ticks per second (1200s = 20m = 24000 ticks)
     
     if (this.gameTime >= 24000) {
        this.gameTime -= 24000;
        this.dayCount++;
        this.updateMoonPhase(this.dayCount % 8);
     }
     
     // 0 = Dawn, 6000 = Noon, 12000 = Dusk, 18000 = Midnight
     // Rotation angle (around Z axis, assuming Sun starts at +X)
     // 0 -> 0 rad (Horizon)
     // 6000 -> PI/2 (Zenith)
     const rot = (this.gameTime / 24000) * Math.PI * 2;
     
     if (this.celestialGroup) {
       this.celestialGroup.rotation.z = rot;
       this.celestialGroup.position.copy(this.player.position);
     }
     
     // Lighting logic
     const sunHeight = Math.sin(rot);
     
     // Interpolate colors
     const noonColor = new THREE.Color(0x87CEEB);
     const sunsetColor = new THREE.Color(0xFC9601);
     const nightColor = new THREE.Color(0x050510);
     
     let skyColor = new THREE.Color();
     let lightFactor = 0;
     
     if (sunHeight > 0.2) {
        skyColor.copy(noonColor);
        lightFactor = 1.0;
     } else if (sunHeight > 0.0) {
        const t = sunHeight / 0.2;
        skyColor.copy(sunsetColor).lerp(noonColor, t);
        lightFactor = 0.2 + t * 0.8;
     } else if (sunHeight > -0.2) {
        const t = (sunHeight + 0.2) / 0.2;
        skyColor.copy(nightColor).lerp(sunsetColor, t);
        lightFactor = t * 0.2;
     } else {
        skyColor.copy(nightColor);
        lightFactor = 0;
     }
     
     this.skyColor = skyColor;
     if (!this.isUnderwater) {
        this.scene.background = skyColor;
        if (this.scene.fog) this.scene.fog.color.copy(skyColor);
     }
     
     // Update Lights
     const brightness = lightFactor; // 0 (night) to 1 (noon)
     
     // Stars visibility (Inverse of brightness)
     if (this.stars) {
        const starOpacity = Math.max(0, 1 - (brightness * 4)); 
        this.stars.material.opacity = starOpacity;
        this.stars.visible = starOpacity > 0.01;
     }

     // Lighting
     let dirIntensity = 0;
     let dirPos = new THREE.Vector3();
     const dist = 50;
     
     // Sun Position
     const sunX = Math.cos(rot) * dist;
     const sunY = Math.sin(rot) * dist;
     const sunZ = 20;

     if (brightness > 0.01) {
        // Day/Dusk/Dawn - Sun is dominant
        dirIntensity = brightness * 0.8;
        dirPos.set(sunX, sunY, sunZ);
     } else {
        // Night - Moon is dominant
        dirIntensity = 0.15; // Weak moonlight
        dirPos.set(-sunX, -sunY, sunZ); // Opposite to sun
     }
     
     // Ambient Light
     // Harsher shadows at night -> Low ambient, preserved directional contrast
     // Day: Ambient ~0.25. Night: Ambient ~0.05
     const targetAmbient = 0.05 + (brightness * 0.2);
     
     // Block Shader Sunlight Uniform
     // This controls how bright sky-exposed blocks are.
     // Day: 1.0. Night: 0.15 (moonlit)
     const blockSunlight = 0.15 + (brightness * 0.85);

     if (this.ambientLight) this.ambientLight.intensity = targetAmbient + 0.3; // Entities need bit more fill
     if (this.dirLight) {
        this.dirLight.intensity = dirIntensity;
        this.dirLight.position.copy(dirPos);
     }
     
     // Update Shader Uniforms for Blocks
     if (this.world && this.world.materialUniforms) {
        this.world.materialUniforms.forEach(u => {
           if (u.uAmbient) u.uAmbient.value = targetAmbient;
           if (u.uSunlight) u.uSunlight.value = blockSunlight;
        });
     }
     
     // Update Clouds
     if (this.world && this.world.cloudMesh) {
        const cloudColor = brightness * 0.8 + 0.15;
        this.world.cloudMesh.material.color.setRGB(cloudColor, cloudColor, cloudColor);
     }

     // Zombie Spawning
     // Night is approx 13000 to 23000
     const isNight = this.gameTime > 13000 && this.gameTime < 23000;
     
     // Peaceful mode handling: Remove existing zombies and prevent spawning
     if (SETTINGS.difficulty === 0) {
         if (this.zombies.length > 0) {
             for (let i = this.zombies.length - 1; i >= 0; i--) {
                 this.zombies[i].dispose();
             }
             this.zombies = [];
         }
     } else if (isNight && this.zombies.length < 8) {
         this.spawnTimer += delta;
         if (this.spawnTimer > 10.0) { // Every 10 seconds check spawn
             this.spawnTimer = 0;
             this.spawnZombie();
         }
     }
  }

  spawnZombie() {
      if (!this.playerModelTemplate) return;
      
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20; // 20-40 blocks away
      const x = this.player.position.x + Math.sin(angle) * dist;
      const z = this.player.position.z + Math.cos(angle) * dist;
      
      // Find surface
      let y = 60;
      while (y > 0 && this.world.getBlock(Math.floor(x), Math.floor(y-1), Math.floor(z)) === 0) {
          y--;
      }
      if (y > 0 && y < 200) { // Valid spawn
          this.zombies.push(new Zombie(this.scene, new THREE.Vector3(x, y, z), this.world, this.playerModelTemplate));
      }
  }

  async changeSeedFlow(requestedSeed) {
    // Prevent presence broadcasts and control updates while transitioning by plane
    this.inSeedTransition = true;

    // Compute next seed string (numeric increment if possible)
    let seed = requestedSeed === undefined ? (Math.random().toString()) : requestedSeed.toString();
    let printedSeed = seed;
    const asNum = parseInt(seed);
    if (!isNaN(asNum)) {
      printedSeed = String(asNum + 1);
    } else {
      printedSeed = seed + "-1";
    }

    // Create simple plane mesh with canvas texture showing printedSeed
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.fillRect(0,0,256,64);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Seed: ${printedSeed}`, 128, 36);

    const planeTex = new THREE.CanvasTexture(canvas);
    planeTex.magFilter = THREE.NearestFilter;
    planeTex.minFilter = THREE.NearestFilter;

    const planeMat = new THREE.MeshBasicMaterial({ map: planeTex, side: THREE.DoubleSide });
    const planeGeo = new THREE.BoxGeometry(6, 1.5, 10);
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.castShadow = true;
    plane.receiveShadow = true;
    plane.position.set(this.player.position.x + 0, this.player.position.y + 15, this.player.position.z - 60);
    plane.rotation.y = Math.PI;
    this.scene.add(plane);

    // Create invisible barrier walls as children so player can't fall off while plane is landed
    const barrierMat = new THREE.MeshBasicMaterial({ visible: false });
    const wallThickness = 0.2;
    const wallHeight = 1.2;
    const halfW = 3;
    const halfL = 5;

    const walls = new THREE.Group();
    // left
    const left = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, halfL * 2 + wallThickness), barrierMat);
    left.position.set(-halfW + wallThickness/2, wallHeight/2 + 0.1, 0);
    walls.add(left);
    // right
    const right = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, halfL * 2 + wallThickness), barrierMat);
    right.position.set(halfW - wallThickness/2, wallHeight/2 + 0.1, 0);
    walls.add(right);
    // front
    const front = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, wallHeight, wallThickness), barrierMat);
    front.position.set(0, wallHeight/2 + 0.1, -halfL + wallThickness/2);
    walls.add(front);
    // back
    const back = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, wallHeight, wallThickness), barrierMat);
    back.position.set(0, wallHeight/2 + 0.1, halfL - wallThickness/2);
    walls.add(back);

    // Place walls relative to plane
    walls.position.set(0, 1.0, 0);
    plane.add(walls);

    // Helper: clamp player on top of plane while it is near/landed
    const clampPlayerToPlane = () => {
      // plane local top area bounds in world space
      const boxMin = new THREE.Vector3(-halfW, 0.75, -halfL);
      const boxMax = new THREE.Vector3(halfW, 2.5, halfL);
      const min = boxMin.clone().applyMatrix4(plane.matrixWorld);
      const max = boxMax.clone().applyMatrix4(plane.matrixWorld);
      const px = this.player.position.x;
      const py = this.player.position.y;
      const pz = this.player.position.z;

      // If player's Y is roughly on or above plane surface and within z-range near plane, clamp
      const onTopYMin = plane.position.y - 0.5;
      const onTopYMax = plane.position.y + 4.0;
      if (py >= onTopYMin && py <= onTopYMax) {
        // Check x-z bounds and clamp
        const worldMinX = Math.min(min.x, max.x);
        const worldMaxX = Math.max(min.x, max.x);
        const worldMinZ = Math.min(min.z, max.z);
        const worldMaxZ = Math.max(min.z, max.z);

        const pad = 0.25;
        if (px < worldMinX + pad) this.player.position.x = worldMinX + pad;
        if (px > worldMaxX - pad) this.player.position.x = worldMaxX - pad;
        if (pz < worldMinZ + pad) this.player.position.z = worldMinZ + pad;
        if (pz > worldMaxZ - pad) this.player.position.z = worldMaxZ - pad;

        // Keep player standing on top when inside bounds
        const withinX = this.player.position.x >= worldMinX + pad && this.player.position.x <= worldMaxX - pad;
        const withinZ = this.player.position.z >= worldMinZ + pad && this.player.position.z <= worldMaxZ - pad;
        if (withinX && withinZ) {
          this.player.position.y = Math.max(this.player.position.y, plane.position.y + 0.6);
          this.player.velocity.y = Math.min(this.player.velocity.y, 0.1);
          this.player.onGround = true;
        }
      }
    };

    // Animate plane flying in to near player
    const start = performance.now();
    const durationIn = 1800;
    const from = plane.position.clone();
    const to = new THREE.Vector3(this.player.position.x, this.player.position.y + 10, this.player.position.z + 10);

    await new Promise(res => {
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / durationIn);
        plane.position.lerpVectors(from, to, t);
        if (t < 1) requestAnimationFrame(tick);
        else res();
      };
      tick();
    });

    // Move player into plane (simple set position slightly inside plane)
    const inside = to.clone().add(new THREE.Vector3(0, -1, 0));
    this.player.position.copy(inside);
    this.player.velocity.set(0,0,0);
    this.player.onGround = false;

    // Land plane near player and show multi-step confirmations
    const landPos = to.clone();
    plane.position.copy(landPos);
    plane.rotation.set(0, Math.PI, 0);

    // Build confirmation modal
    const confirmOverlay = document.createElement('div');
    confirmOverlay.style.position = 'absolute';
    confirmOverlay.style.left = '50%';
    confirmOverlay.style.top = '60%';
    confirmOverlay.style.transform = 'translate(-50%, -50%)';
    confirmOverlay.style.zIndex = '99999';
    confirmOverlay.style.padding = '12px';
    confirmOverlay.style.background = 'rgba(0,0,0,0.85)';
    confirmOverlay.style.border = '2px solid #222';
    confirmOverlay.style.color = '#fff';
    confirmOverlay.style.fontFamily = 'Minecraft, sans-serif';
    confirmOverlay.style.textAlign = 'center';
    confirmOverlay.style.minWidth = '280px';
    confirmOverlay.style.borderRadius = '6px';
    confirmOverlay.id = 'plane-confirm-overlay';

    const messages = [
      `Are you sure to travel to this seed? (${printedSeed})`,
      `Are you sure?`,
      `Are you really sure?`,
      `This is the last warning. Are you REALLY sure?`
    ];
    let msgIndex = 0;

    const msgEl = document.createElement('div');
    msgEl.style.marginBottom = '12px';
    msgEl.innerText = messages[msgIndex];
    confirmOverlay.appendChild(msgEl);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'space-around';
    btnRow.style.gap = '12px';

    const yesBtn = document.createElement('div');
    yesBtn.style.background = '#2ecc71';
    yesBtn.style.color = '#001';
    yesBtn.style.padding = '8px 14px';
    yesBtn.style.cursor = 'pointer';
    yesBtn.style.border = '2px solid #0a0';
    yesBtn.style.borderRadius = '4px';
    yesBtn.style.fontWeight = 'bold';
    yesBtn.innerText = 'Yes';

    const noBtn = document.createElement('div');
    noBtn.style.background = '#e74c3c';
    noBtn.style.color = '#100';
    noBtn.style.padding = '8px 14px';
    noBtn.style.cursor = 'pointer';
    noBtn.style.border = '2px solid #a00';
    noBtn.style.borderRadius = '4px';
    noBtn.style.fontWeight = 'bold';
    noBtn.innerText = 'No';

    btnRow.appendChild(yesBtn);
    btnRow.appendChild(noBtn);
    confirmOverlay.appendChild(btnRow);
    document.body.appendChild(confirmOverlay);

    // While overlay is active, keep player clamped to plane top bounds
    let overlayActive = true;

    const overlayLoop = () => {
      if (!overlayActive) return;
      clampPlayerToPlane();
      requestAnimationFrame(overlayLoop);
    };
    overlayLoop();

    const cleanUpOverlay = () => {
      overlayActive = false;
      if (confirmOverlay && confirmOverlay.parentNode) confirmOverlay.parentNode.removeChild(confirmOverlay);
    };

    // No handler: plane flies away and aborts seed change
    const flyAwayAndAbort = async () => {
      cleanUpOverlay();
      // animate plane away
      const startAway = performance.now();
      const durAway = 1000;
      const flyAwayTo = plane.position.clone().add(new THREE.Vector3(0, 50, 200));
      await new Promise(res => {
        const tick = () => {
          const t = Math.min(1, (performance.now() - startAway) / durAway);
          plane.position.lerpVectors(plane.position, flyAwayTo, t);
          if (t < 1) requestAnimationFrame(tick);
          else res();
        };
        tick();
      });
      // remove plane and restore state
      if (plane.parent) this.scene.remove(plane);
      this.inSeedTransition = false;
    };

    // Yes handler: advance prompts, final yes proceeds
    yesBtn.onclick = async () => {
      // advance index
      msgIndex++;
      if (msgIndex < messages.length) {
        msgEl.innerText = messages[msgIndex];
        // small green flash
        yesBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 200 });
        return;
      }

      // Final yes: proceed with loading -> plane flies off and world changes
      cleanUpOverlay();

      // Small takeoff animation for plane that signals it's leaving with you
      const startOut = performance.now();
      const durationOut = 900;
      const outTo = plane.position.clone().add(new THREE.Vector3(0, 60, 220));
      // Place player into plane (ride with it)
      const ridePos = plane.position.clone().add(new THREE.Vector3(0, -0.3, 0));
      this.player.position.copy(ridePos);
      this.player.velocity.set(0,0,0);
      this.player.onGround = false;

      await new Promise(res => {
        const tick = () => {
          const t = Math.min(1, (performance.now() - startOut) / durationOut);
          // ease out
          const e = t < 0.5 ? (2 * t * t) : (-1 + (4 - 2 * t) * t);
          plane.position.lerpVectors(plane.position, outTo, e);
          if (t < 1) requestAnimationFrame(tick);
          else res();
        };
        tick();
      });

      // Show loading flash
      const flash = document.getElementById('damage-flash');
      if (flash) {
        flash.style.transition = 'background 0.5s';
        requestAnimationFrame(() => {
          flash.style.background = 'rgba(0,0,0,1)';
        });
      }
      await new Promise(r => setTimeout(r, 500));

      // proceed to loading flow (rebuild world with printedSeed)
      const loading = document.getElementById('loading-screen');
      const loadingFill = document.getElementById('loading-progress');
      if (loading && loadingFill) {
        loading.style.display = 'flex';
        loadingFill.style.width = '0%';
        let p = 0;
        while (p < 100) {
          p += 6 + Math.random()*10;
          loadingFill.style.width = Math.min(100, p) + '%';
          await new Promise(r => setTimeout(r, 80));
        }
      }

      try {
        const newSeed = printedSeed;
        for (const obj of this.scene.children.slice()) {
          if (obj.name && obj.name.startsWith('chunk_')) {
            obj.traverse(c => { if (c.geometry) c.geometry.dispose(); });
            this.scene.remove(obj);
          }
        }
        this.world = new World(this.scene, newSeed);
        this.player.world = this.world;
        this.player.setVolume(SETTINGS.masterVolume, SETTINGS.soundVolume);
        await new Promise(r => setTimeout(r, 800));
      } catch (e) {
        console.error("Failed to change world seed", e);
      }

      if (loading) loading.style.display = 'none';
      if (flash) {
        flash.style.background = 'rgba(0,0,0,0)';
        await new Promise(r => setTimeout(r, 500));
      }

      // Place plane near new spawn and animate landing briefly then depart
      const arrivePos = new THREE.Vector3(this.player.position.x + 8, this.player.position.y + 12, this.player.position.z + 10);
      plane.position.copy(arrivePos);
      plane.rotation.set(0, Math.PI, 0);
      this.scene.add(plane);

      const startIn2 = performance.now();
      const durIn2 = 1200;
      const landPos2 = new THREE.Vector3(this.player.position.x + 2, this.player.position.y + 1, this.player.position.z + 4);
      await new Promise(res => {
        const tick = () => {
          const t = Math.min(1, (performance.now() - startIn2) / durIn2);
          plane.position.lerpVectors(arrivePos, landPos2, t);
          if (t < 1) requestAnimationFrame(tick);
          else res();
        };
        tick();
      });

      // Player exits plane
      this.player.position.copy(landPos2.clone().add(new THREE.Vector3(-1.2, 0, 0)));
      this.player.velocity.set(0,0,0);
      this.player.onGround = true;

      // Plane flies away and cleanup
      const startAway2 = performance.now();
      const durAway2 = 1000;
      const flyAwayTo2 = landPos2.clone().add(new THREE.Vector3(0, 50, 200));
      await new Promise(res => {
        const tick = () => {
          const t = Math.min(1, (performance.now() - startAway2) / durAway2);
          plane.position.lerpVectors(landPos2, flyAwayTo2, t);
          if (t < 1) requestAnimationFrame(tick);
          else res();
        };
        tick();
      });

      if (plane.parent) this.scene.remove(plane);
      this.inSeedTransition = false;
    };

    noBtn.onclick = async () => {
      // User chose no: plane flies away and we abort seed change
      await flyAwayAndAbort();
    };

    // Keep plane still until user makes decision; but clamp player while overlay is active
    // Wait until either flyAwayAndAbort or yes handler resolves (they remove overlay and continue).
    // We simply return here; handlers will continue logic.
  }

  summonMob(type, x, y, z) {
      if (type.toLowerCase() === 'zombie') {
          if (!this.playerModelTemplate) return false;
          this.zombies.push(new Zombie(this.scene, new THREE.Vector3(x, y, z), this.world, this.playerModelTemplate));
          return true;
      }
      return false;
  }

  updateSettings() {
    this.camera.fov = SETTINGS.fov;
    this.camera.updateProjectionMatrix();
    this.updateFog();
    
    if (this.bgm) {
      this.bgm.volume = SETTINGS.musicVolume * SETTINGS.masterVolume;
    }
    if (this.waterAmbience) {
      this.waterAmbience.volume = SETTINGS.soundVolume * SETTINGS.masterVolume;
    }
    if (this.player) {
      this.player.setVolume(SETTINGS.masterVolume, SETTINGS.soundVolume);
    }
    if (this.world) {
      this.world.renderDistance = SETTINGS.renderDistance;
    }
  }
  
  updateFog() {
    if (this.isUnderwater) {
       this.scene.fog = new THREE.Fog(this.underwaterColor, 0.25, 12);
       return;
    }

    if (SETTINGS.fog) {
       const dist = SETTINGS.renderDistance * 16;
       this.scene.fog = new THREE.Fog(this.skyColor, dist * 0.5, dist - 10);
    } else {
       this.scene.fog = null;
    }
  }

  checkUnderwater() {
    const camPos = this.camera.position;
    const x = Math.floor(camPos.x);
    const y = Math.floor(camPos.y);
    const z = Math.floor(camPos.z);
    
    const block = this.world.getBlock(x, y, z);
    let isSubmerged = false;

    if (block === BLOCK_TYPES.WATER_BUCKET) {
       const key = `${x},${y},${z}`;
       const level = this.world.waterLevels.get(key) || 8;
       const height = level / 8.0;
       
       // Check if camera is below water surface with slight buffer
       if (camPos.y < y + height - 0.1) {
          isSubmerged = true;
       }
    }

    if (isSubmerged !== this.isUnderwater) {
       this.isUnderwater = isSubmerged;
       if (this.isUnderwater) {
          this.scene.background = this.underwaterColor;
          this.waterAmbience.play().catch(() => {});
       } else {
          this.scene.background = this.skyColor;
          this.waterAmbience.pause();
          this.waterAmbience.currentTime = 0;
       }
       this.updateFog();
    }
  }

  showPlayerList(visible) {
    const overlay = document.getElementById('player-list-overlay');
    if (!overlay) return;
    
    if (visible) {
      this.updatePlayerListUI();
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
    }
  }

  updatePlayerListUI() {
    const content = document.getElementById('player-list-content');
    if (!content) return;
    content.innerHTML = '';
    
    const peers = room.peers || {};
    const presence = room.presence || {};
    
    const players = [];
    
    if (this.isMultiplayer) {
      Object.keys(peers).forEach(id => {
         const p = presence[id];
         // Include if they are in the same server, or if it's us (we might not have presence set yet but we are here)
         if ((p && p.serverId === this.serverId) || id === room.clientId) {
            players.push({
               username: peers[id].username,
               avatarUrl: peers[id].avatarUrl,
               ping: 1, // Fake ping
               platform: (p && p.platform) ? p.platform : (id === room.clientId ? this.platform : 'PC')
            });
         }
      });
    } else {
      // Singleplayer
      players.push({
         username: this.chat.username,
         avatarUrl: null, // Will use default logic
         ping: 0,
         platform: this.platform
      });
    }
    
    // De-duplicate by username just in case
    const uniquePlayers = [];
    const seen = new Set();
    players.forEach(p => {
       if (!seen.has(p.username)) {
         seen.add(p.username);
         uniquePlayers.push(p);
       }
    });
    
    uniquePlayers.sort((a,b) => a.username.localeCompare(b.username));
    
    uniquePlayers.forEach(p => {
       const div = document.createElement('div');
       div.className = 'player-list-entry';
       
       const head = document.createElement('img');
       head.className = 'player-head';
       head.src = p.avatarUrl || `https://images.websim.com/avatar/${p.username}`; 
       
       const name = document.createElement('span');
       name.className = 'player-name';
       name.innerText = p.username;
       
       const ping = document.createElement('span');
       ping.className = 'player-ping';
       ping.innerText = '📶';
       
       const platform = document.createElement('span');
       platform.innerText = p.platform || 'PC';
       platform.style.color = '#5555FF';
       platform.style.fontSize = '12px';
       platform.style.marginRight = '8px';

       div.appendChild(head);
       div.appendChild(name);
       div.appendChild(platform);
       div.appendChild(ping);
       content.appendChild(div);
    });
  }

  savePlayerState() {
    if (!this.isMultiplayer || !this.chat.username) return;
    
    const payload = {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
        rotX: this.controls.rotation.x,
        rotY: this.controls.rotation.y,
        rotZ: this.controls.rotation.z,
        inventory: this.controls.getInventoryData()
    };
    
    const key = `mc_player_data_${this.serverId}_${this.chat.username}`;
    localStorage.setItem(key, JSON.stringify(payload));
  }

  quitGame() {
    this.savePlayerState(); // Save on quit
    if (this.saveInterval) clearInterval(this.saveInterval);
    
    this.active = false;
    
    // Cleanup listeners
    window.removeEventListener('resize', this.boundOnResize);
    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
    window.removeEventListener('blur', this.boundOnBlur);
    document.removeEventListener('fullscreenchange', this.boundOnFullscreenChange);
    
    if (this.controls) this.controls.dispose();
    if (this.chat) this.chat.dispose();
    if (this.player) this.player.dispose();
    
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.pauseMenu.style.display = 'none';
    if (this.deathScreen) this.deathScreen.style.display = 'none';
    this.showPlayerList(false);
    
    if (this.unsubscribeBlocks) this.unsubscribeBlocks();
    if (this.unsubscribePresence) this.unsubscribePresence();
    if (this.unsubscribeItems) this.unsubscribeItems();
    
    if (this.waterAmbience) {
       this.waterAmbience.pause();
       this.waterAmbience = null;
    }

    if (this.onQuitCallback) this.onQuitCallback();
  }

  setupDebugVisuals() {
    // Chunk Borders
    const borderGeo = new THREE.BufferGeometry();
    const borderPoints = [];
    // Draw 16x16 horizontal grid and vertical pillars
    for (let i = 0; i <= 16; i++) {
       // Horizontal X-lines
       borderPoints.push(new THREE.Vector3(i, 0, 0), new THREE.Vector3(i, 0, 16));
       borderPoints.push(new THREE.Vector3(i, 64, 0), new THREE.Vector3(i, 64, 16));
       // Horizontal Z-lines
       borderPoints.push(new THREE.Vector3(0, 0, i), new THREE.Vector3(16, 0, i));
       borderPoints.push(new THREE.Vector3(0, 64, i), new THREE.Vector3(16, 64, i));
    }
    // Vertical Pillars
    borderPoints.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 64, 0));
    borderPoints.push(new THREE.Vector3(16, 0, 0), new THREE.Vector3(16, 64, 0));
    borderPoints.push(new THREE.Vector3(0, 0, 16), new THREE.Vector3(0, 64, 16));
    borderPoints.push(new THREE.Vector3(16, 0, 16), new THREE.Vector3(16, 64, 16));

    borderGeo.setFromPoints(borderPoints);
    this.chunkBorders = new THREE.LineSegments(borderGeo, new THREE.LineBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 0.5 }));
    this.debugAids.add(this.chunkBorders);

    // Hitbox template
    this.hitboxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.6, 1.8, 0.6));
    this.hitboxMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF });
  }

  setupDebugControls() {
    // Ambient Slider
    const ambientSlider = document.getElementById('ambient-slider');
    if (ambientSlider) {
      ambientSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.world && this.world.materialUniforms) {
          this.world.materialUniforms.forEach(u => {
            if (u.uAmbient) u.uAmbient.value = val;
          });
        }
      });
      // prevent event propagation to game controls
      ambientSlider.addEventListener('keydown', e => e.stopPropagation());
    }

    // Fog Toggle (Debug)
    const fogToggle = document.getElementById('fog-toggle');
    if (fogToggle) {
      fogToggle.checked = SETTINGS.fog;
      fogToggle.addEventListener('change', (e) => {
        SETTINGS.fog = e.target.checked;
        this.updateFog();
      });
      fogToggle.addEventListener('keydown', e => e.stopPropagation());
    }


  }

  initMusic() {
    // Music disabled: no background music will be created or played.
    this.bgm = null;
  }

  playRandomMusic() {
    // Music disabled - intentionally no-op.
  }
  
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initHearts() {
    this.heartTextures = {
      full: '/Hearts.png', // We'll use CSS slicing for this too
      half: '/Hearts.png',
      empty: '/Hearts.png'
    };
    this.updateHeartsUI();
  }

  takeDamage(amt, source = null) {
    if (this.health <= 0 || this.invulnerabilityTimer > 0) return;
    this.health = Math.max(0, this.health - amt);
    this.updateHeartsUI();

    // Visual Damage Feedback
    // Flash removed per request
    if (this.player) {
      this.player.hurtTimer = 0.5;
    }
    
    if (this.health <= 0) {
       // Death logic: source 'fall' or other both trigger hit3.ogg (mapped to death_fall and hit)
       if (source === 'fall') {
          this.player.playSound('death_fall', false, 1.0);
       } else {
          this.player.playSound('hit', false, 1.0);
       }
       this.onDeath(source);
    } else {
       // Only play standard hit (hit3) if NOT a fall. 
       // Survived falls already play fall_small/fall_big inside player.js physics
       if (source !== 'fall') {
          this.player.playSound('hit', false, 1.0); 
       }
    }
  }

  onDeath(source = null) {
    // Drop Inventory
    if (this.controls && this.controls.inventory) {
       const inv = this.controls.inventory;
       const pos = this.player.position;
       
       for (let i = 0; i < inv.length; i++) {
          const item = inv[i];
          if (item && item.count > 0) {
             const angle = Math.random() * Math.PI * 2;
             const speed = 2 + Math.random() * 2;
             const vx = Math.cos(angle) * speed;
             const vz = Math.sin(angle) * speed;
             const vy = 3 + Math.random() * 2;
             
             this.world.dropStack(pos.x, pos.y + 1, pos.z, vx, vy, vz, item.type, item.count);
          }
       }
       
       this.controls.inventory.fill(null);
       this.controls.updateHotbarUI();
       this.controls.updateInternalUI();
       this.player.updateHeldItem(null);
       
       // Clear drag item
       this.controls.cursorItem = null;
       if (this.controls.dragElement) this.controls.dragElement.style.display = 'none';
    }

    let message = `${this.chat.username} died`;
    if (source === 'fall') {
      message = `${this.chat.username} fell from a high place`;
    } else if (source && room.peers && room.peers[source]) {
      const killerName = room.peers[source].username || "Player";
      message = `${this.chat.username} was slain by ${killerName}`;
    } else if (source && typeof source === 'string') {
      message = `${this.chat.username} was slain by ${source}`;
    }

    // Add to local chat in white
    this.chat.addMessage(message, null, '#ffffff');

    // Broadcast to all other players in multiplayer
    if (this.isMultiplayer) {
      room.send({
        type: 'chat',
        serverId: this.serverId,
        message: message,
        username: null, // Null username signals a system-style message (no brackets)
        echo: false     // Already shown locally
      });
    }

    this.paused = true;
    
    if (this.deathScreen) {
       this.deathScreen.style.display = 'flex';
       this.deathMsg.innerText = message;
       this.deathScore.innerText = "0";
    }
    
    document.exitPointerLock();
    this.renderer.domElement.classList.add('blurred');
  }

  handleEntityCollisions(delta) {
    const entities = [];
    
    // Add Local Player
    entities.push({
        type: 'player',
        obj: this.player,
        pos: this.player.position,
        radius: 0.3,
        isLocal: true
    });
    
    // Add Zombies
    this.zombies.forEach(z => {
        entities.push({
            type: 'zombie',
            obj: z,
            pos: z.position,
            radius: 0.3,
            isLocal: true
        });
    });
    
    // Add Remote Players
    Object.values(this.remotePlayers).forEach(mesh => {
        entities.push({
            type: 'remote',
            obj: mesh,
            pos: mesh.position,
            radius: 0.3,
            isLocal: false
        });
    });
    
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            const e1 = entities[i];
            const e2 = entities[j];
            
            const dx = e1.pos.x - e2.pos.x;
            const dz = e1.pos.z - e2.pos.z;
            const distSq = dx*dx + dz*dz;
            const minDist = e1.radius + e2.radius;
            
            // Vertical check (height approx 1.8)
            const dy = Math.abs(e1.pos.y - e2.pos.y);
            
            if (dy < 1.8) {
                // Physical Collision
                if (distSq < minDist * minDist) {
                    const dist = Math.sqrt(distSq);
                    const overlap = minDist - dist;
                    
                    // Push direction
                    let nx = dx / dist;
                    let nz = dz / dist;
                    
                    if (dist < 0.0001) {
                        nx = (Math.random() - 0.5);
                        nz = (Math.random() - 0.5);
                        const len = Math.sqrt(nx*nx + nz*nz);
                        nx /= len; nz /= len;
                    }
                    
                    // Push logic
                    if (e1.isLocal && e2.isLocal) {
                        e1.pos.x += nx * overlap * 0.5;
                        e1.pos.z += nz * overlap * 0.5;
                        e2.pos.x -= nx * overlap * 0.5;
                        e2.pos.z -= nz * overlap * 0.5;
                    } else if (e1.isLocal) {
                        e1.pos.x += nx * overlap;
                        e1.pos.z += nz * overlap;
                    } else if (e2.isLocal) {
                        e2.pos.x -= nx * overlap;
                        e2.pos.z -= nz * overlap;
                    }
                }

                // Zombie Attack Logic (Increased Range)
                const attackRange = 1.2; // 1.2 blocks distance (center to center)
                if (distSq < attackRange * attackRange) {
                    if (e1.type === 'player' && e2.type === 'zombie') {
                        this.handleZombieAttack(e2.obj, e1.obj);
                    } else if (e1.type === 'zombie' && e2.type === 'player') {
                        this.handleZombieAttack(e1.obj, e2.obj);
                    }
                }
            }
        }
    }
  }

  handleZombieAttack(zombie, player) {
    if (zombie.attackCooldown <= 0) {
        // Damage based on difficulty: Easy=2 (1 heart), Normal=3 (1.5 hearts), Hard=4 (2 hearts)
        let damage = 3;
        if (SETTINGS.difficulty === 1) damage = 2;
        else if (SETTINGS.difficulty === 3) damage = 4;

        player.onDamage(damage, 'Zombie'); 
        
        // Knockback
        const dx = player.position.x - zombie.position.x;
        const dz = player.position.z - zombie.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        
        if (dist > 0.001) {
            player.velocity.x += (dx / dist) * 10;
            player.velocity.z += (dz / dist) * 10;
            player.velocity.y += 5;
        }
        
        zombie.attackCooldown = 1.0; 
    }
  }

  respawn() {
    this.health = 20;
    this.player.position.set(0, 40, 0);
    this.player.velocity.set(0, 0, 0);
    this.updateHeartsUI();
    
    this.invulnerabilityTimer = 8.0;
    this.chat.addMessage("Spawn protection active for 8 seconds.", null, '#55FF55');
    
    if (this.deathScreen) this.deathScreen.style.display = 'none';
    this.setPaused(false);
  }

  updateHeartsUI() {
    const container = document.getElementById('hud-health');
    if (!container) return;
    container.innerHTML = '';
    
    for (let i = 0; i < 10; i++) {
       const slot = document.createElement('div');
       slot.className = 'heart-slot';
       
       const bg = document.createElement('div');
       bg.className = 'heart-bg';
       bg.style.backgroundPosition = `calc(-23px * var(--scale)) calc(-1px * var(--scale))`;
       slot.appendChild(bg);

       const healthIndex = (i + 1) * 2;
       if (this.health >= healthIndex - 1) {
          const fg = document.createElement('div');
          fg.className = 'heart-fg';
          let bgPos = '';
          if (this.health >= healthIndex) {
             bgPos = `calc(-1px * var(--scale)) calc(-1px * var(--scale))`;
          } else {
             bgPos = `calc(-12px * var(--scale)) calc(-1px * var(--scale))`;
          }
          fg.style.backgroundPosition = bgPos;
          slot.appendChild(fg);
       }
       
       container.appendChild(slot);
    }
  }

  animate() {
    if (!this.active) return;
    requestAnimationFrame(() => this.animate());
    
    const delta = Math.min(this.clock.getDelta(), 0.1);
    const time = performance.now();
    
    if (!this.paused) {
      if (this.invulnerabilityTimer > 0) {
        this.invulnerabilityTimer -= delta;
      }
      this.updateTime(delta);
      this.player.update(delta);
      this.controls.update();
      this.checkUnderwater();
      
      this.world.update(delta, this.player, (type, item) => {
        if (this.controls.addItem(type, item.count || 1)) {
           if (this.isMultiplayer && item && item.dbId) {
             room.collection('world_items').delete(item.dbId).catch(console.error);
           }
           return true;
        }
        return false;
      });

      // Update Zombies
      const isDay = this.gameTime < 12500 || this.gameTime > 23500;
      for (let i = this.zombies.length - 1; i >= 0; i--) {
          const z = this.zombies[i];
          z.update(delta, this.player.position, isDay);
          if (z.dead) {
              z.dispose();
              this.zombies.splice(i, 1);
          }
      }

      this.handleEntityCollisions(delta);
      
      if (this.isMultiplayer && !this.inSeedTransition && time - this.lastPresenceUpdate > 50) { // 20 ticks/sec
        room.updatePresence({
           serverId: this.serverId,
           position: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
           rotation: { x: this.camera.rotation.x, y: this.camera.rotation.y, z: this.camera.rotation.z },
           bodyYaw: this.player.bodyYaw,
           username: this.chat.username,
           skinUrl: this.skinUrl,
           platform: this.platform
        });
        this.lastPresenceUpdate = time;
      }
    }

    this.renderer.render(this.scene, this.camera);
    
    // Update FPS counter
    this.frameCount++;
    if (time - this.lastFpsUpdate >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = time;
    }
    
    // Update debug info
    const pos = this.player.position;
    if (this.debugText) {
      const biome = this.world.getBiome(Math.floor(pos.x), Math.floor(pos.z));
      const biomeName = biome.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      
      let debugHtml = `Minecraft ${this.version} (${this.fps} fps)<br>`;
      debugHtml += this.isMultiplayer ? `Multiplayer (${this.serverId})<br>` : `Integrated Server<br>`;
      debugHtml += `XYZ: ${pos.x.toFixed(3)} / ${pos.y.toFixed(3)} / ${pos.z.toFixed(3)}<br>`;
      debugHtml += `Block: ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}<br>`;
      
      const chunkX = Math.floor(pos.x / 16);
      const chunkZ = Math.floor(pos.z / 16);
      debugHtml += `Chunk: ${chunkX} 0 ${chunkZ} in ${Math.floor(pos.x) & 15} ${Math.floor(pos.y) & 15} ${Math.floor(pos.z) & 15}<br>`;
      
      const yaw = (this.camera.rotation.y * 180 / Math.PI) % 360;
      let direction = "North (-Z)";
      if (yaw > -45 && yaw <= 45) direction = "South (+Z)";
      else if (yaw > 45 && yaw <= 135) direction = "West (-X)";
      else if (yaw > -135 && yaw <= -45) direction = "East (+X)";
      else direction = "North (-Z)";
      
      debugHtml += `Facing: ${direction} (${yaw.toFixed(1)})<br>`;
      debugHtml += `Biome: ${biomeName}<br>`;
      
      const light = this.world.getSkyLight(Math.floor(pos.x), Math.floor(pos.y + 1.5), Math.floor(pos.z));
      debugHtml += `Light: ${light} (sky 15, block 0)<br>`;
      
      const timeHours = Math.floor((this.gameTime + 6000) % 24000 / 1000);
      const timeMins = Math.floor(((this.gameTime + 6000) % 24000 % 1000) / 1000 * 60);
      debugHtml += `Time: ${this.gameTime.toFixed(0)} (Day ${this.dayCount}) ${timeHours.toString().padStart(2,'0')}:${timeMins.toString().padStart(2,'0')}<br>`;

      if (SETTINGS.debugMode) {
        if (this.controls && this.controls.targetBlockPos) {
           const t = this.controls.targetBlockPos;
           const blockName = this.controls.getDisplayName(t.type);
           debugHtml += `Looking at: ${t.x} ${t.y} ${t.z} (${blockName})<br>`;
        }
        debugHtml += `Client ID: ${room.clientId}<br>`;
      }
      this.debugText.innerHTML = debugHtml;
    }

    if (this.debugInfoRight) {
       let rightHtml = `WebGL Renderer<br>${this.gpuName}<br>`;
       rightHtml += `Display: ${window.innerWidth}x${window.innerHeight}<br><br>`;
       
       const entitiesP = this.isMultiplayer ? Object.keys(this.remotePlayers).length + 1 : 1;
       const entitiesI = this.world.droppedItems.length;
       const entitiesT = this.world.particles.length;
       const entitiesZ = this.zombies.length;
       rightHtml += `Entities: ${entitiesP + entitiesI + entitiesT + entitiesZ} (P:${entitiesP}, Z:${entitiesZ}, I:${entitiesI}, T:${entitiesT})<br>`;
       
       if (window.performance && window.performance.memory) {
          const mem = window.performance.memory;
          rightHtml += `Mem: ${Math.round(mem.usedJSHeapSize / 1048576)}/${Math.round(mem.jsHeapLimit / 1048576)}MB`;
       }
       
       this.debugInfoRight.innerHTML = rightHtml;
    }

    // Update Debug Visuals in World
    if (SETTINGS.debugMode && this.debugAids) {
       this.debugAids.visible = true;
       // Snap chunk borders to current player chunk
       const cx = Math.floor(pos.x / 16) * 16;
       const cz = Math.floor(pos.z / 16) * 16;
       this.chunkBorders.position.set(cx, 0, cz);

       // Update Hitboxes for remote players
       if (this.remotePlayers) {
          Object.keys(this.remotePlayers).forEach(id => {
             const mesh = this.remotePlayers[id];
             if (!mesh.userData.hitbox) {
                const hb = new THREE.LineSegments(this.hitboxGeo, this.hitboxMat);
                hb.position.y = 0.9;
                mesh.add(hb);
                mesh.userData.hitbox = hb;
             }
             mesh.userData.hitbox.visible = true;
          });
       }
    } else if (this.debugAids) {
       this.debugAids.visible = false;
       if (this.remotePlayers) {
         Object.values(this.remotePlayers).forEach(mesh => {
            if (mesh.userData.hitbox) mesh.userData.hitbox.visible = false;
         });
       }
    }
  }
}

class MultiplayerMenu {
  static init() {
    this.menu = document.getElementById('multiplayer-menu');
    this.addMenu = document.getElementById('add-server-menu');
    this.createMenu = document.getElementById('create-server-menu');
    this.createdScreen = document.getElementById('server-created-screen');
    this.directMenu = document.getElementById('direct-connect-menu');
    
    this.list = document.getElementById('server-list');
    
    // Main Buttons
    this.btnJoin = document.getElementById('btn-join-server');
    this.btnDirect = document.getElementById('btn-direct-connect');
    this.btnAdd = document.getElementById('btn-add-server');
    this.btnCreate = document.getElementById('btn-create-server');
    this.btnDelete = document.getElementById('btn-delete-server');
    this.btnEdit = document.getElementById('btn-edit-server');
    this.btnCancel = document.getElementById('btn-mp-cancel');
    
    // Add/Edit Menu inputs
    this.btnSaveServer = document.getElementById('btn-save-server');
    this.btnCancelAdd = document.getElementById('btn-cancel-add-server');
    this.nameInput = document.getElementById('server-name-input');
    this.addressInput = document.getElementById('server-address-input');
    
    // Create Menu inputs
    this.createNameInput = document.getElementById('create-server-name');
    this.createIconInput = document.getElementById('create-server-icon');
    this.createPwdInput = document.getElementById('create-server-pwd');
    this.btnDoCreate = document.getElementById('btn-do-create-server');
    this.btnCancelCreate = document.getElementById('btn-cancel-create-server');
    
    // Admin stuff
    this.btnAdmin = document.getElementById('btn-admin-panel');
    this.loginMenu = document.getElementById('admin-login-menu');
    this.loginPwd = document.getElementById('admin-login-pwd');
    this.btnLogin = document.getElementById('btn-admin-login');
    this.btnCancelLogin = document.getElementById('btn-admin-cancel');
    
    this.panelMenu = document.getElementById('admin-panel-menu');
    this.consoleOutput = document.getElementById('admin-console-output');
    this.consoleInput = document.getElementById('admin-console-input');
    this.btnConsoleSend = document.getElementById('btn-admin-send');
    this.btnConsoleClose = document.getElementById('btn-admin-close');

    // Created Screen inputs
    this.createdIdInput = document.getElementById('created-server-id');
    this.btnCreatedDone = document.getElementById('btn-created-done');

    // Direct Connect inputs
    this.directAddressInput = document.getElementById('direct-server-address');
    this.btnJoinDirect = document.getElementById('btn-join-direct');
    this.btnCancelDirect = document.getElementById('btn-cancel-direct');
    
    this.selectedServerId = null;
    this.onlineServers = []; // From DB
    this.savedServers = []; // From LocalStorage
    this.isEditing = false;
    
    this.tooltip = document.getElementById('server-tooltip');

    // Subscribe to presence globally to keep counts updated
    room.subscribePresence(() => {
       if (this.menu && this.menu.style.display === 'flex') {
          this.renderList();
       }
    });

    // --- Main Menu Handlers ---

    this.btnCancel.onclick = () => {
       this.close();
       if (this.onClose) this.onClose();
    };

    this.btnAdd.onclick = () => {
       this.isEditing = false;
       this.menu.style.display = 'none';
       this.addMenu.style.display = 'flex';
       this.nameInput.value = "Minecraft Server";
       this.addressInput.value = "";
       this.nameInput.focus();
    };
    
    this.btnEdit.onclick = () => {
      if (!this.selectedServerId) return;
      const saved = this.savedServers.find(s => s.id === this.selectedServerId);
      if (!saved) return;
      
      this.isEditing = true;
      this.menu.style.display = 'none';
      this.addMenu.style.display = 'flex';
      this.nameInput.value = saved.name;
      this.addressInput.value = saved.id;
    };

    this.btnCreate.onclick = () => {
       this.menu.style.display = 'none';
       this.createMenu.style.display = 'flex';
       this.createNameInput.value = "My World";
       this.createIconInput.value = ""; 
       this.createPwdInput.value = "";
       this.createNameInput.focus();
    };

    this.btnDirect.onclick = () => {
      this.menu.style.display = 'none';
      this.directMenu.style.display = 'flex';
      this.directAddressInput.focus();
    };

    this.btnJoin.onclick = () => {
       if (this.selectedServerId && this.onJoin) {
          // Check online servers for seed
          const server = this.onlineServers.find(s => s.id === this.selectedServerId);
          // Or check saved (might not have seed if added via address, need to fetch)
          // For now we assume we can fetch it.
          if (server) {
             this.onJoin(server.id, server.seed);
          } else {
             // It's a saved server not in the online list? (Maybe deleted from DB but in local storage)
             // We should try to fetch it.
             this.joinById(this.selectedServerId);
          }
       }
    };
    
    this.btnDelete.onclick = () => {
       if (this.selectedServerId) {
          // Remove from local storage
          this.savedServers = this.savedServers.filter(s => s.id !== this.selectedServerId);
          this.saveToLocalStorage();
          this.selectedServerId = null;
          this.renderList();
       }
    };

    // --- Add/Edit Menu Handlers ---
    this.btnCancelAdd.onclick = () => {
       this.addMenu.style.display = 'none';
       this.menu.style.display = 'flex';
    };

    this.btnSaveServer.onclick = () => {
       const name = this.nameInput.value || "Minecraft Server";
       const addr = this.addressInput.value.trim();
       if (!addr) return;
       
       if (this.isEditing) {
         const idx = this.savedServers.findIndex(s => s.id === this.selectedServerId);
         if (idx >= 0) {
           this.savedServers[idx].name = name;
           this.savedServers[idx].id = addr; // ID can change if they edit address
         }
       } else {
         this.savedServers.push({
           name: name,
           id: addr
         });
       }
       
       this.saveToLocalStorage();
       this.addMenu.style.display = 'none';
       this.menu.style.display = 'flex';
       this.fetchServers(); // Refresh view
    };

    // --- Create Menu Handlers ---
    this.btnCancelCreate.onclick = () => {
       this.createMenu.style.display = 'none';
       this.menu.style.display = 'flex';
    };

    this.btnDoCreate.onclick = async () => {
       const name = this.createNameInput.value || "My World";
       const file = this.createIconInput.files[0];
       const password = this.createPwdInput.value;
       let iconUrl = null;

       this.btnDoCreate.innerText = "Uploading...";
       
       try {
         if (file) {
           try {
             iconUrl = await window.websim.upload(file);
           } catch (e) {
             console.error("Upload failed", e);
             alert("Failed to upload icon, using default.");
           }
         }

         this.btnDoCreate.innerText = "Creating...";
         
         const record = await room.collection('servers').create({
            name: name,
            seed: Math.random().toString(),
            motd: "A Websim Minecraft Server",
            iconUrl: iconUrl,
            adminPassword: password
         });

         // Auto-Op Creator
         try {
           const user = await window.websim.getCurrentUser();
           if (user && user.username) {
              await room.collection('server_ops').create({
                  server_id: record.id,
                  username: user.username
              });
           }
         } catch(e) { console.error("Failed to auto-op creator", e); }
         
         this.createdIdInput.value = record.id;
         
         // Auto save to local list
         this.savedServers.push({
           name: name,
           id: record.id,
           iconUrl: iconUrl
         });
         this.saveToLocalStorage();
         
         this.createMenu.style.display = 'none';
         this.createdScreen.style.display = 'flex';
       } catch (e) {
         console.error(e);
         alert("Failed to create server");
       } finally {
         this.btnDoCreate.innerText = "Create";
       }
    };

    // --- Created Screen Handlers ---
    this.btnCreatedDone.onclick = () => {
       this.createdScreen.style.display = 'none';
       this.menu.style.display = 'flex';
       this.fetchServers();
    };

    // --- Direct Connect Handlers ---
    this.btnCancelDirect.onclick = () => {
       this.directMenu.style.display = 'none';
       this.menu.style.display = 'flex';
    };

    this.btnJoinDirect.onclick = () => {
      const id = this.directAddressInput.value.trim();
      if (id) {
        this.joinById(id);
      }
    };

    // --- Admin Handlers ---
    this.btnAdmin.onclick = () => {
       if (this.selectedServerId) {
          const server = this.onlineServers.find(s => s.id === this.selectedServerId);
          if (!server) {
             // Maybe it's a saved server we need to fetch info for?
             // Since we need to check the password field which is on the record
             this.fetchServerInfo(this.selectedServerId).then(s => {
                if (s) this.showLogin(s);
                else alert("Could not fetch server info.");
             });
          } else {
             this.showLogin(server);
          }
       }
    };

    this.btnCancelLogin.onclick = () => {
       this.loginMenu.style.display = 'none';
       this.menu.style.display = 'flex';
    };

    this.btnLogin.onclick = () => {
       const pwd = this.loginPwd.value;
       if (this.currentAdminServer && this.currentAdminServer.adminPassword === pwd) {
          this.loginMenu.style.display = 'none';
          this.showAdminPanel(this.currentAdminServer);
       } else {
          alert("Incorrect password!");
       }
    };

    this.btnConsoleClose.onclick = () => {
       this.panelMenu.style.display = 'none';
       this.menu.style.display = 'flex';
       if (this.consoleUnsubscribes) {
          this.consoleUnsubscribes.forEach(u => u());
          this.consoleUnsubscribes = [];
       }
    };
    
    this.btnConsoleSend.onclick = () => {
       this.sendConsoleCommand();
    };
    
    this.consoleInput.addEventListener('keydown', (e) => {
       if (e.key === 'Enter') this.sendConsoleCommand();
    });
  }

  static async fetchServerInfo(id) {
     try {
        const records = await room.collection('servers').filter({id: id}).getList();
        return records.length > 0 ? records[0] : null;
     } catch (e) { return null; }
  }

  static showLogin(server) {
     if (!server.adminPassword) {
        alert("This server has no admin password set.");
        return;
     }
     this.currentAdminServer = server;
     this.menu.style.display = 'none';
     this.loginMenu.style.display = 'flex';
     this.loginPwd.value = '';
     this.loginPwd.focus();
  }

  static showAdminPanel(server) {
     this.panelMenu.style.display = 'flex';
     this.consoleOutput.innerHTML = `Connected to server console: ${server.name}\nType /help for help.\n`;
     this.consoleInput.focus();
     this.currentAdminServer = server;
     
     if (this.consoleUnsubscribes) {
        this.consoleUnsubscribes.forEach(u => u());
     }
     this.consoleUnsubscribes = [];

     // Subscribe to logs
     const unsubLogs = room.collection('server_logs').filter({ server_id: server.id }).subscribe((logs) => {
        // Just show the newest few or sync list? 
        // With subscribeList, it sends the whole list. We only want new ones typically, 
        // but for a console opening, getting history is good.
        // We'll just clear and re-render for simplicity or handle diffs. 
        // Since this is a simple impl, let's just append new ones if we track IDs, 
        // or just sort and dump the last 50.
        const sorted = logs.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
        this.renderConsoleLogs(sorted);
     });
     this.consoleUnsubscribes.push(unsubLogs);

     // Subscribe to chat
     const unsubChat = room.collection('chat_messages').filter({ server_id: server.id }).subscribe((msgs) => {
        const sorted = msgs.sort((a,b) => (a.created_at > b.created_at ? 1 : -1));
        this.renderConsoleChat(sorted);
     });
     this.consoleUnsubscribes.push(unsubChat);
     
     this.consoleLogCache = new Set();
     this.consoleChatCache = new Set();
  }

  static renderConsoleLogs(logs) {
     logs.forEach(log => {
        if (this.consoleLogCache.has(log.id)) return;
        this.consoleLogCache.add(log.id);
        
        const time = new Date(log.timestamp || Date.now()).toLocaleTimeString();
        this.logToConsole(`[${time}] [LOG] ${log.username}: ${log.message}`, '#cccccc');
     });
  }

  static renderConsoleChat(msgs) {
     msgs.forEach(msg => {
        if (this.consoleChatCache.has(msg.id)) return;
        this.consoleChatCache.add(msg.id);
        
        const time = new Date(msg.created_at).toLocaleTimeString();
        this.logToConsole(`[${time}] [CHAT] <${msg.username}> ${msg.message}`, '#ffffff');
     });
  }

  static findClient(username) {
     const peers = room.peers;
     const presence = room.presence;
     const serverId = this.currentAdminServer.id;
     
     return Object.keys(peers).find(id => {
        const p = presence[id];
        if (!p || p.serverId !== serverId) return false;
        return (peers[id].username || '').toLowerCase() === username.toLowerCase();
     });
  }

  static sendConsoleCommand() {
     const cmd = this.consoleInput.value.trim();
     if (!cmd) return;
     
     this.logToConsole(`> ${cmd}`, '#55ffff');
     this.consoleInput.value = '';
     
     const parts = cmd.split(' ');
     const command = parts[0].toLowerCase();
     
     if (command === '/op') {
        const target = parts[1];
        if (target) {
           room.collection('server_ops').create({
              server_id: this.currentAdminServer.id,
              username: target
           }).then(() => {
              this.logToConsole(`Opped ${target}`);
           }).catch(e => {
              this.logToConsole(`Error opping ${target}: ${e.message}`);
           });
        } else {
           this.logToConsole("Usage: /op <player>");
        }
     } else if (command === '/deop') {
        const target = parts[1];
        if (target) {
           room.collection('server_ops').filter({
              server_id: this.currentAdminServer.id,
              username: target
           }).getList().then(records => {
              if (records.length > 0) {
                 Promise.all(records.map(r => room.collection('server_ops').delete(r.id)))
                 .then(() => this.logToConsole(`De-opped ${target}`));
              } else {
                 this.logToConsole(`${target} is not an operator.`);
              }
           });
        } else {
           this.logToConsole("Usage: /deop <player>");
        }
     } else if (command === '/give') {
        // /give <player> <item> [amount]
        if (parts.length < 3) {
           this.logToConsole("Usage: /give <player> <item> [amount]");
           return;
        }
        const targetName = parts[1];
        const itemName = parts[2].toUpperCase();
        const amount = parseInt(parts[3]) || 1;
        
        const clientId = this.findClient(targetName);
        if (!clientId) {
           this.logToConsole(`Player '${targetName}' not found or not online.`);
           return;
        }
        
        const blockType = BLOCK_TYPES[itemName];
        if (blockType === undefined) {
           this.logToConsole(`Unknown item: ${itemName}`);
           return;
        }
        
        room.requestPresenceUpdate(clientId, {
           type: 'give',
           item: blockType,
           amount: amount
        });
        
        this.logToConsole(`Gave ${amount} ${itemName} to ${targetName}`);
        
     } else if (command === '/tp') {
        // /tp <player> <x> <y> <z>
        if (parts.length < 5) {
           this.logToConsole("Usage: /tp <player> <x> <y> <z>");
           return;
        }
        const targetName = parts[1];
        const x = parseFloat(parts[2]);
        const y = parseFloat(parts[3]);
        const z = parseFloat(parts[4]);
        
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
           this.logToConsole("Invalid coordinates.");
           return;
        }
        
        const clientId = this.findClient(targetName);
        if (!clientId) {
           this.logToConsole(`Player '${targetName}' not found.`);
           return;
        }
        
        room.requestPresenceUpdate(clientId, {
           type: 'teleport',
           x, y, z
        });
        
        this.logToConsole(`Teleported ${targetName} to ${x},${y},${z}`);

     } else if (command === '/say') {
        const msg = parts.slice(1).join(' ');
        if (!msg) {
           this.logToConsole("Usage: /say <message>");
           return;
        }
        
        room.send({
           type: 'chat',
           serverId: this.currentAdminServer.id,
           message: `[Server] ${msg}`,
           username: 'Server'
        });
        
        this.logToConsole(`[Server] ${msg}`, '#ffffff');
        
     } else {
        this.logToConsole("Unknown command. Available: /op, /deop, /give, /tp, /say");
     }
  }

  static logToConsole(text, color = null) {
     const line = document.createElement('div');
     line.innerText = text;
     if (color) line.style.color = color;
     this.consoleOutput.appendChild(line);
     this.consoleOutput.scrollTop = this.consoleOutput.scrollHeight;
  }
  
  static loadFromLocalStorage() {
    try {
      const data = localStorage.getItem('mc_saved_servers');
      if (data) {
        this.savedServers = JSON.parse(data);
      } else {
        this.savedServers = [];
      }
    } catch (e) {
      this.savedServers = [];
    }
  }

  static saveToLocalStorage() {
    localStorage.setItem('mc_saved_servers', JSON.stringify(this.savedServers));
  }
  
  static async joinById(id) {
     // Try to find in online list first
     let server = this.onlineServers.find(s => s.id === id);
     
     if (!server) {
       // Fetch specific record
       try {
         // We can't fetch single by ID easily with current API wrapper in prompt unless we filter
         // But we can filter by ID.
         const records = await room.collection('servers').filter({ id: id }).getList();
         // Wait, ID filtering is implicit in some DBs, but here records have ID. 
         // Websim filter checks fields. 'id' is a field.
         // Actually filter({id: id}) might not work if ID is system field, but let's try.
         // If filter doesn't work, we rely on the full list fetch we did earlier.
         // Let's assume we can join if we have the ID and Seed. 
         // If we don't have seed, we can't generate world correctly.
         
         // If we can't find it in the global list, maybe it was deleted or we haven't refreshed.
         // Let's refresh.
         await this.fetchServers();
         server = this.onlineServers.find(s => s.id === id);
       } catch (e) {}
     }

     if (server) {
        if (this.onJoin) this.onJoin(server.id, server.seed);
     } else {
        alert("Could not connect to server: " + id);
     }
  }

  static open(onClose, onJoin) {
     if (!this.menu) this.init();
     this.onClose = onClose;
     this.onJoin = onJoin;
     this.menu.style.display = 'flex';
     this.loadFromLocalStorage();
     this.fetchServers();
  }
  
  static close() {
     if (this.menu) {
       this.menu.style.display = 'none';
       this.addMenu.style.display = 'none';
       this.createMenu.style.display = 'none';
       this.createdScreen.style.display = 'none';
       this.directMenu.style.display = 'none';
     }
  }
  
  static async fetchServers() {
     this.list.innerHTML = '<div style="color: #aaa; text-align: center; padding: 20px;">Pinging...</div>';
     // Fetch all servers to check status/get seeds
     this.onlineServers = await room.collection('servers').getList();
     this.renderList();
  }
  
  static renderList() {
     this.list.innerHTML = '';
     
     // Merge Saved list with Online data
     // If saved list is empty, user sees nothing (standard MC behavior).
     
     if (this.savedServers.length === 0) {
        this.list.innerHTML = '<div style="color: #aaa; text-align: center; padding: 20px;">No servers. <br>Click "Create Server" to start one<br>or "Add Server" to save one.</div>';
     }
     
     this.savedServers.forEach(saved => {
        const onlineData = this.onlineServers.find(s => s.id === saved.id);
        const motd = onlineData ? onlineData.motd : "Can't reach server";
        
        // Calculate player count
        let playerCount = 0;
        let playerNames = [];
        
        if (room.presence) {
           Object.values(room.presence).forEach(p => {
              if (p.serverId === saved.id) {
                 playerCount++;
                 if (p.username) playerNames.push(p.username);
              }
           });
        }
        
        const ping = onlineData ? `${playerCount} / 20` : "---";
        const statusColor = onlineData ? "#00aa00" : "#aa0000";
        
        const el = document.createElement('div');
        el.className = 'server-entry';
        if (saved.id === this.selectedServerId) el.classList.add('selected');
        
        let iconSrc = "/grass_block_side_16x16.png";
        if (onlineData && onlineData.iconUrl) {
            iconSrc = onlineData.iconUrl;
        } else if (saved.iconUrl) {
            iconSrc = saved.iconUrl; 
        }

        el.innerHTML = `
           <div class="server-icon"><img src="${iconSrc}" style="width:100%; height:100%; object-fit: cover; image-rendering: auto;"></div>
           <div class="server-info">
              <div class="server-name">${saved.name}</div>
              <div class="server-motd">${motd}</div>
              <div style="font-size: 10px; color: #555;">${saved.id}</div>
           </div>
           <div class="server-status">
              <div style="color: ${statusColor};">${ping}</div>
              <div style="color: #aaa;">${onlineData ? "Online" : "Offline"}</div>
           </div>
        `;
        
        el.onclick = () => {
           this.selectedServerId = saved.id;
           this.renderList();
        };
        
        el.ondblclick = () => {
           if (onlineData) {
              if (this.onJoin) this.onJoin(onlineData.id, onlineData.seed);
           }
        };
        
        // Tooltip logic
        el.addEventListener('mousemove', (e) => {
           if (playerCount > 0) {
              this.tooltip.style.display = 'block';
              this.tooltip.style.left = (e.clientX + 15) + 'px';
              this.tooltip.style.top = (e.clientY + 15) + 'px';
              this.tooltip.innerHTML = `<span style="color:#55ffff">${playerCount} players online:</span>\n${playerNames.join('\n')}`;
           } else {
              this.tooltip.style.display = 'none';
           }
        });
        
        el.addEventListener('mouseleave', () => {
           this.tooltip.style.display = 'none';
        });
        
        this.list.appendChild(el);
     });
     
     // Update buttons
     if (this.selectedServerId) {
        this.btnJoin.style.color = '#fff';
        this.btnEdit.style.color = '#fff';
        this.btnDelete.style.color = '#fff';
        this.btnAdmin.style.color = '#fff';
     } else {
        this.btnJoin.style.color = '#a0a0a0';
        this.btnEdit.style.color = '#a0a0a0';
        this.btnDelete.style.color = '#a0a0a0';
        this.btnAdmin.style.color = '#a0a0a0';
     }
  }
}

class SkinMenu {
  static init() {
    this.menu = document.getElementById('skin-settings-menu');
    this.preview = document.getElementById('skin-preview');
    this.placeholder = document.getElementById('skin-preview-placeholder');
    this.input = document.getElementById('skin-upload-input');
    this.btnSave = document.getElementById('btn-skin-save');
    this.btnDone = document.getElementById('btn-skin-done');
    
    this.currentSkinUrl = null;
    this.pendingFile = null;

    this.input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.pendingFile = file;
        const reader = new FileReader();
        reader.onload = (evt) => {
           this.preview.src = evt.target.result;
           this.preview.style.display = 'block';
           this.placeholder.style.display = 'none';
           this.btnSave.style.display = 'flex';
        };
        reader.readAsDataURL(file);
      }
    });
    
    this.btnSave.addEventListener('click', async () => {
       if (this.pendingFile) {
          this.btnSave.innerText = "Uploading...";
          try {
             const url = await window.websim.upload(this.pendingFile);
             localStorage.setItem('mc_skin_url', url);
             if (this.gameInstance) {
                this.gameInstance.skinUrl = url;
                // Update local player mesh
                if (this.gameInstance.player && this.gameInstance.player.mesh) {
                   const texLoader = new THREE.TextureLoader();
                   texLoader.load(url, (tex) => {
                      tex.colorSpace = THREE.SRGBColorSpace;
                      tex.magFilter = THREE.NearestFilter;
                      tex.minFilter = THREE.NearestFilter;
                      tex.flipY = false;
                      this.gameInstance.player.mesh.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.map = tex;
                            child.material.needsUpdate = true;
                        }
                      });
                   });
                }
             }
             this.currentSkinUrl = url;
             
             // Update FP hand explicitly if game is active
             if (this.gameInstance && this.gameInstance.player) {
                this.gameInstance.applySkinToModel(this.gameInstance.player.mesh, url);
             }

             this.btnSave.style.display = 'none';
             alert("Skin saved!");
          } catch(e) {
             console.error(e);
             alert("Failed to upload skin.");
          } finally {
             this.btnSave.innerText = "Save Skin";
          }
       }
    });

    this.btnDone.addEventListener('click', () => {
       this.close();
    });
  }
  
  static open(onClose, gameInstance) {
     if (!this.menu) this.init();
     this.onClose = onClose;
     this.gameInstance = gameInstance;
     this.menu.style.display = 'flex';
     
     const existing = localStorage.getItem('mc_skin_url');
     // Use existing or default to steve
     this.preview.src = existing || '/steve.png';
     this.preview.style.display = 'block';
     this.placeholder.style.display = 'none';
     
     this.input.value = "";
     this.btnSave.style.display = 'none';
     this.pendingFile = null;
  }
  
  static close() {
     this.menu.style.display = 'none';
     if (this.onClose) this.onClose();
  }
}

class OptionsMenu {
  static init() {
    this.menu = document.getElementById('options-menu');
    this.slider = document.getElementById('fov-slider');
    this.label = document.getElementById('fov-label');
    this.btnDone = document.getElementById('btn-options-done');
    
    this.controlsMenu = document.getElementById('controls-list-menu');
    this.videoMenu = document.getElementById('video-settings-menu');
    this.musicMenu = document.getElementById('music-settings-menu');
    
    this.btnVideo = document.getElementById('btn-opt-video');
    this.btnControls = document.getElementById('btn-opt-controls');
    this.btnMusic = document.getElementById('btn-opt-music');
    this.btnDifficulty = document.getElementById('btn-opt-difficulty');
    this.btnOnline = document.getElementById('btn-opt-online');
    this.btnDebugs = document.getElementById('btn-opt-debugs');
    
    // Replace "Skin Customization..." generic button logic
    const allBtns = Array.from(document.querySelectorAll('.mc-button'));
    const skinBtn = allBtns.find(b => b.innerText.includes('Skin Customization'));
    if (skinBtn) {
       skinBtn.style.color = '#fff';
       skinBtn.style.cursor = 'pointer';
       skinBtn.onclick = () => {
         this.menu.style.display = 'none';
         SkinMenu.open(() => {
            this.menu.style.display = 'flex';
         }, this.gameInstance);
       };
    }
    
    this.btnControlsDone = document.getElementById('btn-controls-done');
    this.btnVideoDone = document.getElementById('btn-video-done');
    this.btnVideoFog = document.getElementById('btn-video-fog');
    this.btnMusicDone = document.getElementById('btn-music-done');

    this.onClose = null;
    this.gameInstance = null;

    // Initialize values
    this.slider.value = SETTINGS.fov;
    this.updateLabel(SETTINGS.fov);
    this.updateDifficultyBtn();
    this.updateDebugBtn();

    // Listeners
    this.slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      SETTINGS.fov = val;
      this.updateLabel(val);
      if (this.gameInstance) this.gameInstance.updateSettings();
      saveSettings();
    });

    this.btnDifficulty.addEventListener('click', () => {
      SETTINGS.difficulty = (SETTINGS.difficulty + 1) % 4;
      this.updateDifficultyBtn();
      saveSettings();
    });

    this.btnDebugs.addEventListener('click', () => {
       SETTINGS.debugMode = !SETTINGS.debugMode;
       this.updateDebugBtn();
       saveSettings();
    });

    this.btnDone.addEventListener('click', () => this.close());
    
    // Sub Menus
    this.btnControls.addEventListener('click', () => {
       this.controlsMenu.style.display = 'flex';
    });
    this.btnControlsDone.addEventListener('click', () => {
       this.controlsMenu.style.display = 'none';
    });
    
    this.btnVideo.addEventListener('click', () => {
       this.videoMenu.style.display = 'flex';
       this.updateVideoBtn();
    });
    this.btnVideoDone.addEventListener('click', () => {
       this.videoMenu.style.display = 'none';
    });
    
    this.btnVideoFog.addEventListener('click', () => {
       SETTINGS.fog = !SETTINGS.fog;
       this.updateVideoBtn();
       if (this.gameInstance) this.gameInstance.updateSettings();
       saveSettings();
       const debugCheck = document.getElementById('fog-toggle');
       if (debugCheck) debugCheck.checked = SETTINGS.fog;
    });

    // Render Distance Slider
    const rdSlider = document.getElementById('render-dist-slider');
    const rdLabel = document.getElementById('render-dist-label');
    
    rdSlider.value = SETTINGS.renderDistance;
    rdLabel.innerText = `Render Distance: ${SETTINGS.renderDistance} Chunks`;
    
    rdSlider.addEventListener('input', (e) => {
       const val = parseInt(e.target.value);
       SETTINGS.renderDistance = val;
       rdLabel.innerText = `Render Distance: ${val} Chunks`;
       if (this.gameInstance) this.gameInstance.updateSettings();
       saveSettings();
    });

    // Music Menu
    this.btnMusic.addEventListener('click', () => {
      this.musicMenu.style.display = 'flex';
      this.updateMusicSliders();
    });
    this.btnMusicDone.addEventListener('click', () => {
      this.musicMenu.style.display = 'none';
    });
    
    this.setupMusicSliders();
  }

  static setupMusicSliders() {
     const setupSlider = (id, settingKey, labelId, labelPrefix) => {
       const slider = document.getElementById(id);
       const label = document.getElementById(labelId);
       
       slider.addEventListener('input', (e) => {
         const val = parseInt(e.target.value);
         SETTINGS[settingKey] = val / 100.0;
         label.innerText = `${labelPrefix}: ${val}%`;
         if (this.gameInstance) this.gameInstance.updateSettings();
         saveSettings();
       });
     };

     setupSlider('master-vol-slider', 'masterVolume', 'master-vol-label', 'Master Volume');
     setupSlider('music-vol-slider', 'musicVolume', 'music-vol-label', 'Music');
     setupSlider('sound-vol-slider', 'soundVolume', 'sound-vol-label', 'Sound');
  }

  static updateMusicSliders() {
     document.getElementById('master-vol-slider').value = Math.floor(SETTINGS.masterVolume * 100);
     document.getElementById('master-vol-label').innerText = `Master Volume: ${Math.floor(SETTINGS.masterVolume * 100)}%`;
     
     document.getElementById('music-vol-slider').value = Math.floor(SETTINGS.musicVolume * 100);
     document.getElementById('music-vol-label').innerText = `Music: ${Math.floor(SETTINGS.musicVolume * 100)}%`;

     document.getElementById('sound-vol-slider').value = Math.floor(SETTINGS.soundVolume * 100);
     document.getElementById('sound-vol-label').innerText = `Sound: ${Math.floor(SETTINGS.soundVolume * 100)}%`;
  }
  
  static updateVideoBtn() {
    this.btnVideoFog.innerText = `Fog: ${SETTINGS.fog ? 'ON' : 'OFF'}`;
  }

  static updateDifficultyBtn() {
    this.btnDifficulty.innerText = `Difficulty: ${DIFFICULTIES[SETTINGS.difficulty]}`;
  }

  static updateDebugBtn() {
    if (this.btnDebugs) {
       this.btnDebugs.innerText = `Debugs: ${SETTINGS.debugMode ? 'ON' : 'OFF'}`;
    }
  }

  static updateLabel(val) {
    if (val === 70) this.label.innerText = "FOV: Normal";
    else if (val === 110) this.label.innerText = "FOV: Quake Pro";
    else this.label.innerText = `FOV: ${val}`;
  }

  static open(onCloseCallback, gameInstance = null, forceTransparent = false) {
    if (!this.menu) this.init();
    this.onClose = onCloseCallback;
    this.gameInstance = gameInstance;
    
    this.menu.style.display = 'flex';
    
    // Difficulty visible in-game, Online visible in main menu
    if (gameInstance) {
       this.btnDifficulty.style.display = 'flex';
       this.btnOnline.style.display = 'none';
    } else {
       this.btnDifficulty.style.display = 'none';
       this.btnOnline.style.display = 'flex';
    }
    
    // Background style
    if (gameInstance || forceTransparent) {
      this.menu.classList.remove('dirt-bg');
      this.menu.classList.add('transparent-bg');
    } else {
      this.menu.classList.add('dirt-bg');
      this.menu.classList.remove('transparent-bg');
    }
  }

  static close() {
    this.menu.style.display = 'none';
    if (this.onClose) this.onClose();
  }
}

class RecipeCreator {
  constructor() {
    this.container = document.getElementById('recipe-creator-menu');
    this.gridEl = document.getElementById('rc-grid');
    this.resultEl = document.getElementById('rc-result');
    this.paletteEl = document.getElementById('rc-palette');
    this.statusEl = document.getElementById('rc-status');
    this.selectedLabel = document.getElementById('rc-selected-item');
    this.countInput = document.getElementById('rc-count');
    
    this.recipes = [];
    this.grid = new Array(9).fill(null);
    this.result = null;
    this.selectedItemType = null;
    
    this.BLOCK_ICONS = {
      [BLOCK_TYPES.GRASS_BLOCK]: '/Grass_Block.png',
      [BLOCK_TYPES.DIRT]: '/Dirt.png',
      [BLOCK_TYPES.STONE]: '/Stone (1).png',
      [BLOCK_TYPES.COBBLESTONE]: '/Cobblestone.png',
      [BLOCK_TYPES.OAK_LOG]: '/Oak_Log.png',
      [BLOCK_TYPES.OAK_PLANKS]: '/Oak_Planks.png',
      [BLOCK_TYPES.OAK_LEAVES]: '/Oak_Leaves.png',
      [BLOCK_TYPES.CRAFTING_TABLE]: '/Crafting_Table.png',
      [BLOCK_TYPES.FURNACE]: '/Furnace.png',
      [BLOCK_TYPES.DEEPSLATE]: '/deepslate_16x16.png',
      [BLOCK_TYPES.SAND]: '/Sand.png',
      [BLOCK_TYPES.WOODEN_AXE]: '/wooden_axe.png',
      [BLOCK_TYPES.WOODEN_PICKAXE]: '/wooden_pickaxe.png',
      [BLOCK_TYPES.WOODEN_SHOVEL]: '/wooden_shovel.png',
      [BLOCK_TYPES.WOODEN_HOE]: '/wooden_hoe.png',
      [BLOCK_TYPES.WOODEN_SWORD]: '/wooden_sword.png',
      [BLOCK_TYPES.STICK]: '/stick.png',
      [BLOCK_TYPES.STONE_AXE]: '/stone_axe.png',
      [BLOCK_TYPES.STONE_PICKAXE]: '/stone_pickaxe.png',
      [BLOCK_TYPES.STONE_SHOVEL]: '/stone_shovel.png',
      [BLOCK_TYPES.STONE_HOE]: '/stone_hoe.png',
      [BLOCK_TYPES.STONE_SWORD]: '/stone_sword.png',
      [BLOCK_TYPES.IRON_AXE]: '/iron_axe.png',
      [BLOCK_TYPES.IRON_PICKAXE]: '/iron_pickaxe.png',
      [BLOCK_TYPES.IRON_SHOVEL]: '/iron_shovel.png',
      [BLOCK_TYPES.IRON_HOE]: '/iron_hoe.png',
      [BLOCK_TYPES.IRON_SWORD]: '/iron_sword.png',
      [BLOCK_TYPES.GOLDEN_AXE]: '/golden_axe.png',
      [BLOCK_TYPES.GOLDEN_PICKAXE]: '/golden_pickaxe.png',
      [BLOCK_TYPES.GOLDEN_SHOVEL]: '/golden_shovel.png',
      [BLOCK_TYPES.GOLDEN_HOE]: '/golden_hoe.png',
      [BLOCK_TYPES.GOLDEN_SWORD]: '/golden_sword.png',
      [BLOCK_TYPES.DIAMOND_AXE]: '/diamond_axe.png',
      [BLOCK_TYPES.DIAMOND_PICKAXE]: '/diamond_pickaxe.png',
      [BLOCK_TYPES.DIAMOND_SHOVEL]: '/diamond_shovel.png',
      [BLOCK_TYPES.DIAMOND_HOE]: '/diamond_hoe.png',
      [BLOCK_TYPES.DIAMOND_SWORD]: '/diamond_sword.png',
      [BLOCK_TYPES.NETHERITE_AXE]: '/netherite_axe.png',
      [BLOCK_TYPES.NETHERITE_PICKAXE]: '/netherite_pickaxe.png',
      [BLOCK_TYPES.NETHERITE_SHOVEL]: '/netherite_shovel.png',
      [BLOCK_TYPES.NETHERITE_HOE]: '/netherite_hoe.png',
      [BLOCK_TYPES.NETHERITE_SWORD]: '/netherite_sword.png',
      [BLOCK_TYPES.RAW_IRON]: '/raw_iron.png',
      [BLOCK_TYPES.IRON_INGOT]: '/iron_ingot.png',
      [BLOCK_TYPES.RAW_GOLD]: '/raw_gold.png',
      [BLOCK_TYPES.GOLD_INGOT]: '/gold_ingot.png',
      [BLOCK_TYPES.COAL]: '/coal.png',
      [BLOCK_TYPES.DIAMOND]: '/diamond.png',
      [BLOCK_TYPES.PLACE_WAND]: '/stick.png'
    };

    this.initUI();
    this.setupListeners();
  }

  initUI() {
    // Build Grid
    this.gridEl.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'rc-slot';
      slot.dataset.index = i;
      slot.onclick = () => this.onGridClick(i);
      this.gridEl.appendChild(slot);
    }
    
    // Build Palette
    this.paletteEl.innerHTML = '';
    // Add "Eraser" / Air
    const airSlot = document.createElement('div');
    airSlot.className = 'rc-slot';
    airSlot.style.border = '2px solid red';
    airSlot.innerText = 'X';
    airSlot.style.color = 'red';
    airSlot.style.fontWeight = 'bold';
    airSlot.onclick = () => this.selectPaletteItem(null);
    this.paletteEl.appendChild(airSlot);

    Object.keys(this.BLOCK_ICONS).forEach(typeStr => {
      const type = parseInt(typeStr);
      const slot = document.createElement('div');
      slot.className = 'rc-slot';
      const img = document.createElement('img');
      img.src = this.BLOCK_ICONS[type];
      slot.appendChild(img);
      slot.onclick = () => this.selectPaletteItem(type);
      this.paletteEl.appendChild(slot);
    });
    
    // Result Slot
    this.resultEl.onclick = () => {
      this.result = this.selectedItemType;
      this.updateSlot(this.resultEl, this.result);
    };
    
    // Furnace Input Slot
    this.furnaceInputEl = document.getElementById('rc-furnace-input');
    this.furnaceResultEl = document.getElementById('rc-furnace-result');
    this.furnaceInput = null;
    this.furnaceResult = null;
    
    this.furnaceInputEl.onclick = () => {
      this.furnaceInput = this.selectedItemType;
      this.updateSlot(this.furnaceInputEl, this.furnaceInput);
    };
    
    this.furnaceResultEl.onclick = () => {
      this.furnaceResult = this.selectedItemType;
      this.updateSlot(this.furnaceResultEl, this.furnaceResult);
    };
  }
  
  selectPaletteItem(type) {
    this.selectedItemType = type;
    if (type === null) {
      this.selectedLabel.innerText = "Selected: Clear";
      this.selectedLabel.style.color = '#ff5555';
    } else {
      // Find key name
      const name = Object.keys(BLOCK_TYPES).find(k => BLOCK_TYPES[k] === type);
      this.selectedLabel.innerText = "Selected: " + name;
      this.selectedLabel.style.color = '#ffff55';
    }
  }
  
  onGridClick(index) {
    this.grid[index] = this.selectedItemType;
    const slot = this.gridEl.children[index];
    this.updateSlot(slot, this.selectedItemType);
  }
  
  updateSlot(element, type) {
    element.innerHTML = '';
    if (type !== null && this.BLOCK_ICONS[type]) {
      const img = document.createElement('img');
      img.src = this.BLOCK_ICONS[type];
      element.appendChild(img);
    }
  }

  setupListeners() {
    document.getElementById('btn-rc-add').onclick = () => this.addRecipe();
    document.getElementById('btn-rc-add-furnace').onclick = () => this.addFurnaceRecipe();
    document.getElementById('btn-rc-download').onclick = () => this.downloadRecipes();
    document.getElementById('btn-rc-close').onclick = () => this.close();
    
    const opener = document.getElementById('btn-recipe-creator');
    if (opener) opener.onclick = () => this.open();
  }
  
  open() {
    this.container.style.display = 'flex';
  }
  
  close() {
    this.container.style.display = 'none';
  }
  
  addRecipe() {
    if (this.result === null) {
      alert("Please set a result item for the crafting recipe!");
      return;
    }
    
    const recipe = {
      type: 'crafting',
      pattern: [...this.grid],
      result: {
        type: this.result,
        count: parseInt(this.countInput.value) || 1
      }
    };
    
    this.recipes.push(recipe);
    this.statusEl.innerText = `Recipes: ${this.recipes.length}`;
    
    this.statusEl.style.color = '#55ff55';
    setTimeout(() => this.statusEl.style.color = '#aaa', 500);
  }
  
  addFurnaceRecipe() {
    if (this.furnaceInput === null || this.furnaceResult === null) {
      alert("Please set both input and result for furnace recipe!");
      return;
    }
    
    const recipe = {
      type: 'furnace',
      input: this.furnaceInput,
      result: {
        type: this.furnaceResult,
        count: 1 // Furnace usually 1-to-1 but data structure supports count
      }
    };
    
    this.recipes.push(recipe);
    this.statusEl.innerText = `Recipes: ${this.recipes.length}`;
    
    this.statusEl.style.color = '#ffaa55';
    setTimeout(() => this.statusEl.style.color = '#aaa', 500);
  }
  
  downloadRecipes() {
    if (this.recipes.length === 0) return;
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.recipes, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "custom_recipes.json");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }
}

class DonationMenu {
  static init() {
    this.menu = document.getElementById('donation-menu');
    this.msgInput = document.getElementById('donate-message');
    this.amtInput = document.getElementById('donate-amount');
    this.imgInput = document.getElementById('donate-image');
    this.btnConfirm = document.getElementById('btn-donate-confirm');
    this.btnCancel = document.getElementById('btn-donate-cancel');

    this.btnConfirm.onclick = async () => {
      const message = this.msgInput.value || "I'm supporting this project! Great work on the Voxel World.";
      const amount = parseInt(this.amtInput.value) || 100;
      const file = this.imgInput.files[0];
      
      this.btnConfirm.innerText = "Processing...";
      this.btnConfirm.classList.add('disabled');

      try {
        let imageUrls = [];
        if (file) {
          const url = await window.websim.upload(file);
          imageUrls.push(url);
        }

        window.websim.postComment({
          content: message,
          credits: Math.max(10, amount),
          images: imageUrls.length > 0 ? imageUrls : undefined
        });

        this.close();
      } catch (e) {
        console.error("Donation failed", e);
        alert("Failed to process donation setup.");
      } finally {
        this.btnConfirm.innerText = "Donate";
        this.btnConfirm.classList.remove('disabled');
      }
    };

    this.btnCancel.onclick = () => this.close();
  }

  static open(onClose) {
    if (!this.menu) this.init();
    this.onClose = onClose;
    this.menu.style.display = 'flex';
    this.msgInput.value = "";
    this.amtInput.value = "100";
    this.imgInput.value = "";
    this.msgInput.focus();
  }

  static close() {
    this.menu.style.display = 'none';
    if (this.onClose) this.onClose();
  }
}

const MOD_DATA = [
  { id: 'minecraft', name: 'Minecraft', author: 'Mojang Studios', version: GAME_VERSION, description: 'The base game.', icon: '/grass_block_side_16x16.png', isLibrary: false }
];

class MainMenu {
  constructor() {
    this.container = document.getElementById('main-menu');
    this.initCustomButtons();
    this.createMenu = document.getElementById('create-world-menu');
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingProgress = document.getElementById('loading-progress');
    this.panoramaContainer = document.getElementById('panorama-container');
    
    this.initAudio();
    this.initPanorama();
    this.setupListeners();
    this.recipeCreator = new RecipeCreator();
    
    this.selectedDifficulty = 2; // Default Normal

    // Mod Filtering State
    this.modSortAsc = true;
    this.showLibraries = false;
    this.selectedModId = 'minecraft';
    this.modSearchQuery = '';
  }

  initAudio() {
    this.clickSound = new Audio('/click.ogg');
    // Disable menu background music: don't create or play this.bgm
    this.bgm = null;
  }

  playRandomMusic() {
    // Menu music disabled - no-op
  }

  playClick() {
    if (this.clickSound) {
      this.clickSound.currentTime = 0;
      this.clickSound.play().catch(() => {});
    }
  }

  async initCustomButtons() {
    const img = new Image();
    img.src = '/UI_Buttons.png';
    try {
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 60;
      canvas.height = 20;
      const ctx = canvas.getContext('2d');

      const generateState = (colX) => {
        ctx.clearRect(0, 0, 60, 20);
        
        let leftY, centerY, rightY;
        if (colX === 45) {
          // Normal state column is inconsistent in the provided asset JSON:
          // button1=45, button2=1, button3=23
          leftY = 45;
          centerY = 1;
          rightY = 23;
        } else {
          // Others follow button1t=1, button2t=23, button3t=45
          leftY = 1;
          centerY = 23;
          rightY = 45;
        }

        // Draw Left
        ctx.drawImage(img, colX, leftY, 20, 20, 0, 0, 20, 20);
        // Draw Center
        ctx.drawImage(img, colX, centerY, 20, 20, 20, 0, 20, 20);
        // Draw Right
        ctx.drawImage(img, colX, rightY, 20, 20, 40, 0, 20, 20);
        return canvas.toDataURL();
      };

      // Col mapping: 45:Normal, 1:Hover/Active, 23:Disabled
      const normalUrl = generateState(45);
      const hoverUrl = generateState(1);
      const disabledUrl = generateState(23);

      const style = document.createElement('style');
      style.innerHTML = `
        .mc-button.atlas-ready {
          border-image-source: url("${normalUrl}");
        }
        .mc-button.atlas-ready:hover {
          border-image-source: url("${hoverUrl}");
        }
        .mc-button.atlas-ready:disabled, 
        .mc-button.atlas-ready.disabled,
        .mc-button.atlas-ready[style*="color: #a0a0a0"],
        .mc-button.atlas-ready[style*="color: rgb(160, 160, 160)"] {
          border-image-source: url("${disabledUrl}");
        }
      `;
      document.head.appendChild(style);

      // Apply class to all existing and future buttons
      const applyClass = () => {
        document.querySelectorAll('.mc-button').forEach(btn => btn.classList.add('atlas-ready'));
      };
      applyClass();
      // Periodically check for new buttons (menus opening)
      setInterval(applyClass, 500);

    } catch (e) {
      console.error("Failed to load button atlas", e);
    }
  }

  initPanorama() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.panoramaContainer.appendChild(this.renderer.domElement);

    const loader = new THREE.TextureLoader();
    const textures = [
      loader.load('/panorama_1.png'),
      loader.load('/panorama_3.png'),
      loader.load('/panorama_4.png'),
      loader.load('/panorama_4.png'),
      loader.load('/panorama_2.png'),
      loader.load('/panorama_1.png')
    ];
    
    const geometry = new THREE.BoxGeometry(100, 100, 100);
    geometry.scale(-1, 1, 1);
    
    const materials = textures.map(t => new THREE.MeshBasicMaterial({ map: t }));
    const cube = new THREE.Mesh(geometry, materials);
    this.scene.add(cube);
    
    this.camera.position.set(0, 0, 0);
    this.rotationSpeed = 0.00015;
    
    this.active = true;
    this.animate();
    
    window.addEventListener('resize', () => {
      if (!this.active) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  animate() {
    if (!this.active) return;
    requestAnimationFrame(() => this.animate());
    
    this.camera.rotation.y += this.rotationSpeed;
    
    this.renderer.render(this.scene, this.camera);
  }

  renderModList() {
    const container = document.getElementById('mod-list-container');
    if (!container) return;
    container.innerHTML = '';

    let filtered = MOD_DATA.filter(mod => {
      const matchesSearch = mod.name.toLowerCase().includes(this.modSearchQuery.toLowerCase());
      const matchesLib = this.showLibraries || !mod.isLibrary;
      return matchesSearch && matchesLib;
    });

    filtered.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (this.modSortAsc) return nameA < nameB ? -1 : 1;
      else return nameA > nameB ? -1 : 1;
    });

    filtered.forEach(mod => {
      const entry = document.createElement('div');
      entry.className = 'mod-entry' + (this.selectedModId === mod.id ? ' selected' : '');
      entry.innerHTML = `
        <img src="${mod.icon}" class="mod-entry-icon">
        <div class="mod-entry-info">
          <div class="mod-entry-name">${mod.name} <span style="color: #777;">${mod.id}</span></div>
          <div class="mod-entry-desc">${mod.description}</div>
        </div>
      `;
      entry.onclick = () => {
        this.selectedModId = mod.id;
        this.renderModList();
        this.updateModDetails(mod);
      };
      container.appendChild(entry);
    });

    // Handle case where selection is filtered out
    const currentMod = filtered.find(m => m.id === this.selectedModId) || filtered[0];
    if (currentMod) this.updateModDetails(currentMod);
  }

  updateModDetails(mod) {
    const details = document.querySelector('.mod-details');
    if (!details || !mod) return;

    details.innerHTML = `
      <div class="mod-details-header">
        <div class="mod-details-header-left">
          <img src="${mod.icon}" class="mod-details-icon">
          <div class="mod-details-title">
            <div class="mod-details-name">${mod.name} <span style="color: #777;">${mod.id}</span></div>
            <div class="mod-details-meta">
              v${mod.version}<br>
              By ${mod.author}
            </div>
          </div>
        </div>
        <div class="mc-button small" id="btn-mod-config-dynamic" style="width: 180px; margin-bottom: 0; font-size: 12px; height: 32px;">Configuration</div>
      </div>
      <div class="mod-details-body">
        ${mod.description}${mod.isLibrary ? '<br><br><span style="color:#55FFFF;">[Library Mod]</span>' : ''}
      </div>
    `;

    const configBtn = document.getElementById('btn-mod-config-dynamic');
    if (configBtn) {
      configBtn.onclick = () => {
        this.playClick();
        if (mod.id === 'minecraft') {
          document.getElementById('mod-menu').style.display = 'none';
          OptionsMenu.open(() => {
            document.getElementById('mod-menu').style.display = 'flex';
          }, null, true);
        }
      };
    }
  }

  setupListeners() {
    const modsBtn = document.getElementById('btn-mods');
    const modDoneBtn = document.getElementById('btn-mod-done');
    const modMenu = document.getElementById('mod-menu');
    const modSearchInput = document.getElementById('mod-search-input');
    const modFilterBtn = document.getElementById('btn-mod-filter');
    const modFilterPopup = document.getElementById('mod-filter-popup');

    if (modsBtn) {
      modsBtn.onclick = () => {
        this.container.style.display = 'none';
        modMenu.style.display = 'flex';
        this.renderModList();
      };
    }

    if (modDoneBtn) {
      modDoneBtn.onclick = () => {
        modMenu.style.display = 'none';
        modFilterPopup.style.display = 'none';
        this.container.style.display = 'flex';
      };
    }

    const modEditorBtn = document.getElementById('btn-mod-editor');
    if (modEditorBtn) {
      modEditorBtn.onclick = () => this.playClick();
    }

    const modMarketplaceBtn = document.getElementById('btn-mod-marketplace');
    if (modMarketplaceBtn) {
      modMarketplaceBtn.onclick = () => this.playClick();
    }

    if (modSearchInput) {
      modSearchInput.oninput = (e) => {
        this.modSearchQuery = e.target.value;
        this.renderModList();
      };
    }

    if (modFilterBtn) {
      modFilterBtn.onclick = () => {
        this.playClick();
        modFilterPopup.style.display = modFilterPopup.style.display === 'flex' ? 'none' : 'flex';
      };
    }

    const btnModSort = document.getElementById('btn-mod-sort');
    if (btnModSort) {
      btnModSort.onclick = () => {
        this.playClick();
        this.modSortAsc = !this.modSortAsc;
        btnModSort.innerText = `Sort: ${this.modSortAsc ? 'A-Z' : 'Z-A'}`;
        this.renderModList();
      };
    }

    const btnModToggleLibs = document.getElementById('btn-mod-toggle-libs');
    if (btnModToggleLibs) {
      btnModToggleLibs.onclick = () => {
        this.playClick();
        this.showLibraries = !this.showLibraries;
        btnModToggleLibs.innerText = `Libraries: ${this.showLibraries ? 'Shown' : 'Hidden'}`;
        this.renderModList();
      };
    }

    const btnModFilterDone = document.getElementById('btn-mod-filter-done');
    if (btnModFilterDone) {
      btnModFilterDone.onclick = () => {
        this.playClick();
        modFilterPopup.style.display = 'none';
      };
    }

    const singlePlayerBtn = document.getElementById('btn-singleplayer');
    const createWorldBtn = document.getElementById('btn-create-world');
    const cancelBtn = document.getElementById('btn-cancel-create');
    const diffBtn = document.getElementById('btn-create-difficulty');
    
    document.querySelectorAll('.mc-button').forEach(btn => {
      btn.addEventListener('mousedown', () => this.playClick());
    });
    
    // Options Button in Main Menu
    const buttons = Array.from(this.container.querySelectorAll('.mc-button'));
    const optionsBtn = buttons.find(b => b.innerText.includes('Options'));
    const multiplayerBtn = buttons.find(b => b.innerText.includes('Multiplayer'));
    const donateBtn = document.getElementById('btn-donate');

    if (donateBtn) {
      donateBtn.addEventListener('click', () => {
        this.playClick();
        this.container.style.display = 'none';
        DonationMenu.open(() => {
          this.container.style.display = 'flex';
        });
      });
    }
    
    if (optionsBtn) {
       optionsBtn.style.color = '#fff'; 
       optionsBtn.style.cursor = 'pointer';
       optionsBtn.addEventListener('click', () => {
         this.container.style.display = 'none';
         OptionsMenu.open(() => {
           this.container.style.display = 'flex';
         }, null, true);
       });
    }

    if (multiplayerBtn) {
       multiplayerBtn.style.color = '#fff';
       multiplayerBtn.style.cursor = 'pointer';
       multiplayerBtn.addEventListener('click', () => {
          this.container.style.display = 'none';
          MultiplayerMenu.open(() => {
             this.container.style.display = 'flex';
          }, (serverId, serverSeed) => {
             this.startGame(serverSeed, this.selectedDifficulty, serverId);
          });
       });
    }

    if (singlePlayerBtn) {
        singlePlayerBtn.addEventListener('click', () => {
          this.container.style.display = 'none';
          this.createMenu.style.display = 'flex';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          this.createMenu.style.display = 'none';
          this.container.style.display = 'flex';
          this.active = true;
          this.animate();
        });
    }

    if (diffBtn) {
        diffBtn.addEventListener('click', () => {
          this.selectedDifficulty = (this.selectedDifficulty + 1) % 4;
          diffBtn.innerText = `Difficulty: ${DIFFICULTIES[this.selectedDifficulty]}`;
        });
    }

    if (createWorldBtn) {
        createWorldBtn.addEventListener('click', () => {
          const seed = document.getElementById('world-seed-input').value;
          this.startGame(seed || Math.random().toString(), this.selectedDifficulty);
        });
    }
  }

  startGame(seed, difficulty, serverId = null) {
    try {
      document.documentElement.requestFullscreen().catch(e => {
        console.log("Fullscreen blocked or not supported", e);
      });
    } catch (e) {}

    this.active = false; 
    this.createMenu.style.display = 'none';
    this.container.style.display = 'none';
    MultiplayerMenu.close(); // Ensure mp menu is closed if launching from there
    this.loadingScreen.style.display = 'flex';
    this.loadingProgress.style.width = '0%';
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2; 
      if (progress > 70 && Math.random() > 0.5) progress -= 1; 
      this.loadingProgress.style.width = Math.min(progress, 100) + '%';
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          this.finishLoading(seed, difficulty, serverId);
        }, 200);
      }
    }, 20);
  }

  finishLoading(seed, difficulty, serverId) {
    this.loadingScreen.style.display = 'none';
    document.body.classList.remove('in-menu');
    
    this.renderer.dispose();
    this.panoramaContainer.innerHTML = '';
    
    new Game(seed, this.bgm, () => this.returnToMenu(), difficulty, serverId);
  }

  returnToMenu() {
    // Re-initialize menu
    this.container.style.display = 'flex';
    this.createMenu.style.display = 'none';
    this.loadingScreen.style.display = 'none';
    document.body.classList.add('in-menu');
    
    // Re-init panorama
    this.initPanorama();
    this.active = true;
    this.animate();
    
    // Reset Game Instance in Options if needed?
    // OptionsMenu keeps reference to gameInstance, but that instance is now destroyed.
    // We should clear it to prevent calling methods on dead object.
    OptionsMenu.gameInstance = null;
    
    // Exit fullscreen optionally? Usually games keep fullscreen.
  }
}

new MainMenu();