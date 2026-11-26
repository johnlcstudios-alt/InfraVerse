# Tech Stack

The complete technology stack of the **Industrial Digital Twin Simulator** (NEXUS)
platform and its **TWIN OPS: Field Engineer** game. Nothing here is required to run
the packaged release — end users only need Windows and the Edge WebView2 Runtime —
but this is what the program is built from and what you need to build or extend it.

## At a Glance

| Layer | Technology | Version / Notes |
| --- | --- | --- |
| Desktop shell | C# on .NET Framework | `net48`, x64, WinForms |
| Embedded browser | Microsoft Edge WebView2 | `Microsoft.Web.WebView2` 1.0.4258.31 |
| User interface | HTML5 + CSS3 + vanilla JavaScript | ES2022 modules, import maps, no framework |
| 3D rendering | Three.js (WebGL) | r170 / npm `0.170.0`, vendored |
| Simulation engines | Plain JavaScript classes | Frame-driven, per-facility modules |
| Persistence | JSON over a native message bridge | Atomic writes to `%LOCALAPPDATA%` |
| Live sync | `BroadcastChannel` + `postMessage` | `idt-twinbus`, `idt-storage` |
| Build | PowerShell 7 + MSBuild | `.NET 8 SDK`, NuGet restore |
| Verification | Node.js + Playwright Core | Headless Chromium and WebView2 DevTools |
| Packaging | Portable folder + `run.bat` | No installer, no admin rights |

## Desktop Shell — C# / .NET Framework 4.8 / WinForms

| Item | Detail |
| --- | --- |
| Language | C# (`LangVersion` latest) |
| Runtime target | .NET Framework 4.8 (`net48`), x64 |
| UI toolkit | Windows Forms (WinForms) |
| Embedded browser | Microsoft Edge WebView2 (Chromium) |
| Project files | `desktop/IndustrialDigitalTwinSimulator.csproj`, `desktop-game/TwinOps.csproj` |
| NuGet packages | `Microsoft.Web.WebView2` 1.0.4258.31, `Microsoft.NETFramework.ReferenceAssemblies` 1.0.3 (build only) |
| DPI | PerMonitorV2 (via `app.manifest`) |
| Logging | Rotating plain-text log at `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\logs\shell.log` |
| JSON | Dependency-free hand-written parser/encoder (`desktop/Json.cs`) |

The shell is deliberately dependency-light: no third-party UI framework, no ORM, no
JSON library. It maps the `web` folder to the virtual HTTPS origin
`https://app.idt.local` with `SetVirtualHostNameToFolderMapping`, so the web app runs
with working ES modules, import maps and CSP, then hosts it in WebView2.

Key shell responsibilities:

- Window lifecycle, standard OS controls, F11 fullscreen, F12 DevTools, Ctrl+P suppression.
- Runtime detection for WebView2 with a branded error dialog (`RuntimeErrorForm.cs`).
- Storage bridge (`StorageBridge.cs`) implementing `write` / `remove` / `list` with key
  validation and atomic file replacement.
- Boot configuration injection as `window.__IDT_BOOT_CONFIG__`.
- Native window actions on the `idt-app` channel (close, minimize, maximize, fullscreen).
- `--open=<facility>` launch argument parsing (`Program.cs`).
- `launch-simulator` shell action used by the standalone game.

## Web Application — HTML / CSS / Vanilla JavaScript

| Item | Detail |
| --- | --- |
| Markup | `web/index.html`, `web/game.html` |
| Styling | One hand-written stylesheet, `web/css/style.css`, CSS custom properties, dark theme |
| Language | JavaScript ES2022 modules (`<script type="module">`) |
| Module resolution | Native import maps (`three` → `./vendor/three.module.js`) |
| Frameworks | None — no React/Vue/Svelte, no jQuery |
| Build step | None — the `web` folder ships as-is |
| DOM helpers | Internal `web/js/core/ui.js` (`el`, metrics, charts, panels) |
| State | Plain JS objects + per-facility `config`, persisted as JSON |
| Security | Content-Security-Policy meta tag, no remote code, vendored dependencies |

Architecture (`web/js/`):

