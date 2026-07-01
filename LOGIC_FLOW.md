# Kamikazzi 3D — Visual Logic-Flow Map

> A diagram-first walkthrough of how the game boots, runs, and reacts.
> Diagrams use Mermaid; render in any Markdown viewer that supports them.

## 1. Module Dependence (one-glance overview)

```mermaid
flowchart LR
  subgraph Browser
    HTML["index.html<br/>(DOM + HUD + overlays)"]
  end
  subgraph Entry
    GAMEJS["/game.js<br/>app bootstrap"]
    PUTERJS["/puter-client.js<br/>(optional AI)"]
  end
  subgraph Game["game/ (logic)"]
    REND["renderer.js<br/>THREE scene+camera"]
    INPUT["input.js<br/>keyboard/pointer/<br/>joystick/gyro"]
    UI["ui.js<br/>HUD wiring"]
    WORLD["world.js<br/>orchestrator + loop"]
  end
  subgraph Domain["game/world/"]
    SHARED["shared.js<br/>TUNING + texture cache<br/>+ dispose helpers"]
    PLANE["plane/factory.js<br/>buildPlane + GLB loader"]
    CTRL["plane/controller.js<br/>PlaneController + contrails"]
    BLDG["buildings.js<br/>spawn/window/graffiti"]
    EXPL["explosion.js<br/>particle manager (shared geo)"]
    POW["powerups.js<br/>spawn/drift/reap"]
    IDEAS["ideas.js<br/>keyword parser + palette"]
  end
  HTML -->|"script tag"| GAMEJS
  HTML -->|"script tag"| PUTERJS
  GAMEJS --> REND
  GAMEJS --> WORLD
  GAMEJS --> INPUT
  GAMEJS --> UI
  WORLD --> SHARED
  WORLD --> PLANE
  WORLD --> CTRL
  WORLD --> BLDG
  WORLD --> EXPL
  WORLD --> POW
  WORLD --> IDEAS
  WORLD -.->|"window.__missionLog<br/>window.applyGameChanges"| PUTERJS
```

**Stand-alone files (not used by the game logic):**
- `puter-client.js` — optional AI/Puter integration.
- All assets live under `/assets/...` and are loaded via root-relative URLs.

---

## 2. Bootstrap (page-load → first frame)

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant H as index.html
  participant G as game.js
  participant R as renderer.js
  participant W as world.js
  participant I as input.js
  participant U2 as ui.js

  U->>H: Open page
  H->>H: paint startScreen overlay, #hud, 🍔, 神風 subtitle
  H->>G: <script type=module src=/game.js>
  G->>R: createRenderer(container)
  R-->>G: { renderer, scene, camera, domElement, onResize }
  G->>W: createWorld({scene, camera, domElement})
  W->>W: loadTexture(SKY_BACKGROUND_URL) → swap scene.background if not night
  W->>W: lighting + ground + strips + white clouds (no more red!)
  W->>W: plane (try GLB → fallback procedural) + engine audio
  W->>W: explosion / buildings / powerups managers + PlaneController
  W->>W: initMultiplayer() (best-effort, async, non-blocking)
  W-->>G: world API { plane, state, startLoop, dispose, ... }
  G->>I: setupInput({ domElement, world })
  I->>I: keys, pointer, on-screen joystick, gyro
  G->>U2: setupUI({ world, rendererObj })
  U2->>U2: uiLoop RAF + bind Start/Retry

  Note over H,W: Page is now interactive. Game is NOT running yet (state.running=false).

  U->>U2: click "Start Flying"
  U2->>W: world.startLoop(rendererObj)
  W->>W: resetGame() → seed 6 buildings, set plane (0,2,0)
  W->>W: stopLoop() (cancel any prior RAF) + planeController.reset()
  W->>W: requestAnimationFrame(loop)
