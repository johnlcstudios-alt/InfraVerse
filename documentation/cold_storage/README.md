# Cold Storage Room Documentation

## Overview
A 3D simulation of a multi-zone refrigeration room with animated compressor and evaporator units, live heat map, door interlocks, and inventory temperature rules, synced to Digital Twin Monitoring Mode.

## Key Features
- Multi-zone temperature control with independent setpoints.
- Live heat map displaying temperature gradients (blue to red).
- Door interlock status (locked/unlocked) with temperature safety checks.
- Inventory temperature rules for frozen goods, fresh produce, and dairy.
- Real-time temperature updates every 5 seconds.

## UI Elements
- Zone tiles with temperature readout (e.g., Zone A: 2.5°C).
- Live heat map overlay showing temperature gradients.
- Door status indicator (locked/unlocked) with temperature safety check.
- Temperature readout per zone with color coding.

## Interaction
- View temperature per zone in real time.
- Observe door status (locked/unlocked) with temperature safety check.
- Receive alerts for temperature deviations or door status changes.
- Receive alerts for inventory temperature rule violations.

## Data Flow
- Temperature sensors feed data to the UI.
- Door sensors feed status to the UI.
- Temperature data updates every 5 seconds.
- Alerts are triggered based on temperature thresholds or door status changes.

## Configuration
- Temperature setpoints per zone (e.g., Zone A: 2.5°C).
- Alert thresholds for temperature deviations.
- Door safety temperature limits.

## Usage
1. Open the Cold Storage Room view in the Digital Twin Monitoring Mode.
2. View temperature per zone via zone tiles.
2. Observe the live heat map for temperature gradients.
3. Check door status (locked/unlocked) with temperature safety check.
3. Receive alerts for temperature deviations or door status changes.
3. Ensure inventory temperature rules are followed (e.g., frozen goods -25°C to -18°C).

## Version History
- **2.2.8** (2026-11-18): Added live heat map and improved door interlock logic.

## References
- [Cold Storage Room Source Code](#) (link to source if available)
- [Digital Twin Monitoring Mode Documentation](#)

*Last updated: 2026-11-18*