import * as THREE from 'three';
import { SphereGeometry, IcosahedronGeometry, ConeGeometry, TorusGeometry, CapsuleGeometry, PlaneGeometry, CircleGeometry, CylinderGeometry } from 'three';

/**
 * Creates a basic Three.js Mesh with a standard material and common initial properties.
 * @param {THREE.BufferGeometry} geometry - The geometry for the mesh.
 * @param {string} name - The default name for the object.
 * @param {THREE.Vector3} [position=new THREE.Vector3(0, 0.5, 0)] - The initial position of the object.
 * @param {THREE.Euler} [rotation=new THREE.Euler(0, 0, 0)] - The initial rotation of the object.
 * @returns {THREE.Mesh} The created mesh object.
 */
function createBaseMesh(geometry, name, position = new THREE.Vector3(0, 0.5, 0), rotation = new THREE.Euler(0, 0, 0)) {
    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    // Flag the material as new to trigger automatic shader node connection.
    material.userData.isNewMaterial = true; 
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.userData.isManagedObject = true;
    mesh.name = name;
    return mesh;
}

/**
 * Creates a new Cube object.
 * @returns {THREE.Mesh} A new Three.js Cube Mesh.
 */
export function createCube() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    return createBaseMesh(geometry, 'Cube');
}

/**
 * Creates a new UV Sphere object.
 * @returns {THREE.Mesh} A new Three.js UV Sphere Mesh.
 */
export function createUVSphere() {
    const geometry = new SphereGeometry(0.5, 32, 16);
    return createBaseMesh(geometry, 'UV Sphere');
}

/**
 * Creates a new Ico Sphere object.
 * @returns {THREE.Mesh} A new Three.js Ico Sphere Mesh.
 */
export function createIcoSphere() {
    const geometry = new IcosahedronGeometry(0.5, 0);
    return createBaseMesh(geometry, 'Ico Sphere');
}

/**
 * Creates a new Cone object.
 * @returns {THREE.Mesh} A new Three.js Cone Mesh.
 */
export function createCone() {
    const geometry = new ConeGeometry(0.5, 1, 32);
    return createBaseMesh(geometry, 'Cone');
}

/**
 * Creates a new Torus object.
 * @returns {THREE.Mesh} A new Three.js Torus Mesh.
 */
export function createTorus() {
    const geometry = new TorusGeometry(0.5, 0.2, 16, 100);
    return createBaseMesh(geometry, 'Torus');
}

/**
 * Creates a new Capsule object.
 * @returns {THREE.Mesh} A new Three.js Capsule Mesh.
 */
export function createCapsule() {
    const geometry = new CapsuleGeometry(0.5, 1, 4, 8);
    // Adjust position for capsule to sit on grid
    return createBaseMesh(geometry, 'Capsule', new THREE.Vector3(0, 0.75, 0));
}

/**
 * Creates a new Circle (plane) object.
 * @returns {THREE.Mesh} A new Three.js Circle Mesh.
 */
export function createCircle() {
    const geometry = new CircleGeometry(0.5, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
    const circle = new THREE.Mesh(geometry, material);
    circle.rotation.x = -Math.PI / 2; // Lie flat on the grid
    circle.position.set(0, 0, 0); // Position on the grid
    circle.userData.isManagedObject = true;
    circle.name = 'Circle';
    return circle;
}

/**
 * Creates a new Triangle (Prism) object.
 * @returns {THREE.Mesh} A new Three.js Triangle (Prism) Mesh.
 */
export function createTriangle() {
    const geometry = new CylinderGeometry(0.5, 0.5, 1, 3); // RadiusTop, RadiusBottom, Height, RadialSegments
    return createBaseMesh(geometry, 'Triangle');
}

/**
 * Creates a new Grid Plane object.
 * @returns {THREE.Mesh} A new Three.js Grid Plane Mesh.
 */
export function createGridPlane() {
    const geometry = new PlaneGeometry(2, 2, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
    const gridPlane = new THREE.Mesh(geometry, material);
    gridPlane.rotation.x = -Math.PI / 2; // Lie flat on the grid
    gridPlane.position.set(0, 0, 0); // Position on the grid
    gridPlane.userData.isManagedObject = true;
    gridPlane.name = 'Grid';
    return gridPlane;
}

/**
 * Creates a new Square Pyramid object.
 * @returns {THREE.Mesh} A new Three.js Square Pyramid Mesh.
 */
export function createSquarePyramid() {
    // ConeGeometry can be used to create a pyramid by setting radialSegments to 4
    const radius = 0.5; // Radius of the base
    const height = 1;   // Height of the pyramid
    const radialSegments = 4; // 4 segments for a square base
    const heightSegments = 1; // Number of segments along the height
    const openEnded = false; // Whether the cone's base is open or closed

    const geometry = new ConeGeometry(radius, height, radialSegments, heightSegments, openEnded);
    // Orient the pyramid so its base is on the XZ plane.
    // ConeGeometry by default points along the Y-axis, with its base centered at Y=0.
    // If we want the tip at Y=height and base at Y=0, no rotation is needed.
    // Its center is at Y = height / 2, so to sit on the grid (Y=0) it needs to be moved up by height / 2.
    return createBaseMesh(geometry, 'Square Pyramid', new THREE.Vector3(0, height / 2, 0));
}

/**
 * Creates a new Cylinder object.
 * @returns {THREE.Mesh} A new Three.js Cylinder Mesh.
 */
export function createCylinder() {
    // Default cylinder: radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded, thetaStart, thetaLength
    const geometry = new CylinderGeometry(0.5, 0.5, 1, 32); 
    return createBaseMesh(geometry, 'Cylinder');
}