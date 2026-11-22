import { t, getLanguage, setLanguage, applyDOMTranslations, onLanguageChange } from '../i18n/Localization.js';

const ENDINGS_STORAGE_KEY = 'zarechnoe_unlocked_endings';
const SENSITIVITY_STORAGE_KEY = 'zarechnoe_mouse_sensitivity';
const CAMERA_TILT_STORAGE_KEY = 'zarechnoe_camera_tilt';
const MOTION_BLUR_STORAGE_KEY = 'zarechnoe_motion_blur';

const ENDINGS_CATALOG = [
    { id: 1, titleKey: 'ui.ending1.title', descKey: 'ui.ending1.desc' },
    { id: 2, titleKey: 'ui.ending2.title', descKey: 'ui.ending2.desc' },
    { id: 3, titleKey: 'ui.ending3.title', descKey: 'ui.ending3.desc' }
];

export class UIManager {
    constructor(engine) {
        this.engine = engine;
        this.creditsData = [];
        this._subtitleTimer = null;
        this._controlsHintTimer = null;
        this._shownBaseControlsHint = false;
        this._micTestAnim = null;
        this._settingsReturnScreen = 'main';
        this._creditsAnim = null;
        this._creditsMusicId = 'credits_theme';
        this._micRequestedOnce = false;

        this.el = {
            mainMenu: document.getElementById('main-menu'),
            pauseMenu: document.getElementById('pause-menu'),
            settingsModal: document.getElementById('settings-modal'),
            hud: document.getElementById('hud'),
            crosshair: document.getElementById('crosshair'),
            crosshairRing: document.getElementById('crosshair-ring'),
            crosshairRingFill: document.getElementById('crosshair-ring-fill'),
            prompt: document.getElementById('interact-prompt'),
            wakePrompt: document.getElementById('wake-prompt'),
            controlsHint: document.getElementById('controls-hint'),
            clock: document.getElementById('hud-clock'),
            objectives: document.getElementById('objectives-box'),
            subtitles: document.getElementById('subtitles'),
            dialogueOverlay: document.getElementById('dialogue-overlay'),
            dialogueSpeakerName: document.getElementById('dialogue-speaker-name'),
            dialogueSpeakerRole: document.getElementById('dialogue-speaker-role'),
            dialogueText: document.getElementById('dialogue-text'),
            dialogueChoices: document.getElementById('dialogue-choices'),
            stealthPanel: document.getElementById('stealth-panel'),
            noiseFill: document.getElementById('noise-fill'),
            oxygenRow: document.getElementById('oxygen-row'),
            oxygenFill: document.getElementById('oxygen-fill'),
            stealthHint: document.getElementById('stealth-hint'),
            deathScreen: document.getElementById('death-screen'),
            deathReason: document.getElementById('death-reason'),
            ending1Screen: document.getElementById('ending1-screen'),
            ending1SpacePrompt: document.getElementById('ending1-space-prompt'),
            ending2Screen: document.getElementById('ending2-screen'),
            ending3Screen: document.getElementById('ending3-screen'),
            ending4Screen: document.getElementById('ending4-screen'),
            rollingCredits: document.getElementById('rolling-credits'),
            rollingCreditsTrack: document.getElementById('rolling-credits-track'),
            creditsRollBody: document.getElementById('credits-roll-body'),
            creditsModal: document.getElementById('credits-modal'),
            creditsList: document.getElementById('credits-list'),
            endingsModal: document.getElementById('endings-modal'),
            endingsList: document.getElementById('endings-list'),
            btnStart: document.getElementById('btn-start'),
            btnCheckpointMenu: document.getElementById('btn-checkpoint-menu'),
            btnEndings: document.getElementById('btn-endings'),
            btnCloseEndings: document.getElementById('btn-close-endings'),
            btnOpenSettings: document.getElementById('btn-open-settings'),
            btnPauseSettings: document.getElementById('btn-pause-settings'),
            btnCloseSettings: document.getElementById('btn-close-settings'),
            btnCredits: document.getElementById('btn-credits'),
            btnCloseCredits: document.getElementById('btn-close-credits'),
            btnExitGame: document.getElementById('btn-exit-game'),
            btnResume: document.getElementById('btn-resume'),
            btnCheckpointPause: document.getElementById('btn-checkpoint-pause'),
            btnQuitMenu: document.getElementById('btn-quit-menu'),
            btnRetryDeath: document.getElementById('btn-retry-death'),
            btnRetryEnding2: document.getElementById('btn-retry-ending2'),
            btnMenuEnding3: document.getElementById('btn-menu-ending3'),
            btnRetryEnding3: document.getElementById('btn-retry-ending3'),
            btnMenuEnding4: document.getElementById('btn-menu-ending4'),
            btnRetryEnding4: document.getElementById('btn-retry-ending4'),
            selLang: document.getElementById('opt-language'),
            chkMic: document.getElementById('opt-mic-mode'),
            btnTestMic: document.getElementById('btn-test-mic'),
            micTestFill: document.getElementById('mic-test-fill'),
            micStatus: document.getElementById('mic-status'),
            chkPs1: document.getElementById('opt-ps1-jitter'),
            chkCameraTilt: document.getElementById('opt-camera-tilt'),
            chkMotionBlur: document.getElementById('opt-motion-blur'),
            rngVhs: document.getElementById('opt-vhs-intensity'),
            rngVol: document.getElementById('opt-volume'),
            rngSens: document.getElementById('opt-sensitivity'),
            sensVal: document.getElementById('opt-sensitivity-val')
        };

        this.callbacks = {
            onNewGame: null,
            onLoadCheckpoint: null,
            onResume: null,
            onQuitToMenu: null,
            onEnterMainMenu: null,
            onSensitivityChange: null,
            onCameraTiltChange: null
        };

        this._micStatusKey = 'ui.settings.mic_note_default';
        this._bindEvents();
        if (this.el.selLang) {
            this.el.selLang.value = getLanguage();
        }
        applyDOMTranslations();
        this._renderCredits();
        this._loadCredits();
        this._updateEndingsTabVisibility();
        this._renderEndings();
        onLanguageChange(() => {
            if (this.el.selLang) this.el.selLang.value = getLanguage();
            if (this.el.micStatus && this._micStatusKey) {
                this.el.micStatus.textContent = t(this._micStatusKey);
            }
            this._renderCredits();
            this._renderEndings();
        });
        this.applyVHSIntensity(this.el.rngVhs ? parseFloat(this.el.rngVhs.value) : 0.2);
        this.applySensitivity(this._loadSavedSensitivity());
        this.applyCameraTilt(this._loadSavedBool(CAMERA_TILT_STORAGE_KEY, true));
        this.applyMotionBlur(this._loadSavedBool(MOTION_BLUR_STORAGE_KEY, true));
    }

