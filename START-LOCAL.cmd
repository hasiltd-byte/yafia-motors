@echo off
cd /d "%~dp0yafia-motors"
node launch-local.mjs
if errorlevel 1 pause