```

---

## 3. Main Game Loop (every frame)

```mermaid
flowchart TD
    Start([RAF tick]) --> Delta["dt = getDelta() × TUNING.DT_HZ<br/>(clamp TUNING.MAX_DT_RAW)"]
    Delta --> ExplUpd["explosion.update(dt)"]
    ExplUpd --> PowUpd["powerups.update(speed, dt, plane.z)<br/>drift + spin + reap past GENERATION_END_Z"]
    PowUpd --> Running{"state.running?"}
    Running -- "No" --> Clouds
    Running -- "Yes" --> Score["speed += TUNING.SPEED_RAMP·dt<br/>score += speed·dt·TUNING.SCORE_GAIN"]
    Score --> Bridge["input = clamp((target.x - plane.x) / BOUND_X)<br/>planeController.update(dt, input)"]
    Bridge --> Bank["controller owns roll/pitch +<br/>propeller spin + wing-tip contrails"]
    Bank --> BldUpd["buildings.updateForSpeed(speed, dt, plane.z, cb)"]
    BldUpd --> Pass{"cb: passed? +TUNING.BUILD_PASS_BONUS<br/>collision? endGame"}
    Pass -- "crash" --> End([endGame])
    Pass -- "ok" --> Spawn{"spawnTimer ≥<br/>max(MIN_SPAWN_INTERVAL, interval - speed·SPAWN_SPEED_PRESSURE)"}
    Spawn -- "yes" --> SpawnB["buildings.spawn(GENERATION_START_Z ± jitter)"]
    Spawn -- "no" --> Strips
    SpawnB --> Strips["strips.forEach z += speed·BUILD_DRIFT_FACTOR·dt<br/>wrap when z>GENERATION_END_Z"]
    Strips --> Clouds["clouds drift z += speed·CLOUD_DRIFT·dt<br/>respawn at z<-560"]
    Clouds --> Camera["camera follow<br/>x += (plane.x·0.5 - x)·CAMERA_LERP·dt<br/>y += (plane.y+6 - y)·CAMERA_LERP·dt<br/>z = plane.z + CAMERA_DISTANCE<br/>lookAt ahead by CAMERA_LOOK_AHEAD"]
    Camera --> Render["renderer.render(scene, camera)"]
    Render --> Presence["presenceAccumulator += dt / DT_HZ<br/>if ≥ PRESENCE_INTERVAL_S → pushPresence"]
    Presence --> Start
    End --> Stop["state.running=false<br/>plane.visible=false<br/>explosion.spawn(plane.pos)<br/>persist kamikazziHiScore<br/>push score to kamikazzi-radio collection<br/>updatePresence(running:false)"]
```

> After `endGame()` the loop keeps running so clouds, camera, and the post-game UI loop continue.

---

## 4. Input → Plane Translation

```mermaid
flowchart LR
  subgraph Sources
    KB["Keyboard<br/>WASD / Arrows"]
    PTR["Pointer<br/>down+drag on canvas"]
    JOY["On-screen joystick<br/>touch + mouse drag"]
    GYR["DeviceOrientation<br/>(iOS permission gated)"]
  end
  subgraph Target["state.target (Vector2 proxy)"]
    TX["target.x"]
    TY["target.y"]
  end
  subgraph Bridge["each frame in world.loop"]
    Convert["input = clamp((target.x - plane.x) / BOUND_X, -1, 1)<br/>same for y → PlaneController.update"]
  end
  subgraph Fly["PlaneController"]
    Steer["velocity smoothed via exp damping<br/>plane.position += velocity·dt<br/>clamp to bounds<br/>bank/pitch from input.x/y<br/>spin propeller (∝ |velocity.x|)"]
    Trails["left/right wing-tip contrails update"]
  end

  KB -- "additive ±0.9 / ±0.6 per RAF" --> TX
  KB --> TY
  PTR -- "absolute: nx = clientX/W·2-1<br/>target.x = nx·BOUND_X" --> TX
  JOY  -- "absolute" --> TX
  GYR  -- "absolute: γ/30 → x; (β-10)/30 → y" --> TX
  JOY --> TY
  GYR --> TY
  PTR --> TY
  TX --> Convert
  TY --> Convert
  Convert --> Steer
  Steer --> Trails
```

**Conflict note.** Keyboard modifies `target.x` *additively*; pointer / joystick / gyro write it *absolutely*. Today, the absolute writer wins on hybrid input setups.

---

## 5. End-of-Run / Crash Flow

```mermaid
sequenceDiagram
  participant L as world.loop
  participant W as world (endGame)
  participant RK as localStorage
  participant RM as kamikazzi-radio collection
  participant UI as ui.js (uiLoop)
  participant U as User

  L->>W: endGame() (from checkCollision)
  W->>W: state.running=false, over=true, plane.visible=false
  W->>W: explosion.spawn(plane.position)
  W->>RK: write kamikazziHiScore if score>best
  W->>RM: collection('score').create({ score, x, y, z, ts })  --best-effort
  W->>RM: updatePresence({ running:false, score })  --best-effort

  loop Every RAF
    UI->>UI: uiLoop reads world.state
    UI->>U: paint score, speed×, best
    UI->>U: state.over ⇒ show #gameOver + crashImg
  end

  U->>UI: click "Try Again"
  UI->>UI: hide crashImg, hide overlays
  UI->>W: world.startLoop(rendererObj) ⇒ stopLoop() + resetGame() + loop again
