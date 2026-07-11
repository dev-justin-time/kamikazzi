# BLOCKBUSTER — Voxel World: Audit Report

**Date:** July 10, 2026
**Scope:** All files in `games/BLOCKBUSTER/`

---

## Overview

A Minecraft-inspired voxel game built with Three.js, featuring block breaking/placing, crafting, furnace smelting, inventory management, a zombie enemy system, chat, and multiplayer via WebsimSocket. The game is titled "Voxel World" in `index.html`.

---

## File Inventory

### Source Files (7 JS + 2 HTML + 1 CSS)

| File | Lines | Role | Status |
|------|-------|------|--------|
| `main.js` | 3,818 | Game engine core — init, game loop, settings, UI, WebsimSocket multiplayer | ✅ Active |
| `controls.js` | 2,333 | Input handling — keyboard, mouse, pointer lock, nipplejs mobile joystick, inventory slot mapping | ✅ Active |
| `world.js` | 2,022 | World generation — chunk system (16×64), block types, terrain, lighting, meshing | ✅ Active |
| `player.js` | 953 | Player — physics, AABB, movement (walk/sprint/crouch), health, hunger, arm swing | ✅ Active |
| `chat.js` | 908 | Chat system — WebsimSocket multiplayer chat, commands (/gamemode, /tp, /time, /give) | ✅ Active |
| `zombie.js` | 306 | Zombie enemy — AI pathfinding, health, attack, despawn, Three.js mesh rendering | ✅ Active |
| `megafix.js` | ~50 | Patch script — fixes airplane mesh collision/raycast targeting, adds sign-on-a-stick UI | ⚠️ See notes |
| `index.html` | ~200 | Game UI — inventory, crafting, furnace, health/hunger bars, chat, hotbar | ✅ Active |
| `megafix.html` | — | Megafix standalone page | ⚠️ See notes |
| `megafix.css` | — | Megafix styles | ⚠️ See notes |

### Data Files (22 JSON + 3 TXT)

| Category | Files | Purpose |
|----------|-------|---------|
| Recipes | `diamond_tool_recipes.json`, `gold_and_iron_tool_recipes.json`, `stone_tool_recipes.json`, `wood_tool_recipes.json` | Crafting recipes per tool tier |
| Animations | `block_animation (2).json`, `block_animation (3).json`, `hand_animation.json`, `item_animation (3).json`, `item_animation (4).json`, `tool_animation (1).json`, `tool_animation (2).json` | Block/item/tool break animations |
| Settings | `hand_settings.json`, `held_block_settings (1).json`, `held_block_settings (2).json`, `held_item_settings (2-4).json`, `held_tool_settings (1-2).json` | First-person held item rendering |
| UI | `Flowers.json`, `Hearts.json`, `UI_Buttons.json` | UI element definitions |

### UI Layout Data (3 TXT)

| File | Purpose |
|------|---------|
| `crafting_table.txt` | Crafting table UI slot positions (3×3 grid + result + hotbar) |
| `furnace.txt` | Furnace UI slot positions (input + fuel + result + hotbar) |
| `inventory.txt` | Player inventory layout (armor, offhand, crafting, storage, hotbar) |

### Asset Files (111 PNG + 70 OGG + 1 MP3)

| Category | Count | Examples |
|----------|-------|---------|
| Block textures | ~40 | `grass_block_side_16x16.png`, `cobblestone_16x16.png`, `dirt_16x16.png`, `deepslate_16x16.png` |
| Item textures | ~25 | `diamond.png`, `diamond_sword.png`, `gold_ingot.png`, `stick.png` |
| UI textures | ~15 | `hotbar.png`, `crafting_table_ui.png`, `furnace_ui.png`, `experience_bar_background.png` |
| Block preview | ~10 | `Cobblestone.png`, `Dirt.png`, `Furnace.png`, `Grass_Block.png` (large previews) |
| Effects | ~10 | `fire_0.png`, `destroy_stage_*.png`, `bubble.png`, `foliage.png` |
| Sound (OGG) | 70 | `breakgrass1-3.ogg`, `breaksand1-3.ogg`, `breakstone1-3.ogg`, `breakwood1-3.ogg`, `grass1-3.ogg`, `fall*.ogg`, `click.ogg`, `hit3.ogg` |
| Sound (MP3) | 1 | `asset_name.mp3` |
| Other | 1 | `path/` subdirectory (contains single file `to`) |

### Duplicate/Numbered Files

