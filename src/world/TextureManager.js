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

        ctx.fillStyle = '#d7cfb8';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#33281b';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(64, 64, 58, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#1f1912';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 1; i <= 12; i++) {
            const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
            const x = 64 + Math.cos(ang) * 44;
            const y = 64 + Math.sin(ang) * 44;
            ctx.fillText(String(i), x, y);
        }

        ctx.fillStyle = '#6b2222';
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

        ctx.fillStyle = 'rgba(70, 58, 40, 0.22)';
        for (let x = 0; x < 128; x += 16) {
            ctx.fillRect(x, 0, 4, 128);
        }
        ctx.fillStyle = 'rgba(220, 210, 175, 0.16)';
        for (let y = 0; y < 128; y += 32) {
            for (let x = 8; x < 128; x += 32) {
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + 6, y + 10);
                ctx.lineTo(x, y + 20);
                ctx.lineTo(x - 6, y + 10);
                ctx.closePath();
                ctx.fill();
            }
        }
        for (let i = 0; i < 450; i++) {
            ctx.fillStyle = `rgba(40,32,20,${Math.random() * 0.12})`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 4, 2);
    }

    createWoodDarkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4a2614';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 2) {
            ctx.fillStyle = y % 6 === 0 ? 'rgba(24,10,4,0.35)' : 'rgba(110,60,30,0.2)';
            ctx.fillRect(0, y, 128, 2);
        }
        const grad = ctx.createLinearGradient(0, 0, 128, 128);
        grad.addColorStop(0, 'rgba(255,230,200,0.08)');
        grad.addColorStop(0.5, 'rgba(255,230,200,0)');
        grad.addColorStop(1, 'rgba(255,230,200,0.1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createBloodClawTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 128, 128);

        ctx.strokeStyle = '#4d0808';
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
            ctx.lineWidth = 5 + Math.random() * 3;
            ctx.beginPath();
            ctx.moveTo(22 + i * 20, 16 + Math.random() * 12);
            ctx.lineTo(32 + i * 19, 108 - Math.random() * 14);
            ctx.stroke();
        }
        for (let s = 0; s < 32; s++) {
            ctx.fillStyle = s % 2 === 0 ? 'rgba(95, 10, 10, 0.75)' : 'rgba(55, 4, 4, 0.8)';
            ctx.beginPath();
            ctx.arc(20 + Math.random() * 88, 20 + Math.random() * 88, 2 + Math.random() * 7, 0, Math.PI * 2);
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
        ctx.fillStyle = '#ddd7c9';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#9e2a2b';
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, 116, 116);
        ctx.strokeStyle = 'rgba(158, 42, 43, 0.35)';
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
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 2, 2);
    }

    createConcreteTexture(repeatX = 2, repeatY = 2) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#7b7f84';
        ctx.fillRect(0, 0, 128, 128);

        for (let i = 0; i < 1400; i++) {
            const shade = 95 + Math.floor(Math.random() * 55);
            ctx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 4}, 0.45)`;
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }

        ctx.fillStyle = 'rgba(42, 45, 50, 0.35)';
        ctx.fillRect(0, 0, 128, 3);
        ctx.fillRect(0, 0, 3, 128);
        ctx.fillRect(0, 63, 128, 2);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, repeatX, repeatY);
    }

    createUpholsteryTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#5e2923';
        ctx.fillRect(0, 0, 64, 64);

        for (let y = 0; y < 64; y += 4) {
            ctx.fillStyle = y % 8 === 0 ? 'rgba(35, 12, 10, 0.35)' : 'rgba(135, 72, 52, 0.25)';
            ctx.fillRect(0, y, 64, 2);
        }
        for (let x = 0; x < 64; x += 4) {
            ctx.fillStyle = 'rgba(45, 18, 14, 0.22)';
            ctx.fillRect(x, 0, 2, 64);
        }
        ctx.fillStyle = 'rgba(175, 130, 88, 0.28)';
        for (let y = 4; y < 64; y += 16) {
            for (let x = 4; x < 64; x += 16) {
                ctx.fillRect(x, y, 3, 3);
                ctx.fillRect(x + 8, y + 8, 3, 3);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 3, 3);
    }

    createStairwellWallTexture(repeatX = 2, repeatY = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#b9b6aa';
        ctx.fillRect(0, 0, 128, 66);

        ctx.fillStyle = '#253636';
        ctx.fillRect(0, 64, 128, 4);

        ctx.fillStyle = '#3f6962';
        ctx.fillRect(0, 68, 128, 60);

        for (let i = 0; i < 650; i++) {
            const y = Math.random() * 128;
            ctx.fillStyle = y < 64
                ? `rgba(70, 65, 55, ${Math.random() * 0.16})`
                : `rgba(22, 42, 38, ${Math.random() * 0.22})`;
            ctx.fillRect(Math.random() * 128, y, 2 + Math.random() * 2, 2);
        }
        ctx.fillStyle = 'rgba(205, 200, 185, 0.28)';
        ctx.fillRect(22, 78, 8, 5);
        ctx.fillRect(88, 96, 12, 4);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, repeatX, repeatY);
    }

    createMeatPlatterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#e7e2d5';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#4c6d92';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(64, 64, 58, 0, Math.PI * 2);
        ctx.stroke();

        const slices = [
            { x: 46, y: 50, r: 22, c: '#a23834', rim: '#7b2623', fat: true },
            { x: 76, y: 46, r: 21, c: '#bd574c', rim: '#8b352d', fat: false },
            { x: 42, y: 78, r: 20, c: '#b2483f', rim: '#7f2c27', fat: true },
            { x: 74, y: 78, r: 22, c: '#9b312f', rim: '#6c1f1e', fat: true },
            { x: 60, y: 62, r: 19, c: '#c96b5c', rim: '#96433a', fat: false }
        ];
        for (const s of slices) {
            ctx.fillStyle = s.rim;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = s.c;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r - 2.5, 0, Math.PI * 2);
            ctx.fill();
            if (s.fat) {
                ctx.fillStyle = '#e8d7c6';
                for (let k = 0; k < 10; k++) {
                    const a = k * 1.9 + s.x;
                    const rr = (k % 3 + 1) * 4.5;
                    ctx.fillRect(s.x + Math.cos(a) * rr - 1, s.y + Math.sin(a) * rr - 1, 2.5, 2);
                }
            }
        }

        ctx.strokeStyle = '#3b7332';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const x = 90 + (i % 3) * 4;
            const y = 52 + Math.floor(i / 3) * 6;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 7, y - 5);
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createCrystalTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#c8e4f6';
        ctx.fillRect(0, 0, 128, 128);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
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

        ctx.strokeStyle = 'rgba(92, 138, 174, 0.55)';
        ctx.lineWidth = 1;
        for (let i = -128; i <= 256; i += 16) {
            ctx.beginPath();
            ctx.moveTo(i + 3, 0);
            ctx.lineTo(i + 131, 128);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillRect(0, 4, 128, 4);
        ctx.fillRect(0, 118, 128, 6);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }
}

export default TextureManager;

