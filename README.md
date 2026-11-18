# Industrial Digital Twin Simulator

A Windows desktop industrial digital-twin simulator. A native WinForms shell hosts a
Three.js web application inside Microsoft Edge WebView2, serves the UI from a local
virtual origin, and persists simulation configuration to per-user JSON files on disk.



## How to Install 
**1. Download Latest Version in Releases.** [**Releases**](https://github.com/johnlcstudios-alt/InfraVerse/releases/tag/Release)

**2. Run Installer**

**3. Click More Info**

**4. Click Run anyway**

**5. Run Program**


```
3DInfra/
├── web/                        web application (DOM/CSS/ES modules, vendored Three.js)
├── desktop/                    native C# WinForms + WebView2 host (net48)
│   ├── IndustrialDigitalTwinSimulator.csproj
│   ├── Program.cs              startup, runtime detection, fatal error handling
│   ├── MainForm.cs             window, virtual host mapping, WebView2 setup
│   ├── ConfigStore.cs          %LOCALAPPDATA% JSON store, atomic writes
│   ├── StorageBridge.cs        JS <-> native storage message bridge
│   ├── Json.cs                 dependency-free JSON parser/encoder
│   ├── RuntimeErrorForm.cs     branded WebView2-missing / init-failure dialog
│   ├── ShellLog.cs             rotating diagnostic log
│   └── app.manifest            PerMonitorV2 DPI awareness
├── tools/
│   ├── build.ps1               restore, build, self-test, portable packaging
│   ├── make-icon.ps1           generates app.ico (no external dependencies)
│   └── selftest/               console tests for JSON + storage bridge
├── dist/                       generated portable distribution (after build)
├── app.ico                     application icon (generated)
├── README.md
└── THIRD_PARTY_NOTICES.md
```

## Requirements

**Running the packaged application**

- Windows 10 or Windows 11, x64.
- Microsoft Edge WebView2 Runtime (installed by default on Windows 11; also installed
  by most current Windows 10 systems). If it is missing, the simulator shows a
  branded dialog with a download link instead of crashing.
- No .NET runtime installation is required: the shell targets .NET Framework 4.8,
  which ships with Windows 10 (May 2019 Update and later) and Windows 11.

**Building from source**

- .NET 8 SDK (only needed to build; never required by end users).
- PowerShell 7 (`pwsh`) for the build scripts.
- Internet access for the first NuGet restore. NuGet packages are pinned; after a
  successful restore the build works offline from the local package cache.

## Build

From the repository root:

```powershell
pwsh -File tools/build.ps1
```

The script:

1. Generates `app.ico` if it is missing.
2. Restores NuGet packages and builds `desktop/IndustrialDigitalTwinSimulator.csproj`
   in Release (`net48`, x64).
3. Runs the storage/JSON self-test (85 assertions) against the shipping sources.
4. Cleans and stages `dist\IndustrialDigitalTwinSimulator\` with the executable,
   runtime DLLs, `web/`, documentation, icon and `run.bat`.
5. Validates the staged layout and prints the executable SHA-256 and package size.

Useful switches:

```powershell
pwsh -File tools/build.ps1 -Configuration Debug
pwsh -File tools/build.ps1 -SkipTests
pwsh -File tools/build.ps1 -SkipRestore
```

To clean completely, delete `desktop\bin`, `desktop\obj` and `dist`.

## Run

Portable layout (`dist\IndustrialDigitalTwinSimulator\`):

```powershell
.\dist\IndustrialDigitalTwinSimulator\run.bat
# or
.\dist\IndustrialDigitalTwinSimulator\IndustrialDigitalTwinSimulator.exe
```

The window opens centered at 1600x900 with a minimum size of 1280x720. The folder can
be zipped and copied to any Windows machine; no installer or administrator rights are
required.

### Web development mode

The web UI is a plain ES-module application and can be opened without the desktop
shell by serving the `web` folder over HTTP (ES modules and import maps do not work
from `file://` URLs):

```powershell
python -m http.server 8080 --directory web
# open http://localhost:8080/
```

or with any static file server, for example:

```powershell
npx --yes http-server web -p 8080
```

In browser preview there is no native storage bridge, so the app falls back to
`localStorage`; the in-app close action shows a browser-preview notice instead of
shutting down a window.

## Architecture

### Native shell (desktop/)

- **Window**: WinForms form, standard OS border and title-bar controls (minimize /
  maximize / close), dark background to avoid white flashes, PerMonitorV2 DPI aware.
- **Virtual origin**: the `web` folder next to the executable is mapped with
  `SetVirtualHostNameToFolderMapping` to `https://app.idt.local`, so the app runs on a
  normal secure origin with working ES modules, import maps and CSP.
- **Runtime checks**: `CoreWebView2Environment.GetAvailableBrowserVersionString()` is
  checked at startup. Missing runtime or initialization failure shows a readable,
  branded dialog with a WebView2 download link; the failure is also logged.
- **Browser hardening**: default context menus disabled, status bar disabled,
  password autosave / autofill / swipe navigation disabled. DevTools stay available
  for QA (F12).
- **Keyboard**: F11 toggles borderless fullscreen, Esc leaves fullscreen, F12 opens
  DevTools. Because the WinForms WebView2 wrapper does not expose
  `CoreWebView2Controller`, these shortcuts are forwarded from the page by a tiny
  document-created script; the same shortcuts also work when the native form has
  focus. Ctrl+P (print) is suppressed.
- **Links**: external links open in the default browser; in-app new-window requests
  for `app.idt.local` stay inside the shell.
- **Shutdown**: `FormClosing` detaches message handlers, disposes WebView2 and lets the
  web app finish its save path.

### Native window actions (web -> host)

The web app can request native window actions on channel `idt-app`:

```js
window.chrome.webview.postMessage({ channel: 'idt-app', action: 'close' });
```

Supported actions: `close`, `minimize`, `maximize`, `restore`, `fullscreen`,
`toggle-fullscreen`, `exit-fullscreen`. The host acknowledges with
`{ channel: 'idt-app-response', action, ok: true }`. The web application's
"Save & Exit" flow uses `close`.

### Storage bridge

The web app talks to the native shell through `window.chrome.webview`:

```js
window.chrome.webview.postMessage({
  channel: 'idt-storage',
  requestId: 'req-1',
  action: 'write',            // 'write' | 'remove' | 'list'
  key: 'idt.global',          // safe identifier: [A-Za-z0-9._-], max 128 chars
  json: JSON.stringify(value) // raw JSON text for write
});

window.chrome.webview.addEventListener('message', (event) => {
  // { channel: 'idt-storage-response', requestId, ok, data }
});
```

- `write` validates the key and the JSON text, then writes
  `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\config\<key>.json` atomically
  (unique temp file in the same directory, flushed to disk, then replaced). Readers
  never see a half-written file.
- `remove` deletes the file (a missing file still succeeds).
- `list` returns an array of stored keys.
- Responses echo `requestId`; failures set `ok: false` and put a message object in
  `data`.
- On every page load the shell injects all saved configurations as
  `window.__IDT_BOOT_CONFIG__`, a JSON object keyed by file basename (e.g.
  `idt.global`). Values are the raw parsed JSON objects. Corrupt, unreadable or
  unsafe-named files are skipped, so bad data can never break startup.
- The web app mirrors writes to `localStorage` as a fallback and prefers the boot
  configuration on load.

### Application data

| Path | Contents |
| --- | --- |
| `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\config\*.json` | saved configurations (one per key) |
| `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\WebView2Data\` | WebView2 browser profile (cache, localStorage) |
| `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\logs\shell.log` | native shell diagnostics (rotated at 1 MB) |

Delete the `config` folder to reset saved simulations; delete `WebView2Data` to reset
the browser profile / `localStorage`.

## Feature summary

### Desktop shell (verified by build + launch)

- Portable .NET Framework 4.8 x64 application; no runtime installation for end users.
- Local virtual HTTPS origin for the web UI (ES modules, import maps, CSP compatible).
- Disk-backed configuration bridge with atomic writes, key validation, corrupt-file
  tolerance and startup injection.
- F11 fullscreen / Esc exit fullscreen / F12 DevTools; standard OS window controls.
- Native close/minimize/maximize/fullscreen actions for the web UI.
- Friendly error page if web assets are missing; branded dialog and log if WebView2
  fails to start; diagnostic log for troubleshooting.
- Self-test covering JSON parsing, key validation, atomic persistence, boot-script
  generation and every storage-bridge response path.

### Web application (verified by automated 3D/UI tests)

- NEXUS launcher: six application cards with live status, sensor/equipment counts,
  system overview, platform services bar, platform settings, About & Credits, and Exit.
- Six independent applications, each with its own 3D world, simulation engine,
  sensor set, alarm rules, thresholds, history and saved configuration:
  | Application | Sensors | Interactive objects | Engine highlights |
  | --- | --- | --- | --- |
  | Smart Parking Lot | 22 | 56 | 18 occupancy bays, animated barriers, arrival/departure routing, overstay rules |
  | Smart Water Tank | 8 | 33 | 10 000 L hydrostatic model, variable-speed pump, motorised valves, turbidity |
  | Conveyor Sorting Line | 9 | 38 | U-shaped belt loop, live carton tracking, rule-based diverter sorting, jam recovery |
  | Cold Storage Room | 11 | 45 | 4-zone thermal model, animated walk-in door, refrigeration plant, heat map |
  | Solar & Battery System | 12 | 45 | Irradiance/MPPT/battery/inverter energy model, animated energy-flow pulses |
  | **Integrated Use-Case Scenario** | **16** | **37** | **All five twins on one campus, genuinely coupled: energy, water, cold chain, production and logistics** |

### Integrated Use-Case Scenario (USE-06)

One operating campus containing all five facilities as districts — solar and battery
farm, elevated water plant, packaging and sorting line, cold storage building, and the
parking/logistics yard — joined by roads, an overhead cable tray carrying power and a
process water main, with a central control centre.

The subsystems are **coupled, not grouped**: priority load allocation feeds cold store,
pumping, line, dock and lighting from photovoltaics and battery; the reservoir feeds
condenser make-up and the process line, and a low reservoir degrades cooling; the line
converts raw material into cartons that transfer into cold-store stock; the cold chain
quarantines stock on a temperature excursion; and trucks replenish raw material and take
finished goods out. Animated energy pulses travel the real cable runs and their density
follows the power actually flowing. A scenario runner (Normal, Peak Production, Grid
Outage/Island, Heat Wave, Night Shift, Storm Front) changes real inputs — clock, cloud
cover, ambient temperature, island mode, arrival rate and production target — and moves
several subsystems at once. Fifteen cross-system alarms include brownout/load shedding,
cold-chain breach from power loss, water shortage, production starvation, dock
congestion and stock quarantine.

### Project credits

The five infrastructure twins were developed by five student groups (30 members) and are
credited by name inside the application under **About & Credits**, each card linking
straight to that group's twin:

| Group | Twin |
| --- | --- |
| Group 1 | Smart Water Tank Monitoring Twin |
| Group 3 | Conveyor Belt Sorting Line Twin |
| Group 4 | Smart Parking Lot Twin |
| Group 5 | Solar Panel and Battery System Twin |
| Group 6 | Cold Storage Room Twin |

The Integrated Use-Case Scenario is the platform-level application that couples all five
twins into a single operating site.
- Shared control room in every facility: Overview, Simulation, 3D View, Equipment,
  Sensors, Operations, spawning/inventory, Visibility, Alarms, Analytics and Settings.
- Universal 3D controls: orbit/pan/zoom, double-click focus, isometric/top/front/side
  presets, fit-to-view, fullscreen 3D, camera collision safety.
- Universal Visibility Manager with per-layer hide/show (walls, roof, ceiling, floor,
  doors, windows, columns, machines, sensors, pipes, wiring, vehicles, tanks, pumps,
  batteries, cabinets …) plus Show All, Hide Roof, Hide Walls, Hide Ceiling, Hide
  Structural, Equipment Only, X-Ray, Transparent Walls and Isolated Object modes.
  Hiding geometry never pauses the simulation, sensors or alarms.
- Object inspector for every interactive object: doors, gates, machines, pumps,
  valves, conveyors, boxes, bins, vehicles, bays, sensors, panels, batteries,
  inverters, shelves, stock items, displays, lighting and cameras.
- Simulation Control Center: start/pause/resume/stop/restart/reset, 0.25×–10× plus
  custom speed, clock synchronisation, manual/automatic mode, configuration
  save/load/export/import/reset.
- Sensor manager per channel: live reading, status, alarm band, calibration offset,
  manual override, enable/disable.
- Alarm system: severity, acknowledge, history, per-rule enable/disable and editable
  thresholds, with optional audible notification.
- Analytics: 2 s sampling, retained history, multi-channel trend charts, per-channel
  statistics and CSV export.
- Persistence: per-facility structured JSON in `%LOCALAPPDATA%` (native host) or
  `localStorage` (browser), plus platform-level export/import of every profile.

### Performance (measured in the packaged app, 1600 × 900)

| Facility | Draw calls | Triangles | Interactive objects | Frame rate* |
| --- | --- | --- | --- | --- |
| Smart Parking Lot | ~910 | 85 k | 56 | ~37 FPS |
| Smart Water Tank | ~810 | 89 k | 33 | ~36 FPS |
| Conveyor Sorting Line | ~760 | 72 k | 39 | ~48 FPS |
| Cold Storage Room | ~1240 | 95 k | 45 | ~24 FPS |
| Solar & Battery System | ~1140 | 79 k | 45 | ~29 FPS |
| Integrated Use-Case Scenario | ~1520 | 147 k | 37 | not yet measured in-package |

\* Measured while the machine was also running the development agent and a
diagnostics session, which suppresses frame rate; idle figures are higher. Only the
facility being viewed is loaded — the other four hold no scene memory. Each facility
offers a Render quality selector (Performance / Balanced / High) and automatic
visibility layers to reduce load further.

### Diagnostics

Set the `IDT_DEBUG_PORT` environment variable before launching the executable to
expose the embedded browser's DevTools endpoint for automated UI verification
(for example `IDT_DEBUG_PORT=9333`). The port is bound to loopback and is **disabled
by default**, so a normal launch never opens a debugging endpoint.

### Verification performed

- `tools/build.ps1` – Release build, 85-check storage/JSON self-test, staged portable
  layout (28 files, 3.6 MB).
- `tools/test-all.mjs` – loads all five facilities in a real browser, walks every tab,
  asserts zero console/page errors, advances each simulation, opens an inspector for
  every object kind, toggles visibility, and confirms state persists.
- `tools/test-behaviour.mjs` – asserts facility physics: pump/valve flows and level
  change, carton travel/sorting/jam, compressor and door thermal response,
  battery charge/discharge and panel shutdown, vehicle park/exit and barrier
  open/close.
- `tools/test-flow.mjs` – asserts the animated energy-flow pulses follow real power
  and stop when generation stops.
- `tools/test-platform.mjs` – asserts launcher navigation (open facility, return to
  Main Menu, open a different facility), per-facility independence and settings
  persistence across a page reload.
- `tools/test-campus-behaviour.mjs` – seven cross-system assertions on the integrated
  scenario: island mode carries load on battery and sheds in priority order while the
  cold chain stays served; a drained reservoir warms the cold store; no raw material
  stops the line and raises a starvation alarm that a delivery clears; a refrigeration
  fault causes an excursion, quarantine and recovery; inbound trucks raise stock while
  dispatch draws it down; scenario presets change island state, weather, arrivals and
  targets; and the site returns to zero alarms afterwards.
- `tools/test-about.mjs` – asserts the launcher cards, platform bar and the About &
  Credits panel (five group cards, 30 named members).
- `tools/test-native.mjs` – drives the packaged executable itself through the
  diagnostics port: confirms the virtual origin, native boot-config injection and
  storage bridge, opens the Solar and Cold Storage facilities, exercises controls,
  verifies alarms raise and clear, and confirms hiding roof/walls keeps the engine
  running. Every facility check reports zero console/page errors.

## Troubleshooting

- **"Embedded browser runtime not found"** – install the Microsoft Edge WebView2
  Runtime (link in the dialog). Windows 11 normally includes it.
- **"Simulator files are missing" page** – the executable was moved out of its
  portable folder. Keep `IndustrialDigitalTwinSimulator.exe` next to the `web`
  folder, or rebuild with `tools/build.ps1`.
- **Saved settings missing** – confirm the app can write to
  `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\config`; check
  `logs\shell.log` for the storage bridge errors.
- **Blank/black window after an update** – close all simulator instances, delete
  `%LOCALAPPDATA%\IndustrialDigitalTwinSimulator\WebView2Data`, then relaunch.

Third-party components and licenses: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