| Pattern | Files | Status |
|---------|-------|--------|
| `dirt_16x16 (1).png`, `dirt_16x16 (2).png` | Identical dirt texture copies | ⚠️ Duplicate |
| `held_block_settings (1).json`, `(2).json` | Versioned held block settings | ⚠️ Review |
| `held_item_settings (2).json`, `(3).json`, `(4).json` | Versioned held item settings | ⚠️ Review |
| `held_tool_settings (1).json`, `(2).json` | Versioned held tool settings | ⚠️ Review |
| `block_animation (2).json`, `(3).json` | Versioned block animations | ⚠️ Review |
| `item_animation (3).json`, `(4).json` | Versioned item animations | ⚠️ Review |
| `tool_animation (1).json`, `(2).json` | Versioned tool animations | ⚠️ Review |
| `crafting_table_ui.png`, `crafting_table_ui_fixed.png` | Old vs fixed UI | ⚠️ Old version kept |
| `furnace_ui.png`, `furnace_ui_fixed.png` | Old vs fixed UI | ⚠️ Old version kept |
| `Flowers.png` / `Flowers.json` | Texture + animation pair | ✅ Pair |

---

## Architecture

```
index.html
  └─ main.js (game loop, settings, WebsimSocket)
       ├─ world.js (chunks, blocks, terrain gen, lighting)
       ├─ player.js (physics, AABB, health, hunger)
       ├─ controls.js (keyboard, mouse, pointer lock, mobile)
       ├─ chat.js (multiplayer chat, commands)
       ├─ zombie.js (enemy AI, pathfinding, combat)
       └─ megafix.js (airplane mesh patch — separate concern)
```

- **No build system** — vanilla JS with ES module imports
- **Multiplayer** — WebsimSocket for real-time sync (chat, player positions)
- **Persistence** — WebsimSocket handles world state storage
- **Mobile support** — nipplejs joystick, touch events in controls.js
- **No framework** — pure Three.js + vanilla DOM

---

## Block Types (from world.js)

| ID | Block | Category |
|----|-------|----------|
| 0 | AIR | Structural |
| 1 | GRASS_BLOCK | Natural |
| 2 | DIRT | Natural |
| 3 | STONE | Natural |
| 4 | COBBLESTONE | Building |
| 5 | OAK_LOG | Natural |
| 6 | OAK_PLANKS | Building |
| 7 | OAK_LEAVES | Natural |
| 8 | CRAFTING_TABLE | Functional |
| 9 | FURNACE | Functional |
| 10 | DEEPSLATE | Natural |
| 11 | SAND | Natural |
| 12-22 | Tools (wood/stone/gold/diamond axe/pick/shovel/sword/hoe + stick) | Items |
| 23+ | Additional items (coal, diamond, gold ingot, flowers, etc.) | Items |

---

## Cleanup Recommendations

| Priority | Action | Files Affected |
|----------|--------|----------------|
| 🔴 High | Delete `dirt_16x16 (1).png` and `dirt_16x16 (2).png` — identical duplicates | 2 files |
| 🔴 High | Delete old UI textures (`crafting_table_ui.png`, `furnace_ui.png`) if `_fixed` versions are the active ones | 2 files |
| 🟡 Medium | Consolidate versioned JSON files — determine which version is active and remove old ones | ~12 files |
| 🟡 Medium | Rename `asset_name.mp3` to something descriptive (or delete if unused) | 1 file |
| 🟢 Low | Remove `path/to` subdirectory if it's a stray artifact | 1 dir |
| 🟢 Low | Verify `megafix.js/html/css` are still needed — they appear to be a one-off airplane patch | 3 files |

### Space Savings

Deleting confirmed duplicates and old UI versions could free up **~200 KB**.

---

## Key Observations

1. **Well-structured modular code** — Clean separation of concerns across 6 JS files
2. **Feature-complete Minecraft clone** — Crafting, furnace, inventory, health, hunger, zombie enemies, multiplayer chat
3. **Versioned JSON files suggest iterative development** — Multiple `(1)`, `(2)`, `(3)` suffixes indicate files were updated without removing old versions
4. **Two HTML entry points** — `index.html` (main game) and `megafix.html` (airplane patch) — the megafix is an independent concern
5. **Large asset footprint** — 111 PNGs + 70 OGGs for a relatively simple voxel game; many are small 16×16 textures but the block previews (Cobblestone.png, Dirt.png, etc.) are 40-55 KB each
6. **No minification or bundling** — All JS is served as-is, which is fine for development but could be optimized for production
