const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GAME_DIR = path.join(__dirname, 'game');

const INCLUDE_ITEMS = [
    'index.html',
    'main.js',
    'styles.css',
    'lib',
    'lumina',
    'src',
    'assets'
];

const EXCLUDE_PATHS = new Set([
    path.normalize('src/editor')
]);

let copiedFiles = 0;
let totalBytes = 0;

function shouldExclude(relPath) {
    const normalized = path.normalize(relPath);
    for (const excluded of EXCLUDE_PATHS) {
        if (normalized === excluded || normalized.startsWith(excluded + path.sep)) {
            return true;
        }
    }
    return false;
}

function copyRecursive(src, dest, relBase = '') {
    if (!fs.existsSync(src)) {
        console.warn(`[prepare] Предупреждение: не найден путь ${src}`);
        return;
    }

    if (relBase && shouldExclude(relBase)) {
        return;
    }

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            const nextRel = relBase ? path.join(relBase, entry) : entry;
            copyRecursive(path.join(src, entry), path.join(dest, entry), nextRel);
        }
    } else if (stat.isFile()) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        copiedFiles += 1;
        totalBytes += stat.size;
    }
}

console.log('[prepare] Очистка старой папки game...');
fs.rmSync(GAME_DIR, { recursive: true, force: true });
fs.mkdirSync(GAME_DIR, { recursive: true });

console.log('[prepare] Копирование файлов игры...');
for (const item of INCLUDE_ITEMS) {
    copyRecursive(path.join(ROOT_DIR, item), path.join(GAME_DIR, item), item);
}

const mb = (totalBytes / (1024 * 1024)).toFixed(2);
console.log(`[prepare] Готово: скопировано ${copiedFiles} файлов (${mb} МБ) в ${GAME_DIR}`);

