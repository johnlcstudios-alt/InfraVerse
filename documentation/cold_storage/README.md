# Cold Storage Room Twin (CLD-04)

## Overview
The Cold Storage Room is a four-zone refrigerated store twin with insulated panels, a
walk-in freezer door, a condensing plant, evaporator circulation, defrost, humidity
control, a live heat map and cold-chain inventory rules. It runs as one of the six
applications in the Industrial Digital Twin Simulator.

Source: `web/js/infrastructures/cold.js`.

## 3D Environment
- Four temperature zones: **Freezer Zone A**, **Freezer Zone B**, **Chill Zone C** and
  **Medical Zone D**, each with its own thermal behaviour and damper.
- Walk-in insulated hinged freezer door with automatic close and open-too-long alarms.
- Air-cooled condensing unit CU-01, ceiling evaporator EVAP-02, refrigerant manifold and
  R-449A circuit, humidity unit HC-01 and climate controller CP-01.
- Exterior LED temperature display, safety beacon, sealed cold-room luminaires,
  shelving and stock lots.
- Interactive objects: door, compressor, evaporator, controller, display, humidity unit,
  beacon, lights, shelf, inventory items, zones, manifold and pipes (45 interactive
  objects).

## Key Features
- Four-zone thermal model with inter-zone coupling, ambient heat gain and door heat gain.
- Compressor refrigeration plant with start/stop/restart, capacity/load, current, high-
  pressure fault injection and automatic control to a configurable setpoint.
- Evaporator fan circulation, defrost cycle and refrigerant liquid valve.
- Live heat map over the zone floor, from deep freeze blue through nominal teal to
  critical red.
- Humidity model with dehumidifier and high/low humidity alarms.
- Cold-chain inventory: frozen goods, food, medicines and medical supplies, each with a
  required temperature, quantity, zone and expiry date. Items at risk are flagged for
  spoilage, and expired items can be removed.
- Configurable consumption/restock behaviour for stock movement.

## Control Room Tabs
| Tab | Contents |
| --- | --- |
| Overview | Average temperature, humidity, door state, compressor, cooling capacity, stock and spoilage risk |
| Simulation | Start/pause/resume/stop, speed, clock, manual/automatic mode |
| 3D View | Orbit/pan/zoom, focus, view presets, fit, fullscreen, visibility manager |
| Equipment | Door, compressor, evaporator, controller, display, humidity, beacon, lighting, shelves, lots, zones, manifold |
| Sensors | 11 channels with live reading and alarm bands |
| Operations | Compressor start/stop/restart/defrost/failure, door, climate test, fault clearing |
| Spawning | Add/remove inventory, category presets, remove expired, shelf inspection |
| Visibility | Per-layer hide/show without pausing the simulation |
| Alarms | Acknowledge, history, per-rule enable/disable and editable thresholds |
| Analytics | Ten thermal/plant series with statistics and CSV export |
| Settings | Configuration save/load/export/import/reset |

## Sensors
| ID | Name | Unit |
| --- | --- | --- |
| `zone-a-temp` | Freezer Zone A Temperature | °C |
| `zone-b-temp` | Freezer Zone B Temperature | °C |
| `zone-c-temp` | Chill Zone C Temperature | °C |
| `zone-d-temp` | Medical Zone D Temperature | °C |
| `average-temperature` | Average Room Temperature | °C |
| `room-humidity` | Room Humidity | % |
| `door-state` | Door Position Index | — |
| `door-open-seconds` | Door Open Duration | s |
| `compressor-current` | Compressor Current | A |
| `evaporator-temp` | Evaporator Coil Temperature | °C |
| `ambient-temp` | Outside Ambient Temperature | °C |

## Alarm Rules
| Alarm | Severity | Default threshold |
| --- | --- | --- |
| Cold Store Above Safe Temperature | warning | −12 °C |
| Cold Store Critical Temperature | critical | −8 °C |
| Walk-in Door Open Too Long | warning | 120 s |
| Refrigeration Compressor Failure | critical | high-pressure lockout |
| Abnormally High Humidity | warning | 80 % |
| Abnormally Low Humidity | warning | 40 % |
| Thermal Sensor Failure | critical | sensor disabled/faulted |
| Cold-Chain Spoilage Risk | warning | item outside required temperature |

## Configuration
`defaultConfig()` persists: door (auto, open/close speed, auto-close delay, sensor),
compressor (on, auto, intensity, target temperature −18 °C, speed, fan speed, liquid
valve), humidity (auto, target, sensor, dehumidifier), lighting, heat map, LED display
and brightness, beacon, defrost, per-zone damper positions, consumption/restock, alarm
enable flags, thresholds (safe/critical temperature, door-open, humidity high/low,
spoilage tolerance) and the full inventory list.

## Usage
1. Open the **Cold Storage Room** card from the NEXUS launcher.
2. Watch zone temperatures, the heat map and the exterior display settle around the
   setpoint.
3. Open the walk-in door and observe the temperature rise and door alarm.
4. Inject a compressor high-pressure fault or interrupt cooling to trigger the safe/
   critical temperature and spoilage alarms, then restore and defrost.
5. Add or remove inventory in **Spawning** and confirm required-temperature checks.
6. Save the configuration; zones, plant and inventory are restored on the next open.

## Analytics
Zone A–D temperatures, average temperature, room humidity, compressor current and load,
evaporator coil temperature and ambient temperature are sampled every 2 simulated seconds
and exportable as CSV.

## Integration
- Persists to `idt.cold.config` through the platform storage bridge.
- Publishes live snapshots on `idt-twinbus`; **TWIN OPS: Field Engineer** can open the
  walk-in door, change setpoints and trigger/repair faults, and those visible changes
  mirror onto a running twin.
- Visibility layers and inspectors are shared platform behaviour.

## Version History
- **2.3.1** (2026-11-25): Live game→twin reflection for the walk-in door; performance
  hardening.
- **2.3.0** (2026-11-24): Added TWIN OPS integration and the shared control-room shell.
- **2.2.8** (2026-11-18): Added live heat map and improved door interlock logic.

## References
- [Source code](../../web/js/infrastructures/cold.js)
- [Module contract](../../docs/MODULE_CONTRACT.md)
- [Project README](../../README.md)

*Last updated: 2026-11-26*
