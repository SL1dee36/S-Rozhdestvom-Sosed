import * as THREE from 'three';

const MUSIC_KEYS = new Set([
    'ogonyok_waltz', 'winter_street_music', 'melancholy_ambient',
    'menu_music', 'credits_theme', 'street_music', 'melancholy'
]);

const AMBIENT_KEYS = new Set([
    'wind', 'wind_snow', 'fridge_hum', 'clock_tick',
    'horror_darkness', 'horror_drone', 'heartbeat',
    'tv_static', 'tv_audio', 'tv_broadcast', 'white_noise',
    'street_ambient', 'store_ambient'
]);

const VOICE_KEYS = new Set([
    'tv_emergency_voice', 'tv_broadcast_voice', 'whisper_cue', 'gasp',
    'monster_breath', 'monster_breath_heavy', 'monster_roar', 'jumpscare', 'sniff', 'knife_drag'
]);

const VALID_CATEGORIES = ['music', 'ambient', 'sfx', 'voice'];

export class AudioSystem {
    constructor(camera) {
        this.camera = camera;
        this.ctx = null;
        this.masterGain = null;
        this.categoryGains = {};

        this._masterVolume = 0.80;
        this._categoryVolumes = {
            music: 0.50,
            ambient: 0.80,
            sfx: 0.30,
            voice: 0.70
        };
        this.spatialAudioEnabled = true;
        this.occlusionEnabled = true;
        this.consoleLogging = false;

        this.buffers = new Map();
        this.assetUrls = new Map();
        this.activeLoops = new Map();
        this._activeOneShotSources = new Map();
        this._tvBroadcastSource = null;
        this._tvBroadcastInfo = null;

        this.disabledSounds = new Set();
        this.disabledCategories = new Set();

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
        this._stepFootSide = false;

        this._tempPos = new THREE.Vector3();
        this._tempDir = new THREE.Vector3();
        this._tempUp = new THREE.Vector3(0, 1, 0);
        this._occlusionMeshes = [];
        this._raycaster = new THREE.Raycaster();

        this._exposeConsoleControls();
    }

    _exposeConsoleControls() {
        if (typeof window === 'undefined') return;
        const api = {
            list: () => this.logPlayingSounds(),
            playing: () => this.logPlayingSounds(),
            all: () => this.logAllSounds(),
            disable: (name) => this.disableSound(name),
            off: (name) => this.disableSound(name),
            enable: (name) => this.enableSound(name),
            on: (name) => this.enableSound(name),
            toggle: (name) => this.toggleSound(name),
            logging: (enabled) => {
                if (enabled === undefined) {
                    console.log(`[Audio] Логирование в консоль: ${this.consoleLogging ? 'ВКЛ' : 'ВЫКЛ'}`);
                    return this.consoleLogging;
                }
                this.setConsoleLogging(!!enabled);
                return this.consoleLogging;
            },
            help: () => {
                console.log(
                    '%c[AudioDebug] Команды управления звуком:\n' +
                    '  audioDebug.list()          — показать все играющие сейчас звуки\n' +
                    '  audioDebug.all()           — список всех звуков и их статус (вкл/выкл)\n' +
                    '  audioDebug.disable("имя")  — отключить звук или категорию (music/ambient/sfx/voice/all)\n' +
                    '  audioDebug.enable("имя")   — включить звук или категорию (или "all")\n' +
                    '  audioDebug.toggle("имя")   — переключить звук или категорию\n' +
                    '  audioDebug.logging(false)  — вкл/выкл вывод играющих звуков в консоль',
                    'color:#7dd3fc;font-weight:bold;'
                );
            }
        };
        window.audioDebug = api;
        window.soundConsole = api;
        if (!window._audioDebugBannerShown) {
            window._audioDebugBannerShown = true;
            console.info('%c[Audio] Консоль звуков активна. Введите audioDebug.help() для списка команд (list, disable, enable, toggle).', 'color:#86efac;font-weight:bold;');
        }
    }

