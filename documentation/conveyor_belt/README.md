# Conveyor Belt Sorting Line Documentation

## Overview
A 3D simulation of a U-shaped transport loop with live carton tracking, rule-based diverter, motor thermal model, and jam recovery features, synced to Digital Twin Monitoring Mode.

## Key Features
- U-shaped transport loop (long Box track).
- Live carton tracking (Cartons added each second).
- Rule-based diverter (left divert for heavy cartons).
- Motor thermal model (temperature rises, triggers jam; cools when jam cleared).
- Jam recovery (automatic jam detection and cooling).
- Digital Twin Monitoring Mode overlay (real-time temperature and sorted count).

## UI Elements
- U-shaped transport loop (Box track).
- Motor graphic with temperature display.
- Carton icons moving along the loop.
- Digital Twin Monitoring Mode overlay showing temperature and sorted count.

## Interaction
- Watch cartons move along the U-shaped loop.
- Observe motor temperature rise and jam detection.
- See jam recovery when temperature drops below threshold.
- View real-time sorted count and motor temperature.

## Data Flow
- Cartons move along the U-shaped track.
- Motor temperature influences jam detection.
- UI updates in real-time based on motor temperature and sorted count.

## Configuration
- Carton entry rate (e.g., 1 carton per second).
- Motor temperature thresholds for jam detection (e.g., >80°C triggers jam).

## Usage
1. Open the Conveyor Belt Sorting Line view in the Digital Twin Monitoring Mode.
2. Watch cartons move along the U-shaped loop.
2. Observe motor temperature rise and jam detection.
3. See jam recovery when motor temperature drops below threshold.
4. View real-time sorted count and motor temperature.

## Version History
- **2.2.8** (2026-11-18): Added motor thermal model and improved jam recovery logic.

## References
- [Conveyor Belt Sorting Line Source Code](#) (link to source if available)
- [Digital Twin Monitoring Mode Documentation](#)

*Last updated: 2026-11-18*