```
main.js                 platform entry, launcher, routing, save/export flows
core/base.js            BaseInfrastructure: control-room shell, simulation clock,
                        sensors, alarms, analytics, visibility, inspectors, twin bus
core/scene.js           Three.js scene wrapper, geometry/material helpers, lighting
core/ui.js              DOM construction, metric/chart/panel widgets
core/registry.js        facility metadata registry (cards, codes, previews)
core/previews.js        launcher card artwork (inline SVG/data)
core/scenario.js        scenario runner
core/storage.js         storage bridge + localStorage fallback
core/firstperson.js     shared first-person camera helper
infrastructures/*.js    parking, water, conveyor, cold, solar, campus twins
game/twinhost.js        headless twin runner (real buildWorld + updateSimulation)
game/twinlink.js        twin adapters, config store, idt-twinbus live bus
game/world.js           game campus terrain, roads, district plots
game/twinops.js         game app, first-person controller, HUD, missions
```

## 3D and Visualisation — Three.js r170

| Item | Detail |
| --- | --- |
| Library | Three.js r170 (`0.170.0`), MIT |
| Vendored files | `web/vendor/three.module.js`, `web/vendor/addons/controls/OrbitControls.js`, `web/vendor/addons/utils/BufferGeometryUtils.js` |
| Renderer | `WebGLRenderer`, PCF soft shadows, ACES tone mapping |
| Camera control | Orbit/pan/zoom, focus, isometric/top/front/side presets, fit-to-view, fullscreen |
| Materials | `MeshStandardMaterial` / `MeshPhysicalMaterial`, emissive highlights, canvas textures |
| Labels | Canvas-rendered text sprites (`textSprite`) |
| Inspection | Raycasting against registered interactive objects |
| Visual effects | Animated energy-flow pulses, zone heat maps, status beacons, fog |
| Quality | Render quality presets, adaptive pixel-ratio scaling, layered visibility manager |

No model files, textures or asset pipeline are used: every building, machine, vehicle
and panel is generated procedurally from code in `web/js/core/scene.js` helpers and the
facility modules. The only vendored assets are Three.js and two addons.

## Simulation and Data Layer

| Concern | Implementation |
| --- | --- |
| Simulation loop | `requestAnimationFrame` in `BaseInfrastructure`, `updateSimulation(dt)` per facility |
| Time control | Pause/resume/stop/restart, 0.25×–10× speed, simulated clock |
| Facility models | Hydrostatic level, four-zone thermal, PV/battery/inverter energy, carton tracking and jam detection, bay occupancy and barrier sequencing, cross-system priority load shedding |
| Sensors | Per-channel definitions with min/max, alarm bands, calibration offset, manual override |
| Alarms | Declarative rules with severity, thresholds, acknowledgement and history |
| Analytics | 2 simulated-second sampling, retained history, trend charts, CSV export |
| Persistence | One JSON file per key, e.g. `idt.water.config`, `idt.campus.config`, `idt.game.config` |
| Native storage | `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\config\<key>.json` |
| Browser fallback | `localStorage` when the native bridge is absent |
| Live sync | `idt-twinbus` `BroadcastChannel` snapshots every 0.2 s; config patches on change |
| Atomic writes | Unique temp file in the same directory, flushed, then replaced |

## TWIN OPS Game

| Item | Detail |
| --- | --- |
| Style | First-person 3D field-engineering game |
| Engine | Same Three.js r170 renderer, no game engine |
| Controller | Custom `TwinOpsControls` in `web/js/game/twinops.js` |
| Input | WASD, Shift, Space, E, F, Esc, mouse look with pointer lock and drag fallback |
| World | Five full-size twin worlds placed on a procedural campus, real twin engines |
| Performance | District visibility culling, staggered 15 Hz far-district ticking, tight follow shadow frustum, shader pre-warm, adaptive resolution |
| Standalone build | `TwinOps.exe` (`desktop-game/`), shares the simulator's C# shell sources |
| Persistence | `idt.game.config` plus each twin's own saved configuration |

## Tooling, Build and Verification

