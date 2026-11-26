# Smart Water Tank Twin (H2O-02)

## Overview
The Smart Water Tank is an elevated potable-water reservoir twin: a transparent 10 000 L
tank with a live hydrostatic level model, a variable-speed booster pump, motorised inlet
and outlet valves, flow metering, pressure and turbidity monitoring. It runs as one of
the six applications in the Industrial Digital Twin Simulator and shares the platform's
control-room shell, 3D controls, alarms, analytics and persistence.

Source: `web/js/infrastructures/water.js`.

## 3D Environment
- Elevated transparent reservoir T-01 with a visible water surface and sight-glass level
  indicator.
- Booster pump P-01 and pump house with HMI panel and PLC-01 SCADA cabinet.
- Motorised inlet and outlet butterfly valves with hand-wheel override.
- Electromagnetic flow meters FT-03 (inlet) and FT-04 (outlet), discharge pressure gauge
  PI-07, and a DN300 process pipeline.
- Ladder, site floodlight, three-aspect status beacon, signage, pump-house control room
  and personnel door.
- Interactive objects: tank, pump, valves, flow meters, gauge, HMI, cabinet, pipeline,
  room, door, ladder, beacon, lamp and signs (33 interactive objects).

## Key Features
- Hydrostatic level model: stored volume integrates inlet flow minus outlet flow, so
  level responds to pump speed, valve position, demand profiles and leaks.
- Variable-speed inlet pump (0–100 %) with 420 L/min flow capacity, motor load, current,
  temperature and dry-run protection.
- Motorised inlet/outlet valves with independent 0–100 % position and travel speed.
- Automatic fill/drain control around a configurable target level.
- Potable-water quality monitoring through turbidity, with a configurable high limit.
- Demand profiles (residential/commercial/industrial factors), fill, drain and night
  setback scenarios, and batch transfers.
- Fault injection: pump failure, dry run, motor overheat, forced low level and forced
  overflow, all latched until reset.

## Control Room Tabs
| Tab | Contents |
| --- | --- |
| Overview | Six live metrics: water level, inlet flow, outlet flow, pump P-01, discharge pressure, turbidity |
| Simulation | Start/pause/resume/stop, speed 0.25×–10×, clock, manual/automatic mode |
| 3D View | Orbit/pan/zoom, focus, view presets, fit, fullscreen, visibility manager |
| Equipment | Every interactive object with its own inspector and working controls |
| Sensors | Eight channels with live reading, alarm band, calibration and override |
| Operations | Level nudges, fill/drain, pump and valve commands, fault injection, diagnostics, counters |
| Spawning | Fill/drain/demand scenarios, batch transfers, emergency stop |
| Visibility | Per-layer hide/show; hiding geometry never pauses the simulation |
| Alarms | Acknowledge, history, per-rule enable/disable and editable thresholds |
| Analytics | Trend charts, per-channel statistics and CSV export |
| Settings | Configuration save/load/export/import/reset |

## Sensors
| ID | Name | Unit | Alarm band (default) |
| --- | --- | --- | --- |
| `level` | Tank Level | % | low 20, high 95 |
| `volume` | Stored Volume | L | 10 % / 98 % of capacity |
| `inlet-flow` | Inlet Flow | L/min | high 480 |
| `outlet-flow` | Outlet Flow | L/min | high 480 |
| `pump-current` | Pump Motor Current | A | high 20 |
| `pump-temp` | Pump Temperature | °C | high 80 |
| `inlet-pressure` | Inlet Pressure | bar | 0.3–8 |
| `turbidity` | Water Turbidity | NTU | high 15 |

## Alarm Rules
| Alarm | Severity | Default threshold |
| --- | --- | --- |
| Reservoir Level Low | warning | 20 % |
| Reservoir Level Critical | critical | 8 % |
| Reservoir Level High | warning | 88 % |
| Tank Overflow Risk | critical | 95 % |
| Pump Dry Run | critical | 4 s |
| Pump Motor Failure | critical | latched fault |
| Abnormal Flow Detected | warning | 480 L/min |
| Instrument Failure | critical | sensor disabled/faulted |
| Pump Motor Overheating | warning | 80 °C |

## Configuration
`defaultConfig()` persists: capacity (10 000 L), initial level (65 %), target level (80 %),
drain target (15 %), auto-fill/auto-drain, pump speed/flow capacity/auto/motor load,
inlet and outlet valve position/auto/speed, lighting, demand profile, and thresholds for
low/critical/high/overflow level, dry run, abnormal flow and overheat. All settings are
editable from the Operations, Equipment and Settings tabs and saved through the shared
config store.

## Usage
1. Open the **Smart Water Tank** card from the NEXUS launcher.
2. Watch the water surface and level sensors respond as the pump and valves move.
3. Use **Operations** to start/stop the pump, open/close valves, or run fill, drain,
   demand and night-setback scenarios from **Spawning**.
4. Adjust target level and thresholds, then confirm alarms raise and clear.
5. Save the configuration; it is restored the next time the facility opens.

## Analytics
Tank level, inlet flow, outlet flow, pump current and turbidity are sampled every
2 simulated seconds, charted with per-channel statistics and exportable as CSV.

## Integration
- Persists to `idt.water.config` through the platform storage bridge (`%LOCALAPPDATA%`
  in the desktop shell, `localStorage` in browser preview).
- Publishes live sensor/alarm state on the `idt-twinbus` channel and exposes
  `persistSettings`, `restartPump`, level/valve controls and fault toggles to
  **TWIN OPS: Field Engineer**, so game actions (pump failure, top-ups, valve changes)
  mirror onto a running twin.
- Visibility layers and the object inspector are provided by the shared base; hiding
  geometry does not affect simulation state.

## Version History
- **2.3.1** (2026-11-25): Live game→twin reflection for pump failure, restarts and
  level top-ups; performance hardening.
- **2.3.0** (2026-11-24): Added TWIN OPS integration and the shared control-room shell.
- **2.2.8** (2026-11-18): Added real-time water level alerts and improved valve control UI.

## References
- [Source code](../../web/js/infrastructures/water.js)
- [Module contract](../../docs/MODULE_CONTRACT.md)
- [Project README](../../README.md)

*Last updated: 2026-11-26*
