import * as THREE from "three";

/**
 * renderBuilder
 */
export function renderBuilder(game) {
        // Prepare builder state
        if (!game.builder) {
            game.builder = {
                segments: [], // each: {type:'platform'|'ramp'|'gap'|'checkpoint'|'finish', len, width, height}
                cursorZ: -5
            };
        }
        // Populate saved list
        const list = document.getElementById('builder-saved-list');
        list.innerHTML = '';
        const saved = JSON.parse(localStorage.getItem('goingBalls_customTracks_v1') || '[]');
        saved.forEach((t, idx) => {
            const btn = document.createElement('button');
            btn.className = 'menu-btn';
            btn.style.padding = '6px 10px';
            btn.innerText = t.name || `Track ${idx+1}`;
            btn.onclick = () => {
                game.builder.segments = JSON.parse(JSON.stringify(t.segments || []));
                game.builder.cursorZ = -5;
                game.clearBuilderPreview();
                game.previewBuilder();
            };
            list.appendChild(btn);
        });

        // Wire up builder controls
        document.getElementById('builder-add-platform').onclick = () => {
            game.builder.segments.push({ type: 'platform', width: 6, len: 12, y: 0 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-ramp').onclick = () => {
            game.builder.segments.push({ type: 'ramp', width: 6, len: 12, height: 3 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-gap').onclick = () => {
            game.builder.segments.push({ type: 'gap', len: 8 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-checkpoint').onclick = () => {
            game.builder.segments.push({ type: 'checkpoint', width: 6, len: 6 });
            game.previewBuilder();
        };
        document.getElementById('builder-set-finish').onclick = () => {
            // ensure only one finish at end
            game.builder.segments = game.builder.segments.filter(s => s.type !== 'finish');
            game.builder.segments.push({ type: 'finish', width: 8, len: 12 });
            game.previewBuilder();
        };

        // New trap/hazard buttons
        document.getElementById('builder-add-spikes').onclick = () => {
            // spikes segment: narrow row of spikes across track
            game.builder.segments.push({ type: 'spikes', width: 6, len: 6, count: 6 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-pendulum').onclick = () => {
            // pendulum hazard that swings across the track
            game.builder.segments.push({ type: 'pendulum', width: 6, len: 12, intensity: 1 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-spinner').onclick = () => {
            // spinner hazard: rotating bar
            game.builder.segments.push({ type: 'spinner', width: 8, len: 12, speedMult: 1 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-crusher').onclick = () => {
            // side crusher: movers that slide inward/outward
            game.builder.segments.push({ type: 'crusher', width: 8, len: 12, force: 1 });
            game.previewBuilder();
        };

        // Scene starter / decorative start area
        document.getElementById('builder-scene-starter').onclick = () => {
            game.builder.segments.unshift({ type: 'scene_starter', width: 10, len: 10 });
            game.previewBuilder();
        };

        // Additional builder tools
        document.getElementById('builder-add-trampoline').onclick = () => {
            game.builder.segments.push({ type: 'trampoline', width: 4, len: 4, bounce: 18 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-coinring').onclick = () => {
            game.builder.segments.push({ type: 'coin_ring', radius: 3, count: 10 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-movingplatform').onclick = () => {
            game.builder.segments.push({ type: 'moving_platform', width: 4, len: 8, travel: 6, axis: 'x' });
            game.previewBuilder();
        };
        document.getElementById('builder-add-spikepit').onclick = () => {
            game.builder.segments.push({ type: 'spike_pit', width: 6, len: 6, depth: 1.2, count: 8 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-seesaw').onclick = () => {
            game.builder.segments.push({ type: 'seesaw', width: 6, len: 8 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-spring').onclick = () => {
            game.builder.segments.push({ type: 'spring_pad', width: 2, len: 2, boost: 22 });
            game.previewBuilder();
        };

        // Stunt section buttons
        document.getElementById('builder-add-stunt-ramp').onclick = () => {
            game.builder.segments.push({ type: 'stunt_ramp', width: 8, len: 18, height: 6 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-stunt-loop').onclick = () => {
            game.builder.segments.push({ type: 'stunt_loop', radius: 4, segments: 16 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-stunt-grind').onclick = () => {
            game.builder.segments.push({ type: 'stunt_grind', width: 0.6, len: 20, height: 1.2 });
            game.previewBuilder();
        };
        document.getElementById('builder-add-stunt-donut').onclick = () => {
            game.builder.segments.push({ type: 'stunt_donut', outer: 6, inner: 3, thickness: 0.8 });
            game.previewBuilder();
        };

        document.getElementById('builder-clear').onclick = () => {
            game.builder.segments = [];
            game.builder.cursorZ = -5;
            game.clearBuilderPreview();
        };
        document.getElementById('builder-preview').onclick = () => {
            game.clearBuilderPreview();
            game.previewBuilder();
        };
        document.getElementById('builder-save').onclick = () => {
            const nameInput = document.getElementById('builder-name').value || 'Custom Track';
            const saved = JSON.parse(localStorage.getItem('goingBalls_customTracks_v1') || '[]');
            saved.push({ name: nameInput, segments: game.builder.segments });
            localStorage.setItem('goingBalls_customTracks_v1', JSON.stringify(saved));
            game.renderBuilder();
        };
        document.getElementById('builder-load').onclick = () => {
            // load first saved (if any) into current level immediately
            const saved = JSON.parse(localStorage.getItem('goingBalls_customTracks_v1') || '[]');
            if (saved.length > 0) {
                game.loadCustomLevel(saved[0]);
                document.getElementById('builder-modal').style.display = 'none';
            }
        };

        // Enter-live scene builder button (places platform segments directly in the world)
        const enterBtn = document.getElementById('builder-enter-scene');
        if (enterBtn) {
            enterBtn.onclick = () => {
                game.enterBuilderScene();
            };
        }
}

/**
 * clearBuilderPreview
 */
export function clearBuilderPreview(game) {
        if (!game.builderPreview) game.builderPreview = [];
        game.builderPreview.forEach(o => {
            if (o.mesh) game.scene.remove(o.mesh);
        });
        game.builderPreview = [];
}

/**
 * previewBuilder
 */
export function previewBuilder(game) {
        if (!game.builder) return;
        const startX = 0;
        let curY = 0;
        let curZ = -5;
        game.clearBuilderPreview();
        game.builder.segments.forEach(seg => {
            if (seg.type === 'platform') {
                const geo = new THREE.BoxGeometry(seg.width, 1, seg.len);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
                mesh.position.set(startX, curY - 0.5, curZ - seg.len/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'platform' });
                curZ -= seg.len;
            } else if (seg.type === 'ramp') {
                const geo = new THREE.BoxGeometry(seg.width, 1, Math.sqrt(seg.len*seg.len + (seg.height||3)*(seg.height||3)));
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
                // tilt for visual
                mesh.position.set(startX, curY + (seg.height||3)/2 - 0.5, curZ - seg.len/2);
                mesh.rotation.x = -Math.atan2((seg.height||3), seg.len);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'ramp' });
                curY += (seg.height||3);
                curZ -= seg.len;
            } else if (seg.type === 'gap') {
                // just move cursor forward by gap length
                curZ -= (seg.len || 8);
            } else if (seg.type === 'checkpoint') {
                const geo = new THREE.BoxGeometry((seg.width||6)+2, 1, seg.len||6);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.finish);
                mesh.position.set(startX, curY - 0.5, curZ - (seg.len||6)/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'checkpoint' });
                curZ -= (seg.len || 6);
            } else if (seg.type === 'spikes') {
                // preview spikes as small thin tall boxes across the track
                const count = seg.count || 6;
                const spacing = (seg.width || 6) / count;
                for (let s = 0; s < count; s++) {
                    const spikeGeo = new THREE.ConeGeometry(0.2, 0.8, 6);
                    const spike = new THREE.Mesh(spikeGeo, game.sharedMaterials.hazard);
                    const px = startX - (seg.width||6)/2 + spacing * (s + 0.5);
                    spike.position.set(px, curY + 0.2, curZ - (seg.len||6)/2);
                    spike.rotation.x = Math.PI;
                    game.scene.add(spike);
                    game.builderPreview.push({ mesh: spike, kind: 'spike' });
                }
                curZ -= (seg.len || 6);
            } else if (seg.type === 'pendulum') {
                // preview pendulum as a hanging sphere + line
                const geo = new THREE.SphereGeometry(0.6, 12, 12);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.pendulum);
                mesh.position.set(startX, curY + 4, curZ - (seg.len||12)/2);
                game.scene.add(mesh);
                const points = [ new THREE.Vector3(startX, curY + 6, curZ - (seg.len||12)/2), new THREE.Vector3(startX, curY + 4, curZ - (seg.len||12)/2) ];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(lineGeo, game.sharedMaterials.rope);
                game.scene.add(line);
                game.builderPreview.push({ mesh, line, kind: 'pendulum' });
                curZ -= (seg.len || 12);
            } else if (seg.type === 'spinner') {
                // preview spinner as a rotating bar
                const geo = new THREE.BoxGeometry(6, 0.5, 0.8);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.spinner);
                mesh.position.set(startX, curY + 0.5, curZ - (seg.len||12)/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'spinner' });
                curZ -= (seg.len || 12);
            } else if (seg.type === 'crusher') {
                // preview side crushers as two sliding walls
                const leftGeo = new THREE.BoxGeometry(1, 2, seg.len || 12);
                const left = new THREE.Mesh(leftGeo, game.sharedMaterials.pendulum);
                left.position.set(startX - (seg.width||8)/2 - 0.6, curY + 1, curZ - (seg.len||12)/2);
                const right = left.clone();
                right.position.set(startX + (seg.width||8)/2 + 0.6, curY + 1, curZ - (seg.len||12)/2);
                game.scene.add(left);
                game.scene.add(right);
                game.builderPreview.push({ mesh: left, kind: 'crusher' });
                game.builderPreview.push({ mesh: right, kind: 'crusher' });
                curZ -= (seg.len || 12);
            } else if (seg.type === 'stunt_ramp') {
                // big stunt ramp preview (taller ramp)
                const geo = new THREE.BoxGeometry(seg.width||8, 1, Math.sqrt((seg.len||18)*(seg.len||18) + (seg.height||6)*(seg.height||6)));
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
                mesh.position.set(startX, curY + (seg.height||6)/2 - 0.5, curZ - (seg.len||18)/2);
                mesh.rotation.x = -Math.atan2((seg.height||6), seg.len||18);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'stunt_ramp' });
                curY += (seg.height||6);
                curZ -= (seg.len || 18);
            } else if (seg.type === 'stunt_loop') {
                // loop preview as ring of small platforms
                const segCount = seg.segments || 16;
                const r = seg.radius || 4;
                for (let i=0;i<segCount;i++){
                    const a = (i/segCount)*Math.PI*2;
                    const px = startX + Math.cos(a)*r;
                    const pz = curZ - (seg.radius||4) + Math.sin(a)*r - 2;
                    const geo = new THREE.BoxGeometry(1.2, 0.6, 1.2);
                    const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
                    mesh.position.set(px, curY + Math.sin(a) * (r*0.15) + r*0.2, pz);
                    mesh.rotation.z = Math.cos(a)*0.2;
                    game.scene.add(mesh);
                    game.builderPreview.push({ mesh, kind: 'stunt_loop' });
                }
                curZ -= (seg.radius || 6) * 2;
            } else if (seg.type === 'stunt_grind') {
                // grind rail preview as a thin elevated plank
                const geo = new THREE.BoxGeometry(seg.width||0.6, 0.2, seg.len||20);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.coin);
                mesh.position.set(startX, curY + (seg.height||1.2), curZ - (seg.len||20)/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'stunt_grind' });
                curZ -= (seg.len || 20);
            } else if (seg.type === 'stunt_donut') {
                // donut preview as torus
                const torusGeo = new THREE.TorusGeometry(seg.outer||6, (seg.outer-seg.inner||3)/2 || 1, 16, 64);
                const torus = new THREE.Mesh(torusGeo, game.sharedMaterials.wood);
                torus.position.set(startX, curY + 1.0, curZ - 4);
                torus.rotation.x = Math.PI/2;
                game.scene.add(torus);
                game.builderPreview.push({ mesh: torus, kind: 'stunt_donut' });
                curZ -= 10;
            } else if (seg.type === 'trampoline') {
                const geo = new THREE.CylinderGeometry((seg.width||4)/2, (seg.width||4)/2, 0.6, 16);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.speed);
                mesh.rotation.x = Math.PI / 2;
                mesh.position.set(startX, curY + 0.2, curZ - (seg.len||4)/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'trampoline' });
                curZ -= (seg.len || 4);
            } else if (seg.type === 'coin_ring') {
                const count = seg.count || 8;
                const radius = seg.radius || 3;
                for (let i=0;i<count;i++){
                    const a = (i / count) * Math.PI * 2;
                    const cx = startX + Math.cos(a) * radius;
                    const cz = curZ - 4 + Math.sin(a) * radius;
                    const coinGeo = new THREE.CylinderGeometry(0.3,0.3,0.08,16);
                    const coin = new THREE.Mesh(coinGeo, game.sharedMaterials.coin);
                    coin.rotation.x = Math.PI/2;
                    coin.position.set(cx, curY + 1.2, cz);
                    game.scene.add(coin);
                    game.builderPreview.push({ mesh: coin, kind: 'coin' });
                }
                curZ -= 4;
            } else if (seg.type === 'moving_platform') {
                const geo = new THREE.BoxGeometry(seg.width||4, 1, seg.len||8);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
                mesh.position.set(startX, curY - 0.5, curZ - (seg.len||8)/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'moving_platform' });
                curZ -= (seg.len || 8);
            } else if (seg.type === 'spike_pit') {
                const count = seg.count || 6;
                const spacing = (seg.width || 6) / count;
                for (let s=0; s<count; s++){
                    const px = startX - (seg.width||6)/2 + spacing*(s+0.5);
                    const spikeGeo = new THREE.ConeGeometry(0.25, 0.8, 6);
                    const spike = new THREE.Mesh(spikeGeo, game.sharedMaterials.hazard);
                    spike.position.set(px, curY - 0.2, curZ - (seg.len||6)/2);
                    spike.rotation.x = Math.PI;
                    game.scene.add(spike);
                    game.builderPreview.push({ mesh: spike, kind: 'spike_pit' });
                }
                curZ -= (seg.len || 6);
            } else if (seg.type === 'seesaw') {
                const base = new THREE.BoxGeometry(0.6, 0.6, 1.2);
                const plank = new THREE.BoxGeometry(seg.width||6, 0.3, 1.2);
                const baseMesh = new THREE.Mesh(base, game.sharedMaterials.pendulum);
                baseMesh.position.set(startX, curY + 0.3, curZ - (seg.len||8)/2);
                const plankMesh = new THREE.Mesh(plank, game.sharedMaterials.wood);
                plankMesh.position.set(startX, curY + 0.8, curZ - (seg.len||8)/2);
                game.scene.add(baseMesh); game.scene.add(plankMesh);
                game.builderPreview.push({ mesh: baseMesh, kind: 'seesaw' });
                game.builderPreview.push({ mesh: plankMesh, kind: 'seesaw_plank' });
                curZ -= (seg.len || 8);
            } else if (seg.type === 'spring_pad') {
                const geo = new THREE.CircleGeometry((seg.width||2)/2, 16);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.speed);
                mesh.rotation.x = -Math.PI/2;
                mesh.position.set(startX, curY + 0.01, curZ - (seg.len||2)/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'spring' });
                curZ -= (seg.len || 2);
            } else if (seg.type === 'scene_starter') {
                const geo = new THREE.BoxGeometry(seg.width||10, 1, seg.len||10);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.finish);
                mesh.position.set(startX, curY - 0.5, curZ - (seg.len||10)/2);
                game.scene.add(mesh);
                const bannerGeo = new THREE.PlaneGeometry(4,1);
                const banner = new THREE.Mesh(bannerGeo, game.sharedMaterials.coin);
                banner.position.set(startX, curY + 1.5, curZ - (seg.len||10)/2);
                game.scene.add(banner);
                game.builderPreview.push({ mesh, banner, kind: 'scene_starter' });
                curZ -= (seg.len || 10);
            } else if (seg.type === 'finish') {
                const geo = new THREE.BoxGeometry(seg.width, 1, seg.len);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.finish);
                mesh.position.set(startX, curY - 0.5, curZ - seg.len/2);
                game.scene.add(mesh);
                game.builderPreview.push({ mesh, kind: 'finish' });
                curZ -= seg.len;
            }
        });
}

/**
 * loadCustomLevel
 */
export function loadCustomLevel(game, custom) {
        // Clear current level and build from segments
        game.clearLevel();
        game.lastCheckpointPos.set(0, 5, 0);
        let currentZ = 0;
        let currentX = 0;
        let currentY = 0;

        // start platform
        game.addPlatform(0, 0, 0, 8, 15);
        currentZ -= 7.5;

        (custom.segments || []).forEach(seg => {
            switch(seg.type) {
                case 'platform':
                    game.addPlatform(currentX, currentY, currentZ - (seg.len||12)/2, seg.width||6, seg.len||12);
                    currentZ -= (seg.len||12);
                    break;
                case 'ramp':
                    game.addRamp(currentX, currentY, currentZ, seg.width||6, seg.len||12, seg.height||3);
                    currentZ -= seg.len||12;
                    currentY += seg.height||3;
                    break;
                case 'gap':
                    currentZ -= seg.len||8;
                    break;
                case 'checkpoint':
                    game.addCheckpoint(currentX, currentY, currentZ - (seg.len||6)/2, seg.width||6);
                    currentZ -= seg.len||6;
                    break;
                case 'finish':
                    game.addPlatform(currentX, currentY, currentZ - (seg.len||12)/2, seg.width||8, seg.len||12, 0x00ff00);
                    game.finishX = currentX;
                    game.finishY = currentY;
                    game.finishZ = currentZ - (seg.len||12) + 10;
                    game.placeFinishModel();
                    currentZ -= seg.len||12;
                    break;
                case 'spikes':
                    // create a row of thin spike colliders (use thin walls/cones approximated by thin boxes)
                    const spikeCount = seg.count || 6;
                    const spacing = (seg.width || 6) / spikeCount;
                    for (let s=0; s<spikeCount; s++) {
                        const px = currentX - (seg.width||6)/2 + spacing * (s + 0.5);
                        // tall thin box that acts as hazard (player will collide and be knocked)
                        game.addWall(px, currentY + 0.5, currentZ - (seg.len||6)/2, 0.2, seg.len || 6, 0);
                    }
                    currentZ -= (seg.len || 6);
                    break;
                case 'pendulum':
                    // add a pendulum hazard centered in this segment
                    game.addPendulum(currentX, currentY, currentZ - (seg.len||12)/2, seg.intensity || 1);
                    currentZ -= (seg.len || 12);
                    break;
                case 'spinner':
                    // add a spinner hazard
                    game.addSpinner(currentX, currentY + 0.5, currentZ - (seg.len||12)/2, seg.speedMult || 1);
                    currentZ -= (seg.len || 12);
                    break;
                case 'crusher':
                    // add two movers that slide inward/outward as crushers
                    game.addMover(currentX - (seg.width||8)/2 - 1, currentY + 1, currentZ - (seg.len||12)/2, 1.2, 2, seg.len || 12, true, seg.force || 1);
                    game.addMover(currentX + (seg.width||8)/2 + 1, currentY + 1, currentZ - (seg.len||12)/2, 1.2, 2, seg.len || 12, true, seg.force || 1);
                    currentZ -= (seg.len || 12);
                    break;
                case 'stunt_ramp':
                    // create a physical stunt ramp (use addRamp)
                    game.addRamp(currentX, currentY, currentZ, seg.width||8, seg.len||18, seg.height||6);
                    currentZ -= (seg.len || 18);
                    currentY += seg.height || 6;
                    break;
                case 'stunt_loop':
                    // approximate a loop by placing multiple short platforms in a circular arrangement
                    const loopSegs = seg.segments || 16;
                    const loopR = seg.radius || 4;
                    for (let i=0;i<loopSegs;i++){
                        const a = (i/loopSegs)*Math.PI*2;
                        const px = currentX + Math.cos(a)*loopR;
                        const pz = currentZ - loopR + Math.sin(a)*loopR;
                        // small platforms to approximate loop surface
                        game.addPlatform(px, currentY + Math.sin(a)*0.6, pz, 1.2, 1.2);
                    }
                    currentZ -= loopR*2;
                    break;
                case 'stunt_grind':
                    // grind rail as a thin elevated physics platform (narrow long box)
                    game.addPlatform(currentX, currentY + (seg.height||1.2), currentZ - (seg.len||20)/2, seg.width||0.6, seg.len||20);
                    currentZ -= (seg.len || 20);
                    break;
                case 'stunt_donut':
                    // donut approximated by ring of small platforms around center
                    const outer = seg.outer || 6;
                    const inner = seg.inner || 3;
                    const donutSegs = 20;
                    for (let i=0;i<donutSegs;i++){
                        const a = (i/donutSegs)*Math.PI*2;
                        const r = (outer+inner)/2;
                        const px = currentX + Math.cos(a)*r;
                        const pz = currentZ - 4 + Math.sin(a)*r;
                        game.addPlatform(px, currentY + 0.6, pz, 1.0, 1.0);
                    }
                    currentZ -= 10;
                    break;
            }
        });

        // finalize
        game.levelLength = Math.abs(currentZ);
}

/**
 * enterBuilderScene
 */
export function enterBuilderScene(game) {
        if (game.inBuilderScene) return;
        game.inBuilderScene = true;
        // hide UI menus
        document.getElementById('builder-modal').style.display = 'none';
        if (!game.builder) game.builder = { segments: [], cursorZ: -5 };

        // save previous camera state
        game._savedCamera = {
            position: game.camera.position.clone(),
            yaw: game.cameraYaw,
            pitch: game.cameraPitch,
            distance: game.cameraDistance
        };

        // set overhead camera
        game.cameraYaw = 0;
        game.cameraPitch = 1.45; // almost top-down
        game.cameraDistance = 18;

        // create a grid plane for visual placement
        const size = 100;
        if (!game._builderGrid) {
            const grid = new THREE.GridHelper(size, size / 1, 0x444444, 0x222222);
            grid.rotation.x = 0;
            game.scene.add(grid);
            game._builderGrid = grid;
        }

        // create placement cursor (a semi-transparent box)
        if (!game._builderCursor) {
            const geo = new THREE.BoxGeometry(6, 0.6, 6);
            const mat = new THREE.MeshPhongMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, 0.3, game.builder.cursorZ || -5);
            game.scene.add(mesh);
            game._builderCursor = mesh;
            game._builderCursor.userData = { width: 6, len: 6, rotation: 0 };
        }

        // place a small HUD indicator
        if (!game._builderHint) {
            const el = document.createElement('div');
            el.id = 'builder-hint';
            el.style.position = 'absolute';
            el.style.left = '10px';
            el.style.bottom = '10px';
            el.style.padding = '8px 12px';
            el.style.background = 'rgba(0,0,0,0.6)';
            el.style.color = 'white';
            el.style.fontSize = '13px';
            el.style.borderRadius = '8px';
            el.style.zIndex = 2000;
            el.innerText = 'Builder: Arrows move • Q/E rotate • +/- size • P place • Esc exit';
            document.body.appendChild(el);
            game._builderHint = el;
        }

        // Key handlers for builder placement
        game._builderKeyHandler = (e) => {
            if (!game.inBuilderScene) return;
            const step = 0.5;
            if (e.code === 'ArrowUp') {
                game._builderCursor.position.z -= step;
            } else if (e.code === 'ArrowDown') {
                game._builderCursor.position.z += step;
            } else if (e.code === 'ArrowLeft') {
                game._builderCursor.position.x -= step;
            } else if (e.code === 'ArrowRight') {
                game._builderCursor.position.x += step;
            } else if (e.code === 'KeyQ') {
                game._builderCursor.rotation.y += 0.12;
            } else if (e.code === 'KeyE') {
                game._builderCursor.rotation.y -= 0.12;
            } else if (e.code === 'Equal' || e.key === '+') {
                // increase size
                game._builderCursor.scale.x += 0.05;
                game._builderCursor.scale.z += 0.05;
            } else if (e.code === 'Minus' || e.key === '-') {
                // decrease size but clamp
                game._builderCursor.scale.x = Math.max(0.4, game._builderCursor.scale.x - 0.05);
                game._builderCursor.scale.z = Math.max(0.4, game._builderCursor.scale.z - 0.05);
            } else if (e.code === 'KeyP') {
                // Place a platform segment at cursor — push into builder.segments
                const w = Math.round(6 * game._builderCursor.scale.x * 10) / 10;
                const l = Math.round(6 * game._builderCursor.scale.z * 10) / 10;
                const seg = { type: 'platform', width: w, len: l, y: 0, x: game._builderCursor.position.x, z: game._builderCursor.position.z, rotY: game._builderCursor.rotation.y };
                game.builder.segments.push(seg);
                // also create a preview object so the user sees immediate placement
                const geo = new THREE.BoxGeometry(w, 1, l);
                const mesh = new THREE.Mesh(geo, game.sharedMaterials.wood);
                mesh.position.set(seg.x, 0 - 0.5, seg.z);
                mesh.rotation.y = seg.rotY;
                game.scene.add(mesh);
                game.builderPreview = game.builderPreview || [];
                game.builderPreview.push({ mesh, kind: 'platform' });
            } else if (e.code === 'Escape') {
                game.exitBuilderScene();
            }
        };

        window.addEventListener('keydown', game._builderKeyHandler);
}

/**
 * exitBuilderScene
 */
export function exitBuilderScene(game) {
        if (!game.inBuilderScene) return;
        game.inBuilderScene = false;
        // restore camera
        if (game._savedCamera) {
            game.cameraYaw = game._savedCamera.yaw;
            game.cameraPitch = game._savedCamera.pitch;
            game.cameraDistance = game._savedCamera.distance;
            game.camera.position.copy(game._savedCamera.position);
            game._savedCamera = null;
        }
        // remove helper objects
        if (game._builderGrid) { game.scene.remove(game._builderGrid); game._builderGrid = null; }
        if (game._builderCursor) { game.scene.remove(game._builderCursor); game._builderCursor = null; }
        if (game._builderHint) { document.body.removeChild(game._builderHint); game._builderHint = null; }
        if (game._builderKeyHandler) { window.removeEventListener('keydown', game._builderKeyHandler); game._builderKeyHandler = null; }

        // update preview in modal / builder UI to reflect placed segments
        game.clearBuilderPreview();
        game.previewBuilder();

        // reopen builder modal so user can save/load or fine-tune
        document.getElementById('builder-modal').style.display = 'flex';
}

