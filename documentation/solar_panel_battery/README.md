# Solar & Battery System Twin (SOL-05)

## Overview
The Solar & Battery System is a 12-panel photovoltaic array twin with MPPT charge
control, a 200 Ah battery bank, a 5 kW hybrid inverter, an AC distribution panel and a
managed office load set. It simulates irradiance, PV yield, charge/discharge, inverter
conversion and load management, with animated energy-flow pulses. It runs as one of the
six applications in the Industrial Digital Twin Simulator.

Source: `web/js/infrastructures/solar.js`.

## 3D Environment
- Roof-mounted array of 12 tilted PV panels with per-module enable/isolation and
  irradiance-driven output.
- PV string combiner, MPPT charge controller, battery bank with rack, hybrid inverter,
  AC distribution panel, revenue meter and load-control panel.
- Office building with lighting, HVAC, workstations, server rack, meeting room, kitchen
  and reception loads, plus a commissioning resistive load bank.
- Animated energy-flow arrows/pulses on the DC and AC paths whose direction and density
  follow the real power flow.
- Monitoring station with pyranometer, air-temperature and wind instrumentation.
- Interactive objects: panels, combiner, controller, batteries, inverter, distribution,
  meter, building, loads, load bank, load-control panel, workstation, rack, lamps and
  signs (45 interactive objects).

## Key Features
- Solar model driven by clock, cloud cover, irradiance, panel efficiency and cell
  temperature, with panel-temperature derating.
- MPPT charge control with configurable mode, charge voltage, maximum current, battery
  priority and protection.
- Battery model: state of charge, charge/discharge limits, voltage, temperature, health,
  overheat and failure states.
- 5 kW hybrid inverter with efficiency, output voltage, maximum output and failure state.
- Load management: eight default circuits with scheduled hours, essential/non-essential
  flags, automatic profile, reserve SOC and load shedding.
- Grid import/export and cumulative PV, load and battery energy accounting.
- Fault injection: controller failure, inverter failure, battery failure/overheat and
  panel over-temperature, with diagnostic profiles and counter reset.

## Control Room Tabs
| Tab | Contents |
| --- | --- |
| Overview | Solar generation, battery SOC, load served, PV energy today, system efficiency, power balance |
| Simulation | Start/pause/resume/stop, speed, clock, manual/automatic mode |
| 3D View | Orbit/pan/zoom, focus, view presets, fit, fullscreen, visibility manager |
| Equipment | Panel, combiner, controller, battery, inverter, distribution, meter, building and load inspectors |
| Sensors | 12 channels with live reading and alarm bands |
| Operations | Array/controller/battery/inverter controls, SOC presets, load management, fault injection |
| Spawning | Add/remove load circuits, enable/disable, essential flags, reset load list |
| Visibility | Per-layer hide/show without pausing the simulation |
| Alarms | Acknowledge, history, per-rule enable/disable and editable thresholds |
| Analytics | Six energy series with statistics and CSV export |
| Settings | Configuration save/load/export/import/reset |

## Sensors
| ID | Name | Unit | Alarm band (default) |
| --- | --- | --- | --- |
| `pv-voltage` | PV Array Voltage | V | 90–370 |
| `pv-current` | PV Array Current | A | 0.5–70 |
| `solar-power` | Solar Generation | W | 100–8200 |
| `irradiance` | Solar Irradiance | W/m² | 30–1320 |
| `panel-temp` | Panel Temperature | °C | −5–65 |
| `battery-soc` | Battery State of Charge | % | low 20 |
| `battery-voltage` | Battery Voltage | V | 44.5–58.6 |
| `battery-temp` | Battery Temperature | °C | 0–45 |
| `battery-health` | Battery Health | % | low 70 |
| `charge-current` | Charge Current | A | high 165 |
| `inverter-output` | Inverter Output | W | high 5600 |
| `load-power` | Load Power | W | high 6000 |

## Alarm Rules
| Alarm | Severity | Default threshold |
| --- | --- | --- |
| Battery State of Charge Low | warning | 20 % |
| Battery Over Temperature | critical | 45 °C |
| Low Solar Generation | warning | 250 W |
| Abnormal Panel Temperature | warning | 65 °C |
| Charge Controller Failure | critical | controller fault |
| Inverter Failure | critical | inverter fault |
| Battery Bank Failure | critical | battery fault |
| Excessive Load Demand | warning | 4300 W |

## Configuration
`defaultConfig()` persists: sun mode/irradiance/intensity/cloud cover, panel
enabled/voltage/current/efficiency/temperature, battery SOC/capacity/charge rate/
temperature/health/failure/overheat/mode, controller mode/auto/max current/charge
voltage/priority/protection/failure, inverter output voltage/efficiency/max output/
failure, load profile (enabled, auto profile, reserve SOC, circuit list), and thresholds
for low battery, high battery temperature, low solar, panel high temperature and excess
load.

## Usage
1. Open the **Solar & Battery System** card from the NEXUS launcher.
2. Watch generation follow irradiance and cloud cover while the battery charges or
   discharges and the energy-flow pulses change direction.
3. Adjust cloud cover, panel isolation, load circuits and reserve SOC in **Operations**
   and **Spawning** to see the power balance respond.
4. Force a low-SOC condition or inject a controller/inverter/battery fault and confirm
   the corresponding alarms and load shedding.
5. Save the configuration; the energy state and settings are restored on the next open.

## Analytics
Solar output, load power, battery SOC, PV array voltage, charge current and battery
temperature are sampled every 2 simulated seconds and exportable as CSV.

## Integration
- Persists to `idt.solar.config` through the platform storage bridge.
- Publishes live snapshots on `idt-twinbus`; **TWIN OPS: Field Engineer** can change
  cloud cover, load shedding and controller state, and injections mirror onto a running
  twin.
- Visibility layers and inspectors are shared platform behaviour.

## Version History
- **2.3.1** (2026-11-25): Live game→twin reflection for controller faults and load
  shedding; performance hardening.
- **2.3.0** (2026-11-24): Added TWIN OPS integration and the shared control-room shell.
- **2.2.8** (2026-11-18): Added load shedding logic and improved energy flow visualization.

## References
- [Source code](../../web/js/infrastructures/solar.js)
- [Module contract](../../docs/MODULE_CONTRACT.md)
- [Project README](../../README.md)

*Last updated: 2026-11-26*