| Item | Detail |
| --- | --- |
| Build scripts | PowerShell 7 (`tools/build.ps1`, `tools/build-game.ps1`, `tools/make-icon.ps1`) |
| Build SDK | .NET 8 SDK (build only) + MSBuild for `net48` |
| Icon generation | Dependency-free PowerShell drawing into `app.ico` |
| Test runtime | Node.js (ES modules, `.mjs`) |
| Browser automation | `playwright-core` 1.65 with installed Chrome/Chromium |
| Native UI automation | WebView2 DevTools protocol through `IDT_DEBUG_PORT` |
| Native self-test | C# console self-test in `tools/selftest/` (85 assertions on JSON + storage bridge) |
| Package | Portable `dist\` folder with executable, runtime DLLs, `web/`, docs, icon, `run.bat` |

Test suites:

| Script | Covers |
| --- | --- |
| `tools/test-all.mjs` | All facilities, every tab, console/page errors, persistence |
| `tools/test-behaviour.mjs` | Facility physics and control responses |
| `tools/test-flow.mjs` | Energy-flow visualisation follows real power |
| `tools/test-platform.mjs` | Launcher navigation, facility independence, settings persistence |
| `tools/test-campus-behaviour.mjs` | Cross-system coupling and scenario presets |
| `tools/test-campus.mjs` / `test-campus-scene.mjs` | Campus scenario and 3D scene wiring |
| `tools/test-about.mjs` | Launcher cards, platform bar, About & Credits |
| `tools/test-native.mjs` | Packaged executable over the diagnostics port |
| `tools/test-twinhost.mjs` | All five real twins build headless and tick |
| `tools/test-game.mjs` | Game loop and two-way live twin sync |
| `tools/test-game-controls.mjs` | Mouse look, movement, jumping, collision |
| `tools/test-fps.mjs` | Frame-rate measurement |

## Runtime Requirements

**End users (packaged release)**

- Windows 10 (May 2019 Update+) or Windows 11, x64.
- Microsoft Edge WebView2 Runtime — included with Windows 11 and most current
  Windows 10 systems; the app shows a branded download dialog if it is missing.
- .NET Framework 4.8 — ships with supported Windows versions.
- No installer, no administrator rights, no internet connection.

**Developers (building from source)**

- .NET 8 SDK and PowerShell 7 (`pwsh`) for the desktop shells.
- Node.js 18+ and `playwright-core` for the browser test suites.
- A Chromium-based browser (or the packaged app) for UI verification.
- Internet access for the first NuGet restore only.

**Web-only development**

```bash
python -m http.server 8080 --directory web
# open http://localhost:8080/
```

Any static file server works; ES modules and import maps require HTTP rather than
`file://`. In browser preview the app falls back to `localStorage` and the close action
shows a browser-preview notice.

## Dependencies and Licenses

| Component | Version | License | Distribution |
| --- | --- | --- | --- |
| Three.js | 0.170.0 | MIT | Vendored in `web/vendor/` |
| Microsoft.Web.WebView2 | 1.0.4258.31 | Microsoft license terms | Runtime DLLs in `dist/` |
| .NET Framework 4.8 | — | Microsoft license terms | OS component, not redistributed |
| Microsoft.NETFramework.ReferenceAssemblies | 1.0.3 | MIT | Build only |
| playwright-core | 1.65 | Apache-2.0 | Dev dependency, not distributed |
| Node.js / .NET 8 SDK / PowerShell 7 | — | Their respective licenses | Build/test tooling only |

Full attribution text is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Design Choices

- **No frontend framework or bundler.** The web app ships exactly as written, which
  keeps the portable package small, removes a build step from the shipped UI, and lets
  the desktop shell serve it from a plain folder mapping.
- **Vendored Three.js.** No CDN, no network dependency, and a stable renderer revision
  across builds.
- **Procedural 3D.** All geometry is generated in code, so there are no binary model
  assets to ship, version or license.
- **One module per facility.** Each twin implements the same `BaseInfrastructure`
  contract (see [MODULE_CONTRACT.md](../docs/MODULE_CONTRACT.md)), so a new facility
  needs one file plus a registry entry.
- **Native shell instead of Electron.** .NET Framework 4.8 + WebView2 is already present
  on supported Windows versions, giving a ~3.6 MB portable package with no runtime install.
- **File-per-key JSON.** Human-readable, easy to inspect or reset, and tolerant of
  corrupt files at startup.

## Related Documentation

- [Project README](../README.md)
- [Module contract](../docs/MODULE_CONTRACT.md)
- [Third-party notices](../THIRD_PARTY_NOTICES.md)
- [Changelog](../CHANGELOG.md)

*Last updated: 2026-11-26*
