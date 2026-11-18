import * as THREE from 'three';
import { configurePS1Texture } from '../../lumina/index.js';

export class TextureManager {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.cache = new Map();
    }

    loadPhoto(key, filename, repeatX = 1, repeatY = 1) {
        const cacheKey = `${key}_${repeatX}_${repeatY}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const tex = this.loader.load(
            `./assets/textures/${filename}`,
            (loaded) => {
                configurePS1Texture(loaded, repeatX, repeatY);
            },
            undefined,
            () => {
            }
        );
        configurePS1Texture(tex, repeatX, repeatY);
        this.cache.set(cacheKey, tex);
        return tex;
    }

    createClockDialTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
        grad.addColorStop(0, '#dfd6be');
        grad.addColorStop(0.85, '#c2b699');
        grad.addColorStop(1, '#85775d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        for (let i = 0; i < 600; i++) {
            const v = 130 + Math.floor(Math.random() * 60);
            ctx.fillStyle = `rgba(${v},${v - 10},${v - 25},0.16)`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
        }

        ctx.strokeStyle = '#2d2318';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(64, 64, 58, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#1f1912';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 1; i <= 12; i++) {
            const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const x = 64 + Math.cos(ang) * 44;
            const y = 64 + Math.sin(ang) * 44;
            ctx.fillText(String(i), x, y);
        }

        ctx.fillStyle = '#5e2020';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText('СЛАВА', 64, 42);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createWallpaperTexture(tint = '#938b6a') {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, 128, 128);

        ctx.fillStyle = 'rgba(58, 48, 34, 0.24)';
        for (let x = 0; x < 128; x += 16) {
            ctx.fillRect(x, 0, 3, 128);
            ctx.fillRect(x + 8, 0, 1, 128);
        }
        ctx.fillStyle = 'rgba(215, 205, 175, 0.14)';
        for (let y = 0; y < 128; y += 32) {
            for (let x = 8; x < 128; x += 32) {
                ctx.beginPath();
                ctx.moveTo(x, y + 4);
                ctx.lineTo(x + 5, y + 12);
                ctx.lineTo(x, y + 20);
                ctx.lineTo(x - 5, y + 12);
                ctx.closePath();
                ctx.fill();
            }
        }
        for (let i = 0; i < 1200; i++) {
            const dark = Math.random() > 0.5;
            ctx.fillStyle = dark
                ? `rgba(32,26,18,${Math.random() * 0.16})`
                : `rgba(225,215,190,${Math.random() * 0.10})`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createWoodDarkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#472514';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 2) {
            ctx.fillStyle = y % 8 === 0 ? 'rgba(22,9,3,0.38)' : 'rgba(105,56,28,0.22)';
            ctx.fillRect(0, y, 128, 2);
        }
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(20,8,3,0.18)' : 'rgba(130,75,40,0.14)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 6, 1.5);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createBloodClawTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 128, 128);

        ctx.strokeStyle = '#4a0606';
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            ctx.lineWidth = 5 + Math.random() * 3;
            ctx.beginPath();
            ctx.moveTo(22 + i * 20, 16 + Math.random() * 12);
            ctx.lineTo(32 + i * 19, 108 - Math.random() * 14);
            ctx.stroke();
        }
        for (let s = 0; s < 42; s++) {
            ctx.fillStyle = s % 2 === 0 ? 'rgba(88, 8, 8, 0.78)' : 'rgba(48, 3, 3, 0.85)';
            ctx.beginPath();
            ctx.arc(18 + Math.random() * 92, 18 + Math.random() * 92, 1.5 + Math.random() * 6, 0, Math.PI * 2);
            ctx.fill();
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createTableclothTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#d8d0c0';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(138, 36, 36, 0.42)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 128; i += 16) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 128);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(128, i);
            ctx.stroke();
        }
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = `rgba(75, 65, 50, ${Math.random() * 0.14})`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createConcreteTexture(repeatX = 1, repeatY = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#787c82';
        ctx.fillRect(0, 0, 128, 128);

        for (let i = 0; i < 1600; i++) {
            const shade = 88 + Math.floor(Math.random() * 62);
            ctx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 4}, 0.48)`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }

        ctx.fillStyle = 'rgba(42, 45, 50, 0.28)';
        ctx.fillRect(0, 0, 128, 2);
        ctx.fillRect(0, 0, 2, 128);
        ctx.fillRect(0, 63, 128, 2);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, repeatX, repeatY);
    }

    createUpholsteryTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#5a2721';
        ctx.fillRect(0, 0, 128, 128);

        for (let y = 0; y < 128; y += 4) {
            ctx.fillStyle = y % 8 === 0 ? 'rgba(32, 11, 9, 0.36)' : 'rgba(130, 68, 48, 0.24)';
            ctx.fillRect(0, y, 128, 2);
        }
        for (let x = 0; x < 128; x += 4) {
            ctx.fillStyle = 'rgba(42, 16, 12, 0.24)';
            ctx.fillRect(x, 0, 2, 128);
        }
        ctx.fillStyle = 'rgba(168, 124, 82, 0.25)';
        for (let y = 4; y < 128; y += 16) {
            for (let x = 4; x < 128; x += 16) {
                ctx.fillRect(x, y, 3, 3);
                ctx.fillRect(x + 8, y + 8, 3, 3);
            }
        }
        for (let i = 0; i < 800; i++) {
            ctx.fillStyle = `rgba(25, 10, 8, ${Math.random() * 0.18})`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStairwellWallTexture(repeatX = 1, repeatY = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#b5b1a4';
        ctx.fillRect(0, 0, 128, 66);

        ctx.fillStyle = '#253534';
        ctx.fillRect(0, 64, 128, 4);

        ctx.fillStyle = '#3c635c';
        ctx.fillRect(0, 68, 128, 60);

        for (let i = 0; i < 950; i++) {
            const y = Math.random() * 128;
            ctx.fillStyle = y < 64
                ? `rgba(68, 62, 52, ${Math.random() * 0.18})`
                : `rgba(20, 38, 34, ${Math.random() * 0.25})`;
            ctx.fillRect(Math.random() * 128, y, 2 + Math.random() * 2, 2);
        }

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, repeatX, repeatY);
    }

    createMeatPlatterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const bg = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
        bg.addColorStop(0, '#963b36');
        bg.addColorStop(0.65, '#7a2a26');
        bg.addColorStop(1, '#581d1a');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 128, 128);

        // Realistic smoked sausage marbling & grain at 128x128
        for (let i = 0; i < 1400; i++) {
            const x = Math.random() * 128;
            const y = Math.random() * 128;
            const r = Math.random();
            if (r < 0.22) {
                ctx.fillStyle = `rgba(226, 206, 188, ${0.35 + Math.random() * 0.45})`;
                ctx.fillRect(x, y, 2 + Math.random() * 2, 2 + Math.random() * 2);
            } else if (r < 0.6) {
                ctx.fillStyle = `rgba(115, 34, 30, ${0.3 + Math.random() * 0.35})`;
                ctx.fillRect(x, y, 3, 2);
            } else {
                ctx.fillStyle = `rgba(62, 16, 14, ${0.25 + Math.random() * 0.3})`;
                ctx.fillRect(x, y, 2, 2);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createCrystalTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#c4dff0';
        ctx.fillRect(0, 0, 128, 128);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        for (let i = -128; i <= 256; i += 16) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + 128, 128);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(i, 128);
            ctx.lineTo(i + 128, 0);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(0, 4, 128, 4);
        ctx.fillRect(0, 118, 128, 6);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }
}

export default TextureManager;