    _resolveCategory(id, bufferKey, explicitCategory = null) {
        if (explicitCategory && VALID_CATEGORIES.includes(explicitCategory)) return explicitCategory;
        if (MUSIC_KEYS.has(bufferKey) || MUSIC_KEYS.has(id)) return 'music';
        if (VOICE_KEYS.has(bufferKey) || VOICE_KEYS.has(id)) return 'voice';
        if (AMBIENT_KEYS.has(bufferKey) || AMBIENT_KEYS.has(id)) return 'ambient';
        return 'sfx';
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
        this.masterGain.gain.value = this._masterVolume;
        this.masterGain.connect(this.ctx.destination);

        for (const cat of VALID_CATEGORIES) {
            const g = this.ctx.createGain();
            g.gain.value = this.disabledCategories.has(cat) ? 0 : (this._categoryVolumes[cat] ?? 1.0);
            g.connect(this.masterGain);
            this.categoryGains[cat] = g;
        }
        return this.ctx;
    }

    _getCategoryDest(category) {
        this.initContext();
        return this.categoryGains[category] || this.masterGain;
    }

    setMasterVolume(vol) {
        this._masterVolume = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 0.85));
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.setTargetAtTime(this._masterVolume, this.ctx.currentTime, 0.04);
        }
    }

    getMasterVolume() {
        return this._masterVolume;
    }

    setCategoryVolume(category, vol) {
        if (!VALID_CATEGORIES.includes(category)) return;
        const clamped = Math.max(0, Math.min(1, Number.isFinite(vol) ? vol : 1.0));
        this._categoryVolumes[category] = clamped;
        const node = this.categoryGains[category];
        if (node && this.ctx) {
            const effective = this.disabledCategories.has(category) ? 0 : clamped;
            node.gain.setTargetAtTime(effective, this.ctx.currentTime, 0.04);
        }
    }

    getCategoryVolume(category) {
        return this._categoryVolumes[category] ?? 1.0;
    }

    setSpatialAudioEnabled(enabled) {
        this.spatialAudioEnabled = !!enabled;
        for (const entry of this.activeLoops.values()) {
            if (entry.panner) {
                entry.panner.panningModel = this.spatialAudioEnabled ? 'HRTF' : 'equalpower';
                if (!this.spatialAudioEnabled) {
                    entry.panner.rolloffFactor = 0;
                } else {
                    entry.panner.rolloffFactor = entry.rolloffFactor ?? 1.35;
                }
            }
        }
    }

    setOcclusionEnabled(enabled) {
        this.occlusionEnabled = !!enabled;
        if (!this.occlusionEnabled && this.ctx) {
            for (const entry of this.activeLoops.values()) {
                entry._cachedOcc = false;
                if (!entry.tvFilter && entry.filter) {
                    entry.filter.frequency.setTargetAtTime(18000, this.ctx.currentTime, 0.08);
                }
            }
        }
    }

    setConsoleLogging(enabled) {
        this.consoleLogging = !!enabled;
        console.log(`[Audio] Вывод играющих звуков в консоль: ${this.consoleLogging ? 'ВКЛ' : 'ВЫКЛ'}`);
    }

    setMicSensitivity(val) {
        this.micSensitivity = Math.max(0.4, Math.min(3.0, Number.isFinite(val) ? val : 1.4));
    }

    isSoundDisabled(id, bufferKey = null, category = null) {
        const cat = category || this._resolveCategory(id, bufferKey);
        if (this.disabledCategories.has(cat)) return true;
        if (id && this.disabledSounds.has(id)) return true;
        if (bufferKey && this.disabledSounds.has(bufferKey)) return true;
        return false;
    }

    disableSound(target) {
        if (!target) {
            console.warn('[Audio] Укажите имя звука, категорию (music/ambient/sfx/voice) или "all".');
            return;
        }
        const key = String(target).trim();
        if (key === 'all') {
            VALID_CATEGORIES.forEach(c => this.disabledCategories.add(c));
            this._refreshCategoryGains();
            this._syncActiveLoopsMute();
            console.log('%c[Audio 🔇] Все звуки отключены.', 'color:#f87171;font-weight:bold;');
            return;
        }
        if (VALID_CATEGORIES.includes(key)) {
            this.disabledCategories.add(key);
            this._refreshCategoryGains();
            console.log(`%c[Audio 🔇] Категория "${key}" отключена.`, 'color:#f87171;');
            return;
        }
        this.disabledSounds.add(key);
        this._syncActiveLoopsMute();
        this.stopOneShotsByType(key);
        if (key === 'tv_emergency_voice' || key === 'tv_broadcast_voice') {
            this.stopTVBroadcast();
        }
        console.log(`%c[Audio 🔇] Звук "${key}" отключён.`, 'color:#f87171;');
    }

    enableSound(target) {
        if (!target) {
            console.warn('[Audio] Укажите имя звука, категорию (music/ambient/sfx/voice) или "all".');
            return;
        }
        const key = String(target).trim();
        if (key === 'all') {
            this.disabledCategories.clear();
            this.disabledSounds.clear();
            this._refreshCategoryGains();
            this._syncActiveLoopsMute();
            console.log('%c[Audio 🔊] Все звуки включены.', 'color:#4ade80;font-weight:bold;');
            return;
        }
        if (VALID_CATEGORIES.includes(key)) {
            this.disabledCategories.delete(key);
            this._refreshCategoryGains();
            console.log(`%c[Audio 🔊] Категория "${key}" включена.`, 'color:#4ade80;');
            return;
        }
        this.disabledSounds.delete(key);
        this._syncActiveLoopsMute();
        console.log(`%c[Audio 🔊] Звук "${key}" включён.`, 'color:#4ade80;');
    }

    toggleSound(target) {
        const key = String(target || '').trim();
        if (!key) return;
        if (VALID_CATEGORIES.includes(key)) {
            if (this.disabledCategories.has(key)) this.enableSound(key);
            else this.disableSound(key);
            return;
        }
        if (this.disabledSounds.has(key)) this.enableSound(key);
        else this.disableSound(key);
    }

    _refreshCategoryGains() {
        if (!this.ctx) return;
        for (const cat of VALID_CATEGORIES) {
            const node = this.categoryGains[cat];
            if (!node) continue;
            const target = this.disabledCategories.has(cat) ? 0 : (this._categoryVolumes[cat] ?? 1.0);
            node.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
        }
    }

    _syncActiveLoopsMute() {
        if (!this.ctx) return;
        for (const entry of this.activeLoops.values()) {
            const muted = this.isSoundDisabled(entry.id, entry.bufferKey, entry.category);
            entry.muted = muted;
            if (muted) {
                entry.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
            } else {
                entry.gain.gain.setTargetAtTime(entry.baseVolume, this.ctx.currentTime, 0.05);
            }
        }
    }

    getPlayingSounds() {
        const now = performance.now();
        const result = [];
        for (const entry of this.activeLoops.values()) {
            result.push({
                id: entry.id,
                sound: entry.bufferKey || entry.id,
                type: 'loop',
                category: entry.category,
                volume: Number(entry.baseVolume.toFixed(2)),
                muted: this.isSoundDisabled(entry.id, entry.bufferKey, entry.category),
                spatial: !!entry.isSpatial,
                playingSec: Number(((now - entry.startedAt) / 1000).toFixed(1))
            });
        }
        for (const [type, list] of this._activeOneShotSources.entries()) {
            for (const item of list) {
                result.push({
                    id: type,
                    sound: item.bufferKey || type,
                    type: 'oneshot',
                    category: item.category,
                    volume: Number((item.volume ?? 0.7).toFixed(2)),
                    muted: false,
                    spatial: !!item.isSpatial,
                    playingSec: Number(((now - item.startedAt) / 1000).toFixed(2))
                });
            }
        }
        if (this._tvBroadcastSource && this._tvBroadcastInfo) {
            result.push({
                id: 'tv_broadcast_voice',
                sound: 'tv_emergency_voice',
                type: 'voice',
                category: 'voice',
                volume: 0.85,
                muted: this.isSoundDisabled('tv_broadcast_voice', 'tv_emergency_voice', 'voice'),
                spatial: true,
                playingSec: Number(((now - this._tvBroadcastInfo.startedAt) / 1000).toFixed(1))
            });
        }
        return result;
    }

    logPlayingSounds() {
        const list = this.getPlayingSounds();
        if (list.length === 0) {
            console.log('[Audio] Сейчас ни один звук не играет.');
            return list;
        }
        console.log(`%c[Audio] Сейчас играет звуков: ${list.length}`, 'color:#7dd3fc;font-weight:bold;');
        console.table(list);
        return list;
    }

    logAllSounds() {
        const rows = [];
        for (const [key, url] of this.assetUrls.entries()) {
            const cat = this._resolveCategory(key, key);
            rows.push({
                sound: key,
                category: cat,
                loaded: this.buffers.has(key),
                enabled: !this.isSoundDisabled(key, key, cat),
                file: url
            });
        }
        rows.sort((a, b) => a.category.localeCompare(b.category) || a.sound.localeCompare(b.sound));
        console.table(rows);
        return rows;
    }

    _logEvent(action, id, bufferKey, category, extra = '') {
        if (!this.consoleLogging) return;
        const activeLoopIds = Array.from(this.activeLoops.keys());
        const suffix = extra ? ` | ${extra}` : '';
        if (action === 'LOOP') {
            console.log(
                `%c[Audio ▶ LOOP]%c ${id} (${bufferKey}) [${category}]${suffix} | Активные циклы (${activeLoopIds.length}): ${activeLoopIds.join(', ')}`,
                'color:#38bdf8;font-weight:bold;', 'color:inherit;'
            );
        } else if (action === 'SFX') {
            console.log(
                `%c[Audio ▶ SFX]%c ${id} (${bufferKey}) [${category}]${suffix}`,
                'color:#a3e635;font-weight:bold;', 'color:inherit;'
            );
        } else if (action === 'STOP') {
            console.log(
                `%c[Audio ■ STOP]%c ${id}${suffix} | Осталось циклов: ${activeLoopIds.length}`,
                'color:#94a3b8;font-weight:bold;', 'color:inherit;'
            );
        } else if (action === 'MUTED') {
            console.log(
                `%c[Audio 🔇 MUTED]%c ${id} (${bufferKey}) [${category}] — отключён через консоль`,
                'color:#f87171;font-weight:bold;', 'color:inherit;'
            );
        }
    }

    setOcclusionMeshes(meshes) {
        this._occlusionMeshes = meshes || [];
    }

    async loadAudioAssets(manifest) {
        this.initContext();
        const entries = Object.entries(manifest);
        for (const [key, url] of entries) {
            this.assetUrls.set(key, url);
        }
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
        panner.panningModel = this.spatialAudioEnabled ? 'HRTF' : 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = options.refDistance ?? 1.6;
        panner.maxDistance = options.maxDistance ?? 38;
        panner.rolloffFactor = this.spatialAudioEnabled ? (options.rolloffFactor ?? 1.35) : 0;
        if (position) {
            panner.positionX.value = position.x;
            panner.positionY.value = position.y;
            panner.positionZ.value = position.z;
        }
        return panner;
    }

    computeOcclusion(sourcePos) {
        if (!this.occlusionEnabled || !this.camera || !sourcePos || this._occlusionMeshes.length === 0) return false;
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
        this.stopLoop(id, true);

        const resolvedKey = bufferKey === 'white_noise' ? 'tv_static' : (bufferKey || id);
        const category = this._resolveCategory(id, resolvedKey, options.category);
        const muted = this.isSoundDisabled(id, resolvedKey, category);

        const panner = this.createPanner(position, options);
        const filter = this.ctx.createBiquadFilter();
        filter.type = options.tvFilter ? 'bandpass' : 'lowpass';
        filter.frequency.value = options.tvFilter ? 1150 : 18000;
        filter.Q.value = options.tvFilter ? 1.4 : 0.7;

        const baseVol = options.volume ?? 0.4;
        const gain = this.ctx.createGain();
        gain.gain.value = muted ? 0 : baseVol;

        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this._getCategoryDest(category));

        let sourceNode = null;
        const buf = this.buffers.get(resolvedKey) || this.buffers.get(id) || null;
        if (buf) {
            sourceNode = this.ctx.createBufferSource();
            sourceNode.buffer = buf;
            sourceNode.loop = true;
            if (options.playbackRate) sourceNode.playbackRate.value = options.playbackRate;
            sourceNode.connect(filter);
            sourceNode.start(0, options.offset || 0);
        } else if (this.consoleLogging) {
            console.warn(`[Audio] Аудиофайл для цикла "${resolvedKey}" ещё не загружен.`);
        }

        const entry = {
            id,
            bufferKey: resolvedKey,
            category,
            panner,
            filter,
            gain,
            sourceNode,
            position: position ? position.clone() : new THREE.Vector3(),
            isSpatial: !!position,
            tvFilter: !!options.tvFilter,
            baseVolume: baseVol,
            muted,
            startedAt: performance.now(),
            refDistance: options.refDistance ?? 1.6,
            maxDistance: options.maxDistance ?? 38,
            rolloffFactor: options.rolloffFactor ?? 1.35,
            checkOcclusion: options.checkOcclusion !== false
        };
        this.activeLoops.set(id, entry);

        if (muted) {
            this._logEvent('MUTED', id, resolvedKey, category);
        } else {
            this._logEvent('LOOP', id, resolvedKey, category, `vol=${baseVol.toFixed(2)}`);
        }
        return entry;
    }

    updateLoopPosition(id, pos) {
        const entry = this.activeLoops.get(id);
        if (!entry || !pos || !this.ctx) return;
        entry.position.copy(pos);
        entry.panner.positionX.setTargetAtTime(pos.x, this.ctx.currentTime, 0.03);
        entry.panner.positionY.setTargetAtTime(pos.y, this.ctx.currentTime, 0.03);
        entry.panner.positionZ.setTargetAtTime(pos.z, this.ctx.currentTime, 0.03);
    }

    setLoopVolume(id, volume, ramp = 0.25) {
        const entry = this.activeLoops.get(id);
        if (!entry || !this.ctx) return;
        entry.baseVolume = volume;
        const target = this.isSoundDisabled(entry.id, entry.bufferKey, entry.category) ? 0 : volume;
        entry.gain.gain.setTargetAtTime(target, this.ctx.currentTime, ramp);
    }

    stopLoop(id, silent = false) {
        const entry = this.activeLoops.get(id);
        if (!entry) return;
        try { if (entry.sourceNode) entry.sourceNode.stop(); } catch (e) {}
        try { entry.panner.disconnect(); } catch (e) {}
        this.activeLoops.delete(id);
        if (!silent) {
            this._logEvent('STOP', id, entry.bufferKey, entry.category);
        }
    }

    stopSpatialLoop(id, silent = false) {
        return this.stopLoop(id, silent);
    }

    stopOneShotsByType(type) {
        const list = this._activeOneShotSources.get(type);
        if (!list || list.length === 0) return;
        const t = this.ctx ? this.ctx.currentTime : 0;
        for (const item of list) {
            try {
                if (item.gain && this.ctx) {
                    item.gain.gain.setValueAtTime(item.gain.gain.value, t);
                    item.gain.gain.linearRampToValueAtTime(0.0001, t + 0.04);
                }
                item.src.stop(t + 0.045);
            } catch (e) {}
        }
        this._activeOneShotSources.set(type, []);
    }

    playSpatialOneShot(type, position, options = {}) {
        this.initContext();
        const autoBufferMap = {
            door_pound: 'door_bang',
            glass_break: 'glass_break',
            doorbell_soviet: 'doorbell',
            door_knock: 'door_knock'
        };
        const resolvedBufferKey = options.bufferKey || autoBufferMap[type] || type;
        const category = this._resolveCategory(type, resolvedBufferKey, options.category);

        if (this.isSoundDisabled(type, resolvedBufferKey, category)) {
            this._logEvent('MUTED', type, resolvedBufferKey, category);
            return null;
        }

        const buf = this.buffers.get(resolvedBufferKey) || this.buffers.get(type) || this.buffers.get('default_sfx');
        if (!buf) {
            if (this.consoleLogging) {
                console.warn(`[Audio] Аудиофайл "${resolvedBufferKey}" ещё не загружен.`);
            }
            return null;
        }

        const t = this.ctx.currentTime;
        const dest = this.createPanner(position, options);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        const occluded = position && options.checkOcclusion !== false ? this.computeOcclusion(position) : false;
        filter.frequency.value = occluded ? 1850 : 18000;

        const isFootstep = typeof type === 'string' && type.startsWith('footstep_');
        let vol = options.volume ?? 0.7;
        if (isFootstep && options.heavy) vol *= 1.35;
        const effectiveVol = vol * (occluded ? 0.88 : 1.0);

        const gain = this.ctx.createGain();
        gain.gain.value = effectiveVol;

        filter.connect(gain);
        if (position) {
            gain.connect(dest);
            dest.connect(this._getCategoryDest(category));
        } else {
            gain.connect(this._getCategoryDest(category));
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        if (options.playbackRate !== undefined) {
            src.playbackRate.value = options.playbackRate;
        } else if (isFootstep) {
            this._stepFootSide = !this._stepFootSide;
            const footMul = this._stepFootSide ? 0.94 : 1.06;
            src.playbackRate.value = footMul * (0.94 + Math.random() * 0.12);
        } else {
            src.playbackRate.value = 0.96 + Math.random() * 0.08;
        }

        src.connect(filter);

        const list = this._activeOneShotSources.get(type) || [];
        const entry = {
            src,
            gain,
            bufferKey: resolvedBufferKey,
            category,
            volume: effectiveVol,
            isSpatial: !!position,
            startedAt: performance.now()
        };
        list.push(entry);
        this._activeOneShotSources.set(type, list);
        src.onended = () => {
            const cur = this._activeOneShotSources.get(type);
            if (cur) {
                const idx = cur.indexOf(entry);
                if (idx >= 0) cur.splice(idx, 1);
            }
            try { dest.disconnect(); } catch (e) {}
        };
        src.start(t, options.offset || 0, options.duration);
        this._logEvent('SFX', type, resolvedBufferKey, category, `vol=${effectiveVol.toFixed(2)}`);
        return entry;
    }

    stopTVBroadcast() {
        if (this._tvBroadcastSource) {
            try { this._tvBroadcastSource.stop(); } catch (e) {}
            try { this._tvBroadcastSource.disconnect(); } catch (e) {}
            this._tvBroadcastSource = null;
            this._tvBroadcastInfo = null;
            this._logEvent('STOP', 'tv_broadcast_voice', 'tv_emergency_voice', 'voice');
        }
    }

    speakTVBroadcast(text, tvPosition) {
        this.initContext();
        this.stopTVBroadcast();
        if (this.isSoundDisabled('tv_broadcast_voice', 'tv_emergency_voice', 'voice')) {
            this._logEvent('MUTED', 'tv_broadcast_voice', 'tv_emergency_voice', 'voice');
            return;
        }
        const t = this.ctx.currentTime;
        const panner = this.createPanner(tvPosition, { refDistance: 3.5, maxDistance: 22 });
        const g = this.ctx.createGain();
        g.gain.value = 0.85;
        g.connect(panner);
        panner.connect(this._getCategoryDest('voice'));

        const voiceBuf = this.buffers.get('tv_emergency_voice');
        if (voiceBuf) {
            const src = this.ctx.createBufferSource();
            src.buffer = voiceBuf;
            src.connect(g);
            src.start(t);
            this._tvBroadcastSource = src;
            this._tvBroadcastInfo = { startedAt: performance.now() };
            this._logEvent('SFX', 'tv_broadcast_voice', 'tv_emergency_voice', 'voice', 'vol=0.85');
            src.onended = () => {
                if (this._tvBroadcastSource === src) {
                    this._tvBroadcastSource = null;
                    this._tvBroadcastInfo = null;
                }
            };
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

        this._occStep = ((this._occStep || 0) + 1) % 6;
        let loopIdx = 0;
        for (const entry of this.activeLoops.values()) {
            loopIdx++;
            if (this.isSoundDisabled(entry.id, entry.bufferKey, entry.category)) {
                entry.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
                continue;
            }
            const dist = this.camera ? this._tempPos.distanceTo(entry.position) : 0;
            const maxD = entry.maxDistance ?? 38;
            let distCutoff = 1.0;
            if (this.spatialAudioEnabled && entry.rolloffFactor > 0 && dist > entry.refDistance) {
                const norm = Math.max(0, Math.min(1, (dist - entry.refDistance) / Math.max(0.5, maxD - entry.refDistance)));
                distCutoff = Math.pow(1.0 - norm, 1.8);
            }
            if (!entry.tvFilter && entry.checkOcclusion && this.occlusionEnabled) {
                if (dist <= maxD + 1.0 && (loopIdx % 6) === this._occStep) {
                    entry._cachedOcc = this.computeOcclusion(entry.position);
                }
                const occ = !!entry._cachedOcc;
                const targetFreq = occ ? 480 : 18000;
                const targetGain = entry.baseVolume * distCutoff * (occ ? 0.20 : 1.0);
                entry.filter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
                entry.gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
            } else {
                if (!entry.tvFilter && entry.filter) {
                    entry.filter.frequency.setTargetAtTime(18000, this.ctx.currentTime, 0.1);
                }
                entry.gain.gain.setTargetAtTime(entry.baseVolume * distCutoff, this.ctx.currentTime, 0.1);
            }
        }
    }
}

export default AudioSystem;
