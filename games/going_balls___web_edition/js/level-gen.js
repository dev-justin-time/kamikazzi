import * as THREE from "three";
import * as CANNON from "cannon-es";

/**
 * clearLevel
 */
export function clearLevel(game) {
        game.levelObjects.forEach(obj => {
            if (obj.body) game.world.removeBody(obj.body);
            if (obj.mesh) game.scene.remove(obj.mesh);
        });
        game.coins.forEach(coin => game.scene.remove(coin));
        game.pendulums.forEach(p => {
            if (p.body) game.world.removeBody(p.body);
            game.scene.remove(p.mesh);
            if (p.line) game.scene.remove(p.line);
        });
        game.spinners.forEach(s => {
            if (s.body) game.world.removeBody(s.body);
            game.scene.remove(s.mesh);
        });
        game.movers.forEach(m => {
            if (m.body) game.world.removeBody(m.body);
            game.scene.remove(m.mesh);
        });
        game.checkpoints = [];
        game.levelObjects = [];
        game.coins = [];
        game.pendulums = [];
        game.spinners = [];
        game.movers = [];
}

/**
 * placeFinishModel
 */
export function placeFinishModel(game) {
        if (!game.finishModel || game.finishZ === undefined) return;
        const model = game.finishModel.clone();
        model.position.set(game.finishX || 0, (game.finishY || 0), game.finishZ);
        model.scale.set(0.1, 0.1, 0.1);
        // Apply a "downwards right" tilted rotation
        model.rotation.set(Math.PI / 2, 0, -Math.PI / 4);
        game.scene.add(model);
        game.levelObjects.push({ mesh: model });
}

/**
 * createLevel
 */
