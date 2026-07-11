import * as THREE from "three";

/**
 * initAudio
 */
export function initAudio(game) {
        // --- Procedural footstep system (Web Audio API) ---
        // No external audio files needed — generates short percussive thuds.
        game._footstepCtx = null;
        game._footstepNextTime = 0;
        game._footstepInterval = 0.32; // seconds between steps (adjusts with speed)
        game._footstepNoiseBuffer = null; // pre-created noise buffer for footsteps

        const initFootstepCtx = () => {
            if (game._footstepCtx) return;
            try {
                game._footstepCtx = new (window.AudioContext || window.webkitAudioContext)();
                // Pre-create noise buffer once (reuse every footstep)
                const sr = game._footstepCtx.sampleRate;
                const buf = game._footstepCtx.createBuffer(1, sr * 0.06, sr);
                const d = buf.getChannelData(0);
                for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
                game._footstepNoiseBuffer = buf;
            } catch (e) {
                console.warn('Web Audio API not available for footsteps:', e);
            }
        };

        // Resume audio context on first interaction
        const resumeAudio = () => {
            initFootstepCtx();
            window.removeEventListener('keydown', resumeAudio);
            window.removeEventListener('mousedown', resumeAudio);
            window.removeEventListener('touchstart', resumeAudio);
        };
        window.addEventListener('keydown', resumeAudio);
        window.addEventListener('mousedown', resumeAudio);
        window.addEventListener('touchstart', resumeAudio);
}

/**
 * playSound
 */
export function playSound(game, name) {
        if (game.audioMuted) return;
        const audio = new Audio(`assets/audio/${name}.mp3`);
        audio.volume = 0.4;
        audio.play().catch(() => {});
}

/**
 * Play a procedural footstep sound using Web Audio API.
 * Call this from the game loop when Jack is moving on the ground.
 * @param {object} game - game instance
 * @param {number} speed - current movement speed (0-18 range)
 */
export function playFootstep(game, speed) {
        if (game.audioMuted) return;
        if (!game._footstepCtx || speed < 0.5) return;
        const now = game._footstepCtx.currentTime;
        if (now < game._footstepNextTime) return;

        // Footstep interval scales with speed: faster = more frequent
        // At speed 2 → ~0.35s, at speed 10 → ~0.18s, at max → ~0.12s
        game._footstepInterval = Math.max(0.12, 0.4 - speed * 0.02);
        game._footstepNextTime = now + game._footstepInterval;

        const ctx = game._footstepCtx;

        // --- Thud oscillator: short low-frequency burst ---
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80 + Math.random() * 30, now); // 80-110 Hz thud
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);

        // --- Noise burst: adds texture (gravel/dirt feel) ---
        const noise = ctx.createBufferSource();
        noise.buffer = game._footstepNoiseBuffer;
        const noiseGain = ctx.createGain();
        // Bandpass to make it sound like dirt/gravel
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 200 + speed * 30; // higher freq at higher speed
        filter.Q.value = 1.5;
        noiseGain.gain.setValueAtTime(0.12, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        noise.connect(filter).connect(noiseGain).connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.08);
}

/**
 * spawnCoinExplosion
 * @param {object} game - game instance
 * @param {THREE.Vector3} origin - world position to spawn from
 * @param {number} totalValue - total value represented
 * @param {string} type - 'gain' (default) or 'loss' (red/silver implosion)
 */
export function spawnCoinExplosion(game, origin, totalValue, type = 'gain') {
        const isLoss = type === 'loss';
        // limit number of pieces so it's performant
        const pieces = Math.min(30, Math.max(8, Math.floor(totalValue / 2)));
        if (!game._coinExplosions) game._coinExplosions = [];
        for (let i = 0; i < pieces; i++) {
            const frac = i / Math.max(1, pieces);
            const size = THREE.MathUtils.lerp(0.25, 0.9, Math.random());
            const value = Math.max(1, Math.round(totalValue / pieces));
            // Loss coins: red/silver palette instead of gold/bronze
            let colorHex;
            if (isLoss) {
                colorHex = (value > 20) ? 0xcc3333 : (value > 6 ? 0xaa4444 : 0x888888);
            } else {
                colorHex = (value > 20) ? 0xffd700 : (value > 6 ? 0xc0c0c0 : 0xcd7f32);
            }
            const mat = new THREE.MeshPhongMaterial({ color: colorHex, shininess: isLoss ? 20 : 80 });
            const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * size, 0.4 * size, 0.08 * size, 16), mat);
            coin.rotation.x = Math.PI / 2;
            coin.position.copy(origin);
            game.scene.add(coin);

            // Loss coins: burst outward then fall (implosion feel), lower initial velocity
            const vel = isLoss
                ? new THREE.Vector3(
                    (Math.random() - 0.5) * 5,
                    Math.random() * 3 + 2,
                    (Math.random() - 0.5) * 5
                )
                : new THREE.Vector3(
                    (Math.random() - 0.5) * 8,
                    Math.random() * 8 + 4,
                    (Math.random() - 0.5) * 8
                );
            const angular = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            );

            game._coinExplosions.push({
                mesh: coin,
                velocity: vel,
                angular: angular,
                life: 0,
                maxLife: isLoss ? (2 + Math.random() * 2) : (3 + Math.random() * 2)
            });
        }
}

