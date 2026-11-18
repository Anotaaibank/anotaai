@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -File "%~dp0scripts\open-local.ps1"
if errorlevel 1 pause
exit /b
