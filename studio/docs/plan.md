# Merge Plan: Integrate Uploaded Files & Prompts into ProModeler Studio

Goal
- Fully merge new uploaded files and the set of user prompts into the existing codebase in a deterministic, testable way without shortcuts, while respecting environment constraints and token/size limits.

Principles
- One atomic change per commit/step: modify one module or configuration at a time.
- Verify after each step with lightweight runtime checks or unit-like smoke tests.
- Use safe fallbacks and placeholders when external resources or heavy operations are needed.
- Prefer non-destructive edits (add new helpers/files) over large edits to existing complex files.
- Document each change and recovery steps to revert if errors occur.

Preparation (0)
0.1. Create plan.md in repository (this file) to be the single source-of-truth for the merge.
0.2. Open the app in a local dev environment (browser + server) and confirm current boot state and console errors.
0.3. Take a backup copy (zip) of current project files or commit to version control.

Phase 1 — Inventory & Categorization (1)
1.1. List all uploaded/modified files (provided). Classify by type: UI, systems, managers, assets.
1.2. Identify overlapping responsibilities and potential conflicts (duplicate UI managers, multiple main entry points).
1.3. Create a small "merge-matrix" document (merge-matrix.json) mapping file -> responsibilities and required canonical module.

Phase 2 — Sanity & Minimal Entrypoint (2)
2.1. Ensure only one application entrypoint runs in index.html; pick the canonical index used during dev (index (1).html or index.html). For safety, avoid runtime duplicate script loads.
2.2. Create a lightweight bootstrap check that runs at boot and logs registered systems; if null references exist, fail gracefully with a UI message rather than throwing.
2.3. Add placeholder compatibility shims for optional modules (cloud, physics, audio, import/export) so missing modules won't break init — implement as lazy wrappers.

Phase 3 — Module Initialization Ordering & Safe inits (3)
3.1. Document and enforce the intended initialization order: Core (scene, camera, renderer) → Controls → UI → InputManager → Systems (Physics/Procedural/Audio/Cloud) → Import/Export → Post-init tasks (profilers, node editor).
3.2. Modify systems' constructors/init to be idempotent and tolerant of null dependencies; if a dependency is missing, queue init retry later.
3.3. Add a lightweight SystemManager that registers and initializes systems in defined order and retries transient inits once after bootstrap.

Phase 4 — UI Merge & Menu Consolidation (4)
4.1. Consolidate top-level menu elements: ensure dropdown toggling uses consistent open/close behaviour and doesn't rely on direct element existence at construction time.
4.2. Replace direct getElementById lookups in UI constructors with safe getters (create placeholder if missing) — already present in ui-manager.js; audit similar patterns in other UI modules and add small wrappers where necessary.
4.3. Convert large dropdown content to scrollable sections with stable heights to avoid overflow on mobile and to respect one-screen-no-scroll constraints where required.

