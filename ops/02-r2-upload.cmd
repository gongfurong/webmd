@echo off
cd /d "%~dp0.."
title WebMD R2 upload (incremental)
call npm run ops -- r2
echo.
pause
