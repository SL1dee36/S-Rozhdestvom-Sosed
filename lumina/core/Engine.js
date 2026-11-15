import * as THREE from 'three';
import Renderer from './Renderer.js';
import PhysicsEngine from '../physics/PhysicsEngine.js';
import { InputManager } from './InputManager.js';
import { AudioSystem } from './AudioSystem.js';
import { InteractionSystem } from './InteractionSystem.js';
import { RigidBody } from '../physics/RigidBody.js';

export class Engine {
    constructor(canvasId) {
        this.renderer = new Renderer(canvasId);
        this.physicsEngine = new PhysicsEngine();
        this.inputManager = new InputManager(this.renderer.renderer.domElement);
        this.audioSystem = new AudioSystem(this.renderer.camera);
        this.interactionSystem = new InteractionSystem(this);

        this.gameObjects = [];
        this.player = null;
        this.lastTime = performance.now();
        this.isRunning = false;
        this.isPaused = false;
        this.onUpdateCallbacks = [];
    }

    setPlayer(gameObject) {
        this.player = gameObject;
    }

    setSimulationPaused(paused) {
        this.isPaused = paused;
        this.inputManager.setPaused(paused);
    }

    addUpdateCallback(fn) {
        this.onUpdateCallbacks.push(fn);
    }

    addGameObject(gameObject) {
        gameObject.engine = this;
        this.gameObjects.push(gameObject);

        if (gameObject.transform) {
            this.renderer.scene.add(gameObject.transform);
        } else if (gameObject.mesh) {
            this.renderer.scene.add(gameObject.mesh);
        }

        if (gameObject.rigidBody) {
            this.physicsEngine.addRigidBody(gameObject.rigidBody);
        }
        gameObject.start();
        return gameObject;
    }

    removeGameObject(gameObject) {
        const index = this.gameObjects.indexOf(gameObject);
        if (index > -1) {
            this.gameObjects.splice(index, 1);

            if (gameObject.transform) {
                this.renderer.scene.remove(gameObject.transform);
            } else if (gameObject.mesh) {
                this.renderer.scene.remove(gameObject.mesh);
            }
            const rb = gameObject.rigidBody || gameObject.getComponent(RigidBody);
            if (rb) {
                this.physicsEngine.removeRigidBody(rb);
            }
        }
    }

    setRenderMode(wireframeEnabled) {
        this.renderer.scene.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.wireframe = wireframeEnabled;
            }
        });
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
    }

    stop() {
        this.isRunning = false;
    }

    gameLoop() {
        if (!this.isRunning) return;

        requestAnimationFrame(() => this.gameLoop());

        const currentTime = performance.now();
        let deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        if (deltaTime > 0.1) deltaTime = 0.1;

        this.renderer.update(deltaTime);

        if (!this.isPaused) {
            this.physicsEngine.update(deltaTime);
            this.gameObjects.forEach(obj => obj.update(deltaTime));
            this.interactionSystem.update(deltaTime);
            for (const cb of this.onUpdateCallbacks) cb(deltaTime);
        }

        this.audioSystem.update(deltaTime);
        this.renderer.render();
        this.inputManager.lateUpdate();
    }
}

export default Engine;
