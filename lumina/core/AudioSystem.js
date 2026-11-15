import * as THREE from 'three';

export class AudioSystem {
    constructor(camera) {
        this.camera = camera;
        this.ctx = null;
        this.masterGain = null;
        this.buffers = new Map();
        this.activeLoops = new Map();

        this.micEnabled = true;
        this.micStream = null;
        this.micAnalyser = null;
        this.micData = null;
        this.micPermissionState = 'unknown';
        this.micSensitivity = 1.4;
        this.noiseThreshold = 0.38;

        this.currentNoiseLevel = 0;
        this.virtualNoise = 0;
        this.oxygen = 1.0;
        this.isHoldingBreath = false;
        this._gaspCooldown = 0;

        this._tempPos = new THREE.Vector3();
        this._tempDir = new THREE.Vector3();
        this._tempUp = new THREE.Vector3(0, 1, 0);
        this._occlusionMeshes = [];
        this._raycaster = new THREE.Raycaster();
        this._noiseBuffer = null;
    }

    initContext() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return this.ctx;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.85;
        this.masterGain.connect(this.ctx.destination);

        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * 2;
        this._noiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = this._noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + white * 0.0990460;
            b1 = 0.96300 * b1 + white * 0.2965164;
            b2 = 0.57000 * b2 + white * 1.0526913;
            data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
        }
        return this.ctx;
    }

    setMasterVolume(vol) {
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime, 0.05);
        }
    }

    setOcclusionMeshes(meshes) {
        this._occlusionMeshes = meshes || [];
    }

    async loadAudioAssets(manifest) {
        this.initContext();
        const entries = Object.entries(manifest);
        await Promise.all(entries.map(async ([key, url]) => {
            try {
                const res = await fetch(url);
                if (!res.ok) return;
                const arrayBuffer = await res.arrayBuffer();
                const decoded = await this.ctx.decodeAudioData(arrayBuffer);
                this.buffers.set(key, decoded);
            } catch (e) {
            }
        }));
    }

    async enableMicrophone() {
        this.initContext();
        if (this.ctx?.state === 'suspended') {
            try { await this.ctx.resume(); } catch (_) {}
        }
        if (this.micAnalyser) {
            this.micEnabled = true;
            return true;
        }
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            this.micPermissionState = 'denied';
            this.micEnabled = false;
            return false;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            });
            this.micStream = stream;
            const source = this.ctx.createMediaStreamSource(stream);
            this.micAnalyser = this.ctx.createAnalyser();
            this.micAnalyser.fftSize = 1024;
            this.micData = new Uint8Array(this.micAnalyser.fftSize);
            source.connect(this.micAnalyser);
            this.micPermissionState = 'granted';
            this.micEnabled = true;
            return true;
        } catch (err) {
            this.micPermissionState = 'denied';
            this.micEnabled = false;
            return false;
        }
    }

    setMicMode(useMic) {
        this.micEnabled = useMic;
        if (useMic && !this.micAnalyser) {
            this.enableMicrophone();
        }
    }

    createPanner(position, options = {}) {
        this.initContext();
        const panner = this.ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = options.refDistance ?? 1.6;
        panner.maxDistance = options.maxDistance ?? 38;
        panner.rolloffFactor = options.rolloffFactor ?? 1.35;
        if (position) {
            panner.positionX.value = position.x;
            panner.positionY.value = position.y;
            panner.positionZ.value = position.z;
        }
        return panner;
    }

    computeOcclusion(sourcePos) {
        if (!this.camera || !sourcePos || this._occlusionMeshes.length === 0) return false;
        this.camera.getWorldPosition(this._tempPos);
        const dir = new THREE.Vector3().subVectors(sourcePos, this._tempPos);
        const dist = dir.length();
        if (dist < 0.8) return false;
        dir.normalize();
        this._raycaster.set(this._tempPos, dir);
        this._raycaster.far = dist - 0.35;
        const hits = this._raycaster.intersectObjects(this._occlusionMeshes, false);
        return hits.length > 0;
    }

    startSpatialLoop(id, bufferKey, position, options = {}) {
        this.initContext();
        this.stopLoop(id);

        const panner = this.createPanner(position, options);
        const filter = this.ctx.createBiquadFilter();
        filter.type = options.tvFilter ? 'bandpass' : 'lowpass';
        filter.frequency.value = options.tvFilter ? 1150 : 18000;
        filter.Q.value = options.tvFilter ? 1.4 : 0.7;

        const gain = this.ctx.createGain();
        gain.gain.value = options.volume ?? 0.4;

        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.masterGain);

        let sourceNode = null;
        let extraStop = null;

        const buf = bufferKey ? this.buffers.get(bufferKey) : null;
        if (buf) {
            sourceNode = this.ctx.createBufferSource();
            sourceNode.buffer = buf;
            sourceNode.loop = true;
            if (options.playbackRate) sourceNode.playbackRate.value = options.playbackRate;
            sourceNode.connect(filter);
            sourceNode.start(0, options.offset || 0);
        } else {
            extraStop = this._startProceduralLoop(bufferKey || id, filter);
        }

        const entry = {
            id,
            panner,
            filter,
            gain,
            sourceNode,
            extraStop,
            position: position ? position.clone() : new THREE.Vector3(),
            tvFilter: !!options.tvFilter,
            baseVolume: options.volume ?? 0.4,
            checkOcclusion: options.checkOcclusion !== false
        };
        this.activeLoops.set(id, entry);
        return entry;
    }

    updateLoopPosition(id, pos) {
        const entry = this.activeLoops.get(id);
        if (!entry || !pos) return;
        entry.position.copy(pos);
        entry.panner.positionX.setTargetAtTime(pos.x, this.ctx.currentTime, 0.03);
        entry.panner.positionY.setTargetAtTime(pos.y, this.ctx.currentTime, 0.03);
        entry.panner.positionZ.setTargetAtTime(pos.z, this.ctx.currentTime, 0.03);
    }

    setLoopVolume(id, volume, ramp = 0.25) {
        const entry = this.activeLoops.get(id);
        if (!entry || !this.ctx) return;
        entry.baseVolume = volume;
        entry.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, ramp);
    }

    stopLoop(id) {
        const entry = this.activeLoops.get(id);
        if (!entry) return;
        try { if (entry.sourceNode) entry.sourceNode.stop(); } catch (e) {}
        try { if (entry.extraStop) entry.extraStop(); } catch (e) {}
        try { entry.panner.disconnect(); } catch (e) {}
        this.activeLoops.delete(id);
    }

    _startProceduralLoop(kind, dest) {
        const ctx = this.ctx;
        const nodes = [];
        let timer = null;

        if (kind === 'fridge_hum') {
            const osc = ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = 50;
            const osc2 = ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.value = 100.5;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 190;
            const g = ctx.createGain();
            g.gain.value = 0.42;
            osc.connect(lp);
            osc2.connect(lp);
            lp.connect(g);
            g.connect(dest);
            osc.start();
            osc2.start();
            nodes.push(osc, osc2);
            timer = setInterval(() => {
                if (Math.random() < 0.35 && ctx.state === 'running') {
                    const n = ctx.createBufferSource();
                    n.buffer = this._noiseBuffer;
                    const bp = ctx.createBiquadFilter();
                    bp.type = 'bandpass';
                    bp.frequency.value = 480 + Math.random() * 250;
                    const rg = ctx.createGain();
                    const t = ctx.currentTime;
                    rg.gain.setValueAtTime(0.01, t);
                    rg.gain.linearRampToValueAtTime(0.34, t + 0.15);
                    rg.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
                    n.connect(bp);
                    bp.connect(rg);
                    rg.connect(dest);
                    n.start(t);
                    n.stop(t + 0.95);
                }
            }, 3500);
        } else if (kind === 'tv_static' || kind === 'white_noise') {
            const src = ctx.createBufferSource();
            src.buffer = this._noiseBuffer;
            src.loop = true;
            const g = ctx.createGain();
            g.gain.value = 0.4;
            src.connect(g);
            g.connect(dest);
            src.start();
            nodes.push(src);
        } else if (kind === 'horror_drone' || kind === 'horror_darkness') {
            const osc1 = ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.value = 46;
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = 48.2;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 140;
            const g = ctx.createGain();
            g.gain.value = 0.35;
            osc1.connect(lp);
            osc2.connect(lp);
            lp.connect(g);
            g.connect(dest);
            osc1.start();
            osc2.start();
            nodes.push(osc1, osc2);
        } else if (kind === 'wind_snow') {
            const src = ctx.createBufferSource();
            src.buffer = this._noiseBuffer;
            src.loop = true;
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = 340;
            bp.Q.value = 2.2;
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 0.18;
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 160;
            lfo.connect(lfoGain);
            lfoGain.connect(bp.frequency);
            src.connect(bp);
            bp.connect(dest);
            src.start();
            lfo.start();
            nodes.push(src, lfo);
        } else if (kind === 'heartbeat') {
            timer = setInterval(() => {
                if (ctx.state === 'running') {
                    this._triggerHeartbeatPulse(dest);
                }
            }, 720);
        } else if (kind === 'monster_breath') {
            timer = setInterval(() => {
                if (ctx.state === 'running') {
                    this._triggerMonsterBreath(dest);
                }
            }, 1350);
        } else {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 60;
            const g = ctx.createGain();
            g.gain.value = 0.08;
            osc.connect(g);
            g.connect(dest);
            osc.start();
            nodes.push(osc);
        }

        return () => {
            if (timer) clearInterval(timer);
            nodes.forEach(n => { try { n.stop(); } catch (e) {} });
        };
    }

    _triggerHeartbeatPulse(dest) {
        const t = this.ctx.currentTime;
        [0, 0.19].forEach((offset, idx) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(idx === 0 ? 64 : 54, t + offset);
            osc.frequency.exponentialRampToValueAtTime(28, t + offset + 0.14);
            g.gain.setValueAtTime(0.001, t + offset);
            g.gain.linearRampToValueAtTime(idx === 0 ? 0.55 : 0.35, t + offset + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);
            osc.connect(g);
            g.connect(dest);
            osc.start(t + offset);
            osc.stop(t + offset + 0.2);
        });
    }

    _triggerMonsterBreath(dest) {
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(260, t);
        bp.frequency.linearRampToValueAtTime(460, t + 0.45);
        bp.frequency.linearRampToValueAtTime(190, t + 0.95);
        bp.Q.value = 3.0;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.45, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        src.connect(bp);
        bp.connect(g);
        g.connect(dest);
        src.start(t);
        src.stop(t + 1.05);
    }

    playSpatialOneShot(type, position, options = {}) {
        this.initContext();
        const t = this.ctx.currentTime;
        const dest = this.createPanner(position, options);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const occluded = position && options.checkOcclusion !== false ? this.computeOcclusion(position) : false;
        filter.frequency.value = occluded ? 1850 : 18000;

        const gain = this.ctx.createGain();
        gain.gain.value = (options.volume ?? 0.7) * (occluded ? 0.88 : 1.0);

        filter.connect(gain);
        gain.connect(dest);
        dest.connect(this.masterGain);

        if (options.bufferKey && this.buffers.has(options.bufferKey)) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.buffers.get(options.bufferKey);
            src.playbackRate.value = options.playbackRate ?? (0.95 + Math.random() * 0.1);
            src.connect(filter);
            src.start(t, options.offset || 0, options.duration);
            return;
        }

        switch (type) {
            case 'footstep_parquet':
            case 'footstep_linoleum':
            case 'footstep_snow':
            case 'footstep_concrete': {
                const src = this.ctx.createBufferSource();
                src.buffer = this._noiseBuffer;
                const bp = this.ctx.createBiquadFilter();
                bp.type = 'bandpass';
                const freqMap = {
                    footstep_parquet: 220,
                    footstep_linoleum: 360,
                    footstep_snow: 1100,
                    footstep_concrete: 520
                };
                bp.frequency.value = freqMap[type] * (0.9 + Math.random() * 0.2);
                bp.Q.value = type === 'footstep_snow' ? 0.9 : 2.5;
                const fg = this.ctx.createGain();
                fg.gain.setValueAtTime(0.01, t);
                fg.gain.linearRampToValueAtTime(options.heavy ? 1.45 : 0.72, t + 0.015);
                fg.gain.exponentialRampToValueAtTime(0.001, t + (type === 'footstep_snow' ? 0.20 : 0.14));
                src.connect(bp);
                bp.connect(fg);
                fg.connect(filter);
                src.start(t);
                src.stop(t + 0.24);
                break;
            }
            case 'knife_drag': {
                const shuf = this.ctx.createBufferSource();
                shuf.buffer = this._noiseBuffer;
                const sbp = this.ctx.createBiquadFilter();
                sbp.type = 'bandpass';
                sbp.frequency.value = 480 + Math.random() * 120;
                sbp.Q.value = 1.4;
                const sg = this.ctx.createGain();
                sg.gain.setValueAtTime(0.001, t);
                sg.gain.linearRampToValueAtTime(0.65, t + 0.06);
                sg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                shuf.connect(sbp);
                sbp.connect(sg);
                sg.connect(filter);
                shuf.start(t);
                shuf.stop(t + 0.48);
                break;
            }
            case 'sniff': {
                [0, 0.42].forEach(off => {
                    const src = this.ctx.createBufferSource();
                    src.buffer = this._noiseBuffer;
                    const bp = this.ctx.createBiquadFilter();
                    bp.type = 'bandpass';
                    bp.frequency.setValueAtTime(950, t + off);
                    bp.frequency.linearRampToValueAtTime(1900, t + off + 0.22);
                    bp.Q.value = 4.5;
                    const sg = this.ctx.createGain();
                    sg.gain.setValueAtTime(0.01, t + off);
                    sg.gain.linearRampToValueAtTime(0.75, t + off + 0.09);
                    sg.gain.exponentialRampToValueAtTime(0.001, t + off + 0.28);
                    src.connect(bp);
                    bp.connect(sg);
                    sg.connect(filter);
                    src.start(t + off);
                    src.stop(t + off + 0.3);
                });
                break;
            }
            case 'doorbell_soviet': {
                [0, 0.22, 0.44].forEach(off => {
                    const o1 = this.ctx.createOscillator();
                    const o2 = this.ctx.createOscillator();
                    o1.type = 'square';
                    o2.type = 'sine';
                    o1.frequency.value = 880;
                    o2.frequency.value = 660;
                    const dg = this.ctx.createGain();
                    dg.gain.setValueAtTime(0.32, t + off);
                    dg.gain.exponentialRampToValueAtTime(0.001, t + off + 0.19);
                    o1.connect(dg);
                    o2.connect(dg);
                    dg.connect(filter);
                    o1.start(t + off);
                    o2.start(t + off);
                    o1.stop(t + off + 0.2);
                    o2.stop(t + off + 0.2);
                });
                break;
            }
            case 'door_pound': {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(105, t);
                osc.frequency.exponentialRampToValueAtTime(32, t + 0.16);
                const dg = this.ctx.createGain();
                dg.gain.setValueAtTime(0.95, t);
                dg.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
                osc.connect(dg);
                dg.connect(filter);
                osc.start(t);
                osc.stop(t + 0.26);

                const thumpNoise = this.ctx.createBufferSource();
                thumpNoise.buffer = this._noiseBuffer;
                const lp = this.ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(680, t);
                lp.frequency.exponentialRampToValueAtTime(140, t + 0.18);
                const ng = this.ctx.createGain();
                ng.gain.setValueAtTime(0.85, t);
                ng.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
                thumpNoise.connect(lp);
                lp.connect(ng);
                ng.connect(filter);
                thumpNoise.start(t);
                thumpNoise.stop(t + 0.22);
                break;
            }
            case 'wood_creak': {
                [0, 0.09, 0.19].forEach((off, idx) => {
                    const src = this.ctx.createBufferSource();
                    src.buffer = this._noiseBuffer;
                    const bp = this.ctx.createBiquadFilter();
                    bp.type = 'bandpass';
                    bp.frequency.setValueAtTime(360 + idx * 95, t + off);
                    bp.Q.value = 3.2;
                    const cg = this.ctx.createGain();
                    cg.gain.setValueAtTime(0.01, t + off);
                    cg.gain.linearRampToValueAtTime(0.45, t + off + 0.025);
                    cg.gain.exponentialRampToValueAtTime(0.001, t + off + 0.14);
                    src.connect(bp);
                    bp.connect(cg);
                    cg.connect(filter);
                    src.start(t + off);
                    src.stop(t + off + 0.16);
                });
                break;
            }
            case 'door_crash': {
                const osc = this.ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(140, t);
                osc.frequency.exponentialRampToValueAtTime(24, t + 0.65);
                const ig = this.ctx.createGain();
                ig.gain.setValueAtTime(1.0, t);
                ig.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
                osc.connect(ig);
                ig.connect(filter);
                osc.start(t);
                osc.stop(t + 0.85);

                const noise = this.ctx.createBufferSource();
                noise.buffer = this._noiseBuffer;
                const lp = this.ctx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(3200, t);
                lp.frequency.exponentialRampToValueAtTime(250, t + 0.9);
                const ng = this.ctx.createGain();
                ng.gain.setValueAtTime(1.0, t);
                ng.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
                noise.connect(lp);
                lp.connect(ng);
                ng.connect(filter);
                noise.start(t);
                noise.stop(t + 1.05);
                break;
            }
            case 'monster_roar':
            case 'jumpscare': {
                const o1 = this.ctx.createOscillator();
                const o2 = this.ctx.createOscillator();
                o1.type = 'sawtooth';
                o2.type = 'square';
                const base = type === 'jumpscare' ? 290 : 115;
                o1.frequency.setValueAtTime(base, t);
                o1.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.9);
                o2.frequency.setValueAtTime(base * 1.41, t);
                o2.frequency.exponentialRampToValueAtTime(base * 2.1, t + 0.3);
                const rg = this.ctx.createGain();
                rg.gain.setValueAtTime(0.9, t);
                rg.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
                o1.connect(rg);
                o2.connect(rg);
                rg.connect(filter);
                o1.start(t);
                o2.start(t);
                o1.stop(t + 1.15);
                o2.stop(t + 1.15);

                const ns = this.ctx.createBufferSource();
                ns.buffer = this._noiseBuffer;
                const ng = this.ctx.createGain();
                ng.gain.setValueAtTime(0.8, t);
                ng.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
                ns.connect(ng);
                ng.connect(filter);
                ns.start(t);
                ns.stop(t + 0.9);
                break;
            }
            case 'steam_hiss':
            case 'smoke_puff': {
                const ns = this.ctx.createBufferSource();
                ns.buffer = this._noiseBuffer;
                const hp = this.ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 2400;
                const sg = this.ctx.createGain();
                sg.gain.setValueAtTime(0.01, t);
                sg.gain.linearRampToValueAtTime(0.35, t + 0.12);
                sg.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
                ns.connect(hp);
                hp.connect(sg);
                sg.connect(filter);
                ns.start(t);
                ns.stop(t + 1.25);
                break;
            }
            case 'creak': {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(340, t);
                osc.frequency.linearRampToValueAtTime(220, t + 0.45);
                const cg = this.ctx.createGain();
                cg.gain.setValueAtTime(0.01, t);
                cg.gain.linearRampToValueAtTime(0.28, t + 0.1);
                cg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
                osc.connect(cg);
                cg.connect(filter);
                osc.start(t);
                osc.stop(t + 0.6);
                break;
            }
            case 'whisper_cue': {
                const ns = this.ctx.createBufferSource();
                ns.buffer = this._noiseBuffer;
                const bp = this.ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 1400;
                bp.Q.value = 5;
                const wg = this.ctx.createGain();
                wg.gain.setValueAtTime(0.001, t);
                wg.gain.linearRampToValueAtTime(0.14, t + 0.08);
                wg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                ns.connect(bp);
                bp.connect(wg);
                wg.connect(this.masterGain);
                ns.start(t);
                ns.stop(t + 0.38);
                break;
            }
            case 'gasp': {
                const ns = this.ctx.createBufferSource();
                ns.buffer = this._noiseBuffer;
                const bp = this.ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.setValueAtTime(800, t);
                bp.frequency.exponentialRampToValueAtTime(1900, t + 0.25);
                bp.Q.value = 3.2;
                const gg = this.ctx.createGain();
                gg.gain.setValueAtTime(0.01, t);
                gg.gain.linearRampToValueAtTime(0.7, t + 0.08);
                gg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                ns.connect(bp);
                bp.connect(gg);
                gg.connect(this.masterGain);
                ns.start(t);
                ns.stop(t + 0.48);
                break;
            }
            case 'pickup':
            case 'door_open': {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(type === 'pickup' ? 320 : 140, t);
                osc.frequency.exponentialRampToValueAtTime(type === 'pickup' ? 520 : 90, t + 0.12);
                const pg = this.ctx.createGain();
                pg.gain.setValueAtTime(0.18, t);
                pg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
                osc.connect(pg);
                pg.connect(filter);
                osc.start(t);
                osc.stop(t + 0.16);
                break;
            }
            default: {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
                const dg = this.ctx.createGain();
                dg.gain.setValueAtTime(0.25, t);
                dg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                osc.connect(dg);
                dg.connect(filter);
                osc.start(t);
                osc.stop(t + 0.25);
            }
        }
    }

    speakTVBroadcast(text, tvPosition) {
        this.initContext();
        const t = this.ctx.currentTime;
        const panner = this.createPanner(tvPosition, { refDistance: 6.0, maxDistance: 30 });
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1250;
        bp.Q.value = 1.2;
        const g = this.ctx.createGain();
        g.gain.value = 0.55;
        bp.connect(g);
        g.connect(panner);
        panner.connect(this.masterGain);

        [0, 0.28, 0.56].forEach(off => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 1000;
            const pg = this.ctx.createGain();
            pg.gain.setValueAtTime(0.3, t + off);
            pg.gain.exponentialRampToValueAtTime(0.001, t + off + 0.16);
            osc.connect(pg);
            pg.connect(bp);
            osc.start(t + off);
            osc.stop(t + off + 0.18);
        });

        if ('speechSynthesis' in window && text) {
            try {
                window.speechSynthesis.cancel();
                const utter = new SpeechSynthesisUtterance(text);
                utter.lang = 'ru-RU';
                const voices = window.speechSynthesis.getVoices();
                const ruVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ru'));
                if (ruVoice) utter.voice = ruVoice;
                utter.pitch = 0.82;
                utter.rate = 0.94;
                utter.volume = 1.0;
                setTimeout(() => {
                    try { window.speechSynthesis.speak(utter); } catch (e) {}
                }, 650);
            } catch (e) {}
        }
    }

    updateStealthNoise(deltaTime, mouseDelta, isHidden, isHoldingBreath, monsterDist) {
        if (this._gaspCooldown > 0) this._gaspCooldown -= deltaTime;

        if (this.micEnabled && this.micAnalyser && this.micData) {
            this.micAnalyser.getByteTimeDomainData(this.micData);
            let sum = 0;
            for (let i = 0; i < this.micData.length; i++) {
                const v = (this.micData[i] - 128) / 128;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / this.micData.length);
            const scaled = Math.min(1, rms * 8.0 * this.micSensitivity);
            this.currentNoiseLevel = this.currentNoiseLevel * 0.65 + scaled * 0.35;
            this.oxygen = 1.0;
            return this.currentNoiseLevel;
        }

        this.isHoldingBreath = isHidden && isHoldingBreath;
        const mouseSpeed = Math.hypot(mouseDelta?.x || 0, mouseDelta?.y || 0);
        if (isHidden && mouseSpeed > 4) {
            this.virtualNoise = Math.min(1, this.virtualNoise + (mouseSpeed / 140) * deltaTime * 8.0);
        }

        if (isHidden) {
            if (this.isHoldingBreath) {
                this.oxygen = Math.max(0, this.oxygen - deltaTime / 6.5);
                if (this.oxygen <= 0.001 && this._gaspCooldown <= 0) {
                    this.virtualNoise = 0.95;
                    this._gaspCooldown = 2.5;
                    this.playSpatialOneShot('gasp', null);
                }
            } else {
                this.oxygen = Math.min(1.0, this.oxygen + deltaTime / 3.5);
                if (monsterDist < 5.5) {
                    const proximityNoise = (1 - monsterDist / 5.5) * 0.48;
                    this.virtualNoise = Math.max(this.virtualNoise, proximityNoise);
                }
            }
        } else {
            this.oxygen = Math.min(1.0, this.oxygen + deltaTime / 2.5);
        }

        this.virtualNoise = Math.max(0, this.virtualNoise - deltaTime * 0.85);
        this.currentNoiseLevel = this.virtualNoise;
        return this.currentNoiseLevel;
    }

    update(deltaTime) {
        if (!this.ctx || this.ctx.state !== 'running') return;

        if (this.camera) {
            this.camera.getWorldPosition(this._tempPos);
            this.camera.getWorldDirection(this._tempDir);
            this._tempUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();

            const l = this.ctx.listener;
            if (l.positionX) {
                l.positionX.value = this._tempPos.x;
                l.positionY.value = this._tempPos.y;
                l.positionZ.value = this._tempPos.z;
                l.forwardX.value = this._tempDir.x;
                l.forwardY.value = this._tempDir.y;
                l.forwardZ.value = this._tempDir.z;
                l.upX.value = this._tempUp.x;
                l.upY.value = this._tempUp.y;
                l.upZ.value = this._tempUp.z;
            } else if (l.setPosition) {
                l.setPosition(this._tempPos.x, this._tempPos.y, this._tempPos.z);
                l.setOrientation(
                    this._tempDir.x, this._tempDir.y, this._tempDir.z,
                    this._tempUp.x, this._tempUp.y, this._tempUp.z
                );
            }
        }

        for (const entry of this.activeLoops.values()) {
            if (!entry.tvFilter && entry.checkOcclusion) {
                const occ = this.computeOcclusion(entry.position);
                const targetFreq = occ ? 650 : 18000;
                const targetGain = occ ? entry.baseVolume * 0.55 : entry.baseVolume;
                entry.filter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
                entry.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
            }
        }
    }
}

export default AudioSystem;

