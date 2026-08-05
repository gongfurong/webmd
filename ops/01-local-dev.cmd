@echo off
cd /d "%~dp0.."
title WebMD local dev
echo [ops] local dev — Ctrl+C to stop
call npm run ops -- dev
pause
