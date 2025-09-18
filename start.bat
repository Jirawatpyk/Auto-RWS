@echo off
title Auto IMAP RWS System

:: ปิด Sleep Mode (เฉพาะ Windows + AC power)
powercfg -change -standby-timeout-ac 0
echo 🛡 Sleep Mode Disabled (AC Power)

powercfg -change -standby-timeout-ac 0

timeout /t 2 >nul
start cmd /k "node main.js"

exit
