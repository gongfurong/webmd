@echo off
cd /d "%~dp0.."
title WebMD git commit + push
call npm run ops -- git
echo.
pause
