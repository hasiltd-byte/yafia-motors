@echo off
cd /d "%~dp0"
node launch-local.mjs
if errorlevel 1 pause
