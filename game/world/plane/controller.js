// /game/world/plane/controller.js
// PlaneController — performs frame-rate independent plane movement + visual flair.
// Owns: velocity, smoothed roll/pitch, propeller spin, two contrails.
// Bridge: world.js feeds (normalizedΔx, normalizedΔy) per RAF as `input`.
//
// This was previously exported alongside buildPlane but nothing imported it.
// We now USE it in world.js so the world loop has a single steering authority
// and the plane gets realistic damping + visible contrails from wing tips.
import * as THREE from 'https://esm.sh/three@0.128.0';
import { TUNING, clamp } from '../shared.js';

// ---------- Exhaust trail (ring-buffered Line) ----------
class ExhaustTrail {
  constructor(scene, maxPoints = 80, color = 0xffffff) {
    this.maxPoints = maxPoints;
    this.history = [];
    this.minDistSq = 0.15;

    const positions = new Float32Array(maxPoints * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setDrawRange(0, 0);

    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    this.line = new THREE.Line(this.geometry, mat);
    this.line.frustumCulled = false;
    scene.add(this.line);
  }
  update(worldPos) {
    const last = this.history[this.history.length - 1];
    if (!last || worldPos.distanceToSquared(last) > this.minDistSq) {
      this.history.push(worldPos.clone());
      if (this.history.length > this.maxPoints) this.history.shift();
    }
    const arr = this.geometry.attributes.position.array;
    for (let i = 0; i < this.history.length; i++) {
      const p = this.history[i];
      arr[i * 3]     = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.setDrawRange(0, this.history.length);
  }
  clear() {
    this.history.length = 0;
    this.geometry.setDrawRange(0, 0);
  }
  dispose() {
    this.geometry.dispose();
    this.line.material.dispose();
    if (this.line.parent) this.line.parent.remove(this.line);
  }
}

// ---------- Controller ----------
export class PlaneController {
  constructor(plane, scene) {
    this.plane = plane;
    this.scene = scene;
    this.velocity = new THREE.Vector3();

    // Tuning
    this.moveSpeed    = 28;
    this.verticalSpeed = 14;
    this.turnSmooth   = 6;
    this.maxBank      = 0.75;
    this.maxPitch     = 0.35;
    this.bankSmooth   = 5;
    this.pitchSmooth  = 5;

    this.currentBank  = 0;
    this.currentPitch = 0;

    // World bounds pulled from shared TUNING so input.js and this stay in sync
    this.bounds = {
      minX: -TUNING.BOUND_X, maxX: TUNING.BOUND_X,
      minY:  TUNING.BOUND_Y_MIN, maxY: TUNING.BOUND_Y_MAX,
    };

    // Dual trails, one per wing tip
    this.leftTrail   = new ExhaustTrail(scene, 80, 0xffffff);
    this.rightTrail  = new ExhaustTrail(scene, 80, 0xffffff);
    this.wingOffset  = new THREE.Vector3(3.5, 0, -0.5);
  }

  /** Snap velocity + visuals back to neutral — call on reset. */
  reset() {
    this.velocity.set(0, 0, 0);
    this.currentBank  = 0;
    this.currentPitch = 0;
    this.leftTrail.clear();
    this.rightTrail.clear();
  }

  /**
   * @param {number} delta seconds since last frame
   * @param {{x:number,y:number}} input normalized (-1..1) steering intent
   */
  update(delta, input) {
    if (!this.plane) return;
    const ix = clamp(input.x || 0, -1, 1);
    const iy = clamp(input.y || 0, -1, 1);

    // Frame-independent velocity smoothing toward target velocity
    const velocityLerp = 1 - Math.exp(-this.turnSmooth * delta);
    this.velocity.x += (ix * this.moveSpeed - this.velocity.x) * velocityLerp;
    this.velocity.y += (iy * this.verticalSpeed - this.velocity.y) * velocityLerp;

    this.plane.position.x += this.velocity.x * delta;
    this.plane.position.y += this.velocity.y * delta;
    this.plane.position.x = clamp(this.plane.position.x, this.bounds.minX, this.bounds.maxX);
    this.plane.position.y = clamp(this.plane.position.y, this.bounds.minY, this.bounds.maxY);

    // Banking (roll)
    const targetBank = -ix * this.maxBank;
    const bankLerp = 1 - Math.exp(-this.bankSmooth * delta);
    this.currentBank += (targetBank - this.currentBank) * bankLerp;
    this.plane.rotation.z = this.currentBank;

    // Pitch
    const targetPitch = iy * this.maxPitch;
    const pitchLerp = 1 - Math.exp(-this.pitchSmooth * delta);
    this.currentPitch += (targetPitch - this.currentPitch) * pitchLerp;
    this.plane.rotation.x = this.currentPitch;

    // Propeller spins faster when moving
    const prop = this.plane.getObjectByName('propeller');
    if (prop) {
      prop.rotation.z += delta * (25 + Math.abs(this.velocity.x) * 0.8);
    }

    // Wing-tip contrails (transform local offset by plane quaternion + position)
    const leftLocal  = this.wingOffset.clone();
    const rightLocal = this.wingOffset.clone().multiply(new THREE.Vector3(-1, 1, 1));
    leftLocal.applyQuaternion(this.plane.quaternion).add(this.plane.position);
    rightLocal.applyQuaternion(this.plane.quaternion).add(this.plane.position);
    this.leftTrail.update(leftLocal);
    this.rightTrail.update(rightLocal);
  }

  clearTrails() {
    this.leftTrail.clear();
    this.rightTrail.clear();
  }

  dispose() {
    this.leftTrail.dispose();
    this.rightTrail.dispose();
  }
}
