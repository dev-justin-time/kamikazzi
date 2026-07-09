/* game/world/loop.js
   Extracted from world.js — per-frame game loop, propeller HUD-lock,
   and loop start/stop control.
*/

import * as THREE from 'three';

import {
  TUNING, clamp,
  NUM_LEVELS, SCORE_PER_LEVEL, TARGET_SUCCESS_SCORE,
  FINAL_LEVEL_TINT, FINAL_LEVEL_FOG,
} from './shared.js';

/**
 * Create the game loop controller.
 * @param {object} ctx - context object with all references the loop() needs
 * @returns {{ startLoop: Function, stopLoop: Function }}
 */
export function createGameLoop(ctx) {
  const {
    scene, camera, bg, state, plane, propeller,
    clouds, strips,
    explosion, buildings, powerups,
    magnetHalo, planeController,
    boeingSwapped,           // { value: boolean }
    resetGame,               // () => void — defined in world.js
    applyLevelBackground,    // (idx) => void
    winGame,                 // () => Promise<void>
    endGame,                 // () => Promise<void>
    applyPowerupEffect,      // (type, now) => void
    swapPlaneModel,          // (url) => Promise<void>
    multiplayer,             // { pushPresence, presenceAccumulator }
    checkCollision,          // (plane, b) => boolean
    checkNearMiss,           // (plane, b) => boolean
  } = ctx;

  // ---- per-frame scratch Vec3s (allocated once to avoid GC pressure) ----
  const _camFwd = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _bottomRay = new THREE.Vector3();

  // ---- loop control ----
  let raf = null;
  const clock = new THREE.Clock();

  // ---- propeller HUD lock ----
  function syncPropellerToViewport() {
    if (!propeller || !camera) return;
    camera.getWorldDirection(_camFwd);
    _camRight.crossVectors(_camFwd, camera.up).normalize();
    _bottomRay.copy(_camFwd).applyAxisAngle(_camRight, -camera.fov * 0.5 * Math.PI / 180);
    propeller.position.copy(camera.position).addScaledVector(_bottomRay, TUNING.PROPELLER_DISTANCE);
    propeller.rotation.set(0, 0, propeller.rotation.z);
    propeller.visible = plane.visible;
  }

  // ---- loop ----
  function startLoop(rendererObj) {
    if (!rendererObj || !rendererObj.renderer) {
      console.warn('startLoop: rendererObj missing; aborting', rendererObj);
      return;
    }
    const renderer = rendererObj.renderer;

    // Cancel prior RAF so retries don't accumulate
    stopLoop();
    renderer.autoClear = false;

    // Reset visuals + game (resetGame is defined in world.js)
    planeController.reset();
    resetGame();

    function loop() {
      raf = requestAnimationFrame(loop);
      try {
        const clockDelta = Math.min(clock.getDelta(), TUNING.MAX_DT_RAW);
        if (state.over) {
          state.timeScale = 1.0;
        } else if (!state.paused) {
          state.timeScale += (state.timeScaleTarget - state.timeScale) * (1 - Math.exp(-8 * clockDelta));
          if (performance.now() >= state.timeScaleUntilMs) state.timeScaleTarget = 1.0;
        }
        const dt = state.paused ? 0 : clockDelta * TUNING.DT_HZ * state.timeScale;

        if (!state.paused) {
          explosion.update(dt);
        }

        const now = performance.now();
        const isShield = now < state._powerups.shieldUntilMs;
        const isBoost  = now < state._powerups.boostUntilMs;
        const isMagnet = now < state._powerups.magnetUntilMs;
        const is2x     = now < state._powerups.score2xUntilMs;
        const isSlow   = !state.over && !state.paused && now < state._powerups.slowmoUntilMs;
        const effSpeed = state.speed * (isBoost ? TUNING.POWERUP_BOOST_MULT : 1);
        const scoreMult = is2x ? TUNING.POWERUP_SCORE2X_MULT : 1;

        magnetHalo.setActive(isMagnet && !state.over && !state.paused, now);

        if (!state.paused) {
          if (isSlow) {
            state.timeScaleTarget = Math.min(state.timeScaleTarget, TUNING.POWERUP_SLOWMO_SCALE);
          }

          powerups.update(effSpeed, dt, state.running ? plane.position.z : null, isMagnet, plane.position.x);

          if (state.running) {
            const picked = powerups.checkPickup(plane.position);
            if (picked) applyPowerupEffect(picked, now);
          }

          if (state.running) {
            state.speed += TUNING.SPEED_RAMP * dt;

            const frameDistance = effSpeed * dt;
            state.distanceTraveled += frameDistance;
            state.score += frameDistance * TUNING.SCORE_GAIN * scoreMult;

            // Plane model upgrade at 15,000 points
            if (state.score >= 15000 && !boeingSwapped.value) {
              boeingSwapped.value = true;
              try { window.dispatchEvent(new CustomEvent('modelUpgrade')); } catch (_) {}
              swapPlaneModel('/assets/model/BOEING/scene.gltf').catch(err => console.warn('Boeing swap failed', err));
            }

            // Level advance
            if (state.level < NUM_LEVELS) {
              const needed = TUNING.SCORE_PER_LEVEL * Math.pow(TUNING.LEVEL_LENGTH_MULT, state.level - 1);
              if (state.score - state.levelStartScore >= needed) {
                state.level++;
                state.levelStartScore = state.score;
                state.speed = TUNING.SPEED_PER_LEVEL[state.level - 1];
                if (state.level <= NUM_LEVELS) {
                  applyLevelBackground(state.levelOrder[state.level - 1]);
                }
                if (state.level === NUM_LEVELS) {
                  bg.material.color.setHex(FINAL_LEVEL_TINT);
                  scene.fog.color.setHex(FINAL_LEVEL_FOG);
                  try { window.dispatchEvent(new CustomEvent('finalSector')); } catch (_) {}
                }
              }
            }

            // Mission Success trigger
            const neededForMax = TUNING.SCORE_PER_LEVEL * Math.pow(TUNING.LEVEL_LENGTH_MULT, NUM_LEVELS - 1);
            const maxLevelCompleted = state.level >= NUM_LEVELS && (state.score - state.levelStartScore) >= neededForMax;
            if (!state.won && !state.over && (maxLevelCompleted || state.score >= TARGET_SUCCESS_SCORE)) {
              winGame();
            }

            state.target.x = clamp(state.target.x, -TUNING.BOUND_X, TUNING.BOUND_X);
            state.target.y = clamp(state.target.y, TUNING.BOUND_Y_MIN, TUNING.BOUND_Y_MAX);

            const boundYRange = TUNING.BOUND_Y_MAX - TUNING.BOUND_Y_MIN;
            const inputX = clamp((state.target.x - plane.position.x) / TUNING.BOUND_X, -1, 1);
            const inputY = clamp((state.target.y - plane.position.y) / boundYRange, -1, 1);
            planeController.update(dt, { x: inputX, y: inputY });

            buildings.updateForSpeed(effSpeed, dt, plane.position.z, b => {
              if (!b.userData.passed && b.position.z > plane.position.z + 4) {
                b.userData.passed = true;
                state.score += TUNING.BUILD_PASS_BONUS;
              }
              if (!isShield && !state.over && !state.won && checkCollision(plane, b)) {
                endGame();
              } else if (state.running && !state.over && !state.won && checkNearMiss(plane, b)) {
                const nm_now = performance.now();
                const lastForBuilding = state.lastNearMissByBuilding.get(b) || 0;
                if (nm_now - lastForBuilding > TUNING.NEAR_MISS_DURATION_MS) {
                  state.lastNearMissByBuilding.set(b, nm_now);
                  state.timeScaleTarget = TUNING.NEAR_MISS_TIME_SCALE;
                  state.timeScaleUntilMs = nm_now + TUNING.NEAR_MISS_DURATION_MS;
                }
              }
            });

            // Spawn cadence
            state.spawnTimer += dt;
            const interval = Math.max(
              TUNING.MIN_SPAWN_INTERVAL,
              state.spawnInterval - effSpeed * TUNING.SPAWN_SPEED_PRESSURE
            );
            if (state.spawnTimer >= interval) {
              state.spawnTimer = 0;
              buildings.spawn(TUNING.GENERATION_START_Z - Math.random() * 30);
            }

            // Ground strip scroll
            for (const s of strips) {
              s.position.z += effSpeed * TUNING.BUILD_DRIFT_FACTOR * dt;
              if (s.position.z > TUNING.GENERATION_END_Z) {
                s.position.z -= TUNING.STRIP_COUNT * TUNING.STRIP_SPACING;
              }
            }
          }

          // Clouds drift
          for (const c of clouds) {
            c.position.z += (state.running ? effSpeed * TUNING.CLOUD_DRIFT : 0.3) * dt;
            if (c.position.z > 60) {
              c.position.z = -560 - Math.random() * 40;
              c.position.x = (Math.random() - 0.5) * 200;
              c.position.y = 20 + Math.random() * 40;
            }
          }

          // Camera follow
          const CAMERA_TRAIL_FACTOR = 0.5;
          const CAMERA_HEIGHT_OFFSET = 6;
          const CAMERA_LERP = 0.1;
          const CAMERA_DISTANCE = 16;
          const CAMERA_LOOK_AHEAD = 20;
          const camTargetX = plane.position.x * CAMERA_TRAIL_FACTOR;
          const camTargetY = plane.position.y + CAMERA_HEIGHT_OFFSET;
          camera.position.x += (camTargetX - camera.position.x) * CAMERA_LERP * dt;
          camera.position.y += (camTargetY - camera.position.y) * CAMERA_LERP * dt;
          camera.position.z = plane.position.z + CAMERA_DISTANCE;
          camera.lookAt(plane.position.x * CAMERA_TRAIL_FACTOR, plane.position.y, plane.position.z - CAMERA_LOOK_AHEAD);

          syncPropellerToViewport();

          multiplayer.presenceAccumulator += dt / TUNING.DT_HZ;
          if (multiplayer.presenceAccumulator >= TUNING.PRESENCE_INTERVAL_S) {
            multiplayer.pushPresence(false);
          }
        }

        // Render
        renderer.clear();
        renderer.render(bg.bgScene, bg.bgCamera);
        renderer.clearDepth();
        renderer.render(scene, camera);
      } catch (err) {
        console.error('world loop error:', err);
        if (raf) { cancelAnimationFrame(raf); raf = null; }
      }
    }

    raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  return { startLoop, stopLoop };
}
