# Smart Water Tank Documentation

## Overview
A 3D simulation of a transparent elevated reservoir with a live hydrostatic level model, variable-speed inlet pump, motorised valves, and flow monitoring, synced to Digital Twin Monitoring Mode.

## Key Features
- Real-time water level visualization.
- Variable-speed inlet pump control.
- Motorised valve control for flow regulation.
- Flow monitoring with real-time alerts for low/high levels.
- Real-time alerts for low/high water levels.

## UI Elements
- 3D model of the reservoir.
- Water level gauge (gauge-like display).
- Variable-speed inlet pump slider.
- Motorised valve toggle switches.
- Flow meter display showing flow rate.

## Interaction
- Toggle the pump on/off.
- Adjust the pump speed using the slider.
- Open or close motorised valves.
- View real-time water level changes.
- Receive alerts when water level is below or above set thresholds.

## Data Flow
- Sensors feed water level data to the UI.
- Pump and valve controls send commands to the hardware.
- UI updates in real-time based on sensor and control inputs.

## Configuration
- Pump speed range (e.g., 0% to 100%).
- Valve positions (open/close).
- Alert thresholds for low and high water levels.

## Usage
1. Open the Smart Water Tank view in the Digital Twin Monitoring Mode.
2. Adjust the pump speed slider to control flow rate.
3. Open or close valves to regulate flow.
4. Monitor the water level gauge for real-time level changes.
5. Receive alerts when water level exceeds or falls below set thresholds.

## Version History
- **2.2.8** (2026-11-18): Added real-time water level alerts and improved valve control UI.

## References
- [Smart Water Tank Source Code](#) (link to source if available)
- [Digital Twin Monitoring Mode Documentation](#)

*Last updated: 2026-11-18*