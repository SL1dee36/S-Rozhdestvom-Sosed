import * as THREE from 'three';
import { Component } from './Component.js';

export class ParticleEmitter extends Component {
    constructor(gameObject, options = {}) {
        super(gameObject);
        this.mode = options.mode || 'snow';
        this.count = options.count || 300;
        this.bounds = options.bounds || new THREE.Vector3(30, 20, 30);
        this.color = options.color !== undefined ? options.color : 0xffffff;
        this.size = options.size || 0.05;
        this.active = options.active !== undefined ? options.active : true;
        this.speed = options.speed || 1.0;

        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.colors = new Float32Array(this.count * 3);
        this.velocities = new Float32Array(this.count * 3);
        this.lifetimes = new Float32Array(this.count);
        this.maxLife = new Float32Array(this.count);

        this._initParticles();

        let spriteMap = null;
        if (this.mode === 'smoke' || this.mode === 'steam') {
            if (!ParticleEmitter._smokeTex) {
                ParticleEmitter._smokeTex = new THREE.TextureLoader().load('./assets/textures/generated/particle_smoke.svg');
            }
            spriteMap = ParticleEmitter._smokeTex;
        }

        this.material = new THREE.PointsMaterial({
            size: this.size,
            map: spriteMap,
            vertexColors: true,
            transparent: true,
            opacity: options.opacity ?? 0.85,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.gameObject.transform.add(this.points);
    }

    _initParticles() {
        const baseColor = new THREE.Color(this.color);
        for (let i = 0; i < this.count; i++) {
            this._resetParticle(i, true);
            this.colors[i * 3] = baseColor.r;
            this.colors[i * 3 + 1] = baseColor.g;
            this.colors[i * 3 + 2] = baseColor.b;
        }
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    }

    _resetParticle(i, randomAge = false) {
        const i3 = i * 3;
        if (this.mode === 'snow') {
            this.positions[i3] = (Math.random() - 0.5) * this.bounds.x;
            this.positions[i3 + 1] = randomAge ? Math.random() * this.bounds.y : this.bounds.y;
            this.positions[i3 + 2] = (Math.random() - 0.5) * this.bounds.z;
            this.velocities[i3] = (Math.random() - 0.5) * 0.9;
            this.velocities[i3 + 1] = -(1.8 + Math.random() * 1.4) * this.speed;
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.9;
            this.lifetimes[i] = 1.0;
            this.maxLife[i] = 1.0;
        } else if (this.mode === 'steam' || this.mode === 'smoke') {
            const spread = this.mode === 'steam' ? 0.25 : 0.04;
            this.positions[i3] = (Math.random() - 0.5) * spread;
            this.positions[i3 + 1] = 0;
            this.positions[i3 + 2] = (Math.random() - 0.5) * spread;
            this.velocities[i3] = (Math.random() - 0.5) * 0.28;
            this.velocities[i3 + 1] = (this.mode === 'steam' ? 0.7 : 0.38) + Math.random() * 0.35;
            this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.28;
            const life = (this.mode === 'steam' ? 1.4 : 2.2) + Math.random() * 0.8;
            this.maxLife[i] = life;
            this.lifetimes[i] = randomAge ? Math.random() * life : life;
        } else if (this.mode === 'fireworks') {
            this.positions[i3] = 0;
            this.positions[i3 + 1] = -999;
            this.positions[i3 + 2] = 0;
            this.lifetimes[i] = 0;
            this.maxLife[i] = 1;
        }
    }

    burstFirework(origin, paletteColor) {
        const col = new THREE.Color(paletteColor || 0xff4455);
        let spawned = 0;
        for (let i = 0; i < this.count && spawned < 65; i++) {
            if (this.lifetimes[i] <= 0) {
                const i3 = i * 3;
                this.positions[i3] = origin.x;
                this.positions[i3 + 1] = origin.y;
                this.positions[i3 + 2] = origin.z;

                const theta = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const spd = 4.5 + Math.random() * 5.5;
                this.velocities[i3] = Math.sin(phi) * Math.cos(theta) * spd;
                this.velocities[i3 + 1] = Math.cos(phi) * spd + 1.5;
                this.velocities[i3 + 2] = Math.sin(phi) * Math.sin(theta) * spd;

                this.colors[i3] = Math.min(1, col.r + Math.random() * 0.25);
                this.colors[i3 + 1] = Math.min(1, col.g + Math.random() * 0.25);
                this.colors[i3 + 2] = Math.min(1, col.b + Math.random() * 0.25);

                const life = 1.4 + Math.random() * 0.9;
                this.maxLife[i] = life;
                this.lifetimes[i] = life;
                spawned++;
            }
        }
        this.geometry.attributes.color.needsUpdate = true;
    }

    setActive(val) {
        this.active = val;
        this.points.visible = val || this.mode === 'steam' || this.mode === 'smoke';
    }

    update(deltaTime) {
        this.points.visible = (this.active || this.mode === 'fireworks') && (this.gameObject?.transform?.visible !== false);
        if (!this.points.visible) return;
        if (this.mode === 'fireworks') {
            let anyAlive = false;
            for (let i = 0; i < this.count; i++) {
                if (this.lifetimes[i] > 0) { anyAlive = true; break; }
            }
            if (!anyAlive) return;
        }

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;
            if (this.mode === 'snow') {
                this.positions[i3] += (this.velocities[i3] + Math.sin(performance.now() * 0.001 + i) * 0.35) * deltaTime;
                this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
                this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;
                if (this.positions[i3 + 1] < 0) {
                    this._resetParticle(i, false);
                }
            } else if (this.mode === 'steam' || this.mode === 'smoke') {
                if (!this.active) {
                    this.positions[i3 + 1] = -999;
                    continue;
                }
                this.lifetimes[i] -= deltaTime;
                if (this.lifetimes[i] <= 0) {
                    this._resetParticle(i, false);
                } else {
                    this.positions[i3] += this.velocities[i3] * deltaTime;
                    this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
                    this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;
                }
            } else if (this.mode === 'fireworks') {
                if (this.lifetimes[i] > 0) {
                    this.lifetimes[i] -= deltaTime;
                    this.velocities[i3 + 1] -= 4.8 * deltaTime;
                    this.velocities[i3] *= 0.985;
                    this.velocities[i3 + 2] *= 0.985;
                    this.positions[i3] += this.velocities[i3] * deltaTime;
                    this.positions[i3 + 1] += this.velocities[i3 + 1] * deltaTime;
                    this.positions[i3 + 2] += this.velocities[i3 + 2] * deltaTime;
                    if (this.lifetimes[i] <= 0) {
                        this.positions[i3 + 1] = -999;
                    }
                }
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
    }
}

export default ParticleEmitter;

