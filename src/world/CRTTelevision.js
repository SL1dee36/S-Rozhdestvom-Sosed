import * as THREE from 'three';
import { configurePS1Texture } from '../../lumina/index.js';

export class CRTTelevision {
    constructor(tvLight) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 192;
        this.ctx = this.canvas.getContext('2d');

        this.texture = new THREE.CanvasTexture(this.canvas);
        configurePS1Texture(this.texture, 1, 1);

        this.tvLight = tvLight;
        this.mode = 'ogonyok';
        this.cracked = false;
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
        const sway = Math.sin(t * 3.1) * 4;
        // Singer in retro suit instead of black silhouette
        ctx.fillStyle = '#1e2436';
        ctx.fillRect(116 + sway, 118, 10, 24);
        ctx.fillRect(130 + sway, 118, 10, 24);
        ctx.fillStyle = '#283147';
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
        ctx.fillStyle = '#d9b396';
        ctx.beginPath();
        ctx.arc(128 + sway, 72, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3b281c';
        ctx.beginPath();
        ctx.arc(128 + sway, 66, 12, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#241a14';
        ctx.fillRect(123 + sway, 70, 2, 2);
        ctx.fillRect(131 + sway, 70, 2, 2);
        ctx.fillStyle = '#c8c8d8';
        ctx.fillRect(138, 78, 2, 52);
        ctx.fillStyle = '#8890a0';
        ctx.beginPath();
        ctx.arc(139, 76, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('1 КАНАЛ', 10, 16);

        ctx.fillStyle = 'rgba(130, 15, 25, 0.85)';
        ctx.fillRect(0, 166, W, 26);
        ctx.fillStyle = '#ffe999';
        ctx.font = 'bold 11px monospace';
        const tickerX = 256 - ((t * 48) % 520);
        ctx.fillText('★ ГОЛУБОЙ ОГОНЁК ★ С НАСТУПАЮЩИМ НОВЫМ ГОДОМ! ★', tickerX, 183);

        if (this.tvLight) {
            const r = hueShift > 0 ? 0.45 : 0.72;
            const g = hueShift > 0 ? 0.65 : 0.42;
            const b = hueShift > 0 ? 1.0 : 0.68;
            this.tvLight.color.setRGB(r, g, b);
            this.tvLight.intensity = 1.65 + Math.sin(t * 14) * 0.22;
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
        ctx.fillText('! ЭКСТРЕННЫЙ ВЫПУСК !', 12, 16);

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
        ctx.fillText('УЛ. ЛЕНИНА, 14 И СОСЕДНИЙ ДОМ —', 8, 173);
        ctx.fillStyle = '#f2f2f2';
        ctx.fillText('НАЙДЕНЫ ТЕЛА. МАНЬЯК В КОЛПАКЕ.', 8, 186);

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
        ctx.fillText('00:00 — С НОВЫМ ГОДОМ', 48, 178);

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
            color: 0xffffff
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

