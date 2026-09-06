@echo off
title Home Binger
echo.
echo   HOME BINGER - starting...
echo   (The store opens in your browser in a moment. Keep this window open.)
echo.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:8181"
node "%~dp0server\server.js"
echo.
echo   Home Binger stopped. (If this closed instantly, install Node.js from https://nodejs.org)
pause
