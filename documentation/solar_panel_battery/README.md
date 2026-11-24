# Solar Panel & Battery System Documentation

## Overview
A 3D simulation of a 12-panel photovoltaic array with a charge controller, battery bank, and inverter, displaying real-time energy flow, charge/discharge cycles, and load management, synced to Digital Twin Monitoring Mode.

## Key Features
- Real-time solar generation display (kW).
- Battery charge level and state of charge (SOC) monitoring.
- Inverter efficiency display (percentage).
- Load demand monitoring (kW).
- Grid import/export monitoring (kW).
- Load management with automatic load shedding during peak demand.

## UI Elements
- 3D model of 12 solar panels on a roof.
- Battery bank visual with charge level indicator.
- Inverter graphic with efficiency percentage.
- Energy flow arrows showing direction and magnitude.
- Power metrics display (kW, kWh).

## Interaction
- View real-time solar generation and load demand.
- Observe battery charge/discharge cycles.
- Monitor inverter efficiency and load shedding events.
- Adjust load demand (if configurable) to see impact on battery and grid.

## Data Flow
- Solar generation data flows from panels to charge controller.
- Charge controller regulates voltage to battery bank.
- Battery discharges to inverter, which supplies load.
- Load demand is fed back to the system for load management decisions.

## Configuration
- Load demand setpoint (kW).
- Battery SOC limits (minimum/maximum).
- Grid import/export thresholds.

## Usage
1. Open the Solar Panel & Battery System view in the Digital Twin Monitoring Mode.
2. Observe real-time solar generation and load demand.
2. Monitor battery charge level and SOC.
3. Watch inverter efficiency and load shedding events.
3. Adjust load demand (if configurable) to see impact on battery and grid.

## Version History
- **2.2.8** (2026-11-18): Added load shedding logic and improved energy flow visualization.

## References
- [Solar Panel & Battery System Source Code](#) (link to source if available)
- [Digital Twin Monitoring Mode Documentation](#)

*Last updated: 2026-11-18*