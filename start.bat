@echo off
title Home Binger
cd /d "%~dp0"
echo.
echo   Starting Home Binger... your browser: http://localhost:8181
echo.
node server\server.js
echo.
echo   (server stopped — window stays open so you can read any message above)
pause
