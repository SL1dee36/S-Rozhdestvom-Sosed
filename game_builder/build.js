const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT_EXE = path.join(ROOT, 'dist', 'NewYearsEve-1.3.0.exe');

function isGameRunning() {
    if (process.platform !== 'win32') return false;
    const res = spawnSync(
        'powershell.exe',
        [
            '-NoProfile',
            '-Command',
            "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*game_builder\\dist*' } | Select-Object -ExpandProperty ProcessName"
        ],
        { encoding: 'utf8' }
    );
    return res.status === 0 && res.stdout.trim().length > 0;
}

function runNpm(args) {
    const isWin = process.platform === 'win32';
    const res = spawnSync(isWin ? 'cmd.exe' : 'npm', isWin ? ['/c', 'npm', ...args] : args, {
        cwd: ROOT,
        stdio: 'inherit'
    });
    return res.status ?? 1;
}

if (isGameRunning()) {
    console.error('[ERROR] Закройте запущенную игру из папки dist перед сборкой.');
    process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    console.log('[1/2] Установка зависимостей Electron и electron-builder...');
    const code = runNpm(['install']);
    if (code !== 0) {
        console.error('[ERROR] Ошибка при установке зависимостей.');
        process.exit(code);
    }
}

const distDir = path.join(ROOT, 'dist');
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}

console.log('[2/2] Сборка "NewYearsEve-1.3.0.exe"...');
const buildCode = runNpm(['run', 'build']);
if (buildCode !== 0) {
    console.error('[ERROR] Ошибка при сборке .exe.');
    process.exit(buildCode);
}

if (!fs.existsSync(OUTPUT_EXE)) {
    console.error(`[ERROR] Итоговый файл не найден: ${OUTPUT_EXE}`);
    process.exit(1);
}

console.log('');
console.log('======================================================');
console.log(' Сборка успешно завершена!');
console.log(` Файл: ${OUTPUT_EXE}`);
console.log('======================================================');

