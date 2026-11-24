# Smart Parking Lot Documentation

## Overview
A 3D simulation of 18 sensor-equipped bays with automated entry and exit barriers, vehicle detection, occupancy analytics, and overstay enforcement, synced to Digital Twin Monitoring Mode.

## Key Features
- Real-time vehicle detection and detection of vehicle presence in each bay.
- Occupancy status (occupied/vacant) updated each second.
- Overstay enforcement with alerts when a vehicle exceeds the allowed dwell time.
- Live map view with vehicle icons moving between bays.
- Dashboard displaying current occupancy percentages, average stay times, and overstay incidents.

## UI Elements
- Grid of 18 bays with color indicators (green for occupied, red for vacant).
- Vehicle icons moving between bays in real time.
- Dashboard widgets showing current occupancy percentages, average stay times, and overstay incidents.
- Live map view with vehicle icons moving between bays.

## Interaction
- View real-time occupancy status of each bay.
- Observe vehicle icons moving between bays.
- Receive overstay alerts when a vehicle exceeds the allowed dwell time.
- View dashboard metrics for occupancy percentages and average stay times.

## Data Flow
- Sensors detect vehicle presence in each bay and update occupancy status.
- Occupancy data is sent to the UI for real-time display.
- Overstay detection logic monitors dwell time and triggers alerts.

## Configuration
- Overstay time threshold (e.g., 60 seconds).
- Occupancy reporting interval (e.g., 1 second).

## Usage
1. Open the Smart Parking Lot view in the Digital Twin Monitoring Mode.
2. Observe the color status of each bay (green for occupied, red for vacant).
3. Watch vehicle icons move between bays in real time.
4. Monitor the dashboard for occupancy percentages and overstay alerts.
5. Adjust entry/exit sequences if configurable (optional).

## Version History
- **2.2.8** (2026-11-18): Added overstay enforcement alerts and improved occupancy reporting.

## References
- [Smart Parking Lot Source Code](#) (link to source if available)
- [Digital Twin Monitoring Mode Documentation](#)

*Last updated: 2026-11-18*