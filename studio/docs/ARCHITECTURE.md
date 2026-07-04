# ProModeler Studio - Architecture

## Modular Architecture
- **Entry Point:** `index.html` loads `app.js`.
- **Core (`ProModelerStudio`):**
  - Manages the 3D scene, renderer, camera, and controls.
  - Orchestrates sub-systems.
  - Holds application state (objects, materials, animations).
- **UI Layer (`UIManager`):**
  - Handles DOM interactions (clicks, inputs, resizing).
  - Updates DOM elements.
  - Manages overlays (Loading state).
- **Input Layer (`InputManager`):**
  - Handles Keyboard, Mouse, and Touch inputs.
  - Manages Raycasting for selection and sculpting.
  - Computes movement vectors.

## Systems (Modules)
- **`ProceduralSystem.js`:** Terrain, tree, and city generation.
- **`PhysicsSystem.js`:** Cannon.js integration for rigid bodies. Uses SAP Broadphase for optimization.
- **`SculptSystem.js`:** Vertex manipulation brushes. Uses Spatial Hashing (Grid) for O(1) vertex lookups.
- **`NodeEditorSystem.js`:** Visual material graph editor.

## Data Flow
1. **User Input** -> **InputManager** (updates state/raycasts) or **UIManager** (menu clicks).
2. **Managers** call **Studio** methods.
3. **Studio** updates **Scene Graph** and **State**.
4. **Studio** notifies **UIManager** to update views.
5. **Render Loop** draws scene.

## Key Managers
- **Input:** `InputManager` centralizes all input logic.
- **Selection:** `Studio` manages selection state, `InputManager` handles the picking logic.
- **Plugins:** Dynamic extension system.

