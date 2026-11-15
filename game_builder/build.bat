@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js LTS and try again.
    if /I "%~1" NEQ "--nopause" pause
    exit /b 1
)

node "%~dp0build.js"
set EXIT_CODE=%errorlevel%
if /I "%~1" NEQ "--nopause" pause
exit /b %EXIT_CODE%
