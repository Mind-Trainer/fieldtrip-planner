@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 24 LTS, then run this file again.
 pause
 exit /b 1
)
if not exist node_modules (
 call npm.cmd ci
 if errorlevel 1 (
  echo Dependency installation failed. Check your internet connection.
  pause
  exit /b 1
 )
)
echo Starting Fieldtrip. Keep this window open.
node scripts/start.mjs
pause
