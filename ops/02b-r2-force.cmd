@echo off
cd /d "%~dp0.."
title WebMD R2 FORCE upload
echo WARNING: full re-upload to R2 (Class A for every file)
pause
call npm run ops -- r2:force
echo.
pause