Phase 5 — Input & Interaction (5)
5.1. Ensure InputManager initialization happens after renderer.domElement exists; add defensive checks and a retry if domElement is null.
5.2. Make joystick (#joystick) creation dynamic only on touch devices; lazy-load nipplejs via importmap/esm when needed.
5.3. Centralize drag-drop handling to one element (#viewport) and ensure file import fallback via import popup.

Phase 6 — Import/Export & GLTF Multi-file (6)
6.1. Use ImportExportManager as the single facade for imports/exports; ensure ModelEditor.importModel delegates to ImportExportManager and supports {url, files} multi-file payloads.
6.2. Ensure GLTFLoader.manager.setURLModifier is restored after multi-file loads; add robust revoke of created object URLs.
6.3. Add error handling and user messages for unsupported extensions; queue heavy decoders (Draco) only if needed.

Phase 7 — Systems Merging (Physics, Procedural, Sculpt, Paint, Vertex, Audio, Cloud) (7)
7.1. For each system file:
    - Ensure exports are named and importers refer to same path.
    - Make init() idempotent and avoid immediate execution at module import time.
    - Add guard clauses against missing studio properties (e.g., studio.scene, studio.renderer).
7.2. For PhysicsSystem: ensure cannon-es import is guarded and that world.step is only called when enabled.
7.3. For procedural & cloud systems: ensure they only add objects via studio.scene.add and append to studio.objects consistently.
7.4. For sculpt/paint systems: ensure raycast-driven updates only execute when enabled and selectedObject exists.

Phase 8 — Node Editor & Material Graph (8)
8.1. Ensure NodeEditorSystem.init can be invoked even when node-editor DOM isn't present; return early if not present but register to render when panel becomes visible.
8.2. Make applyGraphToMaterial safe for non-standard materials; fallback to setting simple params only.
8.3. Ensure connections SVG is cleared and rebuilt when nodes move; add debounce for updateConnections to avoid jank.

Phase 9 — Performance & Profile (9)
9.1. Add a lightweight profiler toggle (already present) but make its update calls safe when renderer.info is undefined.
9.2. Add throttling for updateViewportStats to avoid over-updating DOM.

Phase 10 — Rigging & Animation (10)
10.1. Ensure rigging UI calls are safe when editor lacks rigging internals (stubs exist); make rig methods idempotent and non-throwing.
10.2. Ensure AnimationManager methods check presence of clips and mixer before calling.

Phase 11 — Testing & Verification (11)
11.1. Smoke tests: boot app, add primitive, import a simple GLB, toggle paint modes, enable physics, create cloth, duplicate object, export scene JSON — verify UI messages and no fatal errors.
11.2. Edge cases: missing DOM nodes, missing third-party libs (nipplejs, cannon-es), network glTF import failures — make sure app logs user-friendly messages and recovers.

Phase 12 — Deployment & Rollback Plan (12)
12.1. Commit changes incrementally with clear messages per phase. Use feature branches if available.
12.2. If a step causes regression, revert the individual commit and re-run subsequent tests.
12.3. For production builds, run a minimal bundler/transpiler and verify importmap correctness.

Workarounds & Token/Size Constraints
- Avoid monolithic edits: break changes into small edits and new helper files (SystemManager, compatibility shims).
- For heavy assets or decoders (Draco), lazily load via dynamic import only when needed to keep initial payload small.
- For long text or document generation, store large documentation externally or in small paginated files (plan sections per file) to respect editor limits.
- Use lightweight placeholders for features that require heavy compute (baking, remeshing); expose UI "simulate" messages rather than performing heavy operations in the browser.

Appendix: Quick Merge Checklist (for each module)
- [ ] Confirm exports/imports path match.
- [ ] Add defensive null checks for studio.* dependencies.
- [ ] Make init() idempotent and non-throwing.
- [ ] Wire UI elements safely via safe-get helper.
- [ ] Add console/UI logs on success/error.
- [ ] Run smoke tests for the module.

Acceptance Criteria
- App starts without uncaught TypeErrors referencing null DOM elements.
- Import popup multi-file glTF workflow works: files map resolves resources via URLModifier, model is positioned on ground and faces camera.
- Toggling paint/sculpt/vertex modes disables OrbitControls and allows mode-specific updates without breaking other input handlers.
- Physics toggles and cloth/fluid creation do not break when cannon-es is absent; platform shows helpful message.
- Menus are responsive, dropdowns scroll when content exceeds viewport, and mobile joystick only initializes when nipplejs present.

Estimated time & commits
- Estimated merge time: 3–6 hours broken into ~10 commits aligned to phases above.
- Commit naming: phase-01-inventory, phase-02-bootstrap, phase-03-system-manager, phase-04-ui-safety, etc.

Notes for you
- Follow the checklist per file when applying edits; prefer adding small compatibility helpers over large in-place rewrites when under time/resource constraints.
- When in doubt, add defensive guards and log details to the console/UI for faster debugging.