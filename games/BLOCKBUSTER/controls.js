import * as THREE from 'three';
import * as nipplejsPkg from 'nipplejs';
import { BLOCK_TYPES } from './world.js';

const nipplejs = nipplejsPkg.default || nipplejsPkg;

export class Controls {
  constructor(camera, canvas, player, world, chat, onTogglePause) {
    this.camera = camera;
    this.canvas = canvas;
    this.player = player;
    this.world = world;
    this.chat = chat;
    this.onTogglePause = onTogglePause;
    
    this.keys = {};
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isMobile = 'ontouchstart' in window;
    
    // Full inventory: 
    // 0-8: Hotbar
    // 9-35: Storage
    // 36-39: Armor
    // 40: Offhand
    // 41-44: Inventory Crafting (2x2)
    // 45: Inventory Crafting Result
    // 50-58: Table Crafting (3x3)
    // 59: Table Result
    // 60: Furnace Input
    // 61: Furnace Fuel
    // 62: Furnace Result
    this.inventory = new Array(70).fill(null); 
    this.selectedSlot = 0;

    this.BLOCK_ICONS = {
      [BLOCK_TYPES.STONE]: '/Stone (1).png',
      [BLOCK_TYPES.DIRT]: '/Dirt.png',
      [BLOCK_TYPES.GRASS_BLOCK]: '/Grass_Block.png',
      [BLOCK_TYPES.SAND]: '/Sand.png',
      [BLOCK_TYPES.COBBLESTONE]: '/Cobblestone.png',
      [BLOCK_TYPES.OAK_LOG]: '/Oak_Log.png',
      [BLOCK_TYPES.OAK_PLANKS]: '/Oak_Planks.png',
      [BLOCK_TYPES.OAK_LEAVES]: '/Oak_Leaves.png',
      [BLOCK_TYPES.CRAFTING_TABLE]: '/Crafting_Table.png',
      [BLOCK_TYPES.FURNACE]: '/Furnace.png',
      [BLOCK_TYPES.DEEPSLATE]: '/deepslate_16x16.png',
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
      [BLOCK_TYPES.STRUCTURE_WAND]: '/stick.png',
      [BLOCK_TYPES.PLACE_WAND]: '/stick.png',
      [BLOCK_TYPES.WATER_BUCKET]: '/water_bucket.png',
      [BLOCK_TYPES.BUCKET]: '/bucket.png',
      [BLOCK_TYPES.GRASS]: '/short_grass.png',
      [BLOCK_TYPES.TALL_GRASS]: '/tall_grass_bottom.png',
      [BLOCK_TYPES.TALL_GRASS_TOP]: '/tall_grass_top.png',
      [BLOCK_TYPES.BIRCH_LOG]: '/birch_log.png',
      [BLOCK_TYPES.BIRCH_PLANKS]: '/birch_planks.png',
      [BLOCK_TYPES.BIRCH_LEAVES]: '/birch_leaves.png',
      [BLOCK_TYPES.DANDELION]: this.world.textures[BLOCK_TYPES.DANDELION],
      [BLOCK_TYPES.POPPY]: this.world.textures[BLOCK_TYPES.POPPY],
      [BLOCK_TYPES.OXEYE_DAISY]: this.world.textures[BLOCK_TYPES.OXEYE_DAISY],
      [BLOCK_TYPES.CORNFLOWER]: this.world.textures[BLOCK_TYPES.CORNFLOWER],
      [BLOCK_TYPES.RED_TULIP]: this.world.textures[BLOCK_TYPES.RED_TULIP],
      [BLOCK_TYPES.ORANGE_TULIP]: this.world.textures[BLOCK_TYPES.ORANGE_TULIP],
      [BLOCK_TYPES.WHITE_TULIP]: this.world.textures[BLOCK_TYPES.WHITE_TULIP],
      [BLOCK_TYPES.PINK_TULIP]: this.world.textures[BLOCK_TYPES.PINK_TULIP],
      [BLOCK_TYPES.FIRE]: '/fire_0.png'
    };
    this.slotCountElements = [];
    this.slotIconElements = [];

    this.CRAFTING_INVENTORY = {
      grid: [41, 42, 43, 44],
      result: 45
    };
    this.CRAFTING_TABLE = {
      grid: [50, 51, 52, 53, 54, 55, 56, 57, 58],
      result: 59
    };

    // Drag and Drop state
    this.cursorItem = null; // { type, count }
    this.mobileRightClickMode = false;
    this.dragElement = document.getElementById('drag-item');
    this.dragIcon = document.getElementById('drag-item-icon');
    this.dragCount = document.getElementById('drag-item-count');
    this.tooltip = document.getElementById('item-tooltip');
    this.itemNameDisplay = document.getElementById('item-name-display');
    this.itemNameTimeout = null;

    this.isMining = false;
    this.miningStartTime = 0;
    this.miningTarget = null;
    this.lastParticleTime = 0;
    
    // blockBreakTimes replaced by getMiningDuration method
    // this.breakIndicator = document.getElementById('break-indicator');

    // Load destroy stages
    this.destroyTextures = [];
    const loader = new THREE.TextureLoader();
    const stages = [0, 2, 3, 4, 5, 7, 8, 9];
    stages.forEach(i => {
      const tex = loader.load(`/destroy_stage_${i}.png`);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.destroyTextures.push(tex);
    });

    this.breakingMaterial = new THREE.MeshBasicMaterial({
      map: this.destroyTextures[0],
      transparent: true,
      blending: THREE.MultiplyBlending,
      alphaTest: 0.5,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.FrontSide
    });

    const breakGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.breakingMesh = new THREE.Mesh(breakGeo, this.breakingMaterial);
    this.breakingMesh.visible = false;
    this.world.scene.add(this.breakingMesh);

    // Add selection highlight
    const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
    this.highlightMesh = new THREE.LineSegments(highlightEdges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.highlightMesh.visible = false;
    this.world.scene.add(this.highlightMesh);

    this.hudVisible = true;

    // Structure Wand Selection Box
    this.structurePos1 = null;
    this.structurePos2 = null;
    this.loadedStructure = null;
    this.selectionMesh = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xFF00FF, depthTest: false })
    );
    this.selectionMesh.visible = false;
    this.world.scene.add(this.selectionMesh);

    this.setupHotbar();
    this.setupKeyboard();
    this.setupMouse();
    this.setupTouch();
    
    if (this.isMobile) {
      this.setupJoystick();
    }

    this.currentUI = null; // 'inventory', 'crafting', 'furnace', 'structure'
    this.uiContainers = {
      inventory: document.getElementById('inventory-container'),
      crafting: document.getElementById('crafting-container'),
      furnace: document.getElementById('furnace-container'),
      structure: document.getElementById('structure-menu')
    };

    // Structure UI Listeners
    const btnSaveStruct = document.getElementById('btn-save-structure');
    const btnCancelStruct = document.getElementById('btn-cancel-structure');
    if (btnSaveStruct) btnSaveStruct.onclick = () => this.saveStructure();
    if (btnCancelStruct) btnCancelStruct.onclick = () => this.closeUI();
    
    // Furnace state
    this.furnaceState = {
      burnTime: 0,
      currentMaxBurn: 0,
      cookTime: 0,
      maxCookTime: 200 // 10 seconds at 20tps equivalent, but using time delta
    };

    // Custom recipes
    this.recipes = [];
    Promise.all([
      fetch('/wood_tool_recipes.json').then(r => r.json()),
      fetch('/gold_and_iron_tool_recipes.json').then(r => r.json()),
      fetch('/stone_tool_recipes.json').then(r => r.json()),
      fetch('/diamond_tool_recipes.json').then(r => r.json())
    ]).then(([woodRecipes, metalRecipes, stoneRecipes, diamondRecipes]) => {
      this.recipes = [...woodRecipes, ...metalRecipes, ...stoneRecipes, ...diamondRecipes];
    }).catch(e => console.error('Failed to load recipes:', e));

    // Fetch inventory layouts
    this.inventoryLayout = [];
    this.craftingLayout = []; 
    this.furnaceLayout = [];

    const loadLayout = (url) => fetch(url).then(r => r.json());

    Promise.all([
      loadLayout('/inventory.txt'),
      loadLayout('/crafting_table.txt'),
      loadLayout('/furnace.txt')
    ]).then(([inv, craft, furn]) => {
      this.inventoryLayout = inv;
      this.craftingLayout = craft;
      this.furnaceLayout = furn;
      
      // Initialize inventory window (others built on open)
      this.buildUI('inventory-window', this.inventoryLayout);
    }).catch(e => console.error("Failed to load layouts", e));

    this.vmActive = false;
    this.vmRenderer = null;
    this.vmScene = null;
    this.vmCamera = null;
    this.vmMesh = null;

    // Mobile inventory button
    const mobileInvBtn = document.getElementById('inv-button-mobile');
    if (mobileInvBtn) {
      mobileInvBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openUI('inventory');
      });
      mobileInvBtn.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        e.preventDefault(); 
        this.openUI('inventory');
      });
    }

    // Drag listener
    this.boundOnDragMove = (e) => this.onDragMove(e);
    this.boundOnTouchMove = (e) => {
       if (e.touches.length > 0) this.onDragMove(e.touches[0]);
    };
    window.addEventListener('mousemove', this.boundOnDragMove);
    window.addEventListener('touchmove', this.boundOnTouchMove);

    if (this.isMobile) {
      this.setupMobileUI();
    }
  }
  
  openUI(type) {
    if (this.currentUI === type) {
      this.closeUI();
      return;
    }
    
    this.closeUI();
    this.currentUI = type;
    
    if (type === 'inventory') {
      this.vmActive = true;
      requestAnimationFrame(() => this.renderViewModel());
    }
    
    // Reset points if opening structure menu manually? No, keep them.
    
    if (this.uiContainers[type]) {
      this.uiContainers[type].classList.add('visible');
      
      const closeBtn = document.getElementById('btn-close-inv');
      if (closeBtn && this.isMobile) closeBtn.style.display = 'flex';

      const mobileInvControls = document.getElementById('mobile-inv-controls');
      if (mobileInvControls && this.isMobile) mobileInvControls.style.display = 'flex';

      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.keys = {}; 
      this.isMining = false;
      this.updateBreakIndicator(0, null);

      if (type === 'structure') {
        const input = document.getElementById('structure-name-input');
        if (input) setTimeout(() => input.focus(), 100);
        
        const sizeInfo = document.getElementById('structure-size-info');
        if (sizeInfo && this.structurePos1 && this.structurePos2) {
           const minX = Math.min(this.structurePos1.x, this.structurePos2.x);
           const minY = Math.min(this.structurePos1.y, this.structurePos2.y);
           const minZ = Math.min(this.structurePos1.z, this.structurePos2.z);
           const maxX = Math.max(this.structurePos1.x, this.structurePos2.x);
           const maxY = Math.max(this.structurePos1.y, this.structurePos2.y);
           const maxZ = Math.max(this.structurePos1.z, this.structurePos2.z);
           
           const w = maxX - minX + 1;
           const h = maxY - minY + 1;
           const d = maxZ - minZ + 1;
           const volume = w * h * d;
           
           let color = '#ffff55';
           let warning = '';
           if (volume > 1000000) {
              color = '#ff5555';
              warning = '<br>WARNING: Selection too large to save!';
           }
           
           sizeInfo.style.color = color;
           sizeInfo.innerHTML = `Selection Size: ${w}x${h}x${d} (${volume} blocks)<br>Pos 1: ${this.structurePos1.x}, ${this.structurePos1.y}, ${this.structurePos1.z}<br>Pos 2: ${this.structurePos2.x}, ${this.structurePos2.y}, ${this.structurePos2.z}${warning}`;
        }
      }

      if (type === 'crafting') this.buildUI('crafting-window', this.craftingLayout);
      if (type === 'furnace') this.buildUI('furnace-window', this.furnaceLayout);
      this.updateInternalUI();
    }
  }

  closeUI() {
    if (this.currentUI) {
      this.hideTooltip();
      if (this.uiContainers[this.currentUI]) {
        this.uiContainers[this.currentUI].classList.remove('visible');
      }
      
      const closeBtn = document.getElementById('btn-close-inv');
      if (closeBtn) closeBtn.style.display = 'none';

      const mobileInvControls = document.getElementById('mobile-inv-controls');
      if (mobileInvControls) mobileInvControls.style.display = 'none';

      this.vmActive = false;
      this.currentUI = null;
      if (!this.isMobile && !this.chat.isOpen) {
        this.canvas.requestPointerLock();
      }

      // If holding an item, drop it? Or put back? For now, drop.
      if (this.cursorItem) {
        // Simple drop logic
        // this.cursorItem = null;
        // this.dragElement.style.display = 'none';
        // In real MC, it drops to ground. I'll just keep it on cursor for simplicity or delete it.
        // Let's return it to inventory if possible, else drop.
        this.addItem(this.cursorItem.type, this.cursorItem.count);
        this.cursorItem = null;
        this.dragElement.style.display = 'none';
      }
    }
  }

  setupHotbar() {
    const hotbar = document.getElementById('hotbar');
    hotbar.innerHTML = '';
    
    const selector = document.createElement('div');
    selector.id = 'selector';
    hotbar.appendChild(selector);
    
    this.slotIconElements = [];
    this.slotCountElements = [];

    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'hotbar-slot';
      slot.style.left = `calc((3px + ${i * 20}px) * var(--scale))`;
      
      const img = document.createElement('img');
      img.style.display = 'none';
      this.slotIconElements.push(img);
      slot.appendChild(img);

      const count = document.createElement('div');
      count.className = 'hotbar-count';
      count.innerText = '';
      count.style.display = 'none';
      this.slotCountElements.push(count);
      slot.appendChild(count);
      
      slot.addEventListener('click', () => this.selectSlot(i));
      
      hotbar.appendChild(slot);
    }
    
    this.selectSlot(0);
    this.updateHotbarUI();
  }
  
  selectSlot(index) {
    this.selectedSlot = index;
    const selector = document.getElementById('selector');
    if (selector) {
      selector.style.left = `calc(${index * 20}px * var(--scale))`;
    }
    
    // Update First Person View model
    const item = this.inventory[index];
    if (this.player && this.player.updateHeldItem) {
       this.player.updateHeldItem(item ? item.type : null);
    }

    // Clear structure wand selection if switching away
    if (!this.isHoldingWand()) {
       this.structurePos1 = null;
       this.structurePos2 = null;
       this.updateSelectionMesh();
    }
    
    this.showHeldItemName();
  }

  updateHotbarUI() {
    for (let i = 0; i < 9; i++) {
      const item = this.inventory[i];
      const img = this.slotIconElements[i];
      const countLabel = this.slotCountElements[i];
      
      if (item && item.count > 0) {
        img.src = this.BLOCK_ICONS[item.type] || '';
        img.style.display = 'block';
        
        countLabel.innerText = item.count;
        countLabel.style.display = item.count > 1 ? 'block' : 'none';
      } else {
        img.style.display = 'none';
        countLabel.style.display = 'none';
      }
    }
  }

  updateInternalUI() {
    // Refresh the currently open window's slots
    if (this.currentUI === 'inventory') {
      this.refreshSlotElements(document.getElementById('inventory-window'), this.inventoryLayout);
    } else if (this.currentUI === 'crafting') {
      this.refreshSlotElements(document.getElementById('crafting-window'), this.craftingLayout);
    } else if (this.currentUI === 'furnace') {
      this.refreshSlotElements(document.getElementById('furnace-window'), this.furnaceLayout);
    }
  }
  
  refreshSlotElements(windowEl, layout) {
    if (!layout) return;
    const slots = windowEl.querySelectorAll('.ui-slot');
    let storageCounter = 0;
    
    layout.forEach((point, idx) => {
        if (idx >= slots.length) return;
        const slotEl = slots[idx];
        
        let invIndex = -1;
        const label = point.label || '';
        const lowerLabel = label.toLowerCase();

        // 1. Hotbar (0-8)
        if (lowerLabel.includes('hotbar')) {
            const match = lowerLabel.match(/\d+/);
            if (match) {
                invIndex = parseInt(match[0]) - 1;
            }
        } 
        // 2. Storage (9-35)
        else if (label === '') {
            if (storageCounter < 27) {
                invIndex = 9 + storageCounter;
                storageCounter++;
            }
        }
        // 3. Player Inventory Specific
        else if (this.currentUI === 'inventory') {
             if (lowerLabel === 'crafting result') invIndex = 45;
             else if (lowerLabel === 'offhand') invIndex = 40;
             else if (lowerLabel.includes('helmet')) invIndex = 39;
             else if (lowerLabel.includes('chestplate')) invIndex = 38;
             else if (lowerLabel.includes('leggings')) invIndex = 37;
             else if (lowerLabel.includes('feet')) invIndex = 36;
             // 2x2 Grid
             else if (lowerLabel === 'crafting grid top left') invIndex = 41;
             else if (lowerLabel === 'crafting grid top right') invIndex = 42;
             else if (lowerLabel === 'crafting grid bottom left') invIndex = 43;
             else if (lowerLabel === 'crafting grid bottom right') invIndex = 44;
        }
        // 4. Crafting Table Specific
        else if (this.currentUI === 'crafting') {
             if (lowerLabel === 'crafting result') invIndex = 59;
             // 3x3 Grid
             else if (lowerLabel.includes('top left')) invIndex = 50;
             else if (lowerLabel.includes('top middle')) invIndex = 51;
             else if (lowerLabel.includes('top right')) invIndex = 52;
             else if (lowerLabel.includes('left middle')) invIndex = 53;
             else if (lowerLabel === 'middle crafting grid') invIndex = 54;
             else if (lowerLabel.includes('right middle')) invIndex = 55;
             else if (lowerLabel.includes('bottom left')) invIndex = 56;
             else if (lowerLabel.includes('bottom middle')) invIndex = 57;
             else if (lowerLabel.includes('bottom right')) invIndex = 58;
        }
        // 5. Furnace Specific
        else if (this.currentUI === 'furnace') {
             if (lowerLabel === 'result') invIndex = 62;
             else if (lowerLabel === 'cooking item') invIndex = 60;
             else if (lowerLabel === 'fuel') invIndex = 61;
        }

        if (invIndex !== -1) {
            slotEl.dataset.index = invIndex;
            
            const item = this.inventory[invIndex];
            const img = slotEl.querySelector('img');
            const count = slotEl.querySelector('.count');
            
            if (item && item.count > 0) {
                img.src = this.BLOCK_ICONS[item.type] || '';
                img.style.display = 'block';
                count.innerText = item.count;
                count.style.display = item.count > 1 ? 'block' : 'none';
            } else {
                img.style.display = 'none';
                count.style.display = 'none';
            }
        }
    });
  }

  buildUI(elementId, layout) {
      const win = document.getElementById(elementId);
      win.innerHTML = '';
      
      if (!layout) return;
      
      layout.forEach(point => {
          const slot = document.createElement('div');
          slot.className = 'ui-slot';
          slot.style.left = `${point.x}px`;
          slot.style.top = `${point.y}px`;
          const isViewModel = point.label === 'player view model';
          if (isViewModel) {
              slot.style.width = '51px';
              slot.style.height = '72px';
              slot.classList.add('static');
              this.vmContainer = slot;
          } else {
              slot.style.width = `${point.w}px`;
              slot.style.height = `${point.h}px`;
          }
          slot.style.transform = 'translate(-50%, -50%)'; // Center anchor
          
          const img = document.createElement('img');
          slot.appendChild(img);
          
          const count = document.createElement('div');
          count.className = 'count';
          slot.appendChild(count);
          
          if (!isViewModel) {
              slot.addEventListener('mousedown', (e) => this.handleSlotClick(e, slot.dataset.index));
              slot.addEventListener('mousemove', (e) => this.updateTooltip(e, slot.dataset.index));
              slot.addEventListener('mouseleave', () => this.hideTooltip());
              
              slot.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const fakeEvent = {
                  button: this.mobileRightClickMode ? 2 : 0,
                  preventDefault: () => {},
                  stopPropagation: () => {}
                };
                this.handleSlotClick(fakeEvent, slot.dataset.index);
              });
          }

          win.appendChild(slot);
      });
  }

  getDisplayName(type) {
    if (!type) return '';
    const entry = Object.entries(BLOCK_TYPES).find(([k, v]) => v === type);
    if (!entry) return 'Unknown Item';
    
    // Special format for Structure Wand
    if (type === BLOCK_TYPES.STRUCTURE_WAND) return "Structure Wand";
    if (type === BLOCK_TYPES.PLACE_WAND) return "Place Wand";

    return entry[0]
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  showHeldItemName() {
    if (!this.itemNameDisplay) return;
    
    const item = this.inventory[this.selectedSlot];
    if (item && item.count > 0) {
      const name = this.getDisplayName(item.type);
      this.itemNameDisplay.innerText = name;
      this.itemNameDisplay.classList.add('visible');
      
      if (this.itemNameTimeout) clearTimeout(this.itemNameTimeout);
      this.itemNameTimeout = setTimeout(() => {
        this.itemNameDisplay.classList.remove('visible');
      }, 4000);
    } else {
      this.itemNameDisplay.classList.remove('visible');
    }
  }

  updateTooltip(e, indexStr) {
    if (!this.tooltip) return;
    const index = parseInt(indexStr);
    const item = this.inventory[index];
    
    if (item && item.count > 0) {
       const name = this.getDisplayName(item.type);
       this.tooltip.innerText = name;
       this.tooltip.style.display = 'block';
       this.tooltip.style.left = (e.clientX + 15) + 'px';
       this.tooltip.style.top = (e.clientY - 30) + 'px';
    } else {
       this.tooltip.style.display = 'none';
    }
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.style.display = 'none';
  }

  handleSlotClick(e, indexStr) {
      if (!indexStr) return;
      const prevHeldType = this.inventory[this.selectedSlot]?.type;

      const index = parseInt(indexStr);
      const isRight = e.button === 2;
      
      // Crafting slot detection
      const isInvResult = index === this.CRAFTING_INVENTORY.result;
      const isTableResult = index === this.CRAFTING_TABLE.result;
      const isResult = isInvResult || isTableResult;

      const slotItem = this.inventory[index];
      
      if (isResult) {
          if (!slotItem) return;

          // Check if we can pickup/stack the result
          if (this.cursorItem) {
              if (this.cursorItem.type !== slotItem.type) return;
              // Add to stack
              this.cursorItem.count += slotItem.count;
          } else {
              // Pickup
              this.cursorItem = { ...slotItem };
          }
          
          // Consume ingredients
          const grid = isInvResult ? this.CRAFTING_INVENTORY.grid : this.CRAFTING_TABLE.grid;
          this.consumeCraftingIngredients(grid);
          
          // Update crafting to see if we can craft more (or clear result)
          this.updateCrafting(isInvResult ? this.CRAFTING_INVENTORY : this.CRAFTING_TABLE);

      } else {
          // Standard interaction
          if (!this.cursorItem) {
              // Pick up
              if (slotItem) {
                  if (isRight) {
                      // Split
                      const half = Math.ceil(slotItem.count / 2);
                      this.cursorItem = { type: slotItem.type, count: half };
                      slotItem.count -= half;
                      if (slotItem.count <= 0) this.inventory[index] = null;
                  } else {
                      // Take all
                      this.cursorItem = slotItem;
                      this.inventory[index] = null;
                  }
              }
          } else {
              // Place
              if (!slotItem) {
                  if (isRight) {
                      this.inventory[index] = { type: this.cursorItem.type, count: 1 };
                      this.cursorItem.count--;
                      if (this.cursorItem.count <= 0) this.cursorItem = null;
                  } else {
                      this.inventory[index] = this.cursorItem;
                      this.cursorItem = null;
                  }
              } else if (slotItem.type === this.cursorItem.type) {
                  // Stack
                  if (isRight) {
                       slotItem.count++;
                       this.cursorItem.count--;
                       if (this.cursorItem.count <= 0) this.cursorItem = null;
                  } else {
                       slotItem.count += this.cursorItem.count;
                       this.cursorItem = null;
                  }
              } else {
                  // Swap
                  const temp = this.inventory[index];
                  this.inventory[index] = this.cursorItem;
                  this.cursorItem = temp;
              }
          }

          // Trigger crafting update if in grid
          if (this.CRAFTING_INVENTORY.grid.includes(index)) {
              this.updateCrafting(this.CRAFTING_INVENTORY);
          } else if (this.CRAFTING_TABLE.grid.includes(index)) {
              this.updateCrafting(this.CRAFTING_TABLE);
          }
      }
      
      this.updateInternalUI();
      this.updateHotbarUI();
      this.updateCursorItem();
      
      // If we modified the hotbar slot that we are currently holding
      if (index === parseInt(this.selectedSlot)) {
         const newHeldType = this.inventory[this.selectedSlot]?.type;
         if (newHeldType !== prevHeldType) {
            if (this.player && this.player.updateHeldItem) {
               this.player.updateHeldItem(newHeldType);
            }
         }

         if (!this.isHoldingWand()) {
             this.structurePos1 = null;
             this.structurePos2 = null;
             this.updateSelectionMesh();
         }
         this.showHeldItemName();
      }
  }

  consumeCraftingIngredients(gridIndices) {
      gridIndices.forEach(idx => {
          if (this.inventory[idx]) {
              this.inventory[idx].count--;
              if (this.inventory[idx].count <= 0) {
                  this.inventory[idx] = null;
              }
          }
      });
  }

  updateCrafting(context) {
      const gridItems = context.grid.map(idx => this.inventory[idx]);
      const resultItem = this.checkRecipe(gridItems);
      this.inventory[context.result] = resultItem;
  }

  matchesRecipe(items, pattern) {
      if (items.length !== pattern.length) return false;
      for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const reqType = pattern[i];
          
          if (reqType === null) {
              if (item !== null) return false;
          } else {
              if (!item) return false;
              // Allow substituting different plank types if recipe calls for Oak Planks (type 6)
              if (reqType === BLOCK_TYPES.OAK_PLANKS) {
                  const isPlank = (item.type === BLOCK_TYPES.OAK_PLANKS || item.type === BLOCK_TYPES.BIRCH_PLANKS);
                  if (!isPlank) return false;
              } else {
                  if (item.type !== reqType) return false;
              }
          }
      }
      return true;
  }

  checkRecipe(items) {
      // Check loaded custom recipes first (supports 3x3 grid mainly)
      if (this.recipes.length > 0 && items.length === 9) {
          for (const recipe of this.recipes) {
              if (!recipe.pattern) continue; // Skip recipes without pattern (e.g. furnace)
              if (this.matchesRecipe(items, recipe.pattern)) {
                  return { type: recipe.result.type, count: recipe.result.count };
              }
          }
      }

      const presentItems = items.filter(i => i !== null);
      
      // 1 Log -> 4 Planks
      if (presentItems.length === 1) {
          const item = presentItems[0];
          if (item.type === BLOCK_TYPES.OAK_LOG) {
              return { type: BLOCK_TYPES.OAK_PLANKS, count: 4 };
          }
          if (item.type === BLOCK_TYPES.BIRCH_LOG) {
              return { type: BLOCK_TYPES.BIRCH_PLANKS, count: 4 };
          }
      }
      
      const isPlank = (item) => item.type === BLOCK_TYPES.OAK_PLANKS || item.type === BLOCK_TYPES.BIRCH_PLANKS;

      // 4 Planks -> Crafting Table
      if (presentItems.length === 4) {
          const allPlanks = presentItems.every(i => isPlank(i));
          if (allPlanks) {
              // Check shape
              if (items.length === 4) {
                  // 2x2 grid - if we have 4 items, it's a full square
                  return { type: BLOCK_TYPES.CRAFTING_TABLE, count: 1 };
              } else if (items.length === 9) {
                  // 3x3 grid - check for square patterns
                  const p = items.map(i => i !== null); // boolean map
                  
                  // Top-left square: 0,1, 3,4
                  if (p[0] && p[1] && p[3] && p[4]) return { type: BLOCK_TYPES.CRAFTING_TABLE, count: 1 };
                  // Top-right square: 1,2, 4,5
                  if (p[1] && p[2] && p[4] && p[5]) return { type: BLOCK_TYPES.CRAFTING_TABLE, count: 1 };
                  // Bottom-left square: 3,4, 6,7
                  if (p[3] && p[4] && p[6] && p[7]) return { type: BLOCK_TYPES.CRAFTING_TABLE, count: 1 };
                  // Bottom-right square: 4,5, 7,8
                  if (p[4] && p[5] && p[7] && p[8]) return { type: BLOCK_TYPES.CRAFTING_TABLE, count: 1 };
              }
          }
      }

      // 2 Planks -> 4 Sticks (Inventory 2x2)
      if (items.length === 4 && presentItems.length === 2) {
          const allPlanks = presentItems.every(i => isPlank(i));
          if (allPlanks) {
              // Vertical check: (0,2) or (1,3)
              const p = items.map(i => i && isPlank(i));
              if ((p[0] && p[2]) || (p[1] && p[3])) {
                  return { type: BLOCK_TYPES.STICK, count: 4 };
              }
          }
      }
      
      return null;
  }
  
  onDragMove(e) {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      if (this.cursorItem) {
          this.dragElement.style.left = `${e.clientX}px`;
          this.dragElement.style.top = `${e.clientY}px`;
      }
  }

  updateCursorItem() {
      if (this.cursorItem && this.cursorItem.count > 0) {
          this.dragElement.style.display = 'block';
          this.dragIcon.src = this.BLOCK_ICONS[this.cursorItem.type];
          this.dragCount.innerText = this.cursorItem.count > 1 ? this.cursorItem.count : '';
      } else {
          this.dragElement.style.display = 'none';
          this.cursorItem = null;
      }
  }

  dropCurrentItem() {
    const item = this.inventory[this.selectedSlot];
    if (item && item.count > 0) {
      const type = item.type;
      item.count--;
      if (item.count <= 0) {
        this.inventory[this.selectedSlot] = null;
        
        // Update first person hand to arm
        if (this.player && this.player.updateHeldItem) {
           this.player.updateHeldItem(null);
        }

        if (!this.isHoldingWand()) {
           this.structurePos1 = null;
           this.structurePos2 = null;
           this.updateSelectionMesh();
        }
      }
      this.updateHotbarUI();
      
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      
      // Use camera position since player.position is now at feet
      const position = this.camera.position.clone().add(direction.clone().multiplyScalar(0.5));
      position.y -= 0.2;
      
      const velocity = direction.clone().multiplyScalar(8.0);
      velocity.y += 2.0;
      
      this.world.throwItem(position, velocity, type);
    }
  }

  addItem(type, amount = 1) {
    const prevHeldType = this.inventory[this.selectedSlot]?.type;

    // Try to stack existing
    for (let i = 0; i < 36; i++) {
      if (this.inventory[i] && this.inventory[i].type === type) {
        this.inventory[i].count += amount;
        this.updateHotbarUI();
        if (this.currentUI) this.updateInternalUI();
        this.player.playSound('pop', false, 0.5);
        return true;
      }
    }
    
    // Find empty slot
    for (let i = 0; i < 36; i++) {
      if (!this.inventory[i]) {
        this.inventory[i] = { type: type, count: amount };
        this.updateHotbarUI();
        if (this.currentUI) this.updateInternalUI();
        this.player.playSound('pop', false, 0.5);
        
        if (i === this.selectedSlot) {
           this.showHeldItemName();
           if (this.player && this.player.updateHeldItem) {
              this.player.updateHeldItem(type);
           }
        }
        return true;
      }
    }
    return false;
  }
  
  setupKeyboard() {
    this.boundOnKeyDown = (e) => {
      // Block controls if chat is open
      if (this.chat && this.chat.isOpen) return;

      if (e.code === 'KeyH') {
        this.toggleHud();
        return;
      }

      if (e.code === 'KeyE') {
        this.openUI('inventory');
        return;
      }

      if (this.currentUI) {
        if (e.code === 'Escape') {
          this.closeUI();
        }
        return;
      }

      if (e.code === 'Escape') {
        if (this.onTogglePause) this.onTogglePause();
        return;
      }

      this.keys[e.key.toLowerCase()] = true;
      
      if (e.code === 'ShiftLeft') this.player.setCrouching(true);
      if (e.code === 'ControlLeft') this.player.setSprinting(true);

      if (e.key === ' ') {
        e.preventDefault();
        this.player.jump();
      }

      if (e.key === 'q' || e.key === 'Q') {
        this.dropCurrentItem();
      }
      
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        this.selectSlot(num - 1);
      }
    };
    
    this.boundOnKeyUp = (e) => {
      if (this.currentUI) return;
      
      this.keys[e.key.toLowerCase()] = false;

      if (e.code === 'ShiftLeft') this.player.setCrouching(false);
      if (e.code === 'ControlLeft') this.player.setSprinting(false);
    };

    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
  }
  
  setupMouse() {
    this.canvas.addEventListener('click', () => {
      if (this.currentUI) return;
      if (this.chat && this.chat.isOpen) return;
      if (!this.isMobile) {
        this.canvas.requestPointerLock();
      }
    });
    
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) {
        document.addEventListener('mousemove', this.onMouseMove);
      } else {
        document.removeEventListener('mousemove', this.onMouseMove);
        this.isMining = false;
        this.updateBreakIndicator(0, null);
      }
    });
    
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.chat && this.chat.isOpen) return;
      if (this.currentUI) return;
      
      if (document.pointerLockElement === this.canvas || this.isMobile) {
        if (e.button === 0) { // Left Click - Attack / Break
          if (this.player.swingHand) this.player.swingHand();

          if (this.isHoldingWand()) {
             this.handleWandInteraction(true);
          } else if (this.isHoldingPlaceWand()) {
             this.handlePlaceWandLoad();
          } else {
             this.isMining = true;
             this.miningStartTime = performance.now();
             this.handlePlayerPunch();
          }
        } else if (e.button === 2) { // Right Click - Interact / Place
           if (this.player.swingHand) this.player.swingHand();
           
           if (this.isHoldingWand()) {
              this.handleWandInteraction(false);
           } else if (this.isHoldingPlaceWand()) {
              this.handlePlaceWandPlace();
           } else {
              this.handleBlockInteraction(false);
           }
        }
      }
    });
    
    this.canvas.addEventListener('mouseup', () => {
      this.isMining = false;
      this.updateBreakIndicator(0, null);
    });
    
    this.boundOnContextMenu = (e) => e.preventDefault();
    window.addEventListener('contextmenu', this.boundOnContextMenu);

    this.boundOnWheel = (e) => {
      if (this.chat && this.chat.isOpen) return;
      if (this.currentUI) return;

      if (e.deltaY > 0) {
        this.selectSlot((this.selectedSlot + 1) % 9);
      } else if (e.deltaY < 0) {
        this.selectSlot((this.selectedSlot - 1 + 9) % 9);
      }
    };

    window.addEventListener('wheel', this.boundOnWheel);
  }
  
  onMouseMove = (e) => {
    const sensitivity = 0.002;
    this.rotation.y -= e.movementX * sensitivity;
    this.rotation.x -= e.movementY * sensitivity;
    this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
    this.camera.rotation.copy(this.rotation);
  }
  
  setupTouch() {
    if (!this.isMobile) return;
    
    this.lookTouchId = null;
    this.lastTouchPos = { x: 0, y: 0 };
    
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault(); // Prevent scrolling
      
      // If we aren't already looking, grab the first available touch
      if (this.lookTouchId === null) {
        // We prefer changedTouches to find the new one
        const touch = e.changedTouches[0];
        this.lookTouchId = touch.identifier;
        this.lastTouchPos.x = touch.clientX;
        this.lastTouchPos.y = touch.clientY;
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      
      if (this.lookTouchId !== null) {
        // Find the look touch
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.lookTouchId) {
            const touch = e.changedTouches[i];
            const sensitivity = 0.003;
            
            const deltaX = touch.clientX - this.lastTouchPos.x;
            const deltaY = touch.clientY - this.lastTouchPos.y;
            
            this.rotation.y -= deltaX * sensitivity;
            // Inverted for mobile "drag to look" feel, or rather non-inverted FPS style
            this.rotation.x -= deltaY * sensitivity; 
            
            this.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.x));
            this.camera.rotation.copy(this.rotation);
            
            this.lastTouchPos.x = touch.clientX;
            this.lastTouchPos.y = touch.clientY;
            break;
          }
        }
      }
    }, { passive: false });
    
    const endTouch = (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.lookTouchId) {
          this.lookTouchId = null;
          break;
        }
      }
    };
    
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);
  }

  setupMobileUI() {
    const btnBreak = document.getElementById('btn-break');
    const btnPlace = document.getElementById('btn-place');
    const btnJump = document.getElementById('btn-jump');
    const btnThrow = document.getElementById('btn-throw');
    const btnClose = document.getElementById('btn-close-inv');
    const btnSlotLeft = document.getElementById('btn-slot-left');
    const btnSlotRight = document.getElementById('btn-slot-right');
    const btnInvMode = document.getElementById('btn-inv-mode');
    const btnChat = document.getElementById('chat-button-mobile');
    const btnCrouch = document.getElementById('btn-crouch');

    if (btnChat) {
      const openChat = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.chat) this.chat.open();
      };
      
      btnChat.addEventListener('touchstart', openChat);
      btnChat.addEventListener('click', openChat);
    }

    if (btnSlotLeft) {
      btnSlotLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectSlot((this.selectedSlot - 1 + 9) % 9);
      });
    }

    if (btnSlotRight) {
      btnSlotRight.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectSlot((this.selectedSlot + 1) % 9);
      });
    }

    if (btnBreak) {
      btnBreak.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.player.swingHand) this.player.swingHand();
        this.isMining = true;
        this.miningStartTime = performance.now();
        this.miningTarget = null;
      });
      btnBreak.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.isMining = false;
        this.updateBreakIndicator(0, null);
      });
    }

    if (btnPlace) {
      btnPlace.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.player.swingHand) this.player.swingHand();
        this.handleBlockInteraction(false);
      });
    }

    if (btnJump) {
      btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.player.jump();
      });
    }

    if (btnCrouch) {
      // Use both start/end to toggle, or act as hold. 
      // Minecraft PE usually has a toggle for sneak in middle of D-pad, 
      // but standalone button often behaves as hold or toggle.
      // Let's make it hold for now, or toggle? User asked for "a button", let's do hold behavior.
      
      const setCrouch = (state) => {
        this.player.setCrouching(state);
        if (state) btnCrouch.classList.add('active');
        else btnCrouch.classList.remove('active');
      };

      btnCrouch.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setCrouch(true);
      });

      btnCrouch.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setCrouch(false);
      });
      
      // Safety release
      btnCrouch.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setCrouch(false);
      });
    }

    if (btnInvMode) {
      btnInvMode.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.mobileRightClickMode = !this.mobileRightClickMode;
        btnInvMode.innerText = this.mobileRightClickMode ? "MODE: ONE" : "MODE: ALL";
        btnInvMode.style.background = this.mobileRightClickMode ? "rgba(100, 100, 255, 0.6)" : "rgba(0, 0, 0, 0.3)";
      });
    }

    if (btnThrow) {
      btnThrow.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropCurrentItem();
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeUI();
      });
      // Handle touch separately to avoid delay/issues
      btnClose.addEventListener('touchstart', (e) => {
         e.preventDefault();
         e.stopPropagation();
         this.closeUI();
      });
    }
  }
  
  setupJoystick() {
    const joystickZone = document.getElementById('joystick');
    
    this.joystick = nipplejs.create({
      zone: joystickZone,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'rgba(255, 255, 255, 0.5)'
    });
    
    this.joystickData = { x: 0, y: 0 };
    
    this.joystick.on('move', (evt, data) => {
      const angle = data.angle.radian;
      const force = Math.min(data.force, 1);
      this.joystickData.x = Math.cos(angle) * force;
      this.joystickData.y = Math.sin(angle) * force;
    });
    
    this.joystick.on('end', () => {
      this.joystickData.x = 0;
      this.joystickData.y = 0;
    });
  }
  
  isHoldingWand() {
    const item = this.inventory[this.selectedSlot];
    return item && item.type === BLOCK_TYPES.STRUCTURE_WAND;
  }

  isHoldingPlaceWand() {
    const item = this.inventory[this.selectedSlot];
    return item && item.type === BLOCK_TYPES.PLACE_WAND;
  }

  handlePlayerPunch() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    raycaster.far = 3.5; // Reach distance

    const targets = [];
    
    // Remote Players
    const remotePlayers = (this.player.gameInstance && this.player.gameInstance.remotePlayers) || {};
    Object.values(remotePlayers).forEach(mesh => targets.push(mesh));

    // Zombies
    const zombies = (this.player.gameInstance && this.player.gameInstance.zombies) || [];
    zombies.forEach(z => {
        if (!z.dead) targets.push(z.mesh);
    });

    const intersects = raycaster.intersectObjects(targets, true);
    if (intersects.length > 0) {
        // Find the Group/Object root
        let root = intersects[0].object;
        // Search up until we find a known root
        while(root.parent && !targets.includes(root)) {
            root = root.parent;
        }
        
        this.player.playSound('attack', false, 0.8);

        // Check if Remote Player
        const clientId = Object.keys(remotePlayers).find(id => remotePlayers[id] === root);
        if (clientId) {
            const knockbackDir = new THREE.Vector3();
            this.camera.getWorldDirection(knockbackDir);
            knockbackDir.y = 0; 
            knockbackDir.normalize();
            
            const strength = 12.0; 
            const upStrength = 7.0;
            
            const room = new WebsimSocket(); 
            room.requestPresenceUpdate(clientId, {
                type: 'damage',
                amount: 2, 
                from: room.clientId,
                kb: { x: knockbackDir.x * strength, y: upStrength, z: knockbackDir.z * strength }
            });
            return true;
        }

        // Check Zombie
        const zombie = zombies.find(z => z.mesh === root);
        if (zombie) {
            const knockbackDir = new THREE.Vector3();
            this.camera.getWorldDirection(knockbackDir);
            knockbackDir.y = 0; 
            knockbackDir.normalize();
            
            // Calculate Damage
            let damage = 1; // Fist
            const heldItem = this.inventory[this.selectedSlot];
            if (heldItem) {
               const tier = this.getToolTier(heldItem.type);
               const cat = this.getToolCategory(heldItem.type);
               if (cat === 'sword') {
                   if (tier === 'wooden' || tier === 'golden') damage = 4;
                   else if (tier === 'stone') damage = 5;
                   else if (tier === 'iron') damage = 6;
                   else if (tier === 'diamond') damage = 7;
                   else if (tier === 'netherite') damage = 8;
               } else if (cat === 'axe') {
                   if (tier === 'wooden' || tier === 'golden') damage = 7;
                   else if (tier === 'stone' || tier === 'iron' || tier === 'diamond') damage = 9;
                   else if (tier === 'netherite') damage = 10;
               } else if (tier !== 'hand') {
                   damage = 2; 
               }
            }

            // Custom knockback vector (less backwards force)
            const kbStrength = 9.0;
            const kbUp = 6.0;
            const kbVector = new THREE.Vector3(
                knockbackDir.x * kbStrength,
                kbUp,
                knockbackDir.z * kbStrength
            );

            if (zombie.takeDamage) {
                zombie.takeDamage(damage, kbVector);
            }
            return true;
        }
    }
    return false;
  }

  handleWandInteraction(isLeftClick) {
    const target = this.getRaycastedBlock();
    if (!target) return;

    if (isLeftClick) {
      this.structurePos1 = { x: target.x, y: target.y, z: target.z };
      // Clear P2 when setting P1 to start a new selection, preventing "random" connections to old points
      this.structurePos2 = null; 
      this.chat.addMessage(`Position 1 set to ${target.x}, ${target.y}, ${target.z}`);
    } else {
      this.structurePos2 = { x: target.x, y: target.y, z: target.z };
      this.chat.addMessage(`Position 2 set to ${target.x}, ${target.y}, ${target.z}`);
    }
    
    this.updateSelectionMesh();

    if (this.structurePos1 && this.structurePos2) {
      setTimeout(() => {
        // Verify selection is still valid before opening UI
        if (this.structurePos1 && this.structurePos2) {
          this.openUI('structure');
        }
      }, 200);
    }
  }

  handlePlaceWandLoad() {
    document.exitPointerLock();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (data.blocks && Array.isArray(data.blocks)) {
            this.loadedStructure = data;
            this.chat.addMessage(`Structure loaded: ${data.blocks.length} blocks. Right click to place.`);
          } else {
            this.chat.addMessage("Invalid structure file.");
          }
        } catch (err) {
          this.chat.addMessage("Failed to parse JSON.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  handlePlaceWandPlace() {
    if (!this.loadedStructure) {
      this.chat.addMessage("No structure loaded. Left click with wand to load JSON.");
      return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    const maxDistance = 10;
    const step = 0.1;
    
    for (let i = 0; i < maxDistance / step; i++) {
      const point = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(i * step)
      );
      
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      const z = Math.floor(point.z);
      
      if (this.world.getBlock(x, y, z) !== BLOCK_TYPES.AIR) {
        if (i === 0) return; 

        const prevPoint = raycaster.ray.origin.clone().add(
             raycaster.ray.direction.clone().multiplyScalar((i - 1) * step)
        );
        const ox = Math.floor(prevPoint.x);
        const oy = Math.floor(prevPoint.y);
        const oz = Math.floor(prevPoint.z);
        
        this.instantiateStructure(ox, oy, oz);
        return;
      }
    }
  }

  instantiateStructure(ox, oy, oz) {
    if (!this.loadedStructure || !this.loadedStructure.blocks) return;
    
    let count = 0;
    for (const b of this.loadedStructure.blocks) {
      const x = ox + b.pos[0];
      const y = oy + b.pos[1];
      const z = oz + b.pos[2];
      
      this.world.addBlock(x, y, z, b.state);
      count++;
    }
    this.chat.addMessage(`Placed ${count} blocks.`);
    this.player.playSound('pop', false, 0.5);
  }

  updateSelectionMesh() {
    if (!this.selectionMesh) return;
    if (this.structurePos1 && this.structurePos2) {
       const minX = Math.min(this.structurePos1.x, this.structurePos2.x);
       const minY = Math.min(this.structurePos1.y, this.structurePos2.y);
       const minZ = Math.min(this.structurePos1.z, this.structurePos2.z);
       const maxX = Math.max(this.structurePos1.x, this.structurePos2.x) + 1;
       const maxY = Math.max(this.structurePos1.y, this.structurePos2.y) + 1;
       const maxZ = Math.max(this.structurePos1.z, this.structurePos2.z) + 1;
       
       const w = maxX - minX;
       const h = maxY - minY;
       const d = maxZ - minZ;
       
       this.selectionMesh.geometry.dispose();
       this.selectionMesh.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d));
       this.selectionMesh.position.set(minX + w/2, minY + h/2, minZ + d/2);
       this.selectionMesh.visible = true;
    } else if (this.structurePos1 || this.structurePos2) {
       // Show 1x1 box at the valid point
       const p = this.structurePos1 || this.structurePos2;
       this.selectionMesh.geometry.dispose();
       this.selectionMesh.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
       this.selectionMesh.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
       this.selectionMesh.visible = true;
    } else {
       this.selectionMesh.visible = false;
    }
  }

  saveStructure() {
    if (!this.structurePos1 || !this.structurePos2) return;
    
    const minX = Math.min(this.structurePos1.x, this.structurePos2.x);
    const minY = Math.min(this.structurePos1.y, this.structurePos2.y);
    const minZ = Math.min(this.structurePos1.z, this.structurePos2.z);
    const maxX = Math.max(this.structurePos1.x, this.structurePos2.x);
    const maxY = Math.max(this.structurePos1.y, this.structurePos2.y);
    const maxZ = Math.max(this.structurePos1.z, this.structurePos2.z);
    
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const d = maxZ - minZ + 1;
    
    if (w * h * d > 1000000) {
       this.chat.addMessage("Area too large to save!");
       this.closeUI();
       return;
    }

    const structure = {
      size: [w, h, d],
      blocks: []
    };
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
           const type = this.world.getBlock(x, y, z);
           if (type !== BLOCK_TYPES.AIR) {
             structure.blocks.push({
               pos: [x - minX, y - minY, z - minZ],
               state: type
             });
           }
        }
      }
    }
    
    const nameInput = document.getElementById('structure-name-input');
    const name = nameInput ? nameInput.value : 'structure';
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(structure));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", name + ".json");
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    this.closeUI();
    this.chat.addMessage(`Saved structure '${name}'`);
    
    // Clear selection
    this.structurePos1 = null;
    this.structurePos2 = null;
    this.updateSelectionMesh();
  }

  getRaycastedBlock() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    const maxDistance = 5;
    const step = 0.1;
    
    for (let i = 0; i < maxDistance / step; i++) {
      const point = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(i * step)
      );
      
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      const z = Math.floor(point.z);
      
      if (this.world.getBlock(x, y, z) !== 0) {
        return { x, y, z };
      }
    }
    return null;
  }

  handleBlockInteraction(isLeftClick) {
    if (isLeftClick) return; // Left click is mining handled elsewhere

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    const maxDistance = 5;
    const step = 0.1;
    
    for (let i = 0; i < maxDistance / step; i++) {
      const point = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(i * step)
      );
      
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      const z = Math.floor(point.z);
      const blockType = this.world.getBlock(x, y, z);
      const currentItem = this.inventory[this.selectedSlot];

      // Special handling for Water:
      // If holding bucket, we interact with it.
      // Otherwise, we ignore it and continue raycast to find solid block behind it.
      if (blockType === BLOCK_TYPES.WATER_BUCKET) {
         const isSource = this.world.waterSources.has(`${x},${y},${z}`);
         if (currentItem && currentItem.type === BLOCK_TYPES.BUCKET && isSource) {
             // Bucket Pickup Logic
             this.world.removeBlock(x, y, z);
             
             currentItem.count--;
             if (currentItem.count <= 0) {
                this.inventory[this.selectedSlot] = { type: BLOCK_TYPES.WATER_BUCKET, count: 1 };
             } else {
                if (!this.addItem(BLOCK_TYPES.WATER_BUCKET, 1)) {
                   this.world.dropItem(Math.floor(this.player.position.x), Math.floor(this.player.position.y), Math.floor(this.player.position.z), BLOCK_TYPES.WATER_BUCKET);
                }
             }
             this.updateHotbarUI();
             this.showHeldItemName();
             return;
         }
         // If not holding bucket or not a source, continue raycast through water
         continue; 
      }

      if (blockType !== 0) {
        // Interaction Logic
        if (blockType === BLOCK_TYPES.CRAFTING_TABLE) {
          if (!this.player.isCrouching || !this.inventory[this.selectedSlot]) {
            this.openUI('crafting');
            return;
          }
        }
        if (blockType === BLOCK_TYPES.FURNACE) {
          if (!this.player.isCrouching || !this.inventory[this.selectedSlot]) {
            this.openUI('furnace');
            return;
          }
        }

        // Placing Logic (only if not interacting)
        // Check if we hit the block face from previous step
        if (i > 0) {
          const slotItem = this.inventory[this.selectedSlot];
          if (slotItem && slotItem.count > 0) {
            const placeType = slotItem.type;
            
            // Prevent placing tools and items
            const toolCategory = this.getToolCategory(placeType);
            if (toolCategory !== 'none' || 
                placeType === BLOCK_TYPES.STICK || 
                placeType === BLOCK_TYPES.DIAMOND ||
                placeType === BLOCK_TYPES.COAL ||
                placeType === BLOCK_TYPES.RAW_IRON ||
                placeType === BLOCK_TYPES.IRON_INGOT ||
                placeType === BLOCK_TYPES.RAW_GOLD ||
                placeType === BLOCK_TYPES.GOLD_INGOT ||
                placeType === BLOCK_TYPES.BUCKET
               ) return;

            const prevPoint = raycaster.ray.origin.clone().add(
              raycaster.ray.direction.clone().multiplyScalar((i - 1) * step)
            );
            const px = Math.floor(prevPoint.x);
            const py = Math.floor(prevPoint.y);
            const pz = Math.floor(prevPoint.z);
            
            // Collision Check
            const pBox = this.player.getBox(this.player.position);
            const bBounds = {
              minX: px, maxX: px + 1,
              minY: py, maxY: py + 1,
              minZ: pz, maxZ: pz + 1
            };
            
            if (pBox.min.x >= bBounds.maxX || pBox.max.x <= bBounds.minX ||
                pBox.min.y >= bBounds.maxY || pBox.max.y <= bBounds.minY ||
                pBox.min.z >= bBounds.maxZ || pBox.max.z <= bBounds.minZ) {
               
               this.world.addBlock(px, py, pz, placeType);
               
               // Handle Multi-block placing (Tall Grass)
               if (placeType === BLOCK_TYPES.TALL_GRASS) {
                 if (this.world.getBlock(px, py + 1, pz) === BLOCK_TYPES.AIR) {
                    this.world.addBlock(px, py + 1, pz, BLOCK_TYPES.TALL_GRASS_TOP);
                 }
               }

               this.player.playPlaceSound(placeType);
               
               if (placeType === BLOCK_TYPES.WATER_BUCKET) {
                  slotItem.count--;
                  if (slotItem.count <= 0) {
                     this.inventory[this.selectedSlot] = { type: BLOCK_TYPES.BUCKET, count: 1 };
                  } else {
                     if (!this.addItem(BLOCK_TYPES.BUCKET, 1)) {
                        // Inventory full, drop bucket at feet
                        this.world.dropItem(this.player.position.x, this.player.position.y, this.player.position.z, BLOCK_TYPES.BUCKET);
                     }
                  }
               } else {
                  slotItem.count--;
                  if (slotItem.count <= 0) {
                    this.inventory[this.selectedSlot] = null;
                  }
               }
               
               // Update first person view to new item (or air)
               if (this.player && this.player.updateHeldItem) {
                  this.player.updateHeldItem(this.inventory[this.selectedSlot]?.type);
               }

               this.updateHotbarUI();
            }
          }
        }
        break;
      }
    }
  }
  
  getToolTier(toolType) {
    if (!toolType) return 'hand';
    // Check suffixes
    const names = Object.keys(BLOCK_TYPES);
    const name = names.find(k => BLOCK_TYPES[k] === toolType);
    if (!name) return 'hand';
    
    if (name.includes('WOODEN_')) return 'wooden';
    if (name.includes('STONE_')) return 'stone';
    if (name.includes('IRON_')) return 'iron';
    if (name.includes('DIAMOND_')) return 'diamond';
    if (name.includes('GOLDEN_')) return 'golden'; 
    if (name.includes('NETHERITE_')) return 'netherite';
    
    return 'hand';
  }

  getToolCategory(toolType) {
    if (!toolType) return 'none';
    const names = Object.keys(BLOCK_TYPES);
    const name = names.find(k => BLOCK_TYPES[k] === toolType);
    if (!name) return 'none';
    
    if (name.includes('_PICKAXE')) return 'pickaxe';
    if (name.includes('_AXE')) return 'axe';
    if (name.includes('_SHOVEL')) return 'shovel';
    if (name.includes('_HOE')) return 'hoe';
    if (name.includes('_SWORD')) return 'sword';
    
    return 'none';
  }

  getMiningDuration(blockType, toolType) {
    const tier = this.getToolTier(toolType);
    const category = this.getToolCategory(toolType);
    
    // Leaves and Grass always fast (instabreak in Creative/Survival terms usually instant for grass)
    if (blockType === BLOCK_TYPES.OAK_LEAVES || blockType === BLOCK_TYPES.BIRCH_LEAVES) return 300;
    if (blockType === BLOCK_TYPES.GRASS || blockType === BLOCK_TYPES.TALL_GRASS || blockType === BLOCK_TYPES.TALL_GRASS_TOP) return 50;

    // Helper for tier speeds
    const getTierSpeed = (wooden, stone, iron, diamond, gold, netherite, base) => {
      switch (tier) {
        case 'wooden': return wooden;
        case 'stone': return stone;
        case 'iron': return iron;
        case 'diamond': return diamond;
        case 'golden': return gold;
        case 'netherite': return netherite;
        default: return base;
      }
    };

    // Shovel Blocks: Dirt, Grass Block, Sand
    if (blockType === BLOCK_TYPES.DIRT || blockType === BLOCK_TYPES.GRASS_BLOCK || blockType === BLOCK_TYPES.SAND) {
      if (category === 'shovel') {
        return getTierSpeed(400, 200, 150, 100, 100, 100, 750);
      }
      return 750; // Base/Fists
    }

    // Pickaxe Blocks: Stone, Cobblestone, Furnace, Deepslate
    if (blockType === BLOCK_TYPES.STONE || blockType === BLOCK_TYPES.COBBLESTONE) {
      if (category === 'pickaxe') {
        return getTierSpeed(3750, 1150, 750, 600, 400, 350, 7500);
      }
      return 7500;
    }

    if (blockType === BLOCK_TYPES.FURNACE) {
      if (category === 'pickaxe') {
        return getTierSpeed(2650, 1350, 900, 700, 450, 400, 17500);
      }
      return 17500;
    }

    if (blockType === BLOCK_TYPES.DEEPSLATE) {
      if (category === 'pickaxe') {
        return getTierSpeed(2250, 1150, 750, 600, 400, 350, 15000);
      }
      return 15000;
    }

    // Axe Blocks: Logs, Planks, Crafting Table
    if (blockType === BLOCK_TYPES.OAK_LOG || blockType === BLOCK_TYPES.OAK_PLANKS ||
        blockType === BLOCK_TYPES.BIRCH_LOG || blockType === BLOCK_TYPES.BIRCH_PLANKS) {
      if (category === 'axe') {
        return getTierSpeed(1500, 750, 500, 400, 250, 200, 3000);
      }
      return 3000;
    }

    if (blockType === BLOCK_TYPES.CRAFTING_TABLE) {
      if (category === 'axe') {
        return getTierSpeed(1900, 950, 650, 500, 350, 300, 3750);
      }
      return 3750;
    }

    // Default Fallback
    return 1000;
  }

  renderViewModel() {
    if (!this.vmActive || !this.vmContainer || !this.player.mesh) return;

    const width = this.vmContainer.clientWidth || 51;
    const height = this.vmContainer.clientHeight || 72;

    if (!this.vmRenderer) {
      this.vmRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.vmRenderer.setPixelRatio(window.devicePixelRatio * 2); // Supersampling for smoothness
      this.vmContainer.appendChild(this.vmRenderer.domElement);
      
      this.vmScene = new THREE.Scene();
      this.vmScene.background = null;
      this.vmCamera = new THREE.PerspectiveCamera(25, width / height, 0.1, 100);
      this.vmCamera.position.set(0, 0.9, 6.5);
      this.vmCamera.lookAt(0, 0.9, 0);

      const light = new THREE.AmbientLight(0xffffff, 1.0);
      this.vmScene.add(light);
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(5, 5, 5);
      this.vmScene.add(dirLight);
    }
    
    this.vmRenderer.setSize(width, height);
    this.vmCamera.aspect = width / height;
    this.vmCamera.updateProjectionMatrix();

    if ((!this.vmMesh || this.vmMesh.userData.source !== this.player.mesh) && this.player.mesh) {
      if (this.vmMesh) this.vmScene.remove(this.vmMesh);
      this.vmMesh = this.player.mesh.clone();
      this.vmMesh.userData.source = this.player.mesh;
      this.vmMesh.position.set(0, 0, 0);
      this.vmMesh.rotation.set(0, Math.PI, 0); // Face forward (towards camera)
      this.vmMesh.visible = true; 
      this.vmScene.add(this.vmMesh);
      
      this.vmParts = {};
      this.vmMesh.traverse(child => {
          if (child.isMesh) {
              child.material = child.material.clone();
              child.material.depthTest = true;
              child.material.depthWrite = true;
              child.material.transparent = true;
              child.material.alphaTest = 0.5;
              child.material.side = THREE.DoubleSide;
          }
          
          const name = child.name.toLowerCase();
          if (name.includes('pivot')) child.visible = false;
          if (name.includes('layer') || name.includes('hat') || name.includes('jacket') || name.includes('sleeve') || name.includes('pant')) return;
          
          if (!this.vmParts.head && name.includes('head')) {
              this.vmParts.head = child;
              this.vmParts.head.rotation.order = 'YXZ';
          }
          else if (!this.vmParts.armL && ((name.includes('arm') && name.includes('left')) || name.includes('leftarm'))) this.vmParts.armL = child;
          else if (!this.vmParts.armR && ((name.includes('arm') && name.includes('right')) || name.includes('rightarm'))) this.vmParts.armR = child;
          else if (!this.vmParts.legL && ((name.includes('leg') && name.includes('left')) || name.includes('leftleg'))) this.vmParts.legL = child;
          else if (!this.vmParts.legR && ((name.includes('leg') && name.includes('right')) || name.includes('rightleg'))) this.vmParts.legR = child;
      });
    }

    // Reset limbs to neutral pose for the inventory model
    if (this.vmParts) {
      if (this.vmParts.armL) this.vmParts.armL.rotation.set(0, 0, 0);
      if (this.vmParts.armR) this.vmParts.armR.rotation.set(0, 0, 0);
      if (this.vmParts.legL) this.vmParts.legL.rotation.set(0, 0, 0);
      if (this.vmParts.legR) this.vmParts.legR.rotation.set(0, 0, 0);

      // Head looking at mouse logic
      if (this.vmParts.head) {
        const rect = this.vmContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Get mouse position (stored in this.lastMouseX/Y from global listeners)
        const mouseX = this.lastMouseX !== undefined ? this.lastMouseX : window.innerWidth / 2;
        const mouseY = this.lastMouseY !== undefined ? this.lastMouseY : window.innerHeight / 2;
        
        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        
        const angleX = Math.atan2(dx, 50); // Horizontal sensitivity
        const angleY = Math.atan2(dy, 50); // Vertical sensitivity
        
        this.vmParts.head.rotation.y = THREE.MathUtils.clamp(angleX, -Math.PI / 4, Math.PI / 4);
        this.vmParts.head.rotation.x = THREE.MathUtils.clamp(-angleY, -Math.PI / 4, Math.PI / 4);
      }
    }

    // Sync skin if changed
    if (this.vmMesh && this.player.mesh) {
        const getTex = (m) => {
            let tex = null;
            m.traverse(c => { if(c.isMesh && c.material.map) tex = c.material.map; });
            return tex;
        };
        const pTex = getTex(this.player.mesh);
        if (pTex && this.vmMesh.userData.currentSourceTex !== pTex) {
            this.vmMesh.userData.currentSourceTex = pTex;
            this.vmMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    const skinCopy = pTex.clone();
                    skinCopy.magFilter = THREE.NearestFilter;
                    skinCopy.minFilter = THREE.NearestFilter;
                    child.material.map = skinCopy;
                    child.material.needsUpdate = true;
                }
            });
        }
    }

    this.vmRenderer.render(this.vmScene, this.vmCamera);
    if (this.vmActive) {
      requestAnimationFrame(() => this.renderViewModel());
    }
  }

  update() {
    this.updateHighlight();
    if (!this.currentUI && this.isHoldingWand()) {
       // Hide normal highlight if selecting? Optional.
       // Keeping it allows seeing which block you're aiming at before selecting.
    }
    this.updateMining();
    this.updateFurnace();
    
    // Stop movement if chat or inventory is open
    if ((this.chat && this.chat.isOpen) || this.currentUI) {
      return;
    }
    
    if (this.isMobile) {
      this.player.move(this.joystickData.y, this.joystickData.x);
    } else {
      let forward = 0;
      let right = 0;
      
      if (this.keys['w']) forward += 1;
      if (this.keys['s']) forward -= 1;
      if (this.keys['d']) right += 1;
      if (this.keys['a']) right -= 1;
      
      this.player.move(forward, right);
    }
  }

  toggleHud() {
    this.hudVisible = !this.hudVisible;
    if (this.hudVisible) {
      document.body.classList.remove('hide-hud');
    } else {
      document.body.classList.add('hide-hud');
      this.highlightMesh.visible = false;
    }

    if (this.player && this.player.fpHandGroup) {
      this.player.fpHandGroup.visible = this.hudVisible && (this.player.cameraMode === 0);
    }
  }

  updateHighlight() {
    this.targetBlockPos = null;
    if (!this.hudVisible) {
      this.highlightMesh.visible = false;
      return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    const maxDistance = 5;
    const step = 0.1;
    let found = false;
    const point = new THREE.Vector3();
    
    for (let i = 0; i < maxDistance / step; i++) {
      raycaster.ray.at(i * step, point);
      
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      const z = Math.floor(point.z);
      
      const b = this.world.getBlock(x, y, z);
      if (b !== 0 && b._isFluid !== true && b !== BLOCK_TYPES.WATER_BUCKET) {
        this.highlightMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        this.highlightMesh.visible = true;
        this.targetBlockPos = { x, y, z, type: b };
        found = true;
        break;
      }
    }
    
    if (!found) {
      this.highlightMesh.visible = false;
    }
  }

  updateMining() {
    if (!this.isMining) {
      this.breakingMesh.visible = false;
      this.miningTarget = null;
      return;
    }

    // Keep the hand swinging as long as the button is held
    if (this.player && !this.player.isSwinging) {
       this.player.swingHand();
    }
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    
    let target = null;
    const maxDistance = 5;
    const step = 0.1;
    
    // Find target block
    for (let i = 0; i < maxDistance / step; i++) {
      const point = raycaster.ray.origin.clone().add(
        raycaster.ray.direction.clone().multiplyScalar(i * step)
      );
      
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      const z = Math.floor(point.z);
      
      const b = this.world.getBlock(x, y, z);
      if (b !== 0 && b !== BLOCK_TYPES.WATER_BUCKET) {
        target = { x, y, z };
        break;
      }
    }
    
    if (target) {
      const key = `${target.x},${target.y},${target.z}`;
      
      if (this.miningTarget !== key) {
        this.miningTarget = key;
        this.miningStartTime = performance.now();
        this.updateBreakIndicator(0, target);
      } else {
        const blockType = this.world.getBlock(target.x, target.y, target.z);
        const heldItem = this.inventory[this.selectedSlot];
        const toolType = heldItem ? heldItem.type : null;
        
        const duration = this.getMiningDuration(blockType, toolType);
        const now = performance.now();
        
        const elapsed = now - this.miningStartTime;
        const progress = Math.min(elapsed / duration, 1);
        this.updateBreakIndicator(progress, target);
        
        if (now - this.lastParticleTime > 100) {
          this.world.createMiningParticles(target.x, target.y, target.z, blockType);
          this.lastParticleTime = now;
        }

        if (progress >= 1) {
          this.world.removeBlock(target.x, target.y, target.z);

          let canDrop = true;
          // Stone drops require a pickaxe
          if (blockType === BLOCK_TYPES.STONE || blockType === BLOCK_TYPES.COBBLESTONE || blockType === BLOCK_TYPES.FURNACE || blockType === BLOCK_TYPES.DEEPSLATE) {
             if (this.getToolCategory(toolType) !== 'pickaxe') canDrop = false;
          }

          if (canDrop) {
            this.world.dropItem(target.x, target.y, target.z, blockType);
          }
          
          this.player.playBreakSound(blockType);
          this.miningStartTime = performance.now(); // Reset to allow continuous mining
          this.updateBreakIndicator(0, null);
          this.miningTarget = null;
        }
      }
    } else {
      this.miningTarget = null;
      this.updateBreakIndicator(0, null);
    }
  }

  updateBreakIndicator(progress, target) {
    if (progress > 0 && target && this.destroyTextures.length > 0) {
      const stageIndex = Math.floor(progress * this.destroyTextures.length);
      const texIndex = Math.min(stageIndex, this.destroyTextures.length - 1);
      
      this.breakingMesh.material.map = this.destroyTextures[texIndex];
      this.breakingMesh.material.needsUpdate = true;
      
      this.breakingMesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
      this.breakingMesh.visible = true;
    } else {
      this.breakingMesh.visible = false;
    }
  }

  updateFurnace() {
    const INPUT = 60;
    const FUEL = 61;
    const RESULT = 62;
    
    const inputItem = this.inventory[INPUT];
    const fuelItem = this.inventory[FUEL];
    const resultItem = this.inventory[RESULT];
    
    let isBurning = this.furnaceState.burnTime > 0;
    
    // Decrement burn time
    if (this.furnaceState.burnTime > 0) {
      this.furnaceState.burnTime--;
    }
    
    // Check if we can smelt
    if (!isBurning) {
      // Can we start burning?
      if (fuelItem && inputItem) {
        const resultType = this.getSmeltingResult(inputItem.type);
        if (resultType) {
           // Check if result slot allows it
           if (!resultItem || (resultItem.type === resultType && resultItem.count < 64)) {
             const burnVal = this.getFuelValue(fuelItem.type);
             if (burnVal > 0) {
               this.furnaceState.burnTime = burnVal;
               this.furnaceState.currentMaxBurn = burnVal;
               fuelItem.count--;
               if (fuelItem.count <= 0) this.inventory[FUEL] = null;
               isBurning = true;
               if (this.currentUI === 'furnace') this.updateInternalUI();
             }
           }
        }
      }
    }
    
    if (isBurning && inputItem) {
      const resultType = this.getSmeltingResult(inputItem.type);
      if (resultType) {
        if (!resultItem || (resultItem.type === resultType && resultItem.count < 64)) {
          this.furnaceState.cookTime++;
          
          if (this.furnaceState.cookTime >= this.furnaceState.maxCookTime) {
            this.furnaceState.cookTime = 0;
            
            // Smelt
            inputItem.count--;
            if (inputItem.count <= 0) this.inventory[INPUT] = null;
            
            if (resultItem) {
              resultItem.count++;
            } else {
              this.inventory[RESULT] = { type: resultType, count: 1 };
            }
            
            if (this.currentUI === 'furnace') this.updateInternalUI();
          }
        } else {
          this.furnaceState.cookTime = 0;
        }
      } else {
        this.furnaceState.cookTime = 0;
      }
    } else {
      this.furnaceState.cookTime = 0;
    }
  }
  
  getFuelValue(type) {
    if (type === BLOCK_TYPES.COAL) return 1600;
    if (type === BLOCK_TYPES.OAK_LOG || type === BLOCK_TYPES.BIRCH_LOG) return 300;
    if (type === BLOCK_TYPES.OAK_PLANKS || type === BLOCK_TYPES.BIRCH_PLANKS) return 300;
    if (type === BLOCK_TYPES.STICK) return 100;
    if (type === BLOCK_TYPES.CRAFTING_TABLE) return 300;
    return 0;
  }
  
  getSmeltingResult(inputType) {
    // Check loaded custom furnace recipes
    if (this.recipes.length > 0) {
      const custom = this.recipes.find(r => r.type === 'furnace' && r.input === inputType);
      if (custom) return custom.result.type;
    }

    if (inputType === BLOCK_TYPES.RAW_IRON) return BLOCK_TYPES.IRON_INGOT;
    if (inputType === BLOCK_TYPES.RAW_GOLD) return BLOCK_TYPES.GOLD_INGOT;
    if (inputType === BLOCK_TYPES.OAK_LOG || inputType === BLOCK_TYPES.BIRCH_LOG) return BLOCK_TYPES.COAL;
    if (inputType === BLOCK_TYPES.COBBLESTONE) return BLOCK_TYPES.STONE;
    return null;
  }

  getInventoryData() {
    return this.inventory;
  }

  setInventoryData(data) {
    if (Array.isArray(data)) {
        // Safe deep copy/restore
        this.inventory = data.map(item => item ? { ...item } : null);
        // Ensure size
        while (this.inventory.length < 70) this.inventory.push(null);
        this.inventory.length = 70;
        
        this.updateHotbarUI();
        if (this.currentUI) this.updateInternalUI();
    }
  }

  dispose() {
    if (this.boundOnKeyDown) window.removeEventListener('keydown', this.boundOnKeyDown);
    if (this.boundOnKeyUp) window.removeEventListener('keyup', this.boundOnKeyUp);
    if (this.boundOnDragMove) window.removeEventListener('mousemove', this.boundOnDragMove);
    if (this.boundOnTouchMove) window.removeEventListener('touchmove', this.boundOnTouchMove);
    if (this.boundOnContextMenu) window.removeEventListener('contextmenu', this.boundOnContextMenu);
    if (this.boundOnWheel) window.removeEventListener('wheel', this.boundOnWheel);
    
    // Clean up joystick
    if (this.joystick) {
      this.joystick.destroy();
    }
    
    this.cleanupMobileUI();
    document.body.classList.remove('hide-hud');
  }

  cleanupMobileUI() {
    // Helper to replace an element with its clone to strip listeners
    const resetElement = (id) => {
      const el = document.getElementById(id);
      if (el) {
        const newEl = el.cloneNode(true);
        if (el.parentNode) el.parentNode.replaceChild(newEl, el);
      }
    };

    const ids = [
      'btn-break', 'btn-place', 'btn-jump', 'btn-throw', 'btn-close-inv', 
      'btn-slot-left', 'btn-slot-right', 'btn-inv-mode', 
      'chat-button-mobile', 'btn-crouch', 'inv-button-mobile'
    ];
    ids.forEach(resetElement);
  }
}