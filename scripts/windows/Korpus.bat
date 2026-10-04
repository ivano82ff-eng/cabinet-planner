@echo off
chcp 65001 >nul
cd /d "%~dp0"
set HOST=127.0.0.1
set PORT=3001
set OPEN_BROWSER=1
echo Planner is starting. The browser will open on its own.
echo Leave this window open. Close it to stop the program.
"%~dp0runtime\node.exe" "%~dp0server\dist\index.mjs"
if errorlevel 1 pause
