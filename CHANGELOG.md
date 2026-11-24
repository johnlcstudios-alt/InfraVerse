# Changelog

## Release Notes - Version 2.3.0 (TWIN OPS: Field Engineer)

_Release date: 2026-11-24 · Applies to `IndustrialDigitalTwinSimulator.exe` and the new standalone `TwinOps.exe`_

---

## New Features

- Added **TWIN OPS: Field Engineer (OPS-07)** — a first-person operations game and
  sixth launcher application. The game runs on the **actual digital twins**: the five
  real facility applications are instantiated headless (`web/js/game/twinhost.js`)
  with their own `buildWorld()` models, layouts, lighting setup, saved configurations
  and `updateSimulation()` engines — nothing is re-modelled or re-simulated.
- Added the **in-game deployment menu** (the game's main menu, also reachable from
  the pause menu):
  - Choose an infrastructure — the engineer spawns at that district **and the same
    infrastructure opens automatically on the Digital Twin Simulator**:
    - Embedded (launcher) game → the platform swaps to that facility's control room.
    - Standalone `TwinOps.exe` → the shell launches
      `IndustrialDigitalTwinSimulator.exe --open=<facility>` beside the game window;
      both apps run side by side on the same config store and live bus.
  - *Full Site Command* card spawns at the central command post; *Resume Shift*
    returns to the saved position without opening a control room.
- Added **two-way live synchronisation** between the game and the program:
  - *Program → game:* each twin seeds from its saved configuration
    (`idt.<id>.config`); a co-open control room publishes live snapshots (sensors,
    alarms, run state) on the new `idt-twinbus` BroadcastChannel every 0.2 s.
  - *Game → program:* every panel change, repair or citation drives the twin's own
    public API (`persistSettings`, `restartPump`, `clearBin`, fault toggles…) and
    persists through the twin's own `saveConfig()`, so the simulator continues from
    the game-evolved state (tank level, battery SoC, control states, occupancy).
- Added **gameplay systems**:
  - Work orders derived from the twins' own alarm thresholds (low water, battery
    reserve, line jams, bin capacity, cold-chain excursions, overstays, yard
    capacity) with deadlines, escalation and rewards (XP / credits / levels).
  - Incident director injecting real fault states (booster pump failure, charge
    controller fault, diverter jam, compressor trip).
  - In-world field terminals per facility opening twin control panels (target level,
    auto-fill, load shed, cloud cover, belt speed, setpoints, dampers, arrival rate,
    overstay limits…), orange service hatches for repairs, direct interaction with
    real twin objects (walk-in freezer door, sort bins, enforcement booth).
  - Pause menu with shift report, sensitivity, site time scale and render quality.
- Added the **standalone game executable** `TwinOps.exe` (new `desktop-game/` shell
  project linking the simulator's proven WebView2 hosting, storage bridge, JSON
  reader and dialogs) with launcher `run.bat`, built by the new
  `tools/build-game.ps1` — the package now ships both executables side by side.
- Added the native `launch-simulator` shell action and `--open=<facility>` launch
  argument support; the platform launcher auto-opens the requested facility on start.
- Added launcher integration: new OPS-07 facility card with dedicated preview art.
- Added automated verification:
  - `tools/test-twinhost.mjs` — gate test: all five real twins build headless and
    tick with zero errors.
  - `tools/test-game.mjs` — 22 assertions: launcher card, game loop, persistent
    game→twin config round-trips, co-open live sync in both directions, deployment
    menu → twin control room.
  - `tools/test-game-controls.mjs` — 13 assertions: mouse look (yaw/pitch), key
    mapping, walking, exact ground rest, single-jump-then-settle with no bounce,
    wall collision, menu flow.

## Improvements

- **Performance** (the game renders five full twin worlds, ~2,600 meshes):
  - District visibility culling: districts beyond the linear-fog wall are hidden
    (their whole subtree skips draw and shadow passes) with a hysteresis band
    against boundary flicker.
  - Staggered engine ticking: near districts run their engines at full rate, far
    (hidden) districts on a staggered 15 Hz cadence with accumulated, sub-stepped
    time steps; all twin clocks stay coherent.
  - Tight, player-following shadow frustum (±46 m instead of ±90 m).
  - Shader/texture pre-warm (`renderer.compile`) during the loading overlay —
    removes first-appearance compile hitches during play.
  - Adaptive resolution scaler (0.7–1.0×) that holds the framerate on weak GPUs,
    plus an Auto / Performance / Balanced / High quality selector in the pause menu.
  - Removed per-frame allocations from the collision and interaction paths.
