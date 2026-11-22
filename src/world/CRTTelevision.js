import * as THREE from 'three';
import { configurePS1Texture } from '../../lumina/index.js';
import { t as tr } from '../i18n/Localization.js';

export class CRTTelevision {
    constructor(tvLight) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 192;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        configurePS1Texture(this.texture, 1, 1);

        this.tvLight = tvLight;
        this.mode = 'movie';
        this.channels = ['movie', 'weather', 'cartoon', 'ogonyok'];
        this.channelIndex = 0;
        this.cracked = false;
        this.horrorLevel = 0;
        this._time = 0;
        this._frameAccum = 0;
        this._vsyncY = 0;

        this._houseImg = new Image();
        this._houseImgLoaded = false;
        this._houseImg.onload = () => { this._houseImgLoaded = true; };
        this._houseImg.src = './assets/textures/panel_wall.jpg';
    }

    setMode(mode, cracked = false) {
        this.mode = mode;
        this.cracked = cracked;
        const idx = this.channels.indexOf(mode);
        if (idx >= 0) this.channelIndex = idx;
    }

    setHorrorLevel(level = 0) {
        this.horrorLevel = Math.max(0, Math.min(3, level));
    }

    nextChannel() {
        this.channelIndex = (this.channelIndex + 1) % this.channels.length;
        this.mode = this.channels[this.channelIndex];
        return this.mode;
    }

    update(deltaTime) {
        this._time += deltaTime;
        this._frameAccum += deltaTime;
        if (this._frameAccum < 1 / 15) return;
        this._frameAccum = 0;

        const ctx = this.ctx;
        const W = 256;
        const H = 192;
        this._vsyncY = (this._vsyncY + 6) % (H + 24);

        if (this.mode === 'off') {
            ctx.fillStyle = '#07080a';
            ctx.fillRect(0, 0, W, H);
            if (this.tvLight) this.tvLight.intensity = 0;
        } else if (this.mode === 'ogonyok') {
            this._drawOgonyok(ctx, W, H);
        } else if (this.mode === 'movie') {
            this._drawMovie(ctx, W, H);
        } else if (this.mode === 'weather') {
            this._drawWeather(ctx, W, H);
        } else if (this.mode === 'cartoon') {
            this._drawCartoon(ctx, W, H);
        } else if (this.mode === 'static') {
            this._drawStatic(ctx, W, H);
        } else if (this.mode === 'news') {
            this._drawNews(ctx, W, H);
        } else if (this.mode === 'midnight') {
            this._drawMidnight(ctx, W, H);
        }

        if (this.mode !== 'off') {
            const barY = this._vsyncY - 12;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.fillRect(0, barY, W, 6);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, barY + 6, W, 4);

            for (let i = 0; i < 160; i++) {
                const gx = Math.floor(Math.random() * W);
                const gy = Math.floor(Math.random() * H);
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)';
                ctx.fillRect(gx, gy, 2, 1);
            }
        }

        if (this.cracked) {
            this._drawCracks(ctx, W, H);
        }

        this.texture.needsUpdate = true;
    }

    _drawOgonyok(ctx, W, H) {
        const t = this._time;
        const hueShift = Math.sin(t * 1.4);
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, hueShift > 0 ? '#18244a' : '#2f1438');
        grad.addColorStop(1, '#0c0d18');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < 24; i++) {
            const sx = (i * 37 + Math.sin(t * 2 + i) * 6) % W;
            const sy = 15 + ((i * 23) % 95);
            const bright = Math.sin(t * 5 + i * 1.7) > 0;
            ctx.fillStyle = bright ? '#ffd86b' : '#58a6ff';
            ctx.fillRect(sx, sy, 3, 3);
        }

        ctx.fillStyle = '#5c1a33';
        ctx.fillRect(20, 125, 216, 40);
        const eerieFreeze = this.horrorLevel >= 2 && (Math.sin(t * 0.45) > 0.35);
        const sway = eerieFreeze ? 0 : Math.sin(t * 3.1) * 4;
        // Singer in retro suit instead of black silhouette
        ctx.fillStyle = '#1e2436';
        ctx.fillRect(116 + sway, 118, 10, 24);
        ctx.fillRect(130 + sway, 118, 10, 24);
        ctx.fillStyle = eerieFreeze ? '#3a0e12' : '#283147';
        ctx.fillRect(110 + sway, 86, 36, 36);
        ctx.fillStyle = '#f0ebe1';
        ctx.beginPath();
        ctx.moveTo(122 + sway, 86);
        ctx.lineTo(134 + sway, 86);
        ctx.lineTo(128 + sway, 104);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a81c1c';
        ctx.fillRect(125 + sway, 88, 6, 4);
        ctx.fillStyle = eerieFreeze ? '#9c8676' : '#d9b396';
        ctx.beginPath();
        ctx.arc(128 + sway, 72, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b281c';
        ctx.beginPath();
        ctx.arc(128 + sway, 66, 12, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eerieFreeze ? '#ffffff' : '#241a14';
        ctx.fillRect(123 + sway, 70, eerieFreeze ? 3 : 2, eerieFreeze ? 3 : 2);
        ctx.fillRect(131 + sway, 70, eerieFreeze ? 3 : 2, eerieFreeze ? 3 : 2);
        ctx.fillStyle = '#c8c8d8';
        ctx.fillRect(138, 78, 2, 52);
        ctx.fillStyle = '#8890a0';
        ctx.beginPath();
        ctx.arc(139, 76, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(tr('tv.channel'), 10, 16);

        ctx.fillStyle = 'rgba(130, 15, 25, 0.85)';
        ctx.fillRect(0, 166, W, 26);
        ctx.fillStyle = '#ffe999';
        ctx.font = 'bold 11px monospace';
        const tickerX = 256 - ((t * 48) % 520);
        const tickerText = eerieFreeze ? tr('tv.horror_ticker') : tr('tv.ticker');
        ctx.fillText(tickerText, tickerX, 183);

        if (this.tvLight) {
            const r = hueShift > 0 ? 0.45 : 0.72;
            const g = hueShift > 0 ? 0.65 : 0.42;
            const b = hueShift > 0 ? 1.0 : 0.68;
            this.tvLight.color.setRGB(r, g, b);
            this.tvLight.intensity = 1.65 + Math.sin(t * 14) * 0.22;
        }
    }

    _drawMovie(ctx, W, H) {
        // Classic Soviet New Year comedy film (warm amber cinema tint, snowy window, festive table)
        const t = this._time;
        ctx.fillStyle = '#2e241b';
        ctx.fillRect(0, 0, W, H);
        // Snowy blue window in background
        ctx.fillStyle = '#1b2c4a';
        ctx.fillRect(16, 22, 86, 84);
        ctx.strokeStyle = '#5e4b3a';
        ctx.lineWidth = 4;
        ctx.strokeRect(16, 22, 86, 84);
        ctx.beginPath(); ctx.moveTo(59, 22); ctx.lineTo(59, 106); ctx.stroke();
        // Falling snow outside window
        ctx.fillStyle = '#dce8f8';
        for (let i = 0; i < 18; i++) {
            const sx = 20 + ((i * 19 + t * 14) % 78);
            const sy = 26 + ((i * 29 + t * 22) % 76);
            ctx.fillRect(sx, sy, 2, 2);
        }
        // Festive tree on right
        ctx.fillStyle = '#1c4f28';
        ctx.beginPath(); ctx.moveTo(204, 28); ctx.lineTo(170, 126); ctx.lineTo(238, 126); ctx.closePath(); ctx.fill();
        for (let b = 0; b < 6; b++) {
            ctx.fillStyle = (Math.sin(t * 4 + b) > 0) ? '#ffd166' : '#e04242';
            ctx.fillRect(186 + (b % 3) * 14, 56 + b * 11, 4, 4);
        }
        // Two characters talking at dinner table
        const nod = Math.sin(t * 2.5) * 2;
        ctx.fillStyle = '#3d4c5c'; ctx.fillRect(92, 92, 28, 42);
        ctx.fillStyle = '#dcb598'; ctx.beginPath(); ctx.arc(106, 80 + nod, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a2b38'; ctx.fillRect(136, 94, 28, 40);
        ctx.fillStyle = '#e3bfa4'; ctx.beginPath(); ctx.arc(150, 82 - nod, 10, 0, Math.PI * 2); ctx.fill();
        // Table & champagne
        ctx.fillStyle = '#d9cfb8'; ctx.fillRect(66, 130, 124, 34);
        ctx.fillStyle = '#1f542a'; ctx.fillRect(124, 112, 7, 20);
        // Cinema letterbox bars & channel badge
        ctx.fillStyle = '#070709';
        ctx.fillRect(0, 0, W, 16);
        ctx.fillRect(0, H - 22, W, 22);
        ctx.fillStyle = 'rgba(255,245,215,0.82)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('2 КАНАЛ · КИНО', 10, 12);
        ctx.fillStyle = '#f2d98a';
        ctx.fillText('«С ЛЁГКИМ ПАРОМ!»', 68, H - 7);
        if (this.tvLight) {
            this.tvLight.color.setRGB(0.88, 0.72, 0.48);
            this.tvLight.intensity = 1.55 + Math.sin(t * 9) * 0.14;
        }
    }

    _drawWeather(ctx, W, H) {
        // Retro Soviet TV Weather Forecast (map + snowflakes + presenter)
        const t = this._time;
        ctx.fillStyle = '#143352';
        ctx.fillRect(0, 0, W, H);
        // Stylized map landmass
        ctx.fillStyle = '#2d5c45';
        ctx.beginPath();
        ctx.moveTo(14, 130); ctx.lineTo(42, 62); ctx.lineTo(108, 46); ctx.lineTo(176, 56);
        ctx.lineTo(222, 92); ctx.lineTo(192, 146); ctx.lineTo(48, 152); ctx.closePath();
        ctx.fill();
        // Animated snow clouds & temperature badges
        const drift = Math.sin(t * 1.4) * 8;
        ctx.fillStyle = '#dbe6f2';
        for (const [cx, cy] of [[68, 72], [140, 68], [108, 108]]) {
            ctx.beginPath(); ctx.arc(cx + drift, cy, 12, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + 12 + drift, cy + 2, 10, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#7ad4ff';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('-18°C', 48, 106);
        ctx.fillText('-22°C', 132, 100);
        // Presenter silhouette on right
        ctx.fillStyle = '#252c3b'; ctx.fillRect(198, 108, 42, 60);
        ctx.fillStyle = '#dfb89c'; ctx.beginPath(); ctx.arc(219, 92, 12, 0, Math.PI * 2); ctx.fill();
        // Header & footer
        const eerieWeather = this.horrorLevel >= 1 && (Math.sin(t * 0.55) > 0.25);
        ctx.fillStyle = eerieWeather ? '#5c0e14' : '#1d4d7a'; ctx.fillRect(0, 0, W, 24);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px monospace';
        ctx.fillText('3 КАНАЛ · ПРОГНОЗ ПОГОДЫ', 12, 16);
        ctx.fillStyle = '#0e2238'; ctx.fillRect(0, 164, W, 28);
        ctx.fillStyle = eerieWeather ? '#ff6b6b' : '#9fe2ff'; ctx.font = 'bold 10px monospace';
        ctx.fillText(eerieWeather ? tr('tv.horror_weather') : '31 ДЕКАБРЯ: МЕТЕЛЬ, МОРОЗ ДО -20°C', 14, 182);
        if (this.tvLight) {
            this.tvLight.color.setRGB(0.42, 0.72, 1.0);
            this.tvLight.intensity = 1.6;
        }
    }

    _drawCartoon(ctx, W, H) {
        // Cozy winter Soviet cartoon (blue night forest, dancing snowman, glowing tree)
        const t = this._time;
        const eerieCartoon = this.horrorLevel >= 1 && (Math.sin(t * 0.5) > 0.3);
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0d1b3d');
        grad.addColorStop(1, '#264373');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // Snowy ground
        ctx.fillStyle = '#dce8f5';
        ctx.fillRect(0, 134, W, 58);
        // Moon
        ctx.fillStyle = eerieCartoon ? '#c92a2a' : '#fff0a8';
        ctx.beginPath(); ctx.arc(214, 38, 16, 0, Math.PI * 2); ctx.fill();
        // Spruce tree on left
        ctx.fillStyle = '#1d6134';
        ctx.beginPath(); ctx.moveTo(64, 42); ctx.lineTo(26, 138); ctx.lineTo(102, 138); ctx.closePath(); ctx.fill();
        if (eerieCartoon) {
            // Tall dark silhouette in Santa hat behind the spruce tree
            ctx.fillStyle = '#08090d';
            ctx.fillRect(92, 92, 18, 44);
            ctx.beginPath(); ctx.arc(101, 84, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(98, 82, 2, 2);
            ctx.fillRect(103, 82, 2, 2);
        }
        // Bouncing snowman on right (freezes & stares at player during eerie moment)
        const hop = eerieCartoon ? 0 : Math.abs(Math.sin(t * 3.8)) * 10;
        const sx = 162;
        ctx.fillStyle = '#f4f8fc';
        ctx.beginPath(); ctx.arc(sx, 128 - hop, 18, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx, 102 - hop, 13, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sx, 82 - hop, 9, 0, Math.PI * 2); ctx.fill();
        // Bucket hat & carrot nose / hollow staring eyes
        ctx.fillStyle = '#758294'; ctx.fillRect(sx - 7, 64 - hop, 14, 11);
        if (eerieCartoon) {
            ctx.fillStyle = '#07080a';
            ctx.fillRect(sx - 5, 79, 3, 4);
            ctx.fillRect(sx + 2, 79, 3, 4);
            ctx.fillRect(sx - 4, 86, 8, 2);
        } else {
            ctx.fillStyle = '#eb721c'; ctx.fillRect(sx - 15, 81 - hop, 10, 3);
        }
        // Falling snow
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 24; i++) {
            const fx = (i * 23 + Math.sin(t + i) * 6) % W;
            const fy = (i * 19 + t * 28) % H;
            ctx.fillRect(fx, fy, 2, 2);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('4 КАНАЛ · МУЛЬТФИЛЬМ', 10, 16);
        if (this.tvLight) {
            this.tvLight.color.setRGB(0.55, 0.78, 1.0);
            this.tvLight.intensity = 1.65;
        }
    }

    _drawStatic(ctx, W, H) {
        const img = ctx.createImageData(W, H);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const v = Math.random() * 255;
            d[i] = v;
            d[i + 1] = v;
            d[i + 2] = v + 12;
            d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);

        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        const bar = Math.floor((this._time * 180) % H);
        ctx.fillRect(0, bar, W, 18);

        if (this.tvLight) {
            this.tvLight.color.setRGB(0.72, 0.82, 1.0);
            this.tvLight.intensity = 1.4 + Math.random() * 1.4;
        }
    }

    _drawNews(ctx, W, H) {
        const t = this._time;
        ctx.fillStyle = '#121726';
        ctx.fillRect(0, 0, W, H);

        if (this._houseImgLoaded) {
            ctx.save();
            ctx.globalAlpha = 0.78;
            ctx.drawImage(this._houseImg, 0, 24, W, 134);
            ctx.restore();
            ctx.fillStyle = 'rgba(10, 14, 28, 0.45)';
            ctx.fillRect(0, 24, W, 134);
        } else {
            ctx.fillStyle = '#262b38';
            ctx.fillRect(28, 34, 200, 120);
        }

        ctx.strokeStyle = Math.sin(t * 6) > 0 ? '#ff2a2a' : '#ff8888';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(124, 86, 22, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#9b0f14';
        ctx.fillRect(0, 0, W, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(tr('tv.news_header'), 12, 16);

        ctx.fillStyle = '#19223b';
        ctx.fillRect(172, 86, 76, 68);
        ctx.strokeStyle = '#6f85b8';
        ctx.strokeRect(172, 86, 76, 68);
        ctx.fillStyle = '#d0c4b0';
        ctx.beginPath();
        ctx.arc(210, 110, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#141720';
        ctx.fillRect(194, 122, 32, 32);

        ctx.fillStyle = '#111116';
        ctx.fillRect(0, 158, W, 34);
        ctx.fillStyle = '#ff4c4c';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(tr('tv.news_line1'), 8, 173);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillText(tr('tv.news_line2'), 8, 186);

        if (this.tvLight) {
            this.tvLight.color.setRGB(0.85, 0.25, 0.25);
            this.tvLight.intensity = 1.3 + Math.sin(t * 7) * 0.25;
        }
    }

    _drawMidnight(ctx, W, H) {
        ctx.fillStyle = '#090c1a';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#201815';
        ctx.fillRect(88, 22, 80, 140);
        ctx.fillStyle = '#f7df94';
        ctx.beginPath();
        ctx.arc(128, 78, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(128, 78);
        ctx.lineTo(128, 55);
        ctx.moveTo(128, 78);
        ctx.lineTo(128, 56);
        ctx.stroke();

        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(tr('tv.midnight'), 48, 178);

        if (this.tvLight) {
            this.tvLight.color.setRGB(1.0, 0.85, 0.5);
            this.tvLight.intensity = 1.9;
        }
    }

    _drawCracks(ctx, W, H) {
        ctx.strokeStyle = 'rgba(10, 12, 16, 0.92)';
        ctx.lineWidth = 2;
        const cx = 165, cy = 82;
        const rays = [
            [0, 0, -90, -60],
            [0, 0, 75, -70],
            [0, 0, 85, 35],
            [0, 0, 20, 95],
            [0, 0, -110, 45],
            [0, 0, -145, -15]
        ];
        for (const [x0, y0, dx, dy] of rays) {
            ctx.beginPath();
            ctx.moveTo(cx + x0, cy + y0);
            ctx.lineTo(cx + dx * 0.5 + 4, cy + dy * 0.5 - 3);
            ctx.lineTo(cx + dx, cy + dy);
            ctx.stroke();
        }
        ctx.fillStyle = '#050608';
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class NeighborWindowCanvas {
    constructor() {
        this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        if (this.canvas) {
            this.canvas.width = 256;
            this.canvas.height = 192;
            this.ctx = this.canvas.getContext('2d');
        } else {
            this.ctx = null;
        }

        if (this.canvas) {
            this.texture = new THREE.CanvasTexture(this.canvas);
            configurePS1Texture(this.texture, 1, 1);
        } else {
            this.texture = null;
        }

        this.material = new THREE.MeshBasicMaterial({
            map: this.texture,
            color: 0xffffff,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.38), this.material);
        this.mesh.name = 'NeighborWindowCanvas';

        this.mode = 'dark';
        this._time = 0;
        this._modeTime = 0;
        this._frameAccum = 0;
        this._dirty = true;
        this._redraw();
    }

    setWatcherEyes(visible) {
        if (this.watcherEyes === !!visible) return;
        this.watcherEyes = !!visible;
        this._dirty = true;
        this._redraw();
    }

    setMode(mode) {
        if (this.mode === mode) return;
        this.mode = mode;
        this._modeTime = 0;
        this._frameAccum = 0;
        this._dirty = true;
        this._redraw();
    }

    update(deltaTime) {
        this._time += deltaTime;
        this._modeTime += deltaTime;
        this._frameAccum += deltaTime;

        const interval = this.mode === 'dark' ? 0.25 : 1 / 18;
        if (!this._dirty && this._frameAccum < interval) return;
        this._frameAccum = 0;
        this._dirty = false;
        this._redraw();
    }

    _redraw() {
        if (!this.ctx || !this.texture) return;
        const ctx = this.ctx;
        const W = 256;
        const H = 192;

        if (this.mode === 'dark') {
            this._drawDark(ctx, W, H);
        } else if (this.mode === 'lit_idle') {
            this._drawLitIdle(ctx, W, H);
        } else if (this.mode === 'murder') {
            this._drawMurder(ctx, W, H);
        } else if (this.mode === 'stare') {
            this._drawStare(ctx, W, H);
        } else if (this.mode === 'shattered') {
            this._drawShattered(ctx, W, H);
        }

        this.texture.needsUpdate = true;
    }

    _drawRoomBackdrop(ctx, W, H, lampFlicker = 1.0) {
        const bgGrad = ctx.createRadialGradient(W * 0.5, 28, 12, W * 0.5, H * 0.55, 175);
        const a = Math.max(0.45, Math.min(1.0, lampFlicker));
        bgGrad.addColorStop(0, `rgba(255, 206, 118, ${a})`);
        bgGrad.addColorStop(0.5, `rgba(182, 110, 42, ${0.9 * a})`);
        bgGrad.addColorStop(1, `rgba(68, 34, 16, 0.96)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = 'rgba(40, 20, 10, 0.14)';
        for (let x = 24; x < W - 24; x += 18) {
            ctx.fillRect(x, 0, 2, H);
        }

        ctx.fillStyle = '#201812';
        ctx.fillRect(W * 0.5 - 2, 0, 4, 20);
        ctx.beginPath();
        ctx.moveTo(W * 0.5 - 18, 28);
        ctx.lineTo(W * 0.5 + 18, 28);
        ctx.lineTo(W * 0.5 + 9, 16);
        ctx.lineTo(W * 0.5 - 9, 16);
        ctx.closePath();
        ctx.fillStyle = '#5c3c24';
        ctx.fill();
        ctx.fillStyle = '#fff3b8';
        ctx.beginPath();
        ctx.arc(W * 0.5, 31, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2d1c16';
        ctx.fillRect(0, 0, 22, H);
        ctx.fillRect(W - 22, 0, 22, H);
        ctx.fillStyle = '#1b110d';
        ctx.fillRect(20, 0, 5, H);
        ctx.fillRect(W - 25, 0, 5, H);
    }

    _drawWindowMullions(ctx, W, H) {
        ctx.fillStyle = '#1e1917';
        ctx.fillRect(W * 0.5 - 4, 0, 8, H);
        ctx.fillRect(0, 42, W, 7);
    }

    _drawDark(ctx, W, H) {
        ctx.fillStyle = '#070b12';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0d1422';
        ctx.fillRect(24, 16, W - 48, H - 32);
        ctx.fillStyle = 'rgba(130, 165, 210, 0.08)';
        ctx.beginPath();
        ctx.moveTo(40, 20);
        ctx.lineTo(95, 20);
        ctx.lineTo(52, H - 15);
        ctx.lineTo(26, H - 15);
        ctx.closePath();
        ctx.fill();
        if (this.watcherEyes) {
            ctx.fillStyle = 'rgba(20, 24, 34, 0.9)';
            ctx.beginPath();
            ctx.arc(W * 0.5, 92, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(W * 0.5 - 8, 90, 3.2, 0, Math.PI * 2);
            ctx.arc(W * 0.5 + 8, 90, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
        this._drawWindowMullions(ctx, W, H);
    }

    _drawSantaHat(ctx, headX, headY, facingFront = false, scale = 1.0) {
        ctx.save();
        ctx.translate(headX, headY);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#d4d0c8';
        ctx.fillRect(-16, -6, 32, 8);
        ctx.fillStyle = '#8b1616';
        ctx.beginPath();
        ctx.moveTo(-14, -6);
        ctx.lineTo(14, -6);
        ctx.lineTo(facingFront ? 6 : -10, -28);
        ctx.lineTo(facingFront ? 15 : -16, -22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d4d0c8';
        ctx.beginPath();
        ctx.arc(facingFront ? 16 : -17, -21, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawLitIdle(ctx, W, H) {
        const flicker = 0.94 + Math.sin(this._time * 13) * 0.04;
        this._drawRoomBackdrop(ctx, W, H, flicker);

        // Victim (detailed retro human figure in sweater and trousers)
        const vx = 186;
        const vy = 94 + Math.sin(this._time * 2.0) * 1.5;
        ctx.fillStyle = '#252b38';
        ctx.fillRect(vx - 13, vy + 52, 11, 44);
        ctx.fillRect(vx + 2, vy + 52, 11, 44);
        ctx.fillStyle = '#3b5249';
        ctx.fillRect(vx - 16, vy + 14, 32, 42);
        ctx.fillStyle = '#2f423b';
        ctx.fillRect(vx - 22, vy + 16, 7, 34);
        ctx.fillRect(vx + 15, vy + 16, 7, 34);
        ctx.fillStyle = '#cfa788';
        ctx.beginPath();
        ctx.arc(vx, vy, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#423022';
        ctx.beginPath();
        ctx.arc(vx, vy - 4, 12, Math.PI, Math.PI * 2);
        ctx.fill();

        // Maniac in dirty red Santa coat & beard
        const mx = 78 + Math.sin(this._time * 1.5) * 2;
        const my = 72;
        ctx.fillStyle = '#181a20';
        ctx.fillRect(mx - 16, my + 74, 14, 48);
        ctx.fillRect(mx + 4, my + 74, 14, 48);
        ctx.fillStyle = '#5e1313';
        ctx.fillRect(mx - 22, my + 16, 46, 62);
        ctx.fillStyle = '#b8b2a6';
        ctx.fillRect(mx - 4, my + 16, 8, 62);
        ctx.fillRect(mx - 22, my + 72, 46, 6);
        ctx.fillStyle = '#141416';
        ctx.fillRect(mx - 22, my + 46, 46, 7);
        ctx.fillStyle = '#b59c84';
        ctx.beginPath();
        ctx.arc(mx + 2, my + 2, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b8b2a6';
        ctx.beginPath();
        ctx.moveTo(mx - 10, my + 4);
        ctx.lineTo(mx + 14, my + 4);
        ctx.lineTo(mx + 4, my + 24);
        ctx.closePath();
        ctx.fill();
        this._drawSantaHat(ctx, mx + 2, my - 8, false, 1.0);

        ctx.fillStyle = '#c8d6e5';
        ctx.beginPath();
        ctx.moveTo(mx + 24, my + 48);
        ctx.lineTo(mx + 56, my + 40);
        ctx.lineTo(mx + 26, my + 56);
        ctx.closePath();
        ctx.fill();

        this._drawWindowMullions(ctx, W, H);
    }

    _drawBloodSplatters(ctx, intensity) {
        if (intensity <= 0) return;
        const drops = [
            [170, 92, 18, 42],
            [142, 118, 13, 55],
            [196, 110, 15, 62],
            [118, 132, 9, 36],
            [162, 68, 11, 28],
            [212, 82, 10, 48]
        ];
        for (let i = 0; i < drops.length; i++) {
            const [x, y, r, drip] = drops[i];
            const k = Math.min(1, intensity * 1.3 - i * 0.08);
            if (k <= 0) continue;
            ctx.fillStyle = `rgba(145, 10, 14, ${0.86 * k})`;
            ctx.beginPath();
            ctx.arc(x, y, r * k, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(x - 2, y, 4, drip * k);
        }
    }

    _drawMurder(ctx, W, H) {
        const t = this._modeTime;
        const flicker = 0.85 + Math.sin(this._time * 28) * 0.14;
        this._drawRoomBackdrop(ctx, W, H, flicker);

        const windup = Math.min(1, t / 1.0);
        const stabbing = t >= 1.0;
        const slashCycle = stabbing ? Math.sin((t - 1.0) * 20) : 0;

        const collapse = Math.max(0, Math.min(1, (t - 1.15) / 0.55));
        const vx = 182 + windup * 12;
        const vy = 94 + collapse * 88;
        ctx.fillStyle = '#3b5249';
        ctx.fillRect(vx - 16, vy + 14, 32, 42);
        ctx.fillStyle = '#252b38';
        ctx.fillRect(vx - 14, vy + 54, 28, 42);
        ctx.fillStyle = '#cfa788';
        ctx.beginPath();
        ctx.arc(vx, vy, 12, 0, Math.PI * 2);
        ctx.fill();
        if (collapse < 0.7) {
            ctx.save();
            ctx.translate(vx - 16, vy + 24);
            ctx.rotate(-0.85);
            ctx.fillStyle = '#3b5249';
            ctx.fillRect(-18, -5, 22, 9);
            ctx.restore();
        }

        const mx = 80 + Math.min(1, t / 0.9) * 56;
        const my = 72 + (stabbing ? Math.abs(slashCycle) * 6 : 0);
        ctx.fillStyle = '#5e1313';
        ctx.fillRect(mx - 24, my + 16, 48, 66);
        ctx.fillStyle = '#b8b2a6';
        ctx.fillRect(mx - 4, my + 16, 8, 66);
        ctx.fillStyle = '#181a20';
        ctx.fillRect(mx - 20, my + 80, 40, 46);
        ctx.fillStyle = '#b59c84';
        ctx.beginPath();
        ctx.arc(mx + 4, my + 2, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b8b2a6';
        ctx.beginPath();
        ctx.moveTo(mx - 8, my + 4);
        ctx.lineTo(mx + 16, my + 4);
        ctx.lineTo(mx + 6, my + 22);
        ctx.closePath();
        ctx.fill();
        this._drawSantaHat(ctx, mx + 4, my - 8, false, 1.02);

        let armAngle = -0.3 - windup * 1.95;
        if (stabbing) {
            armAngle = -1.6 + Math.max(0, Math.sin((t - 1.0) * 19)) * 2.05;
        }
        ctx.save();
        ctx.translate(mx + 14, my + 28);
        ctx.rotate(armAngle);
        ctx.fillStyle = '#5e1313';
        ctx.fillRect(0, -6, 36, 12);
        ctx.fillStyle = '#e5eef5';
        ctx.beginPath();
        ctx.moveTo(34, -4);
        ctx.lineTo(74, -2);
        ctx.lineTo(36, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (t > 1.12) {
            const intensity = Math.min(1.0, (t - 1.12) / 0.85);
            this._drawBloodSplatters(ctx, intensity);
        }

        this._drawWindowMullions(ctx, W, H);
    }

    _drawStare(ctx, W, H) {
        const flicker = 0.78 + Math.sin(this._time * 32) * 0.16;
        this._drawRoomBackdrop(ctx, W, H, flicker);
        this._drawBloodSplatters(ctx, 1.0);

        const snap = Math.min(1, this._modeTime / 0.14);
        const cx = THREE.MathUtils.lerp(136, W * 0.5, snap) + (Math.random() - 0.5) * 1.5;
        const cy = 62 + Math.sin(this._time * 18) * 1.2;

        ctx.fillStyle = '#5e1313';
        ctx.beginPath();
        ctx.moveTo(cx - 56, H);
        ctx.lineTo(cx - 46, cy + 32);
        ctx.lineTo(cx + 46, cy + 32);
        ctx.lineTo(cx + 56, H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#b8b2a6';
        ctx.fillRect(cx - 7, cy + 32, 14, H - (cy + 32));

        ctx.fillStyle = '#9c8470';
        ctx.beginPath();
        ctx.arc(cx, cy + 6, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b8b2a6';
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy + 12);
        ctx.lineTo(cx + 20, cy + 12);
        ctx.lineTo(cx, cy + 44);
        ctx.closePath();
        ctx.fill();

        this._drawSantaHat(ctx, cx, cy - 12, true, 1.38);

        ctx.fillStyle = '#cfdbe6';
        ctx.beginPath();
        ctx.moveTo(cx + 42, cy + 36);
        ctx.lineTo(cx + 58, cy - 18);
        ctx.lineTo(cx + 54, cy + 36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a30d0d';
        ctx.fillRect(cx + 48, cy - 10, 6, 20);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.arc(cx - 9, cy + 4, 8, 0, Math.PI * 2);
        ctx.arc(cx + 9, cy + 4, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 9, cy + 4, 3.6, 0, Math.PI * 2);
        ctx.arc(cx + 9, cy + 4, 3.6, 0, Math.PI * 2);
        ctx.fill();

        this._drawWindowMullions(ctx, W, H);
    }

    _drawShattered(ctx, W, H) {
        this._drawRoomBackdrop(ctx, W, H, 0.72);
        this._drawBloodSplatters(ctx, 0.85);

        ctx.fillStyle = 'rgba(6, 7, 11, 0.92)';
        ctx.beginPath();
        ctx.moveTo(46, 36);
        ctx.lineTo(98, 22);
        ctx.lineTo(154, 18);
        ctx.lineTo(212, 40);
        ctx.lineTo(222, 108);
        ctx.lineTo(205, 168);
        ctx.lineTo(132, 178);
        ctx.lineTo(54, 165);
        ctx.lineTo(36, 102);
        ctx.closePath();
        ctx.fill();

        const shards = [
            [[0, 0], [58, 0], [46, 36], [0, 52]],
            [[192, 0], [256, 0], [256, 58], [212, 40]],
            [[0, 140], [54, 165], [38, 192], [0, 192]],
            [[222, 108], [256, 128], [256, 192], [205, 168]],
            [[88, 0], [134, 0], [116, 26]],
            [[110, 192], [164, 192], [132, 170]]
        ];
        ctx.fillStyle = 'rgba(175, 210, 235, 0.34)';
        ctx.strokeStyle = 'rgba(230, 245, 255, 0.75)';
        ctx.lineWidth = 1.5;
        for (const poly of shards) {
            ctx.beginPath();
            ctx.moveTo(poly[0][0], poly[0][1]);
            for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        ctx.fillStyle = '#1e1917';
        ctx.fillRect(W * 0.5 - 4, 0, 8, 26);
        ctx.fillRect(W * 0.5 - 4, H - 24, 8, 24);
        ctx.fillRect(0, 42, 44, 7);
        ctx.fillRect(W - 44, 42, 44, 7);
    }
}

export default CRTTelevision;

