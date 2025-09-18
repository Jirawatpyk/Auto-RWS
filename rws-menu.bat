@echo off
title Auto RWS Control Menu
:menu
cls
echo.
echo ============================
echo      Auto RWS Control      
echo ============================
echo [1] Start Auto RWS
echo [2] Restart Auto RWS
echo [3] Stop Auto RWS
echo [4] Show Logs
echo [5] Setup Auto-Start (PM2 boot)
echo [6] Exit
echo.
set /p choice="Enter your choice [1-6]: "

if "%choice%"=="1" (
  echo Starting Auto RWS...
  pm2 start ecosystem.config.js
  pm2 save
  pause
  goto menu
)
if "%choice%"=="2" (
  echo Restarting Auto RWS...
  pm2 restart AutoRWS
  pause
  goto menu
)
if "%choice%"=="3" (
  echo Stopping Auto RWS...
  pm2 stop AutoRWS
  pause
  goto menu
)
if "%choice%"=="4" (
  echo Showing logs... (Press Ctrl+C to exit)
  pm2 logs AutoRWS
  goto menu
)
if "%choice%"=="5" (
  echo Setting up PM2 auto-start on boot...
  pm2 startup
  pm2 save
  pause
  goto menu
)
if "%choice%"=="6" (
  echo Exiting...
  exit
)

echo.
echo Invalid input. Please enter a number between 1 and 6.
pause
goto menu
