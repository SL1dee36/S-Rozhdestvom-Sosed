import * as THREE from 'three';
import { Component } from './Component.js';

export class Interactable extends Component {
    constructor(gameObject, options = {}) {
        super(gameObject);
        this.promptText = options.promptText || '[E]';
        this.maxDistance = options.maxDistance !== undefined ? Math.min(options.maxDistance, 2.85) : 1.95;
        this.enabled = options.enabled !== undefined ? options.enabled : true;
        this.canInteract = options.canInteract || (() => true);
        this.onInteract = options.onInteract || (() => {});
        this.holdDuration = options.holdDuration ?? 0;
        this.targetMeshes = options.targetMeshes || null;
    }

    getPrompt() {
        return typeof this.promptText === 'function' ? this.promptText() : this.promptText;
    }

    getHoldDuration() {
        return typeof this.holdDuration === 'function' ? this.holdDuration() : (this.holdDuration || 0);
    }

    start() {
        if (this.engine?.interactionSystem) {
            this.engine.interactionSystem.registerInteractable(this);
        }
    }
}

export class GazeTrigger extends Component {
    constructor(gameObject, options = {}) {
        super(gameObject);
        this.maxDistance = options.maxDistance ?? 55.0;
        this.dwellTime = options.dwellTime ?? 0.6;
        this.once = options.once !== undefined ? options.once : true;
        this.enabled = options.enabled !== undefined ? options.enabled : true;
        this.onGazeEnter = options.onGazeEnter || null;
        this.onGazeDwell = options.onGazeDwell || null;
        this.onGazeComplete = options.onGazeComplete || (() => {});
        this.targetMeshes = options.targetMeshes || null;

        this._accumulated = 0;
        this._isLooking = false;
        this._triggered = false;
    }

    reset() {
        this._accumulated = 0;
        this._isLooking = false;
        this._triggered = false;
    }

    start() {
        if (this.engine?.interactionSystem) {
            this.engine.interactionSystem.registerGazeTrigger(this);
        }
    }
}

export class InteractionSystem {
    constructor(engine) {
        this.engine = engine;
        this.raycaster = new THREE.Raycaster();
        this.interactables = [];
        this.gazeTriggers = [];
        this.blockerMeshes = [];
        this.currentTarget = null;
        this.currentPrompt = '';
        this.currentHitPoint = null;
        this._holdTarget = null;
        this._holdProgress = 0;
        this._center = new THREE.Vector2(0, 0);
    }

    registerInteractable(comp) {
        if (!this.interactables.includes(comp)) {
            this.interactables.push(comp);
        }
    }

    registerGazeTrigger(comp) {
        if (!this.gazeTriggers.includes(comp)) {
            this.gazeTriggers.push(comp);
        }
    }

    setBlockerMeshes(meshes) {
        this.blockerMeshes = meshes || [];
    }

    _isVisibleInHierarchy(obj) {
        let cur = obj;
        while (cur) {
            if (cur.visible === false) return false;
            cur = cur.parent;
        }
        return true;
    }

    _collectMeshes(comp) {
        if (comp.targetMeshes && comp.targetMeshes.length > 0) return comp.targetMeshes;
        const list = [];
        comp.gameObject.transform.traverse(child => {
            if (child.isMesh) list.push(child);
        });
        comp.targetMeshes = list;
        return list;
    }

    _findOwner(mesh, list) {
        for (const comp of list) {
            const meshes = this._collectMeshes(comp);
            if (meshes.includes(mesh)) return comp;
        }
        return null;
    }

