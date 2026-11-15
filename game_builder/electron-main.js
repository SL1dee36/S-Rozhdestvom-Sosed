const { app, BrowserWindow, Menu, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.join(__dirname, 'game');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
};

let server = null;
let mainWindow = null;

function startStaticServer() {
    return new Promise((resolve, reject) => {
        const srv = http.createServer((req, res) => {
            try {
                const reqUrl = new URL(req.url, 'http://127.0.0.1');
                let relPath = decodeURIComponent(reqUrl.pathname);
                if (relPath === '/' || relPath === '') {
                    relPath = '/index.html';
                }

                const resolvedPath = path.resolve(GAME_DIR, '.' + relPath);
                if (!resolvedPath.startsWith(path.resolve(GAME_DIR))) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                fs.stat(resolvedPath, (err, stat) => {
                    if (err || !stat.isFile()) {
                        res.writeHead(404);
                        res.end('Not Found');
                        return;
                    }

                    const ext = path.extname(resolvedPath).toLowerCase();
                    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Content-Length': stat.size,
                        'Cache-Control': 'no-cache'
                    });
                    fs.createReadStream(resolvedPath).pipe(res);
                });
            } catch {
                res.writeHead(400);
                res.end('Bad Request');
            }
        });

        srv.on('error', (err) => {
            if (err && err.code === 'EADDRINUSE') {
                srv.listen(0, '127.0.0.1');
            } else {
                reject(err);
            }
        });
        srv.on('listening', () => {
            const addr = srv.address();
            resolve({ srv, port: addr.port });
        });
        srv.listen(18745, '127.0.0.1');
    });
}

function setupPermissions() {
    const allowedPermissions = new Set(['media', 'pointerLock', 'fullscreen']);

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        callback(allowedPermissions.has(permission));
    });

    session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
        return allowedPermissions.has(permission);
    });
}

async function createWindow() {
    setupPermissions();

    const { srv, port } = await startStaticServer();
    server = srv;

    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        title: 'С Новым Годом, Сосед',
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            event.preventDefault();
        }
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    await mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (server) {
        server.close();
        server = null;
    }
    app.quit();
});

