/**
 * ModelPreviewRenderer — Interactive 3D product preview for the marketplace.
 *
 * Renders a spinning, interactive Three.js preview of the product asset.
 * For demo products (no real geometry), generates category-specific
 * procedural geometry so each product type looks distinctive.
 *
 * Features:
 * - Auto-rotation with configurable speed
 * - Mouse drag to orbit
 * - Category-specific procedural geometry generation
 * - Proper Three.js resource cleanup on destroy
 * - Responsive resize handling
 * - Loading states and error handling
 */

import * as THREE from 'three';

export class ModelPreviewRenderer {
  /**
   * @param {HTMLElement} container - The DOM element to mount the canvas into
   * @param {Object} product - The product object from MarketplaceStore
   * @param {Object} [options]
   * @param {number} [options.rotationSpeed] - Degrees per second (default 30)
   * @param {string} [options.backgroundColor] - CSS color string (default #222222)
   * @param {boolean} [options.autoRotate] - Enable auto-rotation (default true)
   * @param {boolean} [options.interactive] - Enable mouse drag interaction (default true)
   */
  constructor(container, product, options = {}) {
    if (!container) throw new Error('ModelPreviewRenderer requires a container element');
    if (!product) throw new Error('ModelPreviewRenderer requires a product object');

    this.container = container;
    this.product = product;
    this.options = {
      rotationSpeed: options.rotationSpeed ?? 30,
      backgroundColor: options.backgroundColor ?? '#222222',
      autoRotate: options.autoRotate ?? true,
      interactive: options.interactive ?? true,
    };

    // Three.js objects
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.modelGroup = null;  // The main group containing all preview objects
    this.lights = [];

    // Interaction state
    this._isDragging = false;
    this._previousMouse = { x: 0, y: 0 };
    this._targetRotation = { x: 0.3, y: 0 }; // Starting rotation (slight tilt)
    this._currentRotation = { x: 0.3, y: 0 };

    // Animation
    this._animationId = null;
    this._clock = new THREE.Clock();
    this._resizeObserver = null;

    // Element dimensions cached for resize
    this._width = 0;
    this._height = 0;
  }

  /**
   * Initialize the renderer, scene, camera, and generate the preview model.
   * Call this after the container is visible (has dimensions).
   */
  init() {
    const rect = this.container.getBoundingClientRect();
    this._width = rect.width || 300;
    this._height = rect.height || 300;

    this._createRenderer();
    this._createScene();
    this._createCamera();
    this._addLighting();
    this._buildPreviewModel();
    this._attachInteraction();
    this._attachResize();
    this._startAnimation();

    return this;
  }

  /* ── Three.js Setup ── */

