# Сборщик игры в .exe (`game_builder`)

Отдельная папка для упаковки игры в автономный `.exe` для Windows на базе Electron.

## Быстрая сборка

Запустите **`build.bat`** двойным кликом (или из терминала).

Скрипт:
1. При первом запуске установит `electron` и `electron-builder` в `game_builder/node_modules`.
2. Скопирует актуальные файлы игры (`index.html`, `main.js`, `styles.css`, `lib/`, `lumina/`, `src/`, `assets/`, исключая `src/editor/`) в `game_builder/game/`.
3. Соберёт единый портативный файл:
   `game_builder/dist/С Рождеством, Сосед!.exe`

## Команды npm (внутри `game_builder`)

- `npm start` — тестовый запуск игры в окне Electron без упаковки в `.exe`.
- `npm run build` — сборка портативного одного `.exe` (`dist/С Рождеством, Сосед!.exe`).
- `npm run build:dir` — сборка в распакованную папку `dist/win-unpacked/`.
- `npm run build:nsis` — сборка классического установщика Windows (`dist/С Рождеством, Сосед! Setup.exe`).

## Управление окном

- `F11` — переключение полноэкранного режима.
- Доступ к микрофону и захвату курсора (Pointer Lock) разрешён автоматически.
