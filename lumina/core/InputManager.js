import * as THREE from 'three';

export class InputManager {
    constructor(targetElement) {
        this.keys = {};
        this.lastKeys = {};
        this.mouseButtons = {};
        this.lastMouseButtons = {};
        this.mouseDelta = { x: 0, y: 0 };
        this.scrollDelta = 0;
        this.lockElement = targetElement;
        this.mousePos = new THREE.Vector2(0, 0);
        
        this.joystickInput = { x: 0, y: 0 };
        this.touchDelta = { x: 0, y: 0 };
        this.isSprintingMobile = false; 

        this.isPaused = false; 
        this.isUIOpen = false;
        this._ignoreMouseMoveCount = 0;
        this._ignoreMouseUntil = 0;
        this._boundOnMouseMove = this.onMouseMove.bind(this);

        document.addEventListener('contextmenu', (e) => e.preventDefault(), false);

        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', (e) => this.keys[e.code] = false);

        document.addEventListener('mousedown', (e) => this.mouseButtons[e.button] = true);
        document.addEventListener('mouseup', (e) => this.mouseButtons[e.button] = false);
        document.addEventListener('wheel', (e) => this.scrollDelta += Math.sign(e.deltaY));

        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('.menu-screen') || e.target.closest('#mobile-controls') || e.target.closest('.slot')) return;
            
            if (!this.isPaused && !this.isUIOpen && document.pointerLockElement !== this.lockElement) {
                this.lock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
             this.resetDeltas();
             if (document.pointerLockElement === this.lockElement || document.pointerLockElement === document.body) {
                this._ignoreMouseMoveCount = 1;
                this._ignoreMouseUntil = performance.now() + 50;
                this.isPaused = false;
                if (this.onPauseToggle) this.onPauseToggle(false);
                document.removeEventListener('mousemove', this._boundOnMouseMove, false);
                document.addEventListener('mousemove', this._boundOnMouseMove, false);
            } else {
                this._ignoreMouseMoveCount = 0;
                this._ignoreMouseUntil = 0;
                document.removeEventListener('mousemove', this._boundOnMouseMove, false);
                if (!this.isUIOpen && !this.isMobile()) {
                    if (!this.isPaused) this.setPaused(true);
                }
            }
        });

        window.addEventListener('blur', () => {
            this.resetDeltas();
            this.keys = {};
            this.mouseButtons = {};
        });

        document.addEventListener('mousemove', (e) => {
            this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });
    }

    setJoystickInput(x, y) {
        this.joystickInput.x = x;
        this.joystickInput.y = y;
    }
    
    addTouchDelta(dx, dy) {
        this.touchDelta.x += dx;
        this.touchDelta.y += dy;
    }

    emulateKey(code, pressed) {
        this.keys[code] = pressed;
    }
    
    setMobileSprint(isActive) {
        this.isSprintingMobile = isActive;
    }

    emulateMouseClick(button) {
        this.mouseButtons[button] = true;
        this.lastMouseButtons[button] = false;
    }

    emulateMouseHold(button, isDown) {
        this.mouseButtons[button] = isDown;
        if (!isDown) {
             this.lastMouseButtons[button] = false;
        }
    }
    
    isMobile() {
         return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);
    }

    lock() {
        if (!this.isMobile()) {
            const el = this.lockElement;
            const requestFallback = () => {
                try {
                    const fallback = el.requestPointerLock();
                    if (fallback && typeof fallback.catch === 'function') {
                        fallback.catch(() => {});
                    }
                } catch (_) {}
            };
            try {
                const res = el.requestPointerLock({ unadjustedMovement: true });
                if (res && typeof res.catch === 'function') {
                    res.catch(() => requestFallback());
                }
            } catch (_) {
                requestFallback();
            }
        } else {
             this.isPaused = false;
             if (this.onPauseToggle) this.onPauseToggle(false);
        }
    }

    unlock() {
        if (!this.isMobile() && document.pointerLockElement) {
            document.exitPointerLock();
        }
    }
    
    onPauseToggle(isPaused) {}

    setPaused(paused) {
        if (this.isPaused === paused) return;
        this.isPaused = paused;
        if (this.onPauseToggle) this.onPauseToggle(paused);
        if (paused) this.unlock();
    }

    onKeyDown(event) { this.keys[event.code] = true; }

    onMouseMove(event) {
        if (this.isPaused || this.isUIOpen || !this.isPointerLocked()) return;
        if (this._ignoreMouseMoveCount > 0 || performance.now() < this._ignoreMouseUntil) {
            if (this._ignoreMouseMoveCount > 0) this._ignoreMouseMoveCount -= 1;
            return;
        }
        const dx = event.movementX;
        const dy = event.movementY;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        this.mouseDelta.x += dx;
        this.mouseDelta.y += dy;
    }

    isKeyDown(key) { 
        if (key === 'KeyW' && this.joystickInput.y < -0.3) return true;
        if (key === 'KeyS' && this.joystickInput.y > 0.3) return true;
        if (key === 'KeyA' && this.joystickInput.x < -0.3) return true;
        if (key === 'KeyD' && this.joystickInput.x > 0.3) return true;
        if (key === 'ShiftLeft' && this.isSprintingMobile) return true;
        return this.keys[key] || false; 
    }
    
    wasKeyJustPressed(key) { return this.isKeyDown(key) && !this.lastKeys[key]; }
    isMouseButtonDown(button) { return this.mouseButtons[button] || false; }
    wasMouseButtonJustPressed(button) { return this.isMouseButtonDown(button) && !this.lastMouseButtons[button]; }
    
    getMouseDelta() { 
        return { 
            x: this.mouseDelta.x + this.touchDelta.x, 
            y: this.mouseDelta.y + this.touchDelta.y 
        }; 
    }
    
    getScrollDelta() { return this.scrollDelta; }
    
    isPointerLocked() { 
        if (this.isMobile()) return !this.isPaused && !this.isUIOpen;
        return document.pointerLockElement === this.lockElement || document.pointerLockElement === document.body; 
    }

    resetDeltas() {
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        this.scrollDelta = 0;
        this.touchDelta.x = 0;
        this.touchDelta.y = 0;
    }

    lateUpdate() {
        this.lastKeys = { ...this.keys };
        this.lastMouseButtons = { ...this.mouseButtons };
        this.resetDeltas();
    }
}

export default InputManager;