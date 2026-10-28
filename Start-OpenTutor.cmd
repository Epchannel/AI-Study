@echo off
if "%OPENTUTOR_NO_BROWSER%"=="1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\native-control.ps1" -Action Start -NoBrowser
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\native-control.ps1" -Action Start
)