export function createLevel(game) {
        game.clearLevel();
        game.lastCheckpointPos.set(0, 5, 0);
        
        let currentZ = 0;
        let currentX = 0;
        let currentY = 0;

        // Start platform
        game.addPlatform(0, 0, 0, 8, 15);
        currentZ -= 7.5;

        const currentSky = game.skyConfigs[game.saveData.selectedSky] || game.skyConfigs.day;

        // Massive variety of segment types for "infinite" combinations
        const segmentTypes = [
            'straight', 'ramp', 'narrow', 'pendulum', 'zigzag', 'gap', 
            'bumpy', 'spinner', 'thin_bridge', 'stairs', 'tunnel', 
            'archipelago', 'sloped_turn', 'speed_boost', 'checkerboard',
            'hammer_gauntlet', 'moving_rects', 'speed_strip', 'halfpipe',
            'funnel', 'spiral_staircase', 'side_crusher',
            'jump_gap', 'double_jump_gap', 'triple_jump_gap', 'climb'
        ];

        // Difficulty Chart logic
        const difficultyTiers = [
            { level: 1, color: 0x7cfc00, label: "EASY", types: ['straight', 'ramp', 'tunnel', 'speed_strip', 'jump_gap'] },
            { level: 4, color: 0x32cd32, label: "NORMAL", types: ['straight', 'ramp', 'tunnel', 'zigzag', 'bumpy', 'jump_gap', 'climb'] },
            { level: 7, color: 0x1e90ff, label: "CHALLENGING", types: ['zigzag', 'gap', 'archipelago', 'spinner', 'double_jump_gap', 'climb'] },
            { level: 10, color: 0xffff00, label: "HARD", types: ['gap', 'spinner', 'pendulum', 'stairs', 'halfpipe', 'double_jump_gap'] },
            { level: 13, color: 0xffa500, label: "TOUGH", types: ['pendulum', 'hammer_gauntlet', 'moving_rects', 'checkerboard', 'triple_jump_gap'] },
            { level: 16, color: 0xff4500, label: "EXPERT", types: ['hammer_gauntlet', 'side_crusher', 'narrow', 'moving_rects', 'triple_jump_gap'] },
            { level: 19, color: 0x8b0000, label: "EXTREME", types: ['narrow', 'side_crusher', 'checkerboard', 'archipelago', 'triple_jump_gap'] },
            { level: 22, color: 0x4b0082, label: "INSANE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap'] },
            { level: 25, color: 0x000000, label: "IMPOSSIBLE", types: ['narrow', 'side_crusher', 'hammer_gauntlet', 'checkerboard', 'triple_jump_gap'] }
        ];

        let tier = difficultyTiers[0];
        for (let t of difficultyTiers) {
            if (game.currentLevel >= t.level) tier = t;
        }

        // Apply tier visual (fog matches difficulty tier, background stays as selected sky)
        const selectedSky = game.skyConfigs[game.saveData.selectedSky] || game.skyConfigs.day;
        if (selectedSky.tex) {
            game.textureLoader.load(
                selectedSky.tex,
                (tex) => {
                    tex.mapping = THREE.EquirectangularReflectionMapping;
                    game.scene.background = tex;
                },
                undefined,
                (err) => {
                    console.warn('Selected sky texture failed:', selectedSky.tex, err);
                    game.scene.background = new THREE.Color(tier.color || 0x000000);
                }
            );
        } else {
            game.scene.background = new THREE.Color(tier.color);
        }
        
        if (game.scene.fog) {
            game.scene.fog.color.setHex(tier.color);
        }
        document.body.style.backgroundColor = `#${tier.color.toString(16).padStart(6, '0')}`;

        // Level scaling
        const numSegments = 15 + Math.floor(game.currentLevel * 2.5);
        const checkpointInterval = Math.floor(numSegments / 3);
        const baseWidth = Math.max(0.7, 7 - (game.currentLevel * 0.3));
        const hazardSpeedMult = 1 + (game.currentLevel * 0.15);
        
        for (let i = 0; i < numSegments; i++) {
            // Add checkpoint every few segments
            if (i > 0 && i % checkpointInterval === 0) {
                game.addCheckpoint(currentX, currentY, currentZ, baseWidth);
                currentZ -= 4;
            }

            const type = tier.types[Math.floor(Math.random() * tier.types.length)];
            
            // Each case is a "sub-generator"
            switch(type) {
                case 'straight': {
                    const len = 15 + Math.random() * 20;
                    game.addPlatform(currentX, currentY, currentZ - len/2, baseWidth, len);
                    game.addCoins(currentX, currentY + 1, currentZ, len, 3);
                    currentZ -= len;
                    break;
                }
                case 'ramp': {
                    const rampH = 4 + Math.random() * 4;
                    const rampL = 15 + Math.random() * 10;
                    game.addRamp(currentX, currentY, currentZ, baseWidth + 1, rampL, rampH);
                    currentZ -= rampL;
                    currentY += rampH;
                    break;
                }
                case 'narrow': {
                    const len = 20;
                    game.addPlatform(currentX, currentY, currentZ - len/2, baseWidth * 0.4, len);
                    game.addCoins(currentX, currentY + 1.2, currentZ, len, 4);
                    currentZ -= len;
                    break;
                }
                case 'pendulum': {
                    game.addPlatform(currentX, currentY, currentZ - 10, baseWidth + 3, 20);
                    game.addPendulum(currentX, currentY, currentZ - 10, hazardSpeedMult);
                    currentZ -= 20;
                    break;
                }
                case 'zigzag': {
                    const zzLen = 12;
                    const offset = 4;
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    game.addPlatform(currentX, currentY, currentZ - zzLen/2, baseWidth, zzLen);
                    currentZ -= zzLen;
                    currentX += offset * dir;
                    game.addPlatform(currentX, currentY, currentZ - zzLen/2, baseWidth, zzLen);
                    currentZ -= zzLen;
                    break;
                }
                case 'gap': {
                    const gapSize = 5 + Math.random() * 3;
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= (10 + gapSize);
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'bumpy': {
                    for(let b=0; b<6; b++) {
                        const bH = Math.random() * 0.7;
                        game.addPlatform(currentX, currentY + bH, currentZ - 3, baseWidth + 1.5, 6);
                        currentZ -= 6;
                    }
                    break;
                }
                case 'spinner': {
                    game.addPlatform(currentX, currentY, currentZ - 12, baseWidth + 4, 24);
                    game.addSpinner(currentX, currentY + 0.5, currentZ - 12, hazardSpeedMult);
                    currentZ -= 24;
                    break;
                }
                case 'stairs': {
                    const stepCount = 5;
                    const stepLen = 4;
                    const stepH = 0.8;
                    for(let s=0; s<stepCount; s++) {
                        game.addPlatform(currentX, currentY, currentZ - stepLen/2, baseWidth + 2, stepLen);
                        currentZ -= stepLen;
                        currentY += stepH;
                    }
                    break;
                }
                case 'tunnel': {
                    const tLen = 30;
                    game.addPlatform(currentX, currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                    game.addTunnelWalls(currentX, currentY, currentZ - tLen/2, baseWidth + 2, tLen);
                    currentZ -= tLen;
                    break;
                }
                case 'archipelago': {
                    const count = 5;
                    const dist = 8;
                    for(let a=0; a<count; a++) {
                        const offX = (Math.random() - 0.5) * 6;
                        game.addPlatform(currentX + offX, currentY, currentZ - dist/2, 3, 3);
                        game.addCoins(currentX + offX, currentY + 1, currentZ - dist/2, 1, 1);
                        currentZ -= dist;
                    }
                    break;
                }
                case 'checkerboard': {
                    const rows = 4;
                    const cSize = 3;
                    for(let r=0; r<rows; r++) {
                        const offX = (r % 2 === 0) ? -2 : 2;
                        game.addPlatform(currentX + currentX + offX, currentY, currentZ - cSize/2, cSize, cSize);
                        currentZ -= cSize + 2;
                    }
                    break;
                }
                case 'hammer_gauntlet': {
                    game.addPlatform(currentX, currentY, currentZ - 15, baseWidth + 4, 30);
                    for(let h=0; h<3; h++) {
                        game.addHammer(currentX, currentY, currentZ - 8 - h*8, hazardSpeedMult);
                    }
                    currentZ -= 30;
                    break;
                }
                case 'moving_rects': {
                    const len = 25;
                    game.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 2, len);
                    for(let m=0; m<4; m++) {
                        game.addMover(currentX, currentY + 0.5, currentZ - 5 - m*5, 3, 1, 2, false, hazardSpeedMult);
                    }
                    currentZ -= len;
                    break;
                }
                case 'speed_strip': {
                    const len = 20;
                    game.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 1, len, 0xffff00);
                    currentZ -= len;
                    break;
                }
                case 'halfpipe': {
                    const len = 20;
                    game.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 6, len);
                    // Sidewalls as ramps
                    game.addRamp(currentX - (baseWidth/2 + 3), currentY + 1.5, currentZ, 1, len, 0); // Flat visual but physics box...
                    // Better to just add static tilted boxes
                    game.addWall(currentX - baseWidth/2 - 2, currentY + 1, currentZ - len/2, 1, len, Math.PI/4);
                    game.addWall(currentX + baseWidth/2 + 2, currentY + 1, currentZ - len/2, 1, len, -Math.PI/4);
                    currentZ -= len;
                    break;
                }
                case 'side_crusher': {
                    const len = 15;
                    game.addPlatform(currentX, currentY, currentZ - len/2, baseWidth + 2, len);
                    game.addMover(currentX - 3, currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                    game.addMover(currentX + 3, currentY + 1, currentZ - len/2, 4, 2, len, true, hazardSpeedMult);
                    currentZ -= len;
                    break;
                }
                case 'jump_gap': {
                    const gap = 8; // Reduced gap for lower max speed
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    game.addCoins(currentX, currentY + 2, currentZ - 5 - gap/2, 1, 1);
                    currentZ -= (10 + gap);
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'double_jump_gap': {
                    const gap = 16; // Reduced gap for lower max speed
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    game.addCoins(currentX, currentY + 2.5, currentZ - 5 - gap/3, 1, 1);
                    game.addCoins(currentX, currentY + 4, currentZ - 5 - (2*gap/3), 1, 1);
                    currentZ -= (10 + gap);
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'triple_jump_gap': {
                    const gap = 24; // Reduced gap for lower max speed
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    game.addCoins(currentX, currentY + 2, currentZ - 5 - gap/4, 1, 1);
                    game.addCoins(currentX, currentY + 5, currentZ - 5 - (2*gap/4), 1, 1);
                    game.addCoins(currentX, currentY + 3, currentZ - 5 - (3*gap/4), 1, 1);
                    currentZ -= (10 + gap);
                    game.addPlatform(currentX, currentY, currentZ - 5, baseWidth + 2, 10);
                    currentZ -= 10;
                    break;
                }
                case 'climb': {
                    const stepL = 10;
                    const stepH = 4.5;
                    const stepGap = 6;
                    for(let c=0; c<3; c++) {
                        game.addPlatform(currentX, currentY, currentZ - stepL/2, baseWidth + 3, stepL);
                        game.addCoins(currentX, currentY + 2, currentZ - stepL - stepGap/2, 1, 1);
                        currentZ -= (stepL + stepGap);
                        currentY += stepH;
                    }
                    break;
                }
                default: { // fallback straight
                    game.addPlatform(currentX, currentY, currentZ - 10, baseWidth, 20);
                    currentZ -= 20;
                }
            }
        }

        // Finish line
        const finishLen = 30;
        game.addPlatform(currentX, currentY, currentZ - finishLen/2, 8, finishLen, 0x00ff00);
        game.finishX = currentX;
        game.finishY = currentY;
        game.finishZ = currentZ - finishLen + 10;
        game.placeFinishModel();
        currentZ -= finishLen;

        game.levelLength = Math.abs(currentZ);
}

/**
 * addPlatform
 */
export function addPlatform(game, x, y, z, width, length, color = null) {
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, length / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y - 0.5, z);
        game.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 1, length);
        const mat = color ? game.sharedMaterials.finish : game.sharedMaterials.wood;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(body.position);
        mesh.receiveShadow = true;
        game.scene.add(mesh);
        game.levelObjects.push({ mesh, body });
}

/**
 * addTunnelWalls
 */
export function addTunnelWalls(game, x, y, z, width, length) {
        const wallH = 2;
        const wallW = 0.2;
        
        // Left wall
        const shapeL = new CANNON.Box(new CANNON.Vec3(wallW/2, wallH/2, length/2));
        const bodyL = new CANNON.Body({ mass: 0, shape: shapeL });
        bodyL.position.set(x - width/2 - wallW/2, y + wallH/2, z);
        game.world.addBody(bodyL);

        const geo = new THREE.BoxGeometry(wallW, wallH, length);
        const meshL = new THREE.Mesh(geo, game.sharedMaterials.wall);
        meshL.position.copy(bodyL.position);
        game.scene.add(meshL);

        // Right wall
        const bodyR = new CANNON.Body({ mass: 0, shape: shapeL });
        bodyR.position.set(x + width/2 + wallW/2, y + wallH/2, z);
        game.world.addBody(bodyR);
        const meshR = new THREE.Mesh(geo, game.sharedMaterials.wall);
        meshR.position.copy(bodyR.position);
        game.scene.add(meshR);

        game.levelObjects.push({ mesh: meshL, body: bodyL }, { mesh: meshR, body: bodyR });
}

/**
 * addRamp
 */
export function addRamp(game, x, y, z, width, length, height) {
        const angle = Math.atan2(height, length);
        const rampLen = Math.sqrt(length*length + height*height);
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, 0.5, rampLen / 2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        const posZ = z - length/2;
        const posY = y + height/2 - 0.5;
        body.position.set(x, posY, posZ);
        body.quaternion.setFromEuler(angle, 0, 0);
        game.world.addBody(body);

        const geo = new THREE.BoxGeometry(width, 1, rampLen);
        const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
        mesh.receiveShadow = true;
        game.scene.add(mesh);
        game.levelObjects.push({ mesh, body });
}

/**
 * addPendulum
 */
export function addPendulum(game, x, y, z, speedMult = 1) {
        const pivotHeight = y + 8;
        const ballSize = 1.6;
        const shape = new CANNON.Sphere(ballSize);
        const body = new CANNON.Body({ mass: 10, shape: shape });
        body.position.set(x, pivotHeight - 5, z);
        game.world.addBody(body);

        const geo = new THREE.SphereGeometry(ballSize, 20, 20);
        const mesh = new THREE.Mesh(geo, game.sharedMaterials.pendulum);
        game.scene.add(mesh);

        const linePoints = [new THREE.Vector3(x, pivotHeight, z), new THREE.Vector3(x, pivotHeight - 5, z)];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        lineGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
        const line = new THREE.Line(lineGeo, game.sharedMaterials.rope);
        game.scene.add(line);

        game.pendulums.push({ body, mesh, line, pivot: new THREE.Vector3(x, pivotHeight, z), startTime: Math.random() * Math.PI * 2, speedMult });
}

/**
 * addSpinner
 */
export function addSpinner(game, x, y, z, speedMult = 1) {
        const w = 10, h = 0.6, d = 1.0;
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y + 0.5, z);
        game.world.addBody(body);

        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, game.sharedMaterials.spinner);
        game.scene.add(mesh);
        game.spinners.push({ body, mesh, speed: (2.5 + Math.random() * 1.5) * speedMult });
}

