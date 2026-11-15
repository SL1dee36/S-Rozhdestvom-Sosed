import * as THREE from 'three';
import { Component, RigidBody, BoxCollider } from '../../lumina/index.js';

export class PlayerController extends Component {
    constructor(gameObject, world) {
        super(gameObject);
        this.world = world;
        this.yaw = 0;
        this.pitch = 0;
        this.baseSensitivity = 0.0022;
        this.sensitivity = this.baseSensitivity;
        this.walkSpeed = 3.0;
        this.sprintSpeed = 4.5;
        this.crouchSpeed = 1.75;

        this.isCrouching = false;
        this.eyeHeight = 1.54;
        this.targetEyeHeight = 1.54;

        this.heldItem = null;
        this.isHidden = false;
        this.isPeeking = false;
        this.currentHidingSpot = null;
        this.isPeephole = false;
        this.controlsLocked = false;
        this.forcedLookTarget = null;
        this.forcedLookSpeed = 5.0;
        this.forcedFov = null;
        this.cigaretteActive = false;
        this.cigBurn = 0;
        this.cigPuffAnim = 0;
        this.cinematicBobOffset = 0;

        this._bobTime = 0;
        this._stepTimer = 0;
        this._cameraRig = new THREE.Object3D();
        this._handAnchor = new THREE.Object3D();
        this._handMeshes = {};
        this._cigSmokePuffs = [];
        this._cigSmokeGroup = null;
        this._cigPaperMesh = null;
        this._cigAshMesh = null;
        this._cigEmberTip = null;
        this._cigEmberLight = null;
        this._cigWorldTip = new THREE.Vector3();
        this._exitSafePos = new THREE.Vector3();
        this._targetEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    }

    start() {
        this.rb = this.gameObject.getComponent(RigidBody);
        this.collider = this.gameObject.getComponent(BoxCollider);
        this.camera = this.engine.renderer.camera;

        this.gameObject.transform.add(this._cameraRig);
        this._cameraRig.position.set(0, this.eyeHeight, 0);
        this._cameraRig.add(this.camera);
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.order = 'YXZ';

        this._handAnchor.position.set(0.28, -0.26, -0.45);
        this.camera.add(this._handAnchor);
        this._buildHandProps();
    }

