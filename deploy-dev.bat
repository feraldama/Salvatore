@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-dev.ps1" %*
pause
