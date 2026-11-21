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

    createMirrorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Silver-blue reflective mirror gradient
        const grad = ctx.createLinearGradient(0, 0, 128, 128);
        grad.addColorStop(0.0, '#72899e');
        grad.addColorStop(0.28, '#a6bccf');
        grad.addColorStop(0.48, '#dce9f5');
        grad.addColorStop(0.68, '#95aec4');
        grad.addColorStop(1.0, '#5e7387');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        // Diagonal specular reflection streaks
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(42, 0);
        ctx.lineTo(0, 56);
        ctx.lineTo(0, 26);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.48)';
        ctx.beginPath();
        ctx.moveTo(78, 0);
        ctx.lineTo(106, 0);
        ctx.lineTo(18, 128);
        ctx.lineTo(0, 128);
        ctx.lineTo(0, 114);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.beginPath();
        ctx.moveTo(118, 0);
        ctx.lineTo(128, 0);
        ctx.lineTo(128, 16);
        ctx.lineTo(50, 128);
        ctx.lineTo(36, 128);
        ctx.closePath();
        ctx.fill();

        // Subtle inner bevel border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 3;
        ctx.strokeRect(3, 3, 122, 122);
        ctx.strokeStyle = 'rgba(35, 48, 62, 0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(6, 6, 116, 116);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createWineLabelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Dark green bottle glass base around the label
        ctx.fillStyle = '#14331b';
        ctx.fillRect(0, 0, 128, 128);

        // Vintage cream-and-gold wrap-around wine label
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(10, 14, 108, 100);
        ctx.fillStyle = '#f2ead7';
        ctx.fillRect(14, 18, 100, 92);

        // Inner crimson & gold border
        ctx.strokeStyle = '#7a1c1c';
        ctx.lineWidth = 2;
        ctx.strokeRect(18, 22, 92, 84);

        // Crest / emblem at top of label
        ctx.fillStyle = '#8b1e1e';
        ctx.beginPath();
        ctx.arc(64, 42, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e5c158';
        ctx.beginPath();
        ctx.arc(64, 42, 6, 0, Math.PI * 2);
        ctx.fill();

        // Decorative title bars
        ctx.fillStyle = '#221a16';
        ctx.fillRect(26, 60, 76, 7);
        ctx.fillStyle = '#7a1c1c';
        ctx.fillRect(34, 72, 60, 5);
        ctx.fillStyle = '#5c4d3c';
        ctx.fillRect(30, 83, 68, 3);
        ctx.fillRect(40, 90, 48, 3);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreFloorTileTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Classic Soviet terrazzo / checkered shop floor tiles
        const tile = 64;
        for (let ty = 0; ty < 2; ty++) {
            for (let tx = 0; tx < 2; tx++) {
                const isAlt = (tx + ty) % 2 === 1;
                ctx.fillStyle = isAlt ? '#9ca69a' : '#c9c5b4';
                ctx.fillRect(tx * tile, ty * tile, tile, tile);

                // Subtle terrazzo speckles
                for (let s = 0; s < 55; s++) {
                    const sx = tx * tile + 3 + Math.random() * (tile - 6);
                    const sy = ty * tile + 3 + Math.random() * (tile - 6);
                    ctx.fillStyle = s % 3 === 0 ? 'rgba(55,62,56,0.28)' : 'rgba(242,238,225,0.28)';
                    ctx.fillRect(sx, sy, 2, 2);
                }

                // Scuff & wear near edges
                ctx.strokeStyle = 'rgba(52, 54, 48, 0.55)';
                ctx.lineWidth = 2;
                ctx.strokeRect(tx * tile + 1, ty * tile + 1, tile - 2, tile - 2);
            }
        }

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreWallLowerTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Soviet oil-painted mint-green shop lower wall with dark trim & scuffs
        ctx.fillStyle = '#7ea18e';
        ctx.fillRect(0, 0, 128, 128);

        // Top border stripe (отбойник)
        ctx.fillStyle = '#4c6658';
        ctx.fillRect(0, 0, 128, 8);
        ctx.fillStyle = '#a9c2b2';
        ctx.fillRect(0, 8, 128, 3);

        // Subtle roller paint texture & wear
        for (let i = 0; i < 1100; i++) {
            const dark = i % 2 === 0;
            ctx.fillStyle = dark ? 'rgba(32, 50, 40, 0.10)' : 'rgba(215, 232, 220, 0.09)';
            ctx.fillRect(Math.random() * 128, 11 + Math.random() * 117, 2 + Math.random() * 3, 2);
        }
        // Bottom baseboard grime
        const grad = ctx.createLinearGradient(0, 100, 0, 128);
        grad.addColorStop(0, 'rgba(35, 42, 36, 0)');
        grad.addColorStop(1, 'rgba(35, 42, 36, 0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 100, 128, 28);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreWallUpperTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Warm off-white / cream whitewash plaster
        ctx.fillStyle = '#d9d3be';
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 1000; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(130, 120, 96, 0.11)' : 'rgba(250, 248, 236, 0.14)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreCeilingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Acoustic / panelled shop ceiling tiles
        ctx.fillStyle = '#d4d1c4';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(92, 90, 82, 0.45)';
        ctx.lineWidth = 2;
        for (let x = 0; x <= 128; x += 32) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke();
        }
        for (let y = 0; y <= 128; y += 32) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
        }
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = 'rgba(80, 76, 66, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Warm Soviet varnished veneer / chipboard for shelves & counter
        ctx.fillStyle = '#8a623c';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 2) {
            ctx.fillStyle = y % 6 === 0 ? 'rgba(56, 34, 16, 0.30)' : 'rgba(176, 130, 82, 0.18)';
            ctx.fillRect(0, y, 128, 2);
        }
        for (let i = 0; i < 700; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(42, 24, 10, 0.16)' : 'rgba(205, 164, 114, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 8, 1.5);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreEnamelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Off-white / pale-blue fridge & counter enamel with subtle edge seams
        ctx.fillStyle = '#cfd8da';
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(95, 110, 115, 0.08)' : 'rgba(255, 255, 255, 0.14)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        ctx.strokeStyle = 'rgba(72, 84, 90, 0.32)';
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, 124, 124);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreSignTexture(text = 'ПРОДУКТЫ 24') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Weathered crimson retro enamel sign
        const grad = ctx.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#961e1e');
        grad.addColorStop(0.5, '#7c1616');
        grad.addColorStop(1, '#5c1010');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 128);

        // Subtle weathering & corner rust
        for (let i = 0; i < 450; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 8, 5, 0.18)' : 'rgba(255, 220, 175, 0.08)';
            ctx.fillRect(Math.random() * 512, Math.random() * 128, 3, 2);
        }
        ctx.strokeStyle = '#f2d072';
        ctx.lineWidth = 6;
        ctx.strokeRect(9, 9, 494, 110);
        ctx.strokeStyle = '#3b0909';
        ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 480, 96);

        ctx.fillStyle = '#330808';
        ctx.font = 'bold 54px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 259, 69);

        ctx.fillStyle = '#fff0b8';
        ctx.fillText(text, 256, 66);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createPeasLabelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2d6b34';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#ece6c8';
        ctx.fillRect(0, 22, 128, 84);
        ctx.fillStyle = '#265c2c';
        ctx.fillRect(0, 26, 128, 8);
        ctx.fillRect(0, 94, 128, 8);

        // Little green peas illustration
        ctx.fillStyle = '#53a649';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(32 + i * 16, 76 + (i % 2) * 4, 6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#1b401e';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ГОРОШЕК', 64, 54);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createMayoLabelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#f4efd6';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#24528a';
        ctx.fillRect(0, 24, 128, 80);
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(8, 32, 112, 64);

        ctx.fillStyle = '#1b3861';
        ctx.font = 'bold 15px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('МАЙОНЕЗ', 64, 58);
        ctx.font = 'bold 12px monospace';
        ctx.fillText('ПРОВАНСАЛЬ', 64, 78);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createCuttingBoardTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Light birch/oak cutting board with wood grain & knife score marks
        ctx.fillStyle = '#c49b6c';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 2) {
            ctx.fillStyle = y % 6 === 0 ? 'rgba(130, 88, 46, 0.25)' : 'rgba(222, 190, 148, 0.20)';
            ctx.fillRect(0, y, 128, 2);
        }
        // Knife cut marks in center
        ctx.strokeStyle = 'rgba(92, 60, 32, 0.38)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 28; i++) {
            const x = 24 + Math.random() * 80;
            const y = 24 + Math.random() * 80;
            ctx.beginPath();
            ctx.moveTo(x - 10, y - 3 + Math.random() * 6);
            ctx.lineTo(x + 10, y - 3 + Math.random() * 6);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(105, 70, 38, 0.45)';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 124, 124);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createGroceryBagTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ded4c2';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#b82e24';
        ctx.fillRect(0, 34, 128, 22);
        ctx.fillStyle = '#2c4d75';
        ctx.fillRect(0, 58, 128, 6);

        ctx.fillStyle = '#fff5dc';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ПРОДУКТЫ', 64, 50);

        for (let i = 0; i < 350; i++) {
            ctx.fillStyle = 'rgba(90, 80, 65, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createScalesDialTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#e8e2cc';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#2a3338';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(64, 68, 52, Math.PI, 0);
        ctx.stroke();

        // Scale ticks
        ctx.lineWidth = 2;
        for (let i = 0; i <= 10; i++) {
            const ang = Math.PI + (i / 10) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(64 + Math.cos(ang) * 40, 68 + Math.sin(ang) * 40);
            ctx.lineTo(64 + Math.cos(ang) * 50, 68 + Math.sin(ang) * 50);
            ctx.stroke();
        }
        // Red needle
        ctx.strokeStyle = '#c22323';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(64, 68);
        ctx.lineTo(64, 24);
        ctx.stroke();

        ctx.fillStyle = '#263038';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ТЮМЕНЬ', 64, 96);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createRegisterDisplayTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111c16';
        ctx.fillRect(0, 0, 128, 64);
        ctx.strokeStyle = '#3c4a42';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 60);
        ctx.fillStyle = '#4cff8a';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('0.00', 64, 34);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreTileBacksplashTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Classic Soviet white & pale-blue ceramic wall tiles for gastronomy counter
        const sz = 32;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const blue = (x + y) % 4 === 0;
                ctx.fillStyle = blue ? '#b6d0d8' : '#e0e4de';
                ctx.fillRect(x * sz, y * sz, sz, sz);
                ctx.fillStyle = 'rgba(255,255,255,0.22)';
                ctx.fillRect(x * sz + 2, y * sz + 2, sz - 6, 4);
                ctx.strokeStyle = '#6f7978';
                ctx.lineWidth = 2;
                ctx.strokeRect(x * sz + 1, y * sz + 1, sz - 2, sz - 2);
            }
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreDeptSignTexture(text, bg = '#274c6b', fg = '#f7ebd0') {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = fg;
        ctx.lineWidth = 4;
        ctx.strokeRect(5, 5, 246, 54);
        ctx.fillStyle = fg;
        ctx.font = 'bold 28px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 34);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createCondensedMilkLabelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e8eef5';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#1e5aa8';
        ctx.fillRect(0, 14, 128, 16);
        ctx.fillRect(0, 98, 128, 16);
        ctx.fillStyle = '#6fa3dc';
        ctx.fillRect(0, 34, 128, 8);
        ctx.fillRect(0, 86, 128, 8);
        ctx.fillStyle = '#153d75';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('СГУЩЁНКА', 64, 66);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createTeaBoxTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#d9a42b';
        ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#8c2218';
        ctx.lineWidth = 6;
        ctx.strokeRect(8, 8, 112, 112);
        ctx.fillStyle = '#8c2218';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ЧАЙ', 64, 54);
        ctx.fillStyle = '#2e2216';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('ИНДИЙСКИЙ', 64, 82);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createMilkCartonTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#eef2f5';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#2b6cb0';
        ctx.fillRect(0, 0, 128, 28);
        ctx.fillRect(0, 96, 128, 32);
        ctx.fillStyle = '#2b6cb0';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('МОЛОКО', 64, 68);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createInteriorDoorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Classic Soviet painted wooden panel door (off-white / warm beige with recessed panels)
        ctx.fillStyle = '#c8c2b2';
        ctx.fillRect(0, 0, 128, 256);

        // Subtle brush grain & aging
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(95, 86, 70, 0.10)' : 'rgba(245, 240, 228, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 256, 2, 6);
        }

        // Outer frame bevel
        ctx.strokeStyle = 'rgba(72, 64, 52, 0.55)';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 252);

        // Upper recessed panel
        ctx.fillStyle = '#bab3a2';
        ctx.fillRect(18, 20, 92, 102);
        ctx.strokeStyle = '#736a5a';
        ctx.lineWidth = 3;
        ctx.strokeRect(18, 20, 92, 102);
        ctx.strokeStyle = '#dfd9c8';
        ctx.lineWidth = 2;
        ctx.strokeRect(21, 23, 86, 96);

        // Lower recessed panel
        ctx.fillStyle = '#bab3a2';
        ctx.fillRect(18, 142, 92, 92);
        ctx.strokeStyle = '#736a5a';
        ctx.lineWidth = 3;
        ctx.strokeRect(18, 142, 92, 92);
        ctx.strokeStyle = '#dfd9c8';
        ctx.lineWidth = 2;
        ctx.strokeRect(21, 145, 86, 86);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoreDoorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#364654';
        ctx.fillRect(0, 0, 128, 256);
        for (let i = 0; i < 650; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(20, 28, 35, 0.16)' : 'rgba(130, 152, 170, 0.10)';
            ctx.fillRect(Math.random() * 128, Math.random() * 256, 3, 4);
        }
        ctx.strokeStyle = '#1e2730';
        ctx.lineWidth = 5;
        ctx.strokeRect(3, 3, 122, 250);
        // Kick plate at bottom
        ctx.fillStyle = '#5c6670';
        ctx.fillRect(6, 212, 116, 38);
        // Little sign plate
        ctx.fillStyle = '#e8dfc4';
        ctx.fillRect(30, 152, 68, 20);
        ctx.fillStyle = '#222830';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ВЫХОД', 64, 166);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createCardboardBoxTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Corrugated brown cardboard
        ctx.fillStyle = '#9c7548';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 3) {
            ctx.fillStyle = y % 6 === 0 ? 'rgba(84, 56, 28, 0.22)' : 'rgba(195, 162, 118, 0.14)';
            ctx.fillRect(0, y, 128, 2);
        }
        for (let i = 0; i < 650; i++) {
            ctx.fillStyle = 'rgba(65, 42, 18, 0.14)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 2);
        }
        // Packing tape strip across top edge
        ctx.fillStyle = 'rgba(215, 195, 148, 0.52)';
        ctx.fillRect(0, 0, 128, 18);
        // Stencil stamp
        ctx.strokeStyle = 'rgba(42, 28, 16, 0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, 120, 120);
        ctx.fillStyle = 'rgba(42, 28, 16, 0.62)';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ИГРУШКИ', 64, 68);
        ctx.font = 'bold 10px monospace';
        ctx.fillText('ХРУПКОЕ', 64, 86);

        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createStoveEnamelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Warm aged gas-stove enamel with subtle soot patina and trim seams
        ctx.fillStyle = '#c4c2b8';
        ctx.fillRect(0, 0, 128, 128);
        const grad = ctx.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, 'rgba(70, 62, 52, 0.22)');
        grad.addColorStop(0.25, 'rgba(70, 62, 52, 0.0)');
        grad.addColorStop(1, 'rgba(48, 44, 38, 0.16)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 650; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(68, 62, 54, 0.11)' : 'rgba(248, 244, 232, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        ctx.strokeStyle = 'rgba(74, 70, 64, 0.45)';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 124, 124);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createFridgeEnamelTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Glossy cool-white Soviet ZIL refrigerator enamel with vertical sheen & gasket edge
        const grad = ctx.createLinearGradient(0, 0, 128, 0);
        grad.addColorStop(0, '#cfd8d6');
        grad.addColorStop(0.35, '#e8f0ee');
        grad.addColorStop(0.7, '#d5dfdd');
        grad.addColorStop(1, '#bfc9c7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 320; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(120, 138, 136, 0.08)' : 'rgba(255, 255, 255, 0.18)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 3);
        }
        ctx.strokeStyle = 'rgba(95, 108, 108, 0.35)';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 124);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createCeramicSinkTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Cool glossy porcelain / ceramic for bathroom sink & toilet
        const grad = ctx.createRadialGradient(54, 48, 8, 64, 64, 84);
        grad.addColorStop(0, '#f5f8fa');
        grad.addColorStop(0.65, '#dce5ea');
        grad.addColorStop(1, '#bcc7cf');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 240; i++) {
            ctx.fillStyle = 'rgba(130, 150, 165, 0.09)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createKitchenCabinetTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Soviet pale olive-cream painted wooden kitchen cabinet with double door seam
        ctx.fillStyle = '#c8c4a8';
        ctx.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 550; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(90, 84, 62, 0.10)' : 'rgba(242, 238, 214, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 5);
        }
        ctx.strokeStyle = '#6c664e';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, 120, 120);
        // Center cabinet doors split
        ctx.beginPath();
        ctx.moveTo(64, 6);
        ctx.lineTo(64, 122);
        ctx.stroke();
        // Little handles
        ctx.fillStyle = '#4a463a';
        ctx.fillRect(54, 46, 5, 22);
        ctx.fillRect(69, 46, 5, 22);
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createPaintedDoorWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        // Clean painted wood grain (without recessed panels) for glazed kitchen/hall doors
        ctx.fillStyle = '#c7c1b0';
        ctx.fillRect(0, 0, 128, 128);
        for (let x = 0; x < 128; x += 2) {
            ctx.fillStyle = x % 6 === 0 ? 'rgba(98, 90, 74, 0.12)' : 'rgba(242, 238, 224, 0.10)';
            ctx.fillRect(x, 0, 2, 128);
        }
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'rgba(85, 78, 64, 0.10)' : 'rgba(246, 242, 230, 0.12)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 7);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }

    createMetalBrushedTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#737980';
        ctx.fillRect(0, 0, 128, 128);
        for (let y = 0; y < 128; y += 2) {
            ctx.fillStyle = y % 4 === 0 ? 'rgba(35, 40, 46, 0.20)' : 'rgba(210, 218, 226, 0.16)';
            ctx.fillRect(0, y, 128, 1.5);
        }
        for (let i = 0; i < 400; i++) {
            ctx.fillStyle = 'rgba(235, 240, 245, 0.14)';
            ctx.fillRect(Math.random() * 128, Math.random() * 128, 10, 1);
        }
        const tex = new THREE.CanvasTexture(canvas);
        return configurePS1Texture(tex, 1, 1);
    }
}

export default TextureManager;