    _buildHandProps() {
        const make = (key, mesh) => {
            mesh.visible = false;
            this._handAnchor.add(mesh);
            this._handMeshes[key] = mesh;
        };
        const mats = this.world?.materials || {};

        const crystalGroup = new THREE.Group();
        const crystalBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.042, 0.03, 0.13, 8),
            mats.crystal || new THREE.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.78 })
        );
        const crystalBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.032, 0.035, 0.018, 8),
            mats.crystal || new THREE.MeshStandardMaterial({ color: 0xd8f0ff, transparent: true, opacity: 0.85 })
        );
        crystalBase.position.y = -0.065;
        crystalGroup.add(crystalBody, crystalBase);
        make('crystal', crystalGroup);

        const picklesGroup = new THREE.Group();
        const picklesJar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.075, 0.078, 0.18, 10),
            mats.pickles || new THREE.MeshStandardMaterial({ color: 0x5c8036 })
        );
        const picklesLid = new THREE.Mesh(
            new THREE.CylinderGeometry(0.068, 0.068, 0.022, 10),
            mats.metal || new THREE.MeshStandardMaterial({ color: 0x8f949a, metalness: 0.5, roughness: 0.4 })
        );
        picklesLid.position.y = 0.095;
        picklesGroup.add(picklesJar, picklesLid);
        make('pickles', picklesGroup);

        const olivierGroup = new THREE.Group();
        const olivierBowl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.095, 0.085, 10),
            mats.olivier || new THREE.MeshStandardMaterial({ color: 0xd8d29c })
        );
        const olivierTop = new THREE.Mesh(
            new THREE.CylinderGeometry(0.132, 0.132, 0.015, 10),
            mats.olivier || new THREE.MeshStandardMaterial({ color: 0xd8d29c })
        );
        olivierTop.position.y = 0.045;
        olivierGroup.add(olivierBowl, olivierTop);
        make('olivier', olivierGroup);

        const meatGroup = new THREE.Group();
        const meatPlate = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.13, 0.02, 10),
            new THREE.MeshStandardMaterial({ color: 0xe6e1d3, roughness: 0.5 })
        );
        const meatSlices = new THREE.Mesh(
            new THREE.CylinderGeometry(0.135, 0.135, 0.024, 10),
            mats.meat || new THREE.MeshStandardMaterial({ color: 0xb8554a })
        );
        meatSlices.position.y = 0.014;
        meatGroup.add(meatPlate, meatSlices);
        make('meat', meatGroup);

        const chickenGroup = new THREE.Group();
        const chickenTray = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.022, 0.19),
            mats.metal || new THREE.MeshStandardMaterial({ color: 0x70757c, metalness: 0.4, roughness: 0.45 })
        );
        chickenTray.position.y = -0.04;
        const chickenRoast = new THREE.Mesh(
            new THREE.BoxGeometry(0.21, 0.095, 0.15),
            mats.chicken || new THREE.MeshStandardMaterial({ color: 0xb56b2a })
        );
        chickenRoast.position.y = 0.01;
        chickenGroup.add(chickenTray, chickenRoast);
        make('chicken', chickenGroup);

        const champGroup = new THREE.Group();
        const champBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.044, 0.048, 0.19, 10),
            mats.champagne || new THREE.MeshStandardMaterial({ color: 0x1d4d27 })
        );
        champBody.position.y = -0.03;
        const champNeck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.017, 0.042, 0.10, 10),
            mats.champagne || new THREE.MeshStandardMaterial({ color: 0x1d4d27 })
        );
        champNeck.position.y = 0.11;
        const champFoil = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.021, 0.055, 10),
            new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.55 })
        );
        champFoil.position.y = 0.155;
        champGroup.add(champBody, champNeck, champFoil);
        make('champagne', champGroup);

        const cigGroup = new THREE.Group();
        const filterMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0085, 0.0085, 0.028, 10),
            new THREE.MeshStandardMaterial({ color: 0xd49b54, roughness: 0.85 })
        );
        filterMesh.position.y = -0.014;

        const paperMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008, 0.008, 0.062, 10),
            new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.9 })
        );
        paperMesh.position.y = 0.031;
        this._cigPaperMesh = paperMesh;

        const ashMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0076, 0.0081, 0.009, 10),
            new THREE.MeshStandardMaterial({ color: 0x5c5c63, roughness: 0.98 })
        );
        ashMesh.position.y = 0.0665;
        this._cigAshMesh = ashMesh;

        const emberMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.0074, 8, 8),
            new THREE.MeshStandardMaterial({
                color: 0xff3b00,
                emissive: 0xff3300,
                emissiveIntensity: 1.5,
                roughness: 0.4
            })
        );
        emberMesh.position.y = 0.072;
        this._cigEmberTip = emberMesh;

        const emberLight = new THREE.PointLight(0xff4411, 0.22, 0.6);
        emberLight.position.y = 0.074;
        this._cigEmberLight = emberLight;

        cigGroup.add(filterMesh, paperMesh, ashMesh, emberMesh, emberLight);
        cigGroup.rotation.set(-1.18, 0.14, 0.22);
        cigGroup.position.set(-0.11, 0.09, 0.04);
        make('cigarette', cigGroup);

        cigGroup.updateMatrix();
        const tipAnchor = new THREE.Vector3(0, 0.074, 0).applyMatrix4(cigGroup.matrix);
        const smokeGroup = new THREE.Group();
        smokeGroup.position.copy(tipAnchor);
        smokeGroup.visible = false;
        this._handAnchor.add(smokeGroup);
        this._cigSmokeGroup = smokeGroup;

        const puffGeo = new THREE.SphereGeometry(0.0085, 6, 6);
        for (let i = 0; i < 10; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0xd6dce4,
                transparent: true,
                opacity: 0.34,
                depthWrite: false
            });
            const puff = new THREE.Mesh(puffGeo, mat);
            const phase = i / 10;
            puff.userData = {
                phase,
                driftX: (Math.random() - 0.5) * 0.035,
                driftZ: (Math.random() - 0.5) * 0.03,
                wobble: Math.random() * Math.PI * 2
            };
            smokeGroup.add(puff);
            this._cigSmokePuffs.push(puff);
        }
    }

    setHeldItem(itemKey) {
        this.heldItem = itemKey;
        for (const [k, m] of Object.entries(this._handMeshes)) {
            m.visible = (k === itemKey) || (k === 'cigarette' && this.cigaretteActive);
        }
    }

    setCigarette(active) {
        this.cigaretteActive = active;
        this.cigBurn = 0;
        this.cigPuffAnim = 0;
        if (this._cigPaperMesh) {
            this._cigPaperMesh.scale.y = 1.0;
            this._cigPaperMesh.position.y = 0.031;
        }
        if (this._cigAshMesh) this._cigAshMesh.position.y = 0.0665;
        if (this._cigEmberTip) this._cigEmberTip.position.y = 0.072;
        if (this._cigEmberLight) this._cigEmberLight.position.y = 0.074;
        if (!active) {
            this._handAnchor.position.set(0.28, -0.26, -0.45);
        }
        if (this._handMeshes.cigarette) {
            this._handMeshes.cigarette.visible = active;
        }
        if (this._cigSmokeGroup) {
            this._cigSmokeGroup.visible = active;
        }
    }

    takeCigarettePuff() {
        if (!this.cigaretteActive || this.cigPuffAnim > 0.05 || this.cigBurn >= 0.95) return false;
        this.cigPuffAnim = 1.65;
        this.cigBurn = Math.min(0.95, this.cigBurn + 0.18);
        this.engine.audioSystem.playSpatialOneShot('whisper_cue', null, { volume: 0.22 });
        return true;
    }

    setPose(pos, yaw, pitch = 0) {
        this.transform.position.copy(pos);
        if (this.rb) this.rb.velocity.set(0, 0, 0);
        this.yaw = yaw;
        this.pitch = pitch;
    }

    setSensitivityMultiplier(multiplier) {
        const mult = Number.isFinite(multiplier) ? Math.max(0.05, Math.min(2.5, multiplier)) : 1.0;
        this.sensitivity = this.baseSensitivity * mult;
    }

    enterPeephole() {
        if (this.isHidden) return;
        this.isPeephole = true;
        this._exitSafePos.copy(this.transform.position);
        this.peepholePos = new THREE.Vector3(3.075, 0.0, 4.45);
        this.yaw = Math.PI;
        this.pitch = -0.08;
        if (this.rb) {
            this.rb.useGravity = false;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = false;
        this.transform.position.copy(this.peepholePos);
        this._cameraRig.position.set(0, 1.50, 0);
        this.engine.renderer.setPostProcessParams({ peephole: 1.0 });
        this.engine.renderer.setFOV(95);
    }

    exitPeephole() {
        if (!this.isPeephole) return;
        this.isPeephole = false;
        this.transform.position.copy(this._exitSafePos);
        this.yaw = 0;
        this.pitch = 0;
        if (this.rb) {
            this.rb.useGravity = true;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = true;
        this._cameraRig.position.set(0, this.eyeHeight, 0);
        this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
        this.engine.renderer.setFOV(75);
    }

    enterHidingSpot(spot) {
        if (this.isHidden || this.isPeephole) return;
        this.isHidden = true;
        this.currentHidingSpot = spot;
        this._exitSafePos.copy(this.transform.position);
        this.yaw = spot.lookYaw;
        this.pitch = 0;

        if (this.rb) {
            this.rb.useGravity = false;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = false;
        this.transform.position.set(spot.hidePos.x, 0, spot.hidePos.z);
        this._cameraRig.position.set(0, spot.hidePos.y, 0);
        this.engine.audioSystem.playSpatialOneShot('pickup', spot.hidePos, { volume: 0.35 });
    }

    exitHidingSpot() {
        if (!this.isHidden) return;
        const spot = this.currentHidingSpot;
        if (spot) {
            spot.setPeeking?.(false);
            if (spot.isDoorClosed()) spot.setDoorClosed(false);
        }
        this.isHidden = false;
        this.isPeeking = false;
        this.currentHidingSpot = null;
        this.engine.renderer.setPostProcessParams({ peephole: 0.0 });
        this.transform.position.copy(this._exitSafePos);
        if (this.rb) {
            this.rb.useGravity = true;
            this.rb.velocity.set(0, 0, 0);
        }
        if (this.collider) this.collider.enabled = true;
        this._cameraRig.position.set(0, this.eyeHeight, 0);
    }

    _getSurfaceFootstep() {
        const p = this.transform.position;
        if (p.z < -3.5) return 'footstep_snow';
        if (p.x < 2.0 && p.z <= 1.5) return 'footstep_parquet';
        return 'footstep_linoleum';
    }

    update(deltaTime) {
        const input = this.engine.inputManager;
        const delta = input.getMouseDelta();

        if (this.forcedLookTarget) {
            const camWorld = new THREE.Vector3();
            this.camera.getWorldPosition(camWorld);
            const lookMat = new THREE.Matrix4().lookAt(camWorld, this.forcedLookTarget, new THREE.Vector3(0, 1, 0));
            const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMat);
            this._targetEuler.setFromQuaternion(targetQuat, 'YXZ');

            let dy = this._targetEuler.y - this.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            const kLook = Math.min(1, deltaTime * (this.forcedLookSpeed || 5.0));
            this.yaw += dy * kLook;
            this.pitch = THREE.MathUtils.lerp(this.pitch, this._targetEuler.x, kLook);
        } else if (!this.controlsLocked && !this.isPeephole) {
            this.yaw -= delta.x * this.sensitivity;
            this.pitch -= delta.y * this.sensitivity;
            if (this.isHidden && this.currentHidingSpot) {
                const center = this.currentHidingSpot.lookYaw;
                const yawRange = this.isPeeking ? 0.68 : 0.42;
                let diff = this.yaw - center;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                diff = Math.max(-yawRange, Math.min(yawRange, diff));
                this.yaw = center + diff;
                this.pitch = Math.max(-0.35, Math.min(0.35, this.pitch));
            } else {
                this.pitch = Math.max(-1.42, Math.min(1.42, this.pitch));
            }
        }

        const swayRoll = this.cigaretteActive ? Math.sin(performance.now() * 0.0022) * 0.028 : 0;
        const swayPitch = this.cigaretteActive ? Math.cos(performance.now() * 0.0017) * 0.015 : 0;
        this.camera.rotation.set(this.pitch + swayPitch, this.yaw, swayRoll, 'YXZ');

        if (this.cigaretteActive && !this.controlsLocked && !this.isHidden && !this.isPeephole) {
            const puffPressed = input.wasKeyJustPressed('KeyF')
                || (input.isPointerLocked() && input.wasMouseButtonJustPressed(0));
            if (puffPressed) {
                this.takeCigarettePuff();
            }
        }

        if (this.cigaretteActive && this._cigSmokeGroup) {
            if (this.cigPuffAnim > 0) {
                this.cigPuffAnim = Math.max(0, this.cigPuffAnim - deltaTime);
            }
            const puffProgress = this.cigPuffAnim > 0 ? this.cigPuffAnim / 1.65 : 0;
            const raiseAmt = puffProgress > 0.55
                ? (1 - (puffProgress - 0.55) / 0.45)
                : (puffProgress / 0.55);
            const targetHandX = THREE.MathUtils.lerp(0.28, 0.12, raiseAmt);
            const targetHandY = THREE.MathUtils.lerp(-0.26, -0.14, raiseAmt);
            const targetHandZ = THREE.MathUtils.lerp(-0.45, -0.31, raiseAmt);
            this._handAnchor.position.x = THREE.MathUtils.lerp(this._handAnchor.position.x, targetHandX, Math.min(1, deltaTime * 8));
            this._handAnchor.position.y = THREE.MathUtils.lerp(this._handAnchor.position.y, targetHandY, Math.min(1, deltaTime * 8));
            this._handAnchor.position.z = THREE.MathUtils.lerp(this._handAnchor.position.z, targetHandZ, Math.min(1, deltaTime * 8));

            const paperRatio = Math.max(0.08, 1 - this.cigBurn);
            const paperLen = 0.062 * paperRatio;
            if (this._cigPaperMesh) {
                this._cigPaperMesh.scale.y = THREE.MathUtils.lerp(this._cigPaperMesh.scale.y, paperRatio, Math.min(1, deltaTime * 4));
                this._cigPaperMesh.position.y = (0.062 * this._cigPaperMesh.scale.y) * 0.5;
            }
            const curPaperTop = this._cigPaperMesh ? (0.062 * this._cigPaperMesh.scale.y) : paperLen;
            if (this._cigAshMesh) this._cigAshMesh.position.y = curPaperTop + 0.0045;
            if (this._cigEmberTip) this._cigEmberTip.position.y = curPaperTop + 0.009;
            if (this._cigEmberLight) this._cigEmberLight.position.y = curPaperTop + 0.011;

            if (this._handMeshes.cigarette && this._cigEmberTip) {
                this._handMeshes.cigarette.updateMatrix();
                this._cigSmokeGroup.position.copy(this._cigEmberTip.position).applyMatrix4(this._handMeshes.cigarette.matrix);
            }

            const nowSec = performance.now() * 0.001;
            const puffGlow = puffProgress > 0.45 ? 1.8 : 0;
            const pulse = 1.2 + Math.sin(nowSec * 3.1) * 0.45 + puffGlow;
            if (this._cigEmberTip && this._cigEmberTip.material) {
                this._cigEmberTip.material.emissiveIntensity = pulse;
            }
            if (this._cigEmberLight) {
                this._cigEmberLight.intensity = 0.16 + Math.sin(nowSec * 3.1) * 0.08 + puffGlow * 0.12;
            }
            const smokeSpeed = puffProgress > 0 && puffProgress < 0.65 ? 1.05 : 0.52;
            for (const puff of this._cigSmokePuffs) {
                const d = puff.userData;
                d.phase = (d.phase + deltaTime * smokeSpeed) % 1;
                const p = d.phase;
                puff.position.set(
                    d.driftX * p + Math.sin(nowSec * 2.6 + d.wobble + p * 5.0) * 0.014 * p,
                    p * 0.22,
                    d.driftZ * p + Math.cos(nowSec * 2.0 + d.wobble) * 0.01 * p
                );
                const s = 0.55 + p * 2.7;
                puff.scale.set(s, s * 0.9, s);
                puff.material.opacity = Math.sin(p * Math.PI) * 0.34;
            }
            const smokeTransform = this.world?.cigSmokeEmitter?.transform
                || this.world?.cigSmokeEmitter?.gameObject?.transform
                || this.world?.cigSmokeEmitter?.go?.transform;
            if (this._cigEmberTip && smokeTransform) {
                this._cigEmberTip.getWorldPosition(this._cigWorldTip);
                smokeTransform.position.copy(this._cigWorldTip);
            }
        }

        const goalFov = this.isPeephole ? 95 : (this.isPeeking ? 62 : (this.forcedFov ?? 75));
        const curFov = this.engine.renderer.camera.fov;
        this.engine.renderer.setFOV(THREE.MathUtils.lerp(curFov, goalFov, Math.min(1, deltaTime * 4.5)));

        const interactPressed = input.wasKeyJustPressed('KeyE') || (input.isPointerLocked() && input.wasMouseButtonJustPressed(0));
        const interactHeld = !this.cigaretteActive && (input.isKeyDown('KeyE') || (input.isPointerLocked() && input.isMouseButtonDown(0)));
        const exitPressed = input.wasKeyJustPressed('KeyQ');

        if (!this.controlsLocked) {
            if (this.isPeephole) {
                if (this.rb) this.rb.velocity.set(0, 0, 0);
                if (this.peepholePos) this.transform.position.copy(this.peepholePos);
                if (interactPressed || exitPressed) this.exitPeephole();
                return;
            }
            if (this.isHidden) {
                if (this.rb) this.rb.velocity.set(0, 0, 0);
                if (interactPressed && this.currentHidingSpot) {
                    this.currentHidingSpot.setDoorClosed(!this.currentHidingSpot.isDoorClosed());
                } else if (exitPressed) {
                    this.exitHidingSpot();
                    return;
                }
                const s = this.currentHidingSpot;
                if (!s) return;
                const peeking = input.isKeyDown('KeyW')
                    || input.isKeyDown('ShiftLeft')
                    || input.isKeyDown('ShiftRight')
                    || (input.isPointerLocked() && input.isMouseButtonDown(2));
                if (peeking !== this.isPeeking) {
                    this.isPeeking = peeking;
                    s.setPeeking?.(peeking);
                    this.engine.renderer.setPostProcessParams({ peephole: peeking ? 0.42 : 0.0 });
                }
                const goalPos = peeking ? s.peekPos : s.hidePos;
                this.transform.position.x = THREE.MathUtils.lerp(this.transform.position.x, goalPos.x, Math.min(1, deltaTime * 8));
                this.transform.position.z = THREE.MathUtils.lerp(this.transform.position.z, goalPos.z, Math.min(1, deltaTime * 8));
                return;
            }

            if (interactPressed) {
                this.engine.interactionSystem.tryInteract(this);
                if (this.isPeephole || this.isHidden || this.controlsLocked) {
                    if (this.rb) this.rb.velocity.set(0, 0, 0);
                    return;
                }
            }
            if (this.engine.interactionSystem.updateHold(deltaTime, interactHeld)) {
                if (this.isPeephole || this.isHidden || this.controlsLocked) {
                    if (this.rb) this.rb.velocity.set(0, 0, 0);
                    return;
                }
            }
        }

        if (this.controlsLocked || !this.rb) {
            if (this.rb) {
                this.rb.velocity.x = 0;
                this.rb.velocity.z = 0;
            }
            this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, this.targetEyeHeight, Math.min(1, deltaTime * 4.5));
            this._cameraRig.position.y = THREE.MathUtils.lerp(
                this._cameraRig.position.y,
                this.eyeHeight + (this.cinematicBobOffset || 0),
                Math.min(1, deltaTime * 8.0)
            );
            return;
        }

        const wantCrouch = input.isKeyDown('ControlLeft') || input.isKeyDown('KeyC');
        if (wantCrouch !== this.isCrouching) {
            this.isCrouching = wantCrouch;
            this.targetEyeHeight = this.isCrouching ? 0.96 : 1.54;
            if (this.collider) {
                const h = this.isCrouching ? 1.05 : 1.70;
                this.collider.setSize(new THREE.Vector3(0.46, h, 0.46));
                this.collider.offset.set(0, h * 0.5, 0);
            }
        }
        this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, this.targetEyeHeight, Math.min(1, deltaTime * 10));

        let moveForward = 0;
        let moveRight = 0;
        if (input.isKeyDown('KeyW')) moveForward += 1;
        if (input.isKeyDown('KeyS')) moveForward -= 1;
        if (input.isKeyDown('KeyD')) moveRight += 1;
        if (input.isKeyDown('KeyA')) moveRight -= 1;

        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const moveVec = new THREE.Vector3()
            .addScaledVector(forward, moveForward)
            .addScaledVector(right, moveRight);

        const isMoving = moveVec.lengthSq() > 0.001;
        const speed = this.isCrouching
            ? this.crouchSpeed
            : (input.isKeyDown('ShiftLeft') ? this.sprintSpeed : this.walkSpeed);

        if (isMoving) {
            moveVec.normalize().multiplyScalar(speed);
            this.rb.velocity.x = moveVec.x;
            this.rb.velocity.z = moveVec.z;

            const bobRate = speed * 3.1;
            this._bobTime += deltaTime * bobRate;
            this._cameraRig.position.y = this.eyeHeight + Math.sin(this._bobTime) * 0.038;
            this._handAnchor.position.y = -0.26 + Math.sin(this._bobTime * 2) * 0.012;

            this._stepTimer -= deltaTime * (speed / this.walkSpeed);
            if (this._stepTimer <= 0) {
                this._stepTimer = 0.46;
                this.engine.audioSystem.playSpatialOneShot(this._getSurfaceFootstep(), this.transform.position, {
                    volume: this.isCrouching ? 0.14 : 0.3
                });
            }
        } else {
            this.rb.velocity.x = 0;
            this.rb.velocity.z = 0;
            this._cameraRig.position.y = THREE.MathUtils.lerp(this._cameraRig.position.y, this.eyeHeight, deltaTime * 8);
        }
    }
}

export default PlayerController;