    update(deltaTime) {
        const camera = this.engine.renderer?.camera;
        if (!camera) return;

        this.raycaster.setFromCamera(this._center, camera);

        const activeGazeMeshes = [];
        const activeGazes = [];
        for (const gz of this.gazeTriggers) {
            if (!gz.enabled || (gz.once && gz._triggered)) continue;
            activeGazes.push(gz);
            for (const m of this._collectMeshes(gz)) {
                if (this._isVisibleInHierarchy(m)) activeGazeMeshes.push(m);
            }
        }

        let hitGaze = null;
        if (activeGazeMeshes.length > 0) {
            this.raycaster.far = 65;
            const hits = this.raycaster.intersectObjects(activeGazeMeshes, false);
            if (hits.length > 0) {
                const candidate = this._findOwner(hits[0].object, activeGazes);
                if (candidate && hits[0].distance <= candidate.maxDistance) {
                    let blocked = false;
                    if (this.blockerMeshes.length > 0) {
                        const wallHits = this.raycaster.intersectObjects(this.blockerMeshes, false);
                        if (wallHits.length > 0 && wallHits[0].distance < hits[0].distance - 0.1) {
                            blocked = true;
                        }
                    }
                    if (!blocked) hitGaze = candidate;
                }
            }
        }

        for (const gz of activeGazes) {
            if (gz === hitGaze) {
                if (!gz._isLooking) {
                    gz._isLooking = true;
                    if (gz.onGazeEnter) gz.onGazeEnter();
                }
                gz._accumulated += deltaTime;
                if (gz.onGazeDwell) {
                    gz.onGazeDwell(Math.min(1, gz._accumulated / Math.max(0.01, gz.dwellTime)));
                }
                if (gz._accumulated >= gz.dwellTime && !gz._triggered) {
                    gz._triggered = true;
                    gz.onGazeComplete();
                }
            } else {
                gz._isLooking = false;
                gz._accumulated = Math.max(0, gz._accumulated - deltaTime * 2);
            }
        }

        const activeInterMeshes = [];
        const activeInter = [];
        for (const it of this.interactables) {
            if (!it.enabled || !it.canInteract()) continue;
            activeInter.push(it);
            for (const m of this._collectMeshes(it)) {
                if (this._isVisibleInHierarchy(m)) activeInterMeshes.push(m);
            }
        }

        this.currentTarget = null;
        this.currentPrompt = '';
        this.currentHitPoint = null;

        if (activeInterMeshes.length > 0) {
            this.raycaster.far = 2.95;
            const visibleBlockers = this.blockerMeshes.filter(m => this._isVisibleInHierarchy(m));
            const testPool = [...activeInterMeshes, ...visibleBlockers];
            const hits = this.raycaster.intersectObjects(testPool, false);
            if (hits.length > 0) {
                const firstHit = hits[0];
                const owner = this._findOwner(firstHit.object, activeInter);
                if (owner && firstHit.distance <= owner.maxDistance) {
                    this.currentTarget = owner;
                    this.currentPrompt = owner.getPrompt();
                    this.currentHitPoint = firstHit.point.clone();
                }
            }
        }
    }

    getHoldRatio() {
        if (!this._holdTarget || this._holdTarget !== this.currentTarget) return 0;
        const dur = this._holdTarget.getHoldDuration();
        return dur > 0 ? Math.min(1, this._holdProgress / dur) : 0;
    }

    updateHold(deltaTime, isKeyHeld) {
        const target = this.currentTarget;
        if (!target || !target.enabled || !target.canInteract()) {
            this._holdTarget = null;
            this._holdProgress = 0;
            return false;
        }
        const dur = target.getHoldDuration();
        if (dur <= 0) {
            this._holdTarget = null;
            this._holdProgress = 0;
            return false;
        }
        if (isKeyHeld) {
            if (this._holdTarget !== target) {
                this._holdTarget = target;
                this._holdProgress = 0;
            }
            this._holdProgress += deltaTime;
            if (this._holdProgress >= dur) {
                this._holdTarget = null;
                this._holdProgress = 0;
                target.onInteract(this.engine.player);
                return true;
            }
        } else if (this._holdTarget === target) {
            this._holdProgress = Math.max(0, this._holdProgress - deltaTime * 2.5);
            if (this._holdProgress <= 0) this._holdTarget = null;
        } else {
            this._holdTarget = null;
            this._holdProgress = 0;
        }
        return false;
    }

    tryInteract(player) {
        if (this.currentTarget && this.currentTarget.enabled && this.currentTarget.canInteract()) {
            if (this.currentTarget.getHoldDuration() > 0) return false;
            this.currentTarget.onInteract(player);
            return true;
        }
        return false;
    }
}

export default InteractionSystem;

