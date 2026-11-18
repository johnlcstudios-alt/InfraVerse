# Release Notes - Version 2.2.8

## New Features
- Added simulated real-world scenes for all five infrastructures:
  - **Smart Water Tank**: 3D scene with transparent elevated reservoir, live hydrostatic level model, variable-speed inlet pump, motorised valves, and flow monitoring.
  - **Smart Parking Lot**: 3D scene with 18 sensor‑equipped bays, automated entry/exit barriers, real‑time vehicle routing, occupancy analytics, and overstay enforcement.
  - **Solar Panel & Battery System**: 3D scene showing 12‑panel photovoltaic array with charge controller, battery bank, and inverter, displaying real‑time energy flow, charge/discharge cycles, and load management.
  - **Cold Storage Room**: 3D scene with multi‑zone refrigeration room, animated compressor and evaporator, live heat map, door interlocks, and inventory temperature rules.
  - **Conveyor Belt Sorting Line**: 3D scene with U‑shaped transport loop, live carton tracking, rule‑based diverter, motor thermal model, and jam recovery features.
- All scenes are synced with Digital Twin Monitoring Mode for real‑time visualization.

## Improvements
- Integrated load circuit visual responses: `updateLoadVisuals()` now checks per‑circuit `enabled` flag, ensuring 3D model visuals change immediately on circuit toggle.
- Added `this.updateLoadVisuals(0)` calls to spawn panel circuit toggle and main AC breaker toggle for immediate visual feedback.
- Removed FirstPersonHUD class and requestPointerLock from FirstPersonControls to prevent cursor disappearance on 3D click.
- Fixed `InvalidStateError: Failed to execute 'setPointerCapture'` by wrapping `setPointerCapture` in try/catch and using `OrbitControls.disconnect()`/`connect()` around Play Mode.
- Added 200 ms timeout with try/catch around `requestPointerLock` to prevent “Pointer lock cannot be acquired immediately after the user has exited the lock”.
- Removed Play Mode and HUD, leaving only Digital Twin Monitoring Mode and First Person Mode without HUD.
- Updated PROJECT_CREDITS to match exact member lists.

## Bug Fixes
- Resolved `InvalidStateError: Failed to execute 'setPointerCapture'` by using `OrbitControls.disconnect()` on Play Mode entry and `connect()` on exit, plus try/catch around `setPointerCapture`.
- Fixed cursor disappearance on 3D preview click by removing `requestPointerLock()` from `FirstPersonControls._onPointerDown` when not locked.
- Resolved “Pointer lock cannot be acquired immediately after the user has exited the lock” by adding `setTimeout(200 ms)` with try/catch around `requestPointerLock`.
- Resolved build file‑lock issue on `dist\WebView2Loader.dll` by killing the EXE process before rebuilding.

## Known Issues
- No known issues at this version.

## Build Information
- Executable: `dist\IndustrialDigitalTwinSimulator\IndustrialDigitalTwinSimulator.exe` (146.5 KB)
- All 85 self‑tests passed.
- Build completed successfully with no errors.