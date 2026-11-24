@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%TwinOps.exe" (
    start "" "%SCRIPT_DIR%TwinOps.exe"
) else (
    echo TWIN OPS executable not found. Keep this launcher next to TwinOps.exe.
    pause
)
