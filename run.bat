@echo off
rem Industrial Digital Twin Simulator - portable launcher
setlocal
cd /d "%~dp0"
if not exist "IndustrialDigitalTwinSimulator.exe" (
    echo IndustrialDigitalTwinSimulator.exe was not found next to this script.
    pause
    exit /b 1
)
start "" "IndustrialDigitalTwinSimulator.exe"
exit /b 0