```

---

## 6. Ideas / "Briefings" Pipeline (best-effort)

```mermaid
flowchart TD
  User["Player types/clicks something<br/>(UI not wired, but API exists)"] --> Add["world.addBriefing(text, author)<br/>writes localStorage 'kamikazziBriefings'<br/>dispatches 'briefingsUpdated'"]
  Add --> Event["window 'briefingsUpdated'"]
  Event --> Latest["pick latest briefing"]
  Latest --> Gen["window.generateFromComment(text)<br/>(puter-client.js)"]
  Gen --> Apply["world.applyGameChanges(aiOutput)"]
  Apply --> Parse["JSON.parse<br/>(with regex fallback to last {...})"]
  Parse --> Fields["apply fields:<br/>• spawnInterval (≥6)<br/>• baseSpeed / speedMultiplier (≥0.1)<br/>• enablePowerups (boolean)<br/>• _ops_blackout (true ⇒ dark sky/fog, false ⇒ restore)<br/>• spawnBuildingCount (≤8)"]
  Fields --> Persist{"persistIdeasConfig?"}
  Persist -- "yes" --> LS["localStorage 'kamikazziBriefingsCfg'"]
  Fields --> LoopRebound["next resetGame() picks up the new state<br/>(spawns more buildings / powerups)"]
  LS -.->|"read on next load"| Apply2["ideas.applyIdeasConfig on resetGame"]
```

Two parallel config systems read "briefings": the deterministic keyword parser (night / powerup / shield / speed boost) AND the AI-driven JSON object. Both flip `_briefings_enableDoctrine`.

---

## 7. Multiplayer Presence (best-effort)

```mermaid
sequenceDiagram
  participant W as world (initMultiplayer)
  participant S as WebsimSocket
  participant Net as Server

  W->>S: new WebsimSocket()
  W->>S: await room.initialize()
  W->>Net: updatePresence({x, y, z, score, running})
  W->>S: subscribePresence(map)

  loop Every strike
    Net-->>S: presence map { clientId ⇒ presence }
    S-->>W: callback fires
    W->>W: for each peer: lerp toward presence; scale ∝ score; remove gone peers
  end

  loop Each game RAF
    W->>Net: presenceAccumulator += dt/DT_HZ<br/>if ≥ TUNING.PRESENCE_INTERVAL_S → pushPresence
  end

  Note over W: presence appears as a single capsule mesh; not a real plane render.
```

---

## 8. Lifecycle Cheat-Sheet

| Event                          | Side effects                             |
|--------------------------------|------------------------------------------|
| Page load                      | Renderer + world + input + UI bound. RAF uiLoop starts. **No game yet.** |
| Click "Start Flying"           | `world.stopLoop()` (cancel prior) + `planeController.reset()` + `resetGame()` + first `loop()` RAF; engine sound tries to play under the user gesture |
| Per-frame (running)            | score↑, speed↑, PlaneController steers, buildings drift + spawn, strips scroll, clouds drift, camera follows, periodic presence |
| Collision                      | `endGame()` ⇒ explosion, hidden plane, persist `kamikazziHiScore`, push score, presence update; loop continues |
| "Try Again"                    | overlays hidden, **same** `startLoop` re-runs (prior RAF cancelled) |
| Page unload                    | `world.dispose()` walks scene and disposes unique GPU buffers while leaving shared geometry / material cache intact |

---

## 9. Data Ownership at a Glance

```mermaid
flowchart LR
  subgraph Mutable
    LS["localStorage<br/>kamikazziHiScore · kamikazziBriefings · kamikazziBriefingsCfg"]
    WIN["window<br/>__missionLog · applyGameChanges · generateFromComment<br/>(setters scoped to puter/tunnel collaborators)"]
  end
  subgraph State
    WORLD["world.state<br/>(running, over, score, speed, baseSpeed, spawnTimer, spawnInterval, target, best, _briefings_enableDoctrine, _ops_blackout)"]
    DOM3D["THREE objects<br/>(plane, buildings, powerups, clouds, strips, ground, lights, peer markers)"]
  end
  WORLD -. "writes" .-> LS
  WORLD -. "reads"  .-> WIN
  DOM3D -. "updated each RAF" .-> WORLD
```

No central store / event bus; modules talk via shared `world.state` plus a small surface of named globals. Shared Three.js geometries and materials (windows, explosions, plane procedural parts) live in `game/world/shared.js` and are registered against a `WeakSet` so they survive building / powerup disposal.
