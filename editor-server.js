'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { exec } = require('node:child_process');

const ROOT_DIR = __dirname;
const OVERRIDES_JS_PATH = path.join(ROOT_DIR, 'src', 'world', 'MapOverrides.js');
const OVERRIDES_JSON_PATH = path.join(ROOT_DIR, 'assets', 'map_overrides.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readRequestBody(req, maxBytes = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function openBrowser(url) {
    if (process.platform === 'win32') {
        exec(`cmd /c start "" "${url}"`);
    } else if (process.platform === 'darwin') {
        exec(`open "${url}"`);
    } else {
        exec(`xdg-open "${url}"`);
    }
}

async function startServer() {
    const overridesMod = await import(pathToFileURL(OVERRIDES_JS_PATH).href);
    const { normalizeMapOverrides, serializeMapOverridesToJS } = overridesMod;

    let activePort = parseInt(process.env.PORT, 10) || 3000;

    const server = http.createServer(async (req, res) => {
        try {
            const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
            const pathname = decodeURIComponent(reqUrl.pathname);

            if (req.method === 'GET' && pathname === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }

            if (req.method === 'GET' && pathname === '/api/ping') {
                sendJson(res, 200, { ok: true, mode: 'editor-server', port: activePort });
                return;
            }

            if (req.method === 'GET' && pathname === '/api/load-map') {
                const mod = await import(`${pathToFileURL(OVERRIDES_JS_PATH).href}?t=${Date.now()}`);
                sendJson(res, 200, normalizeMapOverrides(mod.MAP_OVERRIDES));
                return;
            }

            if (req.method === 'POST' && pathname === '/api/save-map') {
                const raw = await readRequestBody(req);
                const parsed = JSON.parse(raw);
                const normalized = normalizeMapOverrides(parsed);
                normalized.updatedAt = new Date().toISOString();

                const jsCode = serializeMapOverridesToJS(normalized);
                await fsp.mkdir(path.dirname(OVERRIDES_JS_PATH), { recursive: true });
                await fsp.writeFile(OVERRIDES_JS_PATH, jsCode, 'utf8');

                await fsp.mkdir(path.dirname(OVERRIDES_JSON_PATH), { recursive: true });
                await fsp.writeFile(OVERRIDES_JSON_PATH, JSON.stringify(normalized, null, 2), 'utf8');

                sendJson(res, 200, {
                    ok: true,
                    savedAt: normalized.updatedAt,
                    file: 'src/world/MapOverrides.js'
                });
                return;
            }

            let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
            const resolved = path.resolve(ROOT_DIR, relPath);
            if (resolved !== ROOT_DIR && !resolved.startsWith(ROOT_DIR + path.sep)) {
                res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Forbidden');
                return;
            }

            let filePath = resolved;
            let stat;
            try {
                stat = await fsp.stat(filePath);
            } catch (_) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not Found');
                return;
            }

            if (stat.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
                try {
                    stat = await fsp.stat(filePath);
                } catch (_) {
                    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('Not Found');
                    return;
                }
            }

            const ext = path.extname(filePath).toLowerCase();
            const mime = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': mime,
                'Content-Length': stat.size,
                'Cache-Control': 'no-store'
            });
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            console.error('[editor-server] Error:', err);
            sendJson(res, 500, { ok: false, error: err.message || 'Internal server error' });
        }
    });

    const tryListen = (port, maxAttempts = 15) => {
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE' && maxAttempts > 0) {
                tryListen(port + 1, maxAttempts - 1);
            } else {
                console.error('Failed to start server:', err);
                process.exit(1);
            }
        });
        server.listen(port, '127.0.0.1', () => {
            activePort = port;
            const editorUrl = `http://127.0.0.1:${port}/editor.html`;
            const gameUrl = `http://127.0.0.1:${port}/index.html`;
            console.log('====================================================');
            console.log(' ZarechnoeStation — Сервер Редактора Карты запущен');
            console.log(` Редактор: ${editorUrl}`);
            console.log(` Игра:     ${gameUrl}`);
            console.log(' Для остановки нажмите Ctrl+C');
            console.log('====================================================');
            if (process.argv.includes('--open')) {
                openBrowser(editorUrl);
            }
        });
    };

    tryListen(activePort);
}

startServer();