/**
 * addHammer
 */
export function addHammer(game, x, y, z, speedMult = 1) {
        const hSize = 2;
        const shape = new CANNON.Box(new CANNON.Vec3(hSize, hSize, 0.5));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y + 2, z);
        game.world.addBody(body);
        const geo = new THREE.BoxGeometry(hSize*2, hSize*2, 1);
        const mesh = new THREE.Mesh(geo, game.sharedMaterials.pendulum);
        game.scene.add(mesh);
        game.movers.push({ body, mesh, type: 'hammer', basePos: new THREE.Vector3(x, y + 2, z), offset: Math.random() * Math.PI, speedMult });
}

/**
 * addMover
 */
export function addMover(game, x, y, z, w, h, d, sideways = false, speedMult = 1) {
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y, z);
        game.world.addBody(body);
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, game.sharedMaterials.spinner);
        game.scene.add(mesh);
        game.movers.push({ body, mesh, type: sideways ? 'side' : 'slide', basePos: new THREE.Vector3(x, y, z), offset: Math.random() * Math.PI, speedMult });
}

/**
 * addWall
 */
export function addWall(game, x, y, z, w, l, rotZ) {
        const h = 2;
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, l/2));
        const body = new CANNON.Body({ mass: 0, shape: shape });
        body.position.set(x, y, z);
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), rotZ);
        game.world.addBody(body);
        const geo = new THREE.BoxGeometry(w, h, l);
        const mesh = new THREE.Mesh(geo, game.sharedMaterials.wall);
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
        game.scene.add(mesh);
        game.levelObjects.push({ body, mesh });
}

