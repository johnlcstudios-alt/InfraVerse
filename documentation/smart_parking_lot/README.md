# Smart Parking Lot Twin (PKG-01)

## Overview
The Smart Parking Lot is an 18-bay parking facility twin with automated entry and exit
barriers, vehicle detection and routing, occupancy analytics, reservation/disabled-bay
states and overstay enforcement. It runs as one of the six applications in the Industrial
Digital Twin Simulator and uses the platform's shared control-room shell.

Source: `web/js/infrastructures/parking.js`.

## 3D Environment
- 18 marked parking bays with per-bay occupancy sensors and status colours.
- Entry and exit lanes with animated barriers, loop detectors and control posts.
- Vehicles that drive in, route to a bay, park for their dwell time and leave through
  the exit barrier.
- Staffed security booth, site lighting, CCTV cameras and an access-control node.
- Interactive objects: 18 bays, vehicles, entry/exit gates, booth, controller, cameras
  and lamps (56 interactive objects).

## Key Features
- Real vehicle simulation: arrivals, bay assignment, parking duration, departure and
  barrier sequencing — not a random occupancy toggle.
- Bay states: available, reserved, occupied and disabled; occupancy percentage and
  usable-bay counts are derived from live state.
- Automated entry/exit barriers with configurable open/close speed, auto-close delay and
  presence-sensor interlock.
- Overstay enforcement with plate, bay, dwell time and acknowledgement.
- Disabled-bay and reservation handling for accessible and pre-booked parking.
- Peak-hour burst scenarios and manual arrival scheduling.

## Control Room Tabs
| Tab | Contents |
| --- | --- |
| Overview | Six live metrics: available bays, occupancy, vehicles inside, entered today, exited today, gate status |
| Simulation | Start/pause/resume/stop, speed, clock, manual/automatic mode |
| 3D View | Orbit/pan/zoom, focus, view presets, fit, fullscreen, visibility manager |
| Equipment | Bay, vehicle, barrier, booth, camera and controller inspectors |
| Sensors | 22 channels with live reading and alarm bands |
| Operations | Barrier commands, vehicle spawning, overstay demo, diagnostics, counters |
| Spawning | Arrival scheduling, vehicle type/colour/slot/duration, bulk spawn, clear all |
| Visibility | Per-layer hide/show without pausing the simulation |
| Alarms | Acknowledge, history, per-rule enable/disable and editable thresholds |
| Analytics | Occupancy trends, channel statistics and CSV export |
| Settings | Configuration save/load/export/import/reset |

## Sensors
22 channels: 18 per-bay occupancy detectors (`slot-01` … `slot-18`), plus entry loop,
exit loop, ambient temperature and booth humidity.

## Alarm Rules
| Alarm | Severity | Default threshold |
| --- | --- | --- |
| Parking Facility Near Capacity | warning | 95 % full |
| Vehicle Overstay | warning | 15 min |
| Gate Left Open | warning | 60 s |
| Detection Sensor Failure | critical | sensor disabled/faulted |
| Unauthorized Occupancy | warning | vehicle in a reserved/disabled bay |

## Configuration
`defaultConfig()` persists: auto-spawn, entry/exit barrier settings (auto, open/close
speed, auto-close delay, presence sensor), spawn profile (arrival mode, interval, max
vehicles, speed, type, colour, preferred slot, duration range and manual duration, arrival
delay), lighting, and thresholds for overstay, gate-open and full percentage.

## Usage
1. Open the **Smart Parking Lot** card from the NEXUS launcher.
2. Observe bay colours (green available, amber reserved, red occupied, grey disabled)
   and vehicles moving between the gate and their bays.
3. Use **Spawning** to schedule arrivals or send a burst of vehicles; use **Operations**
   to open/close barriers or trigger an overstay demonstration.
4. Watch occupancy, entered/exited counters and overstay alarms update live.
5. Save the configuration; it is restored on the next open.

## Analytics
Occupancy percentage, occupied bays, available bays and vehicles entered are sampled
every 2 simulated seconds and can be exported as CSV.

## Integration
- Persists to `idt.parking.config` through the platform storage bridge.
- Publishes live snapshots on `idt-twinbus` and exposes barrier, overstay and occupancy
  controls to **TWIN OPS: Field Engineer**; citations issued in the game persist to the
  twin's own configuration.
- Visibility layers and inspectors are shared platform behaviour.

## Version History
- **2.3.1** (2026-11-25): Live game→twin reflection for citations and barrier controls;
  performance hardening.
- **2.3.0** (2026-11-24): Added TWIN OPS integration and the shared control-room shell.
- **2.2.8** (2026-11-18): Added overstay enforcement alerts and improved occupancy reporting.

## References
- [Source code](../../web/js/infrastructures/parking.js)
- [Module contract](../../docs/MODULE_CONTRACT.md)
- [Project README](../../README.md)

*Last updated: 2026-11-26*
