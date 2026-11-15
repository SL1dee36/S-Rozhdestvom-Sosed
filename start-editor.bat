@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден в системе. Установите Node.js (https://nodejs.org) и повторите попытку.
    pause
    exit /b 1
)

echo Запуск Редактора карты ZarechnoeStation...
node "%~dp0editor-server.js" --open
if errorlevel 1 (
    echo [ОШИБКА] Сервер завершился с ошибкой.
    pause
)

