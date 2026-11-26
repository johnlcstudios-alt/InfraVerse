# Integrated Use-Case Scenario (USE-06)

## Overview
The Integrated Use-Case Scenario is the platform-level twin: one operating campus that
contains all five facilities as coupled districts — solar and battery farm, elevated
water plant, packaging and sorting line, cold storage building, and the parking/logistics
yard — joined by roads, an overhead cable tray carrying power and a process water main,
with a central control centre.

Unlike a grouped showcase, the subsystems exchange real inputs: energy allocation feeds
the cold store, pumping, line, dock and lighting; the reservoir feeds condenser make-up
and the process line; the line turns raw material into cartons that transfer into
cold-store stock; the cold chain quarantines stock on a temperature excursion; and trucks
replenish raw material and take finished goods out.

Source: `web/js/infrastructures/campus.js`.

## Districts
| District | Twin | Role on the site |
| --- | --- | --- |
| PV & Battery Farm | Solar & Battery (SOL-05) | 12-panel array, MPPT/combiner, 200 kWh battery, priority load bus |
| Elevated Water Plant | Smart Water Tank (H2O-02) | 10 000 L reservoir, variable-speed booster pump, process main |
| Packaging & Sorting Line | Conveyor Sorting Line (CVY-03) | U-shaped transport loop, scan/sort station, bins |
| Cold Storage Building | Cold Storage Room (CLD-04) | Multi-zone store, dock door, condensing plant |
| Parking / Logistics Yard | Smart Parking Lot (PKG-01) | Truck dock, barriers, inbound/outbound dispatch |
| Central Control Centre | — | Site monitoring and scenario control |

## Coupling
- **Energy:** PV and battery serve a priority load bus. Battery low/critical triggers
  load shedding in priority order (control centre → cold store → water pumping → line →
  dock → lighting); island mode carries the site on battery alone.
- **Water:** the reservoir supplies condenser make-up and the process line. A low or dry
  reservoir degrades cooling and can drive a cold-chain excursion.
- **Production:** raw-material stock feeds the line; a starved line raises a starvation
  alarm and falls below the throughput target. Produced cartons increase cold-store stock.
- **Cold chain:** a refrigeration fault raises store temperature; stock beyond the limit
  is quarantined until released.
- **Logistics:** inbound trucks replenish raw material and raise stock; outbound dispatch
  draws stock down. Dock queueing raises congestion alarms.
- Animated energy pulses travel the actual cable runs and their density follows the power
  actually flowing.

## Key Features
- Six scenario presets that change real inputs at once (clock, cloud cover, ambient
  temperature, island mode, arrival rate, production target, tariff):
  Normal Operations, Peak Production Day, Grid Outage · Island Mode, Heat Wave,
  Night Shift and Storm Front.
- Fifteen cross-system alarm rules, including battery low/critical, load shedding active,
  cold-chain breach, cold-store door open, reservoir low/critical, pump dry run,
  production starvation, line jam, dock congestion, stock quarantined, low generation,
  refrigeration fault and instrumentation fault.
- Raw-material inventory by material type, with receive-delivery and auto-replenish
  below safety stock.
- Cold-store stock batches with dispatch and quarantine release.
- Dock scheduling for inbound/outbound trucks and yard occupancy tracking.

## Control Room Tabs
| Tab | Contents |
| --- | --- |
| Overview | Power balance, battery SOC, reservoir, throughput, cold chain, logistics |
| Simulation | Start/pause/resume/stop, speed, clock, manual/automatic mode |
| 3D View | Campus orbit/pan/zoom, focus, view presets, fit, fullscreen, visibility manager |
| Equipment | PV field, inverter station, battery, distribution board, tank, pump, line, motor, sort station, bins, cold store, dock door, condensing plant, barriers, trucks |
| Sensors | 16 site channels with live reading and alarm bands |
| Operations | Scenario runner, dock door, truck scheduling, grid-loss/island test, fault injection, counters |
| Spawning | Scenario cards, raw-material delivery, auto-replenish, stock batches, dispatch, quarantine release, truck scheduling |
| Visibility | Per-layer hide/show without pausing the simulation |
| Alarms | Acknowledge, history, per-rule enable/disable and editable thresholds |
| Analytics | Eight site series with statistics and CSV export |
| Settings | Configuration save/load/export/import/reset |

## Sensors
| ID | Name | Unit |
| --- | --- | --- |
| `pv-power` | PV Array Output | kW |
| `irradiance` | Solar Irradiance | W/m² |
| `battery-soc` | Battery State of Charge | % |
| `battery-power` | Battery Power | kW |
| `site-load` | Site Load | kW |
| `grid-import` | Utility Import | kW |
| `tank-level` | Reservoir Level | % |
| `pump-flow` | Pump Delivery | L/min |
| `water-draw` | Process Water Draw | L/min |
| `line-speed` | Line Belt Speed | m/min |
| `throughput` | Carton Throughput | ctn/h |
| `raw-stock` | Raw Material Stock | units |
| `cold-zone-a` | Cold Store Zone A | °C |
| `cold-zone-b` | Cold Store Zone B | °C |
| `cold-inventory` | Cold Store Inventory | units |
| `dock-occupancy` | Dock Occupancy | vehicles |

## Configuration
`defaultConfig()` persists the active scenario, island mode, load-shedding enable,
line running/speed, cold-store setpoints A/B, pump speed, arrival enable/interval,
auto-dispatch, lighting, raw-stock target, alarm enables, and site thresholds (battery
low/critical, shed tolerance, cold limits, door-open, water low/critical, dock queue,
raw starvation time, throughput low, irradiance low).

## Usage
1. Open the **Integrated Use-Case Scenario** card from the NEXUS launcher.
2. Load a scenario and watch several districts change together — for example, *Grid
   Outage · Island Mode* sheds non-priority loads while the cold chain stays served.
3. Use **Operations** to simulate grid loss, force a refrigeration fault, drain the
   reservoir, inject a line jam or starve the line, then clear faults and observe
   recovery.
4. Use **Spawning** to receive raw material, dispatch finished stock, release quarantine
   and schedule trucks.
5. Confirm the cross-system alarms raise and clear, then save the configuration.

## Analytics
PV output, site load, battery SOC, reservoir level, throughput, cold-store average,
raw stock and dock occupancy are sampled every 2 simulated seconds and exportable as CSV.

## Integration
- Persists to `idt.campus.config` through the platform storage bridge and is the site
  plan used by the TWIN OPS campus layout.
- Visibility layers and inspectors are shared platform behaviour; hiding geometry never
  pauses the coupled simulation.

## Version History
- **2.3.1** (2026-11-25): Performance hardening and live-state reflection shared with the
  individual twins.
- **2.3.0** (2026-11-24): Documented alongside the TWIN OPS release; the campus is the
  site plan for the game world.
- **2.2.8** (2026-11-18): Cross-system scenario runner and fifteen coupled alarms.

## References
- [Source code](../../web/js/infrastructures/campus.js)
- [Module contract](../../docs/MODULE_CONTRACT.md)
- [Project README](../../README.md)

*Last updated: 2026-11-26*