/**
 * addCoins
 */
export function addCoins(game, x, y, startZ, length, count) {
        // Create coins with varied sizes, shades and values between 1 and 50.
        const step = length / (count + 1);
        for(let i=1; i<=count; i++) {
            // Determine a value distribution: mix of small (1-5), medium (6-20), large (21-50)
            const r = Math.random();
            let value;
            if (r < 0.5) value = 1 + Math.floor(Math.random() * 5);         // common small coins 1-5
            else if (r < 0.85) value = 6 + Math.floor(Math.random() * 15);  // medium 6-20
            else value = 21 + Math.floor(Math.random() * 30);               // rare big 21-50

            // Map value to visual size and shade
            const scale = THREE.MathUtils.lerp(0.6, 1.4, (value - 1) / 49); // size from 0.6..1.4
            let colorHex = 0xffd700; // gold default
            if (value <= 5) colorHex = 0xcd7f32;       // bronze-ish for small
            else if (value <= 20) colorHex = 0xc0c0c0; // silver-ish for medium
            else colorHex = 0xffd700;                  // gold for large/high value

            // Create geometry with a bit of thickness
            const coinGeo = new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 0.12 * scale, 24);
            const mat = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 80, emissive: 0x000000 });
            const coin = new THREE.Mesh(coinGeo, mat);
            coin.rotation.x = Math.PI / 2;
            // slight random offset so coins aren't perfectly aligned
            const px = x + (Math.random() - 0.5) * Math.min(3, scale * 2);
            const pz = startZ - i * step + (Math.random() - 0.5) * 0.6;
            const py = y + 0.4 + (scale - 1) * 0.5;
            coin.position.set(px, py, pz);

            // store value and a tiny glow intensity for visual variety
            coin.userData = { value: value };
            // subtle pulse via scale baseline stored for later animation if desired
            coin.userData.baseScale = scale;

            game.scene.add(coin);
            game.coins.push(coin);
        }
}

/**
 * addCheckpoint
 */
export function addCheckpoint(game, x, y, z, width) {
        const length = 6;
        // Physical platform (Cyan color for checkpoint)
        game.addPlatform(x, y, z - length/2, width + 2, length, 0x00ffff);
        
        // Logic object
        game.checkpoints.push({
            z: z,
            pos: new CANNON.Vec3(x, y + 2, z - length/2),
            reached: false
        });
}

