@echo off
cd /d "%~dp0.."
title WebMD R2 + git
call npm run ops -- ship
echo.
pause
