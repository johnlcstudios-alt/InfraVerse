# Conveyor Sorting Line Twin (CVY-03)

## Overview
The Conveyor Sorting Line is a U-shaped carton transport and sorting twin with live
carton tracking, a photoelectric scan station, a pneumatic swing-arm diverter, two
collection bins, a thermal drive-motor model, jam detection/recovery and emergency-stop
safety. It runs as one of the six applications in the Industrial Digital Twin Simulator.

Source: `web/js/infrastructures/conveyor.js`.

## 3D Environment
- U-shaped belt loop with infeed station, scan tunnel, sort station, diverter arm and
  discharge chutes to Bin A and Bin B.
- Belt drive motor M-03, helical gearbox GB-03, coupling guard and line control cabinet
  PLC-03.
- Cartons with individual size, colour, classification, weight and serial number.
- Control room, operator console, stack light, lighting and safety E-stop.
- Interactive objects: conveyor, motor, gearbox, diverter, station, scanner, chutes,
  bins, cartons, cabinet, E-stop, guard, room, door, HMI, lamps and signs (38 interactive
  objects).

## Key Features
- Live carton tracking along the full loop, including queueing, scanning, diverting,
  chute transfer and bin accumulation.
- Rule-based sorting with three recipes:
  - **Size** — small/medium → Bin A, large → Bin B.
  - **Colour** — kraft/red/white → Bin A, blue/amber → Bin B.
  - **Classification** — standard/express → Bin B, fragile/bulk → Bin A.
- Configurable sorting success rate (default 96 %) so mis-sorts can be observed and
  analysed.
- Belt dynamics: target speed, acceleration, deceleration and direction.
- Motor thermal model: current and temperature rise with load; over-temperature trip at
  78 °C; cooling fan and reset.
- Jam detection after 6 s of a blocked carton, with cause reporting and automatic
  recovery/cooling when cleared.
- Emergency stop (Category 3 safety circuit), reset, fault injection and bin capacity
  limits (12 cartons each by default).

## Control Room Tabs
| Tab | Contents |
| --- | --- |
| Overview | Line status, belt speed, cartons in transit, Bin A fill, Bin B fill, motor temperature/current |
| Simulation | Start/pause/resume/stop, speed, clock, manual/automatic mode |
| 3D View | Orbit/pan/zoom, focus, view presets, fit, fullscreen, visibility manager |
| Equipment | Conveyor, motor, gearbox, diverter, scanner, infeed, bins, cabinet, E-stop inspectors |
| Sensors | Nine channels with live reading and alarm bands |
| Operations | Line commands, belt dynamics, motor/gearbox, diverter recipe, diagnostics, counters |
| Spawning | Carton schedule, size/colour/classification/weight/destination, bulk spawn, bin and belt clearing |
| Visibility | Per-layer hide/show without pausing the simulation |
| Alarms | Acknowledge, history, per-rule enable/disable and editable thresholds |
| Analytics | Throughput and equipment trends, statistics, CSV export |
| Settings | Configuration save/load/export/import/reset |

## Sensors
| ID | Name | Unit | Alarm band (default) |
| --- | --- | --- | --- |
| `entry-present` | Entry Presence | — | — |
| `exit-present` | Exit Presence | — | — |
| `sort-sensor` | Sort Photocell | — | — |
| `belt-speed` | Belt Speed | m/s | high 3 |
| `motor-current` | Motor Current | A | high 9 |
| `motor-temp` | Motor Temperature | °C | high 90 |
| `bin-a-fill` | Bin A Fill Level | % | high 95 |
| `bin-b-fill` | Bin B Fill Level | % | high 95 |
| `jam-sensor` | Jam Detector | — | — |

## Alarm Rules
| Alarm | Severity | Default threshold |
| --- | --- | --- |
| Conveyor Jam Detected | critical | 6 s |
| Motor Overheating | critical | 78 °C |
| Unexpected Conveyor Stop | warning | drive fault |
| Detection Sensor Failure | critical | entry photo-eye fault |
| Collection Bin Full | warning | 92 % |
| Sorting Failure Rate High | warning | 25 % |

## Configuration
`defaultConfig()` persists belt speed (1.2 m/s), acceleration, deceleration, direction,
motor/cooling-fan state, auto-start, lighting, sorting strategy and success rate,
diverter position/auto, the three sorting recipes, carton spawn profile (auto, interval,
mode, max items, quantity, size, colour, classification, weight, destination, delay),
bin capacities, and thresholds for jam time, motor overheat, bin full, sorting failure and
motor trip current.

## Usage
1. Open the **Conveyor Sorting Line** card from the NEXUS launcher.
2. Watch cartons travel the U-shaped belt, pass the scanner and divert into Bin A or B.
3. Change the sorting recipe or success rate in **Operations** and confirm the divert
   pattern changes.
4. Load the line, let a bin fill, or inject a jam to see the jam alarm, drive trip and
   recovery.
5. Save the configuration; bin and line runtime state evolves from the saved setup.

## Analytics
Belt speed, motor temperature, motor current, Bin A fill, Bin B fill and sort throughput
are sampled every 2 simulated seconds and exportable as CSV.

## Integration
- Persists to `idt.conveyor.config` through the platform storage bridge.
- Publishes live snapshots on `idt-twinbus`; **TWIN OPS: Field Engineer** drives the same
  belt speed, diverter and bin APIs, and jams/bin resets mirror onto a running twin.
- Visibility layers and inspectors are shared platform behaviour.

## Version History
- **2.3.1** (2026-11-25): Live game→twin reflection for jams and bin resets; performance
  hardening.
- **2.3.0** (2026-11-24): Added TWIN OPS integration and the shared control-room shell.
- **2.2.8** (2026-11-18): Added motor thermal model and improved jam recovery logic.

## References
- [Source code](../../web/js/infrastructures/conveyor.js)
- [Module contract](../../docs/MODULE_CONTRACT.md)
- [Project README](../../README.md)

*Last updated: 2026-11-26*
