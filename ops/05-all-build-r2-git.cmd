@echo off
cd /d "%~dp0.."
title WebMD build + R2 + git
call npm run ops -- all
echo.
pause