    _loadSavedBool(key, defaultVal = true) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === '0' || raw === 'false') return false;
            if (raw === '1' || raw === 'true') return true;
        } catch (e) {}
        return defaultVal;
    }

    isCameraTiltEnabled() {
        return this._cameraTiltEnabled !== false;
    }

    applyCameraTilt(enabled) {
        this._cameraTiltEnabled = !!enabled;
        if (this.el.chkCameraTilt) this.el.chkCameraTilt.checked = this._cameraTiltEnabled;
        try { localStorage.setItem(CAMERA_TILT_STORAGE_KEY, this._cameraTiltEnabled ? '1' : '0'); } catch (e) {}
        if (this.callbacks.onCameraTiltChange) this.callbacks.onCameraTiltChange(this._cameraTiltEnabled);
    }

    applyMotionBlur(enabled) {
        this._motionBlurEnabled = !!enabled;
        if (this.el.chkMotionBlur) this.el.chkMotionBlur.checked = this._motionBlurEnabled;
        try { localStorage.setItem(MOTION_BLUR_STORAGE_KEY, this._motionBlurEnabled ? '1' : '0'); } catch (e) {}
        this.engine.renderer?.setMotionBlur?.(this._motionBlurEnabled);
    }

    _setMicStatus(key) {
        this._micStatusKey = key;
        if (this.el.micStatus) {
            this.el.micStatus.textContent = t(key);
        }
    }

    async _loadCredits() {
        try {
            const res = await fetch('./assets/credits.json');
            if (res.ok) {
                this.creditsData = await res.json();
                this._renderCredits();
            }
        } catch (e) {}
    }

    _renderCredits() {
        const audio = this.creditsData.filter(c => c.category === 'audio');
        const tex = this.creditsData.filter(c => c.category === 'image' || c.category === 'texture');

        let html = `<h3>${t('ui.credits.sec_engine')}</h3>
            <p>${t('ui.credits.engine_line')}</p>
            <p>${t('ui.credits.game_line')}</p>`;

        if (audio.length > 0) {
            html += `<h3>${t('ui.credits.sec_audio')}</h3><ul>`;
            for (const c of audio) {
                html += `<li><code>${c.file}</code> — <strong>${c.author}</strong> (${c.license})</li>`;
            }
            html += `</ul>`;
        }
        if (tex.length > 0) {
            html += `<h3>${t('ui.credits.sec_tex')}</h3><ul>`;
            for (const c of tex) {
                html += `<li><code>${c.file}</code> — <strong>${c.author}</strong> (${c.license})</li>`;
            }
            html += `</ul>`;
        }
        if (this.el.creditsList) this.el.creditsList.innerHTML = html;
        if (this.el.creditsRollBody) this.el.creditsRollBody.innerHTML = html;
    }

    _bindEvents() {
        this.el.btnStart?.addEventListener('click', () => {
            this.engine.audioSystem.initContext();
            if (this.callbacks.onNewGame) this.callbacks.onNewGame();
        });

        const triggerCheckpoint = () => {
            this.engine.audioSystem.initContext();
            if (this.callbacks.onLoadCheckpoint) this.callbacks.onLoadCheckpoint();
        };
        this.el.btnCheckpointMenu?.addEventListener('click', triggerCheckpoint);
        this.el.btnCheckpointPause?.addEventListener('click', triggerCheckpoint);
        this.el.btnRetryDeath?.addEventListener('click', triggerCheckpoint);
        this.el.btnRetryEnding2?.addEventListener('click', triggerCheckpoint);
        this.el.btnRetryEnding3?.addEventListener('click', triggerCheckpoint);
        this.el.btnRetryEnding4?.addEventListener('click', triggerCheckpoint);
        const goMenu = () => {
            if (this.callbacks.onQuitToMenu) this.callbacks.onQuitToMenu();
            this.showMainMenu();
        };
        this.el.btnMenuEnding3?.addEventListener('click', goMenu);
        this.el.btnMenuEnding4?.addEventListener('click', goMenu);

        this.el.btnResume?.addEventListener('click', () => {
            if (this.callbacks.onResume) this.callbacks.onResume();
        });

        this.el.btnQuitMenu?.addEventListener('click', () => {
            if (this.callbacks.onQuitToMenu) this.callbacks.onQuitToMenu();
            this.showMainMenu();
        });

        this.el.btnOpenSettings?.addEventListener('click', () => this.openSettings('main'));
        this.el.btnPauseSettings?.addEventListener('click', () => this.openSettings('pause'));
        this.el.btnCloseSettings?.addEventListener('click', () => this.closeSettings());

        this.el.btnCredits?.addEventListener('click', () => {
            this.el.mainMenu?.classList.add('hidden');
            this.el.creditsModal?.classList.remove('hidden');
        });
        this.el.btnCloseCredits?.addEventListener('click', () => {
            this.el.creditsModal?.classList.add('hidden');
            this.el.mainMenu?.classList.remove('hidden');
        });

        this.el.btnExitGame?.addEventListener('click', () => {
            fetch('/__quit', { method: 'POST' }).catch(() => {});
            try { window.close(); } catch (e) {}
            setTimeout(() => {
                document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#d8dce6;font-family:monospace;font-size:20px;letter-spacing:2px;">${t('app.game_exited')}</div>`;
            }, 250);
        });

        this.el.selLang?.addEventListener('change', (e) => {
            setLanguage(e.target.value);
        });

        this.el.btnEndings?.addEventListener('click', () => {
            this._renderEndings();
            this.el.mainMenu?.classList.add('hidden');
            this.el.endingsModal?.classList.remove('hidden');
        });
        this.el.btnCloseEndings?.addEventListener('click', () => {
            this.el.endingsModal?.classList.add('hidden');
            this.el.mainMenu?.classList.remove('hidden');
        });

        this.el.chkMic?.addEventListener('change', async (e) => {
            const wantMic = e.target.checked;
            if (wantMic) {
                const ok = await this.engine.audioSystem.enableMicrophone();
                if (!ok) {
                    e.target.checked = false;
                    this.engine.audioSystem.setMicMode(false);
                    this._setMicStatus('ui.settings.mic_not_found');
                } else {
                    this._setMicStatus('ui.settings.mic_active');
                }
            } else {
                this.engine.audioSystem.setMicMode(false);
                this._setMicStatus('ui.settings.mic_disabled');
            }
        });

        this.el.btnTestMic?.addEventListener('click', async () => {
            const ok = await this.engine.audioSystem.enableMicrophone();
            if (this.el.chkMic) this.el.chkMic.checked = ok;
            if (!ok) {
                this.engine.audioSystem.setMicMode(false);
                this._setMicStatus('ui.settings.mic_no_access');
                return;
            }
            this._setMicStatus('ui.settings.mic_testing');
            if (this._micTestAnim) cancelAnimationFrame(this._micTestAnim);
            const start = performance.now();
            const tick = () => {
                const lvl = this.engine.audioSystem.updateStealthNoise(0.016, { x: 0, y: 0 }, false, false, 99);
                if (this.el.micTestFill) this.el.micTestFill.style.width = `${Math.min(100, lvl * 100)}%`;
                if (performance.now() - start < 5000 && !this.el.settingsModal?.classList.contains('hidden')) {
                    this._micTestAnim = requestAnimationFrame(tick);
                }
            };
            tick();
        });

        this.el.chkPs1?.addEventListener('change', (e) => {
            this.engine.renderer.setPS1Jitter(e.target.checked);
        });

        this.el.chkCameraTilt?.addEventListener('change', (e) => {
            this.applyCameraTilt(e.target.checked);
        });

        this.el.chkMotionBlur?.addEventListener('change', (e) => {
            this.applyMotionBlur(e.target.checked);
        });

        this.el.rngVhs?.addEventListener('input', (e) => {
            this.applyVHSIntensity(parseFloat(e.target.value));
        });

        this.el.rngVol?.addEventListener('input', (e) => {
            this.engine.audioSystem.initContext();
            this.engine.audioSystem.setMasterVolume(parseFloat(e.target.value));
            if (this.callbacks.onEnsureMenuMusic) this.callbacks.onEnsureMenuMusic();
        });

        this.el.rngSens?.addEventListener('input', (e) => {
            this.applySensitivity(parseFloat(e.target.value));
        });

        window.addEventListener('keydown', (e) => {
            if (this.isDialogueOpen()) {
                if (e.code === 'Escape' || e.code === 'KeyQ') {
                    e.preventDefault();
                    this.closeDialogue();
                    return;
                }
                const digitMatch = e.code.match(/^Digit([1-9])$/);
                if (digitMatch) {
                    const idx = parseInt(digitMatch[1], 10) - 1;
                    if (this._dialogueChoices && this._dialogueChoices[idx]) {
                        e.preventDefault();
                        const ch = this._dialogueChoices[idx];
                        if (this._onDialogueSelect) this._onDialogueSelect(ch, idx);
                    }
                }
                return;
            }
            if (this.el.ending1Screen && !this.el.ending1Screen.classList.contains('hidden')) {
                if (e.code === 'Space') {
                    e.preventDefault();
                    this.startRollingCredits();
                }
                return;
            }
            if (this.el.rollingCredits && !this.el.rollingCredits.classList.contains('hidden')) {
                if (e.code === 'Space' || e.code === 'Escape') {
                    e.preventDefault();
                    this.stopRollingCredits();
                    if (this.callbacks.onQuitToMenu) this.callbacks.onQuitToMenu();
                    this.showMainMenu();
                }
                return;
            }
            if (e.code === 'Escape') {
                if (this.el.settingsModal && !this.el.settingsModal.classList.contains('hidden')) {
                    e.preventDefault();
                    this.closeSettings();
                } else if (this.el.creditsModal && !this.el.creditsModal.classList.contains('hidden')) {
                    e.preventDefault();
                    this.el.creditsModal.classList.add('hidden');
                    this.el.mainMenu?.classList.remove('hidden');
                }
            }
        });
    }

    applyVHSIntensity(value) {
        const v = Number.isFinite(value) ? value : 0.5;
        this.engine.renderer.setPostProcessParams({
            grain: 0.025 * v,
            sharpen: 0.58 * v,
            aberration: 0.0008 * v,
            vsync: 0.0,
            scanlines: 0.0
        });
    }

    _loadSavedSensitivity() {
        if (typeof localStorage !== 'undefined') {
            try {
                const raw = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
                const parsed = raw !== null ? parseFloat(raw) : NaN;
                if (Number.isFinite(parsed)) {
                    return Math.max(0.05, Math.min(2.5, parsed));
                }
            } catch (e) {}
        }
        return this.el.rngSens ? parseFloat(this.el.rngSens.value) : 1.0;
    }

    getSensitivityMultiplier() {
        const raw = this.el.rngSens ? parseFloat(this.el.rngSens.value) : 1.0;
        return Number.isFinite(raw) ? Math.max(0.05, Math.min(2.5, raw)) : 1.0;
    }

    applySensitivity(value) {
        const mult = Number.isFinite(value) ? Math.max(0.05, Math.min(2.5, value)) : 1.0;
        if (this.el.rngSens) this.el.rngSens.value = String(mult);
        if (this.el.sensVal) this.el.sensVal.textContent = mult.toFixed(2);
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem(SENSITIVITY_STORAGE_KEY, String(mult));
            } catch (e) {}
        }
        if (this.callbacks.onSensitivityChange) {
            this.callbacks.onSensitivityChange(mult);
        }
    }

    openSettings(returnTo = 'main') {
        this._settingsReturnScreen = returnTo;
        if (returnTo === 'main') this.el.mainMenu?.classList.add('hidden');
        else if (returnTo === 'pause') this.el.pauseMenu?.classList.add('hidden');
        this.el.settingsModal?.classList.remove('hidden');
    }

    closeSettings() {
        this.el.settingsModal?.classList.add('hidden');
        if (this._settingsReturnScreen === 'pause') {
            this.el.pauseMenu?.classList.remove('hidden');
        } else {
            this.el.mainMenu?.classList.remove('hidden');
        }
    }

    startRollingCredits() {
        this.stopRollingCredits();
        this._hideAllScreens();
        if (this.callbacks.onQuitToMenu) this.callbacks.onQuitToMenu();
        this.el.rollingCredits?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();

        const audio = this.engine.audioSystem;
        if (audio) {
            audio.initContext();
            const camPos = this.engine.renderer?.camera?.position || null;
            audio.startSpatialLoop(this._creditsMusicId, 'ogonyok_waltz', camPos, {
                volume: 0.55,
                tvFilter: false,
                checkOcclusion: false,
                refDistance: 50,
                maxDistance: 200,
                rolloffFactor: 0
            });
        }

        const track = this.el.rollingCreditsTrack;
        if (!track) return;
        const viewH = window.innerHeight || 800;
        let offsetY = viewH * 0.92;
        track.style.transform = `translateX(-50%) translateY(${offsetY}px)`;

        const speedPxPerSec = 48;
        let lastTime = performance.now();
        const tick = (now) => {
            if (!this.el.rollingCredits || this.el.rollingCredits.classList.contains('hidden')) {
                this._creditsAnim = null;
                return;
            }
            const dt = Math.min(0.05, Math.max(0, (now - lastTime) * 0.001));
            lastTime = now;

            const finaleEl = track.querySelector('.rolling-credits-finale');
            const finaleCenter = finaleEl
                ? (finaleEl.offsetTop + finaleEl.offsetHeight * 0.5)
                : ((track.offsetHeight || 900) - 100);
            const targetStopY = (window.innerHeight || 800) * 0.5 - finaleCenter;

            if (offsetY > targetStopY) {
                offsetY = Math.max(targetStopY, offsetY - speedPxPerSec * dt);
                track.style.transform = `translateX(-50%) translateY(${offsetY}px)`;
                this._creditsAnim = requestAnimationFrame(tick);
            } else {
                this._creditsAnim = null;
            }
        };
        this._creditsAnim = requestAnimationFrame(tick);
    }

    stopRollingCredits() {
        if (this._creditsAnim) {
            cancelAnimationFrame(this._creditsAnim);
            this._creditsAnim = null;
        }
        this.engine.audioSystem?.stopLoop(this._creditsMusicId);
    }

    setCheckpointAvailable(available) {
        this.el.btnCheckpointMenu?.classList.toggle('hidden', !available);
        this.el.btnCheckpointPause?.classList.toggle('hidden', !available);
    }

    _getUnlockedEndings() {
        if (typeof localStorage === 'undefined') return [];
        try {
            const raw = localStorage.getItem(ENDINGS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    _saveUnlockedEndings(ids) {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(ENDINGS_STORAGE_KEY, JSON.stringify(ids));
        } catch (e) {}
    }

    unlockEnding(id) {
        const unlocked = this._getUnlockedEndings();
        if (!unlocked.includes(id)) {
            unlocked.push(id);
            this._saveUnlockedEndings(unlocked);
        }
        this._updateEndingsTabVisibility();
        this._renderEndings();
    }

    _updateEndingsTabVisibility() {
        const hasAny = this._getUnlockedEndings().length > 0;
        this.el.btnEndings?.classList.toggle('hidden', !hasAny);
    }

    _renderEndings() {
        if (!this.el.endingsList) return;
        const unlocked = new Set(this._getUnlockedEndings());
        let html = '';
        for (const item of ENDINGS_CATALOG) {
            const isUnlocked = unlocked.has(item.id);
            if (isUnlocked) {
                html += `<div class="ending-card unlocked">
                    <h3 class="ending-card-title">${t(item.titleKey)}</h3>
                    <p class="ending-card-desc">${t(item.descKey)}</p>
                </div>`;
            } else {
                html += `<div class="ending-card locked">
                    <h3 class="ending-card-title">${t('ui.endings.locked_title', { id: item.id })}</h3>
                    <p class="ending-card-desc">${t('ui.endings.locked_desc')}</p>
                </div>`;
            }
        }
        this.el.endingsList.innerHTML = html;
    }

    _hideAllScreens() {
        this.closeDialogue(true);
        this.stopRollingCredits();
        this.el.mainMenu?.classList.add('hidden');
        this.el.pauseMenu?.classList.add('hidden');
        this.el.settingsModal?.classList.add('hidden');
        this.el.deathScreen?.classList.add('hidden');
        this.el.ending1Screen?.classList.add('hidden');
        this.el.ending2Screen?.classList.add('hidden');
        this.el.ending3Screen?.classList.add('hidden');
        this.el.ending4Screen?.classList.add('hidden');
        this.el.rollingCredits?.classList.add('hidden');
        this.el.creditsModal?.classList.add('hidden');
        this.el.endingsModal?.classList.add('hidden');
    }

    async requestMicrophoneOnMenu() {
        const ok = await this.engine.audioSystem.enableMicrophone();
        if (this.el.chkMic) this.el.chkMic.checked = ok;
        if (!ok) {
            this.engine.audioSystem.setMicMode(false);
            this._setMicStatus('ui.settings.mic_menu_denied');
        } else {
            this._setMicStatus('ui.settings.mic_active');
        }
        return ok;
    }

    showMainMenu() {
        this._hideAllScreens();
        this._updateEndingsTabVisibility();
        this.el.mainMenu?.classList.remove('hidden');
        this.el.hud?.classList.add('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(false);
        this.engine.inputManager.unlock();
        if (this.callbacks.onEnterMainMenu) this.callbacks.onEnterMainMenu();
        if (!this._micRequestedOnce) {
            this._micRequestedOnce = true;
            this.requestMicrophoneOnMenu();
        }
    }

    showPauseMenu() {
        this._hideAllScreens();
        this.el.pauseMenu?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();
    }

    showGameplayHUD(cleanIntro = false) {
        this._hideAllScreens();
        this.el.hud?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = false;
        this.engine.setSimulationPaused(false);
        this.engine.inputManager.lock();
        this.setCleanIntroMode(cleanIntro);
        this.el.controlsHint?.classList.add('controls-hint-hidden');
    }

    setCleanIntroMode(clean) {
        this._cleanIntro = !!clean;
        if (this.el.crosshair) this.el.crosshair.classList.toggle('hidden', !!clean);
        if (clean) {
            this.el.objectives?.classList.add('hidden');
            this.el.subtitles?.classList.add('hidden');
            this.el.prompt?.classList.add('hidden');
            this.el.controlsHint?.classList.add('controls-hint-hidden');
        }
    }

    setWakePrompt(text = t('ui.hud.wake_prompt'), visible = false) {
        if (!this.el.wakePrompt) return;
        this.el.wakePrompt.textContent = text;
        this.el.wakePrompt.classList.toggle('hidden', !visible);
    }

    setHoldProgress(ratio = 0) {
        if (!this.el.crosshairRing || !this.el.crosshairRingFill) return;
        const r = Math.max(0, Math.min(1, ratio));
        if (r > 0.01 && !this._cleanIntro) {
            this.el.crosshairRing.classList.remove('hidden');
            const circumference = 88;
            this.el.crosshairRingFill.style.strokeDashoffset = String(circumference * (1 - r));
        } else {
            this.el.crosshairRing.classList.add('hidden');
        }
    }

    showControlsHint(text, durationMs = 5000) {
        if (!this.el.controlsHint) return;
        if (this._controlsHintTimer) clearTimeout(this._controlsHintTimer);
        this.el.controlsHint.textContent = text;
        this.el.controlsHint.classList.remove('controls-hint-hidden');
        this._controlsHintTimer = setTimeout(() => {
            this.el.controlsHint?.classList.add('controls-hint-hidden');
        }, durationMs);
    }

    showDeathScreen(reasonText) {
        this._hideAllScreens();
        this.el.hud?.classList.add('hidden');
        if (this.el.deathReason) this.el.deathReason.textContent = reasonText;
        this.el.deathScreen?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();
    }

    showEnding2() {
        this.unlockEnding(2);
        this._hideAllScreens();
        this.el.hud?.classList.add('hidden');
        this.el.ending2Screen?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();
    }

    showEnding3() {
        this.unlockEnding(3);
        this._hideAllScreens();
        this.el.hud?.classList.add('hidden');
        this.el.ending3Screen?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();
    }

    showEnding4() {
        this.unlockEnding(4);
        this._hideAllScreens();
        this.el.hud?.classList.add('hidden');
        this.el.ending4Screen?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();
    }

    showEnding1() {
        this.unlockEnding(1);
        this._hideAllScreens();
        this.el.hud?.classList.add('hidden');
        this.el.ending1Screen?.classList.remove('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.setSimulationPaused(true);
        this.engine.inputManager.unlock();
    }

    setClockText(str) {
        if (this.el.clock) this.el.clock.textContent = str;
    }

    setObjectives(title, items) {
        if (!this.el.objectives) return;
        const current = Array.isArray(items) ? items.find(it => !it.done) : null;
        if (!current) {
            this.el.objectives.classList.add('hidden');
            return;
        }
        this.el.objectives.classList.remove('hidden');
        this.el.objectives.innerHTML = `<div class="obj-item">${current.text}</div>`;
    }

    setPrompt(text, holdRatio = 0) {
        if (this._cleanIntro) {
            this.setHoldProgress(0);
            this.el.prompt?.classList.add('hidden');
            return;
        }
        const clean = text ? String(text).replace(/^\[[^\]]+\]\s*/g, '') : '';
        if (this.el.crosshair) {
            this.el.crosshair.classList.toggle('interactable', !!clean);
        }
        this.setHoldProgress(holdRatio);
        if (!this.el.prompt) return;
        if (clean) {
            this.el.prompt.textContent = clean;
            this.el.prompt.classList.remove('hidden');
        } else {
            this.el.prompt.classList.add('hidden');
        }
    }

    showSubtitle(text, durationMs = 4500, speaker = 'hero') {
        if (!this.el.subtitles) return;
        if (this._subtitleTimer) clearTimeout(this._subtitleTimer);
        this.el.subtitles.textContent = text;
        this.el.subtitles.className = `subtitles ${speaker === 'tv' ? 'tv-speaker' : ''}`;
        this.el.subtitles.classList.remove('hidden');
        if (speaker === 'hero') {
            this.engine.audioSystem.playSpatialOneShot('whisper_cue', null, { volume: 0.4 });
        }
        this._subtitleTimer = setTimeout(() => {
            this.el.subtitles.classList.add('hidden');
        }, durationMs);
    }

    isDialogueOpen() {
        return !!(this.el.dialogueOverlay && !this.el.dialogueOverlay.classList.contains('hidden'));
    }

    isDialogueSpeaking() {
        return this.isDialogueOpen() && performance.now() < (this._dialogueSpeakEndTime || 0);
    }

    openDialogue(speakerName, speakerRole, text, choices, onSelect, onClose = null) {
        if (!this.el.dialogueOverlay) return;
        this._onDialogueSelect = onSelect;
        this._onDialogueClose = onClose;
        if (this.el.dialogueSpeakerName) this.el.dialogueSpeakerName.textContent = speakerName || '';
        if (this.el.dialogueSpeakerRole) this.el.dialogueSpeakerRole.textContent = speakerRole || '';
        this.updateDialogue(text, choices);
        this.el.dialogueOverlay.classList.remove('hidden');
        this.el.hud?.classList.add('dialogue-open');
        this.el.subtitles?.classList.add('hidden');
        this.el.wakePrompt?.classList.add('hidden');
        this.el.prompt?.classList.add('hidden');
        this.el.crosshair?.classList.add('hidden');
        this.engine.inputManager.isUIOpen = true;
        this.engine.inputManager.unlock();
    }

    updateDialogue(text, choices = []) {
        this._dialogueChoices = choices;
        const txt = text || '';
        // Speak duration proportional to phrase length (~52ms per character, clamped 0.9s..7.5s)
        this._dialogueSpeakEndTime = txt.trim().length > 0
            ? performance.now() + Math.max(900, Math.min(7500, txt.length * 52))
            : 0;
        if (this.el.dialogueText) this.el.dialogueText.textContent = txt;
        if (!this.el.dialogueChoices) return;
        this.el.dialogueChoices.innerHTML = '';
        choices.forEach((ch, idx) => {
            const btn = document.createElement('button');
            btn.className = `dialogue-choice-btn${ch.primary ? ' primary' : ''}`;
            btn.textContent = `${idx + 1}. ${ch.label}`;
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (this._onDialogueSelect) this._onDialogueSelect(ch, idx);
            });
            this.el.dialogueChoices.appendChild(btn);
        });
    }

    closeDialogue(silent = false) {
        if (!this.el.dialogueOverlay || this.el.dialogueOverlay.classList.contains('hidden')) return;
        this.el.dialogueOverlay.classList.add('hidden');
        this.el.hud?.classList.remove('dialogue-open');
        this._dialogueSpeakEndTime = 0;
        this._dialogueChoices = [];
        const cb = this._onDialogueClose;
        this._onDialogueSelect = null;
        this._onDialogueClose = null;
        if (!silent) {
            this.el.crosshair?.classList.remove('hidden');
            this.engine.inputManager.isUIOpen = false;
            this.engine.inputManager.lock();
            if (cb) cb();
        }
    }

    updateStealthHUD(visible, noise, oxygen, micEnabled, isHidden) {
        if (!this.el.stealthPanel) return;
        this.el.stealthPanel.classList.toggle('hidden', !visible);
        if (!visible) return;

        if (this.el.noiseFill) {
            this.el.noiseFill.style.height = `${Math.min(100, noise * 100)}%`;
            this.el.noiseFill.style.backgroundColor = noise > 0.48 ? '#ff2e2e' : (noise > 0.25 ? '#f59e0b' : '#4ade80');
        }
        if (this.el.oxygenRow) {
            this.el.oxygenRow.classList.toggle('hidden', micEnabled || !isHidden);
        }
        if (this.el.oxygenFill) {
            this.el.oxygenFill.style.width = `${Math.max(0, Math.min(100, oxygen * 100))}%`;
        }
        if (this.el.stealthHint) {
            if (!isHidden) {
                this.el.stealthHint.textContent = t('ui.hud.stealth_find_hide');
            } else if (micEnabled) {
                this.el.stealthHint.textContent = t('ui.hud.stealth_mic_active');
            } else {
                this.el.stealthHint.textContent = t('ui.hud.stealth_no_mic');
            }
        }
    }
}

export default UIManager;
