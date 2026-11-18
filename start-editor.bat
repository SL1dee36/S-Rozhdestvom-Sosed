@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR
    pause
    exit /b 1
)

node "%~dp0editor-server.js" --open
if errorlevel 1 (
    echo ERROR
    pause
)