  _createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(this._width, this._height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(this.options.backgroundColor);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Style the canvas
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    // Clear container and append
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);
  }

  _createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);

    // Subtle ground grid
    const gridHelper = new THREE.GridHelper(4, 12, '#444444', '#333333');
    gridHelper.position.y = -1.5;
    this.scene.add(gridHelper);

    // Subtle hemisphere ambient
    const hemiLight = new THREE.HemisphereLight(0x606080, 0x404040, 0.6);
    this.scene.add(hemiLight);
  }

  _createCamera() {
    const aspect = this._width / this._height;
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 50);
    this.camera.position.set(4, 3, 5);
    this.camera.lookAt(0, 0, 0);
  }

  _addLighting() {
    // Key light — warm, from upper-right
    const keyLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(512, 512);
    this.scene.add(keyLight);
    this.lights.push(keyLight);

    // Fill light — cool, from left
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.6);
    fillLight.position.set(-4, 2, 3);
    this.scene.add(fillLight);
    this.lights.push(fillLight);

    // Rim light — from behind
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 1, -6);
    this.scene.add(rimLight);
    this.lights.push(rimLight);
  }

  /* ── Preview Model Generation ── */

  _buildPreviewModel() {
    this.modelGroup = new THREE.Group();

    // Determine what to show based on product data
    const product = this.product;

    // If the product has embedded bundle geometry data, try to reconstruct it
    // Otherwise, generate procedural preview based on category
    if (product.bundleData?.items?.length > 0) {
      this._buildFromBundleData(product.bundleData);
    } else {
      this._buildProceduralPreview(product);
    }

    // Center the group
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    const size = box.getSize(new THREE.Vector3()).length();
    if (size > 0) {
      const center = box.getCenter(new THREE.Vector3());
      this.modelGroup.position.sub(center);

      // Scale to fit view if needed
      if (size > 6) {
        this.modelGroup.scale.setScalar(6 / size);
      } else if (size < 0.5) {
        this.modelGroup.scale.setScalar(0.5 / size);
      }
    }

    this.scene.add(this.modelGroup);

    // Set initial rotation from target
    this.modelGroup.rotation.x = this._currentRotation.x;
    this.modelGroup.rotation.y = this._currentRotation.y;
  }

  /**
   * Reconstruct preview from serialized bundle geometry data.
   * Falls back to procedural if data is insufficient.
   */
  _buildFromBundleData(bundleData) {
    const items = bundleData.items || [];
    let builtCount = 0;

    for (const item of items) {
      if (item.geometry) {
        const mesh = this._reconstructMesh(item);
        if (mesh) {
          // Apply stored transform
          if (item.position) mesh.position.fromArray(item.position);
          if (item.rotation) mesh.rotation.fromArray(item.rotation);
          if (item.scale) mesh.scale.fromArray(item.scale);
          this.modelGroup.add(mesh);
          builtCount++;
        }
      }

      // Recurse for children
      if (item.children?.length > 0) {
        for (const child of item.children) {
          const childMesh = this._reconstructMesh(child);
          if (childMesh) {
            if (child.position) childMesh.position.fromArray(child.position);
            if (child.rotation) childMesh.rotation.fromArray(child.rotation);
            if (child.scale) childMesh.scale.fromArray(child.scale);
            this.modelGroup.add(childMesh);
            builtCount++;
          }
        }
      }
    }

    // If no items could be reconstructed, fall back to procedural
    if (builtCount === 0) {
      this._buildProceduralPreview(this.product);
    }
  }

  /**
   * Reconstruct a simple Three.js mesh from serialized item data.
   * Since bundle data stores parameters rather than raw geometry,
   * we create parametric geometries where possible.
   */
  _reconstructMesh(item) {
    if (!item || item.type !== 'mesh') return null;

    let geometry = null;

    // Try to recreate from geometry parameters
    const params = item.geometry?.parameters;
    if (params) {
      geometry = this._parametricGeometry(params);
    }

    // Fallback: create a placeholder mesh
    if (!geometry) {
      geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    }

    // Build material
    const material = this._buildMaterial(item.material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = item.name || 'Asset';
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  /**
   * Attempt to recreate geometry from serialized parameters
   */
  _parametricGeometry(params) {
    if (!params) return null;

    try {
      // Map common Three.js geometry types
      if (params.radius !== undefined && params.radiusTop !== undefined) {
        // CylinderGeometry or CapsuleGeometry
        return new THREE.CylinderGeometry(
          params.radiusTop, params.radiusBottom || params.radiusTop,
          params.height || 1, params.radialSegments || 16
        );
      }
      if (params.radius !== undefined && params.width !== undefined && params.height !== undefined) {
        // Likely a SphereGeometry — use radius
        return new THREE.SphereGeometry(params.radius, 24, 18);
      }
      if (params.radius !== undefined) {
        return new THREE.SphereGeometry(params.radius, 24, 18);
      }
      if (params.width !== undefined && params.height !== undefined && params.depth !== undefined) {
        return new THREE.BoxGeometry(params.width, params.height, params.depth);
      }
      if (params.width !== undefined && params.height !== undefined) {
        return new THREE.PlaneGeometry(params.width, params.height);
      }
    } catch {
      // Silently fall through
    }

    return null;
  }

  /**
   * Build material from serialized data, or generate one based on product theme
   */
  _buildMaterial(materialData) {
    if (materialData) {
      // Handle array of materials — use first
      const mat = Array.isArray(materialData) ? materialData[0] : materialData;
      if (mat) {
        const color = mat.color !== undefined ? mat.color : 0x60a5fa;
        return new THREE.MeshStandardMaterial({
          color,
          roughness: mat.roughness ?? 0.3,
          metalness: mat.metalness ?? 0.6,
          envMapIntensity: 0.8,
        });
      }
    }

    // Default material
    return new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      roughness: 0.3,
      metalness: 0.6,
      envMapIntensity: 0.8,
    });
  }

  /**
   * Generate a distinctive 3D preview based on product category and title.
   * Each category gets a unique visual style so users can identify product
   * types at a glance.
   */
  _buildProceduralPreview(product) {
    const category = product.category || 'misc';
    const accentColor = this._getAccentColor(product);

    switch (category) {
      case 'sculpting':
        this._buildSculptingPreview(accentColor);
        break;
      case 'modeling':
        this._buildModelingPreview(accentColor);
        break;
      case 'materials':
        this._buildMaterialsPreview(accentColor);
        break;
      case 'animation':
        this._buildAnimationPreview(accentColor);
        break;
      case 'environment':
        this._buildEnvironmentPreview(accentColor);
        break;
      case 'physics':
        this._buildPhysicsPreview(accentColor);
        break;
      case 'generator':
        this._buildGeneratorPreview(accentColor);
        break;
      case 'workflow':
        this._buildWorkflowPreview(accentColor);
        break;
      default:
        this._buildDefaultPreview(accentColor);
        break;
    }
  }

  /**
   * Derive an accent color from the product title for visual variety
   */
  _getAccentColor(product) {
    const colors = [
      0x60a5fa, // Blue
      0x34d399, // Emerald
      0xf472b6, // Pink
      0xa78bfa, // Violet
      0xfb923c, // Orange
      0x22d3ee, // Cyan
      0xfbbf24, // Amber
      0x4ade80, // Green
      0xf87171, // Red
      0x818cf8, // Indigo
    ];

    // Deterministic color from title hash
    let hash = 0;
    const str = product.title || '';
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }

    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  }

  /* ── Category-Specific Preview Builders ── */

  /**
   * Sculpting: A bust-like form with organic, smooth surfaces
   * Uses geometry morphing to simulate sculpted clay
   */
  _buildSculptingPreview(color) {
    // Create a bust-like form from a sphere with vertex displacement
    const geo = new THREE.SphereGeometry(1.0, 48, 48);

    // Displace vertices for a bust-like shape
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const noise = Math.sin(x * 3) * Math.cos(y * 4) * Math.sin(z * 2) * 0.08
                  + Math.sin(x * 7 + y * 5) * 0.04;
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len;
      const ny = y / len;
      const nz = z / len;

      // Elongate the "head" shape
      const scale = 1 + ny * 0.3;
      pos.setXYZ(i,
        x + nx * noise * scale,
        y * 1.2 + ny * noise * scale,
        z + nz * noise * scale
      );
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1,
      flatShading: false,
      envMapIntensity: 0.6,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    // Add a small pedestal
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.9, 0.15, 24),
      new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.2 })
    );
    pedestal.position.y = -1.3;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    this.modelGroup.add(pedestal);
  }

  /**
   * Modeling: A complex geometric form — torus knot with intricate shape
   */
  _buildModelingPreview(color) {
    const geo = new THREE.TorusKnotGeometry(0.8, 0.3, 128, 32);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.2,
      metalness: 0.8,
      envMapIntensity: 1.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);

    // Wireframe overlay for "wireframe modeling" feel
    const wireframe = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.8, 0.3, 24, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.08,
      })
    );
    this.modelGroup.add(wireframe);
    this.modelGroup._wireframe = wireframe;
  }

  /**
   * Materials: A detailed sphere showcasing material properties
   * Shows reflections, roughness, and color
   */
  _buildMaterialsPreview(color) {
    // Main material sphere
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 48, 48),
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.15,
        metalness: 0.9,
        clearcoat: 0.3,
        clearcoatRoughness: 0.2,
        envMapIntensity: 1.5,
      })
    );
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    this.modelGroup.add(sphere);

    // Small reference spheres around it showing material variations
    const variations = [
      { x: -1.6, y: 0.6, roughness: 0.9, metalness: 0.0 },
      { x: 1.6, y: 0.6, roughness: 0.1, metalness: 0.0 },
      { x: -1.6, y: -0.6, roughness: 0.5, metalness: 0.5 },
      { x: 1.6, y: -0.6, roughness: 0.1, metalness: 0.8 },
    ];

    for (const v of variations) {
      const refMat = new THREE.MeshStandardMaterial({
        color,
        roughness: v.roughness,
        metalness: v.metalness,
        envMapIntensity: 0.8,
      });
      const refSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 24, 18),
        refMat
      );
      refSphere.position.set(v.x, v.y, 0);
      refSphere.castShadow = true;
      this.modelGroup.add(refSphere);
    }
  }

  /**
   * Animation: A simple articulated armature figure
   * with joint spheres and bone cylinders
   */
  _buildAnimationPreview(color) {
    const jointMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.4,
    });
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.6,
      metalness: 0.1,
    });

    // Build a simple stick figure
    const parts = [
      // Torso
      { type: 'cylinder', pos: [0, 0.5, 0], scale: [0.3, 0.6, 0.2], mat: jointMat },
      // Head
      { type: 'sphere', pos: [0, 1.2, 0], radius: 0.2, mat: jointMat },
      // Left arm
      { type: 'cylinder', pos: [-0.7, 0.7, 0], scale: [0.08, 0.5, 0.08], rot: [0, 0, 0.3], mat: boneMat },
      // Right arm
      { type: 'cylinder', pos: [0.7, 0.7, 0], scale: [0.08, 0.5, 0.08], rot: [0, 0, -0.3], mat: boneMat },
      // Left leg
      { type: 'cylinder', pos: [-0.25, -0.2, 0], scale: [0.1, 0.5, 0.1], mat: boneMat },
      // Right leg
      { type: 'cylinder', pos: [0.25, -0.2, 0], scale: [0.1, 0.5, 0.1], mat: boneMat },
    ];

    for (const part of parts) {
      let geo;
      if (part.type === 'sphere') {
        geo = new THREE.SphereGeometry(part.radius || 0.15, 16, 12);
      } else {
        geo = new THREE.CylinderGeometry(...part.scale || [0.1, 0.1, 0.4], 8);
      }
      const mesh = new THREE.Mesh(geo, part.mat);
      mesh.position.fromArray(part.pos || [0, 0, 0]);
      if (part.rot) mesh.rotation.fromArray(part.rot);
      mesh.castShadow = true;
      this.modelGroup.add(mesh);
    }

    // Add a spinning "motion trail" ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.02, 8, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
    );
    ring.rotation.x = Math.PI / 2;
    this.modelGroup.add(ring);
    this.modelGroup._motionRing = ring;
    this.modelGroup._ringPhase = 0;
  }

  /**
   * Environment: A globe/sphere with an environment feel
   * Shows a sphere with lat/long lines like a world
   */
  _buildEnvironmentPreview(color) {
    // Main globe
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 32, 24),
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.7,
        envMapIntensity: 1.2,
      })
    );
    globe.castShadow = true;
    this.modelGroup.add(globe);

    // Wireframe overlay for latitude/longitude look
    const wireframe = new THREE.Mesh(
      new THREE.SphereGeometry(1.01, 24, 18),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      })
    );
    this.modelGroup.add(wireframe);

    // Outer glow ring
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.3, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      })
    );
    glow.rotation.x = Math.PI / 3;
    this.modelGroup.add(glow);

    const glow2 = glow.clone();
    glow2.rotation.x = -Math.PI / 4;
    glow2.rotation.z = Math.PI / 6;
    this.modelGroup.add(glow2);
  }

  /**
   * Physics: A stack of shapes with dynamic feel
   * Uses multiple primitive shapes piled up
   */
  _buildPhysicsPreview(color) {
    const shapes = [
      { geo: new THREE.BoxGeometry(0.5, 0.5, 0.5), pos: [0, 0.6, 0] },
      { geo: new THREE.SphereGeometry(0.3, 16, 12), pos: [0.7, 0.75, 0.3] },
      { geo: new THREE.CylinderGeometry(0.25, 0.25, 0.5, 12), pos: [-0.6, 0.6, -0.2] },
      { geo: new THREE.ConeGeometry(0.3, 0.5, 12), pos: [0.3, 0.25, -0.6] },
      { geo: new THREE.TorusGeometry(0.3, 0.08, 8, 16), pos: [-0.4, 0.2, 0.7] },
      { geo: new THREE.IcosahedronGeometry(0.25, 0), pos: [-0.2, 0.9, -0.4] },
    ];

    for (let i = 0; i < shapes.length; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i === 0 ? color : this._lerpColor(color, 0xffffff, i * 0.15),
        roughness: 0.3 + i * 0.05,
        metalness: 0.2 + i * 0.1,
      });
      const mesh = new THREE.Mesh(shapes[i].geo, mat);
      mesh.position.fromArray(shapes[i].pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.modelGroup.add(mesh);
    }

    // Ground plane hint
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 2.5),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    this.modelGroup.add(ground);
  }

  /**
   * Generator: A procedural/generated look — fractal-like or wave pattern
   * Uses multiple scaled geometries to simulate procedural generation
   */
  _buildGeneratorPreview(color) {
    // Create a terrain-like surface using a plane geometry with displacement
    const geo = new THREE.PlaneGeometry(2.0, 2.0, 40, 40);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const height = Math.sin(x * 3) * Math.cos(y * 3) * 0.2
                   + Math.sin(x * 7 + 1.3) * 0.1
                   + Math.cos(y * 5 + 0.7) * 0.1;
      pos.setZ(i, height);
    }
    geo.computeVertexNormals();

    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.6,
        metalness: 0.1,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    );
    terrain.rotation.x = -Math.PI / 2.5;
    terrain.position.y = -0.3;
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    this.modelGroup.add(terrain);

    // Small floating shapes above the terrain
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const r = 0.6 + Math.random() * 0.4;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.06, 8, 6),
        new THREE.MeshStandardMaterial({
          color: this._lerpColor(color, 0xffffff, 0.3),
          emissive: color,
          emissiveIntensity: 0.3,
        })
      );
      dot.position.set(
        Math.cos(angle) * r,
        0.5 + Math.random() * 0.5,
        Math.sin(angle) * r
      );
      this.modelGroup.add(dot);
    }
  }

  /**
   * Workflow/Tools: UI-like 3D elements — panels, buttons, sliders
   */
  _buildWorkflowPreview(color) {
    // Central panel
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.8, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.1,
      })
    );
    panel.castShadow = true;
    panel.receiveShadow = true;
    this.modelGroup.add(panel);

    // "Slider" elements
    for (let i = 0; i < 3; i++) {
      const track = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5 })
      );
      track.position.set(0, 0.2 - i * 0.2, 0.06);
      this.modelGroup.add(track);

      const thumb = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 8),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.3,
          metalness: 0.5,
          emissive: color,
          emissiveIntensity: 0.1,
        })
      );
      thumb.position.set(-0.2 + i * 0.2, 0.2 - i * 0.2, 0.1);
      this.modelGroup.add(thumb);
    }

    // Small buttons
    for (let i = 0; i < 4; i++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.06, 0.04),
        new THREE.MeshStandardMaterial({
          color: i % 2 === 0 ? color : 0x555555,
          roughness: 0.4,
          metalness: 0.3,
        })
      );
      btn.position.set(-0.5 + i * 0.3, -0.25, 0.06);
      this.modelGroup.add(btn);
    }
  }

  /**
   * Default preview: A clean, professional Torus Knot
   */
  _buildDefaultPreview(color) {
    const geo = new THREE.TorusKnotGeometry(0.8, 0.3, 100, 16);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.2,
      metalness: 0.7,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.modelGroup.add(mesh);
  }

  /**
   * Linear interpolate between two hex colors
   */
  _lerpColor(color1, color2, t) {
    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);
    c1.lerp(c2, t);
    return c1.getHex();
  }

  /* ── Interaction ── */

  _attachInteraction() {
    const canvas = this.renderer.domElement;
    if (!canvas || !this.options.interactive) return;

    canvas.style.cursor = 'grab';

    const getPos = (e) => ({
      x: (e.clientX / this._width) * 2 - 1,
      y: -(e.clientY / this._height) * 2 + 1,
    });

    const onPointerDown = (e) => {
      this._isDragging = true;
      this._previousMouse = getPos(e);
      canvas.style.cursor = 'grabbing';
      if (this.options.autoRotate) {
        this.options.autoRotate = false; // Pause auto-rotate during drag
      }
    };

    const onPointerMove = (e) => {
      if (!this._isDragging) return;
      const pos = getPos(e);
      const dx = pos.x - this._previousMouse.x;
      const dy = pos.y - this._previousMouse.y;

      this._targetRotation.y += dx * 2;
      this._targetRotation.x += dy * 1.5;
      this._targetRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this._targetRotation.x));

      this._previousMouse = pos;
    };

    const onPointerUp = () => {
      this._isDragging = false;
      canvas.style.cursor = 'grab';
      if (this.options.autoRotate === false && !this._isDragging) {
        this.options.autoRotate = true; // Resume auto-rotate
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      if (touch) {
        onPointerDown({ clientX: touch.clientX, clientY: touch.clientY });
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      if (touch && this._isDragging) {
        onPointerMove({ clientX: touch.clientX, clientY: touch.clientY });
      }
    }, { passive: true });

    canvas.addEventListener('touchend', onPointerUp, { passive: true });

    // Store refs for cleanup
    this._cleanupEvents = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
    };
  }

  /* ── Resize ── */

  _attachResize() {
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && (width !== this._width || height !== this._height)) {
          this._width = width;
          this._height = height;
          this._onResize();
        }
      }
    });
    this._resizeObserver.observe(this.container);
  }

  _onResize() {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(this._width, this._height);
    this.camera.aspect = this._width / this._height;
    this.camera.updateProjectionMatrix();
  }

  /* ── Animation ── */

  _startAnimation() {
    const animate = () => {
      this._animationId = requestAnimationFrame(animate);

      const delta = this._clock.getDelta();

      if (this.modelGroup) {
        // Auto-rotate Y axis
        if (this.options.autoRotate) {
          this._targetRotation.y += delta * (this.options.rotationSpeed * Math.PI / 180);
        }

        // Smoothly interpolate rotation
        this._currentRotation.x += (this._targetRotation.x - this._currentRotation.x) * 0.1;
        this._currentRotation.y += (this._targetRotation.y - this._currentRotation.y) * 0.1;

        this.modelGroup.rotation.x = this._currentRotation.x;
        this.modelGroup.rotation.y = this._currentRotation.y;

        // Animate special elements
        this._animateSpecial(delta);
      }

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /**
   * Animate category-specific elements (motion rings, floating particles, etc.)
   */
  _animateSpecial(delta) {
    if (!this.modelGroup) return;

    // Modeling: subtle wireframe pulse
    if (this.modelGroup._wireframe) {
      this.modelGroup._wireframe.rotation.x += delta * 0.3;
      this.modelGroup._wireframe.rotation.y += delta * 0.5;
    }

    // Animation: spin motion ring
    if (this.modelGroup._motionRing) {
      this.modelGroup._ringPhase = (this.modelGroup._ringPhase || 0) + delta * 0.5;
      this.modelGroup._motionRing.rotation.z = Math.sin(this.modelGroup._ringPhase) * 0.3;
    }
  }

  /* ── Cleanup ── */

  /**
   * Dispose of all Three.js resources and stop the animation.
   * Call this when navigating away from the detail view.
   */
  destroy() {
    // Stop animation
    if (this._animationId) {
      cancelAnimationFrame(this._animationId);
      this._animationId = null;
    }

    // Stop clock
    this._clock.stop();

    // Disconnect resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Remove event listeners
    if (this._cleanupEvents) {
      this._cleanupEvents();
      this._cleanupEvents = null;
    }

    // Dispose scene objects recursively
    if (this.scene) {
      this._disposeObject(this.scene);
    }

    // Dispose renderer
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }

    // Clear references
    this.scene = null;
    this.camera = null;
    this.modelGroup = null;
    this.lights = [];
    this.container = null;
  }

  /**
   * Recursively dispose of Three.js object3D resources
   */
  _disposeObject(obj) {
    if (!obj) return;

    // Dispose geometry
    if (obj.geometry) {
      obj.geometry.dispose();
    }

    // Dispose material(s)
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => this._disposeMaterial(m));
      } else {
        this._disposeMaterial(obj.material);
      }
    }

    // Recurse children
    if (obj.children) {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        this._disposeObject(obj.children[i]);
      }
    }
  }

  _disposeMaterial(mat) {
    if (!mat) return;

    // Dispose textures
    for (const key of Object.keys(mat)) {
      const value = mat[key];
      if (value && typeof value === 'object' && value.isTexture) {
        value.dispose();
      }
    }

    mat.dispose();
  }
}