- The game ships its own purpose-built first-person controller
  (`TwinOpsControls`, `web/js/game/twinops.js`) with pointer-lock mouse look, an
  automatic drag-to-look fallback (VMs / RDP sessions where pointer lock fails),
  exact ground rest, sub-stepped movement and 4-direction collision push-out.
- Documentation: README gained a full TWIN OPS section (architecture, controls,
  deployment bridge, performance notes, verification commands).

## Bug Fixes

- Fixed **mouse look not working** in the game: the shared `FirstPersonControls`
  never assigns `activeLook`, so its look speed was permanently zero. The game now
  uses its own controller (the shared file is untouched, so the facilities'
  first-person mode is unchanged).
- Fixed the **constant jumping / sinking loop**: the shared controller's floor ray
  (origin eye + 0.35 m, reach 1.12 m) cannot detect a floor at standing eye height
  and its snap window never overlaps the detection zone. The game controller rests
  the eye exactly on the ground and only jumps from a fresh, grounded Space press
  (`e.repeat` guarded, no stored impulses).
- Fixed falling through the world at low frame rates by exact floor clamping and
  clamped controller time steps.
- Fixed the game's water twin not persisting its evolved level: the adapter now
  writes the live level into `initialLevel` (the key the twin's
  `applyRuntimeConfig()` consumes) before saving, so the simulator resumes from the
  game-evolved state.
- Fixed stale twin configs after game-side changes: runtime→config mutations now go
  through each twin's own `persistSettings()` where available.

## Known Issues

- On integrated GPUs the five full twin worlds benefit from the district culling
  and the *Performance* quality preset; SwiftShader (software WebGL) remains slow —
  this only affects automated headless testing, not desktop playback.
- The co-open live bus (`idt-twinbus`) requires two browser tabs in web dev mode;
  in the packaged desktop shell the game and a control room run one at a time, so
  live snapshots are unavailable there and the persistent config-store sync applies
  (changes land when the other side next opens).
- The platform-wide `FirstPersonControls` defects (`activeLook` never assigned;
  floor-ray reach) are deliberately left untouched to avoid changing the five
  facilities' verified first-person behaviour; only TWIN OPS is affected by the fix.

## Build Information

- Simulator: `dist\IndustrialDigitalTwinSimulator\IndustrialDigitalTwinSimulator.exe`
  (148.0 KB) · SHA256 `46B8ACFBB002116E36AD378DFD8B0CE8E7D4D90B113D54CC9FC84626A0ED68B4`
- Game: `dist\TwinOps\TwinOps.exe` (148 KB, ships beside the simulator executable) ·
  SHA256 `8EE592D4C7D161AA4824908BBAFF61DB9479E2B1EFAE3F46E4E5797581029981`
- Storage/bridge self-test: 85 checks passed.
- Automated verification: twinhost gate 5/5 · game suite 22/22 · controls suite
  13/13 · zero console/page errors across all runs.
- Integration touchpoints for maintainers: `web/js/core/registry.js` (launcher
  entry), `web/js/core/previews.js` (card art), `web/js/core/base.js`
  (`_publishTwinBus` / `_applyTwinCommand` guarded live bridge),
  `web/js/main.js` (launch-argument auto-open), `desktop/MainForm.cs`
  (parameterised shell, `launch-simulator`, launch-args injection),
  `desktop/Program.cs` (`--open=` parsing).

## Files Added

```
web/js/game/twinhost.js        headless twin runner (faithful SceneView environment)
web/js/game/twinlink.js        twin adapters + config store + live bus
web/js/game/world.js           campus terrain, roads, district plots
web/js/game/twinops.js         game app, controller, HUD, missions, panels, menu
web/game.html                  standalone game entry page
desktop-game/TwinOps.csproj    game shell project (links shared shell sources)
desktop-game/Program.cs        game entry point
tools/build-game.ps1           standalone game packaging (builds both exes)
tools/test-twinhost.mjs        real-twin construction gate test
tools/test-game.mjs            full game + sync verification (22 checks)
tools/test-game-controls.mjs   controller verification (13 checks)
docs/twinops-campus.png        campus overview screenshot
docs/twinops-gameplay.png      ground-level gameplay screenshot
CHANGELOG.md                   this file
```
